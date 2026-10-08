import { requireRole } from "@/lib/auth/session";
import { AuthenticatedShell } from "@/components/authenticated-shell";
export default async function OperatorLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireRole(["OPERADOR"]);
  return <AuthenticatedShell profile={profile}>{children}</AuthenticatedShell>;
}
