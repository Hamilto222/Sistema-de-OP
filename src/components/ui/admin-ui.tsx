import Link from "next/link";
import type { ActionState } from "@/features/admin/schemas";
export function Badge({ active }: { active: boolean }) {
  return <span className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ${active ? "bg-green-100 text-green-900" : "bg-slate-200 text-slate-700"}`}>{active ? "Ativo" : "Inativo"}</span>;
}
export function EmptyState({ children }: { children: React.ReactNode }) { return <p className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">{children}</p>; }
export function LoadingState() { return <p role="status" className="p-8 text-slate-600">Carregando dados…</p>; }
export function ErrorMessage({ children }: { children: React.ReactNode }) { return <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-900">{children}</p>; }
export function FormErrors({ state }: { state: ActionState }) {
  if (!state.error) return null;
  return <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-900"><p>{state.error}</p>{state.fields && <ul className="mt-2 list-disc pl-5">{Object.entries(state.fields).map(([key, value]) => <li key={key}>{key.startsWith("itens.") ? `Item ${Number(key.split(".")[1]) + 1}: ` : ""}{value}</li>)}</ul>}</div>;
}
export function Field({ label, name, error, children, ...props }: { label: string; name: string; error?: string; children?: React.ReactNode } & React.InputHTMLAttributes<HTMLInputElement>) {
  return <div><label htmlFor={name} className="mb-2 block text-sm font-semibold">{label}</label>{children || <input id={name} name={name} className="input" aria-invalid={!!error} aria-describedby={error ? `${name}-error` : undefined} {...props} />}{error && <p id={`${name}-error`} className="mt-1 text-sm text-red-800">{error}</p>}</div>;
}
export function Toggle({ name, label, checked = true, disabled = false }: { name: string; label: string; checked?: boolean; disabled?: boolean }) {
  return <label className="flex min-h-12 items-center gap-3"><input type="checkbox" name={name} defaultChecked={checked} disabled={disabled} className="size-5" />{label}</label>;
}
export function DataTable({ columns, children }: { columns: string[]; children: React.ReactNode }) {
  return <div tabIndex={0} role="region" aria-label="Tabela de registros, role horizontalmente para mais colunas" className="table-scroll overflow-x-auto rounded-lg border border-slate-200 bg-white"><table className="w-full text-left text-sm"><thead className="bg-slate-100 text-slate-700"><tr>{columns.map(name => <th key={name} scope="col" className="whitespace-nowrap px-4 py-4 font-semibold">{name}</th>)}</tr></thead><tbody className="divide-y divide-slate-200">{children}</tbody></table></div>;
}
export function Pagination({ page, count, query, column }: { page: number; count: number; query: string; column: string }) {
  const pages = Math.max(1, Math.ceil(count / 20));
  const href = (value: number) => `?${new URLSearchParams({ q: query, campo: column, pagina: String(value) })}`;
  return <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm"><p>{count} registros · Página {page} de {pages}</p><div className="flex gap-2">{page > 1 && <Link className="button-secondary" href={href(page - 1)}>Anterior</Link>}{page < pages && <Link className="button-secondary" href={href(page + 1)}>Próxima</Link>}</div></div>;
}
