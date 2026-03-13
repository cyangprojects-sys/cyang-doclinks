import AdminDashboardPage from "./dashboard/page";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function AdminPage(props: Parameters<typeof AdminDashboardPage>[0]) {
  return <AdminDashboardPage {...props} />;
}
