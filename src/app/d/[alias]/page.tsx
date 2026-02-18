// src/app/d/[alias]/page.tsx
import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import ShareForm from "./ShareForm";
import { resolveDoc } from "@/lib/resolveDoc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SharePage({ params }: { params: { alias: string } }) {
  noStore();

  const alias = decodeURIComponent(params.alias || "").trim();
  if (!alias) notFound();

  const resolved = await resolveDoc({ alias });

  if (!resolved.ok) {
    // If alias gets password support later, /d/[alias] is where you'd render the password UI.
    // For now: treat as not found.
    notFound();
  }

  return <ShareForm docId={resolved.docId} />;
}
