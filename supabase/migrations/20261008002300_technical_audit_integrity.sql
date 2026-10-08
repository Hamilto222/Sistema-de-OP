begin;
-- Original documents are immutable too. Replacing a draft means uploading a NEW object.
drop policy op_originals_update on storage.objects;
create or replace function private.can_write_object(bucket text, path text)
returns boolean language sql stable security definer set search_path='' as $$
 select private.can_access_order(private.storage_order_id(path))
 and path ~ '^[0-9a-fA-F-]{36}/[A-Za-z0-9][A-Za-z0-9._-]{0,199}\.(pdf|jpg|jpeg|png|webp)$'
 and case
 when bucket='final-reports' then path ~ '\.pdf$' and private.current_role() in ('ADMIN','PCP')
  and exists(select 1 from public.final_reports r join public.production_orders o on o.id=r.production_order_id
   where r.path=$2 and r.status='PENDING' and o.status='FINALIZED' and o.version=r.order_version)
 when bucket='op-originals' then path ~ '\.pdf$' and private.current_role() in ('ADMIN','PCP')
  and private.order_in_state(private.storage_order_id(path),array['DRAFT','PREPARING']::public.order_status[])
 when bucket='operator-evidence' then path ~ '\.(jpg|jpeg|png|webp)$' and private.current_role() in ('ADMIN','OPERADOR')
  and private.order_in_state(private.storage_order_id(path),array['IN_PRODUCTION']::public.order_status[])
 when bucket='quality-evidence' then private.current_role() in ('ADMIN','QUALIDADE') and (
  private.order_in_state(private.storage_order_id(path),array['RELEASED','IN_PRODUCTION','AWAITING_QUALITY','BLOCKED_QUALITY']::public.order_status[])
  or (private.order_in_state(private.storage_order_id(path),array['AWAITING_PCP']::public.order_status[])
   and exists(select 1 from public.non_conformities n where n.production_order_id=private.storage_order_id(path)
    and not n.impeditiva and n.status not in ('CLOSED','CANCELLED'))))
 else false end;
$$;
-- Preserve industrial history, including during a reopened cycle.
revoke delete on public.production_orders,public.production_order_checklist,public.production_notes from authenticated;

create function private.enforce_checklist_integrity() returns trigger language plpgsql set search_path='' as $$
declare o public.production_orders; r public.app_role:=private.current_role(); definitions text[]:=array['template_item_id','ordem','grupo','item','descricao','tipo_resposta','unidade','valor_minimo','valor_maximo','obrigatorio','momento','requer_revisao_cq','bloqueia_op_se_nao_conforme','configuracao']; begin
 if current_user in ('postgres','supabase_admin','service_role') then return new; end if;
 select * into o from public.production_orders where id=new.production_order_id for update;
 if o.id is null or r is null then raise exception 'OP não acessível' using errcode='42501'; end if;
 if tg_op='INSERT' then
  if o.status not in ('DRAFT','PREPARING') then raise exception 'Definições só podem ser preparadas antes da liberação' using errcode='42501'; end if;
  if new.medido_por is not null or new.data_medicao is not null or new.conforme is not null or new.valor_numero is not null
   or new.resposta_texto is not null or new.resposta_boolean is not null or new.resposta_select is not null or new.foto_path is not null
   or new.observacao is not null or new.revisado_cq or new.revisado_por is not null or new.data_revisao is not null
   then raise exception 'Snapshot deve nascer sem medição ou revisão' using errcode='42501'; end if;
 else
  if o.status not in ('DRAFT','PREPARING') and exists(select 1 from unnest(definitions) field where to_jsonb(new)->field is distinct from to_jsonb(old)->field)
   then raise exception 'Definição do checklist liberado é imutável' using errcode='42501'; end if;
  if r='ADMIN' then
   perform private.assert_columns(to_jsonb(old),to_jsonb(new),definitions||array['revisado_cq']);
  end if;
 end if;
 return new;
end $$;
create trigger a0_checklist_integrity before insert or update on public.production_order_checklist for each row execute function private.enforce_checklist_integrity();
-- Reuse the existing definition validator for the copied snapshot as well as its template.
create trigger a1_validate_snapshot before insert or update on public.production_order_checklist for each row execute function private.validate_template_item();

create function private.validate_order_release() returns trigger language plpgsql set search_path='' as $$
begin
 if current_user in ('postgres','supabase_admin','service_role') then return new; end if;
 if new.status='RELEASED' and new.status is distinct from old.status then
  if private.storage_order_id(new.pdf_original_path) is distinct from new.id or not exists(
   select 1 from storage.objects where bucket_id='op-originals' and name=new.pdf_original_path
    and metadata->>'mimetype'='application/pdf' and (metadata->>'size')::bigint between 1 and 20971520)
   then raise exception 'Liberação exige PDF privado existente e vinculado à própria OP'; end if;
 end if;
 return new;
end $$;
create trigger a0_validate_release before update on public.production_orders for each row execute function private.validate_order_release();

-- Validate edits as well as inserts; null/empty descriptions cannot bypass the backend.
alter table public.production_notes add constraint notes_payload_valid check(length(trim(descricao)) between 1 and 4000 and length(coalesce(unidade,''))<=20);
create index notifications_user_date_idx on public.notifications(user_id,created_at desc,id);
create index nc_closed_by_idx on public.non_conformities(encerrado_por);
create index final_reports_created_by_idx on public.final_reports(created_by);
create index final_reports_completed_by_idx on public.final_reports(completed_by);
revoke all on function private.enforce_checklist_integrity(),private.validate_order_release() from public,anon,authenticated;
commit;
