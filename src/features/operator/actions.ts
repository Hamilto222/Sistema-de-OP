"use server";
import { validateUpload } from "@/services/upload-validation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { identitySchema, measureSchema, noteSchema, finishSchema, PHOTO_MAX_BYTES, type OperatorState } from "./schemas";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
function failure(error: { code?: string; message: string }): OperatorState {
  if (error.code === "P0001" || (error.code === "42501" && !error.message.includes("permission denied"))) return { error: error.message };
  return { error: "Não foi possível salvar. Confira os dados, a conexão e o status da OP. Seus campos foram preservados." };
}
function invalid(issues: { path: PropertyKey[]; message: string }[]): OperatorState {
  return { error: "Confira os campos antes de salvar.", fields: Object.fromEntries(issues.map(issue => [issue.path.join("."), issue.message])) };
}
function changed() { revalidatePath("/operador", "layout"); revalidatePath("/pcp", "layout"); }
async function photo(supabase: SupabaseClient<Database>, id: string, form: FormData): Promise<{ path?: string; error?: string }> {
  const file = form.get("foto");
  if (!(file instanceof File) || !file.size) return { path: String(form.get("foto_path") || "") };
  if (file.size > PHOTO_MAX_BYTES) return { error: "A foto deve ter no máximo 10 MB." };
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return { error: "Envie foto JPEG, PNG ou WebP." };
  let bytes: ArrayBuffer;
  try { bytes = (await validateUpload(file, ["image/jpeg", "image/png", "image/webp"], PHOTO_MAX_BYTES)).bytes; }
  catch (error) { return { error: error instanceof Error ? `O ${error.message.charAt(0).toLowerCase()}${error.message.slice(1)}` : "Foto inválida." }; }
  const { data: order } = await supabase.from("production_orders").select("status").eq("id", id).maybeSingle();
  if (order?.status !== "IN_PRODUCTION") return { error: "Upload exige OP acessível em produção. Recarregue a página." };
  const path = `${id}/${crypto.randomUUID()}.${file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : "webp"}`;
  try {
    const result = await supabase.storage.from("operator-evidence").upload(path, bytes, { contentType: file.type, upsert: false });
    return result.error ? { error: "Não foi possível enviar a foto. Seus campos foram preservados; tente novamente." } : { path };
  } catch { return { error: "Falha de conexão no envio da foto. Tente novamente." }; }
}
export async function startOrder(_previous: OperatorState, form: FormData): Promise<OperatorState> {
  const { supabase } = await requireRole(["OPERADOR"]);
  const parsed = identitySchema.safeParse(Object.fromEntries(form)); if (!parsed.success) return invalid(parsed.error.issues);
  const result = await supabase.rpc("operator_start_order", { order_id: parsed.data.id, expected_version: parsed.data.version });
  if (result.error) return failure(result.error); changed(); return { success: "Produção iniciada." };
}
export async function saveMeasure(_previous: OperatorState, form: FormData): Promise<OperatorState> {
  const { supabase } = await requireRole(["OPERADOR"]);
  const parsed = measureSchema.safeParse(Object.fromEntries(form)); if (!parsed.success) return invalid(parsed.error.issues);
  const input = parsed.data;
  const { data: item } = await supabase.from("production_order_checklist").select("tipo_resposta,updated_at").eq("id", input.item_id).eq("production_order_id", input.id).maybeSingle();
  if (!item || item.updated_at !== input.updated_at) return { error: "Item indisponível ou alterado. Recarregue antes de salvar." };
  if (item.tipo_resposta === "NUMBER" && (!input.valor.trim() || !Number.isFinite(Number(input.valor)))) return { error: "Informe um número válido. Use o campo numérico para a medição." };
  if (item.tipo_resposta === "BOOLEAN" && !["true", "false"].includes(input.valor)) return { error: "Selecione Sim ou Não." };
  const image = await photo(supabase, input.id, form); if (image.error) return { error: image.error };
  const result = await supabase.rpc("operator_save_measure", { order_id: input.id, item_id: input.item_id, expected_updated_at: input.updated_at, payload: { valor: input.valor, observacao: input.observacao, foto_path: image.path || null } });
  if (result.error) return failure(result.error); changed(); return { success: "Medição salva no banco." };
}
export async function addNote(_previous: OperatorState, form: FormData): Promise<OperatorState> {
  const { supabase } = await requireRole(["OPERADOR"]);
  const parsed = noteSchema.safeParse(Object.fromEntries(form)); if (!parsed.success) return invalid(parsed.error.issues);
  const { id, ...input } = parsed.data;
  const image = await photo(supabase, id, form); if (image.error) return { error: image.error };
  const result = await supabase.rpc("operator_add_note", { order_id: id, payload: { ...input, foto_path: image.path || null } });
  if (result.error) return failure(result.error); changed(); return { success: "Apontamento registrado." };
}
export async function finishOrder(_previous: OperatorState, form: FormData): Promise<OperatorState> {
  const { supabase } = await requireRole(["OPERADOR"]);
  const parsed = finishSchema.safeParse(Object.fromEntries(form)); if (!parsed.success) return invalid(parsed.error.issues);
  const input = parsed.data;
  const result = await supabase.rpc("operator_submit_order", { order_id: input.id, expected_version: input.version, produced: input.quantidade_produzida, lost: input.quantidade_perdida, final_note: input.observacao_final });
  if (result.error) return failure(result.error); changed(); return { success: "OP enviada ao Controle de Qualidade." };
}
