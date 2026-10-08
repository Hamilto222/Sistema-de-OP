import { Analytics } from "@/features/dashboard/analytics";
import Link from "next/link";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { EmptyState } from "@/components/ui/admin-ui";
import { OrderStatusBadge } from "@/components/ui/order-status";
import { dateTime,searchFilter } from "@/features/pcp/queries";
export default async function QualityPage({searchParams}:{searchParams:Promise<{pagina?:string;q?:string;inicio?:string;fim?:string}>}){
 const {supabase}=await requireRole(["ADMIN","QUALIDADE"]);const params=await searchParams,parsed=z.coerce.number().int().positive().max(100000).safeParse(params.pagina||1),page=parsed.success?parsed.data:1,q=String(params.q||"").trim().slice(0,100);
 let query=supabase.from("pcp_order_list").select("id,numero_op,produto_codigo,produto_descricao,lote,linha_nome,operador_nome,status,data_envio_cq",{count:"exact"}).in("status",["AWAITING_QUALITY","BLOCKED_QUALITY"]);
 if(q)query=query.or(searchFilter(q));const orders=await query.order("data_envio_cq",{nullsFirst:true}).order("id").range((page-1)*20,page*20-1);
 if(orders.error)throw new Error("Não foi possível carregar a fila CQ.");
 const href=(value:number)=>`?${new URLSearchParams({pagina:String(value),q,...(params.inicio?{inicio:params.inicio}:{}),...(params.fim?{fim:params.fim}:{})})}`;
 return <div className="mx-auto max-w-6xl space-y-6"><h1 className="text-3xl font-bold text-blue-950">Controle de Qualidade</h1><Analytics mode="quality" params={params}/>
 <div className="flex flex-wrap gap-3"><Link className="button-secondary" href="/qualidade/nao-conformidades">Gerenciar não conformidades</Link><form className="flex min-w-0 flex-1 flex-wrap gap-3">{params.inicio&&<input type="hidden" name="inicio" value={params.inicio}/>}{params.fim&&<input type="hidden" name="fim" value={params.fim}/>}<input className="input min-w-0" aria-label="Pesquisar OP, produto ou lote" name="q" defaultValue={q} placeholder="Pesquisar OP, produto ou lote" maxLength={100}/><button className="button-primary">Pesquisar</button></form></div>
 <h2 className="text-xl font-bold text-blue-950">OPs para revisão</h2>{!orders.data?.length&&<EmptyState>Nenhuma OP na fila CQ nesta página.</EmptyState>}<div className="grid gap-4 lg:grid-cols-2">{orders.data?.map(order=><Link key={order.id} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5" href={`/qualidade/op/${order.id}`}><div className="flex flex-wrap justify-between gap-3"><h3 className="break-words text-xl font-bold">OP {order.numero_op}</h3><OrderStatusBadge status={order.status!}/></div><p className="break-words font-semibold">{order.produto_codigo} · {order.produto_descricao}</p><dl className="grid grid-cols-2 gap-3">{[['Lote',order.lote],['Linha',order.linha_nome],['Operador',order.operador_nome||'Equipe da linha'],['Horário de envio',order.data_envio_cq?dateTime(order.data_envio_cq):'Bloqueada antes do envio']].map(([label,value])=><div key={label}><dt className="text-sm text-slate-600">{label}</dt><dd className="break-words">{value}</dd></div>)}</dl><p className="font-semibold text-blue-800">Revisar OP →</p></Link>)}</div>
 <div className="flex flex-wrap gap-3"><p>{orders.count||0} OPs · Página {page}</p>{page>1&&<Link className="button-secondary" href={href(page-1)}>Anterior</Link>}{page*20<(orders.count||0)&&<Link className="button-secondary" href={href(page+1)}>Próxima</Link>}</div></div>;
}
