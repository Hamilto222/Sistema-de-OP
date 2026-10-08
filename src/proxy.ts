import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfig, isSupabaseConfigured } from "@/lib/supabase/config";
import type { Database } from "@/types/database";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  if (!isSupabaseConfigured()) return NextResponse.redirect(new URL("/login", request.url));
  const config = getSupabaseConfig();
  const supabase = createServerClient<Database>(config.url, config.key, {
    cookieOptions: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values) {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data: { user }, error } = await supabase.auth.getUser();
  let active = false;
  let role: string | undefined;
  if (user && !error) {
    const { data } = await supabase.from("profiles").select("ativo,role").eq("id", user.id).single();
    active = data?.ativo === true;
    role = data?.role;
  }
  // Server Actions produce their own redirect protocol and always authorize internally.
  // A proxy redirect during their POST breaks the React action response.
  if (request.method === "POST" && request.headers.has("Next-Action")) {
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
  if (!active || (request.nextUrl.pathname.startsWith("/qualidade") && role !== "ADMIN" && role !== "QUALIDADE") || (request.nextUrl.pathname.startsWith("/operador") && role !== "OPERADOR") || (request.nextUrl.pathname.startsWith("/admin") && role !== "ADMIN") || (request.nextUrl.pathname.startsWith("/pcp") && role !== "ADMIN" && role !== "PCP")) {
    const destination = new URL(active ? "/sistema?motivo=sem-permissao" : user && !error ? "/login?motivo=inativo" : "/login", request.url);
    const redirect = NextResponse.redirect(destination, 303);
    response.cookies.getAll().forEach(cookie => redirect.cookies.set(cookie));
    redirect.headers.set("Cache-Control", "private, no-store");
    return redirect;
  }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = { matcher: ["/sistema/:path*", "/admin/:path*", "/pcp/:path*", "/operador/:path*", "/qualidade/:path*"] };
