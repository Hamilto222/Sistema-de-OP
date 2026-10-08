/** Configuração opcional do servidor; o nome confirmado pelo PCP integra o snapshot. */
export const DEFAULT_COMPANY_NAME = "Inkor Industria Catarinense de Colas e Rejuntes";

export function defaultCompanyName() {
  return process.env.OP_DIGITAL_COMPANY_NAME?.trim() || DEFAULT_COMPANY_NAME;
}
