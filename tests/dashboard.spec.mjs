import {test,expect} from '@playwright/test';
import {operatorFixture} from './fixtures/operator.mjs';
import {checked,localClient} from '../scripts/local-supabase.mjs';
test.use({locale:'pt-BR'});
let f,id;
test.beforeAll(async()=>{f=await operatorFixture('dashboard');id=await f.create();const measured=await f.create();await f.start(measured);checked(await f.measure(measured,0,{valor:'true',observacao:'Vazamento observado durante inspeção.'}));});
test.afterAll(async()=>{await f?.cleanup();});
async function login(page,index){await page.goto('/login');await page.getByLabel('E-mail').fill(f.users[index].email);await page.getByLabel('Senha',{exact:true}).fill(f.password);await page.getByRole('button',{name:'Entrar'}).click();await expect(page).toHaveURL(/\/(pcp|qualidade|operador|sistema)$/);}
async function noOverflow(page){expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
test('Agregações reais, período, unidades e autorização no PostgreSQL',async()=>{
 const stats=checked(await f.clients[1].rpc('dashboard_analytics',{period_start:'2026-10-07',period_end:'2026-10-07'}));
 const expected=[];
 for(let offset=0;;offset+=1000){
  const rows=checked(await f.admin.from('production_orders').select('id,status,quantidade_planejada,quantidade_produzida,unidade').eq('data_programada','2026-10-07').order('id').range(offset,offset+999));
  expected.push(...rows);if(rows.length<1000)break;
 }
 expect(stats.ncProducts.find(row=>row.label.includes(f.product.codigo)).value).toBe(1);
 expect(stats.parameters.find(row=>row.label==='Há vazamento?').value).toBeGreaterThanOrEqual(1);
 expect(stats.cards.Liberadas).toBe(expected.filter(o=>o.status==='RELEASED').length);
 const units=new Set(expected.filter(o=>o.status!=='CANCELLED').map(o=>o.unidade));
 expect(new Set(stats.quantities.map(q=>q.unit))).toEqual(units);
 for(const q of stats.quantities)expect(q.planned).toBe(expected.filter(o=>o.unidade===q.unit&&o.status!=='CANCELLED').reduce((sum,o)=>sum+o.quantidade_planejada,0));
 expect(checked(await f.clients[2].rpc('dashboard_analytics',{period_start:'2100-01-01',period_end:'2100-01-02'})).status).toEqual([]);
 expect((await f.clients[3].rpc('dashboard_analytics',{})).error).toBeTruthy();
 expect((await localClient().rpc('dashboard_analytics',{})).error).toBeTruthy();
 checked(await f.admin.from('profiles').update({ativo:false}).eq('id',f.users[2].id));
 try{expect((await f.clients[2].rpc('dashboard_analytics',{})).error).toBeTruthy();}finally{checked(await f.admin.from('profiles').update({ativo:true}).eq('id',f.users[2].id));}
 expect((await f.clients[1].rpc('dashboard_analytics',{period_start:'2026-10-08',period_end:'2026-10-07'})).error).toBeTruthy();
});
for(const viewport of [{width:768,height:1024},{width:800,height:1280}]){
 test(`PCP tablet ${viewport.width}: gráficos, cards, filtro e menu`,async({page})=>{
 await page.setViewportSize(viewport);await login(page,1);await page.goto('/pcp');await expect(page.getByRole('region',{name:'OPs por status',exact:true})).toBeVisible();await noOverflow(page);await page.screenshot({path:`/tmp/op-dashboard-pcp-${viewport.width}.png`,fullPage:true});
 await page.getByLabel('Período inicial').first().fill('2100-01-01');await page.getByLabel('Período final').first().fill('2100-01-02');await page.getByRole('button',{name:'Aplicar período'}).click();await expect(page.getByRole('region',{name:'OPs por status',exact:true})).toContainText('Sem registros');
 await page.getByRole('button',{name:/^Menu/}).click();await page.getByRole('navigation',{name:'Navegação principal'}).getByRole('link',{name:'Ordens de produção',exact:true}).click();await expect(page.getByRole('navigation',{name:'Localização'})).toBeVisible();await noOverflow(page);
 });
 test(`CQ e operador tablet ${viewport.width}`,async({page})=>{
 await page.setViewportSize(viewport);await login(page,2);await page.goto('/qualidade');await expect(page.getByRole('region',{name:'Taxa de conformidade',exact:true})).toBeVisible();await noOverflow(page);await page.screenshot({path:`/tmp/op-dashboard-cq-${viewport.width}.png`,fullPage:true});
 await page.context().clearCookies();await login(page,3);await page.goto(`/operador/op/${id}`);await expect(page.getByRole('button',{name:'INICIAR PRODUÇÃO',exact:true})).toBeVisible();await noOverflow(page);
 expect(await page.getByRole('button',{name:'INICIAR PRODUÇÃO',exact:true}).evaluate(el=>el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(48);
 });
}

for(const viewport of [{width:768,height:1024},{width:800,height:1280}])test(`Admin dialog e tabela ${viewport.width}`,async({page})=>{
 await page.setViewportSize(viewport);await login(page,0);await page.goto('/admin/linhas?q='+encodeURIComponent(f.line.nome));await page.getByRole('button',{name:'Desativar',exact:true}).click();const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();const box=await dialog.boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(viewport.width);expect(box.height).toBeLessThanOrEqual(viewport.height);await dialog.getByRole('button',{name:'Cancelar'}).click();await noOverflow(page);
});
test('Desktop mantém tabela PCP e destaque da rota filha',async({page})=>{await page.setViewportSize({width:1440,height:1000});await login(page,1);await page.goto('/pcp/ordens');await expect(page.getByRole('table')).toBeVisible();await page.goto(`/pcp/ordens/${id}`);await expect(page.getByRole('navigation',{name:'Navegação principal'}).getByRole('link',{name:'Ordens de produção',exact:true})).toHaveAttribute('aria-current','page');await noOverflow(page);});
test('Mensagem de sucesso acessível pode ser fechada sem apagar o cadastro',async({page})=>{
 await login(page,0);await page.goto('/admin/linhas?novo=1');const name=`Linha UX ${Date.now()}`;await page.getByLabel('Nome',{exact:true}).fill(name);await page.getByLabel('Setor',{exact:true}).fill('Validação UX');await page.getByRole('button',{name:'Salvar',exact:true}).click();await expect(page.getByRole('status')).toContainText('salvo com sucesso');await page.getByRole('button',{name:'Fechar mensagem de sucesso'}).click();await expect(page.getByRole('status')).toHaveCount(0);expect(checked(await f.admin.from('production_lines').select('id').eq('nome',name))).toHaveLength(1);
});
test('Período inválido apresenta erro e não consulta gráficos sem filtro',async({page})=>{
 await login(page,1);await page.goto('/pcp?inicio=2026-10-08&fim=2026-10-07');await expect(page.getByRole('alert').first()).toContainText('Período inicial deve anteceder o final');await expect(page.getByRole('region',{name:'OPs por status',exact:true})).toHaveCount(0);
});
test.describe('Controles em dispositivo de toque',()=>{
 test.use({hasTouch:true});
 for(const viewport of [{width:768,height:1024},{width:800,height:1280}])test(`Toque tablet ${viewport.width}: controles de 56 px`,async({page})=>{
  await page.setViewportSize(viewport);await login(page,1);await page.goto('/pcp');expect(await page.evaluate(()=>matchMedia('(pointer: coarse)').matches)).toBe(true);expect(await page.getByRole('button',{name:'Aplicar período'}).evaluate(el=>el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(56);expect(await page.getByLabel('Período inicial').first().evaluate(el=>el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(56);await noOverflow(page);
 });
});
