import type { Database } from "@/types/database";
export type OrderStatus = Database["public"]["Enums"]["order_status"];
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  DRAFT: "Rascunho", PREPARING: "Preparando", RELEASED: "Liberada", IN_PRODUCTION: "Em produção", BLOCKED_QUALITY: "Bloqueada CQ",
  AWAITING_QUALITY: "Aguardando CQ", AWAITING_PCP: "Aguardando PCP", FINALIZED: "Finalizada", REOPENED: "Reaberta", CANCELLED: "Cancelada",
};
export const PRIORITY_LABELS = { BAIXA: "Baixa", NORMAL: "Normal", ALTA: "Alta", URGENTE: "Urgente" };
export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const color = status === "BLOCKED_QUALITY" || status === "CANCELLED" ? "bg-red-100 text-red-900" : status === "FINALIZED" ? "bg-green-100 text-green-900" : status === "AWAITING_QUALITY" || status === "AWAITING_PCP" || status === "PREPARING" ? "bg-yellow-100 text-yellow-900" : status === "DRAFT" ? "bg-slate-200 text-slate-800" : "bg-blue-100 text-blue-900";
  return <span className={`inline-flex whitespace-nowrap rounded-full px-3 py-1 text-sm font-semibold ${color}`}>{ORDER_STATUS_LABELS[status]}</span>;
}
