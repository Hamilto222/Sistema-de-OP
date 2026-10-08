import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Database } from "@/types/database";
type Row<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
export type ReportSnapshot = {
  id: string; empresa: string; generated_at: string; version: number;
  operator_submission?: { user_id: string | null; created_at: string } | null;
  order: Row<"production_orders">; product: Row<"products">; line: Row<"production_lines">;
  items: Row<"production_order_checklist">[]; notes: Row<"production_notes">[];
  ncs: Row<"non_conformities">[]; people: { id: string; nome: string }[];
};
const statusLabels = { OPEN: "Aberta", IN_TREATMENT: "Em tratamento", AWAITING_QUALITY: "Aguardando CQ", CLOSED: "Fechada", CANCELLED: "Cancelada" };
const severityLabels = { LOW: "Baixa", MEDIUM: "Média", HIGH: "Alta", CRITICAL: "Crítica" };
const noteLabels = { OBSERVACAO: "Observação", PARADA: "Parada", PERDA: "Perda", AJUSTE: "Ajuste", RETRABALHO: "Retrabalho", MANUTENCAO: "Manutenção", SEGURANCA: "Segurança", PRODUCAO: "Produção" };
const date = (value: string | null) => value ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "Não informado";
const quantity = (value: number | null) => value === null ? "Não informado" : new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 10 }).format(value);
export async function generateFinalPdf(snapshot: ReportSnapshot, original?: Uint8Array) {
  const pdf = await PDFDocument.create(); pdf.registerFontkit(fontkit);
  const [regularBytes, boldBytes] = await Promise.all([readFile(join(process.cwd(), "assets/fonts/OpenSans-Regular.ttf")), readFile(join(process.cwd(), "assets/fonts/OpenSans-Bold.ttf"))]);
  const regular = await pdf.embedFont(regularBytes, { subset: false }); const bold = await pdf.embedFont(boldBytes, { subset: false });
  const generatedAt = new Date(); const ink = rgb(0.08, 0.17, 0.31); const body = rgb(0.18, 0.23, 0.3);
  let page: PDFPage; let y = 0; const width = 495;
  const supported = new Set(regular.getCharacterSet());
  const clean = (value: string) => [...value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " ")].map(char => char === "\n" || supported.has(char.codePointAt(0)!) ? char : `[U+${char.codePointAt(0)!.toString(16).toUpperCase()}]`).join("");
  function newPage() {
    page = pdf.addPage([595.28, 841.89]); y = 755;
    page.drawText("OP Digital · Relatório final", { x: 50, y: 796, size: 15, font: bold, color: ink });
    page.drawLine({ start: { x: 50, y: 782 }, end: { x: 545, y: 782 }, thickness: 1, color: rgb(0.75, 0.8, 0.86) });
  }
  function line(text: string, font: PDFFont = regular, size = 10) {
    if (y < 65) newPage(); page.drawText(text, { x: 50, y, size, font, color: body }); y -= size + 6;
  }
  const widths = new Map<string, number>();
  function textWidth(text: string, font: PDFFont, size: number) { const key = `${font.name}/${size}/${text}`; let result = widths.get(key); if (result === undefined) { result = font.widthOfTextAtSize(text, size); widths.set(key, result); } return result; }
  function paragraph(value: string, font: PDFFont = regular, size = 10) {
    for (const paragraph of clean(value).split("\n")) {
      let current = "";
      for (const word of paragraph.split(/\s+/)) {
        if (textWidth(`${current} ${word}`.trim(), font, size) <= width) { current = `${current} ${word}`.trim(); continue; }
        if (current) line(current, font, size); current = "";
        for (const char of word) { if (textWidth(current + char, font, size) > width) { line(current, font, size); current = ""; } current += char; }
      }
      line(current, font, size);
    }
  }
  function section(title: string) { if (y < 125) newPage(); y -= 12; paragraph(title, bold, 13); y -= 3; }
  const person = (id: string | null) => snapshot.people.find(value => value.id === id)?.nome || "Não informado";
  const o = snapshot.order;
  newPage(); paragraph(snapshot.empresa, bold, 17); paragraph(`OP ${o.numero_op}`, bold, 15);
  for (const value of [
    `Produto: ${snapshot.product.descricao}`, `Código: ${snapshot.product.codigo} · Revisão: ${snapshot.product.revisao}`,
    `Lote: ${o.lote} · Linha: ${snapshot.line.nome}`, `Planejada: ${quantity(o.quantidade_planejada)} ${o.unidade}`,
    `Produzida: ${quantity(o.quantidade_produzida)} ${o.unidade} · Perda: ${quantity(o.quantidade_perdida)} ${o.unidade}`,
    `Operador responsável: ${person(o.operador_responsavel_id)}`, `Início: ${date(o.inicio_producao)} · Fim: ${date(o.fim_producao)}`,
    `Relatório: ${snapshot.id}`, `Versão da OP: ${snapshot.version} · Geração: ${date(generatedAt.toISOString())}`,
  ]) paragraph(value);
  section("Checklist e revisão do Controle de Qualidade");
  for (const item of snapshot.items) {
    if (y < 140) newPage(); paragraph(`${item.ordem}. ${item.item} · ${item.grupo || "Sem grupo"}`, bold);
    paragraph(`Descrição: ${item.descricao || "Não informada"}`);
    const config = item.configuracao as { resposta_conforme?: boolean; opcoes?: string[]; opcoes_conformes?: string[] } | null;
    const expected = item.tipo_resposta === "NUMBER" ? `Mínimo ${item.valor_minimo === null ? "não definido" : quantity(item.valor_minimo)}; máximo ${item.valor_maximo === null ? "não definido" : quantity(item.valor_maximo)}` : item.tipo_resposta === "BOOLEAN" ? (config?.resposta_conforme ?? true) ? "Sim" : "Não" : item.tipo_resposta === "SELECT" ? (config?.opcoes_conformes ?? config?.opcoes ?? []).join(", ") : item.tipo_resposta === "PHOTO" ? "Evidência fotográfica" : "Registro textual";
    const measured = !item.data_medicao ? "Não preenchido (opcional)" : item.tipo_resposta === "NUMBER" ? quantity(item.valor_numero) : item.tipo_resposta === "BOOLEAN" ? item.resposta_boolean ? "Sim" : "Não" : item.resposta_select || item.resposta_texto || "Foto registrada";
    paragraph(`Esperado: ${expected} · Unidade: ${item.unidade || "Não aplicável"}`); paragraph(`Obtido: ${measured}`);
    paragraph(`Resultado: ${item.conforme === null ? "Pendente" : item.conforme ? "CONFORME" : "NÃO CONFORME"}`);
    paragraph(`Operador: ${person(item.medido_por)} · Medição: ${date(item.data_medicao)}`);
    paragraph(`Revisão CQ: ${item.revisado_cq ? `${person(item.revisado_por)} · ${date(item.data_revisao)}` : item.requer_revisao_cq ? "Pendente" : "Não requerida"}`);
    if (item.observacao) paragraph(`Observação: ${item.observacao}`); if (item.foto_path) paragraph(`Evidência: ${item.foto_path}`); y -= 8;
  }
  section("Apontamentos — Paradas, Perdas, Ajustes e Observações");
  if (!snapshot.notes.length) paragraph("Nenhum apontamento registrado.");
  for (const note of snapshot.notes) {
    paragraph(`${noteLabels[note.tipo]} · ${person(note.created_by)} · ${date(note.created_at)}`, bold); paragraph(note.descricao);
    if (note.tempo_minutos !== null) paragraph(`Tempo: ${quantity(note.tempo_minutos)} min`);
    if (note.quantidade !== null) paragraph(`Quantidade: ${quantity(note.quantidade)} ${note.unidade || ""}`);
    if (note.foto_path) paragraph(`Evidência: ${note.foto_path}`); y -= 5;
  }
  section("Não conformidades"); if (!snapshot.ncs.length) paragraph("Nenhuma NC registrada.");
  for (const nc of snapshot.ncs) {
    paragraph(`${nc.codigo_nc} · ${severityLabels[nc.severidade]} · ${statusLabels[nc.status]}`, bold);
    paragraph(nc.descricao); paragraph(`Ação: ${nc.acao_imediata || "Não informada"}`);
    paragraph(`CQ: ${nc.aprovado_cq === true ? "Aprovada" : nc.aprovado_cq === false ? "Cancelada/Rejeitada" : "Pendente"} · ${person(nc.encerrado_por)} · ${date(nc.data_fechamento)}`);
    if (nc.observacao_cq) paragraph(`Observação CQ: ${nc.observacao_cq}`); y -= 6;
  }
  section("Aprovações e responsáveis");
  paragraph(snapshot.operator_submission ? `Operador (envio ao CQ): ${person(snapshot.operator_submission.user_id)} · ${date(snapshot.operator_submission.created_at)}` : `Operador responsável registrado: ${person(o.operador_responsavel_id)} · Fim: ${date(o.fim_producao)}`);
  const measurementActors = [...new Set(snapshot.items.map(item => item.medido_por).filter(Boolean))];
  paragraph(`Autores das medições: ${measurementActors.map(actor => person(actor)).join(", ")}`);
  paragraph(`Controle de Qualidade: ${o.aprovacao_cq === "APPROVED" ? "Aprovado" : "Pendente"} · ${person(o.responsavel_cq_id)} · ${date(o.data_aprovacao_cq)}`);
  paragraph(`PCP: ${o.aprovacao_pcp === "APPROVED" ? "Aprovado" : "Pendente"} · ${person(o.responsavel_pcp_id)} · ${date(o.data_finalizacao)}`);
  if (o.observacao_final) paragraph(`Observação final: ${o.observacao_final}`);
  let warning: string | null = null;
  let source: PDFDocument | undefined;
  if (original) { try { source = await PDFDocument.load(original); if (source.isEncrypted || !source.getPageCount()) throw new Error("Original incompatível"); } catch { source = undefined; warning = "PDF original não pôde ser incorporado; consulte o documento original separadamente."; } }
  if (source) { section("Documento original"); paragraph("PDF original arquivado. Quando compatível, suas páginas integram este documento; a versão original também permanece disponível separadamente."); }
  if (warning) { section("Documento original"); paragraph(warning); }
  const report = await finish(pdf, false, warning);
  if (!source) return report;
  try {
    const merged = await PDFDocument.load(report.bytes);
    const originalPages = await merged.copyPages(source, source.getPageIndices());
    for (const originalPage of originalPages) merged.addPage(originalPage);
    merged.setKeywords(["OPDigital", `version:${snapshot.version}`, "original:true"]);
    const bytes = await merged.save(); const verified = await PDFDocument.load(bytes);
    if (verified.getPageCount() !== report.pages + source.getPageCount()) throw new Error("Falha ao combinar páginas");
    return { bytes, pages: verified.getPageCount(), combined: true, warning: null };
  } catch { return { ...report, combined: false, warning: "PDF original não pôde ser incorporado; consulte o documento original separadamente." }; }
  async function finish(document: PDFDocument, isCombined: boolean, mergeWarning: string | null) {
    document.setTitle(`Relatório final — OP ${o.numero_op}`); document.setSubject(snapshot.id);
    document.setAuthor(snapshot.empresa); document.setProducer("OP Digital / pdf-lib");
    document.setKeywords(["OPDigital", `version:${snapshot.version}`, `original:${isCombined}`]); document.setCreationDate(generatedAt); document.setModificationDate(generatedAt);
    // Stamp only generated report pages; industrial original remains visually intact.
    if (document !== pdf) document.registerFontkit(fontkit);
    const footerFont = document === pdf ? regular : await document.embedFont(regularBytes, { subset: false });
    const count = document.getPageCount(); const reportCount = count - (isCombined ? source!.getPageCount() : 0);
    for (let index = 0; index < reportCount; index++) document.getPage(index).drawText(`${index + 1}/${reportCount} · OP ${clean(o.numero_op).slice(0,55)} · Versão ${snapshot.version}`, { x: 50, y: 35, size: 8, font: footerFont, color: ink });
    const bytes = await document.save(); const verified = await PDFDocument.load(bytes);
    if (!verified.getPageCount() || verified.getSubject() !== snapshot.id) throw new Error("Falha na validação do relatório PDF");
    return { bytes, pages: count, combined: isCombined, warning: mergeWarning };
  }
}
