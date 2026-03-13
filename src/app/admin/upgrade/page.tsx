import { redirect } from "next/navigation";
import { requireUser } from "@/lib/authz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ViewerUpgradePage() {
  await requireUser();
  redirect("/admin/billing?tab=plan");
}
