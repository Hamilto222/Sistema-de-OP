import {checked} from '../../scripts/local-supabase.mjs';
// Exercise the explicit CQ action; a status change alone never resumes production.
export async function releaseForCorrection(f,id,ncId){
 let rows=checked(await f.admin.from('non_conformities').select().eq('production_order_id',id).eq('impeditiva',true).in('status',['OPEN','IN_TREATMENT','AWAITING_QUALITY']));
 if(!rows.length){const created=checked(await f.clients[2].rpc('quality_save_nc',{payload:{production_order_id:id,tipo:'PROCESSO',descricao:'Correção solicitada pelo CQ',severidade:'HIGH',impeditiva:true,status:'OPEN'}}));rows=[checked(await f.admin.from('non_conformities').select().eq('id',created).single())];}
 for(const n of rows)checked(await f.clients[2].from('non_conformities').update({status:'IN_TREATMENT',responsavel_id:f.users[3].id,acao_imediata:'Realizar ajuste e nova medição',observacao_cq:'Retomada supervisionada para correção'}).eq('id',n.id));
 const n=checked(await f.admin.from('non_conformities').select().eq('id',ncId||rows[0].id).single());
 checked(await f.clients[2].rpc('quality_release_correction',{nc_id:n.id,expected_version:(await f.read(id)).version,expected_updated_at:n.updated_at}));return n;
}
export async function reviewCorrection(f,id,index=1){const item=(await f.items(id))[index];checked(await f.clients[2].rpc('quality_review_item',{order_id:id,item_id:item.id,expected_updated_at:item.updated_at}));}
