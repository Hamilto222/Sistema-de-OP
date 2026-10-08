import { test, expect } from '@playwright/test';
import { localAdmin, checked } from '../scripts/local-supabase.mjs';
import { seedUsers, testPassword } from '../supabase/seed/users.mjs';
let admin, users;
const suffix=`-admin-ui-${Date.now()}`;
const password=testPassword();
const lineName=`Linha UI${suffix}`, productCode=`PR-UI${suffix}`, modelName=`Modelo UI${suffix}`;
test.beforeAll(async()=>{admin=localAdmin();users=await seedUsers(password,suffix);});
test.afterAll(async()=>{if(users)checked(await admin.from('profiles').update({ativo:false}).in('id',users.map(u=>u.id)));});
async function login(page,index=0){
 await page.goto('/login');await page.getByLabel('E-mail',{exact:true}).fill(users[index].email);await page.getByLabel('Senha',{exact:true}).fill(password);await page.getByRole('button',{name:'Entrar',exact:true}).click();await expect(page).toHaveURL(/\/sistema$/);
}
async function search(page,text,column){
 await page.getByLabel('Pesquisa',{exact:true}).fill(text);
 if(column)await page.getByLabel('Pesquisar por').selectOption(column);
 await page.getByRole('button',{name:'Pesquisar',exact:true}).click();
}
const row=(page,text)=>page.getByRole('row').filter({hasText:text});
async function success(page,text='salvo'){await expect(page.getByRole('status')).toContainText(`Cadastro ${text} com sucesso`);}

test('anônimo não acessa nenhuma página administrativa',async({page})=>{
 for(const kind of ['usuarios','linhas','produtos','checklists']){await page.goto('/admin/'+kind);await expect(page).toHaveURL(/\/login$/);}
});
for(const index of [1,2,3])test(`${['','PCP','QUALIDADE','OPERADOR'][index]} não acessa páginas ADMIN`,async({page})=>{
 await login(page,index);
 for(const kind of ['usuarios','linhas','produtos','checklists']){await page.goto('/admin/'+kind);await expect(page).toHaveURL(/\/sistema\?motivo=sem-permissao$/);await expect(page.getByRole('main').getByRole('alert')).toContainText('Acesso não autorizado');}
 await expect(page.getByRole('navigation',{name:'Navegação principal'}).getByRole('link',{name:'Usuários',exact:true})).toHaveCount(0);
});
test('linha: cria, pesquisa, edita, cancela/confirma desativação e reativa',async({page})=>{
 await login(page);await page.goto('/admin/linhas?novo=1');
 await page.getByLabel('Nome',{exact:true}).fill(lineName);await page.getByLabel('Setor',{exact:true}).fill('Montagem');await page.getByLabel('Descrição',{exact:true}).fill('Área industrial');await page.getByRole('button',{name:'Salvar',exact:true}).click();await success(page);
 await search(page,lineName);await expect(row(page,lineName)).toContainText('Montagem');await row(page,lineName).getByRole('link',{name:'Editar',exact:true}).click();
 await page.getByLabel('Setor',{exact:true}).fill('Embalagem');await page.getByRole('button',{name:'Salvar',exact:true}).click();await success(page);await search(page,lineName);
 await row(page,lineName).getByRole('button',{name:'Desativar',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Cancelar',exact:true}).click();await expect(row(page,lineName)).toContainText('Ativo');
 await row(page,lineName).getByRole('button',{name:'Desativar',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Confirmar desativação',exact:true}).click();await success(page,'desativado');await search(page,lineName);await expect(row(page,lineName)).toContainText('Inativo');
 await row(page,lineName).getByRole('link',{name:'Editar',exact:true}).click();await page.getByLabel('Linha ativa').check();await page.getByRole('button',{name:'Salvar',exact:true}).click();await success(page);
});
test('validação backend rejeita formulário inválido mesmo sem validação HTML',async({page})=>{
 await login(page);await page.goto('/admin/linhas?novo=1');await page.getByLabel('Setor',{exact:true}).fill('Teste');
 await page.getByRole('button',{name:'Salvar',exact:true}).evaluate(button=>button.form.noValidate=true);
 await page.getByRole('button',{name:'Salvar',exact:true}).click();await expect(page.getByRole('main').getByRole('alert')).toContainText('Campo obrigatório');
 const result=checked(await admin.from('production_lines').select('id').eq('nome',''));expect(result).toHaveLength(0);
});
test('modelo: configura BOOLEAN/SELECT/NUMBER; duplica, revisa, edita e desativa',async({page})=>{
 await login(page);await page.goto('/admin/checklists?novo=1');
 await page.getByLabel('Nome',{exact:true}).fill(modelName);await page.getByLabel('Revisão',{exact:true}).fill('01');
 const first=page.getByRole('group',{name:'Item 1',exact:true});await first.getByLabel('Item',{exact:true}).fill('Há vazamento?');await first.getByLabel('Resposta conforme').selectOption('false');
 await page.getByRole('button',{name:'Adicionar item'}).click();const second=page.getByRole('group',{name:'Item 2',exact:true});await second.getByLabel('Item',{exact:true}).fill('Acabamento');await second.getByLabel('Tipo da resposta').selectOption('SELECT');await second.getByLabel('Opções (uma por linha)',{exact:true}).fill('Bom\nRuim');await second.getByLabel('Opções conformes (uma por linha; vazio = todas)').fill('Bom');
 await page.getByRole('button',{name:'Adicionar item'}).click();const third=page.getByRole('group',{name:'Item 3',exact:true});await third.getByLabel('Item',{exact:true}).fill('Diâmetro');await third.getByLabel('Tipo da resposta').selectOption('NUMBER');await third.getByLabel('Mínimo',{exact:true}).fill('9');await third.getByLabel('Máximo',{exact:true}).fill('11');await third.getByLabel('Unidade',{exact:true}).fill('mm');
 await page.getByRole('button',{name:'Salvar',exact:true}).click();await success(page);await search(page,modelName);
 await row(page,modelName).getByRole('link',{name:'Duplicar',exact:true}).click();await page.getByRole('button',{name:'Salvar',exact:true}).click();await success(page);
 await search(page,modelName);const origin=page.getByRole('row').filter({has:page.getByRole('cell',{name:modelName,exact:true})});await origin.getByRole('link',{name:'Nova revisão',exact:true}).click();await page.getByLabel('Revisão',{exact:true}).fill('02');await page.getByRole('button',{name:'Salvar',exact:true}).click();await success(page);
 await search(page,modelName);const revision=page.getByRole('row').filter({has:page.getByRole('cell',{name:modelName,exact:true})}).filter({has:page.getByRole('cell',{name:'02',exact:true})});await revision.getByRole('link',{name:'Editar',exact:true}).click();
 await expect(page.getByRole('group',{name:'Item 1',exact:true}).getByLabel('Resposta conforme')).toHaveValue('false');await expect(page.getByRole('group',{name:'Item 2',exact:true}).getByLabel('Opções (uma por linha)',{exact:true})).toHaveValue('Bom\nRuim');
 await page.getByRole('group',{name:'Item 3',exact:true}).getByRole('button',{name:'Remover item 3'}).click();await page.getByRole('button',{name:'Salvar',exact:true}).click();await success(page);
 await search(page,modelName);await revision.getByRole('button',{name:'Desativar',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Confirmar desativação'}).click();await success(page,'desativado');
});
test('produto: cria com modelo, edita revisão, desativa sem remover registro',async({page})=>{
 await login(page);await page.goto('/admin/produtos?novo=1');await page.getByLabel('Código',{exact:true}).fill(productCode);await page.getByLabel('Descrição',{exact:true}).fill('Produto UI');await page.getByLabel('Unidade',{exact:true}).fill('UN');await page.getByLabel('Revisão',{exact:true}).fill('01');
 const model=checked(await admin.from('checklist_templates').select('id').eq('nome',modelName).eq('revisao','01').single());await page.getByLabel('Modelo de checklist').selectOption(model.id);await page.getByRole('button',{name:'Salvar',exact:true}).click();await success(page);
 await search(page,productCode);await expect(row(page,productCode)).toContainText(modelName);await row(page,productCode).getByRole('link',{name:'Editar',exact:true}).click();await page.getByLabel('Revisão',{exact:true}).fill('02');await page.getByRole('button',{name:'Salvar',exact:true}).click();await success(page);
 await search(page,productCode);await row(page,productCode).getByRole('button',{name:'Desativar',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Confirmar desativação'}).click();await success(page,'desativado');
 expect(checked(await admin.from('products').select('ativo').eq('codigo',productCode).single()).ativo).toBe(false);
});
test('usuários: pesquisa por e-mail e edita profile sem alteração de Auth',async({page})=>{
 await login(page);await page.goto('/admin/usuarios');await search(page,users[4].email,'email');await row(page,users[4].email).getByRole('link',{name:'Editar',exact:true}).click();
 await expect(page.getByLabel('E-mail (Supabase Auth)')).toHaveAttribute('readonly','');await page.getByLabel('Nome',{exact:true}).fill(`Operador Editado${suffix}`);await page.getByLabel('Perfil',{exact:true}).selectOption('QUALIDADE');await page.getByLabel('Linha padrão').selectOption('10000000-0000-4000-8000-000000000001');await page.getByLabel('Permitir reabertura de OP').check();await page.getByLabel('Usuário ativo').uncheck();await page.getByRole('button',{name:'Salvar',exact:true}).click();await success(page);
 const profile=checked(await admin.from('profiles').select().eq('id',users[4].id).single());expect(profile.role).toBe('QUALIDADE');expect(profile.ativo).toBe(false);expect(profile.can_reopen_orders).toBe(true);
 expect(checked(await admin.auth.admin.getUserById(users[4].id)).user.email).toBe(users[4].email);
});
test('layout de tablet permite navegação, mantém tamanho dos botões e não excede viewport',async({page})=>{
 await page.setViewportSize({width:768,height:1024});await login(page);await page.getByRole('button',{name:'Menu +'}).click();await page.getByRole('navigation',{name:'Navegação principal'}).getByRole('link',{name:'Linhas',exact:true}).click();await expect(page).toHaveURL(/\/admin\/linhas$/);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 expect((await page.getByRole('button',{name:'Sair',exact:true}).boundingBox()).height).toBeGreaterThanOrEqual(48);
 await page.getByRole('button',{name:'Sair',exact:true}).click();await expect(page).toHaveURL(/\/login$/);
});
test('sessão perde administração após alteração do perfil no banco',async({page})=>{
 await login(page);await page.goto('/admin/linhas?novo=1');checked(await admin.from('profiles').update({role:'PCP'}).eq('id',users[0].id));
 await page.getByLabel('Nome',{exact:true}).fill(`PROIBIDA${suffix}`);await page.getByLabel('Setor',{exact:true}).fill('Proibido');await page.getByRole('button',{name:'Salvar',exact:true}).click();await expect(page).toHaveURL(/\/sistema\?motivo=sem-permissao$/);
 expect(checked(await admin.from('production_lines').select('id').eq('nome',`PROIBIDA${suffix}`))).toHaveLength(0);
 checked(await admin.from('profiles').update({role:'ADMIN'}).eq('id',users[0].id));
});

test('Server Action administrativa nega POST forjado em outra rota autenticada',async({page,context})=>{
 await login(page);await page.goto('/admin/linhas?novo=1');
 const name=`REPLAY${suffix}`;await page.getByLabel('Nome',{exact:true}).fill(name);await page.getByLabel('Setor',{exact:true}).fill('Teste');
 const captured=page.waitForRequest(request=>request.method()==='POST' && !!request.headers()['next-action']);
 await page.getByRole('button',{name:'Salvar',exact:true}).click();const original=await captured;await success(page);
 await page.getByRole('button',{name:'Sair',exact:true}).click();await expect(page).toHaveURL(/\/login$/);await login(page,3);
 const response=await context.request.post('/sistema',{headers:{'Next-Action':original.headers()['next-action'],'Content-Type':original.headers()['content-type'],'Origin':'http://127.0.0.1:3100','Cookie':(await context.cookies()).map(cookie=>`${cookie.name}=${cookie.value}`).join('; ')},data:original.postDataBuffer(),maxRedirects:0});
 expect(response.headers()['x-action-redirect']).toContain('/sistema?motivo=sem-permissao');
 expect(checked(await admin.from('production_lines').select('id').eq('nome',name))).toHaveLength(1);
});
