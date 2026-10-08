"use server";
import { validateUpload } from "@/services/upload-validation";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { orderActionSchema, orderSchema, PDF_MAX_BYTES, type PcpState } from "./schemas";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

function errorMessage(error: { code?: string; message: string }) {
  if (error.code === "23505") return "Já existe uma OP com esse número.";
  if (error.code === "23503") return "Um vínculo da OP não está disponível. Recarregue a página.";
  if (error.code === "P0001" || (error.code === "42501" && !error.message.includes("permission denied"))) return error.message;
  if (error.code === "22007" || error.code === "22008") return "Data e hora programadas inválidas.";
  return "Não foi possível concluir a operação. Confira os dados e tente novamente.";
}
async function validatePdf(value: FormDataEntryValue | null): Promise<{ file: File; bytes: ArrayBuffer } | { error: string }> {
  if (!(value instanceof File) || !value.size) return { error: "Selecione o PDF original." };
  if (value.type !== "application/pdf" || !/\.pdf$/i.test(value.name)) return { error: "Envie somente arquivo PDF com MIME application/pdf." };
  if (value.size > PDF_MAX_BYTES) return { error: "O PDF deve ter no máximo 20 MB." };
  try { const upload = await validateUpload(value, ["application/pdf"], PDF_MAX_BYTES); return { file: value, bytes: upload.bytes }; }
  catch (error) { return { error: error instanceof Error ? error.message : "PDF inválido." }; }
}
async function storePdf(supabase: SupabaseClient<Database>, id: string, version: number, bytes: ArrayBuffer): Promise<string | null> {
  try {
    const path = `${id}/${crypto.randomUUID()}.pdf`;
    const result = await supabase.storage.from("op-originals").upload(path, bytes, { contentType: "application/pdf", upsert: false });
    if (result.error) return "Não foi possível enviar o PDF. O rascunho foi preservado; tente anexar novamente.";
    const attached = await supabase.rpc("pcp_attach_original", { order_id: id, document_path: path, expected_version: version });
    if (attached.error) return errorMessage(attached.error);
    return null;
  } catch {
    return "Não foi possível enviar ou vincular o PDF. Abra o rascunho e tente novamente.";
  }
}
export async function createOrder(_previous: PcpState, form: FormData): Promise<PcpState> {
  const { supabase } = await requireRole(["ADMIN", "PCP"]);
  const input = Object.fromEntries(form);
  const parsed = orderSchema.safeParse({ ...input, operador_responsavel_id: input.operador_responsavel_id || null });
  if (!parsed.success) return { error: "Confira os dados da OP.", fields: Object.fromEntries(parsed.error.issues.map(issue => [issue.path.join("."), issue.message])) };
  const pdf = await validatePdf(form.get("pdf"));
  if ("error" in pdf) return pdf;
  const created = await supabase.rpc("pcp_create_order", { payload: parsed.data });
  if (created.error || !created.data) return { error: created.error ? errorMessage(created.error) : "Não foi possível criar a OP." };
  const failure = await storePdf(supabase, created.data, 1, pdf.bytes);
  revalidatePath("/pcp", "layout");
  if (failure) return { error: failure, draftId: created.data };
  redirect(`/pcp/ordens/${created.data}?sucesso=criada`);
}
export async function uploadOriginal(_previous: PcpState, form: FormData): Promise<PcpState> {
  const { supabase } = await requireRole(["ADMIN", "PCP"]);
  const parsed = orderActionSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "OP inválida. Recarregue a página." };
  const pdf = await validatePdf(form.get("pdf"));
  if ("error" in pdf) return pdf;
  const { data, error } = await supabase.from("production_orders").select("status,version").eq("id", parsed.data.id).single();
  if (error || !data || data.status !== "DRAFT" || data.version !== parsed.data.version) return { error: "A OP mudou ou não é um rascunho. Recarregue antes de anexar." };
  const failure = await storePdf(supabase, parsed.data.id, parsed.data.version, pdf.bytes);
  if (failure) return { error: failure };
  revalidatePath("/pcp", "layout");
  redirect(`/pcp/ordens/${parsed.data.id}?sucesso=pdf`);
}
export async function prepareOrder(_previous: PcpState, form: FormData): Promise<PcpState> {
  const { supabase } = await requireRole(["ADMIN", "PCP"]);
  const parsed = orderActionSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "OP inválida. Recarregue a página." };
  const result = await supabase.rpc("pcp_prepare_order", { order_id: parsed.data.id, expected_version: parsed.data.version });
  if (result.error) return { error: errorMessage(result.error) };
  revalidatePath("/pcp", "layout");
  redirect(`/pcp/ordens/${parsed.data.id}?sucesso=preparada`);
}
