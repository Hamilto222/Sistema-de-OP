import { requireRole } from "@/lib/auth/session";
import { loadLookups } from "@/features/pcp/queries";
import { OrderForm } from "@/features/pcp/order-form";
export default async function NewOrderPage() {
  const { supabase } = await requireRole(["ADMIN", "PCP"]);
  const lookups = await loadLookups(supabase, true);
  return <div className="mx-auto max-w-6xl space-y-6"><h1 className="text-2xl font-bold text-blue-950">Nova OP</h1><OrderForm {...lookups} /></div>;
}
