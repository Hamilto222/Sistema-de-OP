import { createHash } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { generateFinalPdf, type ReportSnapshot } from "./pdf.ts";
export async function renderStoredReport(supabase: SupabaseClient<Database>, reportId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sessão indisponível.");
  const profile = await supabase.from("profiles").select("role,ativo").eq("id", user.id).single();
  if (!profile.data?.ativo || !["ADMIN", "PCP"].includes(profile.data.role)) throw new Error("Geração exclusiva de PCP/ADMIN ativo.");
  const result = await supabase.from("final_reports").select().eq("id", reportId).single();
  if (result.error || !result.data) throw new Error("Relatório indisponível.");
  const report = result.data; if (report.status === "READY") return;
  const snapshot = report.snapshot as unknown as ReportSnapshot;
  const original = snapshot.order.pdf_original_path ? await supabase.storage.from("op-originals").download(snapshot.order.pdf_original_path) : null;
  if (original?.error) throw new Error("Não foi possível obter o PDF original. Tente novamente.");
  const generated = await generateFinalPdf(snapshot, original?.data ? new Uint8Array(await original.data.arrayBuffer()) : undefined);
  if (generated.bytes.length > 40 * 1024 * 1024) throw new Error("Relatório excede 40 MB. Revise os anexos antes de tentar novamente.");
  const upload = await supabase.storage.from("final-reports").upload(report.path, generated.bytes, { contentType: "application/pdf", upsert: false });
  let bytes = generated.bytes, pages = generated.pages, combined = generated.combined, warning = generated.warning;
  if (upload.error) {
    // A prior attempt may have uploaded successfully before losing its connection to PostgreSQL.
    const existing = await supabase.storage.from("final-reports").download(report.path);
    if (existing.error || !existing.data) throw new Error("Falha no upload privado. A OP está finalizada; gere o relatório novamente.");
    bytes = new Uint8Array(await existing.data.arrayBuffer()); const pdf = await PDFDocument.load(bytes, { throwOnInvalidObject: true });
    if (bytes.length > 40 * 1024 * 1024 || !pdf.getPageCount() || pdf.getSubject() !== report.id || !pdf.getKeywords()?.split(/[\s,]+/).includes(`version:${report.order_version}`)) throw new Error("Arquivo existente não corresponde ao relatório; manutenção autorizada necessária.");
    pages = pdf.getPageCount(); combined = pdf.getKeywords()?.split(/[\s,]+/).includes("original:true") ?? false;
    warning = combined ? null : "PDF original disponível separadamente.";
  }
  const completed = await supabase.rpc("complete_final_report", { report_id: report.id, digest: createHash("sha256").update(bytes).digest("hex"), page_count: pages, combined, warning: warning ?? undefined });
  if (completed.error) throw new Error("PDF armazenado, mas o vínculo ficou pendente. Gere novamente para concluir.");
}
