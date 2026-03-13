import { redirect } from "next/navigation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AccountPage() {
  redirect("/admin/settings?tab=general");
}
