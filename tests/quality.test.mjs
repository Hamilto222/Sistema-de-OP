import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {operatorFixture,photoPng} from './fixtures/operator.mjs';
import {checked,localClient} from '../scripts/local-supabase.mjs';
let f;
const denied=result=>assert.ok(result.error,'O banco deveria negar a operação');
before(async()=>{f=await operatorFixture('quality-db');});after(async()=>{if(f)await f.cleanup();});
async function ready(){const id=await f.create();await f.start(id);await f.complete(id);checked(await f.measure(id,5,{valor:'5'}));checked(await f.clients[3].rpc('operator_submit_order',{order_id:id,expected_version:(await f.read(id)).version,produced:100,lost:0,final_note:'Concluída'}));return id;}
async function decide(id,decision,reason='',client=f.clients[2]){return client.rpc('quality_decide_order',{order_id:id,expected_version:(await f.read(id)).version,decision,reason});}
async function reviewAll(id,client=f.clients[2]){for(const item of await f.items(id))if(item.requer_revisao_cq&&!item.revisado_cq)checked(await client.rpc('quality_review_item',{order_id:id,item_id:item.id,expected_updated_at:item.updated_at}));}
const input=id=>({production_order_id:id,checklist_item_id:null,tipo:'PROCESSO',descricao:'Não conformidade para tratamento',severidade:'HIGH',acao_imediata:'Correção aplicada',responsavel_id:f.users[2].id,status:'OPEN',evidencia_antes_path:null,evidencia_depois_path:null,observacao_cq:'Inspecionado e corrigido',impeditiva:true});
async function nc(id,payload={}){const target=checked(await f.clients[2].rpc('quality_save_nc',{payload:{...input(id),...payload}}));return checked(await f.admin.from('non_conformities').select().eq('id',target).single());}
async function update(n,payload){const current=checked(await f.admin.from('non_conformities').select().eq('id',n.id).single());return f.clients[2].rpc('quality_save_nc',{payload:{...input(n.production_order_id),id:n.id,updated_at:current.updated_at,checklist_item_id:current.checklist_item_id,status:current.status,impeditiva:current.impeditiva,...payload}});}
async function close(n){checked(await update(n,{status:'AWAITING_QUALITY'}));checked(await update(n,{status:'CLOSED'}));}

test('migrations preservam legado e enums; códigos sequenciais anuais gerados no banco com concorrência',async()=>{
 const id=await ready(),results=await Promise.all([1,2,3].map(()=>f.clients[2].rpc('quality_save_nc',{payload:input(id)})));for(const result of results)checked(result);
 const rows=checked(await f.admin.from('non_conformities').select().in('id',results.map(result=>result.data)));const codes=rows.map(row=>row.codigo_nc).sort();assert.equal(new Set(codes).size,3);for(const code of codes)assert.match(code,/^NC-\d{4}-\d{5,}$/);assert.equal(Number(codes[2].split('-')[2])-Number(codes[0].split('-')[2]),2);
 const legacy=checked(await f.admin.from('non_conformities').select('codigo_nc,codigo_legado').not('codigo_legado','is',null).limit(1));for(const row of legacy){assert.match(row.codigo_nc,/^NC-\d{4}-/);assert.notEqual(row.codigo_nc,row.codigo_legado);}
 denied(await f.clients[3].rpc('quality_save_nc',{payload:input(id)}));denied(await f.clients[2].rpc('quality_save_nc',{payload:{...input(id),codigo_nc:'NC-FAKE'}}));
});
test('máquina central impede saltos; tabela completa CQ e NC confere com o fluxo autorizado',()=>{
 const sql="select jsonb_agg(jsonb_build_array(s::text,t::text)) from unnest(enum_range(null::public.order_status)) s cross join unnest(enum_range(null::public.order_status)) t where s<>t and private.order_transition_allowed('QUALIDADE',s,t)";
 const edges=JSON.parse(execFileSync('docker',['exec','supabase_db_op-digital','psql','-U','postgres','-d','postgres','-Atc',sql],{encoding:'utf8'}));assert.deepEqual(new Set(edges.map(edge=>edge.join('>'))),new Set(['RELEASED>BLOCKED_QUALITY','IN_PRODUCTION>BLOCKED_QUALITY','AWAITING_QUALITY>BLOCKED_QUALITY','AWAITING_QUALITY>AWAITING_PCP','BLOCKED_QUALITY>IN_PRODUCTION','BLOCKED_QUALITY>AWAITING_QUALITY']));
 const ncSql="select jsonb_agg(jsonb_build_array(s::text,t::text)) from unnest(enum_range(null::public.nc_status)) s cross join unnest(enum_range(null::public.nc_status)) t where s<>t and private.nc_transition_allowed('QUALIDADE',s,t)";const ncEdges=JSON.parse(execFileSync('docker',['exec','supabase_db_op-digital','psql','-U','postgres','-d','postgres','-Atc',ncSql],{encoding:'utf8'}));assert.deepEqual(new Set(ncEdges.map(edge=>edge.join('>'))),new Set(['OPEN>IN_TREATMENT','OPEN>AWAITING_QUALITY','OPEN>CANCELLED','IN_TREATMENT>AWAITING_QUALITY','IN_TREATMENT>CANCELLED','AWAITING_QUALITY>IN_TREATMENT','AWAITING_QUALITY>CLOSED','AWAITING_QUALITY>CANCELLED']));
});
test('revisão não altera medição e usa identidade/data reais; item não medido/autor forjado negados',async()=>{
 const id=await ready(),item=(await f.items(id))[1];denied(await f.clients[2].from('production_order_checklist').update({valor_numero:9}).eq('id',item.id));denied(await f.clients[2].from('production_order_checklist').update({revisado_cq:true,revisado_por:f.users[0].id}).eq('id',item.id));
 checked(await f.clients[2].rpc('quality_review_item',{order_id:id,item_id:item.id,expected_updated_at:item.updated_at}));const row=(await f.items(id))[1];assert.equal(row.revisado_por,f.users[2].id);assert.ok(row.data_revisao);assert.equal(row.valor_numero,item.valor_numero);assert.equal(row.medido_por,item.medido_por);assert.equal(row.data_medicao,item.data_medicao);
 denied(await f.clients[2].rpc('quality_review_item',{order_id:id,item_id:item.id,expected_updated_at:item.updated_at}));
 const incomplete=await f.create();await f.start(incomplete);checked(await decide(incomplete,'REJECTED','Medição necessária'));const empty=(await f.items(incomplete))[1];denied(await f.clients[2].rpc('quality_review_item',{order_id:incomplete,item_id:empty.id,expected_updated_at:empty.updated_at}));
});
test('aprovação exige AWAITING_QUALITY, obrigatórios, revisões e NC impeditiva resolvida também em PATCH',async()=>{
 const id=await ready();denied(await decide(id,'APPROVED'));await reviewAll(id);const n=await nc(id);denied(await decide(id,'APPROVED'));denied(await f.clients[2].from('production_orders').update({status:'AWAITING_PCP',aprovacao_cq:'APPROVED'}).eq('id',id));await close(n);checked(await decide(id,'APPROVED'));const row=await f.read(id);assert.equal(row.status,'AWAITING_PCP');assert.equal(row.aprovacao_cq,'APPROVED');assert.equal(row.responsavel_cq_id,f.users[2].id);assert.ok(row.data_aprovacao_cq);assert.equal(checked(await f.clients[1].from('notifications').select().eq('reference_id',id).eq('tipo','AWAITING_PCP')).length,1);
 const missing=await ready();checked(await f.admin.from('production_order_checklist').update({data_medicao:null,conforme:null}).eq('id',(await f.items(missing))[1].id));denied(await decide(missing,'APPROVED'));
 const inProd=await f.create();await f.start(inProd);denied(await decide(inProd,'APPROVED'));denied(await decide(inProd,'FINALIZED'));
});
test('NC não impeditiva aberta não impede aprovação; CANCELLED não conta como pendência',async()=>{
 const id=await ready();await reviewAll(id);await nc(id,{impeditiva:false});const cancelled=await nc(id);checked(await update(cancelled,{status:'CANCELLED',observacao_cq:'Abertura em duplicidade'}));checked(await decide(id,'APPROVED'));assert.equal((await f.read(id)).status,'AWAITING_PCP');
});
test('bloqueio exige motivo e notifica PCP/operadores autorizados; assinatura e relógio não são falsificáveis',async()=>{
 const id=await ready();denied(await decide(id,'REJECTED'));checked(await decide(id,'REJECTED','Produto precisa de correção'));const row=await f.read(id);assert.equal(row.aprovacao_cq,'REJECTED');assert.equal(row.status,'BLOCKED_QUALITY');assert.equal(row.responsavel_cq_id,f.users[2].id);
 for(const index of [1,3])assert.equal(checked(await f.clients[index].from('notifications').select().eq('reference_id',id).eq('tipo','BLOCKED_QUALITY')).length,1);assert.equal(checked(await f.clients[4].from('notifications').select().eq('reference_id',id)).length,0);
 denied(await f.clients[2].from('production_orders').update({status:'FINALIZED'}).eq('id',id));denied(await f.clients[0].from('production_orders').update({status:'FINALIZED'}).eq('id',id));denied(await f.clients[0].from('production_orders').update({responsavel_cq_id:f.users[0].id}).eq('id',id));
});
test('retorno à produção reinicia revisões e limpa decisão/fim sem apagar respostas; retorno CQ exige produção concluída',async()=>{
 const id=await ready();await reviewAll(id);const start=(await f.read(id)).inicio_producao;checked(await decide(id,'REJECTED','Corrigir embalagem'));denied(await decide(id,'IN_PRODUCTION'));checked(await decide(id,'IN_PRODUCTION','Correção pela equipe autorizada'));
 const row=await f.read(id);assert.equal(row.inicio_producao,start);assert.equal(row.fim_producao,null);assert.equal(row.aprovacao_cq,null);for(const item of await f.items(id)){assert.equal(item.revisado_cq,false);assert.ok(item.data_medicao);}
 const beforeFinish=await f.create();await f.start(beforeFinish);checked(await decide(beforeFinish,'REJECTED','Problema em processo'));denied(await decide(beforeFinish,'AWAITING_QUALITY','Retorno precoce'));checked(await decide(beforeFinish,'IN_PRODUCTION','Corrigir produção'));denied(await decide(beforeFinish,'AWAITING_QUALITY','Transição arbitrária'));
});
test('retorno CQ após bloqueio conserva fim e pode aprovar; item não conforme requer NC fechada correspondente',async()=>{
 const id=await ready();await reviewAll(id);const end=(await f.read(id)).fim_producao;checked(await decide(id,'REJECTED','Reinspeção'));const n=await nc(id);denied(await decide(id,'AWAITING_QUALITY','Retorno sem tratar NC'));await close(n);checked(await decide(id,'AWAITING_QUALITY','Tratamento concluído'));assert.equal((await f.read(id)).fim_producao,end);assert.equal((await f.read(id)).aprovacao_cq,null);checked(await decide(id,'APPROVED'));
 const fail=await ready();const item=(await f.items(fail))[1];checked(await f.admin.from('production_order_checklist').update({conforme:false}).eq('id',item.id));checked(await decide(fail,'REJECTED','Peça fora do limite'));denied(await decide(fail,'AWAITING_QUALITY','Sem rastreabilidade'));const itemNc=await nc(fail,{checklist_item_id:item.id});await close(itemNc);checked(await decide(fail,'AWAITING_QUALITY','Correção verificada na NC, preservando medição original'));await reviewAll(fail);checked(await decide(fail,'APPROVED'));
});
test('NC não impeditiva já aberta pode concluir após aprovação, sem nova NC/reclassificação ou alterar OP',async()=>{
 const id=await ready(),n=await nc(id,{impeditiva:false});await reviewAll(id);checked(await decide(id,'APPROVED'));const before=await f.read(id);
 denied(await ncResult());async function ncResult(){return f.clients[2].rpc('quality_save_nc',{payload:input(id)});}
 denied(await update(n,{impeditiva:true}));const path=`${id}/${randomUUID()}.png`;checked(await f.clients[2].storage.from('quality-evidence').upload(path,photoPng(),{contentType:'image/png'}));checked(await update(n,{status:'AWAITING_QUALITY',evidencia_depois_path:path}));checked(await update(n,{status:'CLOSED',evidencia_depois_path:path}));assert.deepEqual(await f.read(id),before);assert.equal(checked(await f.admin.from('non_conformities').select('status').eq('id',n.id).single()).status,'CLOSED');
});
test('NC: fechamento exige fluxo, campos, responsável ativo; cancelamento exige motivo e encerramento é imutável',async()=>{
 const id=await ready(),n=await nc(id,{acao_imediata:'',responsavel_id:null,observacao_cq:''});denied(await update(n,{status:'CLOSED'}));checked(await update(n,{status:'IN_TREATMENT'}));checked(await update(n,{status:'AWAITING_QUALITY'}));
 for(const payload of [{status:'CLOSED',acao_imediata:''},{status:'CLOSED',responsavel_id:null},{status:'CLOSED',observacao_cq:''}])denied(await update(n,payload));await close(n);const closed=checked(await f.admin.from('non_conformities').select().eq('id',n.id).single());assert.equal(closed.status,'CLOSED');assert.equal(closed.aprovado_cq,true);assert.equal(closed.encerrado_por,f.users[2].id);assert.ok(closed.data_fechamento);
 denied(await update(n,{status:'OPEN'}));denied(await f.clients[2].from('non_conformities').update({descricao:'Reescrever fechado'}).eq('id',n.id));denied(await f.clients[0].from('non_conformities').delete().eq('id',n.id));
 const cancel=await nc(id);denied(await update(cancel,{status:'CANCELLED',observacao_cq:''}));checked(await update(cancel,{status:'CANCELLED',observacao_cq:'Duplicidade comprovada'}));assert.equal(checked(await f.admin.from('non_conformities').select('aprovado_cq').eq('id',cancel.id).single()).aprovado_cq,false);
});
test('NC rejeita troca de OP/código, item estrangeiro, falsificação de ator/fechamento, edição obsoleta e evidência falsa',async()=>{
 const id=await ready(),other=await ready(),n=await nc(id);
 for(const payload of [{production_order_id:other},{checklist_item_id:(await f.items(other))[0].id},{evidencia_antes_path:`${id}/missing.pdf`},{evidencia_depois_path:`${other}/foreign.png`},{codigo_nc:'NC-FALSE'},{created_by:f.users[0].id},{aprovado_cq:true}])denied(await update(n,payload));
 checked(await update(n,{status:'IN_TREATMENT'}));denied(await f.clients[2].rpc('quality_save_nc',{payload:{...input(id),id:n.id,updated_at:n.updated_at,status:'IN_TREATMENT'}}));
});
test('evidências privadas antes/depois, incluindo foto de operador automático, são acessíveis por URL assinada',async()=>{
 const id=await ready(),path=`${id}/${randomUUID()}.png`;checked(await f.clients[2].storage.from('quality-evidence').upload(path,photoPng(),{contentType:'image/png'}));const n=await nc(id,{evidencia_antes_path:path,evidencia_depois_path:path});const doc=checked(await f.clients[2].rpc('quality_nc_document',{order_id:id,nc_id:n.id,which_document:'antes'}));assert.equal(doc.bucket,'quality-evidence');assert.equal((await fetch(checked(await f.clients[2].storage.from(doc.bucket).createSignedUrl(doc.path,60)).signedUrl)).status,200);assert.notEqual((await fetch(f.clients[2].storage.from(doc.bucket).getPublicUrl(doc.path).data.publicUrl)).status,200);
 const auto=await f.create();await f.start(auto);const photo=await f.upload(auto);checked(await f.measure(auto,1,{valor:'8',observacao:'Fora do limite',foto_path:photo}));const autoNc=checked(await f.admin.from('non_conformities').select().eq('production_order_id',auto).single());assert.match(autoNc.codigo_nc,/^NC-\d{4}-\d{5,}$/);const autoDoc=checked(await f.clients[2].rpc('quality_nc_document',{order_id:auto,nc_id:autoNc.id,which_document:'antes'}));assert.equal(autoDoc.bucket,'operator-evidence');
});
test('decisões concorrentes têm um vencedor e notificação única; revisão concorrente não sobrescreve autoria',async()=>{
 const id=await ready();await reviewAll(id);const version=(await f.read(id)).version;const results=await Promise.all([1,2].map(()=>f.clients[2].rpc('quality_decide_order',{order_id:id,expected_version:version,decision:'APPROVED',reason:''})));assert.equal(results.filter(result=>!result.error).length,1);assert.equal(checked(await f.clients[1].from('notifications').select().eq('reference_id',id).eq('tipo','AWAITING_PCP')).length,1);
 const pending=await ready(),item=(await f.items(pending))[1];const reviews=await Promise.all([1,2].map(()=>f.clients[2].rpc('quality_review_item',{order_id:pending,item_id:item.id,expected_updated_at:item.updated_at})));assert.equal(reviews.filter(result=>!result.error).length,1);
});
test('bloqueio automático retorna à produção sem re-bloquear ao limpar revisões; operador corrige e CQ encerra NC',async()=>{
 const id=await f.create();await f.start(id);checked(await f.measure(id,1,{valor:'8',observacao:'Fora da tolerância'}));const n=checked(await f.admin.from('non_conformities').select().eq('production_order_id',id).single());
 checked(await decide(id,'IN_PRODUCTION','Operador irá corrigir e medir novamente'));assert.equal((await f.read(id)).status,'IN_PRODUCTION');assert.equal(checked(await f.admin.from('non_conformities').select('id').eq('production_order_id',id)).length,1);assert.equal((await f.items(id))[1].conforme,false);
 await f.complete(id);checked(await f.measure(id,5,{valor:'5'}));await close(n);checked(await f.clients[3].rpc('operator_submit_order',{order_id:id,expected_version:(await f.read(id)).version,produced:100,lost:0,final_note:'Corrigida'}));await reviewAll(id);checked(await decide(id,'APPROVED'));assert.equal((await f.read(id)).status,'AWAITING_PCP');
});
test('falha ao notificar PCP reverte decisão, status, assinatura e auditoria na mesma transação',async()=>{
 const id=await ready();await reviewAll(id);const before=await f.read(id),audits=checked(await f.admin.from('audit_logs').select('id').eq('production_order_id',id));
 const sql=`create function private.quality_test_fail_notification() returns trigger language plpgsql set search_path='' as $$ begin if new.reference_id='${id}'::uuid and new.tipo='AWAITING_PCP' then raise exception 'Falha de notificação de teste'; end if; return new; end $$; create trigger quality_test_fail_notification before insert on public.notifications for each row execute function private.quality_test_fail_notification();`;
 execFileSync('docker',['exec','supabase_db_op-digital','psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-c',sql],{stdio:['ignore','pipe','pipe']});
 try{denied(await decide(id,'APPROVED'));assert.deepEqual(await f.read(id),before);assert.equal(checked(await f.admin.from('audit_logs').select('id').eq('production_order_id',id)).length,audits.length);assert.equal(checked(await f.clients[1].from('notifications').select('id').eq('reference_id',id)).length,0);}
 finally{execFileSync('docker',['exec','supabase_db_op-digital','psql','-U','postgres','-d','postgres','-c','drop trigger quality_test_fail_notification on public.notifications; drop function private.quality_test_fail_notification();'],{stdio:['ignore','pipe','pipe']});}
});
test('ADMIN também revisa e aprova com autoria própria; PCP/OPERADOR/anônimo não executam CQ; inativo perde acesso',async()=>{
 const id=await ready();await reviewAll(id,f.clients[0]);checked(await decide(id,'APPROVED','',f.clients[0]));assert.equal((await f.read(id)).responsavel_cq_id,f.users[0].id);assert.equal((await f.items(id))[0].revisado_por,f.users[0].id);
 for(const client of [f.clients[1],f.clients[3],localClient()]){denied(await client.rpc('quality_dashboard'));denied(await client.rpc('quality_decide_order',{order_id:id,expected_version:(await f.read(id)).version,decision:'APPROVED'}));denied(await client.rpc('quality_review_item',{order_id:id,item_id:(await f.items(id))[0].id,expected_updated_at:(await f.items(id))[0].updated_at}));denied(await client.rpc('quality_save_nc',{payload:input(id)}));}
 const stats=checked(await f.clients[2].rpc('quality_dashboard'));assert.ok(stats.aguardando_cq>0);assert.ok(stats.ncs_abertas>0);
 checked(await f.admin.from('profiles').update({ativo:false}).eq('id',f.users[2].id));denied(await f.clients[2].rpc('quality_dashboard'));denied(await f.clients[2].rpc('quality_save_nc',{payload:input(id)}));
});
