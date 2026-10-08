import Link from "next/link";
import { FinalizeForm, ReopenForm } from "@/features/finalization/forms";
import { OrderReports } from "@/features/finalization/reports";
import { NC_STATUS_LABELS, SEVERITY_LABELS } from "@/features/quality/constants";
import { NOTE_TYPES } from "@/features/operator/schemas";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { DataTable, EmptyState } from "@/components/ui/admin-ui";
import { ORDER_STATUS_LABELS, OrderStatusBadge, PRIORITY_LABELS } from "@/components/ui/order-status";
import { PrepareOrderForm, UploadOriginalForm } from "@/features/pcp/order-actions";
import { dateTime, quantity, scheduleDate } from "@/features/pcp/queries";
import type { Json } from "@/types/database";
function Section({ title, children }: { title: string; children: React.ReactNode }) { return <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-6"><h2 className="text-xl font-bold text-blue-950">{title}</h2>{children}</section>; }
function configText(value: Json) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "—";
  if (typeof value.resposta_conforme === "boolean") return `Resposta conforme: ${value.resposta_conforme ? "Sim" : "Não"}`;
  if (Array.isArray(value.opcoes)) return `Opções: ${value.opcoes.join(", ")}${Array.isArray(value.opcoes_conformes) ? ` · Conformes: ${value.opcoes_conformes.join(", ")}` : " · Todas conformes"}`;
  return "—";
}
function answer(row: { resposta_boolean: boolean | null; valor_numero: number | null; resposta_texto: string | null; resposta_select: string | null; foto_path: string | null }) { return row.resposta_boolean != null ? row.resposta_boolean ? "Sim" : "Não" : row.valor_numero != null ? quantity(row.valor_numero) : row.resposta_texto || row.resposta_select || (row.foto_path ? "Foto registrada" : "Não respondido"); }
export default async function OrderDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ sucesso?: string }> }) {
  const { supabase, profile } = await requireRole(["ADMIN", "PCP"]);
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const result = await supabase.from("production_orders").select("*").eq("id", id).maybeSingle();
  if (result.error) throw new Error("Falha ao consultar OP.");
  if (!result.data) notFound();
  const order = result.data;
  const [product, line, checklist, notes, ncs, history] = await Promise.all([
    supabase.from("products").select("codigo,descricao,revisao").eq("id", order.produto_id).single(),
    supabase.from("production_lines").select("nome,setor").eq("id", order.linha_id).single(),
    supabase.from("production_order_checklist").select("*").eq("production_order_id", id).order("ordem"),
    supabase.from("production_notes").select("*").eq("production_order_id", id).order("created_at", { ascending: false }).limit(100),
    supabase.from("non_conformities").select("*").eq("production_order_id", id).order("created_at", { ascending: false }).limit(100),
    supabase.from("audit_logs").select("*").eq("production_order_id", id).eq("entity", "production_orders").in("field", ["status", "pdf_original_path", "numero_op", "data_hora_programada", "aprovacao_cq", "aprovacao_pcp", "motivo_reabertura"]).order("created_at", { ascending: false }).limit(30),
  ]);
  if ([product, line, checklist, notes, ncs, history].some(response => response.error)) throw new Error("Falha ao carregar os registros da OP.");
  const userIds = [...new Set([order.created_by, order.operador_responsavel_id, order.responsavel_cq_id, order.responsavel_pcp_id, ...notes.data!.map(note => note.created_by), ...history.data!.map(log => log.user_id), ...checklist.data!.flatMap(item => [item.medido_por, item.revisado_por])].filter((value): value is string => !!value))];
  const people = userIds.length ? await supabase.from("profiles").select("id,nome").in("id", userIds) : { data: [], error: null };
  if (people.error) throw new Error("Falha ao carregar responsáveis.");
  const person = (value: string | null) => people.data!.find(profile => profile.id === value)?.nome || "Não definido";
  const { sucesso } = await searchParams;
  const success = sucesso === "finalizada" ? "OP finalizada com relatório final disponível." : sucesso === "criada" ? "OP criada como rascunho com PDF original." : sucesso === "pdf" ? "PDF original anexado." : sucesso === "preparada" ? "OP preparada: checklist copiado e produção liberada." : null;
  const data = [["Produto", `${product.data!.codigo} · ${product.data!.descricao} · Rev. ${product.data!.revisao}`], ["Lote", order.lote], ["Linha", `${line.data!.nome} · ${line.data!.setor}`], ["Quantidade planejada", `${quantity(order.quantidade_planejada)} ${order.unidade}`], ["Operador", order.operador_responsavel_id ? person(order.operador_responsavel_id) : "Atribuição por linha"], ["Data programada", scheduleDate(order.data_programada, order.data_hora_programada)], ["Prioridade", PRIORITY_LABELS[order.prioridade]], ["Criada por", person(order.created_by)], ["Criação", dateTime(order.created_at)], ["Última atualização", dateTime(order.updated_at)], ["Início da produção", dateTime(order.inicio_producao)], ["Fim da produção", dateTime(order.fim_producao)]];
  const auditValue = (field: string | null, value: Json) => field === "status" && typeof value === "string" && value in ORDER_STATUS_LABELS ? ORDER_STATUS_LABELS[value as keyof typeof ORDER_STATUS_LABELS] : field === "pdf_original_path" ? value ? "PDF anexado" : "Sem PDF" : field === "data_hora_programada" && typeof value === "string" ? dateTime(value) : value === null ? "—" : typeof value === "boolean" ? value ? "Sim" : "Não" : String(value);
  const auditLabels: Record<string, string> = { status: "Status", pdf_original_path: "PDF original", numero_op: "Número OP", data_hora_programada: "Programação", aprovacao_cq: "Aprovação CQ", aprovacao_pcp: "Aprovação PCP", motivo_reabertura: "Reabertura" };
  return <div className="mx-auto max-w-7xl space-y-6"><div className="flex flex-wrap items-center justify-between gap-4"><div><Link className="text-sm text-blue-900 underline" href="/pcp/ordens">Voltar às ordens</Link><h1 className="mt-3 text-2xl font-bold text-blue-950">OP {order.numero_op}</h1></div><OrderStatusBadge status={order.status} /></div>
    {success && <p role="status" className="rounded-lg border border-green-200 bg-green-50 p-4 text-green-900">{success}</p>}
    <Section title="Dados gerais"><dl className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{data.map(([label, value]) => <div key={label}><dt className="text-sm font-semibold text-slate-600">{label}</dt><dd className="mt-1 break-words">{value}</dd></div>)}</dl></Section>
    <Section title="PDF original">{order.pdf_original_path ? <a href={`/pcp/ordens/${id}/pdf`} target="_blank" rel="noreferrer" className="button-secondary">Visualizar PDF original</a> : <p className="text-slate-600">PDF ainda não anexado. A OP permanece em rascunho até concluir a preparação.</p>}{order.status === "DRAFT" && <UploadOriginalForm key={order.version} id={id} version={order.version} hasPdf={!!order.pdf_original_path} />}</Section>
    {order.status === "DRAFT" && <Section title="Preparação"><PrepareOrderForm id={id} version={order.version} /></Section>}
    {order.status === "AWAITING_PCP" && order.aprovacao_cq === "APPROVED" && <Section title="Finalização PCP"><FinalizeForm id={id} version={order.version} company={order.empresa_nome || process.env.OP_DIGITAL_COMPANY_NAME || ""}/></Section>}
    <OrderReports id={id}/>
    {order.status === "FINALIZED" && (profile.role === "ADMIN" || profile.can_reopen_orders) && <Section title="Reabertura autorizada"><ReopenForm id={id} version={order.version}/></Section>}
    <Section title="Checklist da OP">{order.checklist_template_nome && <p className="font-medium">{order.checklist_template_nome} · Rev. {order.checklist_template_revisao}{order.checklist_template_descricao && <span className="mt-2 block text-sm text-slate-600">{order.checklist_template_descricao}</span>}</p>}
      {!checklist.data!.length ? <EmptyState>Checklist ainda não preparado.</EmptyState> : <DataTable columns={["Ordem / Grupo", "Item / Instrução", "Resposta / Unidade", "Limites e regras", "Configuração", "Medição", "Conformidade / CQ"]}>{checklist.data!.map(item => <tr key={item.id}><td>{item.ordem}<p>{item.grupo || "—"}</p></td><td className="min-w-52"><p className="font-semibold">{item.item}</p><p className="mt-1 text-slate-600">{item.descricao || "—"}</p></td><td>{({ BOOLEAN: "Sim / Não", NUMBER: "Número", TEXT: "Texto", PHOTO: "Foto", SELECT: "Seleção" })[item.tipo_resposta]}<p>{item.unidade || "—"}</p></td><td className="min-w-44"><p>Mín.: {quantity(item.valor_minimo)} · Máx.: {quantity(item.valor_maximo)}</p><p>{item.obrigatorio ? "Obrigatório" : "Opcional"} · {({ ANTES: "Antes", DURANTE: "Durante", DEPOIS: "Depois" })[item.momento]}</p><p>{item.requer_revisao_cq ? "Requer revisão CQ" : "Sem revisão CQ"}</p><p>{item.bloqueia_op_se_nao_conforme ? "Bloqueia se não conforme" : "Não bloqueia"}</p></td><td className="min-w-44">{configText(item.configuracao)}</td><td>{answer(item)}{item.data_medicao && <p className="mt-1 text-xs">{person(item.medido_por)} · {dateTime(item.data_medicao)}</p>}{item.observacao && <p>{item.observacao}</p>}</td><td>{item.conforme === null ? "Não avaliado" : item.conforme ? "Conforme" : "Não conforme"}<p>{item.revisado_cq ? `Revisado por ${person(item.revisado_por)} · ${dateTime(item.data_revisao)}` : "Não revisado"}</p></td></tr>)}</DataTable>}
    </Section>
    <Section title="Apontamentos">{!notes.data!.length ? <EmptyState>Nenhum apontamento registrado.</EmptyState> : <><p className="text-sm text-slate-600">Até 100 apontamentos mais recentes.</p><DataTable columns={["Tipo", "Descrição", "Tempo / Quantidade", "Autor", "Data"]}>{notes.data!.map(note => <tr key={note.id}><td>{({ ...NOTE_TYPES, PRODUCAO: "Produção" })[note.tipo]}</td><td>{note.descricao}</td><td>{quantity(note.tempo_minutos)} min · {quantity(note.quantidade)} {note.unidade}</td><td>{person(note.created_by)}</td><td>{dateTime(note.created_at)}</td></tr>)}</DataTable></>}</Section>
    <Section title="Não conformidades">{!ncs.data!.length ? <EmptyState>Nenhuma NC registrada.</EmptyState> : <><p className="text-sm text-slate-600">Até 100 NCs mais recentes.</p><DataTable columns={["Código", "Descrição", "Severidade", "Status", "Ação imediata", "Abertura"]}>{ncs.data!.map(nc => <tr key={nc.id}><td>{nc.codigo_nc}</td><td>{nc.descricao}</td><td>{SEVERITY_LABELS[nc.severidade]}</td><td>{NC_STATUS_LABELS[nc.status]}</td><td>{nc.acao_imediata || "—"}</td><td>{dateTime(nc.data_abertura)}</td></tr>)}</DataTable></>}</Section>
    <Section title="Aprovações"><div className="grid gap-6 sm:grid-cols-2">{[["Controle de Qualidade", order.aprovacao_cq, order.responsavel_cq_id, order.data_aprovacao_cq], ["PCP", order.aprovacao_pcp, order.responsavel_pcp_id, order.data_finalizacao]].map(([label, approved, responsible, date]) => <div key={String(label)}><h3 className="font-semibold">{label}</h3><p className="mt-2">{approved === null ? "Pendente" : approved === "APPROVED" ? "Aprovada" : "Reprovada"}</p><p>{person(responsible as string | null)} · {dateTime(date as string | null)}</p></div>)}</div>{order.observacao_final && <p>Observação final: {order.observacao_final}</p>}</Section>
    <Section title="Histórico resumido">{!history.data!.length ? <EmptyState>Nenhum evento disponível.</EmptyState> : <DataTable columns={["Data", "Evento", "Anterior", "Novo", "Usuário"]}>{history.data!.map(log => <tr key={log.id}><td className="whitespace-nowrap">{dateTime(log.created_at)}</td><td>{auditLabels[log.field || ""] || "Alteração"}</td><td>{auditValue(log.field, log.old_value)}</td><td>{auditValue(log.field, log.new_value)}</td><td>{person(log.user_id)}</td></tr>)}</DataTable>}<p className="text-sm text-slate-600">Até 30 alterações de planejamento, documento, status e aprovações. A auditoria completa permanece no banco.</p><Link className="button-secondary" href={`/pcp/ordens/${id}/auditoria`}>Ver auditoria completa</Link></Section>
  </div>;
}
