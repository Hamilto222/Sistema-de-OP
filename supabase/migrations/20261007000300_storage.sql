begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('op-originals','op-originals',false,20971520,array['application/pdf']),
 ('quality-evidence','quality-evidence',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf']),
 ('operator-evidence','operator-evidence',false,10485760,array['image/jpeg','image/png','image/webp']),
 ('final-reports','final-reports',false,20971520,array['application/pdf'])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

-- Every path starts with the OP UUID. Invalid names deny access rather than throwing cast errors.
create function private.storage_order_id(path text) returns uuid language plpgsql immutable set search_path='' as $$
begin
 if path !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/[^/].*$' then return null; end if;
 return split_part(path,'/',1)::uuid;
end $$;
create function private.can_write_object(bucket text, path text) returns boolean language sql stable security definer set search_path='' as $$
 select private.can_access_order(private.storage_order_id(path)) and (
 private.current_role()='ADMIN' or
 (bucket='op-originals' and private.current_role()='PCP' and private.order_in_state(private.storage_order_id(path),array['DRAFT','PREPARING']::public.order_status[])) or
 (bucket='operator-evidence' and private.current_role()='OPERADOR' and private.order_in_state(private.storage_order_id(path),array['IN_PRODUCTION']::public.order_status[])) or
 (bucket='quality-evidence' and private.current_role()='QUALIDADE' and private.order_in_state(private.storage_order_id(path),array['IN_PRODUCTION','AWAITING_QUALITY','BLOCKED_QUALITY']::public.order_status[]))
 );
$$;
create policy op_documents_read on storage.objects for select to authenticated using (
 bucket_id in ('op-originals','quality-evidence','operator-evidence','final-reports') and private.can_access_order(private.storage_order_id(name))
);
create policy op_documents_insert on storage.objects for insert to authenticated with check (
 bucket_id in ('op-originals','quality-evidence','operator-evidence','final-reports') and private.can_write_object(bucket_id,name)
);
-- Evidence is append-only; clients cannot overwrite another user's evidence or delete industrial records.
create policy op_originals_update on storage.objects for update to authenticated using (
 bucket_id='op-originals' and private.can_write_object(bucket_id,name)
) with check (bucket_id='op-originals' and private.can_write_object(bucket_id,name));
-- No client delete policy. Retention/deletion requires a separately authorized server maintenance operation.
revoke all on function private.storage_order_id(text),private.can_write_object(text,text) from public,anon;
grant execute on function private.storage_order_id(text),private.can_write_object(text,text) to authenticated;
commit;
