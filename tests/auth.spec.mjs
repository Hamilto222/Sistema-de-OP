import { test, expect } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { localAdmin, localConfig, checked } from '../scripts/local-supabase.mjs';
import { seedUsers, testPassword } from '../supabase/seed/users.mjs';

let users, admin, inactive;
const password=testPassword();
const suffix=`-browser-${Date.now()}`;

test.beforeAll(async()=>{
  admin=localAdmin(); users=await seedUsers(password,suffix);
  inactive=checked(await admin.auth.admin.createUser({email:`inactive${suffix}@opdigital.example`,password,email_confirm:true})).user;
});
test.afterAll(async()=>{
  if (users) checked(await admin.from('profiles').update({ativo:false}).in('id',users.map(u=>u.id)));
});
async function login(page,email,pass=password) {
  await page.goto('/login');
  await page.getByLabel('E-mail',{exact:true}).fill(email);
  await page.getByLabel('Senha',{exact:true}).fill(pass);
  await page.getByRole('button',{name:'Entrar',exact:true}).click();
}

test('rota protegida exige Auth; cookie falsificado não concede acesso',async({page,context})=>{
  await page.goto('/sistema'); await expect(page).toHaveURL(/\/login$/);
  await context.addCookies([{name:`sb-${new URL(localConfig().url).hostname.split('.')[0]}-auth-token`,value:'base64-'+Buffer.from(JSON.stringify({access_token:'fake-admin',refresh_token:'fake-refresh',expires_at:Math.floor(Date.now()/1000)+3600})).toString('base64url'),url:'http://127.0.0.1:3100',httpOnly:true}]);
  await page.goto('/sistema'); await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading',{name:'Entrar no OP Digital'})).toBeVisible();
});

test('credenciais inválidas são negadas pelo Supabase Auth real',async({page})=>{
  await login(page,users[0].email,randomBytes(32).toString('hex'));
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Não foi possível entrar');
  await expect(page).toHaveURL(/\/login$/);
});

test('usuário Auth com perfil inativo não pode entrar',async({page})=>{
  await login(page,inactive.email);
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Seu acesso não está ativo');
  await page.goto('/sistema'); await expect(page).toHaveURL(/\/login/);
});

for (let index=0;index<5;index++) {
  test(`login real e persistência segura do perfil demonstrativo ${index+1}`,async({page,context,browser})=>{
    const user=users[index];
    await login(page,user.email);
    await expect(page).toHaveURL(/\/sistema$/);
    await expect(page.getByRole('heading')).toContainText(user.nome);
    const cookies=(await context.cookies()).filter(cookie=>cookie.name.startsWith('sb-'));
    expect(cookies.length).toBeGreaterThan(0);
    expect(cookies.every(cookie=>cookie.httpOnly && cookie.secure && cookie.sameSite==='Lax')).toBeTruthy();
    await page.reload(); await expect(page.getByRole('heading')).toContainText(user.nome);
    const resumed=await browser.newContext({storageState:await context.storageState()});
    const resumedPage=await resumed.newPage();
    await resumedPage.goto('http://127.0.0.1:3100/sistema');
    await expect(resumedPage.getByRole('heading')).toContainText(user.nome);
    await resumed.close();
    await page.getByRole('button',{name:'Sair',exact:true}).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto('/sistema'); await expect(page).toHaveURL(/\/login$/);
  });
}

test('perfil desativado perde acesso com sessão previamente válida',async({page})=>{
  await login(page,users[3].email); await expect(page).toHaveURL(/\/sistema$/);
  checked(await admin.from('profiles').update({ativo:false}).eq('id',users[3].id));
  await page.goto('/sistema'); await expect(page).toHaveURL(/\/login\?motivo=inativo$/);
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Acesso inativo');
});

test('formulário e área autenticada são utilizáveis em tablet',async({page})=>{
  await page.setViewportSize({width:768,height:1024});
  await login(page,users[1].email); await expect(page).toHaveURL(/\/sistema$/);
  const size=await page.getByRole('button',{name:'Sair',exact:true}).boundingBox();
  expect(size.height).toBeGreaterThanOrEqual(48);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);
  expect(overflow).toBe(false);
});
