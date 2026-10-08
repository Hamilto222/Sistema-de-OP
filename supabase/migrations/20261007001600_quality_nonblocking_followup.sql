-- Permite concluir NC não impeditiva já aberta após aprovação CQ, sem nova NC ou reclassificação.
begin;
create or replace function private.guard_nc() returns trigger language plpgsql set search_path='' as $$
declare r public.app_role:=private.current_role(); o public.production_orders; begin
 if current_user in ('postgres','supabase_admin','service_role') then return new; end if;
 if r is null then raise exception 'Perfil inativo' using errcode='42501'; end if;
 select * into o from public.production_orders where id=new.production_order_id for update;
 if o.id is null then raise exception 'OP não disponível para tratamento de NC' using errcode='42501'; end if;
 if o.status='AWAITING_PCP' and tg_op='UPDATE' and r in ('ADMIN','QUALIDADE') then
  if old.impeditiva or new.impeditiva then raise exception 'Após aprovação, somente tratamento de NC já não impeditiva' using errcode='42501'; end if;
 elsif o.status not in ('RELEASED','IN_PRODUCTION','BLOCKED_QUALITY','AWAITING_QUALITY') then raise exception 'OP não disponível para tratamento de NC' using errcode='42501'; end if;
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

create or replace function private.can_write_object(bucket text, path text) returns boolean language sql stable security definer set search_path='' as $$
 select private.can_access_order(private.storage_order_id(path)) and (
 private.current_role()='ADMIN' or
 (bucket='op-originals' and private.current_role()='PCP' and private.order_in_state(private.storage_order_id(path),array['DRAFT','PREPARING']::public.order_status[])) or
 (bucket='operator-evidence' and private.current_role()='OPERADOR' and private.order_in_state(private.storage_order_id(path),array['IN_PRODUCTION']::public.order_status[])) or
 (bucket='quality-evidence' and private.current_role()='QUALIDADE' and private.order_in_state(private.storage_order_id(path),array['RELEASED','IN_PRODUCTION','AWAITING_QUALITY','BLOCKED_QUALITY']::public.order_status[]) or (bucket='quality-evidence' and private.current_role()='QUALIDADE' and private.order_in_state(private.storage_order_id(path),array['AWAITING_PCP']::public.order_status[]) and exists(select 1 from public.non_conformities n where n.production_order_id=private.storage_order_id(path) and not n.impeditiva and n.status not in ('CLOSED','CANCELLED'))))
 );
$$;

commit;
