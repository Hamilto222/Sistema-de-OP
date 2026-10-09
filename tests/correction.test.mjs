import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {checked} from '../scripts/local-supabase.mjs';
import {finalizationFixture} from './fixtures/finalization.mjs';
import {execFileSync} from 'node:child_process';
let f;
before(async()=>{f=await finalizationFixture('correction');checked(await f.clients[0].from('checklist_template_items').update({item:'Viscosidade',unidade:'cP',valor_minimo:3000,valor_maximo:3500}).eq('template_id',f.model).eq('ordem',2));});
after(async()=>f?.cleanup());
const nc=async id=>checked(await f.admin.from('non_conformities').select().eq('production_order_id',id).single());
const history=async(id,item)=>checked(await f.admin.from('checklist_measurements').select().eq('production_order_id',id).eq('checklist_item_id',item).order('sequence'));
async function treatment(id,fields={}){let n=await nc(id);return checked(await f.clients[2].from('non_conformities').update({status:'IN_TREATMENT',responsavel_id:f.users[3].id,acao_imediata:'Ajustar viscosidade conforme instrução.',observacao_cq:'Registrar nova tentativa após ajuste.',...fields}).eq('id',n.id).select().single());}
async function release(id,client=f.clients[2]){const n=await nc(id);return client.rpc('quality_release_correction',{nc_id:n.id,expected_version:(await f.read(id)).version,expected_updated_at:n.updated_at});}
async function close(id){const n=await nc(id);return f.clients[2].rpc('quality_close_correction',{nc_id:n.id,expected_version:(await f.read(id)).version,expected_updated_at:n.updated_at,observation:'Correção conforme, revisada e aprovada.'});}
test('3650 → bloqueio → tratamento sem liberar → liberação CQ → 3350 → revisão/fechamento → aprovação OP/PDF com histórico',async()=>{
 const id=await f.create();await f.start(id);const item=(await f.items(id))[1];
 checked(await f.measure(id,1,{valor:'3650',observacao:'Viscosidade fora do padrão.'}));assert.equal((await f.read(id)).status,'BLOCKED_QUALITY');assert.equal((await nc(id)).status,'OPEN');assert.equal((await history(id,item.id))[0].numeric_value,3650);
 assert.ok((await f.measure(id,1,{valor:'3350'})).error);
 assert.ok((await f.clients[3].from('production_orders').update({status:'IN_PRODUCTION'}).eq('id',id)).error);
 await treatment(id);assert.equal((await f.read(id)).status,'BLOCKED_QUALITY');
 for(const index of [1,3,4])assert.ok((await release(id,f.clients[index])).error);
 assert.ok((await f.clients[2].rpc('quality_decide_order',{order_id:id,expected_version:(await f.read(id)).version,decision:'IN_PRODUCTION',reason:'Atalho indevido'})).error);
 assert.ok((await close(id)).error);
 checked(await release(id));assert.equal((await f.read(id)).status,'IN_PRODUCTION');assert.equal((await nc(id)).status,'IN_TREATMENT');
 assert.ok(checked(await f.admin.from('notifications').select().eq('reference_id',id).eq('tipo','CORRECTION_RELEASE')).some(n=>n.user_id===f.users[3].id));
 checked(await f.measure(id,1,{valor:'3350',observacao:'Ajuste realizado.'}));assert.equal((await nc(id)).status,'IN_TREATMENT');
 const rows=await history(id,item.id);assert.deepEqual(rows.map(m=>m.numeric_value),[3650,3350]);assert.deepEqual(rows.map(m=>m.sequence),[1,2]);assert.deepEqual(rows.map(m=>m.compliant),[false,true]);assert.ok(rows.every(m=>m.minimum_value_snapshot===3000&&m.maximum_value_snapshot===3500&&m.unit==='cP'));
 assert.ok((await close(id)).error);const current=(await f.items(id))[1];checked(await f.clients[2].rpc('quality_review_item',{order_id:id,item_id:current.id,expected_updated_at:current.updated_at}));checked(await close(id));const closed=await nc(id);assert.equal(closed.encerrado_por,f.users[2].id);assert.ok(closed.data_fechamento);assert.equal(closed.correction_measurement_id,rows[1].id);assert.equal((await f.read(id)).status,'IN_PRODUCTION');
 for(const [index,valor] of [[0,'false'],[2,'Bom'],[3,'Conferido'],[5,'5']])checked(await f.measure(id,index,{valor}));checked(await f.measure(id,4,{foto_path:await f.upload(id)}));await f.send(id);assert.equal((await f.read(id)).status,'AWAITING_QUALITY');await f.approve(id);assert.equal((await f.read(id)).status,'AWAITING_PCP');
 const report=await f.report(await f.finalize(id));assert.deepEqual(report.snapshot.measurements.filter(m=>m.checklist_item_id===item.id).map(m=>m.numeric_value),[3650,3350]);const file=checked(await f.clients[1].storage.from('final-reports').download(report.path));writeFileSync('/tmp/op-digital-correction-flow.pdf',Buffer.from(await file.arrayBuffer()));const text=execFileSync('pdftotext',['/tmp/op-digital-correction-flow.pdf','-'],{encoding:'utf8'});assert.match(text,/Tentativa 1: 3\.650/);assert.match(text,/Tentativa 2: 3\.350/);assert.match(text,/Viscosidade/);assert.match(text,/MEDIÇÃO ATUAL/);
 assert.ok((await f.clients[0].from('checklist_measurements').update({numeric_value:0}).eq('id',rows[0].id)).error);
 assert.ok((await f.clients[3].from('checklist_measurements').insert(rows[0])).error);
 writeFileSync('/tmp/op-digital-correction-flow.json',JSON.stringify({id,nc:closed.codigo_nc,attempts:rows.map(m=>m.numeric_value),report:report.id,status:(await f.read(id)).status},null,2));
});
test('nova tentativa não conforme preserva todas as tentativas, bloqueia e reutiliza NC; nova liberação concorre com um vencedor',async()=>{
 const id=await f.create();await f.start(id);checked(await f.measure(id,1,{valor:'3650',observacao:'Primeira falha'}));const original=await nc(id);await treatment(id);checked(await release(id));checked(await f.measure(id,1,{valor:'3600',observacao:'Correção insuficiente'}));assert.equal((await f.read(id)).status,'BLOCKED_QUALITY');assert.equal((await nc(id)).id,original.id);assert.equal((await nc(id)).status,'IN_TREATMENT');assert.deepEqual((await history(id,(await f.items(id))[1].id)).map(m=>m.numeric_value),[3650,3600]);
 const n=await nc(id),o=await f.read(id),payload={nc_id:n.id,expected_version:o.version,expected_updated_at:n.updated_at};const attempts=await Promise.all([f.clients[2].rpc('quality_release_correction',payload),f.clients[0].rpc('quality_release_correction',payload)]);assert.equal(attempts.filter(r=>!r.error).length,1);
 assert.ok((await close(id)).error);
 checked(await f.measure(id,1,{valor:'3350'}));assert.equal(checked(await f.admin.from('non_conformities').select().eq('production_order_id',id)).length,1);
});
test('liberação recusa ausência de ação/responsável/observação, inativo, status inadequado e mantém OP bloqueada',async()=>{
 const id=await f.create();await f.start(id);checked(await f.measure(id,1,{valor:'3650',observacao:'Falha'}));
 for(const fields of [{acao_imediata:''},{observacao_cq:'\u00a0'},{responsavel_id:null}]){await treatment(id,fields);assert.ok((await release(id)).error);assert.equal((await f.read(id)).status,'BLOCKED_QUALITY');}
 await treatment(id);checked(await f.admin.from('profiles').update({ativo:false}).eq('id',f.users[2].id));assert.ok((await release(id)).error);checked(await f.admin.from('profiles').update({ativo:true}).eq('id',f.users[2].id));checked(await release(id));assert.ok((await release(id)).error);
});
test('liberação preserva RBAC, vinculação impeditiva e instruções CQ; histórico privado e snapshots de BOOLEAN/SELECT',async()=>{
 const id=await f.create();await f.start(id);checked(await f.measure(id,1,{valor:'3650',observacao:'Bloqueio para ajuste'}));const n=await treatment(id);
 for(const fields of [{impeditiva:false},{checklist_item_id:null},{impeditiva:false,status:'CLOSED'}])assert.ok((await f.clients[2].from('non_conformities').update(fields).eq('id',n.id)).error);
 assert.ok((await f.clients[3].from('non_conformities').update({acao_imediata:'Instrução adulterada'}).eq('id',n.id)).error);
 checked(await release(id));
 for(const fields of [{produto_id:f.product.id,lote:'Lote adulterado'},{quantidade_planejada:500},{aprovacao_cq:'APPROVED'},{status:'AWAITING_PCP'}])assert.ok((await f.clients[3].from('production_orders').update(fields).eq('id',id)).error);
 const item=(await f.items(id))[1];assert.ok((await f.clients[3].from('production_order_checklist').update({valor_minimo:0}).eq('id',item.id)).error);
 assert.ok((await closeAsOperator()).error);async function closeAsOperator(){return f.clients[3].rpc('quality_close_correction',{nc_id:n.id,expected_version:(await f.read(id)).version,expected_updated_at:(await nc(id)).updated_at,observation:'Não autorizado'});}
 assert.deepEqual(checked(await f.clients[4].from('checklist_measurements').select().eq('production_order_id',id)),[]);assert.deepEqual(checked(await f.clients[4].from('quality_correction_releases').select().eq('production_order_id',id)),[]);
 checked(await f.measure(id,1,{valor:'3350'}));checked(await f.clients[2].from('non_conformities').update({status:'AWAITING_QUALITY'}).eq('id',n.id));const current=(await f.items(id))[1];checked(await f.clients[2].rpc('quality_review_item',{order_id:id,item_id:item.id,expected_updated_at:current.updated_at}));checked(await close(id));
 checked(await f.measure(id,0,{valor:'false'}));checked(await f.measure(id,2,{valor:'Bom'}));checked(await f.measure(id,2,{valor:'Ruim',observacao:'Acabamento requer ajuste'}));checked(await f.measure(id,2,{valor:'Bom'}));
 const items=await f.items(id);const bool=(await history(id,items[0].id))[0];assert.deepEqual(bool.configuration_snapshot,{resposta_conforme:false});assert.equal(bool.boolean_value,false);const select=await history(id,items[2].id);assert.deepEqual(select.map(m=>m.select_value),['Bom','Ruim','Bom']);assert.ok(select.every(m=>m.configuration_snapshot.opcoes_conformes[0]==='Bom'));
 const logs=checked(await f.admin.from('audit_logs').select().eq('production_order_id',id));for(const entity of ['checklist_measurements','quality_correction_releases','non_conformities'])assert.ok(logs.some(log=>log.entity===entity&&log.user_id));
});
test('falha na notificação reverte liberação, OP, NC e auditoria na mesma transação',async()=>{
 const id=await f.create();await f.start(id);checked(await f.measure(id,1,{valor:'3650',observacao:'Fora da faixa'}));await treatment(id);const before=await f.read(id),n=await nc(id),logs=checked(await f.admin.from('audit_logs').select('id').eq('production_order_id',id));
 const sql=statement=>execFileSync('docker',['exec','supabase_db_op-digital','psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-c',statement],{stdio:['ignore','pipe','pipe']});
 sql(`create function private.correction_test_notification() returns trigger language plpgsql set search_path='' as $$ begin if new.reference_id='${id}'::uuid and new.tipo='CORRECTION_RELEASE' then raise exception 'Falha controlada de notificação';end if;return new;end $$;create trigger correction_test_notification before insert on public.notifications for each row execute function private.correction_test_notification();`);
 try{assert.ok((await release(id)).error);assert.deepEqual(await f.read(id),before);assert.deepEqual(await nc(id),n);assert.equal(checked(await f.admin.from('quality_correction_releases').select().eq('production_order_id',id)).length,0);assert.equal(checked(await f.admin.from('audit_logs').select('id').eq('production_order_id',id)).length,logs.length);}
 finally{sql('drop trigger correction_test_notification on public.notifications;drop function private.correction_test_notification();');}
});
