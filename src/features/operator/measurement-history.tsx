import "server-only";
import { requireActiveProfile } from "@/lib/auth/session";
import { dateTime, quantity } from "@/features/pcp/queries";
export async function MeasurementHistory({orderId,itemId}:{orderId:string;itemId:string}) {
 const {supabase}=await requireActiveProfile();
 const rows=[];
 for(let offset=0;;offset+=1000){const result=await supabase.from("checklist_measurements").select().eq("production_order_id",orderId).eq("checklist_item_id",itemId).order("sequence").range(offset,offset+999);if(result.error)throw new Error("Falha ao consultar histórico de medições.");rows.push(...result.data);if(result.data.length<1000)break;}
 if(!rows.length)return null;
 function rule(config: unknown,type:string){const c=config as {resposta_conforme?:boolean;opcoes?:string[];opcoes_conformes?:string[]}|null;
  if(type==="BOOLEAN")return `Resposta conforme: ${(c?.resposta_conforme??true)?"Sim":"Não"}`;
  if(type==="SELECT")return `Opções: ${(c?.opcoes||[]).join(", ")}. Conformes: ${(c?.opcoes_conformes??c?.opcoes??[]).join(", ")||"Nenhuma"}.`;
  return type==="PHOTO"?"Evidência fotográfica registrada":"Registro textual";
 }
 const actors=[...new Set(rows.map(row=>row.measured_by).filter((id):id is string=>!!id))];
 const people=actors.length?await supabase.from("profiles").select("id,nome").in("id",actors):{data:[],error:null};if(people.error)throw new Error("Falha ao consultar autores das medições.");
 return <details className="rounded-lg border border-slate-200 p-4" open><summary className="min-h-12 cursor-pointer font-bold">Histórico de medições ({rows.length} tentativas)</summary><div className="space-y-3">{rows.map((row,index)=><article key={row.id} className="space-y-2 rounded-lg bg-slate-50 p-4"><p className="font-bold">Tentativa {row.sequence}{index===rows.length-1?" · MEDIÇÃO ATUAL":""}</p><p>{row.measurement_type==="NUMBER"?quantity(row.numeric_value):row.measurement_type==="BOOLEAN"?row.boolean_value?"Sim":"Não":row.select_value||row.text_value||"Foto registrada"} {row.unit} — {row.compliant===true?"CONFORME":row.compliant===false?"NÃO CONFORME":"Sem resultado legado"}</p>{row.measurement_type==="NUMBER"?<p>Faixa: {row.minimum_value_snapshot??"Sem mínimo"}–{row.maximum_value_snapshot??"Sem máximo"} {row.unit}</p>:<p className="break-words">{rule(row.configuration_snapshot,row.measurement_type)}</p>}<p>{dateTime(row.measured_at)} · {people.data?.find(person=>person.id===row.measured_by)?.nome||row.measured_by||"Autor legado não informado"}</p>{row.observation&&<p className="whitespace-pre-wrap break-words">Observação: {row.observation}</p>}{row.evidence_path&&<a className="button-secondary" target="_blank" rel="noreferrer" href={`/sistema/ordens/${orderId}/medicoes/${row.id}/evidencia`}>Ver evidência da tentativa {row.sequence}</a>}</article>)}</div></details>;
}
