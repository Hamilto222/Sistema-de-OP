import Link from "next/link";
import { requireActiveProfile } from "@/lib/auth/session";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { ErrorMessage } from "@/components/ui/admin-ui";
export default async function SystemPage({ searchParams }: { searchParams: Promise<{ motivo?: string }> }) {
  const { profile } = await requireActiveProfile();
  const { motivo } = await searchParams;
  return <div className="max-w-4xl space-y-6">{motivo === "sem-permissao" && <ErrorMessage>Acesso não autorizado. Verifique as permissões do seu perfil.</ErrorMessage>}
    <section className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
      <h1 className="text-2xl font-bold text-blue-950">Bem-vindo, {profile.nome}</h1>
      <p className="mt-3 text-slate-700">Perfil: {ROLE_LABELS[profile.role]}</p>
      {profile.role === "ADMIN" ? <><p className="my-6 text-slate-600">Gerencie usuários, linhas, produtos e modelos de checklist.</p><Link className="button-primary" href="/admin/usuarios">Abrir administração</Link></> : profile.role === "OPERADOR" ? <Link className="button-primary mt-6" href="/operador">Minhas OPs</Link> : <p className="mt-6 leading-7 text-slate-600">Seu acesso está ativo. Acesse a revisão de OPs e o tratamento de não conformidades pelo Controle de Qualidade.</p>}
    {(profile.role === "ADMIN" || profile.role === "PCP") && <Link className="button-secondary mt-4" href="/pcp">Abrir PCP</Link>}
    {(profile.role === "ADMIN" || profile.role === "QUALIDADE") && <Link className="button-secondary mt-4" href="/qualidade">Abrir Controle de Qualidade</Link>}
    </section></div>;
}
