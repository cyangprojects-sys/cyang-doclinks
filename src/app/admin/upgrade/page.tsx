import { redirect } from "next/navigation";
import { requireUser } from "@/lib/authz";

export const runtime = "nodejs";

export default async function ViewerUpgradePage() {
  await requireUser();
  redirect("/admin/billing?tab=plan");
}
