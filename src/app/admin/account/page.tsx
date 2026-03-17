import { redirect } from "next/navigation";

export const runtime = "nodejs";

export default async function AccountPage() {
  redirect("/admin/settings?tab=general");
}
