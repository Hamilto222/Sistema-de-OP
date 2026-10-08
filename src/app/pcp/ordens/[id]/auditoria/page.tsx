import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { dateTime } from "@/features/pcp/queries";
export default async function AuditPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pagina?: string }> }) {
  const { supabase } = await requireRole(["ADMIN", "PCP"]); const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const order = await supabase.from("production_orders").select("numero_op").eq("id", id).maybeSingle(); if (!order.data) notFound();
  const pageInput = z.coerce.number().int().positive().max(100000).safeParse((await searchParams).pagina || 1); const page = pageInput.success ? pageInput.data : 1;
  const records = await supabase.from("audit_logs").select("*", { count: "exact" }).eq("production_order_id", id).order("created_at", { ascending: false }).order("id").range((page - 1) * 50, page * 50 - 1);
  if (records.error) throw new Error("Falha ao consultar auditoria.");
  const peopleIds = [...new Set(records.data.map(log => log.user_id).filter((value): value is string => !!value))];
  const people = peopleIds.length ? await supabase.from("profiles").select("id,nome").in("id", peopleIds) : { data: [], error: null }; if (people.error) throw new Error("Falha ao consultar autores.");
  const entities: Record<string, string> = { production_orders: "Ordem de produção", production_order_checklist: "Checklist/Medição", production_notes: "Apontamento", non_conformities: "Não conformidade", final_reports: "Relatório final" };
  const actions: Record<string, string> = { INSERT: "Criação", UPDATE: "Alteração", DELETE: "Exclusão histórica" };
  return <div className="mx-auto max-w-5xl space-y-5"><Link className="button-secondary" href={`/pcp/ordens/${id}`}>← Voltar à OP</Link><h1 className="text-2xl font-bold text-blue-950">Auditoria completa · OP {order.data.numero_op}</h1><p>Valores registrados pelo banco. Horários de São Paulo. Auditoria não pode ser alterada pela aplicação.</p>
    {records.data.map(log => <article key={log.id} className="space-y-3 rounded-xl border border-slate-200 bg-white p-5"><h2 className="font-bold">{entities[log.entity] || log.entity} · {actions[log.action] || log.action} · {log.field}</h2><p>{dateTime(log.created_at)} · {people.data?.find(person => person.id === log.user_id)?.nome || "Sistema/manutenção"}</p><details><summary className="cursor-pointer rounded-lg p-3 font-semibold">Ver valor anterior e novo</summary><div className="grid gap-4 pt-3 sm:grid-cols-2"><div><h3>Anterior</h3><pre className="whitespace-pre-wrap break-all text-sm">{JSON.stringify(log.old_value, null, 2) ?? "—"}</pre></div><div><h3>Novo</h3><pre className="whitespace-pre-wrap break-all text-sm">{JSON.stringify(log.new_value, null, 2) ?? "—"}</pre></div></div></details></article>)}
    <div className="flex flex-wrap gap-4"><p>{records.count} registros · Página {page}</p>{page > 1 && <Link className="button-secondary" href={`?pagina=${page - 1}`}>Anterior</Link>}{page * 50 < (records.count || 0) && <Link className="button-secondary" href={`?pagina=${page + 1}`}>Próxima</Link>}</div>
  </div>;
}
