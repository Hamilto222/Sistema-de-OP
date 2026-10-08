import { requireRole } from "@/lib/auth/session";
import { AuthenticatedShell } from "@/components/authenticated-shell";
export default async function QualityLayout({children}:{children:React.ReactNode}){const {profile}=await requireRole(["ADMIN","QUALIDADE"]);return <AuthenticatedShell profile={profile}>{children}</AuthenticatedShell>;}
