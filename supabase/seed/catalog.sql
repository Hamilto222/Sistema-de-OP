-- Development only. Idempotent catalog; no Auth credentials or user identities.
begin;
insert into public.production_lines(id,nome,setor,descricao) values
 ('10000000-0000-4000-8000-000000000001','Linha 1','Produção','Montagem'),
 ('10000000-0000-4000-8000-000000000002','Linha 2','Produção','Acabamento')
on conflict (id) do nothing;
insert into public.checklist_templates(id,nome,revisao,descricao) values
 ('20000000-0000-4000-8000-000000000001','Montagem padrão','01','Inspeção de montagem'),
 ('20000000-0000-4000-8000-000000000002','Acabamento padrão','01','Inspeção de acabamento'),
 ('20000000-0000-4000-8000-000000000003','Embalagem padrão','01','Inspeção de embalagem')
on conflict (id) do nothing;
insert into public.products(id,codigo,descricao,unidade,revisao,checklist_template_id) values
 ('30000000-0000-4000-8000-000000000001','DEMO-001','Conjunto demonstrativo A','UN','01','20000000-0000-4000-8000-000000000001'),
 ('30000000-0000-4000-8000-000000000002','DEMO-002','Conjunto demonstrativo B','UN','01','20000000-0000-4000-8000-000000000002'),
 ('30000000-0000-4000-8000-000000000003','DEMO-003','Conjunto demonstrativo C','UN','01','20000000-0000-4000-8000-000000000003')
on conflict (id) do nothing;
insert into public.checklist_template_items(template_id,ordem,grupo,item,tipo_resposta,unidade,valor_minimo,valor_maximo,momento,configuracao)
select t.id,i.ordem,'Inspeção',i.item,i.tipo,i.unidade,i.minimo,i.maximo,i.momento,i.config
from public.checklist_templates t cross join (values
 (1,'Área preparada','BOOLEAN'::public.response_type,null::text,null::numeric,null::numeric,'ANTES'::public.checklist_moment,'{}'::jsonb),
 (2,'Dimensão principal','NUMBER'::public.response_type,'mm',9.5,10.5,'DURANTE'::public.checklist_moment,'{}'::jsonb),
 (3,'Aspecto visual','SELECT'::public.response_type,null,null,null,'DURANTE'::public.checklist_moment,'{"opcoes":["Aprovado","Reprovado"],"opcoes_conformes":["Aprovado"]}'::jsonb),
 (4,'Evidência final','PHOTO'::public.response_type,null,null,null,'DEPOIS'::public.checklist_moment,'{}'::jsonb)
) as i(ordem,item,tipo,unidade,minimo,maximo,momento,config)
where t.id in ('20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000003')
on conflict (template_id,ordem) where ativo do nothing;
insert into public.checklist_template_items(template_id,ordem,grupo,item,tipo_resposta,momento,bloqueia_op_se_nao_conforme)
values ('20000000-0000-4000-8000-000000000001',5,'Registro','Observações da montagem','TEXT','DEPOIS',false)
on conflict (template_id,ordem) where ativo do nothing;
commit;
