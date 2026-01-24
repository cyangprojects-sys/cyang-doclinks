import Link from "next/link";
import { sql } from "@/lib/db";
import { getDocSessionPage } from "@/lib/auth-page";

export const dynamic = "force-dynamic";

export default async function DocViewerPage({
  params,
}: {
  params: Promise<{ alias: string }>;
}) {
  const { alias } = await params;
  const safeAlias = (alias || "").trim();

  // Confirm alias exists/active
  const rows = (await sql`
    select is_active
    from doc_aliases
    where alias = ${safeAlias}
    limit 1
  `) as { is_active: boolean }[];

  if (rows.length === 0 || !rows[0].is_active) {
    return (
      <main style={{ maxWidth: 640, margin: "40px auto", padding: "0 16px" }}>
        <div
          style={{
            padding: 20,
            borderRadius: 16,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(255,255,255,0.02)",
          }}
        >
          <h2>Not found</h2>
          <p style={{ opacity: 0.7 }}>
            This document link is invalid or inactive.
          </p>
        </div>
      </main>
    );
  }

  const session = await getDocSessionPage();

  // NOT signed in
  if (!session) {
    return (
      <main style={{ maxWidth: 720, margin: "40px auto", padding: "0 16px" }}>
        <div
          style={{
            padding: 24,
            borderRadius: 18,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(255,255,255,0.02)",
          }}
        >
          <h2>Sign in to view this document</h2>

          <div style={{ margin: "16px 0" }}>
            <a
              href={`/auth/google/start?alias=${encodeURIComponent(safeAlias)}`}
              style={{
                display: "inline-block",
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.18)",
                color: "rgba(255,255,255,0.92)",
                textDecoration: "none",
              }}
            >
              Continue with Google
            </a>
          </div>

          <hr
            style={{
              borderColor: "rgba(255,255,255,0.14)",
              margin: "18px 0",
            }}
          />

          <form method="POST" action="/auth/email/start">
            <input type="hidden" name="alias" value={safeAlias} />

            <label style={{ display: "block", marginBottom: 6 }}>
              Email address
            </label>

            <input
              name="email"
              type="email"
              required
              style={{
                width: "100%",
                padding: 10,
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.18)",
                background: "rgba(0,0,0,0.3)",
                color: "rgba(255,255,255,0.92)",
                marginBottom: 12,
              }}
            />

            <button
              type="submit"
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                background: "#f3f4f6",
                color: "#111827",
                border: "1px solid #e5e7eb",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Email me a sign-in link
            </button>
          </form>

          <p style={{ fontSize: 12, opacity: 0.6, marginTop: 14 }}>
            This link grants access to this document only and expires after 8
            hours.
          </p>
        </div>
      </main>
    );
  }

  // SIGNED IN
  return (
    <main style={{ maxWidth: 920, margin: "40px auto", padding: "0 16px" }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>cyang-doclinks</div>
        <div style={{ fontSize: 12, opacity: 0.7 }}>Private document access</div>
      </div>

      <div
        style={{
          padding: 20,
          borderRadius: 18,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(255,255,255,0.02)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontSize: 14, opacity: 0.7 }}>Signed in</div>
            <div style={{ fontWeight: 600 }}>grant #{session.grant_id}</div>
          </div>

          <Link
            href={`/api/d/${encodeURIComponent(safeAlias)}/download`}
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              background: "#f3f4f6",
              color: "#111827",
              border: "1px solid #e5e7eb",
              textDecoration: "none",
              fontWeight: 700,
              whiteSpace: "nowrap",
            }}
          >
            Download / Open PDF
          </Link>
        </div>

        <div style={{ marginTop: 14, fontSize: 13, opacity: 0.7 }}>
          This button generates a short-lived private URL. If it expires, click
          again.
        </div>
      </div>
    </main>
  );
}
