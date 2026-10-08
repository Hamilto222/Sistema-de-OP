"use client";
import { useActionState, useRef } from "react";
import { useRouter } from "next/navigation";
import { FormErrors } from "@/components/ui/admin-ui";
import { releaseCorrection, closeCorrection } from "./actions";
import type { QualityState } from "./schemas";
export function CorrectionForm({ ncId, version, stamp, close = false }: { ncId: string; version: number; stamp: string; close?: boolean }) {
 const router=useRouter(),dialog=useRef<HTMLDialogElement>(null);
 const [state,action,pending]=useActionState(async(previous:QualityState,form:FormData)=>{const result=await (close?closeCorrection:releaseCorrection)(previous,form);if(result.success){dialog.current?.close();router.refresh();}return result;},{});
 const label=close?"APROVAR CORREÇÃO / FECHAR NC":"LIBERAR PARA CORREÇÃO";
 return <div className="space-y-3"><button className="button-primary min-h-14" onClick={()=>dialog.current?.showModal()}>{label}</button><dialog ref={dialog} className="max-h-[90dvh] w-[min(95vw,36rem)] overflow-auto rounded-xl p-6 backdrop:bg-slate-950/50"><h2 className="text-xl font-bold">{label}</h2><p className="my-4">{close?"A aprovação da correção fecha somente esta NC. A aprovação final da OP permanece uma ação separada.":"Esta ação permitirá que o operador retome a OP exclusivamente para realizar as correções necessárias. A NC permanecerá aberta. Deseja continuar?"}</p><form action={action} className="space-y-4"><input type="hidden" name="nc_id" value={ncId}/><input type="hidden" name="version" value={version}/><input type="hidden" name="updated_at" value={stamp}/>{close&&<label className="block font-semibold">Observação CQ de aprovação<textarea className="input mt-2" name="observation" required maxLength={4000}/></label>}<div className="flex flex-wrap gap-3"><button disabled={pending} className="button-primary min-h-14">{pending?"Salvando…":close?"Confirmar aprovação e fechamento":"Confirmar liberação"}</button><button disabled={pending} type="button" className="button-secondary min-h-14" onClick={()=>dialog.current?.close()}>Cancelar</button></div><FormErrors state={state}/></form></dialog>{state.success&&<p role="status">{state.success}</p>}</div>;
}
