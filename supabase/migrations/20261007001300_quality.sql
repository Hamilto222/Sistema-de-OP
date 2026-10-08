begin;
-- Rename enum labels in place: existing data, constraints, indexes and FKs remain intact.
alter type public.nc_status rename value 'ABERTA' to 'OPEN';
alter type public.nc_status rename value 'EM_TRATAMENTO' to 'IN_TREATMENT';
alter type public.nc_status rename value 'AGUARDANDO_CQ' to 'AWAITING_QUALITY';
alter type public.nc_status rename value 'FECHADA' to 'CLOSED';
alter type public.nc_severity rename value 'BAIXA' to 'LOW';
alter type public.nc_severity rename value 'MEDIA' to 'MEDIUM';
alter type public.nc_severity rename value 'ALTA' to 'HIGH';
alter type public.nc_severity rename value 'CRITICA' to 'CRITICAL';
drop view public.pcp_order_list;
alter table public.production_orders drop constraint production_orders_check1;
alter table public.production_orders drop constraint production_orders_check3;
alter table public.production_orders alter column aprovacao_cq type public.quality_decision using
 case when aprovacao_cq is true then 'APPROVED'::public.quality_decision when aprovacao_cq is false then 'REJECTED'::public.quality_decision else null end;
alter table public.production_orders add constraint orders_cq_actor_check check(aprovacao_cq is distinct from 'APPROVED' or (responsavel_cq_id is not null and data_aprovacao_cq is not null));
alter table public.production_orders add constraint orders_finalized_check check(status<>'FINALIZED' or (aprovacao_cq='APPROVED' and aprovacao_pcp is true and fim_producao is not null));
alter table public.production_orders add column motivo_bloqueio text;
alter table public.production_orders add column motivo_retorno_cq text;
alter table public.production_orders add column data_envio_cq timestamptz;
update public.production_orders set data_envio_cq=fim_producao where fim_producao is not null;
alter table public.non_conformities add column codigo_legado text;

-- Refresh affected existing function bodies. Enum renames do not rewrite quoted PL/pgSQL literals.
do $$ declare fn record; definition text; begin
 for fn in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('private','public') and p.prokind='f' and (p.prosrc ~ 'ABERTA|EM_TRATAMENTO|AGUARDANDO_CQ|FECHADA' or p.proname='block_nonconforming_order') loop
  definition=pg_get_functiondef(fn.oid);
  definition=replace(replace(replace(replace(definition,'''ABERTA''','''OPEN'''),'''EM_TRATAMENTO''','''IN_TREATMENT'''),'''AGUARDANDO_CQ''','''AWAITING_QUALITY'''),'''FECHADA''','''CLOSED''');
  if definition like '%block_nonconforming_order%' then definition=replace(definition,'''ALTA''','''HIGH'''); end if;
  execute definition;
 end loop;
end $$;
create view public.pcp_order_list with(security_invoker=true) as select o.*,p.codigo produto_codigo,p.descricao produto_descricao,l.nome linha_nome,op.nome operador_nome from public.production_orders o join public.products p on p.id=o.produto_id join public.production_lines l on l.id=o.linha_id left join public.profiles op on op.id=o.operador_responsavel_id;
revoke all on public.pcp_order_list from public,anon; grant select on public.pcp_order_list to authenticated;

create function private.order_transition_allowed(r public.app_role,source public.order_status,target public.order_status) returns boolean language sql immutable set search_path='' as $$
 select source=target or
 (r in ('ADMIN','PCP') and ((source='DRAFT' and target in ('PREPARING','CANCELLED')) or (source='PREPARING' and target in ('DRAFT','RELEASED','CANCELLED')) or (source='RELEASED' and target='CANCELLED') or (source='AWAITING_PCP' and target='FINALIZED') or (source='FINALIZED' and target='REOPENED'))) or
 (r in ('ADMIN','QUALIDADE') and ((source in ('RELEASED','IN_PRODUCTION','AWAITING_QUALITY') and target='BLOCKED_QUALITY') or (source='AWAITING_QUALITY' and target='AWAITING_PCP') or (source='BLOCKED_QUALITY' and target in ('IN_PRODUCTION','AWAITING_QUALITY')))) or
 (r in ('ADMIN','OPERADOR') and ((source in ('RELEASED','REOPENED') and target='IN_PRODUCTION') or (source='IN_PRODUCTION' and target='AWAITING_QUALITY')));
$$;
create function private.nc_transition_allowed(r public.app_role,source public.nc_status,target public.nc_status) returns boolean language sql immutable set search_path='' as $$
 select (source=target and source not in ('CLOSED','CANCELLED')) or
 (r in ('ADMIN','QUALIDADE') and ((source='OPEN' and target in ('IN_TREATMENT','AWAITING_QUALITY','CANCELLED')) or (source='IN_TREATMENT' and target in ('AWAITING_QUALITY','CANCELLED')) or (source='AWAITING_QUALITY' and target in ('IN_TREATMENT','CLOSED','CANCELLED')))) or
 (r='OPERADOR' and ((source='OPEN' and target in ('IN_TREATMENT','AWAITING_QUALITY')) or (source='IN_TREATMENT' and target='AWAITING_QUALITY')));
$$;
revoke all on function private.order_transition_allowed(public.app_role,public.order_status,public.order_status),private.nc_transition_allowed(public.app_role,public.nc_status,public.nc_status) from public,anon;
grant execute on function private.order_transition_allowed(public.app_role,public.order_status,public.order_status),private.nc_transition_allowed(public.app_role,public.nc_status,public.nc_status) to authenticated;

create function private.assert_quality_ready(o public.production_orders,require_reviews boolean) returns void language plpgsql security invoker set search_path='' as $$
begin
 if o.inicio_producao is null or o.fim_producao is null or o.quantidade_produzida is null or o.quantidade_perdida is null then raise exception 'Produção e quantidades precisam estar concluídas'; end if;
 if not exists(select 1 from public.production_order_checklist where production_order_id=o.id) or exists(select 1 from public.production_order_checklist where production_order_id=o.id and obrigatorio and (data_medicao is null or conforme is null)) then raise exception 'Checklist obrigatório incompleto'; end if;
 if require_reviews and exists(select 1 from public.production_order_checklist where production_order_id=o.id and requer_revisao_cq and not revisado_cq) then raise exception 'Revise todos os itens que requerem CQ'; end if;
 if exists(select 1 from public.non_conformities where production_order_id=o.id and impeditiva and status not in ('CLOSED','CANCELLED')) then raise exception 'Existe NC impeditiva aberta'; end if;
 if exists(select 1 from public.production_order_checklist c where c.production_order_id=o.id and c.bloqueia_op_se_nao_conforme and c.conforme is false and not exists(select 1 from public.non_conformities n where n.checklist_item_id=c.id and n.status='CLOSED' and n.aprovado_cq is true)) then raise exception 'Item impeditivo não conforme precisa de correção ou NC resolvida pelo CQ'; end if;
end $$;
revoke all on function private.assert_quality_ready(public.production_orders,boolean) from public,anon;
grant execute on function private.assert_quality_ready(public.production_orders,boolean) to authenticated;
create or replace function private.guard_order() returns trigger language plpgsql set search_path='' as $$
declare r public.app_role:=private.current_role(); allowed text[]; begin
 if current_user in ('postgres','supabase_admin','service_role') then return new; end if;
 if r is null then raise exception 'Perfil inativo' using errcode='42501'; end if;
 if (tg_op='INSERT' or new.operador_responsavel_id is distinct from old.operador_responsavel_id) and new.operador_responsavel_id is not null and not private.operator_is_active(new.operador_responsavel_id) then
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
  perform private.assert_columns(to_jsonb(old),to_jsonb(new),array['status','aprovacao_cq','motivo_bloqueio','motivo_retorno_cq']);
  if old.status not in ('RELEASED','IN_PRODUCTION','AWAITING_QUALITY','BLOCKED_QUALITY') then raise exception 'OP não está disponível para alteração de qualidade' using errcode='42501'; end if;
 elsif r='OPERADOR' then
  allowed=array['status','quantidade_produzida','quantidade_perdida','observacao_final','assinatura_operador_path'];
  if old.status='RELEASED' and new.status='IN_PRODUCTION' and old.operador_responsavel_id is null then
   if new.operador_responsavel_id is distinct from auth.uid() then raise exception 'Responsável deve ser o operador autenticado' using errcode='42501'; end if;
   allowed=allowed||array['operador_responsavel_id'];
  end if;
  perform private.assert_columns(to_jsonb(old),to_jsonb(new),allowed);
  if old.status not in ('RELEASED','IN_PRODUCTION','REOPENED') then raise exception 'OP não está em execução' using errcode='42501'; end if;
  if old.status='RELEASED' and new.status<>'IN_PRODUCTION' then raise exception 'Inicie a produção antes de registrar resultados'; end if;
 end if;
 if not private.order_transition_allowed(r,old.status,new.status) then raise exception 'Transição de OP não autorizada' using errcode='42501'; end if;
 if r='PCP' and old.status='FINALIZED' and new.status='REOPENED' and not exists(select 1 from public.profiles where id=auth.uid() and can_reopen_orders) then raise exception 'Reabertura não autorizada' using errcode='42501'; end if;
 if new.status='RELEASED' and old.status<>new.status then
  if new.pdf_original_path is null or not exists(select 1 from public.production_order_checklist where production_order_id=new.id) then raise exception 'PDF e checklist são necessários para liberar'; end if;
 end if;
 if new.status='IN_PRODUCTION' and old.status in ('RELEASED','REOPENED') then new.inicio_producao=now(); if new.operador_responsavel_id is null then new.operador_responsavel_id=auth.uid(); end if; end if;
 if new.status='AWAITING_QUALITY' and old.status<>new.status then
  if old.status='BLOCKED_QUALITY' then
   perform private.assert_quality_ready(new,false);
  else
   if exists(select 1 from public.production_order_checklist where production_order_id=new.id and obrigatorio and (data_medicao is null or conforme is null)) then raise exception 'Checklist obrigatório incompleto'; end if;
   if new.quantidade_produzida is null or new.quantidade_perdida is null then raise exception 'Informe quantidade produzida e perdida, inclusive zero'; end if;
   if exists(select 1 from public.production_order_checklist where production_order_id=new.id and bloqueia_op_se_nao_conforme and conforme is false) then raise exception 'Existe item impeditivo não conforme'; end if;
   if exists(select 1 from public.non_conformities where production_order_id=new.id and impeditiva and status not in ('CLOSED','CANCELLED')) then raise exception 'Existe não conformidade impeditiva aberta'; end if;
   new.fim_producao=now();
  end if;
  new.data_envio_cq=now();
 end if;
 if new.aprovacao_cq is distinct from old.aprovacao_cq then
  if r not in ('QUALIDADE','ADMIN') then raise exception 'Decisão CQ não autorizada' using errcode='42501'; end if;
  if new.aprovacao_cq='APPROVED' and (old.status<>'AWAITING_QUALITY' or new.status<>'AWAITING_PCP') then raise exception 'Aprovação exige OP aguardando CQ e envio ao PCP'; end if;
  if new.aprovacao_cq='REJECTED' and new.status<>'BLOCKED_QUALITY' then raise exception 'Reprovação exige bloqueio'; end if;
  if new.aprovacao_cq is null and not (old.status='BLOCKED_QUALITY' and new.status in ('IN_PRODUCTION','AWAITING_QUALITY')) and new.status<>'REOPENED' then raise exception 'Decisão CQ não pode ser apagada'; end if;
  new.responsavel_cq_id=auth.uid(); new.data_aprovacao_cq=now();
 end if;
 if new.status='BLOCKED_QUALITY' and old.status<>new.status then
  if nullif(trim(new.motivo_bloqueio),'') is null then raise exception 'Informe o motivo do bloqueio'; end if;
  new.aprovacao_cq='REJECTED'; new.responsavel_cq_id=auth.uid(); new.data_aprovacao_cq=now();
 end if;
 if old.status='BLOCKED_QUALITY' and new.status in ('IN_PRODUCTION','AWAITING_QUALITY') then
  if nullif(trim(new.motivo_retorno_cq),'') is null then raise exception 'Informe a justificativa do retorno controlado'; end if;
  new.aprovacao_cq=null; new.responsavel_cq_id=null; new.data_aprovacao_cq=null;
  if new.status='IN_PRODUCTION' then new.fim_producao=null; new.data_envio_cq=null; end if;
 end if;
 if new.status='AWAITING_PCP' and old.status<>new.status then
  if old.status<>'AWAITING_QUALITY' or new.aprovacao_cq is distinct from 'APPROVED'::public.quality_decision then raise exception 'Aprovação CQ exige OP aguardando CQ'; end if;
  perform private.assert_quality_ready(new,true);
 end if;
 if length(coalesce(new.motivo_bloqueio,''))>4000 or length(coalesce(new.motivo_retorno_cq,''))>4000 then raise exception 'Motivo deve ter até 4000 caracteres'; end if;
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

create or replace function private.guard_checklist() returns trigger language plpgsql set search_path='' as $$
declare r public.app_role:=private.current_role(); o public.production_orders; begin
 if current_user in ('postgres','supabase_admin','service_role') then if tg_op='DELETE' then return old; else return new; end if; end if;
 select * into o from public.production_orders where id=coalesce(new.production_order_id,old.production_order_id) for update;
 if o.id is null then raise exception 'OP não acessível' using errcode='42501'; end if;
 if tg_op='DELETE' then
  if r<>'ADMIN' and (r<>'PCP' or o.status not in ('DRAFT','PREPARING')) then raise exception 'Checklist não pode ser removido' using errcode='42501'; end if;
  return old;
 end if;
 if tg_op='INSERT' then
  if r not in ('ADMIN','PCP') or (r='PCP' and o.status not in ('DRAFT','PREPARING')) then raise exception 'Checklist só pode ser preparado pelo PCP' using errcode='42501'; end if;
  if r='PCP' and (new.valor_numero is not null or new.resposta_texto is not null or new.resposta_boolean is not null or new.resposta_select is not null or new.foto_path is not null or new.conforme is not null or new.observacao is not null or new.medido_por is not null or new.data_medicao is not null or new.revisado_cq or new.revisado_por is not null or new.data_revisao is not null) then raise exception 'PCP não pode criar medição ou revisão' using errcode='42501'; end if;
  new.created_at=now(); new.updated_at=now(); return new;
 end if;
 if new.id<>old.id or new.production_order_id<>old.production_order_id or new.created_at<>old.created_at then raise exception 'Identidade imutável' using errcode='42501'; end if;
 if r='PCP' then
  if o.status not in ('DRAFT','PREPARING') then raise exception 'Planejamento já liberado' using errcode='42501'; end if;
  perform private.assert_columns(to_jsonb(old),to_jsonb(new),array['template_item_id','ordem','grupo','item','descricao','tipo_resposta','unidade','valor_minimo','valor_maximo','obrigatorio','momento','requer_revisao_cq','bloqueia_op_se_nao_conforme','configuracao']);
 elsif r='OPERADOR' then
  if o.status<>'IN_PRODUCTION' then raise exception 'Medição exige OP em produção' using errcode='42501'; end if;
  perform private.assert_columns(to_jsonb(old),to_jsonb(new),array['valor_numero','resposta_texto','resposta_boolean','resposta_select','foto_path','observacao']);
  if new.tipo_resposta='NUMBER' then
   if new.valor_numero is null or new.resposta_texto is not null or new.resposta_boolean is not null or new.resposta_select is not null then raise exception 'Resposta numérica inválida'; end if;
   new.conforme=(new.valor_minimo is null or new.valor_numero>=new.valor_minimo) and (new.valor_maximo is null or new.valor_numero<=new.valor_maximo);
  elsif new.tipo_resposta='BOOLEAN' then
   if new.resposta_boolean is null or new.valor_numero is not null or new.resposta_texto is not null or new.resposta_select is not null then raise exception 'Resposta booleana inválida'; end if;
   new.conforme=new.resposta_boolean = coalesce((new.configuracao->>'resposta_conforme')::boolean,true);
  elsif new.tipo_resposta='TEXT' then
   if nullif(trim(new.resposta_texto),'') is null or new.valor_numero is not null or new.resposta_boolean is not null or new.resposta_select is not null then raise exception 'Resposta textual inválida'; end if;
   new.conforme=true;
  elsif new.tipo_resposta='PHOTO' then
   if new.foto_path is null or split_part(new.foto_path,'/',1)<>new.production_order_id::text or new.valor_numero is not null or new.resposta_texto is not null or new.resposta_boolean is not null or new.resposta_select is not null then raise exception 'Foto inválida'; end if;
   new.conforme=true;
  else
   if new.resposta_select is null or not coalesce((new.configuracao->'opcoes') ? new.resposta_select,false) or new.valor_numero is not null or new.resposta_texto is not null or new.resposta_boolean is not null then raise exception 'Seleção inválida'; end if;
   new.conforme=coalesce((new.configuracao->'opcoes_conformes') ? new.resposta_select,true);
  end if;
  if new.valor_numero::text in ('NaN','Infinity','-Infinity') then raise exception 'Valor numérico deve ser finito'; end if;
  if new.conforme is false and nullif(trim(new.observacao),'') is null then raise exception 'Resposta NÃO CONFORME exige observação'; end if;
  if length(coalesce(new.observacao,''))>4000 or length(coalesce(new.resposta_texto,''))>4000 then raise exception 'Texto deve ter no máximo 4000 caracteres'; end if;
  if new.foto_path is not null then perform private.validate_operator_photo(new.production_order_id,new.foto_path); end if;
  new.medido_por=auth.uid(); new.data_medicao=now(); new.revisado_cq=false; new.revisado_por=null; new.data_revisao=null;
 elsif r='QUALIDADE' or (r='ADMIN' and new.revisado_cq is distinct from old.revisado_cq) then
  if o.status not in ('AWAITING_QUALITY','BLOCKED_QUALITY') then raise exception 'OP não está em revisão CQ' using errcode='42501'; end if;
  perform private.assert_columns(to_jsonb(old),to_jsonb(new),array['revisado_cq']);
  if new.revisado_cq and new.data_medicao is null then raise exception 'Item ainda não medido'; end if;
  if new.revisado_cq and old.revisado_cq then raise exception 'Item já revisado'; end if;
  new.revisado_por=case when new.revisado_cq then auth.uid() else null end;
  new.data_revisao=case when new.revisado_cq then now() else null end;
 elsif r is distinct from 'ADMIN' then raise exception 'Perfil não autorizado' using errcode='42501';
 end if;
 return new;
end $$;


alter table public.non_conformities add column encerrado_por uuid references public.profiles(id) on delete restrict;
create or replace function private.guard_nc() returns trigger language plpgsql set search_path='' as $$
declare r public.app_role:=private.current_role(); o public.production_orders; begin
 if current_user in ('postgres','supabase_admin','service_role') then return new; end if;
 if r is null then raise exception 'Perfil inativo' using errcode='42501'; end if;
 select * into o from public.production_orders where id=new.production_order_id for update;
 if o.id is null or o.status not in ('RELEASED','IN_PRODUCTION','BLOCKED_QUALITY','AWAITING_QUALITY') then raise exception 'OP não disponível para tratamento de NC' using errcode='42501'; end if;
 if new.checklist_item_id is not null and not exists(select 1 from public.production_order_checklist where id=new.checklist_item_id and production_order_id=o.id) then raise exception 'Item pertence a outra OP'; end if;
 if tg_op='INSERT' then
  if new.created_by is distinct from auth.uid() or new.status<>'OPEN' or new.aprovado_cq is not null or new.encerrado_por is not null or new.data_fechamento is not null then raise exception 'NC deve nascer aberta com autoria real' using errcode='42501'; end if;
  if r='OPERADOR' and (o.status not in ('IN_PRODUCTION','BLOCKED_QUALITY') or new.observacao_cq is not null) then raise exception 'Operador só pode abrir NC em execução' using errcode='42501'; end if;
  new.created_at=now(); new.updated_at=now(); new.data_abertura=now();
 else
  if new.id<>old.id or new.production_order_id<>old.production_order_id or new.created_by<>old.created_by or new.created_at<>old.created_at or new.data_abertura<>old.data_abertura or new.codigo_nc<>old.codigo_nc or new.codigo_legado is distinct from old.codigo_legado then raise exception 'Identidade, código e abertura são imutáveis' using errcode='42501'; end if;
  if not private.nc_transition_allowed(r,old.status,new.status) then raise exception 'Transição de NC não autorizada; encerramento é definitivo' using errcode='42501'; end if;
  if new.aprovado_cq is distinct from old.aprovado_cq or new.encerrado_por is distinct from old.encerrado_por or new.data_fechamento is distinct from old.data_fechamento then raise exception 'Encerramento e autoria são controlados pelo banco' using errcode='42501'; end if;
  if r='OPERADOR' then
   if old.created_by<>auth.uid() or o.status not in ('IN_PRODUCTION','BLOCKED_QUALITY') then raise exception 'NC indisponível ao operador' using errcode='42501'; end if;
   perform private.assert_columns(to_jsonb(old),to_jsonb(new),array['acao_imediata','evidencia_antes_path','evidencia_depois_path','status']);
  end if;
 end if;
 if r not in ('ADMIN','QUALIDADE','OPERADOR') then raise exception 'Perfil não autorizado' using errcode='42501'; end if;
 if nullif(trim(new.tipo),'') is null or length(new.tipo)>100 or nullif(trim(new.descricao),'') is null or length(new.descricao)>4000 or length(coalesce(new.acao_imediata,''))>4000 or length(coalesce(new.observacao_cq,''))>4000 then raise exception 'Confira tipo, descrição e textos de até 4000 caracteres'; end if;
 if new.responsavel_id is not null and (tg_op='INSERT' or new.responsavel_id is distinct from old.responsavel_id) and not exists(select 1 from public.profiles where id=new.responsavel_id and ativo) then raise exception 'Selecione responsável ativo'; end if;
 if new.status='CLOSED' then
  if r not in ('QUALIDADE','ADMIN') or nullif(trim(new.acao_imediata),'') is null or new.responsavel_id is null or not exists(select 1 from public.profiles where id=new.responsavel_id and ativo) or nullif(trim(new.observacao_cq),'') is null then raise exception 'Fechamento exige ação imediata, responsável ativo e observação CQ'; end if;
  new.aprovado_cq=true; new.encerrado_por=auth.uid(); new.data_fechamento=now();
 elsif new.status='CANCELLED' then
  if r not in ('QUALIDADE','ADMIN') or nullif(trim(new.observacao_cq),'') is null then raise exception 'Cancelamento exige justificativa CQ'; end if;
  new.aprovado_cq=false; new.encerrado_por=auth.uid(); new.data_fechamento=now();
 end if;
 if new.evidencia_antes_path is not null then perform private.validate_nc_evidence(o.id,new.evidencia_antes_path); end if;
 if new.evidencia_depois_path is not null then perform private.validate_nc_evidence(o.id,new.evidencia_depois_path); end if;
 return new;
end $$;

create function private.validate_nc_evidence(order_id uuid,path text) returns void language plpgsql security invoker set search_path='' as $$
begin
 if private.storage_order_id(path) is distinct from order_id or not exists(select 1 from storage.objects where name=path and bucket_id in ('quality-evidence','operator-evidence') and metadata->>'mimetype' in ('image/jpeg','image/png','image/webp','application/pdf') and (metadata->>'size')::bigint between 1 and 10485760) then raise exception 'Evidência privada inválida ou de outra OP'; end if;
end $$;
revoke all on function private.validate_nc_evidence(uuid,text) from public,anon;
grant execute on function private.validate_nc_evidence(uuid,text) to authenticated;
revoke delete on public.non_conformities from authenticated;

create table private.nc_counters(ano integer primary key,ultimo bigint not null check(ultimo>0));
revoke all on private.nc_counters from public,anon,authenticated;
create function private.next_nc_code(year_number integer) returns text language plpgsql security definer set search_path='' as $$
declare number bigint; begin
 insert into private.nc_counters(ano,ultimo) values(year_number,1) on conflict(ano) do update set ultimo=private.nc_counters.ultimo+1 returning ultimo into number;
 return 'NC-'||year_number::text||'-'||lpad(number::text,greatest(5,length(number::text)),'0');
end $$;
revoke all on function private.next_nc_code(integer) from public,anon,authenticated;
-- Preserve former codes explicitly and in audit history; chronological annual numbering.
do $$ declare n record; begin
 for n in select id,codigo_nc,extract(year from data_abertura at time zone 'America/Sao_Paulo')::integer ano from public.non_conformities order by data_abertura,id loop
  update public.non_conformities set codigo_legado=n.codigo_nc,codigo_nc=private.next_nc_code(n.ano) where id=n.id;
 end loop;
end $$;
create function private.assign_nc_code() returns trigger language plpgsql security definer set search_path='' as $$
begin new.codigo_nc=private.next_nc_code(extract(year from now() at time zone 'America/Sao_Paulo')::integer); new.codigo_legado=null; return new; end $$;
create trigger aa_assign_nc_code before insert on public.non_conformities for each row execute function private.assign_nc_code();
revoke all on function private.assign_nc_code() from public,anon,authenticated;

create or replace function private.block_nonconforming_order() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.conforme is false and new.bloqueia_op_se_nao_conforme then
  update public.production_orders set status='BLOCKED_QUALITY',version=version+1,aprovacao_cq='REJECTED',responsavel_cq_id=null,data_aprovacao_cq=null,motivo_bloqueio='Medição impeditiva não conforme: '||new.item where id=new.production_order_id and status='IN_PRODUCTION';
  if found and auth.uid() is not null then
   insert into public.non_conformities(codigo_nc,production_order_id,checklist_item_id,tipo,descricao,severidade,acao_imediata,impeditiva,created_by,evidencia_antes_path)
   values('',new.production_order_id,new.id,'CHECKLIST','Item: '||new.item||'. '||coalesce(new.observacao,''),'HIGH','OP bloqueada automaticamente; aguardar CQ.',true,auth.uid(),new.foto_path);
  end if;
 end if;
 return new;
end $$;
-- Automatic rejection has no forged quality signature: actual measuring actor is in audit/NC.
create or replace function private.reset_reviews_on_reopen() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (old.status='FINALIZED' and new.status='REOPENED') or (old.status='BLOCKED_QUALITY' and new.status='IN_PRODUCTION') then
 update public.production_order_checklist set revisado_cq=false,revisado_por=null,data_revisao=null where production_order_id=new.id;
 end if; return new;
end $$;
create or replace function private.notify_quality_transition() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status is distinct from old.status then
  if new.status in ('BLOCKED_QUALITY','AWAITING_QUALITY') then
   insert into public.notifications(user_id,tipo,titulo,mensagem,reference_type,reference_id)
   select id,new.status::text,case when new.status='BLOCKED_QUALITY' then 'OP bloqueada por qualidade' else 'OP aguardando revisão CQ' end,'OP '||new.numero_op||' requer atenção do Controle de Qualidade.','production_orders',new.id from public.profiles where ativo and role='QUALIDADE';
  end if;
  if new.status in ('AWAITING_PCP','BLOCKED_QUALITY') or (old.status='BLOCKED_QUALITY' and new.status='IN_PRODUCTION') then
   insert into public.notifications(user_id,tipo,titulo,mensagem,reference_type,reference_id)
   select distinct p.id,new.status::text,case when new.status='AWAITING_PCP' then 'OP aprovada pelo CQ' when new.status='IN_PRODUCTION' then 'OP liberada para correção' else 'OP reprovada/bloqueada' end,'OP '||new.numero_op||'. '||coalesce(case when new.status='BLOCKED_QUALITY' then new.motivo_bloqueio when new.status='IN_PRODUCTION' then new.motivo_retorno_cq else 'Aguardando finalização do PCP.' end,''),'production_orders',new.id
   from public.profiles p where p.ativo and (p.role='PCP' or (new.status in ('BLOCKED_QUALITY','IN_PRODUCTION') and p.role='OPERADOR' and (p.id=new.operador_responsavel_id or (p.production_line_id=new.linha_id and exists(select 1 from public.production_lines l where l.id=new.linha_id and l.ativa)))));
  end if;
 end if;
 return new;
end $$;

create function public.quality_review_item(order_id uuid,item_id uuid,expected_updated_at timestamptz) returns void language plpgsql security invoker set search_path='' as $$
declare c public.production_order_checklist; begin
 if private.current_role() is null or private.current_role() not in ('ADMIN','QUALIDADE') then raise exception 'Acesso exclusivo de Qualidade ou ADMIN ativo' using errcode='42501'; end if;
 perform 1 from public.production_orders where id=order_id and status in ('AWAITING_QUALITY','BLOCKED_QUALITY') for update;
 if not found then raise exception 'OP não está disponível para revisão'; end if;
 select * into c from public.production_order_checklist where id=item_id and production_order_id=order_id for update;
 if c.id is null or c.updated_at is distinct from expected_updated_at or c.revisado_cq then raise exception 'Item indisponível, alterado ou já revisado. Recarregue.' using errcode='42501'; end if;
 if c.data_medicao is null or c.conforme is null then raise exception 'Item ainda não medido'; end if;
 update public.production_order_checklist set revisado_cq=true where id=c.id;
end $$;

create function public.quality_decide_order(order_id uuid,expected_version integer,decision text,reason text default null) returns void language plpgsql security invoker set search_path='' as $$
declare o public.production_orders; begin
 if private.current_role() is null or private.current_role() not in ('ADMIN','QUALIDADE') then raise exception 'Acesso exclusivo de Qualidade ou ADMIN ativo' using errcode='42501'; end if;
 select * into o from public.production_orders where id=order_id for update;
 if o.id is null or o.version is distinct from expected_version then raise exception 'OP indisponível ou alterada. Recarregue antes de decidir.' using errcode='42501'; end if;
 if decision='APPROVED' then
  update public.production_orders set aprovacao_cq='APPROVED',status='AWAITING_PCP' where id=o.id;
 elsif decision='REJECTED' then
  if o.status not in ('RELEASED','IN_PRODUCTION','AWAITING_QUALITY') then raise exception 'OP não pode ser bloqueada neste status'; end if;
  update public.production_orders set aprovacao_cq='REJECTED',status='BLOCKED_QUALITY',motivo_bloqueio=nullif(trim(reason),'') where id=o.id;
 elsif decision in ('IN_PRODUCTION','AWAITING_QUALITY') then
  if o.status<>'BLOCKED_QUALITY' then raise exception 'Retorno controlado exige OP bloqueada'; end if;
  update public.production_orders set status=decision::public.order_status,motivo_retorno_cq=nullif(trim(reason),'') where id=o.id;
 else raise exception 'Decisão ou transição inválida' using errcode='42501'; end if;
end $$;

create function public.quality_save_nc(payload jsonb) returns uuid language plpgsql security invoker set search_path='' as $$
declare n public.non_conformities; result uuid; target uuid; begin
 if private.current_role() is null or private.current_role() not in ('ADMIN','QUALIDADE') then raise exception 'Acesso exclusivo de Qualidade ou ADMIN ativo' using errcode='42501'; end if;
 if payload is null or jsonb_typeof(payload)<>'object' or exists(select 1 from jsonb_object_keys(payload) k where k not in ('id','updated_at','production_order_id','checklist_item_id','tipo','descricao','severidade','acao_imediata','responsavel_id','status','evidencia_antes_path','evidencia_depois_path','observacao_cq','impeditiva')) then raise exception 'Campos de NC inválidos' using errcode='42501'; end if;
 target=nullif(payload->>'id','')::uuid;
 if target is not null then
  select * into n from public.non_conformities where id=target;
  if n.id is null then raise exception 'NC não encontrada'; end if;
  perform 1 from public.production_orders where id=n.production_order_id for update;
  select * into n from public.non_conformities where id=target for update;
  if n.updated_at is distinct from (payload->>'updated_at')::timestamptz then raise exception 'NC alterada. Recarregue antes de salvar.' using errcode='42501'; end if;
  if nullif(payload->>'production_order_id','')::uuid is distinct from n.production_order_id then raise exception 'OP da NC é imutável'; end if;
  update public.non_conformities set checklist_item_id=nullif(payload->>'checklist_item_id','')::uuid,tipo=trim(payload->>'tipo'),descricao=trim(payload->>'descricao'),severidade=(payload->>'severidade')::public.nc_severity,acao_imediata=nullif(trim(payload->>'acao_imediata'),''),responsavel_id=nullif(payload->>'responsavel_id','')::uuid,status=(payload->>'status')::public.nc_status,evidencia_antes_path=nullif(payload->>'evidencia_antes_path',''),evidencia_depois_path=nullif(payload->>'evidencia_depois_path',''),observacao_cq=nullif(trim(payload->>'observacao_cq'),''),impeditiva=(payload->>'impeditiva')::boolean where id=n.id;
  return n.id;
 end if;
 insert into public.non_conformities(codigo_nc,production_order_id,checklist_item_id,tipo,descricao,severidade,acao_imediata,responsavel_id,status,evidencia_antes_path,evidencia_depois_path,observacao_cq,impeditiva,created_by)
 values('',(payload->>'production_order_id')::uuid,nullif(payload->>'checklist_item_id','')::uuid,trim(payload->>'tipo'),trim(payload->>'descricao'),(payload->>'severidade')::public.nc_severity,nullif(trim(payload->>'acao_imediata'),''),nullif(payload->>'responsavel_id','')::uuid,(payload->>'status')::public.nc_status,nullif(payload->>'evidencia_antes_path',''),nullif(payload->>'evidencia_depois_path',''),nullif(trim(payload->>'observacao_cq'),''),(payload->>'impeditiva')::boolean,auth.uid()) returning id into result;
 return result;
end $$;
create function public.quality_dashboard() returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb; begin
 if private.current_role() is null or private.current_role() not in ('ADMIN','QUALIDADE') then raise exception 'Acesso exclusivo de Qualidade ou ADMIN ativo' using errcode='42501'; end if;
 select jsonb_build_object('aguardando_cq',count(*) filter(where status='AWAITING_QUALITY'),'bloqueadas',count(*) filter(where status='BLOCKED_QUALITY'),'ncs_abertas',(select count(*) from public.non_conformities where status not in ('CLOSED','CANCELLED')),'itens_revisao',(select count(*) from public.production_order_checklist c join public.production_orders p on p.id=c.production_order_id where p.status in ('AWAITING_QUALITY','BLOCKED_QUALITY') and c.requer_revisao_cq and not c.revisado_cq)) into result from public.production_orders;
 return result;
end $$;
create index quality_queue_idx on public.production_orders(data_envio_cq,id) where status in ('AWAITING_QUALITY','BLOCKED_QUALITY');
create index quality_review_idx on public.production_order_checklist(production_order_id) where requer_revisao_cq and not revisado_cq;
create index nc_updated_idx on public.non_conformities(updated_at desc,id);
create view public.quality_nc_list with(security_invoker=true) as select n.*,o.numero_op,p.codigo produto_codigo,p.descricao produto_descricao,actor.nome responsavel_nome from public.non_conformities n join public.production_orders o on o.id=n.production_order_id join public.products p on p.id=o.produto_id left join public.profiles actor on actor.id=n.responsavel_id;
revoke all on public.quality_nc_list from public,anon; grant select on public.quality_nc_list to authenticated;
revoke all on function public.quality_review_item(uuid,uuid,timestamptz),public.quality_decide_order(uuid,integer,text,text),public.quality_save_nc(jsonb),public.quality_dashboard() from public,anon;
grant execute on function public.quality_review_item(uuid,uuid,timestamptz),public.quality_decide_order(uuid,integer,text,text),public.quality_save_nc(jsonb),public.quality_dashboard() to authenticated;
commit;
