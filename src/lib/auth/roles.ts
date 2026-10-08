export type AppRole = import("@/types/database").Database["public"]["Enums"]["app_role"];
export const ROLE_LABELS: Record<AppRole, string> = {
  ADMIN: "Administrador", PCP: "PCP", QUALIDADE: "Controle de Qualidade", OPERADOR: "Operador",
};
