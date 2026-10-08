import { requireRole } from "@/lib/auth/session";
import { AuthenticatedShell } from "@/components/authenticated-shell";
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireRole(["ADMIN"]);
  return <AuthenticatedShell profile={profile}>{children}</AuthenticatedShell>;
}
