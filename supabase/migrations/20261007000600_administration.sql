begin;
-- Catalog maintenance belongs to ADMIN; other active profiles can consult the catalog.
do $$ declare t text; begin
 foreach t in array array['production_lines','products','checklist_templates','checklist_template_items'] loop
 execute format('drop policy catalog_write on public.%I',t);
 execute format('create policy catalog_write on public.%I for all to authenticated using (private.current_role() = ''ADMIN'') with check (private.current_role() = ''ADMIN'')',t);
 execute format('revoke delete on public.%I from authenticated',t);
 end loop;
end $$;
revoke delete on public.profiles from authenticated;

-- Retired definitions remain addressable by historical OP foreign keys.
alter table public.checklist_template_items drop constraint checklist_template_items_template_id_ordem_key;
create unique index checklist_items_active_order_idx on public.checklist_template_items(template_id,ordem) where ativo;
alter table public.checklist_templates add constraint template_nonempty check(length(trim(nome)) between 1 and 160 and length(trim(revisao)) between 1 and 40);
alter table public.products add constraint product_nonempty check(length(trim(codigo)) between 1 and 80 and length(trim(descricao)) between 1 and 1000 and length(trim(unidade)) between 1 and 20 and length(trim(revisao)) between 1 and 40);
alter table public.production_lines add constraint line_nonempty check(length(trim(nome)) between 1 and 160 and length(trim(setor)) between 1 and 160);
alter table public.profiles add constraint profile_nonempty check(length(trim(nome)) between 1 and 160);

create function private.guard_profile_admin() returns trigger language plpgsql set search_path='' as $$
begin
 if current_user in ('postgres','supabase_admin','service_role') then return new; end if;
 if new.id<>old.id or new.email<>old.email or new.created_at<>old.created_at then
 raise exception 'Identidade e e-mail são gerenciados pelo Supabase Auth' using errcode='42501'; end if;
 if old.id=auth.uid() and (not new.ativo or new.role<>'ADMIN') then
 raise exception 'Você não pode desativar ou remover seu próprio perfil ADMIN' using errcode='42501'; end if;
 return new;
end $$;
create trigger a_guard_profile_admin before update on public.profiles for each row execute function private.guard_profile_admin();

create function private.validate_template_item() returns trigger language plpgsql set search_path='' as $$
declare options jsonb; begin
 if length(trim(new.item)) not between 1 and 500 then raise exception 'Informe o item do checklist'; end if;
 if new.valor_minimo is not null and (new.valor_minimo <= '-Infinity'::numeric or new.valor_minimo >= 'Infinity'::numeric) or
    new.valor_maximo is not null and (new.valor_maximo <= '-Infinity'::numeric or new.valor_maximo >= 'Infinity'::numeric) then raise exception 'Limites devem ser finitos'; end if;
 if new.tipo_resposta<>'NUMBER' and (new.valor_minimo is not null or new.valor_maximo is not null) then raise exception 'Limites são exclusivos de respostas numéricas'; end if;
 if new.tipo_resposta='BOOLEAN' and new.configuracao ? 'resposta_conforme' and jsonb_typeof(new.configuracao->'resposta_conforme')<>'boolean' then raise exception 'Resposta conforme deve ser booleana'; end if;
 if new.tipo_resposta='SELECT' then
 options=new.configuracao->'opcoes';
 if jsonb_typeof(options) is distinct from 'array' then raise exception 'Informe opções de seleção'; end if;
 if jsonb_array_length(options) not between 1 and 100 then raise exception 'Informe entre 1 e 100 opções'; end if;
 if exists(select 1 from jsonb_array_elements(options) x where jsonb_typeof(x)<>'string' or length(trim(x #>> '{}')) not between 1 and 160) then raise exception 'Opções devem conter textos não vazios'; end if;
 if (select count(*) from jsonb_array_elements(options))<>(select count(distinct x) from jsonb_array_elements(options) x) then raise exception 'Opções duplicadas'; end if;
 if new.configuracao ? 'opcoes_conformes' then
 if jsonb_typeof(new.configuracao->'opcoes_conformes')<>'array' then raise exception 'Opções conformes inválidas'; end if;
 if exists(select 1 from jsonb_array_elements(new.configuracao->'opcoes_conformes') x where not options @> jsonb_build_array(x)) then raise exception 'Opção conforme inexistente'; end if;
 end if;
 end if;
 return new;
end $$;
create trigger a_validate_template_item before insert or update on public.checklist_template_items for each row execute function private.validate_template_item();

-- Invoker retains RLS and audited actor. Aggregate write either commits in full or rolls back.
create function public.admin_save_checklist(payload jsonb) returns uuid language plpgsql security invoker set search_path='' as $$
declare target uuid; stamp timestamptz; part jsonb; n integer; begin
 if private.current_role() is distinct from 'ADMIN' then raise exception 'Administração exige perfil ADMIN ativo' using errcode='42501'; end if;
 if jsonb_typeof(payload)<>'object' or jsonb_typeof(payload->'itens') is distinct from 'array' then raise exception 'Modelo inválido'; end if;
 n=jsonb_array_length(payload->'itens');
 if n not between 1 and 100 then raise exception 'O modelo deve ter entre 1 e 100 itens'; end if;
 if nullif(payload->>'id','') is null then
 insert into public.checklist_templates(nome,revisao,descricao,ativo)
 values(trim(payload->>'nome'),trim(payload->>'revisao'),nullif(trim(payload->>'descricao'),''),coalesce((payload->>'ativo')::boolean,true)) returning id into target;
 else
 target=(payload->>'id')::uuid;
 select updated_at into stamp from public.checklist_templates where id=target for update;
 if not found then raise exception 'Modelo não encontrado' using errcode='P0002'; end if;
 if stamp is distinct from (payload->>'updated_at')::timestamptz then raise exception 'Cadastro alterado por outra sessão. Recarregue antes de salvar.' using errcode='42501'; end if;
 update public.checklist_templates set nome=trim(payload->>'nome'),revisao=trim(payload->>'revisao'),descricao=nullif(trim(payload->>'descricao'),''),ativo=(payload->>'ativo')::boolean where id=target;
 update public.checklist_template_items set ativo=false where template_id=target and ativo;
 end if;
 for part in select value from jsonb_array_elements(payload->'itens') loop
 insert into public.checklist_template_items(template_id,ordem,grupo,item,descricao,tipo_resposta,unidade,valor_minimo,valor_maximo,obrigatorio,momento,requer_revisao_cq,bloqueia_op_se_nao_conforme,configuracao)
 values(target,(part->>'ordem')::integer,nullif(trim(part->>'grupo'),''),trim(part->>'item'),nullif(trim(part->>'descricao'),''),(part->>'tipo_resposta')::public.response_type,nullif(trim(part->>'unidade'),''),(part->>'valor_minimo')::numeric,(part->>'valor_maximo')::numeric,(part->>'obrigatorio')::boolean,(part->>'momento')::public.checklist_moment,(part->>'requer_revisao_cq')::boolean,(part->>'bloqueia_op_se_nao_conforme')::boolean,coalesce(part->'configuracao','{}'::jsonb));
 end loop;
 return target;
end $$;
revoke all on function public.admin_save_checklist(jsonb) from public,anon;
grant execute on function public.admin_save_checklist(jsonb) to authenticated;
revoke all on function private.guard_profile_admin(),private.validate_template_item() from public,anon;
grant execute on function private.guard_profile_admin(),private.validate_template_item() to authenticated;
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
   if new.valor_numero is null or new.resposta_texto is not null or new.resposta_boolean is not null or new.resposta_select is not null or new.foto_path is not null then raise exception 'Resposta numérica inválida'; end if;
   new.conforme=(new.valor_minimo is null or new.valor_numero>=new.valor_minimo) and (new.valor_maximo is null or new.valor_numero<=new.valor_maximo);
  elsif new.tipo_resposta='BOOLEAN' then
   if new.resposta_boolean is null or new.valor_numero is not null or new.resposta_texto is not null or new.resposta_select is not null or new.foto_path is not null then raise exception 'Resposta booleana inválida'; end if;
   new.conforme=new.resposta_boolean = coalesce((new.configuracao->>'resposta_conforme')::boolean,true);
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

commit;
