import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, symlink, writeFile, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { PDFDocument } from 'pdf-lib';
import { createHash } from 'node:crypto';
import { generateFinalPdf } from '../src/features/finalization/pdf.ts';
import { DEFAULT_COMPANY_NAME, defaultCompanyName } from '../src/features/finalization/branding.ts';
import { finalizationFixture } from './fixtures/finalization.mjs';
import { photoPng } from './fixtures/operator.mjs';

let f, snapshot;
const root = process.cwd();
before(async () => {
  f = await finalizationFixture('branding');
  const id = await f.ready();
  const report = await f.report(await f.finalize(id, f.clients[1], false));
  snapshot = { ...report.snapshot, empresa: DEFAULT_COMPANY_NAME };
});
after(async () => { if (f) await f.cleanup(); });
function withCompany(value, check) {
  const previous = process.env.OP_DIGITAL_COMPANY_NAME;
  try {
    if (value === undefined) delete process.env.OP_DIGITAL_COMPANY_NAME;
    else process.env.OP_DIGITAL_COMPANY_NAME = value;
    check();
  } finally {
    if (previous === undefined) delete process.env.OP_DIGITAL_COMPANY_NAME;
    else process.env.OP_DIGITAL_COMPANY_NAME = previous;
  }
}
test('nome opcional usa env definida e conserva nome editável no snapshot', () => {
  withCompany('Empresa configurada para produção', () => assert.equal(defaultCompanyName(), 'Empresa configurada para produção'));
  assert.equal(snapshot.empresa, DEFAULT_COMPANY_NAME);
});
test('env ausente ou vazia utiliza nome padrão Inkor', () => {
  for (const value of [undefined, '', '  ']) withCompany(value, () => assert.equal(defaultCompanyName(), 'Inkor Industria Catarinense de Colas e Rejuntes'));
});
async function render(logoState) {
  const dir = await mkdtemp('/tmp/op-digital-branding-');
  try {
    await mkdir(join(dir, 'assets'));
    await symlink(resolve(root, 'assets/fonts'), join(dir, 'assets/fonts'), 'dir');
    await mkdir(join(dir, 'public'));
    // PNG de evidência já usado pelos testes, exclusivamente em diretório isolado.
    // Não cria, substitui ou representa a logo institucional no repositório.
    if (logoState === 'png') await writeFile(join(dir, 'public/logo-inkor.png'), photoPng());
    if (logoState === 'invalid') await writeFile(join(dir, 'public/logo-inkor.png'), 'arquivo inválido');
    if (logoState === 'unreadable') await mkdir(join(dir, 'public/logo-inkor.png'));
    await writeFile(join(dir, 'snapshot.json'), JSON.stringify(snapshot));
    const program = `
      import {readFile,writeFile} from 'node:fs/promises';
      const {generateFinalPdf}=await import(${JSON.stringify(pathToFileURL(resolve(root, 'src/features/finalization/pdf.ts')).href)});
      const result=await generateFinalPdf(JSON.parse(await readFile('snapshot.json','utf8')));
      await writeFile('report.pdf',result.bytes);
    `;
    const child = spawnSync(process.execPath, ['--input-type=module', '--eval', program], { cwd: dir, encoding: 'utf8' });
    assert.equal(child.status, 0, child.stderr);
    if (logoState !== 'png') assert.match(child.stderr, /Logo institucional indisponível; relatório final gerado sem imagem/);
    else assert.doesNotMatch(child.stderr, /Logo institucional indisponível/);
    const file = join(dir, 'report.pdf'), bytes = await readFile(file);
    const pdf = await PDFDocument.load(bytes);
    assert.equal(pdf.getSubject(), snapshot.id);
    assert.equal(pdf.getAuthor(), DEFAULT_COMPANY_NAME);
    assert.ok(pdf.getPageCount() > 0);
    const text = execFileSync('pdftotext', [file, '-'], { encoding: 'utf8' });
    for (const label of [DEFAULT_COMPANY_NAME, 'RELATÓRIO FINAL DA ORDEM DE PRODUÇÃO', `OP: ${snapshot.order.numero_op}`, 'Data de emissão:', 'Checklist', 'Tentativa 1:', 'Não conformidades', 'Aprovações', 'Controle de Qualidade: Aprovado', 'PCP: Aprovado']) assert.ok(text.includes(label), `Conteúdo ausente: ${label}`);
    const images = execFileSync('pdfimages', ['-list', file], { encoding: 'utf8' });
    if (logoState === 'png') assert.match(images, /image\s+2\s+2\s/);
    else assert.doesNotMatch(images, /\d+\s+\d+\s+image\s/);
    return bytes;
  } finally { await rm(dir, { recursive: true, force: true }); }
}
test('PDF incorpora PNG local sem depender de URL; conteúdo e aprovações preservados', async () => { await render('png'); });
test('logo ausente não interrompe PDF e mantém nome e histórico', async () => {
  await writeFile('/tmp/op-digital-v1.0.2-validation.pdf', await render('absent'));
});
test('logo inválida ou ilegível não interrompe finalização', async () => {
  await render('invalid'); await render('unreadable');
});

test('logo real Inkor permanece intacta e é incorporada ao PDF real', async () => {
  const path = resolve(root, 'public/logo-inkor.png');
  const original = await readFile(path);
  const digest = bytes => createHash('sha256').update(bytes).digest('hex');
  const generated = await generateFinalPdf(snapshot);
  const file = '/tmp/op-digital-v1.0.2-inkor.pdf';
  await writeFile(file, generated.bytes);
  const pdf = await PDFDocument.load(generated.bytes);
  assert.equal(pdf.getAuthor(), DEFAULT_COMPANY_NAME);
  assert.equal(pdf.getSubject(), snapshot.id);
  assert.equal(digest(await readFile(path)), digest(original), 'Logo não pode ser alterada');
  assert.match(execFileSync('pdfimages', ['-list', file], { encoding: 'utf8' }), /image\s+5063\s+1060\s/);
  const text = execFileSync('pdftotext', [file, '-'], { encoding: 'utf8' });
  for (const label of [DEFAULT_COMPANY_NAME, 'Checklist', 'Tentativa 1:', 'Não conformidades', 'Aprovações']) assert.ok(text.includes(label));
});
