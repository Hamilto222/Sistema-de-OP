begin;
create function private.current_role() returns public.app_role language sql stable security definer set search_path='' as $$
 select role from public.profiles where id=auth.uid() and ativo;
$$;
create function private.is_active() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=auth.uid() and ativo);
$$;
create function private.can_access_order(order_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists (
 select 1 from public.production_orders o join public.profiles p on p.id=auth.uid() and p.ativo
 where o.id=order_id and (
 p.role in ('ADMIN','PCP') or
 (p.role='QUALIDADE' and o.status not in ('DRAFT','PREPARING')) or
 (p.role='OPERADOR' and o.status not in ('DRAFT','PREPARING','CANCELLED') and (
 o.operador_responsavel_id=p.id or (o.linha_id=p.production_line_id and exists(select 1 from public.production_lines l where l.id=p.production_line_id and l.ativa))
 ))));
$$;
create function private.order_in_state(order_id uuid, states public.order_status[]) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.production_orders where id=order_id and status=any(states));
$$;
create function private.operator_is_active(user_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=user_id and role='OPERADOR' and ativo);
$$;
create function private.assert_columns(before_row jsonb, after_row jsonb, allowed text[]) returns void language plpgsql set search_path='' as $$
begin
 if exists(select 1 from jsonb_each(after_row) e where e.value is distinct from before_row->e.key and not (e.key=any(allowed))) then
 raise exception 'Alteração de campo não permitida para este perfil' using errcode='42501';
 end if;
end $$;

create function private.guard_order() returns trigger language plpgsql set search_path='' as $$
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
  if old.status in ('DRAFT','PREPARING') then allowed=allowed||array['numero_op','produto_id','lote','linha_id','quantidade_planejada','unidade','prioridade','data_programada','operador_responsavel_id','pdf_original_path']; end if;
  if old.status='AWAITING_PCP' then allowed=allowed||array['aprovacao_pcp']; end if;
  perform private.assert_columns(to_jsonb(old),to_jsonb(new),allowed);
 elsif r='QUALIDADE' then
  perform private.assert_columns(to_jsonb(old),to_jsonb(new),array['status','aprovacao_cq']);
  if old.status not in ('RELEASED','IN_PRODUCTION','AWAITING_QUALITY','BLOCKED_QUALITY') then raise exception 'OP não está disponível para alteração de qualidade' using errcode='42501'; end if;
 elsif r='OPERADOR' then
  perform private.assert_columns(to_jsonb(old),to_jsonb(new),array['status','quantidade_produzida','quantidade_perdida','observacao_final','assinatura_operador_path']);
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
 if new.status='IN_PRODUCTION' and old.status in ('RELEASED','REOPENED') then new.inicio_producao=now(); end if;
 if new.status='AWAITING_QUALITY' and old.status<>new.status then
  if exists(select 1 from public.production_order_checklist where production_order_id=new.id and obrigatorio and (data_medicao is null or conforme is null)) then raise exception 'Checklist obrigatório incompleto'; end if;
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
create trigger a_guard_order before insert or update on public.production_orders for each row execute function private.guard_order();

create function private.guard_checklist() returns trigger language plpgsql set search_path='' as $$
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
   if new.valor_numero is null or new.resposta_texto is not null or new.resposta_boolean is not null or new.resposta_select is not null or new.foto_path is not null then raise exception 'Resposta numérica inválida'; end if;
   new.conforme=(new.valor_minimo is null or new.valor_numero>=new.valor_minimo) and (new.valor_maximo is null or new.valor_numero<=new.valor_maximo);
  elsif new.tipo_resposta='BOOLEAN' then
   if new.resposta_boolean is null or new.valor_numero is not null or new.resposta_texto is not null or new.resposta_select is not null or new.foto_path is not null then raise exception 'Resposta booleana inválida'; end if;
   new.conforme=new.resposta_boolean;
  elsif new.tipo_resposta='TEXT' then
   if nullif(trim(new.resposta_texto),'') is null or new.valor_numero is not null or new.resposta_boolean is not null or new.resposta_select is not null or new.foto_path is not null then raise exception 'Resposta textual inválida'; end if;
   new.conforme=true;
  elsif new.tipo_resposta='PHOTO' then
   if new.foto_path is null or split_part(new.foto_path,'/',1)<>new.production_order_id::text or new.valor_numero is not null or new.resposta_texto is not null or new.resposta_boolean is not null or new.resposta_select is not null then raise exception 'Foto inválida'; end if;
   new.conforme=true;
  else
   if new.resposta_select is null or not coalesce((new.configuracao->'opcoes') ? new.resposta_select,false) or new.valor_numero is not null or new.resposta_texto is not null or new.resposta_boolean is not null or new.foto_path is not null then raise exception 'Seleção inválida'; end if;
   new.conforme=coalesce((new.configuracao->'opcoes_conformes') ? new.resposta_select,true);
  end if;
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
create trigger a_guard_checklist before insert or update or delete on public.production_order_checklist for each row execute function private.guard_checklist();

create function private.guard_nc() returns trigger language plpgsql set search_path='' as $$
declare r public.app_role:=private.current_role(); o public.production_orders; begin
 if current_user in ('postgres','supabase_admin','service_role') then return new; end if;
 select * into o from public.production_orders where id=new.production_order_id for update;
 if o.id is null or o.status in ('FINALIZED','CANCELLED') then raise exception 'OP não disponível' using errcode='42501'; end if;
 if new.checklist_item_id is not null and not exists(select 1 from public.production_order_checklist where id=new.checklist_item_id and production_order_id=new.production_order_id) then raise exception 'Item de checklist pertence a outra OP'; end if;
 if tg_op='INSERT' then
  if new.created_by is distinct from auth.uid() then raise exception 'Autoria inválida' using errcode='42501'; end if;
  if r='OPERADOR' and (o.status not in ('IN_PRODUCTION','BLOCKED_QUALITY') or new.status<>'ABERTA' or new.aprovado_cq is not null or new.observacao_cq is not null or new.data_fechamento is not null) then raise exception 'Operador só pode abrir NC durante execução' using errcode='42501'; end if;
  new.created_at=now(); new.updated_at=now(); new.data_abertura=now();
 else
  if new.id<>old.id or new.production_order_id<>old.production_order_id or new.created_by<>old.created_by or new.created_at<>old.created_at or new.data_abertura<>old.data_abertura then raise exception 'Identidade e abertura imutáveis' using errcode='42501'; end if;
  if r='OPERADOR' then
   if old.created_by<>auth.uid() or old.status not in ('ABERTA','EM_TRATAMENTO') or o.status not in ('IN_PRODUCTION','BLOCKED_QUALITY') then raise exception 'NC indisponível ao operador' using errcode='42501'; end if;
   perform private.assert_columns(to_jsonb(old),to_jsonb(new),array['acao_imediata','evidencia_antes_path','evidencia_depois_path','status']);
   if new.status not in ('ABERTA','EM_TRATAMENTO','AGUARDANDO_CQ') then raise exception 'Fechamento exige CQ' using errcode='42501'; end if;
  end if;
 end if;
 if r not in ('ADMIN','QUALIDADE','OPERADOR') or r is null then raise exception 'Perfil não autorizado' using errcode='42501'; end if;
 if new.status='FECHADA' then new.data_fechamento=now(); end if;
 return new;
end $$;
create trigger a_guard_nc before insert or update on public.non_conformities for each row execute function private.guard_nc();

create function private.guard_note() returns trigger language plpgsql set search_path='' as $$
begin
 if current_user in ('postgres','supabase_admin','service_role') then return new; end if;
 perform 1 from public.production_orders where id=new.production_order_id for update;
 if not found then raise exception 'OP não acessível' using errcode='42501'; end if;
 if tg_op='INSERT' then
  if new.created_by is distinct from auth.uid() then raise exception 'Autoria inválida' using errcode='42501'; end if;
  if private.current_role()='OPERADOR' and not private.order_in_state(new.production_order_id,array['IN_PRODUCTION']::public.order_status[]) then raise exception 'Apontamento exige produção em andamento' using errcode='42501'; end if;
  new.created_at=now();
 elsif new.created_by<>old.created_by or new.created_at<>old.created_at or new.production_order_id<>old.production_order_id or new.id<>old.id then raise exception 'Identidade imutável' using errcode='42501'; end if;
 return new;
end $$;
create trigger a_guard_note before insert or update on public.production_notes for each row execute function private.guard_note();

create function private.guard_notification() returns trigger language plpgsql set search_path='' as $$
begin
 if current_user not in ('postgres','supabase_admin','service_role') and private.current_role() is distinct from 'ADMIN' then
 perform private.assert_columns(to_jsonb(old),to_jsonb(new),array['lida']);
 end if;
 return new;
end $$;
create trigger a_guard_notification before update on public.notifications for each row execute function private.guard_notification();

-- Atomic, append-only audit. Every changed field records the actual authenticated actor.
create function private.audit_change() returns trigger language plpgsql security definer set search_path='' as $$
declare before_row jsonb; after_row jsonb; row_data jsonb; op_id uuid; field_name text; begin
 before_row=case when tg_op='INSERT' then '{}'::jsonb else to_jsonb(old) end;
 after_row=case when tg_op='DELETE' then '{}'::jsonb else to_jsonb(new) end;
 row_data=case when tg_op='DELETE' then before_row else after_row end;
 if tg_table_name='production_orders' and tg_op<>'DELETE' then op_id=(row_data->>'id')::uuid;
 elsif tg_table_name in ('production_order_checklist','production_notes','non_conformities') then op_id=(row_data->>'production_order_id')::uuid;
 end if;
 for field_name in select key from jsonb_each(before_row||after_row) loop
 if field_name not in ('updated_at','version') and before_row->field_name is distinct from after_row->field_name then
 insert into public.audit_logs(production_order_id,entity,entity_id,action,field,old_value,new_value,user_id)
 values(op_id,tg_table_name,(row_data->>'id')::uuid,tg_op,field_name,before_row->field_name,after_row->field_name,auth.uid());
 end if; end loop;
 if tg_op='DELETE' then return old; end if; return new;
end $$;
do $$ declare t text; begin
 foreach t in array array['profiles','production_lines','products','checklist_templates','checklist_template_items','production_orders','production_order_checklist','production_notes','non_conformities'] loop
 execute format('create trigger audit_change after insert or update or delete on public.%I for each row execute function private.audit_change()',t);
 end loop;
end $$;

create function private.reset_reviews_on_reopen() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.status='FINALIZED' and new.status='REOPENED' then
 update public.production_order_checklist set revisado_cq=false,revisado_por=null,data_revisao=null where production_order_id=new.id;
 end if; return new;
end $$;
create trigger reset_reviews after update on public.production_orders for each row execute function private.reset_reviews_on_reopen();

-- Nonconforming blocking measurements lock the OP atomically, independently of frontend.
create function private.block_nonconforming_order() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.conforme is false and new.bloqueia_op_se_nao_conforme then
 update public.production_orders set status='BLOCKED_QUALITY', version=version+1
 where id=new.production_order_id and status='IN_PRODUCTION';
 end if;
 return new;
end $$;
create trigger block_nonconforming after insert or update on public.production_order_checklist for each row execute function private.block_nonconforming_order();

-- Never expose raw audit writes, even to application ADMIN.
revoke all on all tables in schema public from anon;
grant select,insert,update,delete on all tables in schema public to authenticated;
revoke insert,update,delete on public.audit_logs from authenticated;

do $$ declare t text; begin
 foreach t in array array['profiles','production_lines','products','checklist_templates','checklist_template_items','production_orders','production_order_checklist','production_notes','non_conformities','audit_logs','notifications'] loop
 execute format('alter table public.%I enable row level security',t);
 end loop;
end $$;
create policy profiles_read on public.profiles for select to authenticated using (
 id=auth.uid() or private.current_role() in ('ADMIN','PCP','QUALIDADE')
);
create policy profiles_admin on public.profiles for all to authenticated using (private.current_role()='ADMIN') with check (private.current_role()='ADMIN');

do $$ declare t text; begin
 foreach t in array array['production_lines','products','checklist_templates','checklist_template_items'] loop
 execute format('create policy catalog_read on public.%I for select to authenticated using (private.is_active())',t);
 execute format('create policy catalog_write on public.%I for all to authenticated using (private.current_role() in (''ADMIN'',''PCP'')) with check (private.current_role() in (''ADMIN'',''PCP''))',t);
 end loop;
end $$;
create policy orders_read on public.production_orders for select to authenticated using (private.can_access_order(id));
create policy orders_insert on public.production_orders for insert to authenticated with check (private.current_role() in ('ADMIN','PCP'));
create policy orders_update on public.production_orders for update to authenticated using (private.can_access_order(id)) with check (private.can_access_order(id));
create policy orders_delete on public.production_orders for delete to authenticated using (private.current_role()='ADMIN');
create policy checklist_read on public.production_order_checklist for select to authenticated using (private.can_access_order(production_order_id));
create policy checklist_insert on public.production_order_checklist for insert to authenticated with check (private.current_role() in ('ADMIN','PCP') and private.can_access_order(production_order_id));
create policy checklist_update on public.production_order_checklist for update to authenticated using (private.can_access_order(production_order_id)) with check (private.can_access_order(production_order_id));
create policy checklist_delete on public.production_order_checklist for delete to authenticated using (private.current_role() in ('ADMIN','PCP') and private.can_access_order(production_order_id));
create policy notes_read on public.production_notes for select to authenticated using (private.can_access_order(production_order_id));
create policy notes_insert on public.production_notes for insert to authenticated with check (private.current_role() in ('ADMIN','OPERADOR') and private.can_access_order(production_order_id));
create policy notes_admin_update on public.production_notes for update to authenticated using (private.current_role()='ADMIN') with check (private.current_role()='ADMIN');
create policy notes_admin_delete on public.production_notes for delete to authenticated using (private.current_role()='ADMIN');
create policy nc_read on public.non_conformities for select to authenticated using (private.can_access_order(production_order_id));
create policy nc_insert on public.non_conformities for insert to authenticated with check (private.current_role() in ('ADMIN','QUALIDADE','OPERADOR') and private.can_access_order(production_order_id));
create policy nc_update on public.non_conformities for update to authenticated using (private.current_role() in ('ADMIN','QUALIDADE','OPERADOR') and private.can_access_order(production_order_id)) with check (private.current_role() in ('ADMIN','QUALIDADE','OPERADOR') and private.can_access_order(production_order_id));
create policy nc_delete on public.non_conformities for delete to authenticated using (private.current_role()='ADMIN');
create policy audit_read on public.audit_logs for select to authenticated using (
 private.current_role()='ADMIN' or (production_order_id is not null and private.can_access_order(production_order_id))
);
create policy notifications_read on public.notifications for select to authenticated using (private.is_active() and (user_id=auth.uid() or private.current_role()='ADMIN'));
create policy notifications_update on public.notifications for update to authenticated using (private.is_active() and (user_id=auth.uid() or private.current_role()='ADMIN')) with check (private.is_active() and (user_id=auth.uid() or private.current_role()='ADMIN'));
create policy notifications_insert on public.notifications for insert to authenticated with check (private.current_role()='ADMIN');
create policy notifications_delete on public.notifications for delete to authenticated using (private.current_role()='ADMIN');

revoke all on all functions in schema private from public,anon;
grant execute on all functions in schema private to authenticated;
commit;
