import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { localAdmin, localClient, checked } from '../scripts/local-supabase.mjs';
import { seedUsers, testPassword } from '../supabase/seed/users.mjs';
import { productionPdf } from './fixtures/pdf.mjs';
let admin, users, product, model, target, line;
const password=testPassword(), suffix=`-pcp-ui-${Date.now()}`, number=`OP-UI${suffix}`, filterNumber=`FILTER-UI${suffix}`, specialNumber=`OP,%_"\\${suffix}`;
const item={ordem:1,grupo:'Preparação',item:'Há vazamento?',descricao:'Verificar ausência de vazamento.',tipo_resposta:'BOOLEAN',unidade:null,valor_minimo:null,valor_maximo:null,obrigatorio:true,momento:'ANTES',requer_revisao_cq:true,bloqueia_op_se_nao_conforme:true,configuracao:{resposta_conforme:false},ativo:true};
test.beforeAll(async()=>{
 admin=localAdmin();users=await seedUsers(password,suffix);
 line=checked(await admin.from('production_lines').insert({nome:`Linha UI${suffix}`,setor:'Montagem'}).select().single());
 model=checked(await admin.from('checklist_templates').insert({nome:`Modelo UI${suffix}`,revisao:'01',descricao:'Instruções preservadas.'}).select().single());
 checked(await admin.from('checklist_template_items').insert([{...item,template_id:model.id},{...item,template_id:model.id,ordem:2,item:'Diâmetro',tipo_resposta:'NUMBER',unidade:'mm',valor_minimo:9,valor_maximo:11,momento:'DURANTE',configuracao:{}}]));
 product=checked(await admin.from('products').insert({codigo:`PR-UI${suffix}`,descricao:`Produto UI${suffix}`,unidade:'UN',revisao:'01',checklist_template_id:model.id}).select().single());
 const pcp=localClient();checked(await pcp.auth.signInWithPassword({email:users[1].email,password}));
 for(const fixtureNumber of [filterNumber,specialNumber]){
  const id=checked(await pcp.rpc('pcp_create_order',{payload:{numero_op:fixtureNumber,produto_id:product.id,lote:'Lote UI PCP',linha_id:line.id,quantidade_planejada:200.5,unidade:'UN',prioridade:'ALTA',data_hora_programada:'2026-10-09T08:15',operador_responsavel_id:users[3].id}}));
  const path=`${id}/fixture.pdf`;checked(await pcp.storage.from('op-originals').upload(path,productionPdf(),{contentType:'application/pdf'}));checked(await pcp.rpc('pcp_attach_original',{order_id:id,document_path:path,expected_version:1}));checked(await pcp.rpc('pcp_prepare_order',{order_id:id,expected_version:2}));
 }

});
test.afterAll(async()=>{if(users)checked(await admin.from('profiles').update({ativo:false}).in('id',users.map(user=>user.id)));});
async function login(page,index=1){await page.goto('/login');await page.getByLabel('E-mail',{exact:true}).fill(users[index].email);await page.getByLabel('Senha',{exact:true}).fill(password);await page.getByRole('button',{name:'Entrar',exact:true}).click();await expect(page).toHaveURL(/\/sistema$/);}
async function fillOrder(page,opNumber=number){await page.goto('/pcp/ordens/nova');await page.getByLabel('Número OP',{exact:true}).fill(opNumber);await page.getByLabel('Produto',{exact:true}).selectOption(product.id);await page.getByLabel('Lote',{exact:true}).fill('Lote UI PCP');await page.getByLabel('Linha',{exact:true}).selectOption(line.id);await page.getByLabel('Quantidade planejada',{exact:true}).fill('200.5');await expect(page.getByLabel('Unidade',{exact:true})).toHaveValue('UN');await page.getByLabel('Prioridade',{exact:true}).selectOption('ALTA');await page.getByLabel('Data e hora programadas').fill('2026-10-09T08:15');await page.getByLabel('Operador responsável (opcional)').selectOption(users[3].id);}
async function pdf(page,file={name:'op-original.pdf',mimeType:'application/pdf',buffer:productionPdf()}){await page.getByLabel('PDF original',{exact:true}).setInputFiles(file);}

for(const index of [2,3])test(`${index===2?'QUALIDADE':'OPERADOR'} não acessa PCP nem suas ações de navegação`,async({page})=>{
 await login(page,index);for(const path of ['/pcp','/pcp/ordens','/pcp/ordens/nova',`/pcp/ordens/${randomUUID()}`,`/pcp/ordens/${randomUUID()}/pdf`]){await page.goto(path);await expect(page).toHaveURL(/\/sistema\?motivo=sem-permissao$/);await expect(page.getByRole('main').getByRole('alert')).toContainText('Acesso não autorizado');}
 await expect(page.getByRole('navigation',{name:'Navegação principal'}).getByRole('link',{name:'Visão PCP'})).toHaveCount(0);
});
test('anônimo precisa de Auth para PCP e documentos',async({page})=>{for(const path of ['/pcp','/pcp/ordens/nova',`/pcp/ordens/${randomUUID()}/pdf`]){await page.goto(path);await expect(page).toHaveURL(/\/login$/);}});
test('fluxo real: PCP cria, PDF privado, DRAFT, preparação, snapshot, RELEASED e auditoria',async({page,context})=>{
 await login(page);await fillOrder(page);await pdf(page);await page.getByRole('button',{name:'Criar OP',exact:true}).click();await expect(page).toHaveURL(/\/pcp\/ordens\/[a-f0-9-]+\?sucesso=criada$/);await expect(page.getByRole('status')).toContainText('OP criada como rascunho');
 target=checked(await admin.from('production_orders').select().eq('numero_op',number).single());expect(target.status).toBe('DRAFT');expect(target.created_by).toBe(users[1].id);expect(target.quantidade_planejada).toBe(200.5);expect(new Date(target.data_hora_programada).toISOString()).toBe('2026-10-09T11:15:00.000Z');expect(target.pdf_original_path).toMatch(new RegExp(`^${target.id}/.+\\.pdf$`));expect(Buffer.from(await (checked(await admin.storage.from('op-originals').download(target.pdf_original_path))).arrayBuffer())).toEqual(productionPdf());
 const link=page.getByRole('link',{name:'Visualizar PDF original',exact:true});await expect(link).toHaveAttribute('href',`/pcp/ordens/${target.id}/pdf`);
 const response=await context.request.get(`/pcp/ordens/${target.id}/pdf`,{headers:{Cookie:(await context.cookies()).map(cookie=>`${cookie.name}=${cookie.value}`).join('; ')},maxRedirects:0});expect(response.status()).toBe(303);expect(response.headers()['cache-control']).toBe('private, no-store');const document=await context.request.get(response.headers().location);expect(document.status()).toBe(200);expect(document.headers()['content-type']).toContain('application/pdf');expect(await document.body()).toEqual(productionPdf());
 await page.getByRole('button',{name:'Preparar OP',exact:true}).click();await expect(page.getByRole('status')).toContainText('OP preparada');await expect(page.getByRole('main').getByText('Liberada',{exact:true}).first()).toBeVisible();await expect(page.getByRole('button',{name:'Preparar OP',exact:true})).toHaveCount(0);await expect(page.getByRole('main')).toContainText('Há vazamento?');await expect(page.getByRole('main')).toContainText('Resposta conforme: Não');
 const released=checked(await admin.from('production_orders').select().eq('id',target.id).single());expect(released.status).toBe('RELEASED');expect(released.checklist_template_nome).toBe(model.nome);
 const copied=checked(await admin.from('production_order_checklist').select().eq('production_order_id',target.id).order('ordem'));expect(copied).toHaveLength(2);expect(copied[0].item).toBe(item.item);expect(copied[0].configuracao).toEqual(item.configuracao);expect(copied[1].valor_minimo).toBe(9);
 const audit=checked(await admin.from('audit_logs').select().eq('production_order_id',target.id).eq('field','status'));expect(audit.some(log=>log.new_value==='RELEASED'&&log.user_id===users[1].id)).toBe(true);
 await page.reload();expect(checked(await admin.from('production_order_checklist').select('id').eq('production_order_id',target.id))).toHaveLength(2);
});
test('número duplicado informa erro e não cria outra OP',async({page})=>{await login(page);await fillOrder(page,filterNumber);await pdf(page);await page.getByRole('button',{name:'Criar OP',exact:true}).click();await expect(page.getByRole('main').getByRole('alert')).toContainText('Já existe uma OP com esse número');expect(checked(await admin.from('production_orders').select('id').eq('numero_op',filterNumber))).toHaveLength(1);});
test('PDF: MIME, conteúdo e tamanho inválidos são rejeitados antes de criar rascunho',async({page})=>{
 await login(page);const opNumber=`INVALID${suffix}`;await fillOrder(page,opNumber);
 for(const file of [{name:'texto.pdf',mimeType:'text/plain',buffer:Buffer.from('texto')},{name:'falso.pdf',mimeType:'application/pdf',buffer:Buffer.from('não é PDF')},{name:'grande.pdf',mimeType:'application/pdf',buffer:Buffer.alloc(20*1024*1024+1)}]){
  await pdf(page,file);await page.getByRole('button',{name:'Criar OP',exact:true}).click();await expect(page.getByRole('main').getByRole('alert')).toContainText(file.mimeType==='text/plain'?'MIME':file.name==='falso.pdf'?'conteúdo':'20 MB');
 }
 expect(checked(await admin.from('production_orders').select('id').eq('numero_op',opNumber))).toHaveLength(0);
});
test('validação backend funciona sem validação HTML e modelo ausente mantém DRAFT',async({page})=>{
 await login(page);await fillOrder(page,`BACKEND${suffix}`);await pdf(page);await page.getByLabel('Quantidade planejada',{exact:true}).fill('0');await page.getByRole('button',{name:'Criar OP',exact:true}).evaluate(button=>button.form.noValidate=true);await page.getByRole('button',{name:'Criar OP',exact:true}).click();await expect(page.getByRole('main').getByRole('alert')).toContainText('quantidade deve ser maior');
 const noModel=checked(await admin.from('products').insert({codigo:'NOMODEL-UI'+suffix,descricao:'Sem modelo',unidade:'UN',revisao:'01'}).select().single());await fillOrder(page,`FAIL-PREP${suffix}`);await page.getByLabel('Produto',{exact:true}).selectOption(noModel.id);await pdf(page);await page.getByRole('button',{name:'Criar OP',exact:true}).click();await expect(page.getByRole('status')).toContainText('OP criada');await page.getByRole('button',{name:'Preparar OP',exact:true}).click();await expect(page.getByRole('main').getByRole('alert')).toContainText('Produto sem modelo');const order=checked(await admin.from('production_orders').select().eq('numero_op',`FAIL-PREP${suffix}`).single());expect(order.status).toBe('DRAFT');expect(checked(await admin.from('production_order_checklist').select('id').eq('production_order_id',order.id))).toHaveLength(0);
});
test('filtros combinados, pesquisa por OP/produto/lote e estados vazios funcionam',async({page})=>{
 await login(page);await page.goto('/pcp/ordens');await page.getByLabel('Pesquisa',{exact:true}).fill(filterNumber);await page.getByLabel('Período inicial').fill('2026-10-09');await page.getByLabel('Período final').fill('2026-10-09');await page.getByLabel('Linha',{exact:true}).selectOption(line.id);await page.getByLabel('Produto',{exact:true}).selectOption(product.id);await page.getByLabel('Status',{exact:true}).selectOption('RELEASED');await page.getByLabel('Operador',{exact:true}).selectOption(users[3].id);await page.getByRole('button',{name:'Filtrar',exact:true}).click();await expect(page.getByRole('link',{name:filterNumber,exact:true})).toBeVisible();await expect(page.getByRole('row').filter({hasText:filterNumber})).toContainText('09/10/2026 08:15');
 for(const query of [product.codigo,'Lote UI PCP']){await page.getByLabel('Pesquisa',{exact:true}).fill(query);await page.getByRole('button',{name:'Filtrar',exact:true}).click();await expect(page.getByRole('link',{name:filterNumber,exact:true})).toBeVisible();}
 await page.getByLabel('Pesquisa',{exact:true}).fill(specialNumber);await page.getByRole('button',{name:'Filtrar',exact:true}).click();await expect(page.getByRole('link',{name:specialNumber,exact:true})).toBeVisible();
 await page.getByLabel('Pesquisa',{exact:true}).fill('não existe '+suffix);await page.getByRole('button',{name:'Filtrar',exact:true}).click();await expect(page.getByRole('main')).toContainText('Nenhuma OP encontrada');
 await page.goto('/pcp/ordens?inicio=2026-10-10&fim=2026-10-09');await expect(page.getByRole('main').getByRole('alert')).toContainText('início do período');
});
test('dashboard mostra oito indicadores reais e PCP é utilizável no tablet',async({page})=>{
 await page.setViewportSize({width:768,height:1024});await login(page);await page.getByRole('button',{name:'Menu +'}).click();await page.getByRole('navigation',{name:'Navegação principal'}).getByRole('link',{name:'Visão PCP',exact:true}).click();await expect(page).toHaveURL(/\/pcp$/);for(const label of ['OPs hoje','Liberadas','Em produção','Aguardando CQ','Bloqueadas','Aguardando PCP','Finalizadas','NCs abertas'])await expect(page.getByRole('region',{name:'Indicadores PCP'}).getByRole('heading',{name:label,exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);expect((await page.getByRole('link',{name:'Nova OP',exact:true}).boundingBox()).height).toBeGreaterThanOrEqual(48);
});
test('ADMIN pode usar o mesmo fluxo PCP',async({page})=>{await login(page,0);await fillOrder(page,'ADMIN-UI'+suffix);await pdf(page);await page.getByRole('button',{name:'Criar OP',exact:true}).click();await expect(page.getByRole('status')).toContainText('OP criada');await page.getByRole('button',{name:'Preparar OP',exact:true}).click();await expect(page.getByRole('status')).toContainText('OP preparada');});

test('upload negado pelo Storage preserva rascunho e permite recuperação sem recriar OP',async({page})=>{
 const opNumber=`UPLOAD-FAIL${suffix}`;
 const sql=`create policy pcp_test_upload_rejection on storage.objects as restrictive for insert to authenticated with check (not (bucket_id='op-originals' and exists(select 1 from public.production_orders o where o.id::text=split_part(name,'/',1) and o.numero_op='${opNumber}')));`;
 execFileSync('docker',['exec','supabase_db_op-digital','psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-c',sql],{stdio:['ignore','pipe','pipe']});
 try{await login(page);await fillOrder(page,opNumber);await pdf(page);await page.getByRole('button',{name:'Criar OP',exact:true}).click();await expect(page.getByRole('main').getByRole('alert')).toContainText('rascunho foi preservado');await expect(page.getByRole('link',{name:'Abrir rascunho para anexar o PDF'})).toBeVisible();const draft=checked(await admin.from('production_orders').select().eq('numero_op',opNumber).single());expect(draft.status).toBe('DRAFT');expect(draft.pdf_original_path).toBe(null);expect(checked(await admin.from('production_order_checklist').select('id').eq('production_order_id',draft.id))).toHaveLength(0);}
 finally{execFileSync('docker',['exec','supabase_db_op-digital','psql','-U','postgres','-d','postgres','-c','drop policy pcp_test_upload_rejection on storage.objects'],{stdio:['ignore','pipe','pipe']});}
 await page.getByRole('link',{name:'Abrir rascunho para anexar o PDF'}).click();await expect(page.getByRole('heading',{name:`OP ${opNumber}`,exact:true})).toBeVisible();await pdf(page);await page.getByRole('button',{name:'Enviar PDF',exact:true}).click();await expect(page.getByRole('status')).toContainText('PDF original anexado');await page.getByRole('button',{name:'Preparar OP',exact:true}).click();await expect(page.getByRole('status')).toContainText('OP preparada');expect(checked(await admin.from('production_orders').select('status').eq('numero_op',opNumber))).toEqual([{status:'RELEASED'}]);
});

test('ação PCP revalida perfil mesmo em POST forjado pela rota sistema',async({page,context})=>{
 await login(page);await fillOrder(page,'ACTION'+suffix);await pdf(page);
 const wait=page.waitForRequest(request=>request.method()==='POST'&&!!request.headers()['next-action']);await page.getByRole('button',{name:'Criar OP',exact:true}).click();const original=await wait;await expect(page.getByRole('status')).toContainText('OP criada');
 await page.getByRole('button',{name:'Sair',exact:true}).click();await expect(page).toHaveURL(/\/login$/);await login(page,3);
 const response=await context.request.post('/sistema',{headers:{'Next-Action':original.headers()['next-action'],'Origin':'http://127.0.0.1:3100','Cookie':(await context.cookies()).map(cookie=>`${cookie.name}=${cookie.value}`).join('; ')},multipart:{'0':JSON.stringify([{},'$K1']),'1_numero_op':'ACTION'+suffix,'1_pdf':{name:'fixture.pdf',mimeType:'application/pdf',buffer:productionPdf()}},maxRedirects:0});expect(response.headers()['x-action-redirect']).toContain('/sistema?motivo=sem-permissao');expect(checked(await admin.from('production_orders').select('id').eq('numero_op','ACTION'+suffix))).toHaveLength(1);
});
