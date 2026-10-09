import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { PDFDocument } from 'pdf-lib';
import { finalizationFixture } from './fixtures/finalization.mjs';
import { productionPdf } from './fixtures/pdf.mjs';
import { generateFinalPdf } from '../src/features/finalization/pdf.ts';
let f, snapshot;
before(async () => {
  f = await finalizationFixture('pdf-layout');
  snapshot = (await f.report(await f.finalize(await f.ready(), f.clients[1], false))).snapshot;
});
after(async () => { if (f) await f.cleanup(); });
async function inspect(value, original) {
  const dir = await mkdtemp('/tmp/op-digital-layout-');
  try {
    const before = JSON.stringify(value);
    const generated = await generateFinalPdf(value, original);
    assert.equal(JSON.stringify(value), before, 'Layout não pode alterar snapshot');
    const pdf = await PDFDocument.load(generated.bytes);
    assert.equal(pdf.getSubject(), value.id);
    const file = `${dir}/report.pdf`;
    await writeFile(file, generated.bytes);
    const text = execFileSync('pdftotext', [file, '-'], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
    const boxes = execFileSync('pdftotext', ['-bbox', file, '-'], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
    const entries = [...boxes.matchAll(/<word xMin="(-?[\d.]+)" yMin="(-?[\d.]+)" xMax="(-?[\d.]+)" yMax="(-?[\d.]+)">/g)];
    assert.ok(entries.length > 0, "PDF deve conter texto extraível");
    for (const match of entries) {
      const [, left, top, right, bottom] = match.map(Number);
      assert.ok(left >= 49 && right <= 546, `Texto fora das margens horizontais: ${left}–${right}`);
      assert.ok(top >= 30 && bottom <= 812, `Texto fora das margens verticais: ${top}–${bottom}`);
    }
    return { text, pdf, generated };
  } finally { await rm(dir, { recursive: true, force: true }); }
}
test('layout mantém conteúdo, snapshot, margens e original anexado intacto', async () => {
  const { text, pdf, generated } = await inspect(snapshot, productionPdf());
  for (const label of ['Dados da ordem', 'Planejada:', 'Produzida:', 'Perda:', 'Esperado:', 'Obtido:', 'MEDIÇÃO ATUAL', 'Revisão CQ:', 'Aprovações', 'documento de teste']) assert.ok(text.includes(label), label);
  assert.ok(generated.combined);
  assert.equal(pdf.getPage(pdf.getPageCount() - 1).getSize().width, 595);
});
test('colunas e históricos longos paginam sem cortar valores nem ultrapassar margens', async () => {
  const long = structuredClone(snapshot);
  long.empresa = 'Empresa industrial com identificação longa '.repeat(4) + 'FINAL_EMPRESA';
  long.product.descricao = 'Descrição detalhada do produto '.repeat(80) + 'FINAL_PRODUTO';
  const item = long.items.find(item => item.tipo_resposta === 'TEXT');
  item.descricao = 'Instrução extensa de controle '.repeat(50) + 'FINAL_INSTRUCAO';
  item.resposta_texto = 'X'.repeat(4000) + ' FINAL_RESPOSTA';
  const measurement = long.measurements.find(m => m.checklist_item_id === item.id);
  measurement.text_value = item.resposta_texto;
  measurement.observation = 'Correção registrada com detalhes '.repeat(100) + 'FINAL_OBSERVACAO';
  const { text, pdf } = await inspect(long);
  assert.ok(pdf.getPageCount() > 5);
  for (const marker of ['FINAL_EMPRESA', 'FINAL_PRODUTO', 'FINAL_INSTRUCAO', 'FINAL_RESPOSTA', 'FINAL_OBSERVACAO', 'continuação', 'PCP: Aprovado']) assert.ok(text.includes(marker), marker);
});
