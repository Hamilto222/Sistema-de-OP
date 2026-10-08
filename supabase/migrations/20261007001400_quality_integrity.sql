begin;
alter table public.production_orders drop constraint orders_finalized_check;
alter table public.production_orders add constraint orders_finalized_check check(status<>'FINALIZED' or (aprovacao_cq is not distinct from 'APPROVED'::public.quality_decision and aprovacao_pcp is true and fim_producao is not null));
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
 if new.responsavel_cq_id is distinct from old.responsavel_cq_id or new.data_aprovacao_cq is distinct from old.data_aprovacao_cq or new.data_envio_cq is distinct from old.data_envio_cq then raise exception 'Autoria e horários CQ são controlados pelo banco' using errcode='42501'; end if;
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
  if new.status='IN_PRODUCTION' then if new.inicio_producao is null then new.inicio_producao=now(); end if; new.fim_producao=null; new.data_envio_cq=null; end if;
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
 elsif r='QUALIDADE' or (r='ADMIN' and (new.revisado_cq is distinct from old.revisado_cq or new.revisado_por is distinct from old.revisado_por or new.data_revisao is distinct from old.data_revisao)) then
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


create or replace function public.pcp_dashboard() returns jsonb language plpgsql security invoker set search_path='' as $$
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
 'ncs_abertas',(select count(*) from public.non_conformities where status not in ('CLOSED','CANCELLED'))) into result from public.production_orders;
 return result;
end $$;
create or replace function private.can_write_object(bucket text, path text) returns boolean language sql stable security definer set search_path='' as $$
 select private.can_access_order(private.storage_order_id(path)) and (
 private.current_role()='ADMIN' or
 (bucket='op-originals' and private.current_role()='PCP' and private.order_in_state(private.storage_order_id(path),array['DRAFT','PREPARING']::public.order_status[])) or
 (bucket='operator-evidence' and private.current_role()='OPERADOR' and private.order_in_state(private.storage_order_id(path),array['IN_PRODUCTION']::public.order_status[])) or
 (bucket='quality-evidence' and private.current_role()='QUALIDADE' and private.order_in_state(private.storage_order_id(path),array['RELEASED','IN_PRODUCTION','AWAITING_QUALITY','BLOCKED_QUALITY']::public.order_status[]))
 );
$$;
create function public.quality_nc_document(order_id uuid,nc_id uuid,which_document text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare path text; bucket text; begin
 if private.current_role() is null or private.current_role() not in ('ADMIN','QUALIDADE') then raise exception 'Acesso exclusivo de Qualidade ou ADMIN ativo' using errcode='42501'; end if;
 if which_document not in ('antes','depois') then raise exception 'Documento inválido'; end if;
 select case when which_document='antes' then evidencia_antes_path else evidencia_depois_path end into path from public.non_conformities where id=nc_id and production_order_id=order_id;
 if path is null then raise exception 'Evidência indisponível'; end if;
 select bucket_id into bucket from storage.objects where name=path and bucket_id in ('operator-evidence','quality-evidence') order by bucket_id limit 1;
 if bucket is null then raise exception 'Evidência indisponível'; end if;
 return jsonb_build_object('path',path,'bucket',bucket);
end $$;
revoke all on function public.quality_nc_document(uuid,uuid,text) from public,anon;
grant execute on function public.quality_nc_document(uuid,uuid,text) to authenticated;
commit;
