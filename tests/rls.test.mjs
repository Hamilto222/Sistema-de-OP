import { test, before, after } from 'node:test';
import { renderStoredReport } from '../src/features/finalization/generate.ts';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { localConfig, localAdmin, localClient, checked } from '../scripts/local-supabase.mjs';
import { productionPdf } from './fixtures/pdf.mjs';
import { seedUsers, testPassword } from '../supabase/seed/users.mjs';

let config, admin, users, sessions, ids, checklistIds, notificationId, inactiveClient, inactiveId;
const suffix = `-test-${Date.now()}`;
const password = testPassword();

before(async () => {
  config = localConfig(); admin = localAdmin(config);
  users = await seedUsers(password, suffix);
  sessions = [];
  for (const user of users) {
    const client = localClient(config);
    checked(await client.auth.signInWithPassword({ email: user.email, password }));
    sessions.push(client);
  }
  const inactive = checked(await admin.auth.admin.createUser({ email: `inactive${suffix}@opdigital.example`, password, email_confirm: true, user_metadata: { role: 'ADMIN', ativo: true, nome: 'Perfil inativo' } })).user;
  inactiveId = inactive.id; inactiveClient = localClient(config);
  checked(await inactiveClient.auth.signInWithPassword({ email: inactive.email, password }));
  ids = [randomUUID(),randomUUID(),randomUUID(),randomUUID()];
  const orders = ids.map((id,index) => ({ id, numero_op: `TEST-${suffix}-${index}`, produto_id: '30000000-0000-4000-8000-000000000001', lote: 'TESTE', linha_id: index === 2 ? '10000000-0000-4000-8000-000000000002' : '10000000-0000-4000-8000-000000000001', quantidade_planejada: 100, unidade: 'UN', status: index === 3 ? 'DRAFT' : 'IN_PRODUCTION', inicio_producao: index === 3 ? null : new Date().toISOString(), operador_responsavel_id: index === 0 ? users[3].id : null, created_by: users[1].id }));
  checked(await admin.from('production_orders').insert(orders));
  checklistIds = [randomUUID(),randomUUID(),randomUUID()];
  checked(await admin.from('production_order_checklist').insert(checklistIds.map((id,index) => ({ id, production_order_id: ids[index], ordem: 1, item: 'Medida de teste', tipo_resposta: 'NUMBER', valor_minimo: 9, valor_maximo: 11, obrigatorio: true }))));
  notificationId = randomUUID();
  checked(await admin.from('notifications').insert({ id: notificationId, user_id: users[3].id, tipo: 'TESTE', titulo: 'Teste', mensagem: 'Teste' }));
});

// Records deliberately remain in isolated local development DB as auditable test history.
// Users are deactivated after testing so repeated runs never leave active test accounts.
after(async () => {
  if (admin && users) checked(await admin.from('profiles').update({ ativo: false }).in('id',users.map(user=>user.id)));
});

const denied = result => assert.ok(result.error, 'A operação deveria ser negada pelo banco');

test('migrations: onze tabelas com RLS e vínculo profiles → Auth', () => {
  const sql = "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity and c.relname in ('profiles','production_lines','products','checklist_templates','checklist_template_items','production_orders','production_order_checklist','production_notes','non_conformities','audit_logs','notifications')";
  const count=execFileSync('docker',['exec','supabase_db_op-digital','psql','-U','postgres','-d','postgres','-Atc',sql],{encoding:'utf8'}).trim();
  assert.equal(count,'11');
  const fk="select count(*) from pg_constraint where conrelid='public.profiles'::regclass and confrelid='auth.users'::regclass and contype='f'";
  assert.equal(execFileSync('docker',['exec','supabase_db_op-digital','psql','-U','postgres','-d','postgres','-Atc',fk],{encoding:'utf8'}).trim(),'1');
});

test('provedor e-mail habilitado; cadastro público desabilitado', async () => {
  const response=await fetch(config.url+'/auth/v1/settings',{headers:{apikey:config.key}});
  assert.equal(response.status,200);
  const settings=await response.json();
  assert.equal(settings.external.email,true); assert.equal(settings.disable_signup,true);
  denied(await localClient(config).auth.signUp({email:`signup${suffix}@opdigital.example`,password}));
});

test('seed: 2 linhas, 3 produtos, 3 modelos e pelo menos 12 itens', async () => {
  for (const [table,count] of [['production_lines',2],['products',3],['checklist_templates',3],['checklist_template_items',12]]) {
    const result = await admin.from(table).select('*',{count:'exact',head:true}); checked(result); assert.ok(result.count>=count,table);
  }
  assert.deepEqual(users.map(u=>u.role),['ADMIN','PCP','QUALIDADE','OPERADOR','OPERADOR']);
});

test('perfil Auth nasce inativo e ignora role/ativo dos metadados', async () => {
  const profile=checked(await admin.from('profiles').select('*').eq('id',inactiveId).single());
  assert.equal(profile.role,'OPERADOR'); assert.equal(profile.ativo,false);
});

test('anônimo e inativo não acessam OPs ou catálogo', async () => {
  const anonymous=localClient(config);
  const anon=await anonymous.from('production_orders').select('id');
  assert.ok(anon.error || anon.data.length===0);
  assert.equal(checked(await inactiveClient.from('production_orders').select('id')).length,0);
  assert.equal(checked(await inactiveClient.from('products').select('id')).length,0);
  denied(await inactiveClient.from('production_lines').insert({nome:'X',setor:'X'}));
});

test('ADMIN e PCP acessam todas as OPs; QUALIDADE não vê rascunhos', async () => {
  for (const client of sessions.slice(0,2)) assert.equal(checked(await client.from('production_orders').select('id').in('id',ids)).length,4);
  assert.equal(checked(await sessions[2].from('production_orders').select('id').in('id',ids)).length,3);
});

test('operador vê atribuição individual/linha; outra linha e rascunho ficam ocultos', async () => {
  const visible=checked(await sessions[3].from('production_orders').select('id').in('id',ids));
  assert.deepEqual(new Set(visible.map(o=>o.id)),new Set(ids.slice(0,2)));
  const hidden=await sessions[3].from('production_order_checklist').update({valor_numero:10}).eq('id',checklistIds[2]).select('id');
  assert.equal(checked(hidden).length,0);
  const other=checked(await sessions[4].from('production_orders').select('id').in('id',ids));
  assert.deepEqual(other.map(o=>o.id),[ids[2]]);
});

test('PCP prepara/libera OP; atribuição individual e linha funcionam com outro responsável', async () => {
  const base={numero_op:`FLOW-${suffix}`,produto_id:'30000000-0000-4000-8000-000000000001',lote:'TESTE',linha_id:'10000000-0000-4000-8000-000000000001',quantidade_planejada:10,unidade:'UN',operador_responsavel_id:users[4].id};
  denied(await sessions[1].from('production_orders').insert({...base,status:'IN_PRODUCTION'}));
  const order=checked(await sessions[1].from('production_orders').insert(base).select().single());
  assert.equal(order.created_by,users[1].id);
  assert.equal(checked(await sessions[4].from('production_orders').select('id').eq('id',order.id)).length,0);
  const item=checked(await sessions[1].from('production_order_checklist').insert({production_order_id:order.id,ordem:1,item:'Preparação',tipo_resposta:'BOOLEAN'}).select().single());
  const forged=await sessions[1].from('production_order_checklist').insert({production_order_id:order.id,ordem:2,item:'Falso',tipo_resposta:'BOOLEAN',resposta_boolean:true,medido_por:users[3].id});
  denied(forged); assert.equal(forged.error.code,'42501');
  denied(await sessions[1].from('production_orders').update({status:'RELEASED'}).eq('id',order.id));
  const path=`${order.id}/original.pdf`;
  checked(await sessions[1].storage.from('op-originals').upload(path,productionPdf(),{contentType:'application/pdf'}));
  checked(await sessions[1].from('production_orders').update({status:'PREPARING',pdf_original_path:path}).eq('id',order.id));
  checked(await sessions[1].from('production_orders').update({status:'RELEASED'}).eq('id',order.id));
  assert.equal(checked(await sessions[4].from('production_orders').select('id').eq('id',order.id)).length,1);
  assert.equal(checked(await sessions[3].from('production_orders').select('id').eq('id',order.id)).length,1);
  const started=checked(await sessions[3].from('production_orders').update({status:'IN_PRODUCTION'}).eq('id',order.id).select().single());
  assert.ok(started.inicio_producao);
  checked(await sessions[3].from('production_order_checklist').update({resposta_boolean:true}).eq('id',item.id));
});

test('operador não altera planejamento, CQ, finalização ou perfil', async () => {
  for (const patch of [{quantidade_planejada:999},{linha_id:'10000000-0000-4000-8000-000000000002'},{aprovacao_cq:"APPROVED"},{status:'FINALIZED'},{aprovacao_pcp:"APPROVED"},{created_by:users[0].id},{version:999}]) denied(await sessions[3].from('production_orders').update(patch).eq('id',ids[0]));
  const result=await sessions[3].from('profiles').update({role:'ADMIN',ativo:true,can_reopen_orders:true}).eq('id',users[3].id).select('role');
  assert.equal(checked(result).length,0);
  assert.equal(checked(await admin.from('profiles').select('role').eq('id',users[3].id).single()).role,'OPERADOR');
});

test('PCP e CQ não podem falsificar medições; operador não pode revisar', async () => {
  denied(await sessions[1].from('production_order_checklist').update({valor_numero:10,medido_por:users[3].id}).eq('id',checklistIds[0]));
  denied(await sessions[2].from('production_order_checklist').update({valor_numero:10}).eq('id',checklistIds[0]));
  denied(await sessions[3].from('production_order_checklist').update({revisado_cq:true}).eq('id',checklistIds[0]));
  denied(await sessions[1].from('production_orders').update({quantidade_produzida:999}).eq('id',ids[0]));
  denied(await sessions[1].from('production_notes').insert({production_order_id:ids[0],tipo:'PRODUCAO',descricao:'Falso',created_by:users[3].id}));
});

test('medição legítima usa identidade/horário do banco e calcula conformidade', async () => {
  const before=checked(await admin.from('production_order_checklist').select('updated_at').eq('id',checklistIds[0]).single());
  const row=checked(await sessions[3].from('production_order_checklist').update({valor_numero:10}).eq('id',checklistIds[0]).select().single());
  assert.equal(row.medido_por,users[3].id); assert.equal(row.conforme,true); assert.ok(row.data_medicao); assert.notEqual(row.updated_at,before.updated_at);
  denied(await sessions[3].from('production_order_checklist').update({valor_numero:10,medido_por:users[4].id}).eq('id',checklistIds[0]));
  denied(await sessions[3].from('production_order_checklist').update({valor_numero:10,resposta_boolean:true}).eq('id',checklistIds[0]));
});

test('medição fora da tolerância bloqueia a OP atomicamente', async () => {
  const row=checked(await sessions[3].from('production_order_checklist').update({valor_numero:20,observacao:"Medição acima do limite"}).eq('id',checklistIds[1]).select().single());
  assert.equal(row.conforme,false);
  const order=checked(await sessions[3].from('production_orders').select('status,version').eq('id',ids[1]).single());
  assert.equal(order.status,'BLOCKED_QUALITY'); assert.equal(order.version,2);
});

test('apontamentos não permitem falsificação de autoria', async () => {
  denied(await sessions[3].from('production_notes').insert({production_order_id:ids[0],tipo:'OBSERVACAO',descricao:'Teste',created_by:users[4].id}));
  checked(await sessions[3].from('production_notes').insert({production_order_id:ids[0],tipo:'OBSERVACAO',descricao:'Teste legítimo'}));
});

test('operador não fecha/aprova NC; item de outra OP não é aceito', async () => {
  const base={codigo_nc:`NC-${suffix}`,production_order_id:ids[0],tipo:'PROCESSO',descricao:'Teste',severidade:'MEDIUM'};
  denied(await sessions[3].from('non_conformities').insert({...base,status:'CLOSED',aprovado_cq:true,data_fechamento:new Date().toISOString()}));
  denied(await sessions[3].from('non_conformities').insert({...base,checklist_item_id:checklistIds[2]}));
  const nc=checked(await sessions[3].from('non_conformities').insert(base).select().single());
  denied(await sessions[3].from('non_conformities').update({aprovado_cq:true}).eq('id',nc.id));
});

test('aprovação CQ e finalização PCP têm autor real e requisitos', async () => {
  denied(await sessions[2].from('production_orders').update({aprovacao_cq:"APPROVED"}).eq('id',ids[0]));
  checked(await sessions[2].from('non_conformities').update({impeditiva:false}).eq('production_order_id',ids[0]));
  checked(await sessions[3].from('production_orders').update({status:'AWAITING_QUALITY',quantidade_produzida:100,quantidade_perdida:0}).eq('id',ids[0]));
  checked(await sessions[2].from('production_order_checklist').update({revisado_cq:true}).eq('id',checklistIds[0]));
  checked(await sessions[2].from('non_conformities').update({impeditiva:true}).eq('production_order_id',ids[0]));
  // Open blocking NC prevents approval even with reviewed checklist.
  denied(await sessions[2].from('production_orders').update({status:'AWAITING_PCP',aprovacao_cq:"APPROVED"}).eq('id',ids[0]));
  checked(await sessions[2].from('non_conformities').update({status:'AWAITING_QUALITY',acao_imediata:'Correção realizada',responsavel_id:users[2].id,observacao_cq:'Correção verificada'}).eq('production_order_id',ids[0]));
  checked(await sessions[2].from('non_conformities').update({status:'CLOSED'}).eq('production_order_id',ids[0]));
  const cq=checked(await sessions[2].from('production_orders').update({status:'AWAITING_PCP',aprovacao_cq:"APPROVED"}).eq('id',ids[0]).select().single());
  assert.equal(cq.responsavel_cq_id,users[2].id); assert.ok(cq.data_aprovacao_cq);
  const final=checked(await sessions[1].from('production_orders').update({status:'FINALIZED',aprovacao_pcp:"APPROVED",empresa_nome:'Empresa de teste RLS'}).eq('id',ids[0]).select().single());
  assert.equal(final.responsavel_pcp_id,users[1].id); assert.ok(final.data_finalizacao);
  const report=checked(await sessions[1].from('final_reports').select('id').eq('production_order_id',ids[0]).single());await renderStoredReport(sessions[1],report.id);
  denied(await sessions[3].from('production_order_checklist').update({valor_numero:10}).eq('id',checklistIds[0]));
  denied(await sessions[1].from('production_orders').update({status:'REOPENED',motivo_reabertura:'Correção'}).eq('id',ids[0]));
  checked(await sessions[0].from('profiles').update({can_reopen_orders:true}).eq('id',users[1].id));
  const reopened=checked(await sessions[1].from('production_orders').update({status:'REOPENED',motivo_reabertura:'Correção autorizada'}).eq('id',ids[0]).select().single());
  assert.equal(reopened.aprovacao_cq,null); assert.equal(reopened.aprovacao_pcp,null); assert.equal(reopened.data_finalizacao,null);
  const review=checked(await sessions[2].from('production_order_checklist').select('*').eq('id',checklistIds[0]).single());
  assert.equal(review.revisado_cq,false); assert.equal(review.valor_numero,10);
});

test('auditoria registra autor e valores; nem ADMIN pode alterar/excluir/inserir logs', async () => {
  const logs=checked(await sessions[0].from('audit_logs').select('*').eq('entity_id',checklistIds[0]).eq('field','valor_numero'));
  assert.ok(logs.some(log=>log.user_id===users[3].id && log.new_value===10));
  denied(await sessions[0].from('audit_logs').update({action:'FALSO'}).eq('id',logs[0].id));
  denied(await sessions[0].from('audit_logs').delete().eq('id',logs[0].id));
  denied(await sessions[0].from('audit_logs').insert({entity:'X',entity_id:ids[0],action:'FALSO'}));
});

test('notificações limitadas ao destinatário; somente lida pode ser alterada', async () => {
  assert.equal(checked(await sessions[4].from('notifications').select('id').eq('id',notificationId)).length,0);
  denied(await sessions[3].from('notifications').update({titulo:'Falso'}).eq('id',notificationId));
  checked(await sessions[3].from('notifications').update({lida:true}).eq('id',notificationId));
});

test('Storage privado, políticas por OP/bucket e URL assinada', async () => {
  const buckets=checked(await admin.storage.listBuckets()).filter(b=>['op-originals','quality-evidence','operator-evidence','final-reports'].includes(b.id));
  assert.equal(buckets.length,4); assert.ok(buckets.every(b=>!b.public));
  const path=`${ids[2]}/test.pdf`;
  // Fixture histórica criada pelo cliente de manutenção; ADMIN comum não escreve depois da liberação.
  checked(await admin.storage.from('op-originals').upload(path,productionPdf(),{contentType:'application/pdf'}));
  denied(await sessions[0].storage.from('op-originals').upload(`${ids[2]}/admin-illegal.pdf`,productionPdf(),{contentType:'application/pdf'}));
  const anonymous=localClient(config);
  denied(await anonymous.storage.from('op-originals').createSignedUrl(path,60));
  denied(await sessions[3].storage.from('op-originals').createSignedUrl(path,60));
  denied(await inactiveClient.storage.from('op-originals').createSignedUrl(path,60));
  denied(await sessions[4].storage.from('op-originals').upload(`${ids[2]}/illegal.pdf`,Buffer.from('%PDF'),{contentType:'application/pdf'}));
  const signed=checked(await sessions[4].storage.from('op-originals').createSignedUrl(path,60));
  assert.equal((await fetch(signed.signedUrl)).status,200);
  const publicUrl=admin.storage.from('op-originals').getPublicUrl(path).data.publicUrl;
  assert.notEqual((await fetch(publicUrl)).status,200);
});

test('desativação bloqueia token previamente válido e linha inativa remove acesso por linha', async () => {
  checked(await admin.from('production_lines').update({ativa:false}).eq('id','10000000-0000-4000-8000-000000000002'));
  assert.equal(checked(await sessions[4].from('production_orders').select('id').eq('id',ids[2])).length,0);
  checked(await admin.from('production_lines').update({ativa:true}).eq('id','10000000-0000-4000-8000-000000000002'));
  checked(await admin.from('profiles').update({ativo:false}).eq('id',users[3].id));
  assert.equal(checked(await sessions[3].from('production_orders').select('id').in('id',ids)).length,0);
  assert.equal(checked(await sessions[3].from('products').select('id')).length,0);
});
