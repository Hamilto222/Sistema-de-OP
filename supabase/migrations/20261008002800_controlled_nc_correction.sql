create or replace function private.has_meaningful_text(value text) returns boolean language sql immutable set search_path='' as $$ select coalesce(length(regexp_replace(value,E'[\s\u00a0\ufeff]','','g'))>0,false) $$;
-- Controlled correction: append-only attempts, explicit CQ release and verified closure.
begin;
create table public.checklist_measurements (
 id uuid primary key default gen_random_uuid(),
 production_order_id uuid not null references public.production_orders(id),
 checklist_item_id uuid not null,
 sequence integer not null check(sequence>0),
 measurement_type public.response_type not null,
 numeric_value numeric, text_value text, boolean_value boolean, select_value text,
 unit text, minimum_value_snapshot numeric, maximum_value_snapshot numeric,
 configuration_snapshot jsonb not null default '{}'::jsonb,
 compliant boolean, observation text, evidence_path text,
 measured_by uuid references public.profiles(id), measured_at timestamptz not null,
 created_at timestamptz not null default now(),
 unique(checklist_item_id,sequence), unique(id,checklist_item_id),
 foreign key(checklist_item_id,production_order_id) references public.production_order_checklist(id,production_order_id)
);
create index measurements_order_item_idx on public.checklist_measurements(production_order_id,checklist_item_id,sequence);
create index measurements_actor_idx on public.checklist_measurements(measured_by);
create index measurements_item_order_idx on public.checklist_measurements(checklist_item_id,production_order_id);
create table public.quality_correction_releases (
 id uuid primary key default gen_random_uuid(),
 production_order_id uuid not null references public.production_orders(id),
 non_conformity_id uuid not null references public.non_conformities(id),
 order_version integer not null, released_by uuid not null references public.profiles(id),
 released_at timestamptz not null default now(), immediate_action text not null,
 quality_observation text not null, responsible_id uuid not null references public.profiles(id),
 previous_status public.order_status not null default 'BLOCKED_QUALITY',
 new_status public.order_status not null default 'IN_PRODUCTION',
 unique(production_order_id,order_version)
);
create index correction_nc_idx on public.quality_correction_releases(non_conformity_id);
create index correction_actor_idx on public.quality_correction_releases(released_by);
create index correction_responsible_idx on public.quality_correction_releases(responsible_id);
alter table public.non_conformities add column origin_measurement_id uuid references public.checklist_measurements(id),
 add column correction_measurement_id uuid references public.checklist_measurements(id);
create index nc_origin_measurement_idx on public.non_conformities(origin_measurement_id);
create index nc_correction_measurement_idx on public.non_conformities(correction_measurement_id);

-- Reconstruct persisted attempts from field audit; keep the current snapshot as a fallback.
-- No identities, times, conformity or observations are invented for legacy rows.
do $$ declare c public.production_order_checklist; e record; d jsonb; seq integer;begin
 for c in select * from public.production_order_checklist where data_medicao is not null loop
  seq:=0;
  for e in select distinct created_at from public.audit_logs where entity='production_order_checklist' and entity_id=c.id and field='data_medicao' and new_value<>'null'::jsonb order by created_at loop
   select coalesce(jsonb_object_agg(field,new_value),'{}'::jsonb) into d from
    (select distinct on(field) field,new_value from public.audit_logs where entity='production_order_checklist' and entity_id=c.id and created_at<=e.created_at order by field,created_at desc,id desc) a;
   d:=to_jsonb(c)||d;
   if d->>'data_medicao' is null then continue;end if;
   seq:=seq+1;
   insert into public.checklist_measurements(production_order_id,checklist_item_id,sequence,measurement_type,numeric_value,text_value,boolean_value,select_value,unit,minimum_value_snapshot,maximum_value_snapshot,configuration_snapshot,compliant,observation,evidence_path,measured_by,measured_at,created_at)
   values(c.production_order_id,c.id,seq,(d->>'tipo_resposta')::public.response_type,(d->>'valor_numero')::numeric,d->>'resposta_texto',(d->>'resposta_boolean')::boolean,d->>'resposta_select',d->>'unidade',(d->>'valor_minimo')::numeric,(d->>'valor_maximo')::numeric,coalesce(d->'configuracao','{}'),(d->>'conforme')::boolean,d->>'observacao',d->>'foto_path',(d->>'medido_por')::uuid,(d->>'data_medicao')::timestamptz,e.created_at);
  end loop;
  if not exists(select 1 from public.checklist_measurements where checklist_item_id=c.id and measured_at=c.data_medicao) then
   insert into public.checklist_measurements(production_order_id,checklist_item_id,sequence,measurement_type,numeric_value,text_value,boolean_value,select_value,unit,minimum_value_snapshot,maximum_value_snapshot,configuration_snapshot,compliant,observation,evidence_path,measured_by,measured_at)
   values(c.production_order_id,c.id,seq+1,c.tipo_resposta,c.valor_numero,c.resposta_texto,c.resposta_boolean,c.resposta_select,c.unidade,c.valor_minimo,c.valor_maximo,c.configuracao,c.conforme,c.observacao,c.foto_path,c.medido_por,c.data_medicao);
  end if;
 end loop;
end $$;
update public.non_conformities n set origin_measurement_id=(select m.id from public.checklist_measurements m where m.checklist_item_id=n.checklist_item_id and m.compliant=false and m.measured_at<=n.data_abertura order by m.sequence desc limit 1) where n.checklist_item_id is not null;

alter table public.checklist_measurements enable row level security;
alter table public.quality_correction_releases enable row level security;
revoke all on public.checklist_measurements,public.quality_correction_releases from anon,authenticated;
grant select on public.checklist_measurements,public.quality_correction_releases to authenticated;
grant all on public.checklist_measurements,public.quality_correction_releases to service_role;
create policy measurement_read on public.checklist_measurements for select to authenticated using(private.can_access_order(production_order_id));
create policy correction_read on public.quality_correction_releases for select to authenticated using(private.can_access_order(production_order_id));

create function private.capture_measurement() returns trigger language plpgsql security definer set search_path='' as $$
declare seq integer; nc_id uuid;begin
 if new.data_medicao is null or (tg_op='UPDATE' and new.data_medicao is not distinct from old.data_medicao and new.medido_por is not distinct from old.medido_por and new.valor_numero is not distinct from old.valor_numero and new.resposta_boolean is not distinct from old.resposta_boolean and new.resposta_select is not distinct from old.resposta_select and new.resposta_texto is not distinct from old.resposta_texto and new.foto_path is not distinct from old.foto_path and new.observacao is not distinct from old.observacao) then return new;end if;
 perform 1 from public.production_orders where id=new.production_order_id for update;
 select coalesce(max(sequence),0)+1 into seq from public.checklist_measurements where checklist_item_id=new.id;
 insert into public.checklist_measurements(production_order_id,checklist_item_id,sequence,measurement_type,numeric_value,text_value,boolean_value,select_value,unit,minimum_value_snapshot,maximum_value_snapshot,configuration_snapshot,compliant,observation,evidence_path,measured_by,measured_at)
 values(new.production_order_id,new.id,seq,new.tipo_resposta,new.valor_numero,new.resposta_texto,new.resposta_boolean,new.resposta_select,new.unidade,new.valor_minimo,new.valor_maximo,new.configuracao,new.conforme,new.observacao,new.foto_path,new.medido_por,new.data_medicao);
 select id into nc_id from public.non_conformities where checklist_item_id=new.id and impeditiva and status not in ('CLOSED','CANCELLED') order by data_abertura,id limit 1;
 if nc_id is not null then
  insert into public.notifications(user_id,tipo,titulo,mensagem,reference_type,reference_id)
  select id,'CORRECTION_MEASUREMENT','Nova medição para revisão CQ','Nova medição registrada para o item '||new.item||'. Resultado: '||case when new.conforme then 'conforme' else 'não conforme' end||'. A correção está aguardando revisão do CQ.','non_conformity',nc_id from public.profiles where ativo and role='QUALIDADE';
 end if;
 return new;
end $$;
create trigger ab_capture_measurement after insert or update on public.production_order_checklist for each row execute function private.capture_measurement();

create function private.require_explicit_correction() returns trigger language plpgsql set search_path='' as $$
begin
 if current_user in ('postgres','supabase_admin','service_role') then return new;end if;
 if old.status='BLOCKED_QUALITY' and new.status='IN_PRODUCTION' and not exists(select 1 from public.quality_correction_releases where production_order_id=old.id and order_version=old.version and released_by=auth.uid()) then
  raise exception 'Use a ação LIBERAR PARA CORREÇÃO em uma NC em tratamento' using errcode='42501';
 end if;
 return new;
end $$;
create trigger a1_explicit_correction before update on public.production_orders for each row execute function private.require_explicit_correction();

create function private.record_correction_release(nc_id uuid,expected_version integer,expected_updated_at timestamptz) returns uuid language plpgsql security definer set search_path='' as $$
declare n public.non_conformities;o public.production_orders;release_id uuid;begin
 if private.current_role() is null or private.current_role() not in ('ADMIN','QUALIDADE') then raise exception 'Liberação exclusiva de QUALIDADE ou ADMIN ativo' using errcode='42501';end if;
 select * into n from public.non_conformities where id=nc_id;
 if n.id is null or not private.can_access_order(n.production_order_id) then raise exception 'NC não acessível' using errcode='42501';end if;
 select * into o from public.production_orders where id=n.production_order_id for update;
 select * into n from public.non_conformities where id=nc_id for update;
 if o.status<>'BLOCKED_QUALITY' or o.version<>expected_version or n.updated_at is distinct from expected_updated_at then raise exception 'OP/NC alterada. Recarregue.' using errcode='42501';end if;
 if not n.impeditiva or n.status<>'IN_TREATMENT' or n.responsavel_id is null or not exists(select 1 from public.profiles where id=n.responsavel_id and ativo) or not private.has_meaningful_text(n.acao_imediata) or not private.has_meaningful_text(n.observacao_cq) then raise exception 'Liberação exige NC impeditiva em tratamento, responsável ativo, ação imediata e observação CQ';end if;
 -- Every simultaneous impediment must have a documented treatment before execution resumes.
 if exists(select 1 from public.non_conformities x where x.production_order_id=o.id and x.impeditiva and x.status not in ('CLOSED','CANCELLED') and (x.status<>'IN_TREATMENT' or x.responsavel_id is null or not private.has_meaningful_text(x.acao_imediata) or not private.has_meaningful_text(x.observacao_cq))) then raise exception 'Prepare o tratamento de todas as NCs impeditivas abertas';end if;
 insert into public.quality_correction_releases(production_order_id,non_conformity_id,order_version,released_by,immediate_action,quality_observation,responsible_id)
 values(o.id,n.id,o.version,auth.uid(),n.acao_imediata,n.observacao_cq,n.responsavel_id) returning id into release_id;
 insert into public.notifications(user_id,tipo,titulo,mensagem,reference_type,reference_id)
 select p.id,'CORRECTION_RELEASE','OP LIBERADA PARA CORREÇÃO PELO CQ','A OP '||o.numero_op||' foi liberada pelo Controle de Qualidade para correção. Consulte a não conformidade, realize o ajuste solicitado e registre uma nova medição.','production_order',o.id
 from public.profiles p where p.ativo and p.role='OPERADOR' and (p.id=o.operador_responsavel_id or (o.operador_responsavel_id is null and p.production_line_id=o.linha_id and exists(select 1 from public.production_lines l where l.id=o.linha_id and l.ativa)));
 return release_id;
end $$;
create function public.quality_release_correction(nc_id uuid,expected_version integer,expected_updated_at timestamptz) returns uuid language plpgsql set search_path='' as $$
declare release_id uuid; n public.non_conformities;begin
 release_id:=private.record_correction_release(nc_id,expected_version,expected_updated_at);
 select * into n from public.non_conformities where id=nc_id;
 update public.production_orders set status='IN_PRODUCTION',aprovacao_cq=null,motivo_retorno_cq=n.observacao_cq where id=n.production_order_id and version=expected_version;
 if not found then raise exception 'OP indisponível para liberação' using errcode='42501';end if;
 return release_id;
end $$;
CREATE OR REPLACE FUNCTION private.block_nonconforming_order()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if new.conforme is false and new.bloqueia_op_se_nao_conforme and (tg_op='INSERT' or new.data_medicao is distinct from old.data_medicao or new.conforme is distinct from old.conforme or new.valor_numero is distinct from old.valor_numero or new.resposta_boolean is distinct from old.resposta_boolean or new.resposta_select is distinct from old.resposta_select or new.resposta_texto is distinct from old.resposta_texto or new.foto_path is distinct from old.foto_path) then
  update public.production_orders set status='BLOCKED_QUALITY',version=version+1,aprovacao_cq='REJECTED',responsavel_cq_id=null,data_aprovacao_cq=null,motivo_bloqueio='Medição impeditiva não conforme: '||new.item where id=new.production_order_id and status='IN_PRODUCTION';
  if found and auth.uid() is not null and not exists(select 1 from public.non_conformities where checklist_item_id=new.id and impeditiva and status not in ('CLOSED','CANCELLED')) then
   insert into public.non_conformities(codigo_nc,production_order_id,checklist_item_id,tipo,descricao,severidade,acao_imediata,impeditiva,created_by,evidencia_antes_path,origin_measurement_id)
   values('',new.production_order_id,new.id,'CHECKLIST','Item: '||new.item||'. '||coalesce(new.observacao,''),'HIGH','OP bloqueada automaticamente; aguardar CQ.',true,auth.uid(),new.foto_path,(select id from public.checklist_measurements where checklist_item_id=new.id order by sequence desc limit 1));
  end if;
 end if;
 return new;
end $function$

;
CREATE OR REPLACE FUNCTION private.guard_checklist()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
   if new.valor_numero is null or new.resposta_texto is not null or new.resposta_boolean is not null or new.resposta_select is not null then raise exception 'Resposta numérica inválida'; end if;
   new.conforme=(new.valor_minimo is null or new.valor_numero>=new.valor_minimo) and (new.valor_maximo is null or new.valor_numero<=new.valor_maximo);
  elsif new.tipo_resposta='BOOLEAN' then
   if new.resposta_boolean is null or new.valor_numero is not null or new.resposta_texto is not null or new.resposta_select is not null then raise exception 'Resposta booleana inválida'; end if;
   new.conforme=new.resposta_boolean = coalesce((new.configuracao->>'resposta_conforme')::boolean,true);
  elsif new.tipo_resposta='TEXT' then
   if nullif(trim(new.resposta_texto),'') is null or new.valor_numero is not null or new.resposta_boolean is not null or new.resposta_select is not null then raise exception 'Resposta textual inválida'; end if;
   new.conforme=true;
  elsif new.tipo_resposta='PHOTO' then
   if new.foto_path is null or split_part(new.foto_path,'/',1)<>new.production_order_id::text or new.valor_numero is not null or new.resposta_texto is not null or new.resposta_boolean is not null or new.resposta_select is not null then raise exception 'Foto inválida'; end if;
   new.conforme=true;
  else
   if new.resposta_select is null or not coalesce((new.configuracao->'opcoes') ? new.resposta_select,false) or new.valor_numero is not null or new.resposta_texto is not null or new.resposta_boolean is not null then raise exception 'Seleção inválida'; end if;
   new.conforme=coalesce((new.configuracao->'opcoes_conformes') ? new.resposta_select,true);
  end if;
  if new.valor_numero::text in ('NaN','Infinity','-Infinity') then raise exception 'Valor numérico deve ser finito'; end if;
  if new.conforme is false and nullif(trim(new.observacao),'') is null then raise exception 'Resposta NÃO CONFORME exige observação'; end if;
  if length(coalesce(new.observacao,''))>4000 or length(coalesce(new.resposta_texto,''))>4000 then raise exception 'Texto deve ter no máximo 4000 caracteres'; end if;
  if new.foto_path is not null then perform private.validate_operator_photo(new.production_order_id,new.foto_path); end if;
  new.medido_por=auth.uid(); new.data_medicao=now(); new.revisado_cq=false; new.revisado_por=null; new.data_revisao=null;
 elsif r='QUALIDADE' or (r='ADMIN' and (new.revisado_cq is distinct from old.revisado_cq or new.revisado_por is distinct from old.revisado_por or new.data_revisao is distinct from old.data_revisao)) then
  if o.status not in ('AWAITING_QUALITY','BLOCKED_QUALITY') and not (o.status='IN_PRODUCTION' and exists(select 1 from public.non_conformities where checklist_item_id=new.id and impeditiva and status='IN_TREATMENT') and exists(select 1 from public.quality_correction_releases where production_order_id=o.id)) then raise exception 'OP não está em revisão CQ' using errcode='42501'; end if;
  perform private.assert_columns(to_jsonb(old),to_jsonb(new),array['revisado_cq']);
  if new.revisado_cq and new.data_medicao is null then raise exception 'Item ainda não medido'; end if;
  if new.revisado_cq and old.revisado_cq then raise exception 'Item já revisado'; end if;
  new.revisado_por=case when new.revisado_cq then auth.uid() else null end;
  new.data_revisao=case when new.revisado_cq then now() else null end;
 elsif r is distinct from 'ADMIN' then raise exception 'Perfil não autorizado' using errcode='42501';
 end if;
 return new;
end $function$

;
CREATE OR REPLACE FUNCTION public.quality_review_item(order_id uuid, item_id uuid, expected_updated_at timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare c public.production_order_checklist; begin
 if private.current_role() is null or private.current_role() not in ('ADMIN','QUALIDADE') then raise exception 'Acesso exclusivo de Qualidade ou ADMIN ativo' using errcode='42501'; end if;
 perform 1 from public.production_orders where id=order_id and status in ('AWAITING_QUALITY','BLOCKED_QUALITY','IN_PRODUCTION') for update;
 if not found then raise exception 'OP não está disponível para revisão'; end if;
 select * into c from public.production_order_checklist where id=item_id and production_order_id=order_id for update;
 if c.id is null or c.updated_at is distinct from expected_updated_at or c.revisado_cq then raise exception 'Item indisponível, alterado ou já revisado. Recarregue.' using errcode='42501'; end if;
 if c.data_medicao is null or c.conforme is null then raise exception 'Item ainda não medido'; end if;
 update public.production_order_checklist set revisado_cq=true where id=c.id;
end $function$

;
CREATE OR REPLACE FUNCTION private.nc_transition_allowed(r app_role, source nc_status, target nc_status)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
 select (source=target and source not in ('CLOSED','CANCELLED')) or
 (r in ('ADMIN','QUALIDADE') and ((source='OPEN' and target in ('IN_TREATMENT','AWAITING_QUALITY','CANCELLED')) or (source='IN_TREATMENT' and target in ('AWAITING_QUALITY','CLOSED','CANCELLED')) or (source='AWAITING_QUALITY' and target in ('IN_TREATMENT','CLOSED','CANCELLED')))) or
 (r='OPERADOR' and ((source='OPEN' and target in ('IN_TREATMENT','AWAITING_QUALITY')) or (source='IN_TREATMENT' and target='AWAITING_QUALITY')));
$function$

;
CREATE OR REPLACE FUNCTION private.guard_nc()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
  if new.origin_measurement_id is distinct from old.origin_measurement_id or new.correction_measurement_id is distinct from old.correction_measurement_id then raise exception 'Referências de medição são controladas pelo banco' using errcode='42501';end if;
  if r='OPERADOR' then
   if old.created_by<>auth.uid() or o.status not in ('IN_PRODUCTION','BLOCKED_QUALITY') then raise exception 'NC indisponível ao operador' using errcode='42501'; end if;
   perform private.assert_columns(to_jsonb(old),to_jsonb(new),array['acao_imediata','evidencia_antes_path','evidencia_depois_path','status']);
  end if;
 end if;
 if r not in ('ADMIN','QUALIDADE','OPERADOR') then raise exception 'Perfil não autorizado' using errcode='42501'; end if;
 if nullif(trim(new.tipo),'') is null or length(new.tipo)>100 or nullif(trim(new.descricao),'') is null or length(new.descricao)>4000 or length(coalesce(new.acao_imediata,''))>4000 or length(coalesce(new.observacao_cq,''))>4000 then raise exception 'Confira tipo, descrição e textos de até 4000 caracteres'; end if;
 if new.responsavel_id is not null and (tg_op='INSERT' or new.responsavel_id is distinct from old.responsavel_id) and not exists(select 1 from public.profiles where id=new.responsavel_id and ativo) then raise exception 'Selecione responsável ativo'; end if;
 if new.status='CLOSED' then
  if new.impeditiva and new.checklist_item_id is not null then
   select m.id into new.correction_measurement_id from public.checklist_measurements m
   join public.production_order_checklist c on c.id=m.checklist_item_id
   where m.checklist_item_id=new.checklist_item_id and m.production_order_id=new.production_order_id and m.compliant=true
    and m.sequence>(select coalesce(max(sequence),0) from public.checklist_measurements where checklist_item_id=new.checklist_item_id and compliant=false)
    and m.measured_at>new.data_abertura and c.conforme=true and c.revisado_cq=true and c.data_medicao=m.measured_at
    and exists(select 1 from public.quality_correction_releases where production_order_id=new.production_order_id)
   order by m.sequence desc limit 1;
   if new.correction_measurement_id is null then raise exception 'Fechamento exige nova medição conforme posterior à não conformidade e revisada pelo CQ';end if;
  end if;
  if r not in ('QUALIDADE','ADMIN') or nullif(trim(new.acao_imediata),'') is null or new.responsavel_id is null or not exists(select 1 from public.profiles where id=new.responsavel_id and ativo) or nullif(trim(new.observacao_cq),'') is null then raise exception 'Fechamento exige ação imediata, responsável ativo e observação CQ'; end if;
  new.aprovado_cq=true; new.encerrado_por=auth.uid(); new.data_fechamento=now();
 elsif new.status='CANCELLED' then
  if r not in ('QUALIDADE','ADMIN') or nullif(trim(new.observacao_cq),'') is null then raise exception 'Cancelamento exige justificativa CQ'; end if;
  new.aprovado_cq=false; new.encerrado_por=auth.uid(); new.data_fechamento=now();
 end if;
 if new.evidencia_antes_path is not null then perform private.validate_nc_evidence(o.id,new.evidencia_antes_path); end if;
 if new.evidencia_depois_path is not null then perform private.validate_nc_evidence(o.id,new.evidencia_depois_path); end if;
 return new;
end $function$

;
CREATE OR REPLACE FUNCTION private.audit_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare before_row jsonb; after_row jsonb; row_data jsonb; op_id uuid; field_name text; begin
 before_row=case when tg_op='INSERT' then '{}'::jsonb else to_jsonb(old) end;
 after_row=case when tg_op='DELETE' then '{}'::jsonb else to_jsonb(new) end;
 row_data=case when tg_op='DELETE' then before_row else after_row end;
 if tg_table_name='production_orders' and tg_op<>'DELETE' then op_id=(row_data->>'id')::uuid;
 elsif tg_table_name in ('production_order_checklist','production_notes','non_conformities','final_reports','checklist_measurements','quality_correction_releases') then op_id=(row_data->>'production_order_id')::uuid;
 end if;
 for field_name in select key from jsonb_each(before_row||after_row) loop
 if field_name not in ('updated_at','version') and before_row->field_name is distinct from after_row->field_name then
 insert into public.audit_logs(production_order_id,entity,entity_id,action,field,old_value,new_value,user_id)
 values(op_id,tg_table_name,(row_data->>'id')::uuid,tg_op,field_name,before_row->field_name,after_row->field_name,auth.uid());
 end if; end loop;
 if tg_op='DELETE' then return old; end if; return new;
end $function$

;
CREATE OR REPLACE FUNCTION private.capture_final_report()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare report_id uuid:=gen_random_uuid(); data jsonb;begin
 if new.status<>'FINALIZED' or old.status='FINALIZED' then return new;end if;
 select jsonb_build_object('id',report_id,'empresa',new.empresa_nome,'generated_at',new.data_finalizacao,'version',new.version,'order',to_jsonb(new),'operator_submission',(select jsonb_build_object('user_id',a.user_id,'created_at',a.created_at) from public.audit_logs a where a.production_order_id=new.id and a.entity='production_orders' and a.field='status' and a.old_value='"IN_PRODUCTION"'::jsonb and a.new_value='"AWAITING_QUALITY"'::jsonb order by a.created_at desc,a.id desc limit 1),
 'product',(select to_jsonb(p) from public.products p where p.id=new.produto_id),'line',(select to_jsonb(l) from public.production_lines l where l.id=new.linha_id),
 'items',coalesce((select jsonb_agg(to_jsonb(i) order by i.ordem,i.id) from public.production_order_checklist i where i.production_order_id=new.id),'[]'::jsonb),
 'measurements',coalesce((select jsonb_agg(to_jsonb(m) order by m.checklist_item_id,m.sequence) from public.checklist_measurements m where m.production_order_id=new.id),'[]'::jsonb),
 'correction_releases',coalesce((select jsonb_agg(to_jsonb(r) order by r.released_at,r.id) from public.quality_correction_releases r where r.production_order_id=new.id),'[]'::jsonb),
 'notes',coalesce((select jsonb_agg(to_jsonb(n) order by n.created_at,n.id) from public.production_notes n where n.production_order_id=new.id),'[]'::jsonb),
 'ncs',coalesce((select jsonb_agg(to_jsonb(n) order by n.data_abertura,n.id) from public.non_conformities n where n.production_order_id=new.id),'[]'::jsonb),
 'people',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'nome',p.nome)) from public.profiles p where p.id=new.operador_responsavel_id or p.id=new.responsavel_cq_id or p.id=new.responsavel_pcp_id or p.id in(select measured_by from public.checklist_measurements where production_order_id=new.id union select released_by from public.quality_correction_releases where production_order_id=new.id union select medido_por from public.production_order_checklist where production_order_id=new.id union select revisado_por from public.production_order_checklist where production_order_id=new.id union select created_by from public.production_notes where production_order_id=new.id union select responsavel_id from public.non_conformities where production_order_id=new.id union select encerrado_por from public.non_conformities where production_order_id=new.id union select user_id from public.audit_logs where production_order_id=new.id and entity='production_orders' and field='status' and old_value='"IN_PRODUCTION"'::jsonb and new_value='"AWAITING_QUALITY"'::jsonb)),'[]'::jsonb)) into data;
 insert into public.final_reports(id,production_order_id,order_version,path,snapshot,created_by) values(report_id,new.id,new.version,new.id::text||'/'||report_id::text||'.pdf',data,auth.uid());return new;
end $function$

;

create trigger audit_change after insert on public.checklist_measurements for each row execute function private.audit_change();
create trigger audit_change after insert on public.quality_correction_releases for each row execute function private.audit_change();
revoke all on function private.capture_measurement(),private.require_explicit_correction() from public,anon,authenticated;
revoke all on function private.record_correction_release(uuid,integer,timestamptz) from public,anon;
grant execute on function private.record_correction_release(uuid,integer,timestamptz) to authenticated,service_role;
revoke all on function public.quality_release_correction(uuid,integer,timestamptz) from public,anon;
grant execute on function public.quality_release_correction(uuid,integer,timestamptz) to authenticated;
commit;
