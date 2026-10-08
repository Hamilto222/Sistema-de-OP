import { z } from "zod";
z.config(z.locales.ptBR());
export const decisionSchema = z.object({ id:z.uuid(),version:z.coerce.number().int().positive(),decision:z.enum(["APPROVED","REJECTED","IN_PRODUCTION","AWAITING_QUALITY"]),reason:z.string().trim().max(4000) }).superRefine((value,ctx)=>{if(value.decision!=="APPROVED" && !value.reason)ctx.addIssue({code:"custom",path:["reason"],message:"Informe o motivo ou justificativa."});});
export const reviewSchema = z.object({id:z.uuid(),item_id:z.uuid(),updated_at:z.string().datetime({offset:true})});
const optionalText=z.string().trim().max(4000);
export const ncSchema = z.object({id:z.uuid().nullable(),updated_at:z.string().datetime({offset:true}).nullable(),production_order_id:z.uuid(),checklist_item_id:z.uuid().nullable(),tipo:z.string().trim().min(1,"Informe o tipo.").max(100),descricao:z.string().trim().min(1,"Informe a descrição.").max(4000),severidade:z.enum(["LOW","MEDIUM","HIGH","CRITICAL"]),acao_imediata:optionalText,responsavel_id:z.uuid().nullable(),status:z.enum(["OPEN","IN_TREATMENT","AWAITING_QUALITY","CLOSED","CANCELLED"]),observacao_cq:optionalText,evidencia_antes_path:z.string().max(250),evidencia_depois_path:z.string().max(250),impeditiva:z.boolean()}).superRefine((nc,ctx)=>{
 if(nc.status==="CLOSED") for(const name of ["acao_imediata","responsavel_id","observacao_cq"] as const) if(!nc[name])ctx.addIssue({code:"custom",path:[name],message:"Fechamento exige ação imediata, responsável e observação CQ."});
 if(nc.status==="CANCELLED"&&!nc.observacao_cq)ctx.addIssue({code:"custom",path:["observacao_cq"],message:"Justifique o cancelamento na observação CQ."});
});
export type QualityState={error?:string;fields?:Record<string,string>;success?:string};
