begin;
alter table public.non_conformities add column impeditiva boolean not null default true;
create index nc_blocking_open_idx on public.non_conformities(production_order_id) where impeditiva and status<>'FECHADA';

-- INVOKER reads Storage through the current user's RLS, never a service key.
create function private.validate_operator_photo(order_id uuid,document_path text) returns void language plpgsql security invoker set search_path='' as $$
begin
 if private.storage_order_id(document_path) is distinct from order_id or not exists(
 select 1 from storage.objects where bucket_id='operator-evidence' and name=document_path
 and metadata->>'mimetype' in ('image/jpeg','image/png','image/webp') and (metadata->>'size')::bigint between 1 and 10485760
 ) then raise exception 'Evidência privada não encontrada ou inválida'; end if;
end $$;
revoke all on function private.validate_operator_photo(uuid,text) from public,anon;
grant execute on function private.validate_operator_photo(uuid,text) to authenticated;
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
  allowed=array['status','quantidade_produzida','quantidade_perdida','observacao_final','assinatura_operador_path'];
  if old.status='RELEASED' and new.status='IN_PRODUCTION' and old.operador_responsavel_id is null then
   if new.operador_responsavel_id is distinct from auth.uid() then raise exception 'Responsável deve ser o operador autenticado' using errcode='42501'; end if;
   allowed=allowed||array['operador_responsavel_id'];
  end if;
  perform private.assert_columns(to_jsonb(old),to_jsonb(new),allowed);
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
 if new.status='IN_PRODUCTION' and old.status in ('RELEASED','REOPENED') then new.inicio_producao=now(); if new.operador_responsavel_id is null then new.operador_responsavel_id=auth.uid(); end if; end if;
 if new.status='AWAITING_QUALITY' and old.status<>new.status then
  if exists(select 1 from public.production_order_checklist where production_order_id=new.id and obrigatorio and (data_medicao is null or conforme is null)) then raise exception 'Checklist obrigatório incompleto'; end if;
  if old.status<>'IN_PRODUCTION' then raise exception 'Envio ao CQ exige produção em andamento'; end if;
  if new.quantidade_produzida is null or new.quantidade_perdida is null then raise exception 'Informe quantidade produzida e perdida, inclusive zero'; end if;
  if exists(select 1 from public.production_order_checklist where production_order_id=new.id and bloqueia_op_se_nao_conforme and conforme is false) then raise exception 'Existe item impeditivo não conforme'; end if;
  if exists(select 1 from public.non_conformities where production_order_id=new.id and impeditiva and status<>'FECHADA') then raise exception 'Existe não conformidade impeditiva aberta'; end if;
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
 elsif r='QUALIDADE' then
  if o.status not in ('AWAITING_QUALITY','BLOCKED_QUALITY') then raise exception 'OP não está em revisão CQ' using errcode='42501'; end if;
  perform private.assert_columns(to_jsonb(old),to_jsonb(new),array['revisado_cq']);
  if new.revisado_cq and new.data_medicao is null then raise exception 'Item ainda não medido'; end if;
  new.revisado_por=case when new.revisado_cq then auth.uid() else null end;
  new.data_revisao=case when new.revisado_cq then now() else null end;
 elsif r is distinct from 'ADMIN' then raise exception 'Perfil não autorizado' using errcode='42501';
 end if;
 return new;
end $$;

create or replace function private.guard_note() returns trigger language plpgsql set search_path='' as $$
begin
 if current_user in ('postgres','supabase_admin','service_role') then return new; end if;
 perform 1 from public.production_orders where id=new.production_order_id for update;
 if not found then raise exception 'OP não acessível' using errcode='42501'; end if;
 if tg_op='INSERT' then
  if new.created_by is distinct from auth.uid() then raise exception 'Autoria inválida' using errcode='42501'; end if;
  if private.current_role()='OPERADOR' and not private.order_in_state(new.production_order_id,array['IN_PRODUCTION']::public.order_status[]) then raise exception 'Apontamento exige produção em andamento' using errcode='42501'; end if;
  if nullif(trim(new.descricao),'') is null or length(new.descricao)>4000 then raise exception 'Informe descrição de até 4000 caracteres'; end if;
  if new.foto_path is not null and private.current_role()='OPERADOR' then perform private.validate_operator_photo(new.production_order_id,new.foto_path); end if;
  new.created_at=now();
 elsif new.created_by<>old.created_by or new.created_at<>old.created_at or new.production_order_id<>old.production_order_id or new.id<>old.id then raise exception 'Identidade imutável' using errcode='42501'; end if;
 return new;
end $$;

create function private.guard_nc_blocking_flag() returns trigger language plpgsql set search_path='' as $$
begin
 if current_user not in ('postgres','supabase_admin','service_role') and private.current_role()='OPERADOR' then
  if (tg_op='INSERT' and not new.impeditiva) or (tg_op='UPDATE' and new.impeditiva is distinct from old.impeditiva) then raise exception 'Operador não pode remover impedimento de NC' using errcode='42501'; end if;
 end if;
 return new;
end $$;
create trigger aa_guard_nc_blocking before insert or update on public.non_conformities for each row execute function private.guard_nc_blocking_flag();
revoke all on function private.guard_nc_blocking_flag() from public,anon;
grant execute on function private.guard_nc_blocking_flag() to authenticated;

-- Narrow definer trigger: only actual transitions notify active quality profiles.
create function private.notify_quality_transition() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status is distinct from old.status and new.status in ('BLOCKED_QUALITY','AWAITING_QUALITY') then
  insert into public.notifications(user_id,tipo,titulo,mensagem,reference_type,reference_id)
  select id,new.status::text,case when new.status='BLOCKED_QUALITY' then 'OP bloqueada por qualidade' else 'OP aguardando revisão CQ' end,
  'OP '||new.numero_op||case when new.status='BLOCKED_QUALITY' then ' requer tratamento de não conformidade.' else ' foi enviada ao Controle de Qualidade.' end,'production_orders',new.id
  from public.profiles where ativo and role='QUALIDADE';
 end if;
 return new;
end $$;
create trigger notify_quality_transition after update on public.production_orders for each row execute function private.notify_quality_transition();
revoke all on function private.notify_quality_transition() from public,anon;

create or replace function private.block_nonconforming_order() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.conforme is false and new.bloqueia_op_se_nao_conforme then
  update public.production_orders set status='BLOCKED_QUALITY',version=version+1 where id=new.production_order_id and status='IN_PRODUCTION';
  if found and auth.uid() is not null then
   insert into public.non_conformities(codigo_nc,production_order_id,checklist_item_id,tipo,descricao,severidade,acao_imediata,impeditiva,created_by,evidencia_antes_path)
   values('NC-'||gen_random_uuid()::text,new.production_order_id,new.id,'CHECKLIST','Item: '||new.item||'. '||coalesce(new.observacao,''),'ALTA','OP bloqueada automaticamente; aguardar CQ.',true,auth.uid(),new.foto_path);
  end if;
 end if;
 return new;
end $$;

-- Role and row authorization are checked inside every RPC, independently of web routes.
create function public.operator_start_order(order_id uuid,expected_version integer) returns void language plpgsql security invoker set search_path='' as $$
declare o public.production_orders; begin
 if private.current_role() is distinct from 'OPERADOR' then raise exception 'Acesso exclusivo de OPERADOR ativo' using errcode='42501'; end if;
 select * into o from public.production_orders where id=order_id for update;
 if o.id is null or o.version is distinct from expected_version or o.status<>'RELEASED' then raise exception 'OP indisponível, já iniciada ou alterada. Recarregue a página.' using errcode='42501'; end if;
 update public.production_orders set status='IN_PRODUCTION',operador_responsavel_id=coalesce(operador_responsavel_id,auth.uid()) where id=order_id;
end $$;

create function public.operator_save_measure(order_id uuid,item_id uuid,expected_updated_at timestamptz,payload jsonb) returns void language plpgsql security invoker set search_path='' as $$
declare c public.production_order_checklist; begin
 if private.current_role() is distinct from 'OPERADOR' then raise exception 'Acesso exclusivo de OPERADOR ativo' using errcode='42501'; end if;
 perform 1 from public.production_orders where id=order_id and status='IN_PRODUCTION' for update;
 if not found then raise exception 'Medição exige OP acessível em produção' using errcode='42501'; end if;
 select * into c from public.production_order_checklist where id=item_id and production_order_id=order_id for update;
 if c.id is null or c.updated_at is distinct from expected_updated_at then raise exception 'Item indisponível ou medição alterada. Recarregue antes de salvar.' using errcode='42501'; end if;
 if payload is null or jsonb_typeof(payload)<>'object' or exists(select 1 from jsonb_object_keys(payload) k where k not in ('valor','observacao','foto_path')) then raise exception 'Campos de medição inválidos' using errcode='42501'; end if;
 update public.production_order_checklist set
 valor_numero=case when c.tipo_resposta='NUMBER' then (payload->>'valor')::numeric else null end,
 resposta_boolean=case when c.tipo_resposta='BOOLEAN' then (payload->>'valor')::boolean else null end,
 resposta_texto=case when c.tipo_resposta='TEXT' then nullif(trim(payload->>'valor'),'') else null end,
 resposta_select=case when c.tipo_resposta='SELECT' then payload->>'valor' else null end,
 foto_path=nullif(payload->>'foto_path',''),observacao=nullif(trim(payload->>'observacao'),'') where id=c.id;
 -- Guard calculates conformity and stamps identity; AFTER trigger creates NC and notification atomically.
end $$;

create function public.operator_add_note(order_id uuid,payload jsonb) returns uuid language plpgsql security invoker set search_path='' as $$
declare result uuid; begin
 if private.current_role() is distinct from 'OPERADOR' then raise exception 'Acesso exclusivo de OPERADOR ativo' using errcode='42501'; end if;
 if payload is null or jsonb_typeof(payload)<>'object' or exists(select 1 from jsonb_object_keys(payload) k where k not in ('tipo','descricao','tempo_minutos','quantidade','unidade','foto_path')) then raise exception 'Campos de apontamento inválidos' using errcode='42501'; end if;
 if payload->>'tipo' not in ('OBSERVACAO','PARADA','PERDA','AJUSTE','RETRABALHO','MANUTENCAO','SEGURANCA') or payload->>'tipo' is null then raise exception 'Tipo de apontamento inválido'; end if;
 if length(coalesce(payload->>'unidade',''))>20 then raise exception 'Unidade deve ter até 20 caracteres'; end if;
 insert into public.production_notes(production_order_id,tipo,descricao,tempo_minutos,quantidade,unidade,foto_path,created_by)
 values(order_id,(payload->>'tipo')::public.note_type,trim(payload->>'descricao'),nullif(payload->>'tempo_minutos','')::numeric,nullif(payload->>'quantidade','')::numeric,nullif(trim(payload->>'unidade'),''),nullif(payload->>'foto_path',''),auth.uid()) returning id into result;
 return result;
end $$;

create function public.operator_submit_order(order_id uuid,expected_version integer,produced numeric,lost numeric,final_note text) returns void language plpgsql security invoker set search_path='' as $$
declare o public.production_orders; begin
 if private.current_role() is distinct from 'OPERADOR' then raise exception 'Acesso exclusivo de OPERADOR ativo' using errcode='42501'; end if;
 select * into o from public.production_orders where id=order_id for update;
 if o.id is null or o.status<>'IN_PRODUCTION' or o.version is distinct from expected_version then raise exception 'OP indisponível ou alterada. Recarregue antes de enviar.' using errcode='42501'; end if;
 if length(coalesce(final_note,''))>4000 then raise exception 'Observação deve ter até 4000 caracteres'; end if;
 update public.production_orders set quantidade_produzida=produced,quantidade_perdida=lost,observacao_final=nullif(trim(final_note),''),status='AWAITING_QUALITY' where id=order_id;
end $$;
revoke all on function public.operator_start_order(uuid,integer),public.operator_save_measure(uuid,uuid,timestamptz,jsonb),public.operator_add_note(uuid,jsonb),public.operator_submit_order(uuid,integer,numeric,numeric,text) from public,anon;
grant execute on function public.operator_start_order(uuid,integer),public.operator_save_measure(uuid,uuid,timestamptz,jsonb),public.operator_add_note(uuid,jsonb),public.operator_submit_order(uuid,integer,numeric,numeric,text) to authenticated;
commit;
