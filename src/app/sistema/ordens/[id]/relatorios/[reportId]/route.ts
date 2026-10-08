import { NextResponse } from "next/server";
import { z } from "zod";
import { requireActiveProfile } from "@/lib/auth/session";
import { createDocumentUrl } from "@/services/storage";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; reportId: string }> }) {
  const { supabase } = await requireActiveProfile(); const { id, reportId } = await params;
  const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(reportId).success) return new NextResponse("Relatório indisponível.", { status: 404, headers });
  const result = await supabase.from("final_reports").select("path,status").eq("id", reportId).eq("production_order_id", id).maybeSingle();
  if (result.error || result.data?.status !== "READY") return new NextResponse("Relatório indisponível.", { status: 404, headers });
  try { return NextResponse.redirect(await createDocumentUrl("final-reports", result.data.path), { status: 303, headers }); }
  catch { return new NextResponse("Não foi possível abrir o relatório.", { status: 404, headers }); }
}
