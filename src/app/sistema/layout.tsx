import { requireActiveProfile } from "@/lib/auth/session";
import { AuthenticatedShell } from "@/components/authenticated-shell";
export default async function SystemLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireActiveProfile();
  return <AuthenticatedShell profile={profile}>{children}</AuthenticatedShell>;
}
