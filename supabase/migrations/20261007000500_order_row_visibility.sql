begin;
-- Authorize the row's values directly. Looking the OP up by id in a STABLE
-- function cannot see a newly inserted row during INSERT ... RETURNING.
create function private.can_read_order(order_state public.order_status, assigned_operator uuid, order_line uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p where p.id=auth.uid() and p.ativo and (
 p.role in ('ADMIN','PCP') or
 (p.role='QUALIDADE' and order_state not in ('DRAFT','PREPARING')) or
 (p.role='OPERADOR' and order_state not in ('DRAFT','PREPARING','CANCELLED') and (
 assigned_operator=p.id or (order_line=p.production_line_id and exists(select 1 from public.production_lines l where l.id=p.production_line_id and l.ativa))
 ))));
$$;
create or replace function private.can_access_order(order_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.production_orders o where o.id=order_id and private.can_read_order(o.status,o.operador_responsavel_id,o.linha_id));
$$;
drop policy orders_read on public.production_orders;
create policy orders_read on public.production_orders for select to authenticated
 using (private.can_read_order(status,operador_responsavel_id,linha_id));
drop policy orders_update on public.production_orders;
create policy orders_update on public.production_orders for update to authenticated
 using (private.can_read_order(status,operador_responsavel_id,linha_id))
 with check (private.can_read_order(status,operador_responsavel_id,linha_id));
revoke all on function private.can_read_order(public.order_status,uuid,uuid) from public,anon;
grant execute on function private.can_read_order(public.order_status,uuid,uuid) to authenticated,service_role;
commit;
