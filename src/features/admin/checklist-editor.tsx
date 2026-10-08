"use client";
import { useState } from "react";
import type { ChecklistItemInput } from "./schemas";

function blank(order: number): ChecklistItemInput {
  return { ordem: order, grupo: null, item: "", descricao: null, tipo_resposta: "BOOLEAN", unidade: null, valor_minimo: null, valor_maximo: null, obrigatorio: true, momento: "DURANTE", requer_revisao_cq: true, bloqueia_op_se_nao_conforme: true, configuracao: { resposta_conforme: true } };
}
export function ChecklistEditor({ initialItems }: { initialItems: ChecklistItemInput[] }) {
  const [items, setItems] = useState(initialItems.length ? initialItems : [blank(1)]);
  const update = (index: number, patch: Partial<ChecklistItemInput>) => setItems(current => current.map((item, i) => i === index ? { ...item, ...patch } : item));
  return <div className="space-y-4"><h3 className="text-lg font-bold">Itens do checklist</h3><p className="text-sm text-slate-600">As alterações valem para o modelo. As cópias existentes nas OPs mantêm suas definições.</p><input type="hidden" name="itens" value={JSON.stringify(items)} />
    {items.map((item, index) => {
      const prefix = `item-${index}`;
      const input = (key: "item" | "grupo" | "descricao" | "unidade", label: string, required = false, max = 160) => <div><label htmlFor={`${prefix}-${key}`} className="mb-2 block text-sm font-semibold">{label}</label><input className="input" id={`${prefix}-${key}`} required={required} maxLength={max} value={item[key] || ""} onChange={event => update(index, { [key]: event.target.value || null })} /></div>;
      const check = (key: "obrigatorio" | "requer_revisao_cq" | "bloqueia_op_se_nao_conforme", label: string) => <label className="flex min-h-12 items-center gap-3"><input type="checkbox" className="size-5" checked={item[key]} onChange={event => update(index, { [key]: event.target.checked })} />{label}</label>;
      return <fieldset key={index} className="rounded-lg border border-slate-300 p-4"><legend className="px-2 font-bold">Item {index + 1}</legend>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div><label className="mb-2 block text-sm font-semibold" htmlFor={`${prefix}-ordem`}>Ordem</label><input id={`${prefix}-ordem`} className="input" type="number" min={1} max={10000} required value={item.ordem} onChange={event => update(index, { ordem: Number(event.target.value) })} /></div>
          {input("grupo", "Grupo")}{input("item", "Item", true, 500)}{input("descricao", "Descrição / instrução", false, 2000)}
          <div><label htmlFor={`${prefix}-tipo`} className="mb-2 block text-sm font-semibold">Tipo da resposta</label><select className="input" id={`${prefix}-tipo`} value={item.tipo_resposta} onChange={event => { const type = event.target.value as ChecklistItemInput["tipo_resposta"]; update(index, { tipo_resposta: type, valor_minimo: null, valor_maximo: null, configuracao: type === "BOOLEAN" ? { resposta_conforme: true } : type === "SELECT" ? { opcoes: [] } : {} }); }}>
            <option value="BOOLEAN">Sim / Não</option><option value="NUMBER">Número</option><option value="TEXT">Texto</option><option value="PHOTO">Foto</option><option value="SELECT">Seleção</option>
          </select></div>
          <div><label htmlFor={`${prefix}-momento`} className="mb-2 block text-sm font-semibold">Momento</label><select className="input" id={`${prefix}-momento`} value={item.momento} onChange={event => update(index, { momento: event.target.value as ChecklistItemInput["momento"] })}><option value="ANTES">Antes da produção</option><option value="DURANTE">Durante a produção</option><option value="DEPOIS">Depois da produção</option></select></div>
          {input("unidade", "Unidade", false, 20)}
          {item.tipo_resposta === "NUMBER" && (["valor_minimo", "valor_maximo"] as const).map(key => <div key={key}><label className="mb-2 block text-sm font-semibold" htmlFor={`${prefix}-${key}`}>{key === "valor_minimo" ? "Mínimo" : "Máximo"}</label><input className="input" id={`${prefix}-${key}`} type="number" step="any" value={item[key] ?? ""} onChange={event => update(index, { [key]: event.target.value === "" ? null : Number(event.target.value) })} /></div>)}
          {item.tipo_resposta === "BOOLEAN" && <div><label className="mb-2 block text-sm font-semibold" htmlFor={`${prefix}-conforme`}>Resposta conforme</label><select className="input" id={`${prefix}-conforme`} value={String(item.configuracao.resposta_conforme ?? true)} onChange={event => update(index, { configuracao: { resposta_conforme: event.target.value === "true" } })}><option value="true">Sim</option><option value="false">Não</option></select></div>}
          {item.tipo_resposta === "SELECT" && <div className="md:col-span-2"><label className="mb-2 block text-sm font-semibold" htmlFor={`${prefix}-opcoes`}>Opções (uma por linha)</label><textarea className="input" id={`${prefix}-opcoes`} rows={4} maxLength={16100} required value={item.configuracao.opcoes?.join("\n") || ""} onChange={event => update(index, { configuracao: { ...item.configuracao, opcoes: event.target.value.split("\n") } })} />
            <label className="mb-2 mt-3 block text-sm font-semibold" htmlFor={`${prefix}-opcoes-conformes`}>Opções conformes (uma por linha; vazio = todas)</label><textarea className="input" id={`${prefix}-opcoes-conformes`} rows={3} maxLength={16100} value={item.configuracao.opcoes_conformes?.join("\n") || ""} onChange={event => update(index, { configuracao: { ...item.configuracao, opcoes_conformes: event.target.value.trim() ? event.target.value.split("\n") : undefined } })} /></div>}
          {check("obrigatorio", "Obrigatório")}{check("requer_revisao_cq", "Requer revisão do CQ")}{check("bloqueia_op_se_nao_conforme", "Bloqueia OP quando não conforme")}
        </div><button className="button-secondary mt-4 text-red-800" type="button" disabled={items.length === 1} onClick={() => setItems(current => current.filter((_, i) => i !== index))}>Remover item {index + 1}</button>
      </fieldset>;
    })}
    <button type="button" className="button-secondary" disabled={items.length >= 100} onClick={() => setItems(current => [...current, blank(Math.max(...current.map(item => item.ordem), 0) + 1)])}>Adicionar item</button>
  </div>;
}
