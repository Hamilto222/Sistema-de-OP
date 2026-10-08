import Link from "next/link";
import { OrdersList, type PcpSearchParams } from "@/features/pcp/orders-list";
export default function OrdersPage({ searchParams }: { searchParams: PcpSearchParams }) {
  return <div className="mx-auto max-w-7xl space-y-6"><div className="flex flex-wrap items-center justify-between gap-4"><h1 className="text-2xl font-bold text-blue-950">Ordens de produção</h1><Link href="/pcp/ordens/nova" className="button-primary">Nova OP</Link></div><OrdersList searchParams={searchParams} /></div>;
}
