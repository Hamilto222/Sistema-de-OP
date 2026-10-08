begin;
alter table public.production_orders add column data_hora_programada timestamptz;
alter table public.production_orders add column checklist_template_nome text;
alter table public.production_orders add column checklist_template_revisao text;
alter table public.production_orders add column checklist_template_descricao text;
create index orders_updated_idx on public.production_orders(updated_at desc,id);
create index orders_finalized_idx on public.production_orders(data_finalizacao) where status='FINALIZED';

create function private.sync_order_schedule() returns trigger language plpgsql set search_path='' as $$
begin
 if new.data_hora_programada is not null then new.data_programada=(new.data_hora_programada at time zone 'America/Sao_Paulo')::date; end if;
 return new;
end $$;
create trigger aa_schedule before insert or update on public.production_orders for each row execute function private.sync_order_schedule();
revoke all on function private.sync_order_schedule() from public,anon;
grant execute on function private.sync_order_schedule() to authenticated;
create or replace function private.guard_order() returns trigger language plpgsql set search_path='' as $$
declare r public.app_role:=private.current_role(); allowed text[]; begin
 if current_user in ('postgres','supabase_admin','service_role') then return new; end if;
 if r is null then raise exception 'Perfil inativo' using errcode='42501'; end if;
 if new.operador_responsavel_id is not null and not private.operator_is_active(new.operador_responsavel_id) then
  raise exception 'Operador responsável deve estar ativo';
 end if;
 if tg_op='INSERT' then
  if r not in ('ADMIN','PCP') or new.created_by is distinct from auth.uid() or new.status<>'DRAFT' or new.version<>1
   or new.inicio_producao is not null or new.fim_producao is not null or new.quantidade_produzida is not null
   or new.quantidade_perdida is not null or new.observacao_final is not null or new.assinatura_operador_path is not null
   or new.aprovacao_cq is not null or new.responsavel_cq_id is not null or new.data_aprovacao_cq is not null
   or new.aprovacao_pcp is not null or new.responsavel_pcp_id is not null or new.data_finalizacao is not null
   or new.relatorio_final_path is not null or new.motivo_reabertura is not null then
   raise exception 'OP deve ser criada como rascunho, sem dados de execução ou aprovação' using errcode='42501';
  end if;
  new.created_at=now(); new.updated_at=now(); return new;
 end if;
 if new.id<>old.id or new.created_by<>old.created_by or new.created_at<>old.created_at then
  raise exception 'Identidade e autoria são imutáveis' using errcode='42501';
 end if;
 if new.version<>old.version then raise exception 'A versão é controlada pelo banco; use filtro de versão na atualização' using errcode='42501'; end if;
 if r='PCP' then
  allowed=array['status','motivo_reabertura'];
  if old.status in ('DRAFT','PREPARING') then allowed=allowed||array['numero_op','produto_id','lote','linha_id','quantidade_planejada','unidade','prioridade','data_programada','data_hora_programada','operador_responsavel_id','pdf_original_path','checklist_template_nome','checklist_template_revisao','checklist_template_descricao']; end if;
  if old.status='AWAITING_PCP' then allowed=allowed||array['aprovacao_pcp']; end if;
  perform private.assert_columns(to_jsonb(old),to_jsonb(new),allowed);
 elsif r='QUALIDADE' then
  perform private.assert_columns(to_jsonb(old),to_jsonb(new),array['status','aprovacao_cq']);
  if old.status not in ('RELEASED','IN_PRODUCTION','AWAITING_QUALITY','BLOCKED_QUALITY') then raise exception 'OP não está disponível para alteração de qualidade' using errcode='42501'; end if;
 elsif r='OPERADOR' then
  perform private.assert_columns(to_jsonb(old),to_jsonb(new),array['status','quantidade_produzida','quantidade_perdida','observacao_final','assinatura_operador_path']);
  if old.status not in ('RELEASED','IN_PRODUCTION','REOPENED') then raise exception 'OP não está em execução' using errcode='42501'; end if;
  if old.status='RELEASED' and new.status<>'IN_PRODUCTION' then raise exception 'Inicie a produção antes de registrar resultados'; end if;
 end if;
 if r<>'ADMIN' and new.status<>old.status then
  if r='PCP' and not (
   (old.status='DRAFT' and new.status in ('PREPARING','CANCELLED')) or
   (old.status='PREPARING' and new.status in ('DRAFT','RELEASED','CANCELLED')) or
   (old.status='RELEASED' and new.status='CANCELLED') or
   (old.status='AWAITING_PCP' and new.status='FINALIZED') or
   (old.status='FINALIZED' and new.status='REOPENED' and exists(select 1 from public.profiles where id=auth.uid() and can_reopen_orders))
  ) then raise exception 'Transição de PCP não autorizada' using errcode='42501'; end if;
  if r='QUALIDADE' and not (
   (old.status in ('RELEASED','IN_PRODUCTION','AWAITING_QUALITY') and new.status='BLOCKED_QUALITY') or
   (old.status in ('AWAITING_QUALITY','BLOCKED_QUALITY') and new.status='AWAITING_PCP') or
   (old.status='BLOCKED_QUALITY' and new.status='IN_PRODUCTION')
  ) then raise exception 'Transição de CQ não autorizada' using errcode='42501'; end if;
  if r='OPERADOR' and not (
   (old.status in ('RELEASED','REOPENED') and new.status='IN_PRODUCTION') or
   (old.status='IN_PRODUCTION' and new.status='AWAITING_QUALITY')
  ) then raise exception 'Transição de operador não autorizada' using errcode='42501'; end if;
 end if;
 if new.status='RELEASED' and old.status<>new.status then
  if new.pdf_original_path is null or not exists(select 1 from public.production_order_checklist where production_order_id=new.id) then raise exception 'PDF e checklist são necessários para liberar'; end if;
 end if;
 if new.status='IN_PRODUCTION' and old.status in ('RELEASED','REOPENED') then new.inicio_producao=now(); end if;
 if new.status='AWAITING_QUALITY' and old.status<>new.status then
  if exists(select 1 from public.production_order_checklist where production_order_id=new.id and obrigatorio and (data_medicao is null or conforme is null)) then raise exception 'Checklist obrigatório incompleto'; end if;
  new.fim_producao=now();
 end if;
 if new.aprovacao_cq is distinct from old.aprovacao_cq then
  if r not in ('QUALIDADE','ADMIN') or (r='QUALIDADE' and old.status not in ('AWAITING_QUALITY','BLOCKED_QUALITY')) then raise exception 'Aprovação CQ não autorizada' using errcode='42501'; end if;
  new.responsavel_cq_id=auth.uid(); new.data_aprovacao_cq=now();
 end if;
 if new.status='AWAITING_PCP' and old.status<>new.status then
  if new.aprovacao_cq is distinct from true or new.fim_producao is null or exists(select 1 from public.non_conformities where production_order_id=new.id and status<>'FECHADA')
   or exists(select 1 from public.production_order_checklist where production_order_id=new.id and requer_revisao_cq and not revisado_cq)
   or exists(select 1 from public.production_order_checklist c where c.production_order_id=new.id and c.bloqueia_op_se_nao_conforme and c.conforme is false and not exists(select 1 from public.non_conformities n where n.checklist_item_id=c.id and n.status='FECHADA' and n.aprovado_cq is true)) then
   raise exception 'CQ precisa concluir revisões, produção e não conformidades';
  end if;
 end if;
 if new.aprovacao_pcp is distinct from old.aprovacao_pcp then
  if r not in ('PCP','ADMIN') or (r='PCP' and new.status<>'FINALIZED') then raise exception 'Aprovação PCP não autorizada' using errcode='42501'; end if;
  new.responsavel_pcp_id=auth.uid(); new.data_finalizacao=now();
 end if;
 if new.status='REOPENED' and old.status<>new.status then
  if nullif(trim(new.motivo_reabertura),'') is null then raise exception 'Informe motivo de reabertura'; end if;
  new.aprovacao_cq=null; new.responsavel_cq_id=null; new.data_aprovacao_cq=null;
  new.aprovacao_pcp=null; new.responsavel_pcp_id=null; new.data_finalizacao=null;
  new.fim_producao=null; new.relatorio_final_path=null;
  -- Reviews are reset by a separate definer trigger below, keeping measurements in history.
 end if;
 new.version=old.version+1;
 return new;
end $$;

create view public.pcp_order_list with (security_invoker=true) as
 select o.*,p.codigo as produto_codigo,p.descricao as produto_descricao,
 l.nome as linha_nome,op.nome as operador_nome
 from public.production_orders o join public.products p on p.id=o.produto_id
 join public.production_lines l on l.id=o.linha_id
 left join public.profiles op on op.id=o.operador_responsavel_id;
revoke all on public.pcp_order_list from public,anon;
grant select on public.pcp_order_list to authenticated;

create function public.pcp_create_order(payload jsonb) returns uuid language plpgsql security invoker set search_path='' as $$
declare target uuid; product public.products; line public.production_lines; scheduled timestamptz; begin
 if private.current_role() is null or private.current_role() not in ('ADMIN','PCP') then raise exception 'Acesso exclusivo de PCP ou ADMIN ativo' using errcode='42501'; end if;
 select * into product from public.products where id=(payload->>'produto_id')::uuid for share;
 select * into line from public.production_lines where id=(payload->>'linha_id')::uuid for share;
 if product.id is null or not product.ativo then raise exception 'Selecione um produto ativo'; end if;
 if line.id is null or not line.ativa then raise exception 'Selecione uma linha ativa'; end if;
 if length(trim(payload->>'numero_op')) not between 1 and 80 or length(trim(payload->>'lote')) not between 1 and 160 or length(trim(payload->>'unidade')) not between 1 and 20 then raise exception 'Número OP, lote e unidade são obrigatórios'; end if;
 if nullif(payload->>'data_hora_programada','') is null then raise exception 'Informe data e hora programadas'; end if;
 scheduled=(payload->>'data_hora_programada')::timestamp at time zone 'America/Sao_Paulo';
 insert into public.production_orders(numero_op,produto_id,lote,linha_id,quantidade_planejada,unidade,prioridade,data_hora_programada,operador_responsavel_id,created_by)
 values(trim(payload->>'numero_op'),product.id,trim(payload->>'lote'),line.id,(payload->>'quantidade_planejada')::numeric,trim(payload->>'unidade'),(payload->>'prioridade')::public.order_priority,scheduled,nullif(payload->>'operador_responsavel_id','')::uuid,auth.uid()) returning id into target;
 return target;
end $$;

-- Storage and PostgreSQL are separate services. Attach only an existing private PDF.
create function public.pcp_attach_original(order_id uuid,document_path text,expected_version integer) returns void language plpgsql security invoker set search_path='' as $$
declare o public.production_orders; begin
 if private.current_role() is null or private.current_role() not in ('ADMIN','PCP') then raise exception 'Acesso exclusivo de PCP ou ADMIN ativo' using errcode='42501'; end if;
 select * into o from public.production_orders where id=order_id for update;
 if o.id is null then raise exception 'OP não encontrada'; end if;
 if o.status<>'DRAFT' or o.version<>expected_version then raise exception 'A OP mudou. Recarregue antes de anexar o PDF.' using errcode='42501'; end if;
 if private.storage_order_id(document_path) is distinct from order_id or document_path !~ '\.pdf$' then raise exception 'Caminho do documento inválido'; end if;
 if not exists(select 1 from storage.objects where bucket_id='op-originals' and name=document_path and metadata->>'mimetype'='application/pdf' and (metadata->>'size')::bigint between 1 and 20971520) then raise exception 'PDF privado não encontrado ou inválido'; end if;
 update public.production_orders set pdf_original_path=document_path where id=order_id;
end $$;

create function public.pcp_prepare_order(order_id uuid,expected_version integer) returns void language plpgsql security invoker set search_path='' as $$
declare o public.production_orders; p public.products; l public.production_lines; t public.checklist_templates; copied integer; begin
 if private.current_role() is null or private.current_role() not in ('ADMIN','PCP') then raise exception 'Acesso exclusivo de PCP ou ADMIN ativo' using errcode='42501'; end if;
 select * into o from public.production_orders where id=order_id for update;
 if o.id is null then raise exception 'OP não encontrada'; end if;
 if o.status<>'DRAFT' then raise exception 'Preparação exige rascunho. Esta OP já foi preparada ou mudou de status.' using errcode='42501'; end if;
 if o.version<>expected_version then raise exception 'A OP mudou. Recarregue antes de preparar.' using errcode='42501'; end if;
 if nullif(trim(o.numero_op),'') is null or nullif(trim(o.lote),'') is null or nullif(trim(o.unidade),'') is null or o.quantidade_planejada<=0 or o.data_programada is null then raise exception 'Dados obrigatórios da OP incompletos'; end if;
 if o.operador_responsavel_id is not null and not private.operator_is_active(o.operador_responsavel_id) then raise exception 'Operador responsável deve estar ativo'; end if;
 if exists(select 1 from public.production_order_checklist where production_order_id=o.id) then raise exception 'A OP já possui checklist. Preparação não pode duplicar ou sobrescrever itens.'; end if;
 if o.pdf_original_path is null or private.storage_order_id(o.pdf_original_path) is distinct from o.id or not exists(select 1 from storage.objects where bucket_id='op-originals' and name=o.pdf_original_path and metadata->>'mimetype'='application/pdf' and (metadata->>'size')::bigint between 1 and 20971520) then raise exception 'Anexe um PDF válido no bucket privado antes de preparar'; end if;
 update public.production_orders set status='PREPARING' where id=o.id;
 select * into p from public.products where id=o.produto_id for share;
 select * into l from public.production_lines where id=o.linha_id for share;
 if p.id is null or not p.ativo or l.id is null or not l.ativa then raise exception 'Produto e linha devem estar ativos'; end if;
 if p.checklist_template_id is null then raise exception 'Produto sem modelo de checklist. Solicite o cadastro ao ADMIN'; end if;
 select * into t from public.checklist_templates where id=p.checklist_template_id for share;
 if t.id is null or not t.ativo then raise exception 'Modelo de checklist inativo ou indisponível'; end if;
 insert into public.production_order_checklist(production_order_id,template_item_id,ordem,grupo,item,descricao,tipo_resposta,unidade,valor_minimo,valor_maximo,obrigatorio,momento,requer_revisao_cq,bloqueia_op_se_nao_conforme,configuracao)
 select o.id,i.id,i.ordem,i.grupo,i.item,i.descricao,i.tipo_resposta,i.unidade,i.valor_minimo,i.valor_maximo,i.obrigatorio,i.momento,i.requer_revisao_cq,i.bloqueia_op_se_nao_conforme,i.configuracao
 from public.checklist_template_items i where i.template_id=t.id and i.ativo order by i.ordem;
 get diagnostics copied=row_count;
 if copied=0 then raise exception 'Modelo sem itens ativos'; end if;
 update public.production_orders set status='RELEASED',checklist_template_nome=t.nome,checklist_template_revisao=t.revisao,checklist_template_descricao=t.descricao where id=o.id;
 -- Existing triggers append status changes and snapshot fields to immutable audit_logs.
end $$;

create function public.pcp_dashboard() returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb; today date := (now() at time zone 'America/Sao_Paulo')::date; begin
 if private.current_role() is null or private.current_role() not in ('ADMIN','PCP') then raise exception 'Acesso exclusivo de PCP ou ADMIN ativo' using errcode='42501'; end if;
 select jsonb_build_object(
 'programadas_hoje',count(*) filter(where data_programada=today and status<>'CANCELLED'),
 'liberadas',count(*) filter(where status='RELEASED'),
 'em_producao',count(*) filter(where status='IN_PRODUCTION'),
 'aguardando_cq',count(*) filter(where status='AWAITING_QUALITY'),
 'bloqueadas',count(*) filter(where status='BLOCKED_QUALITY'),
 'aguardando_pcp',count(*) filter(where status='AWAITING_PCP'),
 'finalizadas_hoje',count(*) filter(where status='FINALIZED' and data_finalizacao >= today::timestamp at time zone 'America/Sao_Paulo' and data_finalizacao < (today+1)::timestamp at time zone 'America/Sao_Paulo'),
 'ncs_abertas',(select count(*) from public.non_conformities where status<>'FECHADA')) into result from public.production_orders;
 return result;
end $$;
revoke all on function public.pcp_create_order(jsonb),public.pcp_attach_original(uuid,text,integer),public.pcp_prepare_order(uuid,integer),public.pcp_dashboard() from public,anon;
grant execute on function public.pcp_create_order(jsonb),public.pcp_attach_original(uuid,text,integer),public.pcp_prepare_order(uuid,integer),public.pcp_dashboard() to authenticated;
commit;
