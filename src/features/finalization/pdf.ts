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
  measurements?: Row<"checklist_measurements">[]; correction_releases?: Row<"quality_correction_releases">[];
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
  let logo;
  try { logo = await pdf.embedPng(await readFile(join(process.cwd(), "public", "logo-inkor.png"))); }
  catch { console.warn("[OP Digital] Logo institucional indisponível; relatório final gerado sem imagem."); }
  const generatedAt = new Date();
  const ink = rgb(0.08, 0.17, 0.31), body = rgb(0.18, 0.23, 0.3);
  const muted = rgb(0.38, 0.44, 0.51), pale = rgb(0.95, 0.97, 0.99), rule = rgb(0.82, 0.87, 0.92);
  const green = rgb(0.1, 0.38, 0.26), red = rgb(0.65, 0.15, 0.15);
  let page: PDFPage; let y = 0; const width = 495;
  let indent = 0, currentSection = "Identificação da OP", sectionNumber = 0;
  let currentItem: string | null = null;
  const supported = new Set(regular.getCharacterSet());
  const clean = (value: string) => [...value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " ")].map(char => char === "\n" || supported.has(char.codePointAt(0)!) ? char : `[U+${char.codePointAt(0)!.toString(16).toUpperCase()}]`).join("");
  const widths = new Map<string, number>();
  function textWidth(text: string, font: PDFFont, size: number) {
    const key = `${font.name}/${size}/${text}`;
    let result = widths.get(key);
    if (result === undefined) { result = font.widthOfTextAtSize(text, size); widths.set(key, result); }
    return result;
  }
  function wrap(value: string, font: PDFFont = regular, size = 10, maxWidth = width - indent) {
    const lines: string[] = [];
    for (const part of clean(value).split("\n")) {
      let current = "";
      for (const word of part.split(/\s+/)) {
        const candidate = `${current} ${word}`.trim();
        if (textWidth(candidate, font, size) <= maxWidth) { current = candidate; continue; }
        if (current) lines.push(current); current = "";
        for (const char of word) {
          if (textWidth(current + char, font, size) > maxWidth) { lines.push(current); current = ""; }
          current += char;
        }
      }
      lines.push(current);
    }
    return lines;
  }
  function newPage(first = false) {
    page = pdf.addPage([595.28, 841.89]); y = first ? 796 : 746;
    if (!first) {
      page.drawText("RELATÓRIO FINAL · OP DIGITAL", { x: 50, y: 797, size: 11, font: bold, color: ink });
      page.drawText(wrap(`OP: ${snapshot.order.numero_op} · ${currentSection}`, regular, 9)[0], { x: 50, y: 778, size: 9, font: regular, color: muted });
      page.drawLine({ start: { x: 50, y: 766 }, end: { x: 545, y: 766 }, thickness: 1, color: rule });
      if (currentItem) {
        page.drawText(wrap(`${currentItem} · continuação`, bold, 9)[0], { x: 50, y: 745, size: 9, font: bold, color: ink });
        y = 720;
      }
    }
    return page;
  }
  function ensure(height: number) { if (y - height < 65) newPage(); }
  function line(text: string, font: PDFFont = regular, size = 10, color = body) {
    ensure(size + 5);
    if (indent) page.drawLine({ start: { x: 55, y: y + size }, end: { x: 55, y: y - 5 }, thickness: 2, color: rule });
    page.drawText(text, { x: 50 + indent, y, size, font, color }); y -= size + 5;
  }
  function paragraph(value: string, font: PDFFont = regular, size = 10, color = body) {
    for (const text of wrap(value, font, size)) line(text, font, size, color);
  }
  function section(title: string, freshPage = false, minimumY = 160) {
    indent = 0; currentSection = title; sectionNumber++;
    if (freshPage || y < minimumY) newPage();
    y -= 12;
    const lines = wrap(`${String(sectionNumber).padStart(2, "0")}  ${title}`, bold, 12, width - 24);
    const height = lines.length * 17 + 16;
    page.drawRectangle({ x: 50, y: y - height + 12, width, height, color: ink });
    for (const text of lines) { page.drawText(text, { x: 62, y: y - 5, size: 12, font: bold, color: rgb(1, 1, 1) }); y -= 17; }
    y -= 19;
  }
  function heading(title: string, color = ink) {
    indent = 0;
    const lines = wrap(title, bold, 11, width - 24);
    ensure(Math.min(lines.length * 16 + 105, 350));
    for (const text of lines) {
      ensure(28);
      page.drawRectangle({ x: 50, y: y - 8, width, height: 26, color: pale });
      page.drawText(text, { x: 62, y, size: 11, font: bold, color }); y -= 26;
    }
    y -= 4;
  }
  function comparison(expected: string, obtained: string) {
    y -= 9;
    const columnWidth = (width - 12) / 2;
    const columns = [wrap(expected, regular, 10, columnWidth - 24), wrap(obtained, bold, 10, columnWidth - 24)];
    // Render rows together so long instructions and values can continue across pages.
    ensure(60);
    for (let row = 0; row < Math.max(...columns.map(lines => lines.length)); row++) {
      ensure(24);
      for (let col = 0; col < 2; col++) {
        const x = 50 + col * (columnWidth + 12);
        page.drawRectangle({ x, y: y - 7, width: columnWidth, height: 23, color: pale });
        page.drawText(columns[col][row] || "", { x: x + 12, y, size: 10, font: col ? bold : regular, color: body });
      }
      y -= 23;
    }
    y -= 8;
  }
  function quantities(values: string[]) {
    const cardWidth = (width - 20) / 3;
    const columns = values.map(value => wrap(value, bold, 12, cardWidth - 24));
    ensure(45);
    for (let row = 0; row < Math.max(...columns.map(lines => lines.length)); row++) {
      ensure(28);
      for (let col = 0; col < columns.length; col++) {
        const x = 50 + col * (cardWidth + 10);
        page.drawRectangle({ x, y: y - 10, width: cardWidth, height: 28, color: pale });
        page.drawText(columns[col][row] || "", { x: x + 12, y, size: 12, font: bold, color: ink });
      }
      y -= 28;
    }
    y -= 14;
  }
  const person = (id: string | null) => snapshot.people.find(value => value.id === id)?.nome || "Não informado";
  const o = snapshot.order;
  page = newPage(true);
  if (logo) {
    const dimensions = logo.scale(Math.min(130 / logo.width, 40 / logo.height));
    page.drawImage(logo, { x: 50, y: y - dimensions.height, ...dimensions });
    y -= dimensions.height + 20;
  }
  paragraph(snapshot.empresa, bold, 12, ink); y -= 12;
  page.drawRectangle({ x: 50, y: y - 13, width, height: 36, color: ink });
  page.drawText("RELATÓRIO FINAL DA ORDEM DE PRODUÇÃO", { x: 62, y, size: 12, font: bold, color: rgb(1, 1, 1) });
  y -= 43;
  paragraph(`OP: ${o.numero_op}`, bold, 18, ink);
  paragraph(`Data de emissão: ${date(generatedAt.toISOString()).replace(",", "")} · Versão: ${snapshot.version}`, regular, 9, muted);
  section("Dados da ordem e resultados da produção");
  for (const value of [
    `Produto: ${snapshot.product.descricao}`, `Código: ${snapshot.product.codigo} · Revisão: ${snapshot.product.revisao}`,
    `Lote: ${o.lote} · Linha: ${snapshot.line.nome}`,
    `Operador responsável: ${person(o.operador_responsavel_id)}`, `Início: ${date(o.inicio_producao)} · Fim: ${date(o.fim_producao)}`,
  ]) { paragraph(value); y -= 4; }
  y -= 10;
  quantities([`Planejada: ${quantity(o.quantidade_planejada)} ${o.unidade}`, `Produzida: ${quantity(o.quantidade_produzida)} ${o.unidade}`, `Perda: ${quantity(o.quantidade_perdida)} ${o.unidade}`]);
  paragraph(`Relatório: ${snapshot.id}`, regular, 9, muted);
  paragraph(`Versão da OP: ${snapshot.version} · Geração: ${date(generatedAt.toISOString())}`, regular, 9, muted);
  y -= 14;
  paragraph("Registros detalhados nas páginas seguintes", bold, 10, ink);
  paragraph("Checklist e histórico de medições · Apontamentos · Não conformidades · Aprovações", regular, 9, muted);
  section("Checklist e revisão do Controle de Qualidade", true);
  for (const item of snapshot.items) {
    const measurements = snapshot.measurements?.filter(m => m.checklist_item_id === item.id) || [];
    const relatedNCs = snapshot.ncs.filter(n => n.checklist_item_id === item.id);
    const lastSequence = measurements.reduce((last, m) => Math.max(last, m.sequence), 0);
    ensure(Math.min(600, 170 + measurements.length * 65 + relatedNCs.length * 65));
    currentItem = `${item.ordem}. ${item.item} · ${item.grupo || "Sem grupo"}`;
    heading(currentItem);
    paragraph(`Descrição: ${item.descricao || "Não informada"}`);
    const config = item.configuracao as { resposta_conforme?: boolean; opcoes?: string[]; opcoes_conformes?: string[] } | null;
    const expected = item.tipo_resposta === "NUMBER" ? `Mínimo ${item.valor_minimo === null ? "não definido" : quantity(item.valor_minimo)}; máximo ${item.valor_maximo === null ? "não definido" : quantity(item.valor_maximo)}` : item.tipo_resposta === "BOOLEAN" ? (config?.resposta_conforme ?? true) ? "Sim" : "Não" : item.tipo_resposta === "SELECT" ? (config?.opcoes_conformes ?? config?.opcoes ?? []).join(", ") : item.tipo_resposta === "PHOTO" ? "Evidência fotográfica" : "Registro textual";
    const measured = !item.data_medicao ? "Não preenchido (opcional)" : item.tipo_resposta === "NUMBER" ? quantity(item.valor_numero) : item.tipo_resposta === "BOOLEAN" ? item.resposta_boolean ? "Sim" : "Não" : item.resposta_select || item.resposta_texto || "Foto registrada";
    comparison(`Esperado: ${expected} · Unidade: ${item.unidade || "Não aplicável"}`, `Obtido: ${measured}`);
    paragraph(`Resultado: ${item.conforme === null ? "Pendente" : item.conforme ? "CONFORME" : "NÃO CONFORME"}`, bold, 10, item.conforme === null ? muted : item.conforme ? green : red);
    paragraph(`Operador: ${person(item.medido_por)} · Medição: ${date(item.data_medicao)}`);
    paragraph(`Revisão CQ: ${item.revisado_cq ? `${person(item.revisado_por)} · ${date(item.data_revisao)}` : item.requer_revisao_cq ? "Pendente" : "Não requerida"}`);
    y -= 8;
    indent = 14;
    for (const m of measurements) {
      ensure(95);
      paragraph(`Tentativa ${m.sequence}: ${m.measurement_type==="NUMBER"?quantity(m.numeric_value):m.measurement_type==="BOOLEAN"?m.boolean_value?"Sim":"Não":m.select_value||m.text_value||"Foto registrada"} ${m.unit||""} — ${m.compliant===true?"CONFORME":m.compliant===false?"NÃO CONFORME":"Resultado legado não informado"}${m.sequence === lastSequence ? " · MEDIÇÃO ATUAL" : ""}`, bold, 10, m.compliant === null ? muted : m.compliant ? green : red);
      const rules=m.configuration_snapshot as {resposta_conforme?:boolean;opcoes?:string[];opcoes_conformes?:string[]}|null;
      if(m.measurement_type==="NUMBER")paragraph(`Faixa: ${m.minimum_value_snapshot??"Sem mínimo"}–${m.maximum_value_snapshot??"Sem máximo"} ${m.unit||""}`);
      if(m.measurement_type==="BOOLEAN")paragraph(`Resposta conforme: ${(rules?.resposta_conforme??true)?"Sim":"Não"}`);
      if(m.measurement_type==="SELECT")paragraph(`Opções: ${(rules?.opcoes||[]).join(", ")} · Conformes: ${(rules?.opcoes_conformes??rules?.opcoes??[]).join(", ")}`);
      paragraph(`Operador: ${person(m.measured_by)} · ${date(m.measured_at)}`);
      if(m.observation)paragraph(`Observação: ${m.observation}`);if(m.evidence_path)paragraph(`Evidência: ${m.evidence_path}`);
      y -= 4;

    }
    for (const nc of relatedNCs) {
      paragraph(`NC relacionada: ${nc.codigo_nc}`, bold, 10, ink);
      paragraph(`Ação corretiva: ${nc.acao_imediata || "Não informada"}`);
      paragraph(`Fechamento CQ: ${person(nc.encerrado_por)} · ${date(nc.data_fechamento)}`);
    }
    indent = 0;
    if (item.observacao) paragraph(`Observação: ${item.observacao}`); if (item.foto_path) paragraph(`Evidência: ${item.foto_path}`); y -= 18;
    currentItem = null;
  }
  section("Apontamentos — Paradas, Perdas, Ajustes e Observações");
  if (!snapshot.notes.length) paragraph("Nenhum apontamento registrado.");
  for (const note of snapshot.notes) {
    heading(`${noteLabels[note.tipo]} · ${person(note.created_by)} · ${date(note.created_at)}`); paragraph(note.descricao);
    if (note.tempo_minutos !== null) paragraph(`Tempo: ${quantity(note.tempo_minutos)} min`);
    if (note.quantidade !== null) paragraph(`Quantidade: ${quantity(note.quantidade)} ${note.unidade || ""}`);
    if (note.foto_path) paragraph(`Evidência: ${note.foto_path}`); y -= 5;
  }
  section("Não conformidades"); if (!snapshot.ncs.length) paragraph("Nenhuma NC registrada.");
  for (const nc of snapshot.ncs) {
    heading(`${nc.codigo_nc} · ${severityLabels[nc.severidade]} · ${statusLabels[nc.status]}`, nc.status === "CLOSED" ? green : red);
    paragraph(nc.descricao); paragraph(`Ação: ${nc.acao_imediata || "Não informada"}`);
    paragraph(`CQ: ${nc.aprovado_cq === true ? "Aprovada" : nc.aprovado_cq === false ? "Cancelada/Rejeitada" : "Pendente"} · ${person(nc.encerrado_por)} · ${date(nc.data_fechamento)}`);
    if (nc.observacao_cq) paragraph(`Observação CQ: ${nc.observacao_cq}`); y -= 6;
  }
  if (snapshot.correction_releases?.length) heading("Liberações do CQ para correção");
  for(const r of snapshot.correction_releases||[]){paragraph(`Liberação para correção · NC ${snapshot.ncs.find(n=>n.id===r.non_conformity_id)?.codigo_nc||r.non_conformity_id}: ${person(r.released_by)} · ${date(r.released_at)}`);paragraph(`Ação imediata vigente: ${r.immediate_action} · Observação CQ: ${r.quality_observation}`);}
  section("Aprovações e responsáveis", false, 425);
  heading("Operador · encerramento da execução");
  paragraph(snapshot.operator_submission ? `Operador (envio ao CQ): ${person(snapshot.operator_submission.user_id)} · ${date(snapshot.operator_submission.created_at)}` : `Operador responsável registrado: ${person(o.operador_responsavel_id)} · Fim: ${date(o.fim_producao)}`);
  const measurementActors = [...new Set(snapshot.items.map(item => item.medido_por).filter(Boolean))];
  paragraph(`Autores das medições: ${measurementActors.map(actor => person(actor)).join(", ")}`);
  y -= 12; heading("Controle de Qualidade · revisão final");
  paragraph(`Controle de Qualidade: ${o.aprovacao_cq === "APPROVED" ? "Aprovado" : "Pendente"} · ${person(o.responsavel_cq_id)} · ${date(o.data_aprovacao_cq)}`);
  y -= 12; heading("PCP · finalização da ordem");
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
    for (let index = 0; index < reportCount; index++) {
      document.getPage(index).drawLine({ start: { x: 50, y: 49 }, end: { x: 545, y: 49 }, thickness: 0.7, color: rule });
      document.getPage(index).drawText(`${index + 1}/${reportCount} · OP ${clean(o.numero_op).slice(0,55)} · Versão ${snapshot.version}`, { x: 50, y: 35, size: 8, font: footerFont, color: muted });
    }
    const bytes = await document.save(); const verified = await PDFDocument.load(bytes);
    if (!verified.getPageCount() || verified.getSubject() !== snapshot.id) throw new Error("Falha na validação do relatório PDF");
    return { bytes, pages: count, combined: isCombined, warning: mergeWarning };
  }
}
