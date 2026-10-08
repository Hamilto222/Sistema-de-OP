"use client";
import Link from "next/link";
import { startTransition, useActionState, useState } from "react";
import { createOrder } from "./actions";
import { initialPcpState } from "./schemas";
import { Field, FormErrors } from "@/components/ui/admin-ui";
import type { PcpLookups } from "./queries";
import { PRIORITY_LABELS } from "@/components/ui/order-status";
export function OrderForm({ products, lines, operators }: PcpLookups) {
  const [state, action, pending] = useActionState(createOrder, initialPcpState);
  const [values, setValues] = useState({ numero_op: "", produto_id: "", lote: "", linha_id: "", quantidade_planejada: "", unidade: "", prioridade: "NORMAL", data_hora_programada: "", operador_responsavel_id: "" });
  const change = (key: keyof typeof values, value: string) => setValues(current => ({ ...current, [key]: value }));
  const ready = products.length > 0 && lines.length > 0;
  return <form onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); startTransition(() => action(form)); }} className="space-y-6 rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
    <FormErrors state={state} />
    {state.draftId && <p className="rounded-lg bg-yellow-50 p-4 text-yellow-900">A OP já foi criada como rascunho. <Link href={`/pcp/ordens/${state.draftId}`} className="font-semibold underline">Abrir rascunho para anexar o PDF</Link>.</p>}
    {!ready && <p role="alert" className="rounded-lg bg-yellow-50 p-4 text-yellow-900">Cadastre produtos e linhas ativos na administração antes de criar uma OP.</p>}
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      <Field name="numero_op" label="Número OP" required maxLength={80} error={state.fields?.numero_op} value={values.numero_op} onChange={event => change("numero_op", event.target.value)} />
      <Field name="produto_id" label="Produto"><select name="produto_id" id="produto_id" required className="input" value={values.produto_id} onChange={event => { const id = event.target.value; setValues(current => ({ ...current, produto_id: id, unidade: products.find(product => product.id === id)?.unidade || "" })); }}><option value="">Selecione o produto</option>{products.map(product => <option key={product.id} value={product.id}>{product.codigo} · {product.descricao} · Rev. {product.revisao}</option>)}</select></Field>
      <Field name="lote" label="Lote" required maxLength={160} error={state.fields?.lote} value={values.lote} onChange={event => change("lote", event.target.value)} />
      <Field name="linha_id" label="Linha"><select name="linha_id" id="linha_id" required className="input" value={values.linha_id} onChange={event => change("linha_id", event.target.value)}><option value="">Selecione a linha</option>{lines.map(line => <option key={line.id} value={line.id}>{line.nome}</option>)}</select></Field>
      <Field name="quantidade_planejada" label="Quantidade planejada" type="number" inputMode="decimal" step="any" min="0" required error={state.fields?.quantidade_planejada} value={values.quantidade_planejada} onChange={event => change("quantidade_planejada", event.target.value)} />
      <Field name="unidade" label="Unidade" required maxLength={20} value={values.unidade} onChange={event => change("unidade", event.target.value)} error={state.fields?.unidade} />
      <Field name="prioridade" label="Prioridade"><select name="prioridade" id="prioridade" value={values.prioridade} onChange={event => change("prioridade", event.target.value)} className="input">{Object.entries(PRIORITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
      <Field name="data_hora_programada" label="Data e hora programadas" type="datetime-local" required error={state.fields?.data_hora_programada} value={values.data_hora_programada} onChange={event => change("data_hora_programada", event.target.value)} />
      <Field name="operador_responsavel_id" label="Operador responsável (opcional)"><select name="operador_responsavel_id" id="operador_responsavel_id" value={values.operador_responsavel_id} onChange={event => change("operador_responsavel_id", event.target.value)} className="input"><option value="">Atribuição por linha</option>{operators.map(operator => <option key={operator.id} value={operator.id}>{operator.nome}</option>)}</select></Field>
    </div>
    <p className="text-sm text-slate-600">Data e hora no fuso America/Sao_Paulo. Sem operador individual, o acesso segue a linha autorizada.</p>
    <Field name="pdf" label="PDF original" type="file" accept="application/pdf,.pdf" required />
    <p className="text-sm text-slate-600">Somente PDF, até 20 MB. O documento será armazenado em bucket privado. A OP será criada como rascunho.</p>
    <div className="flex flex-wrap gap-3"><button className="button-primary" type="submit" disabled={pending || !ready || !!state.draftId}>{pending ? "Criando e enviando PDF…" : "Criar OP"}</button><Link href="/pcp/ordens" className="button-secondary">Cancelar</Link></div>
  </form>;
}
