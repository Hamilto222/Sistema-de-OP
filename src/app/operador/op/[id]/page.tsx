import Link from "next/link";
import { ReopenForm } from "@/features/finalization/forms";
import { OrderReports } from "@/features/finalization/reports";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { OrderStatusBadge } from "@/components/ui/order-status";
import { EmptyState } from "@/components/ui/admin-ui";
import { dateTime, quantity } from "@/features/pcp/queries";
import { FinishForm, MeasureForm, NoteForm, StartForm } from "@/features/operator/forms";
import { ElapsedTime } from "@/features/operator/elapsed-time";
import { NOTE_TYPES } from "@/features/operator/schemas";
export default async function ExecutionPage({ params }: { params: Promise<{ id: string }> }) {
  const { profile, supabase } = await requireRole(["OPERADOR"]);
  const { id } = await params; if (!z.uuid().safeParse(id).success) notFound();
  const result = await supabase.from("pcp_order_list").select().eq("id",id).maybeSingle();
  if (result.error) throw new Error("Não foi possível carregar a OP.");
  const order = result.data; if (!order?.id) notFound();
  const [checklist, notes, ncs] = await Promise.all([
    supabase.from("production_order_checklist").select().eq("production_order_id",id).order("ordem"),
    supabase.from("production_notes").select().eq("production_order_id",id).order("created_at",{ascending:false}).limit(100),
    supabase.from("non_conformities").select("id,codigo_nc,descricao,status,impeditiva").eq("production_order_id",id).not("status","in","(CLOSED,CANCELLED)"),
  ]);
  if (checklist.error || notes.error || ncs.error) throw new Error("Falha ao carregar checklist, apontamentos ou NCs.");
  const executing = order.status === "IN_PRODUCTION";
  const missing = checklist.data.filter(item => item.obrigatorio && (!item.data_medicao || item.conforme === null));
  const blocking = checklist.data.filter(item => item.bloqueia_op_se_nao_conforme && item.conforme === false);
  const blockingNC = ncs.data.filter(nc => nc.impeditiva);
  // Server request time is display-only; production timestamps are controlled by PostgreSQL.
  // eslint-disable-next-line react-hooks/purity
  const serverNow = Date.now();
  const section = "space-y-5 rounded-xl border border-slate-200 bg-white p-5 sm:p-6";
  return <div className="mx-auto max-w-4xl space-y-6">
    <header className="sticky top-0 z-10 space-y-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><h1 className="break-words text-2xl font-bold text-blue-950">OP {order.numero_op}</h1><OrderStatusBadge status={order.status!} /></div><p className="break-words font-semibold">{order.produto_codigo} · {order.produto_descricao}</p><p className="break-words text-slate-600">Lote: {order.lote}</p></header>
    <Link className="button-secondary min-h-14" href="/operador">← Minhas OPs</Link>
    <section className={section}><h2 className="text-xl font-bold text-blue-950">Produção</h2><dl className="grid grid-cols-2 gap-5 sm:grid-cols-3">{[["Planejada",`${quantity(order.quantidade_planejada)} ${order.unidade}`],["Produzida",`${quantity(order.quantidade_produzida)} ${order.unidade}`],["Linha",order.linha_nome],["Início",dateTime(order.inicio_producao)]].map(([label,value]) => <div key={label}><dt className="text-sm text-slate-600">{label}</dt><dd className="break-words text-lg font-semibold">{value}</dd></div>)}<div><dt className="text-sm text-slate-600">Tempo decorrido</dt><dd className="text-lg font-semibold"><ElapsedTime start={order.inicio_producao} end={order.fim_producao} serverNow={serverNow} /></dd></div></dl>
    {order.pdf_original_path && <a href={`/operador/op/${id}/pdf`} target="_blank" rel="noreferrer" className="button-secondary min-h-14 w-full text-lg sm:w-auto">Visualizar OP</a>}
    {["RELEASED", "REOPENED"].includes(order.status!) && <StartForm id={id} version={order.version!} />}
    {order.status === "BLOCKED_QUALITY" && <p role="alert" className="rounded-lg bg-red-50 p-4 font-semibold text-red-900">OP BLOQUEADA PELO CQ. Aguarde o tratamento e a liberação da Qualidade. Os registros estão disponíveis para consulta.</p>}
    {!executing && order.status !== "RELEASED" && order.status !== "REOPENED" && order.status !== "BLOCKED_QUALITY" && <p className="rounded-lg bg-blue-50 p-4">Esta OP está em consulta. Novos registros não são permitidos neste status.</p>}
    </section>
    <OrderReports id={id}/>{order.status === "FINALIZED" && profile.can_reopen_orders && <section className={section}><h2 className="text-xl font-bold">Reabertura autorizada</h2><ReopenForm id={id} version={order.version!}/></section>}
    <section className="space-y-6"><h2 className="text-2xl font-bold text-blue-950">Checklist</h2>{!checklist.data.length && <EmptyState>Nenhum checklist disponível.</EmptyState>}
    {([['ANTES','Preparação'],['DURANTE','Processo'],['DEPOIS','Finalização']] as const).map(([moment,label]) => {
      const items = checklist.data.filter(item => item.momento === moment); if (!items.length) return null;
      return <div key={moment} className="space-y-4"><h3 className="rounded-lg bg-blue-950 p-4 text-xl font-bold text-white">{label}</h3>{items.map(item => <article key={item.id} className={section}>
        {item.grupo && <p className="text-sm font-semibold text-blue-800">{item.grupo}</p>}<h4 className="break-words text-xl font-bold">{item.ordem}. {item.item}</h4>{item.descricao && <p className="whitespace-pre-wrap break-words leading-7">{item.descricao}</p>}
        <div className="flex flex-wrap gap-3 text-sm"><span>{item.obrigatorio ? "Obrigatório" : "Opcional"}</span>{item.unidade && <span>Unidade: {item.unidade}</span>}{item.valor_minimo !== null && <span>Mínimo: {quantity(item.valor_minimo)}</span>}{item.valor_maximo !== null && <span>Máximo: {quantity(item.valor_maximo)}</span>}{item.bloqueia_op_se_nao_conforme && <span>Bloqueia se não conforme</span>}</div>
        <p className={`rounded-lg p-3 font-bold ${item.conforme === false ? "bg-red-100 text-red-900" : item.conforme === true ? "bg-green-100 text-green-900" : "bg-slate-100 text-slate-700"}`}>{item.conforme === false ? "NÃO CONFORME" : item.conforme === true ? "CONFORME" : "Ainda não preenchido"}</p>
        {item.data_medicao && <div className="space-y-2 text-sm"><p>Última medição: {dateTime(item.data_medicao)} · {item.medido_por === profile.id ? "Você" : "Outro operador"}</p><p className="break-words">Resposta: {item.tipo_resposta === "NUMBER" ? quantity(item.valor_numero) : item.tipo_resposta === "BOOLEAN" ? item.resposta_boolean ? "Sim" : "Não" : item.resposta_select || item.resposta_texto || "Foto registrada"}</p>{item.observacao && <p className="whitespace-pre-wrap break-words">Observação: {item.observacao}</p>}</div>}
        {item.foto_path && <a className="button-secondary" href={`/operador/op/${id}/evidencia?item=${item.id}`} target="_blank" rel="noreferrer">Ver evidência do item</a>}
        {executing && <MeasureForm key={item.updated_at} id={id} userId={profile.id} item={item} />}
      </article>)}</div>;
    })}</section>
    <section className={section}><h2 className="text-xl font-bold text-blue-950">Apontamentos</h2>{executing && <NoteForm id={id} userId={profile.id} />}{!notes.data.length && <p className="text-slate-600">Nenhum apontamento registrado.</p>}{notes.data.map(note => <article key={note.id} className="space-y-2 rounded-lg bg-slate-50 p-4"><h3 className="font-bold">{note.tipo === "PRODUCAO" ? "Produção" : NOTE_TYPES[note.tipo]}</h3><p className="whitespace-pre-wrap break-words">{note.descricao}</p><p className="text-sm text-slate-600">{dateTime(note.created_at)} · {note.created_by === profile.id ? "Você" : "Outro operador"}</p>{note.tempo_minutos !== null && <p>Tempo: {quantity(note.tempo_minutos)} min</p>}{note.quantidade !== null && <p>Quantidade: {quantity(note.quantidade)} {note.unidade}</p>}{note.foto_path && <a className="button-secondary" href={`/operador/op/${id}/evidencia?apontamento=${note.id}`} target="_blank" rel="noreferrer">Ver foto do apontamento</a>}</article>)}{notes.data.length === 100 && <p className="text-sm text-slate-600">Exibidos os 100 apontamentos mais recentes. Os anteriores permanecem no histórico oficial.</p>}</section>
    {!!ncs.data.length && <section className={section}><h2 className="text-xl font-bold text-blue-950">Não conformidades abertas</h2>{ncs.data.map(nc => <article key={nc.id} className="space-y-2 rounded-lg bg-red-50 p-4"><p className="break-words font-bold">{nc.codigo_nc} · {nc.impeditiva ? "Impeditiva" : "Não impeditiva"}</p><p className="break-words">{nc.descricao}</p><p>Aguardando tratamento do CQ.</p></article>)}</section>}
    {executing && <section className={section}><h2 className="text-xl font-bold text-blue-950">Finalização do operador</h2>{missing.length || blocking.length || blockingNC.length ? <div className="rounded-lg bg-amber-50 p-4"><p className="font-bold">Resolva as pendências antes de enviar:</p><ul className="mt-3 list-disc space-y-2 pl-5">{missing.map(item => <li key={item.id}>Preencha: {item.item}</li>)}{blocking.map(item => <li key={item.id}>Item impeditivo não conforme: {item.item}</li>)}{!!blockingNC.length && <li>{blockingNC.length} NC(s) impeditiva(s) aberta(s).</li>}</ul></div> : <FinishForm id={id} userId={profile.id} version={order.version!} produced={order.quantidade_produzida} lost={order.quantidade_perdida} observation={order.observacao_final} />}</section>}
    <p className="text-sm text-slate-600">Rascunhos temporários duram até 24 horas nesta aba e são apagados ao sair. Não substituem registros salvos no banco. Em falha de conexão, tente salvar novamente.</p>
  </div>;
}
