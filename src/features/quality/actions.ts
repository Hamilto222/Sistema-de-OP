"use server";
import { z } from "zod";
import { validateUpload } from "@/services/upload-validation";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { decisionSchema,ncSchema,reviewSchema,type QualityState } from "./schemas";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
function failure(error:{code?:string;message:string}):QualityState{return {error:error.code==="P0001"||(error.code==="42501"&&!error.message.includes("permission denied"))?error.message:"Não foi possível salvar. Verifique os dados, a conexão e as permissões. Seus campos foram preservados."};}
function invalid(issues:{path:PropertyKey[];message:string}[]):QualityState{return {error:"Confira os campos.",fields:Object.fromEntries(issues.map(issue=>[issue.path.join("."),issue.message]))};}
function changed(){for(const path of ["/qualidade","/operador","/pcp"])revalidatePath(path,"layout");}
async function evidence(supabase:SupabaseClient<Database>,orderId:string,form:FormData,name:string):Promise<{path?:string;error?:string}>{
 const file=form.get(name);if(!(file instanceof File)||!file.size)return {path:String(form.get(`${name}_path`)||"")};
 if(file.size>10*1024*1024)return {error:"Cada evidência deve ter até 10 MB."};
 if(!["image/jpeg","image/png","image/webp","application/pdf"].includes(file.type))return {error:"Envie evidência JPEG, PNG, WebP ou PDF."};
 let bytes:ArrayBuffer;
 try{bytes=(await validateUpload(file,["image/jpeg","image/png","image/webp","application/pdf"],10*1024*1024)).bytes;}catch(error){return {error:error instanceof Error?error.message:"Evidência inválida."};}
 const path=`${orderId}/${crypto.randomUUID()}.${file.type==="application/pdf"?"pdf":file.type==="image/jpeg"?"jpg":file.type==="image/png"?"png":"webp"}`;
 try{const result=await supabase.storage.from("quality-evidence").upload(path,bytes,{contentType:file.type,upsert:false});return result.error?{error:"Não foi possível enviar a evidência privada. Tente novamente."}:{path};}catch{return {error:"Falha de conexão ao enviar evidência. Tente novamente."};}
}
export async function reviewItem(_previous:QualityState,form:FormData):Promise<QualityState>{
 const {supabase}=await requireRole(["ADMIN","QUALIDADE"]);const parsed=reviewSchema.safeParse(Object.fromEntries(form));if(!parsed.success)return invalid(parsed.error.issues);
 const input=parsed.data,result=await supabase.rpc("quality_review_item",{order_id:input.id,item_id:input.item_id,expected_updated_at:input.updated_at});if(result.error)return failure(result.error);changed();return {success:"Item revisado."};
}
export async function decideOrder(_previous:QualityState,form:FormData):Promise<QualityState>{
 const {supabase}=await requireRole(["ADMIN","QUALIDADE"]);const parsed=decisionSchema.safeParse(Object.fromEntries(form));if(!parsed.success)return invalid(parsed.error.issues);
 const input=parsed.data,result=await supabase.rpc("quality_decide_order",{order_id:input.id,expected_version:input.version,decision:input.decision,reason:input.reason});if(result.error)return failure(result.error);changed();return {success:input.decision==="APPROVED"?"OP aprovada e enviada ao PCP.":input.decision==="REJECTED"?"OP bloqueada/reprovada.":"Retorno controlado registrado."};
}
export async function saveNc(_previous:QualityState,form:FormData):Promise<QualityState>{
 const {supabase}=await requireRole(["ADMIN","QUALIDADE"]);const raw=Object.fromEntries(form);
 const parsed=ncSchema.safeParse({...raw,id:raw.id||null,updated_at:raw.updated_at||null,checklist_item_id:raw.checklist_item_id||null,responsavel_id:raw.responsavel_id||null,impeditiva:form.get("impeditiva")==="on"});if(!parsed.success)return invalid(parsed.error.issues);
 const input=parsed.data;
 const {data:order}=await supabase.from("production_orders").select("status").eq("id",input.production_order_id).maybeSingle();if(!order||!["RELEASED","IN_PRODUCTION","BLOCKED_QUALITY","AWAITING_QUALITY","AWAITING_PCP"].includes(order.status))return {error:"OP indisponível para tratamento de NC."};
 if(input.id){const {data:nc}=await supabase.from("non_conformities").select("updated_at,status,impeditiva").eq("id",input.id).eq("production_order_id",input.production_order_id).maybeSingle();if(!nc||nc.updated_at!==input.updated_at||["CLOSED","CANCELLED"].includes(nc.status))return {error:"NC indisponível, encerrada ou alterada. Recarregue."};if(order.status==="AWAITING_PCP"&&(nc.impeditiva||input.impeditiva))return {error:"Após aprovação, somente tratamento de NC já não impeditiva."};}
 else if(order.status==="AWAITING_PCP")return {error:"Não é permitido abrir NC após aprovação CQ."};
 const before=await evidence(supabase,input.production_order_id,form,"evidencia_antes");if(before.error)return {error:before.error};
 const after=await evidence(supabase,input.production_order_id,form,"evidencia_depois");if(after.error)return {error:after.error};
 const result=await supabase.rpc("quality_save_nc",{payload:{...input,evidencia_antes_path:before.path||null,evidencia_depois_path:after.path||null}});if(result.error)return failure(result.error);changed();if(!input.id)redirect(`/qualidade/nao-conformidades/${result.data}?sucesso=criada`);return {success:"NC salva com histórico e auditoria."};
}

const correctionSchema = z.object({nc_id:z.uuid(),version:z.coerce.number().int().positive(),updated_at:z.string().datetime({offset:true})});
export async function releaseCorrection(_previous:QualityState,form:FormData):Promise<QualityState>{
 const {supabase}=await requireRole(["ADMIN","QUALIDADE"]);const parsed=correctionSchema.safeParse(Object.fromEntries(form));if(!parsed.success)return invalid(parsed.error.issues);
 const input=parsed.data,result=await supabase.rpc("quality_release_correction",{nc_id:input.nc_id,expected_version:input.version,expected_updated_at:input.updated_at});if(result.error)return failure(result.error);changed();return {success:"OP liberada para correção. A NC permanece em tratamento."};
}
export async function closeCorrection(_previous:QualityState,form:FormData):Promise<QualityState>{
 const {supabase}=await requireRole(["ADMIN","QUALIDADE"]);const parsed=correctionSchema.extend({observation:z.string().trim().min(1).max(4000)}).safeParse(Object.fromEntries(form));if(!parsed.success)return invalid(parsed.error.issues);
 const input=parsed.data,result=await supabase.rpc("quality_close_correction",{nc_id:input.nc_id,expected_version:input.version,expected_updated_at:input.updated_at,observation:input.observation});if(result.error)return failure(result.error);changed();return {success:"Correção aprovada e NC fechada. A OP mantém seu fluxo operacional."};
}
