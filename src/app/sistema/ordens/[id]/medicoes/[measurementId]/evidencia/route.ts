import {NextResponse} from "next/server";
import {z} from "zod";
import {requireActiveProfile} from "@/lib/auth/session";
import {createDocumentUrl} from "@/services/storage";
export async function GET(_request:Request,{params}:{params:Promise<{id:string;measurementId:string}>}){
 const {supabase}=await requireActiveProfile(),{id,measurementId}=await params,headers={"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer"};
 if(!z.uuid().safeParse(id).success||!z.uuid().safeParse(measurementId).success)return new NextResponse("Evidência inválida.",{status:404,headers});
 const {data,error}=await supabase.from("checklist_measurements").select("evidence_path").eq("id",measurementId).eq("production_order_id",id).maybeSingle();
 if(error||!data?.evidence_path)return new NextResponse("Evidência indisponível.",{status:404,headers});
 try{return NextResponse.redirect(await createDocumentUrl("operator-evidence",data.evidence_path),{status:303,headers});}catch{return new NextResponse("Evidência indisponível.",{status:404,headers});}
}
