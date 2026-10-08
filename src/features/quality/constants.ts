import type { Database } from "@/types/database";
export const NC_STATUS_LABELS: Record<Database["public"]["Enums"]["nc_status"], string> = { OPEN: "Aberta", IN_TREATMENT: "Em tratamento", AWAITING_QUALITY: "Aguardando CQ", CLOSED: "Fechada", CANCELLED: "Cancelada" };
export const SEVERITY_LABELS: Record<Database["public"]["Enums"]["nc_severity"], string> = { LOW: "Baixa", MEDIUM: "Média", HIGH: "Alta", CRITICAL: "Crítica" };
export const DECISION_LABELS = { APPROVED: "Aprovada", REJECTED: "Reprovada" };
