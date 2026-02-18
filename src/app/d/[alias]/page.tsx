// src/app/d/[alias]/page.tsx
import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import ShareForm from "./ShareForm";
import { resolveDoc } from "@/lib/resolveDoc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SharePage({
  params,
}: {
  params: Promise<{ alias: string }>;
}) {
  noStore();

  const { alias: rawAlias } = await params;
  const alias = decodeURIComponent(rawAlias || "").trim().toLowerCase();

  if (!alias) {
    notFound();
  }

  const resolved = await resolveDoc({ alias });

  if (!resolved.ok) {
    if (resolved.error === "PASSWORD_REQUIRED") {
      return (
        <div style={{ padding: 24, color: "white" }}>
          This link is password-protected.
        </div>
      );
    }

    notFound();
  }

  return <ShareForm docId={resolved.docId} />;
}
