// src/app/admin/upload/page.tsx
import { redirect } from "next/navigation";
import { isOwnerAdmin } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AdminUploadRedirectPage() {
  const ok = await isOwnerAdmin();
  if (!ok) redirect("/api/auth/signin");

  redirect("/admin/dashboard");
}
