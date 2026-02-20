// src/app/admin/upload/page.tsx
import { redirect } from "next/navigation";
import { getAuthedUser } from "@/lib/authz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AdminUploadRedirectPage() {
  const u = await getAuthedUser();
  if (!u) redirect("/api/auth/signin");

  redirect("/admin/dashboard");
}
