import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { formatDate, formatTime } from "@/lib/locale";

async function collect<T>(fetchBatch: (offset: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 1000) {
    const result = await fetchBatch(offset);
    if (result.error || !result.data) throw new Error("Falha ao carregar vínculos da OP.");
    rows.push(...result.data);
    if (result.data.length < 1000) return rows;
  }
}
export async function loadLookups(supabase: SupabaseClient<Database>, activeOnly = false) {
  const [products, lines, operators] = await Promise.all([
    collect(offset => { const request = supabase.from("products").select("id,codigo,descricao,unidade,revisao,ativo").order("codigo").order("id").range(offset, offset + 999); return activeOnly ? request.eq("ativo", true) : request; }),
    collect(offset => { const request = supabase.from("production_lines").select("id,nome,ativa").order("nome").order("id").range(offset, offset + 999); return activeOnly ? request.eq("ativa", true) : request; }),
    collect(offset => { const request = supabase.from("profiles").select("id,nome,ativo").eq("role", "OPERADOR").order("nome").order("id").range(offset, offset + 999); return activeOnly ? request.eq("ativo", true) : request; }),
  ]);
  return { products, lines, operators };
}
export type PcpLookups = Awaited<ReturnType<typeof loadLookups>>;
export function dateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return `${formatDate(date)} ${formatTime(date)}`;
}
export function scheduleDate(date: string | null | undefined, timestamp: string | null | undefined) {
  if (timestamp) return dateTime(timestamp);
  return date ? date.split("-").reverse().join("/") : "Não programada";
}
export function quantity(value: number | null | undefined) { return value == null ? "—" : new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 6 }).format(value); }
export function searchFilter(query: string) {
  const value = `%${query.replace(/[\\%_]/g, "\\$&")}%`.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return ["numero_op", "produto_codigo", "produto_descricao", "lote"].map(column => `${column}.ilike."${value}"`).join(",");
}
