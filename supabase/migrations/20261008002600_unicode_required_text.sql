begin;
-- Match ECMAScript/Zod whitespace too, including non-breaking space and BOM.
create or replace function private.enforce_meaningful_text() returns trigger
language plpgsql set search_path='' as $$
declare fields text[]; field text; row_data jsonb:=to_jsonb(new);
 blank_chars constant text:=E' \t\n\r\f\013'||U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'; begin
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
  if length(btrim(coalesce(row_data->>field,''),blank_chars))=0 then
   raise exception 'Informe texto não vazio para %',field using errcode='P0001';
  end if;
 end loop;
 return new;
end $$;
commit;
