// src/app/login/page.tsx
import { redirect } from "next/navigation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function LoginPage() {
  redirect("/signin");
}
