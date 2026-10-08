begin;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create type public.app_role as enum ('ADMIN','PCP','QUALIDADE','OPERADOR');
create type public.response_type as enum ('BOOLEAN','NUMBER','TEXT','PHOTO','SELECT');
create type public.order_status as enum ('DRAFT','PREPARING','RELEASED','IN_PRODUCTION','BLOCKED_QUALITY','AWAITING_QUALITY','AWAITING_PCP','FINALIZED','REOPENED','CANCELLED');
create type public.checklist_moment as enum ('ANTES','DURANTE','DEPOIS');
create type public.order_priority as enum ('BAIXA','NORMAL','ALTA','URGENTE');
create type public.nc_severity as enum ('BAIXA','MEDIA','ALTA','CRITICA');
create type public.nc_status as enum ('ABERTA','EM_TRATAMENTO','AGUARDANDO_CQ','FECHADA');
create type public.note_type as enum ('OBSERVACAO','PARADA','PRODUCAO','PERDA');

create table public.production_lines (
 id uuid primary key default gen_random_uuid(), nome text not null check (length(trim(nome)) > 0),
 setor text not null, descricao text, ativa boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 nome text not null, email text not null,
 role public.app_role not null default 'OPERADOR',
 production_line_id uuid references public.production_lines(id) on delete restrict,
 ativo boolean not null default false, can_reopen_orders boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.checklist_templates (
 id uuid primary key default gen_random_uuid(), nome text not null, revisao text not null,
 descricao text, ativo boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(nome,revisao)
);
create table public.products (
 id uuid primary key default gen_random_uuid(), codigo text not null, descricao text not null,
 unidade text not null, revisao text not null,
 checklist_template_id uuid references public.checklist_templates(id) on delete restrict,
 ativo boolean not null default true, created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(), unique(codigo,revisao)
);
create table public.checklist_template_items (
 id uuid primary key default gen_random_uuid(), template_id uuid not null references public.checklist_templates(id) on delete restrict,
 ordem integer not null check (ordem > 0), grupo text, item text not null, descricao text,
 tipo_resposta public.response_type not null, unidade text,
 valor_minimo numeric, valor_maximo numeric, obrigatorio boolean not null default true,
 momento public.checklist_moment not null default 'DURANTE', requer_revisao_cq boolean not null default true,
 bloqueia_op_se_nao_conforme boolean not null default true,
 configuracao jsonb not null default '{}'::jsonb check (jsonb_typeof(configuracao)='object'), ativo boolean not null default true,
 unique(template_id,ordem), check (valor_minimo is null or valor_maximo is null or valor_minimo <= valor_maximo)
);
create table public.production_orders (
 id uuid primary key default gen_random_uuid(), numero_op text not null unique check (length(trim(numero_op))>0),
 produto_id uuid not null references public.products(id) on delete restrict, lote text not null,
 linha_id uuid not null references public.production_lines(id) on delete restrict,
 quantidade_planejada numeric not null check (quantidade_planejada > 0 and quantidade_planejada < 'Infinity'::numeric), unidade text not null,
 prioridade public.order_priority not null default 'NORMAL', data_programada date,
 operador_responsavel_id uuid references public.profiles(id) on delete restrict,
 pdf_original_path text, status public.order_status not null default 'DRAFT',
 inicio_producao timestamptz, fim_producao timestamptz,
 quantidade_produzida numeric check (quantidade_produzida >= 0 and quantidade_produzida < 'Infinity'::numeric), quantidade_perdida numeric check (quantidade_perdida >= 0 and quantidade_perdida < 'Infinity'::numeric),
 observacao_final text, assinatura_operador_path text,
 aprovacao_cq boolean, responsavel_cq_id uuid references public.profiles(id) on delete restrict, data_aprovacao_cq timestamptz,
 aprovacao_pcp boolean, responsavel_pcp_id uuid references public.profiles(id) on delete restrict, data_finalizacao timestamptz,
 motivo_reabertura text, relatorio_final_path text, version integer not null default 1 check (version > 0),
 created_by uuid not null default auth.uid() references public.profiles(id) on delete restrict,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check (fim_producao is null or (inicio_producao is not null and fim_producao >= inicio_producao)),
 check (aprovacao_cq is distinct from true or (responsavel_cq_id is not null and data_aprovacao_cq is not null)),
 check (aprovacao_pcp is distinct from true or (responsavel_pcp_id is not null and data_finalizacao is not null)),
 check (status <> 'FINALIZED' or (aprovacao_cq is true and aprovacao_pcp is true and fim_producao is not null)),
 check (status <> 'REOPENED' or (motivo_reabertura is not null and length(trim(motivo_reabertura)) > 0))
);
create table public.production_order_checklist (
 id uuid primary key default gen_random_uuid(), production_order_id uuid not null references public.production_orders(id) on delete restrict,
 template_item_id uuid references public.checklist_template_items(id) on delete restrict,
 ordem integer not null check (ordem>0), grupo text, item text not null, descricao text,
 tipo_resposta public.response_type not null, unidade text, valor_minimo numeric, valor_maximo numeric,
 obrigatorio boolean not null default true, momento public.checklist_moment not null default 'DURANTE',
 requer_revisao_cq boolean not null default true, bloqueia_op_se_nao_conforme boolean not null default true,
 configuracao jsonb not null default '{}'::jsonb check (jsonb_typeof(configuracao)='object'),
 valor_numero numeric check (valor_numero > '-Infinity'::numeric and valor_numero < 'Infinity'::numeric), resposta_texto text, resposta_boolean boolean, resposta_select text, foto_path text,
 conforme boolean, observacao text, medido_por uuid references public.profiles(id) on delete restrict, data_medicao timestamptz,
 revisado_cq boolean not null default false, revisado_por uuid references public.profiles(id) on delete restrict, data_revisao timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(production_order_id,ordem), unique(id,production_order_id), check (valor_minimo is null or valor_maximo is null or valor_minimo <= valor_maximo),
 check (not revisado_cq or (revisado_por is not null and data_revisao is not null))
);
create table public.production_notes (
 id uuid primary key default gen_random_uuid(), production_order_id uuid not null references public.production_orders(id) on delete restrict,
 tipo public.note_type not null, descricao text not null,
 tempo_minutos numeric check (tempo_minutos >= 0 and tempo_minutos < 'Infinity'::numeric), quantidade numeric check (quantidade >= 0 and quantidade < 'Infinity'::numeric), unidade text, foto_path text,
 created_by uuid not null default auth.uid() references public.profiles(id) on delete restrict,
 created_at timestamptz not null default now()
);
create table public.non_conformities (
 id uuid primary key default gen_random_uuid(), codigo_nc text not null unique,
 production_order_id uuid not null references public.production_orders(id) on delete restrict,
 checklist_item_id uuid references public.production_order_checklist(id) on delete restrict,
 tipo text not null, descricao text not null, severidade public.nc_severity not null,
 acao_imediata text, responsavel_id uuid references public.profiles(id) on delete restrict,
 status public.nc_status not null default 'ABERTA', data_abertura timestamptz not null default now(), data_fechamento timestamptz,
 evidencia_antes_path text, evidencia_depois_path text, aprovado_cq boolean, observacao_cq text,
 created_by uuid not null default auth.uid() references public.profiles(id) on delete restrict,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key (checklist_item_id,production_order_id) references public.production_order_checklist(id,production_order_id) on delete restrict,
 check (status <> 'FECHADA' or (aprovado_cq is true and data_fechamento is not null)),
 check (data_fechamento is null or data_fechamento >= data_abertura)
);
create table public.audit_logs (
 id uuid primary key default gen_random_uuid(), production_order_id uuid references public.production_orders(id) on delete restrict,
 entity text not null, entity_id uuid not null, action text not null, field text,
 old_value jsonb, new_value jsonb, user_id uuid references public.profiles(id) on delete restrict,
 created_at timestamptz not null default now()
);
create table public.notifications (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
 tipo text not null, titulo text not null, mensagem text not null, lida boolean not null default false,
 reference_type text, reference_id uuid, created_at timestamptz not null default now()
);

create index profiles_line_idx on public.profiles(production_line_id);
create index orders_operator_status_idx on public.production_orders(operador_responsavel_id,status);
create index orders_line_status_idx on public.production_orders(linha_id,status);
create index orders_schedule_idx on public.production_orders(data_programada,status);
create index orders_product_idx on public.production_orders(produto_id);
create index orders_created_by_idx on public.production_orders(created_by);
create index orders_cq_idx on public.production_orders(responsavel_cq_id);
create index orders_pcp_idx on public.production_orders(responsavel_pcp_id);
create index products_template_idx on public.products(checklist_template_id);
create index checklist_template_item_idx on public.production_order_checklist(template_item_id);
create index checklist_measured_idx on public.production_order_checklist(medido_por);
create index checklist_reviewed_idx on public.production_order_checklist(revisado_por);
create index notes_order_idx on public.production_notes(production_order_id,created_at);
create index notes_author_idx on public.production_notes(created_by);
create index nc_order_status_idx on public.non_conformities(production_order_id,status);
create index nc_item_idx on public.non_conformities(checklist_item_id);
create index nc_responsible_idx on public.non_conformities(responsavel_id);
create index nc_author_idx on public.non_conformities(created_by);
create index audit_order_date_idx on public.audit_logs(production_order_id,created_at);
create index audit_entity_idx on public.audit_logs(entity,entity_id);
create index audit_user_idx on public.audit_logs(user_id);
create index notifications_user_unread_idx on public.notifications(user_id,created_at) where not lida;

create function private.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;
do $$ declare t text; begin
 foreach t in array array['profiles','production_lines','products','checklist_templates','production_orders','production_order_checklist','non_conformities'] loop
 execute format('create trigger zz_updated_at before update on public.%I for each row execute function private.touch_updated_at()',t);
 end loop;
end $$;

-- Auth metadata is never trusted to grant roles or activation.
create function private.create_profile() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 insert into public.profiles(id,nome,email) values(new.id,coalesce(nullif(trim(new.raw_user_meta_data->>'nome'),''),'Usuário'),coalesce(new.email,''));
 return new;
end $$;
create trigger auth_user_profile after insert on auth.users for each row execute function private.create_profile();
create function private.sync_profile_email() returns trigger language plpgsql security definer set search_path = '' as $$
begin update public.profiles set email=coalesce(new.email,'') where id=new.id; return new; end $$;
create trigger auth_user_email after update of email on auth.users for each row execute function private.sync_profile_email();

revoke all on all functions in schema private from public, anon, authenticated;
commit;
