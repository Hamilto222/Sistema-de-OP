import { AdminPage } from "@/features/admin/admin-page";
export default function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <AdminPage kind="usuarios" searchParams={searchParams} />;
}
