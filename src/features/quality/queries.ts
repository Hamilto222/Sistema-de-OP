import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
async function collect<T>(fetch:(offset:number)=>PromiseLike<{data:T[]|null;error:unknown}>){const all:T[]=[];for(let offset=0;;offset+=1000){const result=await fetch(offset);if(result.error||!result.data)throw new Error("Falha ao consultar vínculos.");all.push(...result.data);if(result.data.length<1000)return all;}}
export async function ncLookups(supabase:SupabaseClient<Database>,orderId?:string){
 const [people,orders,items]=await Promise.all([
 collect(offset=>supabase.from("profiles").select("id,nome,ativo").order("id").range(offset,offset+999)),
 collect(offset=>{const query=supabase.from("pcp_order_list").select("id,numero_op,produto_descricao,status").in("status",["RELEASED","IN_PRODUCTION","BLOCKED_QUALITY","AWAITING_QUALITY"]).order("id").range(offset,offset+999);return orderId?query.eq("id",orderId):query;}),
 orderId?collect(offset=>supabase.from("production_order_checklist").select("id,item,ordem").eq("production_order_id",orderId).order("ordem").range(offset,offset+999)):Promise.resolve([]),
 ]);return {people,orders,items};
}
export type NcLookups=Awaited<ReturnType<typeof ncLookups>>;
export function expected(item:Database["public"]["Tables"]["production_order_checklist"]["Row"]){
 const config=item.configuracao as {resposta_conforme?:boolean;opcoes?:string[];opcoes_conformes?:string[]};
 if(item.tipo_resposta==="NUMBER")return `${item.valor_minimo===null?"Sem mínimo":`Mínimo ${item.valor_minimo}`} · ${item.valor_maximo===null?"Sem máximo":`Máximo ${item.valor_maximo}`} ${item.unidade||""}`;
 if(item.tipo_resposta==="BOOLEAN")return (config?.resposta_conforme??true)?"Sim":"Não";
 if(item.tipo_resposta==="SELECT")return (config?.opcoes_conformes??config?.opcoes??[]).join(" · ")||"Nenhuma opção conforme";
 return item.tipo_resposta==="PHOTO"?"Evidência fotográfica":"Registro textual";
}
