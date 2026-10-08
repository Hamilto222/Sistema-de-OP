import { z } from "zod";
z.config(z.locales.ptBR());
export const PDF_MAX_BYTES = 20 * 1024 * 1024;
export const orderSchema = z.object({
  numero_op: z.string().trim().min(1, "Informe o número da OP.").max(80),
  produto_id: z.uuid(), lote: z.string().trim().min(1, "Informe o lote.").max(160), linha_id: z.uuid(),
  quantidade_planejada: z.coerce.number().positive("A quantidade deve ser maior que zero.").finite(),
  unidade: z.string().trim().min(1).max(20), prioridade: z.enum(["BAIXA", "NORMAL", "ALTA", "URGENTE"]),
  data_hora_programada: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Informe data e hora válidas.").refine(value => {
    const date = new Date(`${value}:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 16) === value;
  }, "Data ou horário inexistente."),
  operador_responsavel_id: z.uuid().nullable(),
});
export const orderActionSchema = z.object({ id: z.uuid(), version: z.coerce.number().int().positive() });
export type PcpState = { error?: string; fields?: Record<string, string>; draftId?: string };
export const initialPcpState: PcpState = {};
export const filtersSchema = z.object({
  inicio: z.iso.date().optional(), fim: z.iso.date().optional(), linha: z.uuid().optional(), produto: z.uuid().optional(), operador: z.uuid().optional(),
  status: z.enum(["DRAFT", "PREPARING", "RELEASED", "IN_PRODUCTION", "BLOCKED_QUALITY", "AWAITING_QUALITY", "AWAITING_PCP", "FINALIZED", "REOPENED", "CANCELLED"]).optional(),
  q: z.string().trim().max(100).default(""), pagina: z.coerce.number().int().min(1).max(10000).default(1),
}).refine(data => !data.inicio || !data.fim || data.inicio <= data.fim, { message: "O início do período deve ser anterior ou igual ao fim.", path: ["fim"] });
