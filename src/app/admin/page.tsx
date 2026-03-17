import AdminDashboardPage from "./dashboard/page";

export const runtime = "nodejs";

export default function AdminPage(props: Parameters<typeof AdminDashboardPage>[0]) {
  return <AdminDashboardPage {...props} />;
}
