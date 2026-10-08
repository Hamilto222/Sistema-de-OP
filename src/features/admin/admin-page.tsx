import { SuccessNotice } from "@/components/ui/notice";
import Link from "next/link";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { Badge, DataTable, EmptyState, ErrorMessage, Field, Pagination } from "@/components/ui/admin-ui";
import { DeactivateConfirmation } from "@/components/ui/confirmation";
import { RecordForm, type Option } from "./record-form";
import type { AdminKind, ChecklistItemInput } from "./schemas";
import type { Database, Json } from "@/types/database";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const titles: Record<AdminKind, string> = { usuarios: "Usuários", linhas: "Linhas de produção", produtos: "Produtos", checklists: "Modelos de checklist" };
const tables = { usuarios: "profiles", linhas: "production_lines", produtos: "products", checklists: "checklist_templates" } as const;
type Row = Database["public"]["Tables"][typeof tables[AdminKind]]["Row"];
const str = (row: Row, key: string) => String((row as unknown as Record<string, unknown>)[key] ?? "");
const bool = (row: Row, key: string) => !!(row as unknown as Record<string, unknown>)[key];
function config(value: Json, type: string): ChecklistItemInput["configuracao"] {
  const obj = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return type === "BOOLEAN" ? { resposta_conforme: typeof obj.resposta_conforme === "boolean" ? obj.resposta_conforme : true } : type === "SELECT" ? {
    opcoes: Array.isArray(obj.opcoes) ? obj.opcoes.filter((v): v is string => typeof v === "string") : [],
    ...(Array.isArray(obj.opcoes_conformes) ? { opcoes_conformes: obj.opcoes_conformes.filter((v): v is string => typeof v === "string") } : {}),
  } : {};
}
export async function AdminPage({ kind, searchParams }: { kind: AdminKind; searchParams: SearchParams }) {
  const { supabase, user } = await requireRole(["ADMIN"]);
  const params = await searchParams;
  const param = (key: string) => typeof params[key] === "string" ? params[key] as string : "";
  const query = param("q").trim().slice(0, 100);
  const page = Math.max(1, Math.min(10000, Number.parseInt(param("pagina"), 10) || 1));
  const fields = kind === "usuarios" ? ["nome", "email"] : kind === "produtos" ? ["codigo", "descricao"] : ["nome"];
  const column = fields.includes(param("campo")) ? param("campo") : fields[0];
  let request = supabase.from(tables[kind]).select("*", { count: "exact" });
  if (query) request = request.ilike(column, `%${query.replace(/[\\%_]/g, "\\$&")}%`);
  const result = await request.order(kind === "produtos" ? "codigo" : "nome").order("id").range((page - 1) * 20, page * 20 - 1);
  if (result.error) throw new Error("Falha ao consultar os cadastros.");
  // Load complete lookup sets in batches; do not silently truncate Supabase's default 1000 rows.
  async function loadOptions(table: "production_lines" | "checklist_templates"): Promise<Option[]> {
    const all: Option[] = [];
    for (let offset = 0; ; offset += 1000) {
      const response = await supabase.from(table).select("*").order("nome").order("id").range(offset, offset + 999);
      if (response.error) throw new Error("Falha ao consultar vínculos.");
      all.push(...response.data.map(row => ({ id: row.id, label: `${row.nome}${"revisao" in row ? ` · Rev. ${row.revisao}` : ""}${("ativa" in row ? row.ativa : row.ativo) ? "" : " (inativo)"}` })));
      if (response.data.length < 1000) break;
    }
    return all;
  }
  const [lines, templates] = await Promise.all([
    kind === "usuarios" ? loadOptions("production_lines") : Promise.resolve([]),
    kind === "produtos" ? loadOptions("checklist_templates") : Promise.resolve([]),
  ]);
  const editing = param("editar"), mode = param("modo");
  const showForm = !!editing || (param("novo") === "1" && kind !== "usuarios");
  let record: Row | null = null;
  let formError: string | undefined;
  let items: ChecklistItemInput[] = [];
  if (editing) {
    if (!z.uuid().safeParse(editing).success) formError = "Cadastro inválido.";
    else {
      const response = await supabase.from(tables[kind]).select("*").eq("id", editing).maybeSingle();
      if (response.error) throw new Error("Falha ao carregar o cadastro.");
      record = response.data;
      if (!record) formError = "Cadastro não encontrado.";
      if (record && kind === "checklists") {
        const response = await supabase.from("checklist_template_items").select("*").eq("template_id", editing).eq("ativo", true).order("ordem");
        if (response.error) throw new Error("Falha ao carregar itens.");
        items = response.data.map(item => ({ ordem: item.ordem, grupo: item.grupo, item: item.item, descricao: item.descricao, tipo_resposta: item.tipo_resposta, unidade: item.unidade, valor_minimo: item.valor_minimo, valor_maximo: item.valor_maximo, obrigatorio: item.obrigatorio, momento: item.momento, requer_revisao_cq: item.requer_revisao_cq, bloqueia_op_se_nao_conforme: item.bloqueia_op_se_nao_conforme, configuracao: config(item.configuracao, item.tipo_resposta) }));
      }
    }
  }
  const lineName = (id: string) => lines.find(line => line.id === id)?.label || "Sem linha";
  const templateName = (id: string) => templates.find(template => template.id === id)?.label || "Sem modelo";
  const link = (row: Row, action?: string) => `/admin/${kind}?${new URLSearchParams({ editar: row.id, ...(action ? { modo: action } : {}) })}`;
  const rows = result.data;
  return <div className="mx-auto max-w-7xl space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-4"><div><p className="mb-1 text-sm text-slate-600">Administração</p><h1 className="text-2xl font-bold text-blue-950">{titles[kind]}</h1></div>{kind !== "usuarios" && <Link className="button-primary" href={`/admin/${kind}?novo=1`}>Novo {kind === "linhas" ? "cadastro de linha" : kind === "produtos" ? "produto" : "modelo"}</Link>}</div>
    {["salvo", "desativado"].includes(param("sucesso")) && <SuccessNotice identity={{success:param("sucesso")}}>Cadastro {param("sucesso") === "salvo" ? "salvo" : "desativado"} com sucesso.</SuccessNotice>}
    {formError ? <ErrorMessage>{formError}</ErrorMessage> : showForm && <RecordForm key={`${editing}-${mode}`} kind={kind} record={record as Record<string, unknown> | null} lines={lines} templates={templates} items={items} mode={mode} self={record?.id === user.id} />}
    <form method="get" className="flex flex-wrap items-end gap-3">
      <div className="min-w-52 flex-1"><Field name="q" label="Pesquisa" defaultValue={query} maxLength={100} placeholder="Digite para pesquisar" /></div>
      {fields.length > 1 && <Field name="campo" label="Pesquisar por"><select name="campo" id="campo" className="input" defaultValue={column}>{fields.map(field => <option key={field} value={field}>{({ nome: "Nome", email: "E-mail", codigo: "Código", descricao: "Descrição" } as Record<string, string>)[field]}</option>)}</select></Field>}
      <button type="submit" className="button-primary">Pesquisar</button><Link href={`/admin/${kind}`} className="button-secondary">Limpar</Link>
    </form>
    {!rows.length ? <EmptyState>Nenhum cadastro encontrado. Ajuste a pesquisa ou cadastre um registro.</EmptyState> : <DataTable columns={kind === "usuarios" ? ["Nome / E-mail", "Perfil", "Linha padrão", "Reabrir OP", "Status", "Ações"] : kind === "linhas" ? ["Nome", "Setor", "Descrição", "Status", "Ações"] : kind === "produtos" ? ["Código / Revisão", "Descrição", "Unidade", "Modelo de checklist", "Status", "Ações"] : ["Nome", "Revisão", "Descrição", "Status", "Ações"]}>
      {rows.map(row => <tr key={row.id}>
        {kind === "usuarios" && <><td><p className="font-semibold">{str(row, "nome")}</p><p className="text-slate-600">{str(row, "email")}</p></td><td>{ROLE_LABELS[str(row, "role") as keyof typeof ROLE_LABELS]}</td><td>{lineName(str(row, "production_line_id"))}</td><td>{bool(row, "can_reopen_orders") ? "Permitido" : "Não permitido"}</td></>}
        {kind === "linhas" && <><td className="font-semibold">{str(row, "nome")}</td><td>{str(row, "setor")}</td><td className="max-w-sm break-words">{str(row, "descricao") || "—"}</td></>}
        {kind === "produtos" && <><td><p className="font-semibold">{str(row, "codigo")}</p><p>Rev. {str(row, "revisao")}</p></td><td className="max-w-sm break-words">{str(row, "descricao")}</td><td>{str(row, "unidade")}</td><td>{templateName(str(row, "checklist_template_id"))}</td></>}
        {kind === "checklists" && <><td className="font-semibold">{str(row, "nome")}</td><td>{str(row, "revisao")}</td><td className="max-w-sm break-words">{str(row, "descricao") || "—"}</td></>}
        <td><Badge active={bool(row, kind === "linhas" ? "ativa" : "ativo")} /></td>
        <td><div className="flex min-w-40 flex-wrap gap-2"><Link className="button-secondary" href={link(row)}>Editar</Link>{kind === "checklists" && <><Link className="button-secondary" href={link(row, "duplicar")}>Duplicar</Link><Link className="button-secondary" href={link(row, "revisao")}>Nova revisão</Link></>}
          {row.id !== user.id && bool(row, kind === "linhas" ? "ativa" : "ativo") && <DeactivateConfirmation kind={kind} id={row.id} stamp={row.updated_at} label={str(row, kind === "produtos" ? "codigo" : "nome")} />}
        </div></td>
      </tr>)}
    </DataTable>}
    <Pagination page={page} count={result.count || 0} query={query} column={column} />
  </div>;
}
