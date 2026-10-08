begin;
-- Preserve legacy PRODUCAO history; new operator notes use the seven supported types.
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
  if private.current_role()='OPERADOR' and new.tipo not in ('OBSERVACAO','PARADA','PERDA','AJUSTE','RETRABALHO','MANUTENCAO','SEGURANCA') then raise exception 'Tipo de apontamento não autorizado'; end if;
  if length(coalesce(new.unidade,''))>20 then raise exception 'Unidade deve ter até 20 caracteres'; end if;
  new.created_at=now();
 elsif new.created_by<>old.created_by or new.created_at<>old.created_at or new.production_order_id<>old.production_order_id or new.id<>old.id then raise exception 'Identidade imutável' using errcode='42501'; end if;
 return new;
end $$;

commit;
