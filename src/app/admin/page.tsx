// src/app/admin/page.tsx
import { redirect } from "next/navigation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function AdminPage() {
  redirect("/admin/dashboard");
}
