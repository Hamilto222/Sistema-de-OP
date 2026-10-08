import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { localAdmin, localClient, checked } from '../scripts/local-supabase.mjs';
import { seedUsers, testPassword } from '../supabase/seed/users.mjs';
import { productionPdf } from './fixtures/pdf.mjs';
let admin, users, clients, id, line, product, model;
const password=testPassword(), suffix=`-pcp-db-${Date.now()}`;
const item={ordem:1,grupo:'Preparação',item:'Há vazamento?',descricao:'Verificar o equipamento',tipo_resposta:'BOOLEAN',unidade:null,valor_minimo:null,valor_maximo:null,obrigatorio:true,momento:'ANTES',requer_revisao_cq:true,bloqueia_op_se_nao_conforme:true,configuracao:{resposta_conforme:false}};
const input=()=>({numero_op:`OP${suffix}-${randomUUID().slice(0,8)}`,produto_id:product.id,lote:'Lote real',linha_id:line.id,quantidade_planejada:10,unidade:'UN',prioridade:'ALTA',data_hora_programada:'2026-10-08T23:45',operador_responsavel_id:users[3].id});
async function readOrder(target){return checked(await admin.from('production_orders').select().eq('id',target).single());}
async function attach(target,client=clients[1]){const row=await readOrder(target);const path=`${target}/${randomUUID()}.pdf`;checked(await client.storage.from('op-originals').upload(path,productionPdf(),{contentType:'application/pdf'}));checked(await client.rpc('pcp_attach_original',{order_id:target,document_path:path,expected_version:row.version}));return path;}
const denied=result=>assert.ok(result.error,'A operação deveria ser negada');
before(async()=>{
 admin=localAdmin();users=await seedUsers(password,suffix);clients=[];
 for(const user of users){const client=localClient();checked(await client.auth.signInWithPassword({email:user.email,password}));clients.push(client);}
 line=checked(await clients[0].from('production_lines').insert({nome:`Linha${suffix}`,setor:'Montagem'}).select().single());
 model=checked(await clients[0].rpc('admin_save_checklist',{payload:{nome:`Modelo${suffix}`,revisao:'01',descricao:'Instruções do modelo',ativo:true,itens:[item,{...item,ordem:2,item:'Diâmetro',tipo_resposta:'NUMBER',unidade:'mm',valor_minimo:9,valor_maximo:11,momento:'DURANTE',configuracao:{}},{...item,ordem:3,item:'Acabamento',tipo_resposta:'SELECT',configuracao:{opcoes:['Bom','Ruim'],opcoes_conformes:['Bom']}}]}}));
 product=checked(await clients[0].from('products').insert({codigo:`PR${suffix}`,descricao:'Produto PCP',unidade:'UN',revisao:'01',checklist_template_id:model}).select().single());
});
after(async()=>{if(users)checked(await admin.from('profiles').update({ativo:false}).in('id',users.map(user=>user.id)));});

test('PCP cria rascunho real; horário e data persistem em São Paulo',async()=>{
 id=checked(await clients[1].rpc('pcp_create_order',{payload:input()}));const row=await readOrder(id);
 assert.equal(row.status,'DRAFT');assert.equal(row.created_by,users[1].id);assert.equal(row.pdf_original_path,null);assert.equal(row.data_programada,'2026-10-08');assert.equal(new Date(row.data_hora_programada).toISOString(),'2026-10-09T02:45:00.000Z');
});
test('número OP duplicado é rejeitado; catálogos inativos e operador inválido não são aceitos',async()=>{
 const row=await readOrder(id);denied(await clients[1].rpc('pcp_create_order',{payload:{...input(),numero_op:row.numero_op}}));
 checked(await admin.from('production_lines').update({ativa:false}).eq('id',line.id));denied(await clients[1].rpc('pcp_create_order',{payload:input()}));checked(await admin.from('production_lines').update({ativa:true}).eq('id',line.id));
 denied(await clients[1].rpc('pcp_create_order',{payload:{...input(),operador_responsavel_id:users[2].id}}));
 denied(await clients[1].rpc('pcp_create_order',{payload:{...input(),quantidade_planejada:0}}));
});
test('sem PDF real, preparar reverte sem itens/status intermediário/auditoria parcial',async()=>{
 const before=checked(await admin.from('audit_logs').select('id').eq('production_order_id',id));const row=await readOrder(id);
 denied(await clients[1].rpc('pcp_prepare_order',{order_id:id,expected_version:row.version}));assert.equal((await readOrder(id)).status,'DRAFT');assert.equal(checked(await admin.from('production_order_checklist').select('id').eq('production_order_id',id)).length,0);assert.equal(checked(await admin.from('audit_logs').select('id').eq('production_order_id',id)).length,before.length);
 denied(await clients[1].rpc('pcp_attach_original',{order_id:id,expected_version:row.version,document_path:`${id}/missing.pdf`}));
});
test('upload de PDF no bucket privado; caminho, MIME e tamanho verificados pelo banco',async()=>{
 const path=await attach(id);const row=await readOrder(id);assert.equal(row.pdf_original_path,path);assert.equal(row.status,'DRAFT');
 denied(await clients[1].storage.from('op-originals').upload(`${id}/arquivo.txt`,Buffer.from('texto'),{contentType:'text/plain'}));
 denied(await clients[1].rpc('pcp_attach_original',{order_id:id,document_path:`${randomUUID()}/foreign.pdf`,expected_version:row.version}));
 const bucket=checked(await admin.storage.getBucket('op-originals'));assert.equal(bucket.public,false);assert.equal(bucket.file_size_limit,20*1024*1024);
});
test('preparação simultânea libera exatamente uma vez, com snapshots completos e auditados',async()=>{
 const row=await readOrder(id);const results=await Promise.all([clients[1].rpc('pcp_prepare_order',{order_id:id,expected_version:row.version}),clients[1].rpc('pcp_prepare_order',{order_id:id,expected_version:row.version})]);
 assert.equal(results.filter(result=>!result.error).length,1);assert.equal(results.filter(result=>result.error).length,1);
 const released=await readOrder(id);assert.equal(released.status,'RELEASED');assert.equal(released.checklist_template_nome,`Modelo${suffix}`);assert.equal(released.checklist_template_revisao,'01');assert.equal(released.checklist_template_descricao,'Instruções do modelo');
 const rows=checked(await admin.from('production_order_checklist').select().eq('production_order_id',id).order('ordem'));assert.equal(rows.length,3);
 for(const key of Object.keys(item))assert.deepEqual(rows[0][key],item[key],key);
 assert.equal(rows[0].medido_por,null);assert.equal(rows[0].data_medicao,null);assert.equal(rows[0].revisado_cq,false);assert.equal(rows[1].valor_minimo,9);assert.deepEqual(rows[2].configuracao,{opcoes:['Bom','Ruim'],opcoes_conformes:['Bom']});
 const audits=checked(await admin.from('audit_logs').select().eq('production_order_id',id).eq('entity','production_orders').eq('field','status'));assert.ok(audits.some(log=>log.old_value==='DRAFT'&&log.new_value==='PREPARING'&&log.user_id===users[1].id));assert.ok(audits.some(log=>log.old_value==='PREPARING'&&log.new_value==='RELEASED'&&log.user_id===users[1].id));
});
test('alterar o modelo após liberar não altera os snapshots da OP',async()=>{
 const original=checked(await admin.from('production_order_checklist').select().eq('production_order_id',id));
 const template=checked(await admin.from('checklist_templates').select().eq('id',model).single());
 checked(await clients[0].rpc('admin_save_checklist',{payload:{id:model,updated_at:template.updated_at,nome:'Modelo alterado'+suffix,revisao:'02',ativo:true,itens:[{...item,item:'Definição alterada',configuracao:{resposta_conforme:true}}]}}));
 assert.deepEqual(checked(await admin.from('production_order_checklist').select().eq('production_order_id',id)),original);assert.equal((await readOrder(id)).checklist_template_revisao,'01');
});
test('produto sem modelo/sem itens provoca rollback mesmo após PREPARING',async()=>{
 const noModel=checked(await admin.from('products').insert({codigo:'NOMODEL'+suffix,descricao:'Sem modelo',unidade:'UN',revisao:'01'}).select().single());
 const empty=checked(await admin.from('checklist_templates').insert({nome:'Vazio'+suffix,revisao:'01'}).select().single());
 const emptyProduct=checked(await admin.from('products').insert({codigo:'EMPTY'+suffix,descricao:'Modelo vazio',unidade:'UN',revisao:'01',checklist_template_id:empty.id}).select().single());
 for(const productId of [noModel.id,emptyProduct.id]){
  const target=checked(await clients[1].rpc('pcp_create_order',{payload:{...input(),produto_id:productId}}));await attach(target);const row=await readOrder(target);const audits=checked(await admin.from('audit_logs').select('id').eq('production_order_id',target));
  denied(await clients[1].rpc('pcp_prepare_order',{order_id:target,expected_version:row.version}));assert.equal((await readOrder(target)).status,'DRAFT');assert.equal((await readOrder(target)).version,row.version);assert.equal(checked(await admin.from('production_order_checklist').select('id').eq('production_order_id',target)).length,0);assert.equal(checked(await admin.from('audit_logs').select('id').eq('production_order_id',target)).length,audits.length);
 }
});
test('ADMIN também cria/prepara; conflito de versão não modifica OP',async()=>{
 const target=checked(await clients[0].rpc('pcp_create_order',{payload:input()}));await attach(target,clients[0]);const row=await readOrder(target);
 denied(await clients[0].rpc('pcp_prepare_order',{order_id:target,expected_version:1}));assert.equal((await readOrder(target)).status,'DRAFT');checked(await clients[0].rpc('pcp_prepare_order',{order_id:target,expected_version:row.version}));assert.equal((await readOrder(target)).status,'RELEASED');
});
test('QUALIDADE, OPERADOR e anônimo não criam/preparam/anexam nem consultam dashboard PCP',async()=>{
 for(const client of [clients[2],clients[3],localClient()]){
  denied(await client.rpc('pcp_create_order',{payload:input()}));denied(await client.rpc('pcp_prepare_order',{order_id:id,expected_version:(await readOrder(id)).version}));denied(await client.rpc('pcp_attach_original',{order_id:id,expected_version:1,document_path:`${id}/fake.pdf`}));denied(await client.rpc('pcp_dashboard'));
 }
});
test('PDF assinado permite leitura temporária; endpoint público e troca após liberação são negados',async()=>{
 const row=await readOrder(id);const signed=checked(await clients[1].storage.from('op-originals').createSignedUrl(row.pdf_original_path,60));const response=await fetch(signed.signedUrl);assert.equal(response.status,200);assert.ok(Buffer.from(await response.arrayBuffer()).equals(productionPdf()));
 const url=localClient().storage.from('op-originals').getPublicUrl(row.pdf_original_path).data.publicUrl;assert.notEqual((await fetch(url)).status,200);
 denied(await clients[1].rpc('pcp_attach_original',{order_id:id,document_path:row.pdf_original_path,expected_version:row.version}));denied(await clients[1].storage.from('op-originals').upload(`${id}/late.pdf`,productionPdf(),{contentType:'application/pdf'}));
});
test('falha real no segundo item desfaz primeiro item, status, versão e auditoria',async()=>{
 const activeModel=checked(await admin.from('checklist_templates').insert({nome:'Atomic'+suffix,revisao:'01'}).select().single());
 checked(await admin.from('checklist_template_items').insert([{...item,template_id:activeModel.id},{...item,template_id:activeModel.id,ordem:2}]));
 const activeProduct=checked(await admin.from('products').insert({codigo:'ATOMIC'+suffix,descricao:'Teste transação',unidade:'UN',revisao:'01',checklist_template_id:activeModel.id}).select().single());
 const target=checked(await clients[1].rpc('pcp_create_order',{payload:{...input(),produto_id:activeProduct.id}}));await attach(target);const row=await readOrder(target);const auditBefore=checked(await admin.from('audit_logs').select('id').eq('production_order_id',target));
 const sql=`create function private.pcp_test_fail_midcopy() returns trigger language plpgsql set search_path='' as $$ begin if new.production_order_id='${target}'::uuid and new.ordem=2 then raise exception 'Falha de escrita no segundo item do teste'; end if; return new; end $$; create trigger pcp_test_fail_midcopy after insert on public.production_order_checklist for each row execute function private.pcp_test_fail_midcopy();`;
 execFileSync('docker',['exec','supabase_db_op-digital','psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-c',sql],{stdio:['ignore','pipe','pipe']});
 try{
  const result=await clients[1].rpc('pcp_prepare_order',{order_id:target,expected_version:row.version});denied(result);assert.match(result.error.message,/segundo item/);assert.equal((await readOrder(target)).status,'DRAFT');assert.equal((await readOrder(target)).version,row.version);assert.equal(checked(await admin.from('production_order_checklist').select('id').eq('production_order_id',target)).length,0);assert.equal(checked(await admin.from('audit_logs').select('id').eq('production_order_id',target)).length,auditBefore.length);
 }finally{execFileSync('docker',['exec','supabase_db_op-digital','psql','-U','postgres','-d','postgres','-c','drop trigger pcp_test_fail_midcopy on public.production_order_checklist; drop function private.pcp_test_fail_midcopy();'],{stdio:['ignore','pipe','pipe']});}
});
test('dashboard e view usam RLS e datas reais; contagens verificadas diretamente no PostgreSQL',async()=>{
 const stats=checked(await clients[1].rpc('pcp_dashboard'));
 const sql="select jsonb_build_object('liberadas',count(*) filter(where status='RELEASED'),'programadas_hoje',count(*) filter(where data_programada=(now() at time zone 'America/Sao_Paulo')::date and status<>'CANCELLED'),'finalizadas_hoje',count(*) filter(where status='FINALIZED' and (data_finalizacao at time zone 'America/Sao_Paulo')::date=(now() at time zone 'America/Sao_Paulo')::date)) from public.production_orders";
 const expected=JSON.parse(execFileSync('docker',['exec','supabase_db_op-digital','psql','-U','postgres','-d','postgres','-Atc',sql],{encoding:'utf8'}).trim());for(const key of Object.keys(expected))assert.equal(stats[key],expected[key]);
 const row=checked(await clients[1].from('pcp_order_list').select().eq('id',id).single());assert.equal(row.linha_nome,line.nome);assert.equal(row.produto_codigo,product.codigo);assert.equal(row.operador_nome,users[3].nome);
});
