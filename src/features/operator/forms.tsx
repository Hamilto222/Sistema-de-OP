"use client";
import { SuccessNotice } from "@/components/ui/notice";
import { useActionState, useId, useState, startTransition } from "react";
import { useRouter } from "next/navigation";
import { FormErrors } from "@/components/ui/admin-ui";
import { useFormDraft } from "@/hooks/use-form-draft";
import { addNote, finishOrder, saveMeasure, startOrder } from "./actions";
import { NOTE_TYPES, type OperatorState } from "./schemas";
import type { Database } from "@/types/database";
type Item = Database["public"]["Tables"]["production_order_checklist"]["Row"];
type Action = (state: OperatorState, form: FormData) => Promise<OperatorState>;
function Recovery({ draft }: { draft: ReturnType<typeof useFormDraft> }) {
  return draft.recovery && <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4"><p>Há um rascunho temporário deste formulário. Ele ainda não foi salvo no sistema. Fotos devem ser selecionadas novamente.</p><div className="flex flex-wrap gap-3"><button type="button" className="button-secondary" onClick={draft.restore}>Restaurar rascunho</button><button type="button" className="button-secondary" onClick={draft.clear}>Descartar rascunho</button></div></div>;
}
function TabletForm({ action, draftKey, initial, hidden, submit, children, onSuccess }: { action: Action; draftKey: string; initial: Record<string,string>; hidden: Record<string,string>; submit: string; children: (draft: ReturnType<typeof useFormDraft>) => React.ReactNode; onSuccess?: () => void }) {
  const draft = useFormDraft(draftKey, initial);
  const router = useRouter();
  const [state, dispatch, pending] = useActionState(async (previous: OperatorState, form: FormData) => {
    const result = await action(previous, form);
    // Clear before applying refreshed server snapshots, which can unmount this form.
    if (result.success) { draft.clear(); onSuccess?.(); router.refresh(); }
    return result;
  }, {});
  return <form className="space-y-5" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); startTransition(() => dispatch(form)); }}>
    {Object.entries(hidden).map(([name,value]) => <input key={name} name={name} value={value} type="hidden" />)}
    <Recovery draft={draft} /><fieldset disabled={pending} className="space-y-5">{children(draft)}<button className="button-primary min-h-14 w-full text-lg sm:w-auto" type="submit">{pending ? "Salvando… Aguarde" : submit}</button></fieldset>
    <FormErrors state={state} />{state.success && <SuccessNotice identity={state}>{state.success}</SuccessNotice>}
  </form>;
}
function Input({ draft, name, label, type = "text", required = false }: { draft: ReturnType<typeof useFormDraft>; name: string; label: string; type?: string; required?: boolean }) {
  return <label className="block space-y-2"><span className="block font-semibold">{label}</span><input name={name} value={draft.values[name] || ""} onChange={event => draft.update(name,event.target.value)} type={type} required={required} min={type === "number" ? 0 : undefined} step={type === "number" ? "any" : undefined} inputMode={type === "number" ? "decimal" : undefined} maxLength={type === "text" ? 20 : undefined} className="input min-h-14 text-lg" /></label>;
}
function TextArea({ draft, name, label, required = false }: { draft: ReturnType<typeof useFormDraft>; name: string; label: string; required?: boolean }) {
  return <label className="block space-y-2"><span className="block font-semibold">{label}</span><textarea className="input min-h-28 text-lg" rows={3} name={name} value={draft.values[name] || ""} onChange={event => draft.update(name,event.target.value)} required={required} maxLength={4000} /></label>;
}
function PhotoInput({ draft, required }: { draft: ReturnType<typeof useFormDraft>; required?: boolean }) {
  return <label className="block space-y-2"><span className="block font-semibold">Foto {required ? "(obrigatória)" : "(opcional)"}</span><input name="foto_path" type="hidden" value={draft.values.foto_path || ""} /><input name="foto" type="file" accept="image/jpeg,image/png,image/webp" required={required && !draft.values.foto_path} className="input min-h-14 max-w-full" onChange={draft.markDirty} /><span className="block text-sm text-slate-600">JPEG, PNG ou WebP · até 10 MB. {draft.values.foto_path ? "A evidência salva será mantida se nenhuma nova foto for selecionada." : ""}</span></label>;
}
export function StartForm({ id, version }: { id: string; version: number }) {
  return <TabletForm action={startOrder} draftKey={`start:${id}`} initial={{}} hidden={{id,version:String(version)}} submit="INICIAR PRODUÇÃO">{() => <p>Confirme o início para preencher o checklist e registrar apontamentos.</p>}</TabletForm>;
}
export function MeasureForm({ id, userId, item }: { id: string; userId: string; item: Item }) {
  const responseId = useId();
  const config = item.configuracao as { opcoes?: string[] };
  const initial = { valor: item.valor_numero?.toString() ?? item.resposta_boolean?.toString() ?? item.resposta_texto ?? item.resposta_select ?? "", observacao: item.observacao || "", foto_path: item.foto_path || "" };
  return <TabletForm action={saveMeasure} draftKey={`${userId}:${id}:${item.id}:${item.updated_at}`} initial={initial} hidden={{id,item_id:item.id,updated_at:item.updated_at}} submit={item.data_medicao?"Registrar nova medição":"Salvar medição"}>{draft => <>
    {item.tipo_resposta === "NUMBER" && <label className="block space-y-2"><span className="block font-semibold">Valor medido {item.unidade && `(${item.unidade})`}</span><input className="input min-h-14 text-xl" type="number" inputMode="decimal" step="any" name="valor" required value={draft.values.valor} onChange={event => draft.update("valor",event.target.value)} /></label>}
    {item.tipo_resposta === "BOOLEAN" && <fieldset><legend className="mb-3 font-semibold">Resposta</legend><div className="grid grid-cols-2 gap-3">{[["true","Sim"],["false","Não"]].map(([value,label]) => <label key={value} className={`flex min-h-16 cursor-pointer items-center gap-3 rounded-lg border-2 p-4 text-lg ${draft.values.valor === value ? "border-blue-700 bg-blue-50" : "border-slate-200"}`}><input className="size-6" type="radio" name="valor" value={value} checked={draft.values.valor === value} onChange={() => draft.update("valor",value)} required />{label}</label>)}</div></fieldset>}
    {item.tipo_resposta === "SELECT" && <label htmlFor={responseId} className="block space-y-2"><span id={`${responseId}-label`} className="block font-semibold">Resposta</span><select aria-labelledby={`${responseId}-label`} id={responseId} className="input min-h-14 text-lg" name="valor" required value={draft.values.valor} onChange={event => draft.update("valor",event.target.value)}><option value="">Selecione uma opção</option>{config?.opcoes?.map(option => <option key={option}>{option}</option>)}</select></label>}
    {item.tipo_resposta === "TEXT" && <TextArea draft={draft} name="valor" label="Resposta textual" required />}
    {item.tipo_resposta === "PHOTO" && <input type="hidden" name="valor" value="" />}
    <TextArea draft={draft} name="observacao" label="Observação (obrigatória se não conforme)" />
    <PhotoInput draft={draft} required={item.tipo_resposta === "PHOTO"} />
    <p className="text-sm text-slate-600">O resultado é confirmado ao salvar. Uma resposta impeditiva não conforme bloqueia a OP para o CQ.</p>
  </>}</TabletForm>;
}
export function NoteForm({ id, userId }: { id: string; userId: string }) {
  const typeId = useId();
  const [open,setOpen] = useState(false); const [revision,setRevision] = useState(0);
  return <div className="space-y-5"><button type="button" className="button-secondary min-h-14 text-lg" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Fechar formulário de apontamento" : "+ Apontamento"}</button><div hidden={!open}><TabletForm key={revision} action={addNote} draftKey={`${userId}:${id}:note`} initial={{tipo:"OBSERVACAO",descricao:"",tempo_minutos:"",quantidade:"",unidade:"",foto_path:""}} hidden={{id}} submit="Salvar apontamento" onSuccess={() => { setRevision(value => value + 1); setOpen(false); }}>{draft => <>
    <label htmlFor={typeId} className="block space-y-2"><span id={`${typeId}-label`} className="block font-semibold">Tipo de apontamento</span><select aria-labelledby={`${typeId}-label`} id={typeId} className="input min-h-14 text-lg" name="tipo" value={draft.values.tipo} onChange={event => draft.update("tipo",event.target.value)}>{Object.entries(NOTE_TYPES).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <TextArea draft={draft} name="descricao" label="Descrição" required /><div className="grid gap-5 sm:grid-cols-2"><Input draft={draft} name="tempo_minutos" label="Tempo em minutos (opcional)" type="number" /><Input draft={draft} name="quantidade" label="Quantidade (opcional)" type="number" /><Input draft={draft} name="unidade" label="Unidade (opcional)" /></div><PhotoInput draft={draft} />
  </>}</TabletForm></div></div>;
}
export function FinishForm({ id, userId, version, produced, lost, observation }: { id: string; userId: string; version: number; produced: number | null; lost: number | null; observation: string | null }) {
  return <TabletForm action={finishOrder} draftKey={`${userId}:${id}:finish:${version}`} initial={{quantidade_produzida:produced?.toString() || "",quantidade_perdida:lost?.toString() || "",observacao_final:observation || ""}} hidden={{id,version:String(version)}} submit="ENVIAR AO CONTROLE DE QUALIDADE">{draft => <>
    <div className="grid gap-5 sm:grid-cols-2"><Input draft={draft} name="quantidade_produzida" label="Quantidade produzida" type="number" required /><Input draft={draft} name="quantidade_perdida" label="Quantidade perdida (inclusive zero)" type="number" required /></div><TextArea draft={draft} name="observacao_final" label="Observação final" />
    <p className="text-slate-600">O envio encerra os registros do operador e encaminha a OP para revisão de Qualidade.</p>
  </>}</TabletForm>;
}
