import Link from "next/link";
import { AppHeader } from "@/components/app-header";

export default function Home() {
  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-5xl px-6 py-16 sm:py-24">
        <section aria-labelledby="welcome-title" className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm sm:p-12">
          <p className="mb-6 inline-flex rounded-full bg-blue-50 px-4 py-2 text-sm font-medium text-blue-800">OP Digital • Acesso seguro</p>
          <h1 id="welcome-title" className="text-4xl font-bold tracking-tight text-blue-950 sm:text-5xl">OP Digital</h1>
          <p className="mt-4 text-xl leading-relaxed text-slate-700">Sistema de Gestão de Ordens de Produção</p>
          <p className="mt-6 max-w-2xl text-base leading-7 text-slate-600">Gestão digital da produção e do controle de qualidade, com informações organizadas para computadores e tablets no chão de fábrica.</p>
          <Link href="/login" className="mt-8 inline-flex min-h-12 items-center rounded-lg bg-blue-900 px-6 font-semibold text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">Acessar o sistema</Link>
          <div className="mt-10 border-t border-slate-200 pt-6">
            <h2 className="text-base font-semibold text-slate-900">Fluxo integrado</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">Planejamento PCP, execução da produção, controle de qualidade e administração, com documentos privados, relatórios e histórico de auditoria.</p>
          </div>
        </section>
      </main>
    </>
  );
}
