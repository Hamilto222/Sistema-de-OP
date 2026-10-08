import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { createDocumentUrl } from "@/services/storage";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase } = await requireRole(["ADMIN", "PCP"]);
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return new NextResponse("OP inválida.", { status: 404 });
  const { data, error } = await supabase.from("production_orders").select("pdf_original_path").eq("id", id).maybeSingle();
  if (error || !data?.pdf_original_path) return new NextResponse("PDF não disponível.", { status: 404 });
  try {
    const url = await createDocumentUrl("op-originals", data.pdf_original_path);
    const response = NextResponse.redirect(url, 303);
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch {
    return new NextResponse("PDF não disponível. Recarregue a OP e tente novamente.", { status: 404, headers: { "Cache-Control": "private, no-store" } });
  }
}
