"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { lineSchema, productSchema, profileSchema, templateSchema, validateKind, type ActionState } from "./schemas";
import type { Json } from "@/types/database";

function message(error: { code?: string; message: string }): string {
  if (error.code === "23505") return "Já existe um cadastro com esse código/nome e revisão ou ordem de item.";
  if (error.code === "23503") return "O vínculo escolhido não está disponível. Recarregue a página.";
  if (error.code === "23514" || error.code === "22P02") return "Confira os campos: o banco rejeitou dados inválidos.";
  if (error.code === "42501" || error.code === "P0001") return error.message;
  return "Não foi possível salvar. Tente novamente ou contate a administração.";
}
function fields(form: FormData) {
  const nullable = (key: string) => { const value = form.get(key); return typeof value === "string" && value.trim() ? value.trim() : null; };
  const value = (key: string) => form.get(key) ?? "";
  return { nullable, value, boolean: (key: string) => form.get(key) === "on" };
}

export async function saveRecord(kindValue: string, _previous: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireRole(["ADMIN"]);
  const kind = validateKind(kindValue);
  const { nullable, value, boolean } = fields(form);
  const base = { id: nullable("id"), updated_at: nullable("updated_at") };
  let input: unknown;
  if (kind === "usuarios") input = { ...base, nome: value("nome"), role: value("role"), production_line_id: nullable("production_line_id"), ativo: boolean("ativo"), can_reopen_orders: boolean("can_reopen_orders") };
  if (kind === "linhas") input = { ...base, nome: value("nome"), setor: value("setor"), descricao: nullable("descricao"), ativa: boolean("ativa") };
  if (kind === "produtos") input = { ...base, codigo: value("codigo"), descricao: value("descricao"), unidade: value("unidade"), revisao: value("revisao"), checklist_template_id: nullable("checklist_template_id"), ativo: boolean("ativo") };
  if (kind === "checklists") {
    let itens: unknown;
    const serialized = form.get("itens");
    if (typeof serialized !== "string" || serialized.length > 500_000) return { error: "Os itens do modelo são inválidos ou excedem o limite." };
    try { itens = JSON.parse(serialized); } catch { return { error: "Os itens do modelo são inválidos." }; }
    input = { ...base, nome: value("nome"), revisao: value("revisao"), descricao: nullable("descricao"), ativo: boolean("ativo"), itens };
  }
  const schema = kind === "usuarios" ? profileSchema : kind === "linhas" ? lineSchema : kind === "produtos" ? productSchema : templateSchema;
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[issue.path.join(".")] ??= issue.message;
    return { error: "Confira os campos indicados.", fields: errors };
  }
  let error: { code?: string; message: string } | null = null;
  let id: string | null = null;
  // Each branch is typed against generated PostgreSQL types. No service key is used here.
  if (kind === "checklists") {
    const result = await supabase.rpc("admin_save_checklist", { payload: parsed.data as Json });
    error = result.error; id = result.data;
  } else {
    const { id: recordId, updated_at: updatedAt } = parsed.data;
    if (recordId && !updatedAt) return { error: "Recarregue o cadastro antes de editar." };
    if (kind === "usuarios") {
      const { id: profileId, updated_at: ignoredStamp, ...data } = profileSchema.parse(input);
      void ignoredStamp;
      const result = await supabase.from("profiles").update(data).eq("id", profileId).eq("updated_at", updatedAt!).select("id").maybeSingle();
      error = result.error; id = result.data?.id || null;
    } else if (kind === "linhas") {
      const { id: ignoredId, updated_at: ignoredStamp, ...data } = lineSchema.parse(input);
      void ignoredId; void ignoredStamp;
      const result = recordId
        ? await supabase.from("production_lines").update(data).eq("id", recordId).eq("updated_at", updatedAt!).select("id").maybeSingle()
        : await supabase.from("production_lines").insert(data).select("id").single();
      error = result.error; id = result.data?.id || null;
    } else {
      const { id: ignoredId, updated_at: ignoredStamp, ...data } = productSchema.parse(input);
      void ignoredId; void ignoredStamp;
      const result = recordId
        ? await supabase.from("products").update(data).eq("id", recordId).eq("updated_at", updatedAt!).select("id").maybeSingle()
        : await supabase.from("products").insert(data).select("id").single();
      error = result.error; id = result.data?.id || null;
    }
  }
  if (error) return { error: message(error) };
  if (!id) return { error: "Cadastro alterado por outra sessão ou indisponível. Recarregue antes de salvar." };
  revalidatePath("/admin", "layout");
  redirect(`/admin/${kind}?sucesso=salvo`);
}

export async function deactivateRecord(kindValue: string, _previous: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireRole(["ADMIN"]);
  const kind = validateKind(kindValue);
  const parsed = z.object({ id: z.uuid(), updated_at: z.string().datetime({ offset: true }) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Cadastro inválido. Recarregue a página." };
  const mutation = kind === "linhas" ? supabase.from("production_lines").update({ ativa: false })
    : kind === "usuarios" ? supabase.from("profiles").update({ ativo: false })
    : kind === "produtos" ? supabase.from("products").update({ ativo: false })
    : supabase.from("checklist_templates").update({ ativo: false });
  const result = await mutation.eq("id", parsed.data.id).eq("updated_at", parsed.data.updated_at).select("id").maybeSingle();
  if (result.error) return { error: message(result.error) };
  if (!result.data) return { error: "Cadastro alterado por outra sessão. Recarregue a página." };
  revalidatePath("/admin", "layout");
  redirect(`/admin/${kind}?sucesso=desativado`);
}
