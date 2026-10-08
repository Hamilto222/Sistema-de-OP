"use client";
import Link from "next/link";
import { useActionState } from "react";
import { saveRecord } from "./actions";
import { emptyActionState, type AdminKind, type ChecklistItemInput } from "./schemas";
import { Field, FormErrors, Toggle } from "@/components/ui/admin-ui";
import { ChecklistEditor } from "./checklist-editor";
import { ROLE_LABELS } from "@/lib/auth/roles";
export type Option = { id: string; label: string };
export function RecordForm({ kind, record, lines, templates, items = [], mode, self = false }: {
  kind: AdminKind; record: Record<string, unknown> | null; lines: Option[]; templates: Option[];
  items?: ChecklistItemInput[]; mode?: string; self?: boolean;
}) {
  const [state, action, pending] = useActionState(saveRecord.bind(null, kind), emptyActionState);
  const copy = mode === "duplicar" || mode === "revisao";
  const value = (name: string, fallback = "") => typeof record?.[name] === "string" ? record[name] as string : fallback;
  const active = (name: string) => copy ? true : record ? !!record[name] : true;
  const field = (name: string, label: string, maxLength: number, fallback = "") => <Field name={name} label={label} required maxLength={maxLength} defaultValue={value(name, fallback)} error={state.fields?.[name]} />;
  const description = <Field label="Descrição" name="descricao"><textarea id="descricao" name="descricao" className="input" rows={3} maxLength={2000} defaultValue={value("descricao")} /></Field>;
  const options = (name: string, label: string, choices: Option[]) => <Field name={name} label={label}><select className="input" name={name} id={name} defaultValue={value(name)}><option value="">Sem vínculo</option>{choices.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></Field>;
  return <section className="mb-8 rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
    <h2 className="mb-6 text-xl font-bold text-blue-950">{copy ? mode === "revisao" ? "Criar nova revisão" : "Duplicar modelo" : record ? "Editar cadastro" : "Novo cadastro"}</h2>
    {kind === "usuarios" && <p className="mb-4 text-sm text-slate-600">Edite somente o perfil. E-mail e senha são gerenciados pelo Supabase Auth. Novos usuários devem ser provisionados pelo Auth.</p>}
    {copy && <p className="mb-4 text-sm text-slate-600">Será criado um modelo independente. Informe {mode === "revisao" ? "uma nova revisão" : "outro nome ou revisão"}. A origem e os checklists das OPs serão preservados.</p>}
    <form action={action} className="space-y-6">
      <input type="hidden" name="id" value={copy ? "" : value("id")} /><input type="hidden" name="updated_at" value={copy ? "" : value("updated_at")} />
      <FormErrors state={state} />
      <div className="grid gap-5 md:grid-cols-2">
        {kind === "usuarios" && <>
          {field("nome", "Nome", 160)}<Field label="E-mail (Supabase Auth)" name="email" defaultValue={value("email")} readOnly />
          <Field label="Perfil" name="role"><select id="role" name="role" className="input" defaultValue={value("role", "OPERADOR")}>{Object.entries(ROLE_LABELS).map(([role, label]) => <option key={role} value={role} disabled={self && role !== "ADMIN"}>{label}</option>)}</select></Field>
          {options("production_line_id", "Linha padrão", lines)}<Toggle name="ativo" label="Usuário ativo" checked={active("ativo")} />
          <Toggle name="can_reopen_orders" label="Permitir reabertura de OP" checked={active("can_reopen_orders")} />
          {self && <p className="text-sm text-slate-600 md:col-span-2">Seu próprio perfil ADMIN deve permanecer ativo e administrativo.</p>}
        </>}
        {kind === "linhas" && <>{field("nome", "Nome", 160)}{field("setor", "Setor", 160)}{description}<Toggle name="ativa" label="Linha ativa" checked={active("ativa")} /></>}
        {kind === "produtos" && <>{field("codigo", "Código", 80)}{field("descricao", "Descrição", 1000)}{field("unidade", "Unidade", 20)}{field("revisao", "Revisão", 40, "01")}{options("checklist_template_id", "Modelo de checklist", templates)}<Toggle name="ativo" label="Produto ativo" checked={active("ativo")} /></>}
        {kind === "checklists" && <>
          <Field name="nome" label="Nome" required maxLength={160} defaultValue={copy && mode === "duplicar" ? `${value("nome")} (cópia)` : value("nome")} error={state.fields?.nome} />
          <Field name="revisao" label="Revisão" required maxLength={40} defaultValue={mode === "revisao" ? "" : value("revisao", "01")} error={state.fields?.revisao} />{description}<Toggle name="ativo" label="Modelo ativo" checked={active("ativo")} />
        </>}
      </div>
      {kind === "checklists" && <ChecklistEditor initialItems={items} />}
      <div className="flex flex-wrap gap-3"><button type="submit" disabled={pending} className="button-primary">{pending ? "Salvando…" : "Salvar"}</button><Link href={`/admin/${kind}`} className="button-secondary">Cancelar</Link></div>
    </form>
  </section>;
}
