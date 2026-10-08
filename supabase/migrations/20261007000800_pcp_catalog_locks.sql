begin;
-- SELECT FOR SHARE also applies UPDATE RLS; PCP deliberately has read-only catalog.
-- Narrow private helpers authorize PCP/ADMIN then lock only the selected catalog row.
create function private.pcp_lock_product(row_id uuid) returns public.products language plpgsql security definer set search_path='' as $$
declare result public.products; begin
 if private.current_role() is null or private.current_role() not in ('ADMIN','PCP') then raise exception 'Acesso exclusivo de PCP ou ADMIN ativo' using errcode='42501'; end if;
 select * into result from public.products where id=row_id for share;
 return result;
end $$;
revoke all on function private.pcp_lock_product(uuid) from public,anon;
grant execute on function private.pcp_lock_product(uuid) to authenticated;
create function private.pcp_lock_line(row_id uuid) returns public.production_lines language plpgsql security definer set search_path='' as $$
declare result public.production_lines; begin
 if private.current_role() is null or private.current_role() not in ('ADMIN','PCP') then raise exception 'Acesso exclusivo de PCP ou ADMIN ativo' using errcode='42501'; end if;
 select * into result from public.production_lines where id=row_id for share;
 return result;
end $$;
revoke all on function private.pcp_lock_line(uuid) from public,anon;
grant execute on function private.pcp_lock_line(uuid) to authenticated;
create function private.pcp_lock_template(row_id uuid) returns public.checklist_templates language plpgsql security definer set search_path='' as $$
declare result public.checklist_templates; begin
 if private.current_role() is null or private.current_role() not in ('ADMIN','PCP') then raise exception 'Acesso exclusivo de PCP ou ADMIN ativo' using errcode='42501'; end if;
 select * into result from public.checklist_templates where id=row_id for share;
 return result;
end $$;
revoke all on function private.pcp_lock_template(uuid) from public,anon;
grant execute on function private.pcp_lock_template(uuid) to authenticated;
create or replace function public.pcp_create_order(payload jsonb) returns uuid language plpgsql security invoker set search_path='' as $$
declare target uuid; product public.products; line public.production_lines; scheduled timestamptz; begin
 if private.current_role() is null or private.current_role() not in ('ADMIN','PCP') then raise exception 'Acesso exclusivo de PCP ou ADMIN ativo' using errcode='42501'; end if;
 select * into product from private.pcp_lock_product((payload->>'produto_id')::uuid);
 select * into line from private.pcp_lock_line((payload->>'linha_id')::uuid);
 if product.id is null or not product.ativo then raise exception 'Selecione um produto ativo'; end if;
 if line.id is null or not line.ativa then raise exception 'Selecione uma linha ativa'; end if;
 if length(trim(payload->>'numero_op')) not between 1 and 80 or length(trim(payload->>'lote')) not between 1 and 160 or length(trim(payload->>'unidade')) not between 1 and 20 then raise exception 'Número OP, lote e unidade são obrigatórios'; end if;
 if nullif(payload->>'data_hora_programada','') is null then raise exception 'Informe data e hora programadas'; end if;
 scheduled=(payload->>'data_hora_programada')::timestamp at time zone 'America/Sao_Paulo';
 insert into public.production_orders(numero_op,produto_id,lote,linha_id,quantidade_planejada,unidade,prioridade,data_hora_programada,operador_responsavel_id,created_by)
 values(trim(payload->>'numero_op'),product.id,trim(payload->>'lote'),line.id,(payload->>'quantidade_planejada')::numeric,trim(payload->>'unidade'),(payload->>'prioridade')::public.order_priority,scheduled,nullif(payload->>'operador_responsavel_id','')::uuid,auth.uid()) returning id into target;
 return target;
end $$;
create or replace function public.pcp_prepare_order(order_id uuid,expected_version integer) returns void language plpgsql security invoker set search_path='' as $$
declare o public.production_orders; p public.products; l public.production_lines; t public.checklist_templates; copied integer; begin
 if private.current_role() is null or private.current_role() not in ('ADMIN','PCP') then raise exception 'Acesso exclusivo de PCP ou ADMIN ativo' using errcode='42501'; end if;
 select * into o from public.production_orders where id=order_id for update;
 if o.id is null then raise exception 'OP não encontrada'; end if;
 if o.status<>'DRAFT' then raise exception 'Preparação exige rascunho. Esta OP já foi preparada ou mudou de status.' using errcode='42501'; end if;
 if o.version<>expected_version then raise exception 'A OP mudou. Recarregue antes de preparar.' using errcode='42501'; end if;
 if nullif(trim(o.numero_op),'') is null or nullif(trim(o.lote),'') is null or nullif(trim(o.unidade),'') is null or o.quantidade_planejada<=0 or o.data_programada is null then raise exception 'Dados obrigatórios da OP incompletos'; end if;
 if o.operador_responsavel_id is not null and not private.operator_is_active(o.operador_responsavel_id) then raise exception 'Operador responsável deve estar ativo'; end if;
 if exists(select 1 from public.production_order_checklist where production_order_id=o.id) then raise exception 'A OP já possui checklist. Preparação não pode duplicar ou sobrescrever itens.'; end if;
 if o.pdf_original_path is null or private.storage_order_id(o.pdf_original_path) is distinct from o.id or not exists(select 1 from storage.objects where bucket_id='op-originals' and name=o.pdf_original_path and metadata->>'mimetype'='application/pdf' and (metadata->>'size')::bigint between 1 and 20971520) then raise exception 'Anexe um PDF válido no bucket privado antes de preparar'; end if;
 update public.production_orders set status='PREPARING' where id=o.id;
 select * into p from private.pcp_lock_product(o.produto_id);
 select * into l from private.pcp_lock_line(o.linha_id);
 if p.id is null or not p.ativo or l.id is null or not l.ativa then raise exception 'Produto e linha devem estar ativos'; end if;
 if p.checklist_template_id is null then raise exception 'Produto sem modelo de checklist. Solicite o cadastro ao ADMIN'; end if;
 select * into t from private.pcp_lock_template(p.checklist_template_id);
 if t.id is null or not t.ativo then raise exception 'Modelo de checklist inativo ou indisponível'; end if;
 insert into public.production_order_checklist(production_order_id,template_item_id,ordem,grupo,item,descricao,tipo_resposta,unidade,valor_minimo,valor_maximo,obrigatorio,momento,requer_revisao_cq,bloqueia_op_se_nao_conforme,configuracao)
 select o.id,i.id,i.ordem,i.grupo,i.item,i.descricao,i.tipo_resposta,i.unidade,i.valor_minimo,i.valor_maximo,i.obrigatorio,i.momento,i.requer_revisao_cq,i.bloqueia_op_se_nao_conforme,i.configuracao
 from public.checklist_template_items i where i.template_id=t.id and i.ativo order by i.ordem;
 get diagnostics copied=row_count;
 if copied=0 then raise exception 'Modelo sem itens ativos'; end if;
 update public.production_orders set status='RELEASED',checklist_template_nome=t.nome,checklist_template_revisao=t.revisao,checklist_template_descricao=t.descricao where id=o.id;
 -- Existing triggers append status changes and snapshot fields to immutable audit_logs.
end $$;
commit;
