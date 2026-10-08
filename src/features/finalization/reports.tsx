import { requireActiveProfile } from "@/lib/auth/session";
import { dateTime } from "@/features/pcp/queries";
import { RetryReportForm } from "./forms";
export async function OrderReports({ id }: { id: string }) {
  const { supabase, profile } = await requireActiveProfile();
  const reports = [];
  for (let offset = 0; ; offset += 1000) {
    const result = await supabase.from("final_reports").select("id,status,order_version,created_at,completed_at,original_combined,merge_warning,pages").eq("production_order_id", id).order("created_at", { ascending: false }).order("id").range(offset, offset + 999);
    if (result.error) throw new Error("Falha ao consultar relatórios."); reports.push(...result.data); if (result.data.length < 1000) break;
  }
  if (!reports.length) return null;
  return <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5"><h2 className="text-xl font-bold text-blue-950">Relatórios finais e versões</h2>
    {reports.map(report => <article key={report.id} className="space-y-3 rounded-lg border border-slate-200 p-4"><h3 className="font-bold">Versão {report.order_version} · {report.status === "READY" ? "Disponível" : "Geração pendente"}</h3><p className="break-words text-sm">Identificador: {report.id}</p><p>Finalização: {dateTime(report.created_at)}</p>
      {report.status === "READY" ? <><p>{report.pages} páginas · {report.original_combined ? "Inclui PDF original" : "PDF original disponível separadamente"}</p><a className="button-secondary" href={`/sistema/ordens/${id}/relatorios/${report.id}`} target="_blank" rel="noreferrer">Visualizar relatório · versão {report.order_version}</a>{report.merge_warning && <p>{report.merge_warning}</p>}</> : <><p role="status" className="rounded-lg bg-amber-50 p-3">OP finalizada. O relatório precisa concluir a geração; a reabertura aguarda essa conclusão.</p>{["ADMIN", "PCP"].includes(profile.role) && <RetryReportForm id={report.id}/>}</>}
    </article>)}
  </section>;
}
