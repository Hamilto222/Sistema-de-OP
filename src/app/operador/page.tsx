import Link from "next/link";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { OrderStatusBadge } from "@/components/ui/order-status";
import { EmptyState } from "@/components/ui/admin-ui";
import { quantity } from "@/features/pcp/queries";
export default async function OperatorPage({ searchParams }: { searchParams: Promise<{ pagina?: string }> }) {
  const { supabase } = await requireRole(["OPERADOR"]);
  const params = await searchParams; const parsed = z.coerce.number().int().min(1).max(100000).safeParse(params.pagina || 1); const page = parsed.success ? parsed.data : 1;
  const { data, error, count } = await supabase.from("pcp_order_list").select("id,numero_op,produto_codigo,produto_descricao,lote,linha_nome,quantidade_planejada,unidade,prioridade,status", { count: "exact" }).order("updated_at", {ascending:false}).order("id").range((page-1)*20,page*20-1);
  if (error) throw new Error("Não foi possível carregar suas OPs.");
  return <div className="mx-auto max-w-5xl space-y-6"><div><h1 className="text-3xl font-bold text-blue-950">Minhas OPs</h1><p className="mt-2 text-slate-600">Ordens atribuídas a você ou à sua linha autorizada. Toque na OP para abrir.</p></div>
    {!data?.length && <EmptyState>Nenhuma OP disponível nesta página. Aguarde a liberação pelo PCP.</EmptyState>}
    <div className="grid gap-5 md:grid-cols-2">{data?.map(order => <Link key={order.id} href={`/operador/op/${order.id}`} className="block space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm focus-visible:outline-2 focus-visible:outline-blue-700"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="break-words text-2xl font-bold text-blue-950">OP {order.numero_op}</h2><OrderStatusBadge status={order.status!} /></div><p className="break-words text-lg font-semibold">{order.produto_codigo} · {order.produto_descricao}</p><dl className="grid grid-cols-2 gap-4"><div><dt className="text-slate-600">Lote</dt><dd className="break-words font-semibold">{order.lote}</dd></div><div><dt className="text-slate-600">Linha</dt><dd className="break-words font-semibold">{order.linha_nome}</dd></div><div><dt className="text-slate-600">Planejada</dt><dd className="font-semibold">{quantity(order.quantidade_planejada)} {order.unidade}</dd></div><div><dt className="text-slate-600">Prioridade</dt><dd className="font-semibold">{order.prioridade === "URGENTE" ? "Urgente" : order.prioridade === "ALTA" ? "Alta" : order.prioridade === "BAIXA" ? "Baixa" : "Normal"}</dd></div></dl><p className="font-semibold text-blue-800">Abrir OP →</p></Link>)}</div>
    <div className="flex flex-wrap justify-between gap-3"><p>{count || 0} OPs · Página {page}</p>{page>1 && <Link className="button-secondary" href={`?pagina=${page-1}`}>Anterior</Link>}{page*20<(count || 0) && <Link className="button-secondary" href={`?pagina=${page+1}`}>Próxima</Link>}</div>
  </div>;
}
