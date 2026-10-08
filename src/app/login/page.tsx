import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { LoginForm } from "@/features/auth/login-form";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ motivo?: string }> }) {
  const configured = isSupabaseConfigured();
  if (configured) {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase.from("profiles").select("ativo").eq("id", user.id).single();
      if (data?.ativo) redirect("/sistema");
    }
  }
  const { motivo } = await searchParams;
  return <><AppHeader /><main className="mx-auto max-w-md px-6 py-12">
    <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      <h1 className="text-2xl font-bold text-blue-950">Entrar no OP Digital</h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">Use o acesso fornecido pela administração.</p>
      {motivo === "inativo" && <p role="alert" className="mt-4 rounded-lg bg-amber-50 p-4 text-sm text-amber-900">Acesso inativo ou perfil indisponível. Contate o administrador.</p>}
      {configured ? <LoginForm /> : <p role="alert" className="mt-6 rounded-lg bg-amber-50 p-4 text-sm text-amber-900">A conexão com o serviço de autenticação ainda não foi configurada. Contate o administrador.</p>}
    </section>
  </main></>;
}
