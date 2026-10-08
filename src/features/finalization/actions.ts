"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireActiveProfile, requireRole } from "@/lib/auth/session";
import { renderStoredReport } from "./generate";
export type FinalizationState = { error?: string; success?: string };
const identity = z.object({ id: z.uuid(), version: z.coerce.number().int().positive() });
function changed() { for (const path of ["/pcp", "/operador", "/qualidade", "/sistema"]) revalidatePath(path, "layout"); }
export async function finalizeOrder(_previous: FinalizationState, form: FormData): Promise<FinalizationState> {
  const { supabase } = await requireRole(["ADMIN", "PCP"]);
  const parsed = identity.extend({ empresa: z.string().trim().min(1).max(200) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Informe os dados da OP e o nome da empresa (até 200 caracteres)." };
  const result = await supabase.rpc("pcp_finalize_order", { order_id: parsed.data.id, expected_version: parsed.data.version, company_name: parsed.data.empresa });
  if (result.error) return { error: result.error.code === "P0001" || result.error.code === "42501" ? result.error.message : "Não foi possível finalizar a OP." };
  try { await renderStoredReport(supabase, result.data); } catch (error) { changed(); return { error: `OP finalizada; relatório pendente. ${error instanceof Error ? error.message : "Tente gerar novamente."}` }; }
  changed(); redirect(`/pcp/ordens/${parsed.data.id}?sucesso=finalizada`);
}
export async function retryReport(_previous: FinalizationState, form: FormData): Promise<FinalizationState> {
  const { supabase } = await requireRole(["ADMIN", "PCP"]);
  const parsed = z.object({ report_id: z.uuid() }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Relatório inválido." };
  try { await renderStoredReport(supabase, parsed.data.report_id); changed(); return { success: "Relatório final disponível." }; }
  catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível gerar o relatório. Tente novamente." }; }
}
export async function reopenOrder(_previous: FinalizationState, form: FormData): Promise<FinalizationState> {
  const { supabase, profile } = await requireActiveProfile();
  if (profile.role !== "ADMIN" && !profile.can_reopen_orders) redirect("/sistema?motivo=sem-permissao");
  const parsed = identity.extend({ motivo: z.string().trim().min(1).max(4000) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Informe motivo de reabertura de até 4000 caracteres." };
  const result = await supabase.rpc("reopen_order", { order_id: parsed.data.id, expected_version: parsed.data.version, reason: parsed.data.motivo });
  if (result.error) return { error: result.error.code === "P0001" || result.error.code === "42501" ? result.error.message : "Não foi possível reabrir a OP." };
  changed(); return { success: "OP reaberta. Aprovações e revisões reiniciadas; histórico e relatórios preservados." };
}
