import { z } from "zod";

z.config(z.locales.ptBR());

export const ADMIN_KINDS = ["usuarios", "linhas", "produtos", "checklists"] as const;
export type AdminKind = (typeof ADMIN_KINDS)[number];
const text = (max: number) => z.string().trim().min(1, "Campo obrigatório.").max(max, `Use até ${max} caracteres.`);
const optionalText = (max: number) => z.string().trim().max(max).nullable();
const optionalId = z.uuid().nullable();
const stamp = z.string().datetime({ offset: true });
const identity = { id: optionalId, updated_at: stamp.nullable() };
export const profileSchema = z.object({
  ...identity, id: z.uuid(), nome: text(160), role: z.enum(["ADMIN", "PCP", "QUALIDADE", "OPERADOR"]),
  production_line_id: optionalId, ativo: z.boolean(), can_reopen_orders: z.boolean(),
});
export const lineSchema = z.object({ ...identity, nome: text(160), setor: text(160), descricao: optionalText(2000), ativa: z.boolean() });
export const productSchema = z.object({ ...identity, codigo: text(80), descricao: text(1000), unidade: text(20), revisao: text(40), checklist_template_id: optionalId, ativo: z.boolean() });
export const itemSchema = z.object({
  ordem: z.number().int().min(1).max(10000), grupo: optionalText(160), item: text(500), descricao: optionalText(2000),
  tipo_resposta: z.enum(["BOOLEAN", "NUMBER", "TEXT", "PHOTO", "SELECT"]), unidade: optionalText(20),
  valor_minimo: z.number().finite().nullable(), valor_maximo: z.number().finite().nullable(),
  obrigatorio: z.boolean(), momento: z.enum(["ANTES", "DURANTE", "DEPOIS"]), requer_revisao_cq: z.boolean(), bloqueia_op_se_nao_conforme: z.boolean(),
  configuracao: z.object({ resposta_conforme: z.boolean().optional(), opcoes: z.array(text(160)).max(100).optional(), opcoes_conformes: z.array(text(160)).max(100).optional() }),
}).superRefine((item, ctx) => {
  const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
  if (item.tipo_resposta === "NUMBER" && item.valor_minimo !== null && item.valor_maximo !== null && item.valor_minimo > item.valor_maximo) issue("valor_maximo", "Máximo deve ser maior ou igual ao mínimo.");
  if (item.tipo_resposta !== "NUMBER" && (item.valor_minimo !== null || item.valor_maximo !== null)) issue("valor_minimo", "Limites são exclusivos de respostas numéricas.");
  if (item.tipo_resposta === "SELECT") {
    const options = item.configuracao.opcoes || [];
    if (!options.length || new Set(options).size !== options.length) issue("configuracao", "Informe opções não vazias e sem repetição.");
    if (item.configuracao.opcoes_conformes?.some(value => !options.includes(value))) issue("configuracao", "Toda opção conforme deve constar nas opções.");
  }
  if (item.tipo_resposta === "BOOLEAN" && item.configuracao.resposta_conforme === undefined) issue("configuracao", "Informe a resposta conforme.");
});
export const templateSchema = z.object({ ...identity, nome: text(160), revisao: text(40), descricao: optionalText(2000), ativo: z.boolean(), itens: z.array(itemSchema).min(1, "Adicione ao menos um item.").max(100) }).superRefine((template, ctx) => {
  if (new Set(template.itens.map(item => item.ordem)).size !== template.itens.length) ctx.addIssue({ code: "custom", path: ["itens"], message: "A ordem dos itens não pode se repetir." });
});
export type ChecklistItemInput = z.infer<typeof itemSchema>;
export type ActionState = { error?: string; fields?: Record<string, string> };
export const emptyActionState: ActionState = {};
export function validateKind(value: string): AdminKind {
  return z.enum(ADMIN_KINDS).parse(value);
}
