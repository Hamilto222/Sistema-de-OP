import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { finalizationFixture } from './fixtures/finalization.mjs';
import { checked, localClient } from '../scripts/local-supabase.mjs';
import { productionPdf } from './fixtures/pdf.mjs';
let f;
before(async()=>{f=await finalizationFixture('technical-audit');});
after(async()=>{await f?.cleanup();});
const denied = result => assert.ok(result.error,'Backend deve negar a operação');
test('Schema real: RLS integral, FKs indexadas e funções definer com ACL/search_path restritos', () => {
 const query = statement => execFileSync('docker',['exec','supabase_db_op-digital','psql','-U','postgres','-d','postgres','-Atc',statement],{encoding:'utf8'}).trim();
 assert.equal(query("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity"),'0');
 assert.equal(query("select count(*) from pg_constraint c where c.contype='f' and c.connamespace='public'::regnamespace and not exists(select 1 from pg_index i where i.indrelid=c.conrelid and i.indisvalid and i.indpred is null and i.indkey[0]=c.conkey[1])"),'0');
 assert.equal(query("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('private','public') and p.prosecdef and (has_function_privilege('anon',p.oid,'EXECUTE') or not coalesce(p.proconfig @> array['search_path=\"\"'],false))"),'0');
 assert.equal(query("select count(*) from pg_constraint where connamespace='public'::regnamespace and not convalidated"),'0');
 assert.equal(query("select count(*) from storage.buckets where id in ('op-originals','operator-evidence','quality-evidence','final-reports') and (public or file_size_limit is null or allowed_mime_types is null)"),'0');
});
test('PDF original não permite overwrite, inclusive ADMIN e antes da liberação',async()=>{
 const id=await f.create({released:false}),path=`${id}/original.pdf`;
 checked(await f.clients[1].storage.from('op-originals').upload(path,productionPdf(),{contentType:'application/pdf'}));
 for(const client of [f.clients[0],f.clients[1]])denied(await client.storage.from('op-originals').upload(path,productionPdf(),{contentType:'application/pdf',upsert:true}));
});
test('ADMIN não altera PDF original arquivado nem envia evidências depois de FINALIZED',async()=>{
 const id=await f.ready();await f.finalize(id);const o=await f.read(id);
 denied(await f.clients[0].storage.from('op-originals').upload(o.pdf_original_path,productionPdf(),{contentType:'application/pdf',upsert:true}));
 for(const bucket of ['op-originals','operator-evidence','quality-evidence'])denied(await f.clients[0].storage.from(bucket).upload(`${id}/${randomUUID()}.${bucket==='op-originals'?'pdf':'png'}`,bucket==='op-originals'?productionPdf():Buffer.from('invalid'),{contentType:bucket==='op-originals'?'application/pdf':'image/png'}));
});
test('ADMIN não falsifica autoria de medição nem modifica definição de checklist liberado',async()=>{
 const id=await f.create();await f.start(id);await f.complete(id);const item=(await f.items(id))[1];
 denied(await f.clients[0].from('production_order_checklist').update({medido_por:f.users[4].id}).eq('id',item.id));
 denied(await f.clients[0].from('production_order_checklist').update({valor_minimo:-999}).eq('id',item.id));
});
test('PCP não libera pela API uma OP com referência de PDF inexistente',async()=>{
 const id=await f.create({released:false});
 checked(await f.clients[1].from('production_orders').update({pdf_original_path:`${id}/missing.pdf`,status:'PREPARING'}).eq('id',id));
 checked(await f.clients[1].from('production_order_checklist').insert({production_order_id:id,ordem:1,item:'Item incompleto',tipo_resposta:'BOOLEAN'}));
 denied(await f.clients[1].from('production_orders').update({status:'RELEASED'}).eq('id',id));
});
test('OPERADOR não pode criar NC não impeditiva para contornar qualidade',async()=>{
 const id=await f.create();await f.start(id);
 denied(await f.clients[3].from('non_conformities').insert({production_order_id:id,tipo:'PROCESSO',descricao:'Teste de NC impeditiva obrigatória',severidade:'HIGH',impeditiva:false,created_by:f.users[3].id}));
});
test('Histórico de checklist/apontamento não pode ser excluído fisicamente pelo ADMIN',async()=>{
 const id=await f.create();await f.start(id);const item=(await f.items(id))[0];
 const note=checked(await f.clients[3].rpc('operator_add_note',{order_id:id,payload:{tipo:'OBSERVACAO',descricao:'Registro de auditoria'}}));
 denied(await f.clients[0].from('production_order_checklist').delete().eq('id',item.id));
 denied(await f.clients[0].from('production_notes').delete().eq('id',note));
});
test('Backend recusa limites/configuração inválidos no snapshot mesmo antes da liberação',async()=>{
 const id=await f.create({released:false});
 for(const fields of [{tipo_resposta:'NUMBER',valor_minimo:'NaN'},{tipo_resposta:'SELECT',configuracao:{opcoes:['A','A']}},{tipo_resposta:'BOOLEAN',configuracao:{resposta_conforme:'sim'}}])denied(await f.clients[1].from('production_order_checklist').insert({production_order_id:id,ordem:1,item:'Item inválido',...fields}));
});
test('Matriz de backend: operador/PCP/CQ não atravessam competências ou OP alheia',async()=>{
 const id=await f.create();await f.start(id);const item=(await f.items(id))[1];
 for(const patch of [{quantidade_planejada:999},{produto_id:randomUUID()},{linha_id:randomUUID()},{aprovacao_cq:'APPROVED'},{aprovacao_pcp:'APPROVED'},{status:'FINALIZED'}])denied(await f.clients[3].from('production_orders').update(patch).eq('id',id));
 for(const client of [f.clients[1],f.clients[2],f.clients[3]])denied(await client.from('production_order_checklist').update({valor_minimo:-1}).eq('id',item.id));
 for(const client of [f.clients[1],f.clients[2]])denied(await client.from('production_order_checklist').update({valor_numero:10}).eq('id',item.id));
 for(const client of [f.clients[1],f.clients[3]])denied(await client.rpc('quality_decide_order',{order_id:id,expected_version:(await f.read(id)).version,decision:'APPROVED',reason:''}));
 for(const client of [f.clients[2],f.clients[3]])denied(await client.rpc('pcp_finalize_order',{order_id:id,expected_version:(await f.read(id)).version,company_name:'Empresa auditoria'}));
 for(const table of ['production_orders','production_order_checklist','production_notes','non_conformities','audit_logs','final_reports'])assert.equal(checked(await f.clients[4].from(table).select('id').eq(table==='production_orders'?'id':'production_order_id',id)).length,0);
 const original=(await f.read(id)).pdf_original_path;denied(await f.clients[4].storage.from('op-originals').createSignedUrl(original,60));denied(await f.clients[4].storage.from('op-originals').download(original));denied(await localClient().storage.from('op-originals').download(original));
});
test('Retomada não aceita versão com prefixo semelhante na metadata do PDF existente',async()=>{
 const id=await f.ready(),rid=await f.finalize(id,f.clients[1],false),report=await f.report(rid);
 const {generateFinalPdf}=await import('../src/features/finalization/pdf.ts');const {renderStoredReport}=await import('../src/features/finalization/generate.ts');
 const incorrect=await generateFinalPdf({...report.snapshot,version:report.order_version*10});
 checked(await f.clients[1].storage.from('final-reports').upload(report.path,incorrect.bytes,{contentType:'application/pdf'}));
 await assert.rejects(renderStoredReport(f.clients[1],rid),/não corresponde/);assert.equal((await f.report(rid)).status,'PENDING');
});
test('Nomes/extensões e tentativas de travessia são bloqueados na API Storage',async()=>{
 const id=await f.create({released:false});
 for(const name of ['../other.pdf','sub/document.pdf','script.exe','document.PDF'])denied(await f.clients[1].storage.from('op-originals').upload(`${id}/${name}`,productionPdf(),{contentType:'application/pdf'}));
});
test('Storage preserva autorização e revogação; URL curta expira realmente',async()=>{
 const id=await f.create(),path=(await f.read(id)).pdf_original_path;
 const signed=checked(await f.clients[3].storage.from('op-originals').createSignedUrl(path,1));
 assert.equal((await fetch(signed.signedUrl)).status,200);
 await new Promise(resolve=>setTimeout(resolve,2200));assert.notEqual((await fetch(signed.signedUrl)).status,200);
 checked(await f.admin.from('profiles').update({ativo:false}).eq('id',f.users[3].id));
 try{denied(await f.clients[3].storage.from('op-originals').createSignedUrl(path,60));denied(await f.clients[3].storage.from('op-originals').download(path));}
 finally{checked(await f.admin.from('profiles').update({ativo:true}).eq('id',f.users[3].id));}
});
test('Observação não conforme composta apenas de tabulação/quebra de linha é recusada atomicamente',async()=>{
 const id=await f.create();await f.start(id);const item=(await f.items(id))[1];
 for(const observacao of ['\n\t\r','\u00a0','\ufeff'])denied(await f.measure(id,1,{valor:'8',observacao}));
 assert.equal((await f.read(id)).status,'IN_PRODUCTION');
 assert.equal((await f.items(id))[1].updated_at,item.updated_at);
 assert.equal(checked(await f.admin.from('non_conformities').select('id').eq('production_order_id',id)).length,0);
});
test('Motivo CQ/reabertura e empresa obrigatórios não aceitam whitespace pela API',async()=>{
 const released=await f.create();
 denied(await f.clients[2].rpc('quality_decide_order',{order_id:released,expected_version:(await f.read(released)).version,decision:'REJECTED',reason:'\n\t'}));
 assert.equal((await f.read(released)).status,'RELEASED');
 checked(await f.clients[2].rpc('quality_decide_order',{order_id:released,expected_version:(await f.read(released)).version,decision:'REJECTED',reason:'Correção necessária'}));
 denied(await f.clients[2].rpc('quality_decide_order',{order_id:released,expected_version:(await f.read(released)).version,decision:'IN_PRODUCTION',reason:'\n\t'}));
 assert.equal((await f.read(released)).status,'BLOCKED_QUALITY');
 const id=await f.ready();
 denied(await f.clients[1].rpc('pcp_finalize_order',{order_id:id,expected_version:(await f.read(id)).version,company_name:'\n\t'}));
 assert.equal((await f.read(id)).status,'AWAITING_PCP');
 await f.finalize(id);
 denied(await f.clients[0].rpc('reopen_order',{order_id:id,expected_version:(await f.read(id)).version,reason:'\n\t'}));
 assert.equal((await f.read(id)).status,'FINALIZED');
});
test('Resposta TEXT, descrição de apontamento/NC e fechamento não aceitam whitespace pela API',async()=>{
 const id=await f.create();await f.start(id);
 for(const valor of ['\n\t','\u00a0','\ufeff'])denied(await f.measure(id,3,{valor}));
 denied(await f.clients[3].rpc('operator_add_note',{order_id:id,payload:{tipo:'OBSERVACAO',descricao:'\n\t'}}));
 denied(await f.clients[2].rpc('quality_save_nc',{payload:{production_order_id:id,tipo:'PROCESSO',descricao:'\n\t',severidade:'MEDIUM',status:'OPEN',impeditiva:true}}));
 const nc=checked(await f.clients[2].rpc('quality_save_nc',{payload:{production_order_id:id,tipo:'PROCESSO',descricao:'Descrição válida',severidade:'MEDIUM',status:'OPEN',impeditiva:true}}));
 checked(await f.clients[2].from('non_conformities').update({status:'AWAITING_QUALITY'}).eq('id',nc));
 denied(await f.clients[2].from('non_conformities').update({status:'CLOSED',acao_imediata:'\n\t',observacao_cq:'\n\t',responsavel_id:f.users[2].id}).eq('id',nc));
 assert.equal(checked(await f.admin.from('non_conformities').select('status').eq('id',nc).single()).status,'AWAITING_QUALITY');
});
