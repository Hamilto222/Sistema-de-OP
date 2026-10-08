"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
const labels:Record<string,string>={pcp:"PCP",ordens:"Ordens de produção",nova:"Nova OP",qualidade:"Controle de Qualidade","nao-conformidades":"Não conformidades",operador:"Minhas OPs",op:"Execução",admin:"Administração",usuarios:"Usuários",linhas:"Linhas",produtos:"Produtos",checklists:"Checklists",auditoria:"Auditoria",sistema:"Início"};
export function Breadcrumbs(){
 const pathname=usePathname(),parts=pathname.split("/").filter(Boolean);
 if(parts.length<2)return null;
 return <nav aria-label="Localização" className="mb-5"><ol className="flex flex-wrap items-center gap-x-2 text-sm">{parts.map((part,index)=>{const last=index===parts.length-1,label=labels[part]||"Detalhes",href="/"+parts.slice(0,index+1).join("/");return <li key={href} className="flex items-center gap-2">{index>0&&<span aria-hidden="true">/</span>}{last?<span aria-current="page" className="break-words font-semibold">{label}</span>:labels[part]&&part!=="op"?<Link className="inline-flex min-h-12 items-center text-blue-900 underline" href={href}>{label}</Link>:<span>{label}</span>}</li>;})}</ol></nav>;
}
