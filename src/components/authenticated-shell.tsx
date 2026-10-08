import { Breadcrumbs } from "./breadcrumbs";
import Link from "next/link";
import { LogoutButton } from "./logout-button";
import { ROLE_LABELS, type AppRole } from "@/lib/auth/roles";
import { AuthNavigation } from "./auth-navigation";

export function AuthenticatedShell({ profile, children }: { profile: { nome: string; role: AppRole }; children: React.ReactNode }) {
  return <div className="min-h-screen bg-slate-50 text-slate-800">
    <a href="#main-content" className="skip-link">Ir para o conteúdo</a>
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 py-4 lg:px-8">
      <Link href="/sistema" className="text-xl font-bold text-blue-950">OP Digital</Link>
      <div className="flex min-w-0 flex-wrap items-center gap-4"><div className="min-w-0 break-words text-right text-sm"><p className="font-semibold">{profile.nome}</p><p className="text-slate-600">{ROLE_LABELS[profile.role]}</p></div>
        <LogoutButton />
      </div>
    </header>
    <div className="lg:flex"><AuthNavigation quality={profile.role === "ADMIN" || profile.role === "QUALIDADE"} operator={profile.role === "OPERADOR"} admin={profile.role === "ADMIN"} pcp={profile.role === "ADMIN" || profile.role === "PCP"} /><main id="main-content" className="min-w-0 flex-1 px-4 py-6 lg:px-8 lg:py-8"><Breadcrumbs />{children}</main></div>
  </div>;
}
