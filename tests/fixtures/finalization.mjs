import { operatorFixture } from './operator.mjs';
import { checked } from '../../scripts/local-supabase.mjs';
import { renderStoredReport } from '../../src/features/finalization/generate.ts';
export async function finalizationFixture(label){
 const f=await operatorFixture(label);
 async function approve(id){for(const item of await f.items(id))if(item.requer_revisao_cq&&!item.revisado_cq)checked(await f.clients[2].rpc('quality_review_item',{order_id:id,item_id:item.id,expected_updated_at:item.updated_at}));checked(await f.clients[2].rpc('quality_decide_order',{order_id:id,expected_version:(await f.read(id)).version,decision:'APPROVED',reason:''}));}
 async function send(id){checked(await f.clients[3].rpc('operator_submit_order',{order_id:id,expected_version:(await f.read(id)).version,produced:98,lost:2,final_note:'Produção concluída e inspecionada.'}));}
 async function ready(){const id=await f.create();await f.start(id);await f.complete(id);checked(await f.measure(id,5,{valor:'5'}));await send(id);await approve(id);return id;}
 async function finalize(id,client=f.clients[1],render=true){const index=f.clients.indexOf(client);checked(await client.auth.signInWithPassword({email:f.users[index].email,password:f.password}));const report=checked(await client.rpc('pcp_finalize_order',{order_id:id,expected_version:(await f.read(id)).version,company_name:'Indústria de Validação OP Digital'}));if(render)await renderStoredReport(client,report);return report;}
 async function report(id){return checked(await f.admin.from('final_reports').select().eq('id',id).single());}
 return {...f,approve,send,ready,finalize,report};
}
