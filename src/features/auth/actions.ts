"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export type LoginState = { error: string | null };
const credentials = z.object({ email: z.email().max(254), password: z.string().min(1).max(128) });

export async function login(_state: LoginState, form: FormData): Promise<LoginState> {
  const result = credentials.safeParse({ email: String(form.get("email") ?? "").trim().toLowerCase(), password: form.get("password") });
  if (!result.success) return { error: "Informe um e-mail válido e sua senha." };
  if (!isSupabaseConfigured()) return { error: "Supabase não configurado. Contate o administrador." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword(result.data);
  if (error || !data.user) return { error: "Não foi possível entrar. Confira seus dados e tente novamente." };
  const { data: profile, error: profileError } = await supabase.from("profiles").select("ativo").eq("id", data.user.id).single();
  if (profileError || !profile?.ativo) {
    await supabase.auth.signOut();
    return { error: "Seu acesso não está ativo. Contate o administrador." };
  }
  redirect("/sistema");
}

export async function logout() {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error("Não foi possível encerrar a sessão. Tente novamente.");
  redirect("/login");
}
