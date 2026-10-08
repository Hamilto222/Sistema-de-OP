begin;
drop view public.pcp_order_list;
alter table public.production_orders drop constraint production_orders_check2;
alter table public.production_orders drop constraint orders_finalized_check;
alter table public.production_orders alter column aprovacao_pcp type public.quality_decision using case when aprovacao_pcp is true then 'APPROVED'::public.quality_decision when aprovacao_pcp is false then 'REJECTED'::public.quality_decision else null end;
alter table public.production_orders add column empresa_nome text;
alter table public.production_orders add constraint orders_pcp_actor_check check(aprovacao_pcp is distinct from 'APPROVED' or (responsavel_pcp_id is not null and data_finalizacao is not null));
alter table public.production_orders add constraint orders_finalized_check check(status<>'FINALIZED' or (aprovacao_cq is not distinct from 'APPROVED'::public.quality_decision and aprovacao_pcp is not distinct from 'APPROVED'::public.quality_decision and fim_producao is not null and quantidade_produzida is not null));
create view public.pcp_order_list with(security_invoker=true) as select o.*,p.codigo produto_codigo,p.descricao produto_descricao,l.nome linha_nome,op.nome operador_nome from public.production_orders o join public.products p on p.id=o.produto_id join public.production_lines l on l.id=o.linha_id left join public.profiles op on op.id=o.operador_responsavel_id;
revoke all on public.pcp_order_list from public,anon;grant select on public.pcp_order_list to authenticated;
create table public.final_reports(
 id uuid primary key default gen_random_uuid(), production_order_id uuid not null references public.production_orders(id) on delete restrict,
 order_version integer not null check(order_version>0), status text not null default 'PENDING' check(status in ('PENDING','READY')),
 path text not null unique, snapshot jsonb not null, created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),
 completed_by uuid references public.profiles(id),completed_at timestamptz,sha256 text,pages integer,original_combined boolean,merge_warning text,
 unique(production_order_id,order_version),check(status<>'READY' or (completed_at is not null and sha256 ~ '^[a-f0-9]{64}$' and pages>0))
);
alter table public.final_reports enable row level security;
revoke all on public.final_reports from public,anon,authenticated;grant select on public.final_reports to authenticated;
create policy reports_read on public.final_reports for select to authenticated using(private.can_access_order(production_order_id));
create index reports_order_date_idx on public.final_reports(production_order_id,created_at desc);
create function private.can_reopen_order(order_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.can_access_order(order_id) and exists(select 1 from public.profiles where id=auth.uid() and ativo and (role='ADMIN' or can_reopen_orders));
$$;
revoke all on function private.can_reopen_order(uuid) from public,anon;grant execute on function private.can_reopen_order(uuid) to authenticated;
create or replace function private.guard_order() returns trigger language plpgsql set search_path='' as $$
declare r public.app_role:=private.current_role(); allowed text[]; begin
 if current_user in ('postgres','supabase_admin','service_role') then return new; end if;
 if r is null then raise exception 'Perfil inativo' using errcode='42501'; end if;
 if tg_op='UPDATE' and old.status='FINALIZED' then
  if new.status<>'REOPENED' or not private.can_reopen_order(old.id) then raise exception 'OP finalizada é imutável; reabertura requer autorização' using errcode='42501'; end if;
  perform private.assert_columns(to_jsonb(old),to_jsonb(new),array['status','motivo_reabertura']);
  if nullif(trim(new.motivo_reabertura),'') is null or length(new.motivo_reabertura)>4000 then raise exception 'Informe motivo de reabertura de até 4000 caracteres'; end if;
  if exists(select 1 from public.final_reports where production_order_id=old.id and status='PENDING') then raise exception 'Gere o relatório pendente antes de reabrir'; end if;
  new.aprovacao_cq=null;new.responsavel_cq_id=null;new.data_aprovacao_cq=null;
  new.aprovacao_pcp=null;new.responsavel_pcp_id=null;new.data_finalizacao=null;
  new.fim_producao=null;new.data_envio_cq=null;
  new.version=old.version+1;return new;
 end if;
 if tg_op='UPDATE' and (new.relatorio_final_path is distinct from old.relatorio_final_path or new.responsavel_pcp_id is distinct from old.responsavel_pcp_id or new.data_finalizacao is distinct from old.data_finalizacao) then raise exception 'Relatório e assinatura PCP são controlados pelo banco' using errcode='42501'; end if;
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
 if new.responsavel_cq_id is distinct from old.responsavel_cq_id or new.data_aprovacao_cq is distinct from old.data_aprovacao_cq or new.data_envio_cq is distinct from old.data_envio_cq then raise exception 'Autoria e horários CQ são controlados pelo banco' using errcode='42501'; end if;
 if new.version<>old.version then raise exception 'A versão é controlada pelo banco; use filtro de versão na atualização' using errcode='42501'; end if;
 if r='PCP' then
  allowed=array['status','motivo_reabertura'];
  if old.status in ('DRAFT','PREPARING') then allowed=allowed||array['numero_op','produto_id','lote','linha_id','quantidade_planejada','unidade','prioridade','data_programada','data_hora_programada','operador_responsavel_id','pdf_original_path','checklist_template_nome','checklist_template_revisao','checklist_template_descricao']; end if;
  if old.status='AWAITING_PCP' then allowed=allowed||array['aprovacao_pcp','empresa_nome']; end if;
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
  if new.status='IN_PRODUCTION' then if new.inicio_producao is null then new.inicio_producao=now(); end if; new.fim_producao=null; new.data_envio_cq=null; end if;
 end if;
 if new.status='AWAITING_PCP' and old.status<>new.status then
  if old.status<>'AWAITING_QUALITY' or new.aprovacao_cq is distinct from 'APPROVED'::public.quality_decision then raise exception 'Aprovação CQ exige OP aguardando CQ'; end if;
  perform private.assert_quality_ready(new,true);
 end if;
 if length(coalesce(new.motivo_bloqueio,''))>4000 or length(coalesce(new.motivo_retorno_cq,''))>4000 then raise exception 'Motivo deve ter até 4000 caracteres'; end if;
 if new.status='FINALIZED' and old.status<>new.status then
  if r not in ('ADMIN','PCP') or old.status<>'AWAITING_PCP' or new.aprovacao_pcp is distinct from 'APPROVED'::public.quality_decision or new.aprovacao_cq is distinct from 'APPROVED'::public.quality_decision then raise exception 'Finalização exige PCP/ADMIN e aprovação CQ aguardando PCP' using errcode='42501'; end if;
  perform private.assert_quality_ready(new,true);
  if nullif(trim(new.empresa_nome),'') is null or length(new.empresa_nome)>200 then raise exception 'Informe nome da empresa de até 200 caracteres'; end if;
  new.responsavel_pcp_id=auth.uid();new.data_finalizacao=now();
 end if;
 if new.aprovacao_pcp is distinct from old.aprovacao_pcp then
  if r not in ('PCP','ADMIN') or old.status<>'AWAITING_PCP' or new.status<>'FINALIZED' or new.aprovacao_pcp is distinct from 'APPROVED'::public.quality_decision then raise exception 'Aprovação PCP não autorizada' using errcode='42501'; end if;
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

create function private.freeze_finalized_children() returns trigger language plpgsql set search_path='' as $$
declare target uuid;begin
 if current_user in ('postgres','supabase_admin','service_role') then if tg_op='DELETE' then return old;else return new;end if;end if;
 target=case when tg_op='DELETE' then old.production_order_id else new.production_order_id end;
 perform 1 from public.production_orders where id=target for update;
 if exists(select 1 from public.production_orders where id=target and status='FINALIZED') then raise exception 'OP finalizada é imutável; reabra antes de editar' using errcode='42501';end if;
 if tg_op='DELETE' then return old;else return new;end if;
end $$;
do $$ declare t text;begin foreach t in array array['production_order_checklist','production_notes','non_conformities'] loop execute format('create trigger aa_freeze_finalized before insert or update or delete on public.%I for each row execute function private.freeze_finalized_children()',t);end loop;end $$;
create function private.capture_final_report() returns trigger language plpgsql security definer set search_path='' as $$
declare report_id uuid:=gen_random_uuid(); data jsonb;begin
 if new.status<>'FINALIZED' or old.status='FINALIZED' then return new;end if;
 select jsonb_build_object('id',report_id,'empresa',new.empresa_nome,'generated_at',new.data_finalizacao,'version',new.version,'order',to_jsonb(new),
 'product',(select to_jsonb(p) from public.products p where p.id=new.produto_id),'line',(select to_jsonb(l) from public.production_lines l where l.id=new.linha_id),
 'items',coalesce((select jsonb_agg(to_jsonb(i) order by i.ordem,i.id) from public.production_order_checklist i where i.production_order_id=new.id),'[]'::jsonb),
 'notes',coalesce((select jsonb_agg(to_jsonb(n) order by n.created_at,n.id) from public.production_notes n where n.production_order_id=new.id),'[]'::jsonb),
 'ncs',coalesce((select jsonb_agg(to_jsonb(n) order by n.data_abertura,n.id) from public.non_conformities n where n.production_order_id=new.id),'[]'::jsonb),
 'people',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'nome',p.nome)) from public.profiles p where p.id=new.operador_responsavel_id or p.id=new.responsavel_cq_id or p.id=new.responsavel_pcp_id or p.id in(select medido_por from public.production_order_checklist where production_order_id=new.id union select revisado_por from public.production_order_checklist where production_order_id=new.id union select created_by from public.production_notes where production_order_id=new.id union select responsavel_id from public.non_conformities where production_order_id=new.id union select encerrado_por from public.non_conformities where production_order_id=new.id)),'[]'::jsonb)) into data;
 insert into public.final_reports(id,production_order_id,order_version,path,snapshot,created_by) values(report_id,new.id,new.version,new.id::text||'/'||report_id::text||'.pdf',data,auth.uid());return new;
end $$;
create trigger capture_final_report after update on public.production_orders for each row execute function private.capture_final_report();
do $$ declare definition text;begin definition=pg_get_functiondef('private.audit_change()'::regprocedure);definition=replace(definition,'''production_order_checklist'',''production_notes'',''non_conformities''','''production_order_checklist'',''production_notes'',''non_conformities'',''final_reports''');execute definition;end $$;
create trigger audit_change after insert or update on public.final_reports for each row execute function private.audit_change();
create function public.pcp_finalize_order(order_id uuid,expected_version integer,company_name text) returns uuid language plpgsql security invoker set search_path='' as $$
declare o public.production_orders; result uuid;begin
 if private.current_role() is null or private.current_role() not in ('ADMIN','PCP') then raise exception 'Finalização exclusiva de PCP/ADMIN ativo' using errcode='42501';end if;
 select * into o from public.production_orders where id=order_id for update;
 if o.id is null or o.version is distinct from expected_version or o.status<>'AWAITING_PCP' then raise exception 'OP indisponível, finalizada ou alterada. Recarregue.';end if;
 update public.production_orders set status='FINALIZED',aprovacao_pcp='APPROVED',empresa_nome=trim(company_name) where id=o.id;
 select id into result from public.final_reports where production_order_id=o.id and order_version=o.version+1;return result;
end $$;
create function public.reopen_order(order_id uuid,expected_version integer,reason text) returns void language plpgsql security invoker set search_path='' as $$
declare o public.production_orders;begin
 if not private.can_reopen_order(order_id) then raise exception 'Reabertura não autorizada' using errcode='42501';end if;
 select * into o from public.production_orders where id=order_id for update;
 if o.id is null or o.version is distinct from expected_version or o.status<>'FINALIZED' then raise exception 'OP indisponível ou alterada. Recarregue.';end if;
 update public.production_orders set status='REOPENED',motivo_reabertura=trim(reason) where id=o.id;
end $$;
create function public.complete_final_report(report_id uuid,digest text,page_count integer,combined boolean,warning text default null) returns void language plpgsql security definer set search_path='' as $$
declare r public.final_reports; o public.production_orders;begin
 if private.current_role() is null or private.current_role() not in ('ADMIN','PCP') then raise exception 'Geração exclusiva PCP/ADMIN ativo' using errcode='42501';end if;
 select * into r from public.final_reports where id=report_id;
 if r.id is null or not private.can_access_order(r.production_order_id) then raise exception 'Relatório indisponível' using errcode='42501';end if;
 select * into o from public.production_orders where id=r.production_order_id for update;
 select * into r from public.final_reports where id=report_id for update;
 if r.status='READY' then return;end if;
 if o.status<>'FINALIZED' or o.version<>r.order_version or digest is null or digest !~ '^[a-f0-9]{64}$' or page_count is null or page_count<1 or combined is null or length(coalesce(warning,''))>500 then raise exception 'Metadados ou estado do relatório inválidos';end if;
 if not exists(select 1 from storage.objects where bucket_id='final-reports' and name=r.path and metadata->>'mimetype'='application/pdf' and (metadata->>'size')::bigint between 1 and 41943040) then raise exception 'PDF privado ainda não foi armazenado';end if;
 update public.final_reports set status='READY',sha256=digest,pages=page_count,original_combined=combined,merge_warning=warning,completed_at=now(),completed_by=auth.uid() where id=r.id;
 update public.production_orders set relatorio_final_path=r.path where id=o.id;
end $$;
do $$ declare definition text;begin definition=pg_get_functiondef('private.can_write_object(text,text)'::regprocedure);
 definition=replace(definition,'select private.can_access_order(private.storage_order_id(path)) and (', 'select private.can_access_order(private.storage_order_id(path)) and (case when bucket=''final-reports'' then private.current_role() in (''ADMIN'',''PCP'') and exists(select 1 from public.final_reports r join public.production_orders o on o.id=r.production_order_id where r.path=path and r.status=''PENDING'' and o.status=''FINALIZED'' and o.version=r.order_version) else (');
 definition=replace(definition, E' );\n', E' ) end);\n');execute definition;end $$;
update storage.buckets set file_size_limit=41943040 where id='final-reports';
revoke all on function private.freeze_finalized_children(),private.capture_final_report() from public,anon,authenticated;
revoke all on function public.pcp_finalize_order(uuid,integer,text),public.reopen_order(uuid,integer,text),public.complete_final_report(uuid,text,integer,boolean,text) from public,anon;
grant execute on function public.pcp_finalize_order(uuid,integer,text),public.reopen_order(uuid,integer,text),public.complete_final_report(uuid,text,integer,boolean,text) to authenticated;
commit;
