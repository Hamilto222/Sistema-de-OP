begin;
create or replace function private.has_meaningful_text(value text) returns boolean language sql immutable set search_path='' as $$
 select coalesce(length(btrim(value,E' \t\n\r\f\013'||U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'))>0,false);
$$;
create function public.quality_close_correction(nc_id uuid,expected_version integer,expected_updated_at timestamptz,observation text) returns void language plpgsql set search_path='' as $$
declare n public.non_conformities; o public.production_orders;begin
 if private.current_role() is null or private.current_role() not in ('ADMIN','QUALIDADE') then raise exception 'Aprovação exclusiva de CQ/ADMIN ativo' using errcode='42501';end if;
 select * into n from public.non_conformities where id=nc_id;
 if n.id is null then raise exception 'NC não acessível' using errcode='42501';end if;
 select * into o from public.production_orders where id=n.production_order_id for update;
 select * into n from public.non_conformities where id=nc_id for update;
 if o.version<>expected_version or n.updated_at is distinct from expected_updated_at or not n.impeditiva or n.checklist_item_id is null or n.status not in ('IN_TREATMENT','AWAITING_QUALITY') then raise exception 'NC/OP indisponível ou alterada. Recarregue.' using errcode='42501';end if;
 if not private.has_meaningful_text(observation) or length(observation)>4000 then raise exception 'Informe observação CQ de até 4000 caracteres';end if;
 update public.non_conformities set status='CLOSED',observacao_cq=observation where id=nc_id;
end $$;
revoke all on function public.quality_close_correction(uuid,integer,timestamptz,text) from public,anon;
grant execute on function public.quality_close_correction(uuid,integer,timestamptz,text) to authenticated;
-- References must point to this NC's item, and only trusted triggers stamp them.
alter table public.non_conformities add constraint nc_origin_item_fk foreign key(origin_measurement_id,checklist_item_id) references public.checklist_measurements(id,checklist_item_id),
 add constraint nc_correction_item_fk foreign key(correction_measurement_id,checklist_item_id) references public.checklist_measurements(id,checklist_item_id);
create function private.protect_nc_measurement_refs() returns trigger language plpgsql set search_path='' as $$
begin
 if current_user not in ('postgres','supabase_admin','service_role') and tg_op='INSERT' and (new.origin_measurement_id is not null or new.correction_measurement_id is not null) then raise exception 'Referências de medição são controladas pelo banco' using errcode='42501';end if;
 return new;
end $$;
create trigger a0_protect_nc_measurement_refs before insert on public.non_conformities for each row execute function private.protect_nc_measurement_refs();
revoke all on function private.protect_nc_measurement_refs() from public,anon,authenticated;
commit;
