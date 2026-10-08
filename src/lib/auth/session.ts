import "server-only";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { AppRole } from "./roles";

// Always verify identity with Auth and activation/role against PostgreSQL.
export async function requireActiveProfile() {
  if (!isSupabaseConfigured()) redirect("/login");
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/login");
  const { data: profile, error: profileError } = await supabase.from("profiles")
    .select("id,nome,email,role,ativo,production_line_id,can_reopen_orders").eq("id", user.id).single();
  if (profileError || !profile || !profile.ativo) redirect("/login?motivo=inativo");
  return { supabase, user, profile };
}

export async function requireRole(roles: readonly AppRole[]) {
  const session = await requireActiveProfile();
  if (!roles.includes(session.profile.role)) redirect("/sistema?motivo=sem-permissao");
  return session;
}
