"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
const adminLinks = [["/admin/usuarios", "Usuários"], ["/admin/linhas", "Linhas"], ["/admin/produtos", "Produtos"], ["/admin/checklists", "Checklists"]];
export function AuthNavigation({ admin, pcp, operator, quality }: { admin: boolean; pcp: boolean; operator: boolean; quality: boolean }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const links = [["/sistema", "Início"], ...(pcp ? [["/pcp", "Visão PCP"], ["/pcp/ordens", "Ordens de produção"]] : []), ...(quality ? [["/qualidade", "Controle de Qualidade"], ["/qualidade/nao-conformidades", "Não conformidades"]] : []), ...(operator ? [["/operador", "Minhas OPs"]] : []), ...(admin ? adminLinks : [])];
  const activeHref = links.filter(([href]) => pathname === href || pathname.startsWith(href + "/")).sort((a,b) => b[0].length-a[0].length)[0]?.[0];
  return <aside className="border-b border-slate-200 bg-white lg:min-h-[calc(100vh-81px)] lg:w-60 lg:shrink-0 lg:border-r lg:border-b-0">
    <button className="button-secondary m-4 lg:hidden" type="button" aria-expanded={open} aria-controls="app-navigation" onClick={() => setOpen(!open)}>Menu {open ? "−" : "+"}</button>
    <nav id="app-navigation" aria-label="Navegação principal" className={`${open ? "block" : "hidden"} space-y-2 p-4 lg:sticky lg:top-0 lg:block lg:max-h-screen lg:overflow-y-auto`}>
      {links.map(([href, label]) => <Link key={href} href={href} onClick={() => setOpen(false)} aria-current={activeHref === href ? "page" : undefined} className={`flex min-h-12 items-center rounded-lg px-4 font-medium ${activeHref === href ? "bg-blue-950 text-white" : "text-slate-700 hover:bg-slate-100"}`}>{label}</Link>)}
    </nav>
  </aside>;
}
