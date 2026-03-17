import { redirect } from "next/navigation";
import { getAuthedUser } from "@/lib/authz";

export const runtime = "nodejs";

export default async function ViewerUploadRedirectPage() {
  const u = await getAuthedUser();
  if (!u) redirect("/api/auth/signin");

  if (u.role === "admin" || u.role === "owner") {
    redirect("/admin/upload");
  }

  redirect("/viewer?openPicker=1");
}
