import { randomUUID } from 'node:crypto';
import { checked, localClient, localAdmin } from '../../scripts/local-supabase.mjs';
import { seedUsers, testPassword } from '../../supabase/seed/users.mjs';
import { productionPdf } from './pdf.mjs';
export const photoPng = () => Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEklEQVQImWMwTptpnDaTAUIBAB/uBMm6iK1UAAAAAElFTkSuQmCC','base64');
export async function operatorFixture(label) {
 const suffix=`-${label}-${Date.now()}-${randomUUID().slice(0,6)}`, password=testPassword(), admin=localAdmin(), users=await seedUsers(password,suffix), clients=[];
 for(const user of users){const client=localClient();checked(await client.auth.signInWithPassword({email:user.email,password}));clients.push(client);}
 const line=checked(await clients[0].from('production_lines').insert({nome:`Linha operador${suffix}`,setor:'Produção'}).select().single());
 checked(await admin.from('profiles').update({production_line_id:line.id}).eq('id',users[3].id));
 const base={grupo:'Processo',descricao:'Siga a instrução registrada.',unidade:null,valor_minimo:null,valor_maximo:null,obrigatorio:true,momento:'DURANTE',requer_revisao_cq:true,bloqueia_op_se_nao_conforme:false,configuracao:{}};
 const definitions=[{...base,ordem:1,item:'Há vazamento?',tipo_resposta:'BOOLEAN',grupo:'Preparação',momento:'ANTES',configuracao:{resposta_conforme:false},bloqueia_op_se_nao_conforme:true},{...base,ordem:2,item:'Diâmetro',tipo_resposta:'NUMBER',unidade:'mm',valor_minimo:9,valor_maximo:11,bloqueia_op_se_nao_conforme:true},{...base,ordem:3,item:'Acabamento',tipo_resposta:'SELECT',configuracao:{opcoes:['Bom','Ruim'],opcoes_conformes:['Bom']}},{...base,ordem:4,item:'Identificação da embalagem',tipo_resposta:'TEXT',momento:'DEPOIS',grupo:'Finalização'},{...base,ordem:5,item:'Foto do produto',tipo_resposta:'PHOTO',momento:'DEPOIS',grupo:'Finalização'},{...base,ordem:6,item:'Temperatura opcional',tipo_resposta:'NUMBER',valor_minimo:5,valor_maximo:null,obrigatorio:false}];
 const model=checked(await clients[0].rpc('admin_save_checklist',{payload:{nome:`Modelo operador${suffix}`,revisao:'01',ativo:true,itens:definitions}}));
 const product=checked(await clients[0].from('products').insert({codigo:`PR${suffix}`,descricao:'Produto do operador',unidade:'UN',revisao:'01',checklist_template_id:model}).select().single());
 async function read(id){return checked(await admin.from('production_orders').select().eq('id',id).single());}
 async function items(id){return checked(await admin.from('production_order_checklist').select().eq('production_order_id',id).order('ordem'));}
 async function create({released=true,assigned=users[3].id,lineId=line.id}={}) {
  const id=checked(await clients[1].rpc('pcp_create_order',{payload:{numero_op:`OP${suffix}-${randomUUID().slice(0,6)}`,produto_id:product.id,lote:'Lote operador',linha_id:lineId,quantidade_planejada:100,unidade:'UN',prioridade:'ALTA',data_hora_programada:'2026-10-07T08:00',operador_responsavel_id:assigned}}));
  if(released){const path=`${id}/original.pdf`;checked(await clients[1].storage.from('op-originals').upload(path,productionPdf(),{contentType:'application/pdf'}));checked(await clients[1].rpc('pcp_attach_original',{order_id:id,document_path:path,expected_version:1}));checked(await clients[1].rpc('pcp_prepare_order',{order_id:id,expected_version:2}));} return id;
 }
 async function start(id){checked(await clients[3].rpc('operator_start_order',{order_id:id,expected_version:(await read(id)).version}));}
 async function measure(id,index,payload){const item=(await items(id))[index];return clients[3].rpc('operator_save_measure',{order_id:id,item_id:item.id,expected_updated_at:item.updated_at,payload});}
 async function upload(id){const path=`${id}/${randomUUID()}.png`;checked(await clients[3].storage.from('operator-evidence').upload(path,photoPng(),{contentType:'image/png'}));return path;}
 async function complete(id){for(const [index,valor] of [[0,'false'],[1,'10'],[2,'Bom'],[3,'Etiqueta verificada']])checked(await measure(id,index,{valor}));checked(await measure(id,4,{foto_path:await upload(id)}));}
 async function cleanup(){checked(await admin.from('profiles').update({ativo:false}).in('id',users.map(user=>user.id)));}
 return {admin,users,clients,password,line,product,model,create,read,items,start,measure,upload,complete,cleanup};
}
