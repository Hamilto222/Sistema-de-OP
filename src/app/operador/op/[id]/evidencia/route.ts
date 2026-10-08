import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { createDocumentUrl } from "@/services/storage";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase } = await requireRole(["OPERADOR"]);
  const { id } = await params; const query = new URL(request.url).searchParams;
  const item = query.get("item"), note = query.get("apontamento"), record = item || note;
  const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(record).success || (!!item === !!note)) return new NextResponse("Evidência inválida.", {status:404,headers});
  const { data, error } = await supabase.from(item ? "production_order_checklist" : "production_notes").select("foto_path").eq("id",record!).eq("production_order_id",id).maybeSingle();
  if (error || !data?.foto_path) return new NextResponse("Evidência não disponível.", {status:404,headers});
  try { return NextResponse.redirect(await createDocumentUrl("operator-evidence",data.foto_path), {status:303,headers}); }
  catch { return new NextResponse("Evidência não disponível. Tente novamente.", {status:404,headers}); }
}
