import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { localAdmin, localClient, checked } from '../scripts/local-supabase.mjs';
import { seedUsers, testPassword } from '../supabase/seed/users.mjs';
let admin, users, sessions, line, product, template, snapshot, order;
const suffix=`-admin-db-${Date.now()}`;
const password=testPassword();
const item={ordem:1,grupo:'Preparação',item:'Há vazamento?',descricao:'Verificar ausência de vazamento.',tipo_resposta:'BOOLEAN',unidade:null,valor_minimo:null,valor_maximo:null,obrigatorio:true,momento:'ANTES',requer_revisao_cq:true,bloqueia_op_se_nao_conforme:false,configuracao:{resposta_conforme:false}};
const payload={nome:`Modelo${suffix}`,revisao:'01',descricao:'Modelo de teste',ativo:true,itens:[item]};
const denied=result=>assert.ok(result.error,'O banco deveria negar a operação');
before(async()=>{
  admin=localAdmin(); users=await seedUsers(password,suffix); sessions=[];
  for(const user of users){const client=localClient();checked(await client.auth.signInWithPassword({email:user.email,password}));sessions.push(client);}
});
after(async()=>{if(users)checked(await admin.from('profiles').update({ativo:false}).in('id',users.map(u=>u.id)));});

test('sexta migration aplicada; RPC sem privilégio público e execução como invoker',()=>{
 const sql="select count(*) from supabase_migrations.schema_migrations where version='20261007000600'; select prosecdef from pg_proc where oid='public.admin_save_checklist(jsonb)'::regprocedure;";
 const output=execFileSync('docker',['exec','supabase_db_op-digital','psql','-U','postgres','-d','postgres','-Atc',sql],{encoding:'utf8'}).trim();
 assert.equal(output,'1\nf');
});
test('seed de catálogo continua idempotente com índice parcial de itens ativos',()=>{
 const seed=readFileSync('supabase/seed/catalog.sql','utf8');
 for(let attempt=0;attempt<2;attempt++)execFileSync('docker',['exec','-i','supabase_db_op-digital','psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{input:seed,stdio:['pipe','pipe','pipe']});
});
test('ADMIN cria/edita linha; updated_at e auditoria reais',async()=>{
 line=checked(await sessions[0].from('production_lines').insert({nome:`Linha${suffix}`,setor:'Montagem'}).select().single());
 const changed=checked(await sessions[0].from('production_lines').update({descricao:'Linha industrial',setor:'Fábrica'}).eq('id',line.id).eq('updated_at',line.updated_at).select().single());
 assert.notEqual(changed.updated_at,line.updated_at);line=changed;
 const audit=checked(await sessions[0].from('audit_logs').select().eq('entity_id',line.id).eq('field','setor').eq('action','UPDATE'));
 assert.equal(audit.at(-1).user_id,users[0].id);assert.equal(audit.at(-1).new_value,'Fábrica');
});
test('modelo e itens criados atomicamente com resposta Não conforme',async()=>{
 const id=checked(await sessions[0].rpc('admin_save_checklist',{payload}));
 template=checked(await sessions[0].from('checklist_templates').select().eq('id',id).single());
 const items=checked(await sessions[0].from('checklist_template_items').select().eq('template_id',id).eq('ativo',true));
 assert.equal(items.length,1);assert.equal(items[0].configuracao.resposta_conforme,false);
});
test('ADMIN cria produto ligado ao modelo; duplicidade rejeitada',async()=>{
 product=checked(await sessions[0].from('products').insert({codigo:`PR${suffix}`,descricao:'Produto teste',unidade:'UN',revisao:'01',checklist_template_id:template.id}).select().single());
 denied(await sessions[0].from('products').insert({codigo:product.codigo,descricao:'Duplicado',unidade:'UN',revisao:'01'}));
 checked(await sessions[0].from('products').update({descricao:'Produto atualizado'}).eq('id',product.id));
});
test('perfil editável pelo ADMIN; identidade Auth e próprio acesso protegidos',async()=>{
 checked(await sessions[0].from('profiles').update({nome:'Operador Administrado',production_line_id:line.id,can_reopen_orders:true}).eq('id',users[3].id));
 const profile=checked(await sessions[0].from('profiles').select().eq('id',users[3].id).single());
 assert.equal(profile.production_line_id,line.id);assert.equal(profile.can_reopen_orders,true);
 denied(await sessions[0].from('profiles').update({ativo:false}).eq('id',users[0].id));
 denied(await sessions[0].from('profiles').update({role:'OPERADOR'}).eq('id',users[0].id));
 denied(await sessions[0].from('profiles').update({email:'forged@opdigital.example'}).eq('id',users[3].id));
});
test('PCP, CQ e OPERADOR não escrevem nos cadastros nem invocam RPC administrativa',async()=>{
 for(const client of sessions.slice(1)){
  denied(await client.from('production_lines').insert({nome:'Proibida',setor:'Proibido'}));
  denied(await client.from('products').insert({codigo:randomUUID(),descricao:'Proibido',unidade:'UN',revisao:'01'}));
  denied(await client.from('checklist_templates').insert({nome:randomUUID(),revisao:'01'}));
  denied(await client.from('checklist_template_items').insert({template_id:template.id,...item}));
  denied(await client.rpc('admin_save_checklist',{payload:{...payload,nome:randomUUID()}}));
  assert.equal(checked(await client.from('production_lines').update({setor:'Falsificado'}).eq('id',line.id).select()).length,0);
  assert.equal(checked(await client.from('profiles').update({role:'ADMIN'}).eq('id',users[3].id).select()).length,0);
 }
});
test('inválidos SELECT, BOOLEAN, limites e ordens duplicadas fazem rollback integral',async()=>{
 const invalids=[{...item,tipo_resposta:'SELECT',configuracao:{opcoes:[]}}, {...item,configuracao:{resposta_conforme:'false'}}, {...item,tipo_resposta:'NUMBER',valor_minimo:10,valor_maximo:5}, {...item,tipo_resposta:'SELECT',configuracao:{opcoes:['A','A']}}];
 for(const invalid of invalids){const name=randomUUID();denied(await sessions[0].rpc('admin_save_checklist',{payload:{...payload,nome:name,itens:[invalid]}}));assert.equal(checked(await admin.from('checklist_templates').select('id').eq('nome',name)).length,0);}
 denied(await sessions[0].rpc('admin_save_checklist',{payload:{...payload,nome:randomUUID(),itens:[item,item]}}));
});
test('snapshot de OP antiga mantém definição, configuração e FK após edição do modelo',async()=>{
 const source=checked(await admin.from('checklist_template_items').select().eq('template_id',template.id).eq('ativo',true).single());
 order=checked(await admin.from('production_orders').insert({numero_op:`SNAP${suffix}`,produto_id:product.id,linha_id:line.id,lote:'TESTE',quantidade_planejada:10,unidade:'UN',status:'IN_PRODUCTION',inicio_producao:new Date().toISOString(),created_by:users[1].id,operador_responsavel_id:users[3].id}).select().single());
 snapshot=checked(await admin.from('production_order_checklist').insert({production_order_id:order.id,template_item_id:source.id,...item}).select().single());
 checked(await sessions[0].rpc('admin_save_checklist',{payload:{...payload,id:template.id,updated_at:template.updated_at,itens:[{...item,item:'Definição nova',configuracao:{resposta_conforme:true}}]}}));
 const preserved=checked(await admin.from('production_order_checklist').select().eq('id',snapshot.id).single());
 assert.equal(preserved.item,item.item);assert.deepEqual(preserved.configuracao,item.configuracao);assert.equal(preserved.template_item_id,source.id);
 assert.equal(checked(await admin.from('checklist_template_items').select('ativo').eq('id',source.id).single()).ativo,false);
});
test('BOOLEAN de OP respeita resposta conforme false armazenada no snapshot',async()=>{
 const result=checked(await sessions[3].from('production_order_checklist').update({resposta_boolean:false}).eq('id',snapshot.id).select().single());
 assert.equal(result.conforme,true);assert.equal(result.medido_por,users[3].id);
});
test('edição concorrente obsoleta rejeitada sem substituir itens',async()=>{
 denied(await sessions[0].rpc('admin_save_checklist',{payload:{...payload,id:template.id,updated_at:template.updated_at,itens:[item]}}));
 assert.equal(checked(await admin.from('checklist_template_items').select('item').eq('template_id',template.id).eq('ativo',true).single()).item,'Definição nova');
});
test('duplicação/revisão cria modelos independentes; SELECT guarda opções conformes',async()=>{
 const select={...item,tipo_resposta:'SELECT',configuracao:{opcoes:['Bom','Ruim'],opcoes_conformes:['Bom']}};
 const duplicate=checked(await sessions[0].rpc('admin_save_checklist',{payload:{...payload,nome:payload.nome+' cópia',itens:[select]}}));
 const revision=checked(await sessions[0].rpc('admin_save_checklist',{payload:{...payload,revisao:'02'}}));
 assert.notEqual(duplicate,template.id);assert.notEqual(revision,template.id);
 assert.deepEqual(checked(await admin.from('checklist_template_items').select('configuracao').eq('template_id',duplicate).single()).configuracao,select.configuracao);
});
test('desativação preserva registros e OP; DELETE físico é negado mesmo ao ADMIN',async()=>{
 for(const table of ['production_lines','products','checklist_templates','checklist_template_items','profiles']) denied(await sessions[0].from(table).delete().eq('id',randomUUID()));
 checked(await sessions[0].from('production_lines').update({ativa:false}).eq('id',line.id));
 checked(await sessions[0].from('products').update({ativo:false}).eq('id',product.id));
 checked(await sessions[0].from('checklist_templates').update({ativo:false}).eq('id',template.id));
 assert.equal(checked(await admin.from('production_orders').select('produto_id').eq('id',order.id).single()).produto_id,product.id);
 assert.equal(checked(await admin.from('production_order_checklist').select('id').eq('id',snapshot.id).single()).id,snapshot.id);
});
