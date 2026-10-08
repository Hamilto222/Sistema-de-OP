"use client";
import { SuccessNotice } from "@/components/ui/notice";
import { useActionState,startTransition,useState } from "react";
import { useRouter } from "next/navigation";
import { FormErrors } from "@/components/ui/admin-ui";
import { decideOrder,reviewItem,saveNc } from "./actions";
import { NC_STATUS_LABELS,SEVERITY_LABELS } from "./constants";
import type { QualityState } from "./schemas";
import type { NcLookups } from "./queries";
import type { Database } from "@/types/database";
function QualityForm({action,children,submit}:{action:(state:QualityState,form:FormData)=>Promise<QualityState>;children:React.ReactNode;submit:string}){
 const router=useRouter();const [state,dispatch,pending]=useActionState(async(previous:QualityState,form:FormData)=>{const result=await action(previous,form);if(result.success)router.refresh();return result;},{});
 return <form className="space-y-4" onSubmit={event=>{event.preventDefault();const data=new FormData(event.currentTarget);startTransition(()=>dispatch(data));}}><fieldset disabled={pending} className="space-y-4">{children}<button className="button-primary min-h-14" type="submit">{pending?"Salvando… Aguarde":submit}</button></fieldset><FormErrors state={state}/>{state.success&&<SuccessNotice identity={state}>{state.success}</SuccessNotice>}</form>;
}
export function ReviewForm({id,itemId,stamp}:{id:string;itemId:string;stamp:string}){return <QualityForm action={reviewItem} submit="REVISAR ITEM"><input type="hidden" name="id" value={id}/><input type="hidden" name="item_id" value={itemId}/><input type="hidden" name="updated_at" value={stamp}/></QualityForm>;}
export function DecisionForm({id,version,decision,label}:{id:string;version:number;decision:"APPROVED"|"REJECTED"|"IN_PRODUCTION"|"AWAITING_QUALITY";label:string}){
 return <QualityForm action={decideOrder} submit={label}><input type="hidden" name="id" value={id}/><input type="hidden" name="version" value={version}/><input type="hidden" name="decision" value={decision}/>{decision==="APPROVED"?<><input name="reason" type="hidden" value=""/><p>A confirmação registra sua aprovação e envia a OP ao PCP.</p></>:<label className="block font-semibold">{decision==="REJECTED"?"Motivo do bloqueio/reprovação":"Justificativa do retorno"}<textarea className="input mt-2" name="reason" required maxLength={4000} rows={3}/></label>}</QualityForm>;
}
type NC=Database["public"]["Tables"]["non_conformities"]["Row"];
export function NcForm({nc,lookups,orderId,itemId}:{nc?:NC;lookups:NcLookups;orderId?:string;itemId?:string}){
 const [selectedOrder,setSelectedOrder]=useState(nc?.production_order_id||orderId||"");
 const [texts,setTexts]=useState({descricao:nc?.descricao||"",acao_imediata:nc?.acao_imediata||"",observacao_cq:nc?.observacao_cq||""});
 const statuses=nc?nc.status==="OPEN"?["OPEN","IN_TREATMENT","AWAITING_QUALITY","CANCELLED"]:nc.status==="IN_TREATMENT"?["IN_TREATMENT","AWAITING_QUALITY","CANCELLED"]:["AWAITING_QUALITY","IN_TREATMENT","CLOSED","CANCELLED"]:["OPEN"];
 return <QualityForm action={saveNc} submit={nc?"Salvar NC":"Criar NC"}>
  <input type="hidden" name="id" value={nc?.id||""}/><input type="hidden" name="updated_at" value={nc?.updated_at||""}/>
  <div className="grid gap-5 sm:grid-cols-2"><div><label htmlFor="nc-order" className="mb-2 block font-semibold">OP</label>{nc||orderId?<><input type="hidden" name="production_order_id" value={selectedOrder}/><p className="input flex items-center">{lookups.orders.find(order=>order.id===selectedOrder)?.numero_op||"OP vinculada"}</p></>:<select id="nc-order" name="production_order_id" required value={selectedOrder} onChange={event=>setSelectedOrder(event.target.value)} className="input"><option value="">Selecione a OP</option>{lookups.orders.map(order=><option key={order.id} value={order.id!}>{order.numero_op} · {order.produto_descricao}</option>)}</select>}</div>
  <div><label className="mb-2 block font-semibold" htmlFor="nc-item">Item relacionado (opcional)</label><select className="input" id="nc-item" name="checklist_item_id" defaultValue={nc?.checklist_item_id||itemId||""}><option value="">Sem item específico</option>{lookups.items.map(item=><option key={item.id} value={item.id}>{item.ordem}. {item.item}</option>)}</select>{!orderId&&!nc&&<p className="mt-2 text-sm text-slate-600">Para relacionar um item, abra a OP na Qualidade e use “Abrir NC deste item”.</p>}</div>
  <label className="block font-semibold">Tipo<input className="input mt-2" name="tipo" defaultValue={nc?.tipo||"PROCESSO"} required maxLength={100}/></label>
  <div><label htmlFor="nc-severity" className="mb-2 block font-semibold">Severidade</label><select className="input" name="severidade" id="nc-severity" defaultValue={nc?.severidade||"MEDIUM"}>{Object.entries(SEVERITY_LABELS).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></div>
  <div><label className="mb-2 block font-semibold" htmlFor="nc-person">Responsável</label><select className="input" id="nc-person" name="responsavel_id" defaultValue={nc?.responsavel_id||""}><option value="">Selecione (obrigatório para fechar)</option>{lookups.people.filter(person=>person.ativo||person.id===nc?.responsavel_id).map(person=><option key={person.id} value={person.id}>{person.nome}{!person.ativo?" (inativo)":""}</option>)}</select></div>
  <div><label className="mb-2 block font-semibold" htmlFor="nc-status">Status da NC</label><select className="input" id="nc-status" name="status" defaultValue={nc?.status||"OPEN"}>{statuses.map(value=><option key={value} value={value}>{NC_STATUS_LABELS[value as keyof typeof NC_STATUS_LABELS]}</option>)}</select></div></div>
  <div><label htmlFor="nc-descricao" className="block font-semibold">Descrição</label><textarea id="nc-descricao" className="input mt-2" name="descricao" value={texts.descricao} onChange={event=>setTexts(previous=>({...previous,descricao:event.target.value}))} rows={3} required maxLength={4000}/></div>
  <div><label htmlFor="nc-acao_imediata" className="block font-semibold">Ação imediata</label><textarea id="nc-acao_imediata" className="input mt-2" name="acao_imediata" value={texts.acao_imediata} onChange={event=>setTexts(previous=>({...previous,acao_imediata:event.target.value}))} rows={3} maxLength={4000}/></div>
  <label className="flex min-h-12 items-center gap-3"><input type="checkbox" name="impeditiva" defaultChecked={nc?.impeditiva??true} className="size-6"/>NC impeditiva para aprovação da OP</label>
  <div className="grid gap-5 sm:grid-cols-2">{([['antes','Evidência antes'],['depois','Evidência depois']] as const).map(([name,label])=><div key={name}><label className="mb-2 block font-semibold" htmlFor={`nc-${name}`}>{label} (opcional)</label><input type="hidden" name={`evidencia_${name}_path`} value={nc?.[`evidencia_${name}_path`]||""}/><input className="input" id={`nc-${name}`} type="file" name={`evidencia_${name}`} accept="image/jpeg,image/png,image/webp,application/pdf"/><p className="mt-2 text-sm text-slate-600">JPEG, PNG, WebP ou PDF · até 10 MB. Sem novo arquivo, a evidência salva é mantida.</p></div>)}</div>
  <div><label htmlFor="nc-observacao_cq" className="block font-semibold">Observação CQ</label><textarea id="nc-observacao_cq" className="input mt-2" name="observacao_cq" value={texts.observacao_cq} onChange={event=>setTexts(previous=>({...previous,observacao_cq:event.target.value}))} rows={3} maxLength={4000}/></div>
  <p className="text-sm text-slate-600">Fechamento: encaminhar para Aguardando CQ; preencher ação imediata, responsável ativo e observação CQ. Cancelamento exige justificativa. Encerramento é definitivo e mantém histórico.</p>
 </QualityForm>;
}
