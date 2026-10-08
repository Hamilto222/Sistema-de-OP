import { test, expect } from '@playwright/test';
import { randomUUID, createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { PDFDocument } from 'pdf-lib';
import { finalizationFixture } from './fixtures/finalization.mjs';
import { productionPdf } from './fixtures/pdf.mjs';
import { photoPng } from './fixtures/operator.mjs';
import { checked } from '../scripts/local-supabase.mjs';

let f;
test.beforeAll(async () => { f = await finalizationFixture('audit-full-ui'); });
test.afterAll(async () => { if (f) await f.cleanup(); });
async function login(page, index) {
  await page.goto('/login');
  await page.getByLabel('E-mail', { exact: true }).fill(f.users[index].email);
  await page.getByLabel('Senha', { exact: true }).fill(f.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(/\/sistema$/);
}
async function logout(page) {
  await page.getByRole('button', { name: 'Sair', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
}
const cookie = async context => (await context.cookies()).map(c => `${c.name}=${c.value}`).join('; ');
const card = (page, name) => page.getByRole('article').filter({ has: page.getByRole('heading', { name, exact: true }) });
async function save(article) {
  await article.getByRole('button', { name: /^(Salvar medição|Registrar nova medição)$/ }).click();
  await expect(article.getByText('CONFORME', { exact: true })).toBeVisible();
}

test('fluxo real de 20 etapas, NC impeditiva, PDF aberto e reabertura preservando arquivo anterior', async ({ page, context }) => {
  test.setTimeout(180_000);
  const number = `OP-AUDIT-${randomUUID()}`;
  await page.setViewportSize({ width: 800, height: 1280 });
  await login(page, 1);
  await page.goto('/pcp/ordens/nova');
  await page.getByLabel('Número OP', { exact: true }).fill(number);
  await page.getByLabel('Produto', { exact: true }).selectOption(f.product.id);
  await page.getByLabel('Lote', { exact: true }).fill('Lote auditado');
  await page.getByLabel('Linha', { exact: true }).selectOption(f.line.id);
  await page.getByLabel('Quantidade planejada', { exact: true }).fill('100');
  await page.getByLabel('Data e hora programadas', { exact: true }).fill('2026-10-08T08:00');
  await page.getByLabel('Operador responsável (opcional)', { exact: true }).selectOption(f.users[3].id);
  await page.getByLabel('PDF original', { exact: true }).setInputFiles({ name: 'op-original.pdf', mimeType: 'application/pdf', buffer: productionPdf() });
  await page.getByRole('button', { name: 'Criar OP', exact: true }).click();
  await expect(page).toHaveURL(/\/pcp\/ordens\/[a-f0-9-]+\?sucesso=criada$/);
  const created = checked(await f.admin.from('production_orders').select().eq('numero_op', number).single());
  const id = created.id;
  expect(created.status).toBe('DRAFT');
  expect(created.created_by).toBe(f.users[1].id);
  expect(created.pdf_original_path).toMatch(new RegExp(`^${id}/`));
  await page.getByRole('button', { name: 'Preparar OP', exact: true }).click();
  await expect(page.getByRole('main').getByText('Liberada', { exact: true }).and(page.locator('span'))).toBeVisible();
  expect((await f.items(id)).length).toBe(6);
  expect((await f.items(id))[1].valor_minimo).toBe(9);
  await logout(page);
  await login(page, 3);
  await page.goto(`/operador/op/${id}`);
  await page.getByRole('button', { name: 'INICIAR PRODUÇÃO', exact: true }).click();
  await expect(page.getByRole('main').getByText('Em produção', { exact: true })).toBeVisible();
  const measure = card(page, '2. Diâmetro');
  await measure.getByLabel('Valor medido (mm)').fill('10');
  await save(measure);
  expect((await f.items(id))[1].conforme).toBe(true);
  expect((await f.items(id))[1].medido_por).toBe(f.users[3].id);
  await measure.getByLabel('Valor medido (mm)').fill('8');
  await measure.getByLabel('Observação (obrigatória se não conforme)').fill('Diâmetro abaixo do limite');
  await measure.getByRole('button', { name: /^(Salvar medição|Registrar nova medição)$/ }).click();
  await expect(measure.getByText('NÃO CONFORME', { exact: true })).toBeVisible();
  expect((await f.read(id)).status).toBe('BLOCKED_QUALITY');
  const nc = checked(await f.admin.from('non_conformities').select().eq('production_order_id', id).single());
  expect(nc.status).toBe('OPEN');
  expect(nc.impeditiva).toBe(true);
  expect(nc.codigo_nc).toMatch(/^NC-\d{4}-\d{5,}$/);
  // A correção exige primeiro o retorno autorizado pelo CQ: o bloqueio não é burlado.
  await logout(page);
  await login(page, 2);
  await page.goto(`/qualidade/nao-conformidades/${nc.id}`);
  await page.getByLabel('Status da NC').selectOption('IN_TREATMENT');
  await page.getByLabel('Responsável', { exact: true }).selectOption(f.users[3].id);
  await page.getByLabel('Ação imediata', { exact: true }).fill('Correção autorizada e supervisionada');
  await page.getByLabel('Observação CQ', { exact: true }).fill('Ajustar e registrar nova medição');
  await page.getByRole('button', { name: 'Salvar NC', exact: true }).click();
  await expect(page.getByRole('button', { name: 'LIBERAR PARA CORREÇÃO', exact: true })).toBeVisible();
  expect((await f.read(id)).status).toBe('BLOCKED_QUALITY');
  await page.getByRole('button', { name: 'LIBERAR PARA CORREÇÃO', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar liberação', exact: true }).click();
  await expect.poll(async () => (await f.read(id)).status).toBe('IN_PRODUCTION');
  await logout(page);
  await login(page, 3);
  await page.goto(`/operador/op/${id}`);
  await measure.getByLabel('Valor medido (mm)').fill('10');
  await measure.getByLabel('Observação (obrigatória se não conforme)').fill('Correção realizada e verificada');
  await save(measure);
  const boolean = card(page, '1. Há vazamento?');
  await boolean.getByLabel('Não', { exact: true }).check();
  await save(boolean);
  const select = card(page, '3. Acabamento');
  await select.getByLabel('Resposta', { exact: true }).selectOption('Bom');
  await save(select);
  const text = card(page, '4. Identificação da embalagem');
  await text.getByLabel('Resposta textual').fill('Identificação validada');
  await save(text);
  const photo = card(page, '5. Foto do produto');
  await photo.getByLabel('Foto (obrigatória)').setInputFiles({ name: 'evidencia.png', mimeType: 'image/png', buffer: photoPng() });
  await save(photo);
  const optional = card(page, '6. Temperatura opcional');
  await optional.getByLabel(/Valor medido/).fill('5');
  await save(optional);
  await page.getByRole('button', { name: '+ Apontamento', exact: true }).click();
  await page.getByLabel('Tipo de apontamento').selectOption('AJUSTE');
  await page.getByLabel('Descrição', { exact: true }).fill('Ajuste dimensional após inspeção');
  await page.getByRole('button', { name: 'Salvar apontamento', exact: true }).click();
  await expect(page.getByRole('article').filter({ hasText: 'Ajuste dimensional após inspeção' })).toBeVisible();
  // A tela não oferece envio com NC aberta; a API também recusa a tentativa.
  await expect(page.getByRole('button', { name: 'ENVIAR AO CONTROLE DE QUALIDADE', exact: true })).toHaveCount(0);
  checked(await f.clients[3].auth.signInWithPassword({ email: f.users[3].email, password: f.password }));
  const deniedSend = await f.clients[3].rpc('operator_submit_order', { order_id: id, expected_version: (await f.read(id)).version, produced: 98, lost: 2, final_note: 'Tentativa com NC aberta' });
  expect(deniedSend.error?.message).toContain('não conformidade');
  expect((await f.read(id)).status).toBe('IN_PRODUCTION');
  await logout(page);
  await login(page, 2);
  await page.goto(`/qualidade/nao-conformidades/${nc.id}`);
  await page.getByLabel('Ação imediata', { exact: true }).fill('Equipamento corrigido e reinspecionado');
  await page.getByLabel('Responsável', { exact: true }).selectOption(f.users[2].id);
  await page.getByLabel('Observação CQ', { exact: true }).fill('Correção validada pelo Controle de Qualidade');
  await page.getByRole('button', { name: 'REVISAR ITEM', exact: true }).click();
  await expect(page.getByText('Nova medição aguardando revisão do CQ', { exact: true })).toHaveCount(0);
  await page.getByLabel('Evidência depois (opcional)').setInputFiles({ name: 'depois.png', mimeType: 'image/png', buffer: photoPng() });
  for (const [status, label] of [['IN_TREATMENT', 'Em tratamento'], ['AWAITING_QUALITY', 'Aguardando CQ'], ['CLOSED', 'Fechada']]) {
    await page.getByLabel('Status da NC', { exact: true }).selectOption(status);
    await page.getByRole('button', { name: 'Salvar NC', exact: true }).click();
    await expect(page.getByRole('main').locator('header').first()).toContainText(label);
    await expect(page.getByRole('button', { name: 'Salvando… Aguarde', exact: true })).toHaveCount(0);
  }
  const closed = checked(await f.admin.from('non_conformities').select().eq('id', nc.id).single());
  expect(closed.aprovado_cq).toBe(true);
  expect(closed.encerrado_por).toBe(f.users[2].id);
  await logout(page);
  await login(page, 3);
  await page.goto(`/operador/op/${id}`);
  await page.getByLabel('Quantidade produzida', { exact: true }).fill('98');
  await page.getByLabel('Quantidade perdida (inclusive zero)').fill('2');
  await page.getByLabel('Observação final', { exact: true }).fill('Produção concluída após correção e tratamento CQ');
  await page.getByRole('button', { name: 'ENVIAR AO CONTROLE DE QUALIDADE', exact: true }).click();
  await expect(page.getByRole('main').getByText('Aguardando CQ', { exact: true })).toBeVisible();
  await logout(page);
  await login(page, 2);
  await page.goto(`/qualidade/op/${id}`);
  for (const item of await f.items(id)) {
    const article = card(page, `${item.ordem}. ${item.item}`);
    if (!item.revisado_cq) await article.getByRole('button', { name: 'REVISAR ITEM', exact: true }).click();
    await expect(article.getByText('Revisão CQ concluída', { exact: true })).toBeVisible();
  }
  await page.getByRole('button', { name: 'APROVAR OP', exact: true }).click();
  await expect(page.getByRole('main').getByText('Aguardando PCP', { exact: true })).toBeVisible();
  await logout(page);
  await login(page, 1);
  await page.goto(`/pcp/ordens/${id}`);
  await page.getByLabel('Empresa no relatório', { exact: true }).fill('Indústria Auditoria Técnica OP Digital');
  await page.getByRole('button', { name: 'FINALIZAR OP', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/pcp/ordens/${id}\\?sucesso=finalizada$`));
  const finalized = await f.read(id);
  expect(finalized.status).toBe('FINALIZED');
  expect(finalized.aprovacao_cq).toBe('APPROVED');
  expect(finalized.aprovacao_pcp).toBe('APPROVED');
  expect(finalized.responsavel_cq_id).toBe(f.users[2].id);
  expect(finalized.responsavel_pcp_id).toBe(f.users[1].id);
  const report = checked(await f.admin.from('final_reports').select().eq('production_order_id', id).single());
  expect(report.status).toBe('READY');
  const redirect = await context.request.get(`/sistema/ordens/${id}/relatorios/${report.id}`, { headers: { Cookie: await cookie(context) }, maxRedirects: 0 });
  expect(redirect.status()).toBe(303);
  expect(redirect.headers()['cache-control']).toBe('private, no-store');
  expect(redirect.headers()['referrer-policy']).toBe('no-referrer');
  const url = new URL(redirect.headers().location);
  const token = JSON.parse(Buffer.from(url.searchParams.get('token').split('.')[1], 'base64url').toString());
  expect(token.exp - token.iat).toBe(60);
  const downloaded = await context.request.get(url.toString());
  expect(downloaded.status()).toBe(200);
  const bytes = await downloaded.body();
  const pdf = await PDFDocument.load(bytes, { throwOnInvalidObject: true });
  expect(pdf.getPageCount()).toBe(report.pages);
  expect(report.original_combined).toBe(true);
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(report.sha256);
  writeFileSync('/tmp/op-digital-audit-flow.pdf', bytes);
  const info = execFileSync('pdfinfo', ['/tmp/op-digital-audit-flow.pdf'], { encoding: 'utf8' });
  expect(info).toContain('Pages:');
  const extracted = execFileSync('pdftotext', ['/tmp/op-digital-audit-flow.pdf', '-'], { encoding: 'utf8' });
  for (const value of [number, 'Indústria Auditoria Técnica', 'Diâmetro', nc.codigo_nc, 'Ajuste dimensional']) expect(extracted).toContain(value);
  execFileSync('pdftoppm', ['-f', '1', '-singlefile', '-scale-to', '1400', '-png', '/tmp/op-digital-audit-flow.pdf', '/tmp/op-digital-audit-flow']);
  const logs = checked(await f.admin.from('audit_logs').select('entity,action,field,user_id').eq('production_order_id', id));
  expect(logs.some(log => log.entity === 'production_order_checklist' && log.action === 'UPDATE' && log.field === 'valor_numero')).toBe(true);
  expect(logs.some(log => log.entity === 'non_conformities')).toBe(true);
  await logout(page);
  await login(page, 0);
  await page.goto(`/pcp/ordens/${id}`);
  await page.getByLabel('Motivo da reabertura', { exact: true }).fill('Reinspeção autorizada na auditoria técnica');
  await page.getByRole('button', { name: 'REABRIR OP', exact: true }).click();
  await expect(page.getByRole('main').getByText('Reaberta', { exact: true }).and(page.locator('span'))).toBeVisible();
  const reopened = await f.read(id);
  expect(reopened.status).toBe('REOPENED');
  expect(reopened.relatorio_final_path).toBe(report.path);
  expect(reopened.aprovacao_cq).toBe(null);
  expect((await f.report(report.id)).status).toBe('READY');
  const prior = await context.request.get(`/sistema/ordens/${id}/relatorios/${report.id}`, { headers: { Cookie: await cookie(context) }, maxRedirects: 0 });
  expect(prior.status()).toBe(303);
  expect(await (await context.request.get(prior.headers().location)).body()).toEqual(bytes);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // Segundo ciclo inteiramente pela UI: revisões e aprovações precisam ser refeitas.
  await logout(page);
  await login(page, 3);
  await page.goto(`/operador/op/${id}`);
  await page.getByRole('button', { name: 'INICIAR PRODUÇÃO', exact: true }).click();
  await expect(page.getByRole('main').getByText('Em produção', { exact: true })).toBeVisible();
  await page.getByLabel('Quantidade produzida', { exact: true }).fill('98');
  await page.getByLabel('Quantidade perdida (inclusive zero)').fill('2');
  await page.getByRole('button', { name: 'ENVIAR AO CONTROLE DE QUALIDADE', exact: true }).click();
  await expect(page.getByRole('main').getByText('Aguardando CQ', { exact: true })).toBeVisible();
  await logout(page);
  await login(page, 2);
  await page.goto(`/qualidade/op/${id}`);
  for (const item of await f.items(id)) {
    const article = card(page, `${item.ordem}. ${item.item}`);
    if (!item.revisado_cq) await article.getByRole('button', { name: 'REVISAR ITEM', exact: true }).click();
    await expect(article.getByText('Revisão CQ concluída', { exact: true })).toBeVisible();
  }
  await page.getByRole('button', { name: 'APROVAR OP', exact: true }).click();
  await expect(page.getByRole('main').getByText('Aguardando PCP', { exact: true })).toBeVisible();
  await logout(page);
  await login(page, 1);
  await page.goto(`/pcp/ordens/${id}`);
  await page.getByLabel('Empresa no relatório', { exact: true }).fill('Indústria Auditoria Técnica OP Digital');
  await page.getByRole('button', { name: 'FINALIZAR OP', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/pcp/ordens/${id}\\?sucesso=finalizada$`));
  const secondCycle = await f.read(id);
  expect(secondCycle.status).toBe('FINALIZED');
  const preserved = checked(await f.admin.from('final_reports').select().eq('production_order_id', id).order('order_version'));
  expect(preserved).toHaveLength(2);
  expect(preserved[1].status).toBe('READY');
  expect(preserved[1].path).not.toBe(report.path);
  expect(preserved[1].order_version).toBeGreaterThan(report.order_version);
  expect(preserved[0].sha256).toBe(report.sha256);
  for (const version of preserved) {
    const response = await context.request.get(`/sistema/ordens/${id}/relatorios/${version.id}`, { headers: { Cookie: await cookie(context) }, maxRedirects: 0 });
    expect(response.status()).toBe(303);
    const archived = await (await context.request.get(response.headers().location)).body();
    expect(createHash('sha256').update(archived).digest('hex')).toBe(version.sha256);
    expect((await PDFDocument.load(archived, { throwOnInvalidObject: true })).getPageCount()).toBe(version.pages);
    if (version.id === report.id) expect(archived).toEqual(bytes);
  }
  writeFileSync('/tmp/op-digital-audit-flow.json', JSON.stringify({ order_id: id, numero_op: number, nc: nc.codigo_nc, finalized_status: finalized.status, reopened_status: reopened.status, final_status: secondCycle.status, report_id: report.id, pages: report.pages, sha256: report.sha256, audit_events_before_reopen: logs.length, versions: preserved.map(r => ({ id: r.id, version: r.order_version, sha256: r.sha256, pages: r.pages })) }, null, 2));
});

test('headers de segurança e Server Action com Origin externo não alteram o banco', async ({ page, context }) => {
  await login(page, 1);
  const id = await f.create({ released: false });
  await page.goto(`/pcp/ordens/${id}`);
  const response = await context.request.get('/login');
  expect(response.headers()['x-content-type-options']).toBe('nosniff');
  expect(response.headers()['x-frame-options']).toBe('DENY');
  const waiting = page.waitForRequest(request => request.method() === 'POST' && !!request.headers()['next-action']);
  // A preparação sem PDF falha legitimamente e fornece o identificador real da action.
  await page.getByRole('button', { name: 'Preparar OP', exact: true }).click();
  const original = await waiting;
  await expect(page.getByRole('main').getByRole('alert')).toBeVisible();
  const before = await f.read(id);
  const attacked = await context.request.post('/sistema', {
    headers: { 'Next-Action': original.headers()['next-action'], Origin: 'https://origem-nao-autorizada.invalid', Cookie: await cookie(context) },
    multipart: { '0': JSON.stringify([{}, '$K1']), '1_id': id, '1_version': String(before.version) },
    maxRedirects: 0,
  });
  expect(attacked.status()).toBeGreaterThanOrEqual(400);
  expect(await f.read(id)).toEqual(before);
});
