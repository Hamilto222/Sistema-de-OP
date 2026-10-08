import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { DataTable, EmptyState, ErrorMessage, Field } from "@/components/ui/admin-ui";
import { ORDER_STATUS_LABELS, OrderStatusBadge, PRIORITY_LABELS } from "@/components/ui/order-status";
import { filtersSchema } from "./schemas";
import { dateTime, loadLookups, quantity, scheduleDate, searchFilter } from "./queries";
export type PcpSearchParams = Promise<Record<string, string | string[] | undefined>>;
export async function OrdersList({ searchParams }: { searchParams: PcpSearchParams }) {
  const { supabase } = await requireRole(["ADMIN", "PCP"]);
  const params = await searchParams;
  const input = Object.fromEntries(Object.entries(params).filter(([, value]) => typeof value === "string" && value !== ""));
  const parsed = filtersSchema.safeParse(input);
  const { products, lines, operators } = await loadLookups(supabase);
  if (!parsed.success) return <div className="space-y-4"><ErrorMessage>Filtros inválidos: {parsed.error.issues.map(issue => issue.message).join(" ")}</ErrorMessage><Link href="/pcp/ordens" className="button-secondary">Limpar filtros</Link></div>;
  const filters = parsed.data;
  let request = supabase.from("pcp_order_list").select("*", { count: "exact" });
  if (filters.inicio) request = request.gte("data_programada", filters.inicio);
  if (filters.fim) request = request.lte("data_programada", filters.fim);
  if (filters.linha) request = request.eq("linha_id", filters.linha);
  if (filters.produto) request = request.eq("produto_id", filters.produto);
  if (filters.operador) request = request.eq("operador_responsavel_id", filters.operador);
  if (filters.status) request = request.eq("status", filters.status);
  if (filters.q) request = request.or(searchFilter(filters.q));
  const result = await request.order("updated_at", { ascending: false }).order("id").range((filters.pagina - 1) * 20, filters.pagina * 20 - 1);
  if (result.error) throw new Error("Falha ao consultar OPs.");
  const pages = Math.max(1, Math.ceil((result.count || 0) / 20));
  const link = (page: number) => { const query = new URLSearchParams(); for (const [key, value] of Object.entries(filters)) if (value) query.set(key, String(value)); query.set("pagina", String(page)); return `?${query}`; };
  return <div className="space-y-5"><form method="get" className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Field name="q" label="Pesquisa" defaultValue={filters.q} maxLength={100} placeholder="Número OP, produto ou lote" />
      <Field name="inicio" label="Período inicial" type="date" defaultValue={filters.inicio} /><Field name="fim" label="Período final" type="date" defaultValue={filters.fim} />
      <Field name="linha" label="Linha"><select id="linha" name="linha" defaultValue={filters.linha || ""} className="input"><option value="">Todas</option>{lines.map(line => <option key={line.id} value={line.id}>{line.nome}{line.ativa ? "" : " (inativa)"}</option>)}</select></Field>
      <Field name="produto" label="Produto"><select id="produto" name="produto" defaultValue={filters.produto || ""} className="input"><option value="">Todos</option>{products.map(product => <option key={product.id} value={product.id}>{product.codigo} · {product.descricao} · Rev. {product.revisao}</option>)}</select></Field>
      <Field name="status" label="Status"><select id="status" name="status" defaultValue={filters.status || ""} className="input"><option value="">Todos</option>{Object.entries(ORDER_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
      <Field name="operador" label="Operador"><select id="operador" name="operador" defaultValue={filters.operador || ""} className="input"><option value="">Todos</option>{operators.map(operator => <option key={operator.id} value={operator.id}>{operator.nome}{operator.ativo ? "" : " (inativo)"}</option>)}</select></Field>
    </div><div className="flex gap-3"><button type="submit" className="button-primary">Filtrar</button><Link href="/pcp/ordens" className="button-secondary">Limpar filtros</Link></div>
  </form>
  {!result.data.length ? <EmptyState>Nenhuma OP encontrada para os filtros informados.</EmptyState> : <><div className="grid gap-4 xl:hidden">{result.data.map(order=><article key={order.id} className="card space-y-3"><div className="flex flex-wrap justify-between gap-3"><Link className="button-secondary font-bold" href={`/pcp/ordens/${order.id}`}>OP {order.numero_op}</Link>{order.status&&<OrderStatusBadge status={order.status}/>}</div><p className="break-words font-semibold">{order.produto_codigo} · {order.produto_descricao}</p><dl className="grid grid-cols-2 gap-3">{[["Lote",order.lote],["Linha",order.linha_nome],["Planejado",`${quantity(order.quantidade_planejada)} ${order.unidade}`],["Operador",order.operador_nome||"Atribuição por linha"],["Programação",scheduleDate(order.data_programada,order.data_hora_programada)],["Prioridade",order.prioridade?PRIORITY_LABELS[order.prioridade]:"—"],["Atualização",dateTime(order.updated_at)]].map(([label,value])=><div key={label} className="min-w-0"><dt className="text-sm text-slate-600">{label}</dt><dd className="break-words">{value}</dd></div>)}</dl></article>)}</div><div className="hidden xl:block"><DataTable columns={["Número OP", "Produto", "Lote", "Linha", "Quantidade planejada", "Operador", "Data programada", "Prioridade", "Status", "Última atualização"]}>
    {result.data.map(order => <tr key={order.id}><td><Link href={`/pcp/ordens/${order.id}`} className="font-semibold text-blue-900 underline">{order.numero_op}</Link></td><td><p>{order.produto_codigo}</p><p className="min-w-40 text-slate-600">{order.produto_descricao}</p></td><td>{order.lote}</td><td>{order.linha_nome}</td><td>{quantity(order.quantidade_planejada)} {order.unidade}</td><td>{order.operador_nome || "Atribuição por linha"}</td><td className="whitespace-nowrap">{scheduleDate(order.data_programada, order.data_hora_programada)}</td><td>{order.prioridade ? PRIORITY_LABELS[order.prioridade] : "—"}</td><td>{order.status && <OrderStatusBadge status={order.status} />}</td><td className="whitespace-nowrap">{dateTime(order.updated_at)}</td></tr>)}
  </DataTable></div></>}
  <div className="flex flex-wrap items-center justify-between gap-3 text-sm"><p>{result.count || 0} OPs · Página {filters.pagina} de {pages}</p><div className="flex gap-2">{filters.pagina > 1 && <Link className="button-secondary" href={link(filters.pagina - 1)}>Anterior</Link>}{filters.pagina < pages && <Link className="button-secondary" href={link(filters.pagina + 1)}>Próxima</Link>}</div></div>
  </div>;
}
