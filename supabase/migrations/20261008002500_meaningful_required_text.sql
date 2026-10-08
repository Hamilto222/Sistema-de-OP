begin;
-- PostgreSQL trim() alone removes spaces, not tabs/newlines. Keep backend and Zod aligned.
create function private.enforce_meaningful_text() returns trigger
language plpgsql set search_path='' as $$
declare fields text[]; field text; row_data jsonb:=to_jsonb(new); begin
 if current_user in ('postgres','supabase_admin','service_role') then return new; end if;
 case tg_table_name
 when 'production_orders' then
  fields:=array['numero_op','lote','unidade'];
  if new.status='FINALIZED' then fields:=fields||array['empresa_nome']; end if;
  if new.status='REOPENED' then fields:=fields||array['motivo_reabertura']; end if;
  if new.status='BLOCKED_QUALITY' then fields:=fields||array['motivo_bloqueio']; end if;
  if tg_op='UPDATE' and old.status='BLOCKED_QUALITY' and new.status in ('IN_PRODUCTION','AWAITING_QUALITY') then
   fields:=fields||array['motivo_retorno_cq'];
  end if;
 when 'production_order_checklist' then
  fields:=array['item'];
  if new.data_medicao is not null and new.tipo_resposta='TEXT' then fields:=fields||array['resposta_texto']; end if;
  if new.conforme is false then fields:=fields||array['observacao']; end if;
 when 'production_notes' then fields:=array['descricao'];
 when 'non_conformities' then
  fields:=array['descricao'];
  if new.status='CLOSED' then fields:=fields||array['acao_imediata','observacao_cq']; end if;
  if new.status='CANCELLED' then fields:=fields||array['observacao_cq']; end if;
 end case;
 foreach field in array fields loop
  if coalesce(row_data->>field,'') !~ '[^[:space:]]' then
   raise exception 'Informe texto não vazio para %',field using errcode='P0001';
  end if;
 end loop;
 return new;
end $$;
-- Run after the business guards have calculated conformity/status and stamped identity.
create trigger zz_meaningful_text before insert or update on public.production_orders
 for each row execute function private.enforce_meaningful_text();
create trigger zz_meaningful_text before insert or update on public.production_order_checklist
 for each row execute function private.enforce_meaningful_text();
create trigger zz_meaningful_text before insert or update on public.production_notes
 for each row execute function private.enforce_meaningful_text();
create trigger zz_meaningful_text before insert or update on public.non_conformities
 for each row execute function private.enforce_meaningful_text();
revoke all on function private.enforce_meaningful_text() from public,anon,authenticated;
commit;
