import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { createDocumentUrl } from "@/services/storage";
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 const {supabase}=await requireRole(["ADMIN","QUALIDADE"]);const {id}=await params,query=new URL(request.url).searchParams,tipo=query.get("tipo"),registro=query.get("registro"),headers={"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer"};
 if(!z.uuid().safeParse(id).success)return new NextResponse("OP inválida.",{status:404,headers});
 let path:string|null=null,bucket="";
 if(tipo==="pdf"){const {data,error}=await supabase.from("production_orders").select("pdf_original_path").eq("id",id).maybeSingle();if(!error){path=data?.pdf_original_path||null;bucket="op-originals";}}
 else if(z.uuid().safeParse(registro).success){if(tipo==="item"){const {data,error}=await supabase.from("production_order_checklist").select("foto_path").eq("production_order_id",id).eq("id",registro!).maybeSingle();if(!error){path=data?.foto_path||null;bucket="operator-evidence";}}
 else if(tipo==="antes"||tipo==="depois"){const result=await supabase.rpc("quality_nc_document",{order_id:id,nc_id:registro!,which_document:tipo});const document=z.object({path:z.string(),bucket:z.enum(["quality-evidence","operator-evidence"])}).safeParse(result.data);if(!result.error&&document.success){path=document.data.path;bucket=document.data.bucket;}}}
 if(!path)return new NextResponse("Documento indisponível.",{status:404,headers});
 try{return NextResponse.redirect(await createDocumentUrl(bucket,path),{status:303,headers});}catch{return new NextResponse("Documento indisponível. Tente novamente.",{status:404,headers});}
}
