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

  if (!alias) notFound();

  const resolved = await resolveDoc({ alias });

  if (!resolved.ok) {
    if (resolved.error === "PASSWORD_REQUIRED") {
      return (
        <div
          style={{
            padding: 24,
            color: "white",
            maxWidth: 1100,
            margin: "0 auto",
          }}
        >
          <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
            Password required
          </h1>
          <p style={{ opacity: 0.85 }}>
            This link is password-protected. (Password entry UI not wired on this
            page yet.)
          </p>
        </div>
      );
    }

    notFound();
  }

  const viewerUrl = `/serve/${resolved.docId}`;

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      {/* Token / stats UI */}
      <ShareForm docId={resolved.docId} />

      {/* Viewer */}
      <div style={{ marginTop: 16 }}>
        <div
          style={{
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 12,
            overflow: "hidden",
            background: "rgba(255,255,255,0.02)",
          }}
        >
          <iframe
            title="Document viewer"
            src={viewerUrl}
            style={{
              width: "100%",
              height: "78vh",
              border: "0",
              display: "block",
              background: "transparent",
            }}
            // allow is optional, but can help PDF viewers
            allow="fullscreen"
          />
        </div>

        {/* Fallback link */}
        <div style={{ marginTop: 10, fontSize: 13, opacity: 0.8, color: "white" }}>
          If the viewer doesn’t load,{" "}
          <a
            href={viewerUrl}
            style={{ color: "white", textDecoration: "underline" }}
            target="_blank"
            rel="noreferrer"
          >
            open the document in a new tab
          </a>
          .
        </div>
      </div>
    </div>
  );
}
