import {test,expect} from '@playwright/test';
import {operatorFixture} from './fixtures/operator.mjs';
import {checked} from '../scripts/local-supabase.mjs';
let f;
test.beforeAll(async()=>{f=await operatorFixture('historical-evidence');});
test.afterAll(async()=>f?.cleanup());
async function login(page,index){await page.goto('/login');await page.getByLabel('E-mail',{exact:true}).fill(f.users[index].email);await page.getByLabel('Senha',{exact:true}).fill(f.password);await page.getByRole('button',{name:'Entrar',exact:true}).click();await expect(page).toHaveURL(/\/sistema$/);}
test('evidências históricas: duas tentativas mantêm arquivos privados; anônimo e operador de outra linha não acessam',async({page,context})=>{
 const id=await f.create();await f.start(id);const first=await f.upload(id),second=await f.upload(id);checked(await f.measure(id,1,{valor:'10',foto_path:first}));checked(await f.measure(id,1,{valor:'11',foto_path:second}));
 const rows=checked(await f.admin.from('checklist_measurements').select().eq('production_order_id',id).order('sequence'));expect(rows.map(m=>m.evidence_path)).toEqual([first,second]);
 const headers=async()=>({Cookie:(await context.cookies()).map(cookie=>`${cookie.name}=${cookie.value}`).join('; ')});
 const route=m=>`/sistema/ordens/${id}/medicoes/${m.id}/evidencia`;
 const anonymous=await context.request.get(route(rows[0]),{maxRedirects:0});expect(anonymous.status()).toBe(303);expect(anonymous.headers().location).toMatch(/\/login$/);
 await login(page,3);await page.goto(`/operador/op/${id}`);await expect(page.getByRole('link',{name:'Ver evidência da tentativa 1',exact:true})).toBeVisible();
 for(const row of rows){const response=await context.request.get(route(row),{headers:await headers(),maxRedirects:0});expect(response.status()).toBe(303);expect(response.headers()['cache-control']).toBe('private, no-store');expect(response.headers()['referrer-policy']).toBe('no-referrer');expect(response.headers().location.includes('/storage/v1/object/sign/operator-evidence/')).toBe(true);const file=await context.request.get(response.headers().location);expect(file.status()).toBe(200);expect(file.headers()['content-type']).toContain('image/png');}
 const wrongOrder=await f.create();expect((await context.request.get(`/sistema/ordens/${wrongOrder}/medicoes/${rows[0].id}/evidencia`,{headers:await headers(),maxRedirects:0})).status()).toBe(404);
 await page.getByRole('button',{name:'Sair',exact:true}).click();await expect(page).toHaveURL(/\/login$/);await login(page,4);expect((await context.request.get(route(rows[0]),{headers:await headers(),maxRedirects:0})).status()).toBe(404);
});
