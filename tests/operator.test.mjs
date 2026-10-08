import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { checked, localClient } from '../scripts/local-supabase.mjs';
import { operatorFixture } from './fixtures/operator.mjs';
let f;
const denied=result=>assert.ok(result.error,'A operação deveria ser negada pelo banco');
before(async()=>{f=await operatorFixture('operator-db');});
after(async()=>{if(f)await f.cleanup();});
async function closeNcs(id){const ncs=checked(await f.admin.from('non_conformities').select('id').eq('production_order_id',id).not('status','in','(CLOSED,CANCELLED)'));for(const nc of ncs){checked(await f.clients[2].from('non_conformities').update({status:'AWAITING_QUALITY',acao_imediata:'Correção realizada',responsavel_id:f.users[2].id,observacao_cq:'Correção conferida'}).eq('id',nc.id));checked(await f.clients[2].from('non_conformities').update({status:'CLOSED'}).eq('id',nc.id));}}
const submit=async(id,produced=100,lost=0)=>f.clients[3].rpc('operator_submit_order',{order_id:id,expected_version:(await f.read(id)).version,produced,lost,final_note:'Produção conferida'});

test('RLS da lista: atribuição, linha, outra linha, rascunho e linha inativa',async()=>{
 const own=await f.create(), byLine=await f.create({assigned:null}), other=await f.create({assigned:f.users[4].id,lineId:'10000000-0000-4000-8000-000000000002'}), draft=await f.create({released:false});
 assert.deepEqual(new Set(checked(await f.clients[3].from('pcp_order_list').select('id').in('id',[own,byLine,other,draft])).map(row=>row.id)),new Set([own,byLine]));
 checked(await f.admin.from('production_lines').update({ativa:false}).eq('id',f.line.id));
 assert.equal(checked(await f.clients[3].from('pcp_order_list').select('id').eq('id',byLine)).length,0);assert.equal(checked(await f.clients[3].from('production_orders').select('id').eq('id',own)).length,1);
 checked(await f.admin.from('production_lines').update({ativa:true}).eq('id',f.line.id));
 denied(await f.clients[3].rpc('operator_start_order',{order_id:other,expected_version:(await f.read(other)).version}));
});
test('início concorrente tem um vencedor e atribui usuário atual com horário/auditoria reais',async()=>{
 const id=await f.create({assigned:null}), version=(await f.read(id)).version;
 const results=await Promise.all([1,2].map(()=>f.clients[3].rpc('operator_start_order',{order_id:id,expected_version:version})));assert.equal(results.filter(result=>!result.error).length,1);
 const row=await f.read(id);assert.equal(row.status,'IN_PRODUCTION');assert.equal(row.operador_responsavel_id,f.users[3].id);assert.ok(row.inicio_producao);assert.equal(row.version,version+1);
 assert.ok(checked(await f.admin.from('audit_logs').select().eq('production_order_id',id).eq('field','status')).some(log=>log.new_value==='IN_PRODUCTION'&&log.user_id===f.users[3].id));
});
test('API direta não permite roubar responsável nem alterar planejamento, CQ, autor ou relógio',async()=>{
 const id=await f.create({assigned:f.users[4].id});denied(await f.clients[3].from('production_orders').update({status:'IN_PRODUCTION',operador_responsavel_id:f.users[3].id}).eq('id',id));await f.start(id);assert.equal((await f.read(id)).operador_responsavel_id,f.users[4].id);
 for(const patch of [{quantidade_planejada:300},{linha_id:'10000000-0000-4000-8000-000000000002'},{aprovacao_cq:"APPROVED"},{aprovacao_pcp:"APPROVED"},{status:'FINALIZED'},{inicio_producao:'2000-01-01T00:00:00Z'}])denied(await f.clients[3].from('production_orders').update(patch).eq('id',id));
 const item=(await f.items(id))[1];for(const patch of [{valor_numero:10,conforme:true},{valor_numero:10,medido_por:f.users[4].id},{valor_numero:10,data_medicao:'2000-01-01T00:00:00Z'},{valor_minimo:0},{revisado_cq:true}])denied(await f.clients[3].from('production_order_checklist').update(patch).eq('id',item.id));
});
test('NUMBER inclui limites, rejeita não finito e exige observação fora da tolerância também via PATCH',async()=>{
 const id=await f.create();await f.start(id);
 for(const valor of ['9','11']){checked(await f.measure(id,1,{valor}));assert.equal((await f.items(id))[1].conforme,true);}
 const item=(await f.items(id))[1];denied(await f.clients[3].from('production_order_checklist').update({valor_numero:8}).eq('id',item.id));assert.equal((await f.read(id)).status,'IN_PRODUCTION');
 for(const valor of ['NaN','Infinity','-Infinity',''])denied(await f.measure(id,1,{valor}));
 checked(await f.measure(id,5,{valor:'5'}));assert.equal((await f.items(id))[5].conforme,true);checked(await f.measure(id,5,{valor:'4',observacao:'Temperatura menor que referência'}));assert.equal((await f.items(id))[5].conforme,false);assert.equal((await f.read(id)).status,'IN_PRODUCTION');
});
test('BOOLEAN e SELECT usam snapshot/configuração, TEXT exige texto; entrada arbitrária não altera definição',async()=>{
 const id=await f.create();await f.start(id);checked(await f.measure(id,0,{valor:'false'}));assert.equal((await f.items(id))[0].conforme,true);
 denied(await f.measure(id,2,{valor:'Opção inventada'}));denied(await f.measure(id,2,{valor:'Ruim'}));checked(await f.measure(id,2,{valor:'Ruim',observacao:'Acabamento irregular'}));assert.equal((await f.items(id))[2].conforme,false);assert.equal((await f.read(id)).status,'IN_PRODUCTION');
 denied(await f.measure(id,3,{valor:'  '}));checked(await f.measure(id,3,{valor:'Etiqueta conferida'}));assert.equal((await f.items(id))[3].conforme,true);
 denied(await f.measure(id,0,{valor:'false',conforme:true}));denied(await f.measure(id,0,{valor:'true'}));
 checked(await f.measure(id,0,{valor:'true',observacao:'Vazamento encontrado'}));assert.equal((await f.read(id)).status,'BLOCKED_QUALITY');
});
test('PHOTO e evidência opcional exigem objeto privado real da OP; URL pública/arquivo ausente são negados',async()=>{
 const id=await f.create();await f.start(id);denied(await f.measure(id,4,{foto_path:`${id}/missing.png`}));denied(await f.measure(id,4,{foto_path:`${randomUUID()}/foreign.png`}));
 const path=await f.upload(id);checked(await f.measure(id,4,{foto_path:path}));checked(await f.measure(id,1,{valor:'10',foto_path:path}));assert.equal((await f.items(id))[1].foto_path,path);
 const signed=checked(await f.clients[3].storage.from('operator-evidence').createSignedUrl(path,60));assert.equal((await fetch(signed.signedUrl)).status,200);assert.notEqual((await fetch(f.clients[3].storage.from('operator-evidence').getPublicUrl(path).data.publicUrl)).status,200);
 denied(await f.clients[4].storage.from('operator-evidence').createSignedUrl(path,60));denied(await f.clients[3].storage.from('operator-evidence').upload(path,Buffer.from('x'),{contentType:'image/png',upsert:true}));
});
test('bloqueio, NC automática, autoria, notificação e auditoria são atômicos; não duplicam após bloqueio',async()=>{
 const id=await f.create();await f.start(id);const path=await f.upload(id);checked(await f.measure(id,1,{valor:'8',observacao:'Diâmetro abaixo do limite',foto_path:path}));
 const nc=checked(await f.admin.from('non_conformities').select().eq('production_order_id',id));assert.equal(nc.length,1);assert.equal(nc[0].created_by,f.users[3].id);assert.equal(nc[0].impeditiva,true);assert.equal(nc[0].evidencia_antes_path,path);
 const notices=checked(await f.clients[2].from('notifications').select().eq('reference_id',id));assert.equal(notices.length,1);assert.equal(notices[0].tipo,'BLOCKED_QUALITY');
 denied(await f.measure(id,1,{valor:'7',observacao:'Repetição'}));assert.equal(checked(await f.admin.from('non_conformities').select('id').eq('production_order_id',id)).length,1);
 denied(await f.clients[3].from('non_conformities').update({impeditiva:false}).eq('id',nc[0].id));
 assert.ok(checked(await f.admin.from('audit_logs').select().eq('production_order_id',id).eq('field','status')).some(log=>log.new_value==='BLOCKED_QUALITY'&&log.user_id===f.users[3].id));
});
test('falha na criação de NC desfaz medição, bloqueio, notificação e auditoria integralmente',async()=>{
 const id=await f.create();await f.start(id);const originalItems=await f.items(id), originalOrder=await f.read(id), audits=checked(await f.admin.from('audit_logs').select('id').eq('production_order_id',id));
 const sql=`create function private.operator_test_fail_nc() returns trigger language plpgsql set search_path='' as $$ begin if new.production_order_id='${id}'::uuid then raise exception 'Falha NC de teste'; end if; return new; end $$; create trigger operator_test_fail_nc before insert on public.non_conformities for each row execute function private.operator_test_fail_nc();`;
 execFileSync('docker',['exec','supabase_db_op-digital','psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-c',sql],{stdio:['ignore','pipe','pipe']});
 try{denied(await f.measure(id,1,{valor:'8',observacao:'Fora de tolerância'}));assert.deepEqual(await f.items(id),originalItems);assert.deepEqual(await f.read(id),originalOrder);assert.equal(checked(await f.admin.from('audit_logs').select('id').eq('production_order_id',id)).length,audits.length);assert.equal(checked(await f.clients[2].from('notifications').select('id').eq('reference_id',id)).length,0);}
 finally{execFileSync('docker',['exec','supabase_db_op-digital','psql','-U','postgres','-d','postgres','-c','drop trigger operator_test_fail_nc on public.non_conformities; drop function private.operator_test_fail_nc();'],{stdio:['ignore','pipe','pipe']});}
});
test('apontamentos dos sete tipos têm autor/horário reais, opcionais e foto validada; burlas são negadas',async()=>{
 const id=await f.create();await f.start(id);const path=await f.upload(id);
 for(const tipo of ['OBSERVACAO','PARADA','PERDA','AJUSTE','RETRABALHO','MANUTENCAO','SEGURANCA']){
 const target=checked(await f.clients[3].rpc('operator_add_note',{order_id:id,payload:{tipo,descricao:'Registro legítimo',tempo_minutos:0,quantidade:0,unidade:'UN',foto_path:path}}));const note=checked(await f.admin.from('production_notes').select().eq('id',target).single());assert.equal(note.created_by,f.users[3].id);assert.ok(note.created_at);assert.equal(note.quantidade,0);}
 for(const payload of [{tipo:'PARADA',descricao:' '},{tipo:'PERDA',descricao:'Teste',quantidade:-1},{tipo:'AJUSTE',descricao:'Teste',foto_path:`${id}/fake.png`},{tipo:'OBSERVACAO',descricao:'Teste',created_by:f.users[4].id}])denied(await f.clients[3].rpc('operator_add_note',{order_id:id,payload}));
 denied(await f.clients[3].from('production_notes').insert({production_order_id:id,tipo:'PARADA',descricao:'Falso',created_by:f.users[4].id}));
 denied(await f.clients[3].from('production_notes').insert({production_order_id:id,tipo:'PRODUCAO',descricao:'Tipo legado indisponível para novos apontamentos'}));
});
test('envio CQ rejeita checklist incompleto, quantidades ausentes/negativas, NC ou item impeditivos via API direta',async()=>{
 const id=await f.create();await f.start(id);denied(await submit(id));await f.complete(id);
 for(const [produced,lost] of [[null,0],[100,null],[-1,0],[100,-1]])denied(await submit(id,produced,lost));
 checked(await f.clients[3].from('non_conformities').insert({production_order_id:id,codigo_nc:`NC-${randomUUID()}`,tipo:'SEGURANCA',descricao:'Impedimento manual',severidade:'HIGH'}).select().single());
 denied(await submit(id));denied(await f.clients[3].from('production_orders').update({status:'AWAITING_QUALITY',quantidade_produzida:100,quantidade_perdida:0}).eq('id',id));
 await closeNcs(id);
 // Simulate a quality-resumed OP whose blocking measurement has not yet been corrected.
 checked(await f.admin.from('production_order_checklist').update({conforme:false}).eq('id',(await f.items(id))[1].id));
 checked(await f.admin.from('production_orders').update({status:'IN_PRODUCTION'}).eq('id',id));denied(await submit(id));
 checked(await f.measure(id,1,{valor:'10'}));await closeNcs(id);checked(await submit(id));
 assert.equal((await f.read(id)).status,'AWAITING_QUALITY');assert.ok((await f.read(id)).fim_producao);assert.equal((await f.read(id)).quantidade_perdida,0);
});
test('fluxo completo permite opcionais vazios, quantidades zero, notifica CQ e bloqueia novas medições/apontamentos',async()=>{
 const id=await f.create();await f.start(id);await f.complete(id);checked(await submit(id,0,0));const order=await f.read(id);assert.equal(order.status,'AWAITING_QUALITY');assert.equal(order.quantidade_produzida,0);assert.equal((await f.items(id))[5].data_medicao,null);
 assert.equal(checked(await f.clients[2].from('notifications').select().eq('reference_id',id).eq('tipo','AWAITING_QUALITY')).length,1);denied(await submit(id));denied(await f.measure(id,0,{valor:'false'}));denied(await f.clients[3].rpc('operator_add_note',{order_id:id,payload:{tipo:'OBSERVACAO',descricao:'Registro tardio'}}));
});
test('concorrência e versão do item impedem sobreposição; PCP/CQ/ADMIN/anônimo não executam RPCs de operador',async()=>{
 const id=await f.create();await f.start(id);const item=(await f.items(id))[1];
 const results=await Promise.all([9,11].map(valor=>f.clients[3].rpc('operator_save_measure',{order_id:id,item_id:item.id,expected_updated_at:item.updated_at,payload:{valor:String(valor)}})));assert.equal(results.filter(result=>!result.error).length,1);
 for(const client of [f.clients[0],f.clients[1],f.clients[2],localClient()]){denied(await client.rpc('operator_start_order',{order_id:id,expected_version:(await f.read(id)).version}));denied(await client.rpc('operator_save_measure',{order_id:id,item_id:item.id,expected_updated_at:(await f.items(id))[1].updated_at,payload:{valor:'10'}}));denied(await client.rpc('operator_add_note',{order_id:id,payload:{tipo:'OBSERVACAO',descricao:'Teste'}}));denied(await client.rpc('operator_submit_order',{order_id:id,expected_version:(await f.read(id)).version,produced:100,lost:0,final_note:''}));}
});
test('token válido perde acesso imediatamente após perfil inativado',async()=>{
 const id=await f.create();checked(await f.admin.from('profiles').update({ativo:false}).eq('id',f.users[3].id));
 denied(await f.clients[3].rpc('operator_start_order',{order_id:id,expected_version:(await f.read(id)).version}));assert.equal(checked(await f.clients[3].from('production_orders').select('id').eq('id',id)).length,0);
});
