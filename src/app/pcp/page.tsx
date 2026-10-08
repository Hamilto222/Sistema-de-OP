import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { Analytics } from "@/features/dashboard/analytics";
import { OrdersList, type PcpSearchParams } from "@/features/pcp/orders-list";
export default async function PcpDashboard({ searchParams }: { searchParams: PcpSearchParams }) {
  await requireRole(["ADMIN", "PCP"]);
  return <div className="mx-auto max-w-7xl space-y-6"><div className="flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-2xl font-bold text-blue-950">PCP</h1><p className="mt-2 text-slate-600">Planejamento e Controle da Produção</p></div><Link href="/pcp/ordens/nova" className="button-primary">Nova OP</Link></div>
    <Analytics mode="pcp" params={await searchParams} />
    <div className="flex flex-wrap items-center justify-between gap-4"><h2 className="text-xl font-bold">Ordens de produção</h2><Link href="/pcp/ordens" className="button-secondary">Abrir listagem</Link></div><OrdersList searchParams={searchParams} />
  </div>;
}
