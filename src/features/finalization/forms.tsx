"use client";
import { SuccessNotice } from "@/components/ui/notice";
import { startTransition, useActionState } from "react";
import { useRouter } from "next/navigation";
import { finalizeOrder, reopenOrder, retryReport, type FinalizationState } from "./actions";
function ActionForm({ action, children, label }: { action: (state: FinalizationState, form: FormData) => Promise<FinalizationState>; children: React.ReactNode; label: string }) {
  const router = useRouter();
  const [state, dispatch, pending] = useActionState(async (previous: FinalizationState, form: FormData) => { const result = await action(previous, form); if (result.success || result.error?.startsWith("OP finalizada")) router.refresh(); return result; }, {});
  return <form className="space-y-4" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); startTransition(() => dispatch(form)); }}>
    <fieldset className="space-y-4" disabled={pending}>{children}<button className="button-primary min-h-14" type="submit">{pending ? "Processando… Aguarde" : label}</button></fieldset>
    {state.error && <p role="alert" className="rounded-lg bg-red-50 p-4 text-red-900">{state.error}</p>}{state.success && <SuccessNotice identity={state}>{state.success}</SuccessNotice>}
  </form>;
}
export function FinalizeForm({ id, version, company }: { id: string; version: number; company: string }) {
  return <ActionForm action={finalizeOrder} label="FINALIZAR OP"><input type="hidden" name="id" value={id}/><input type="hidden" name="version" value={version}/><label className="block font-semibold" htmlFor="final-company">Empresa no relatório</label><input className="input" id="final-company" name="empresa" defaultValue={company} required maxLength={200}/><p>Confirma a aprovação PCP, preserva os registros e gera o relatório final privado.</p></ActionForm>;
}
export function RetryReportForm({ id }: { id: string }) { return <ActionForm action={retryReport} label="Gerar relatório pendente"><input name="report_id" type="hidden" value={id}/></ActionForm>; }
export function ReopenForm({ id, version }: { id: string; version: number }) {
  return <ActionForm action={reopenOrder} label="REABRIR OP"><input name="id" type="hidden" value={id}/><input name="version" type="hidden" value={version}/><label className="block font-semibold" htmlFor="reopen-reason">Motivo da reabertura</label><textarea className="input" id="reopen-reason" name="motivo" rows={3} required maxLength={4000}/><p>Aprovações e revisões serão reiniciadas. Medições, auditoria e relatórios anteriores serão preservados.</p></ActionForm>;
}
