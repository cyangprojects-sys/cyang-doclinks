import { sql } from "@/lib/db";
import {
    uploadPdfAction,
    createOrAssignAliasAction,
    emailMagicLinkAction,
} from "./actions";

type Row = {
    id: string;
    title: string;
    original_filename: string;
    byte_size: number;
    created_at: string;
    created_by_email: string;
    alias: string | null;
};

function fmtBytes(n: number) {
    if (n < 1024) return `${n} B`;
    const kb = n / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    return `${mb.toFixed(1)} MB`;
}

export const dynamic = "force-dynamic";
export const revalidate = 0;
export default async function AdminPage({
    searchParams,
}: {
    searchParams: Record<string, string | string[] | undefined>;
}) {
    const rows = (await sql`
    select
      d.id::text as id,
      d.title,
      d.original_filename,
      d.byte_size::int as byte_size,
      d.created_at::text as created_at,
      d.created_by_email,
      (
        select a.alias
        from doc_aliases a
        where a.doc_id = d.id
        order by a.created_at desc
        limit 1
      ) as alias
    from docs d
    order by d.created_at desc
    limit 200
  `) as unknown as Row[];

    const uploaded = searchParams.uploaded ? "✅ Uploaded" : "";
    const aliased = searchParams.aliased ? "✅ Alias saved" : "";
    const emailed = searchParams.emailed ? "✅ Email sent" : "";
    const banner = [uploaded, aliased, emailed].filter(Boolean).join(" · ");

    return (
        <div style={{ display: "grid", gap: 20 }}>
            {banner ? (
                <div
                    style={{
                        padding: 12,
                        borderRadius: 12,
                        background: "rgba(0,255,0,0.08)",
                        border: "1px solid rgba(0,255,0,0.25)",
                    }}
                >
                    {banner}
                </div>
            ) : null}

            <section
                style={{
                    padding: 16,
                    borderRadius: 16,
                    border: "1px solid rgba(255,255,255,0.15)",
                }}
            >
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>
                    Upload PDF
                </div>

                <form action={uploadPdfAction} style={{ display: "grid", gap: 10 }}>
                    <input
                        name="title"
                        placeholder="Title"
                        required
                        style={{
                            padding: 10,
                            borderRadius: 10,
                            border: "1px solid rgba(255,255,255,0.2)",
                            background: "transparent",
                            color: "inherit",
                        }}
                    />
                    <input name="file" type="file" accept="application/pdf" required />
                    <button
                        type="submit"
                        style={{
                            padding: "10px 14px",
                            borderRadius: 12,
                            border: "1px solid rgba(255,255,255,0.2)",
                            background: "rgba(255,255,255,0.06)",
                            color: "inherit",
                            cursor: "pointer",
                            width: "fit-content",
                        }}
                    >
                        Upload
                    </button>
                </form>
            </section>

            <section
                style={{
                    padding: 16,
                    borderRadius: 16,
                    border: "1px solid rgba(255,255,255,0.15)",
                }}
            >
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>
                    Uploaded documents
                </div>

                <div style={{ display: "grid", gap: 12 }}>
                    {rows.map((d) => {
                        const link = d.alias ? `/d/${d.alias}` : null;

                        return (
                            <div
                                key={d.id}
                                style={{
                                    padding: 14,
                                    borderRadius: 14,
                                    border: "1px solid rgba(255,255,255,0.12)",
                                }}
                            >
                                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                                    <div style={{ flex: "1 1 420px" }}>
                                        <div style={{ fontWeight: 700 }}>{d.title}</div>
                                        <div style={{ opacity: 0.75, marginTop: 4 }}>
                                            {d.original_filename} · {fmtBytes(d.byte_size)}
                                        </div>
                                        <div style={{ opacity: 0.55, marginTop: 4 }}>
                                            {d.created_at} · {d.created_by_email}
                                        </div>

                                        {link ? (
                                            <div style={{ marginTop: 8 }}>
                                                Magic link:{" "}
                                                <a href={link} style={{ textDecoration: "underline" }}>
                                                    {link}
                                                </a>
                                            </div>
                                        ) : (
                                            <div style={{ marginTop: 8, opacity: 0.7 }}>
                                                No alias yet.
                                            </div>
                                        )}
                                    </div>

                                    <div style={{ flex: "1 1 420px", display: "grid", gap: 10 }}>
                                        <form
                                            action={createOrAssignAliasAction}
                                            style={{
                                                display: "grid",
                                                gap: 8,
                                                padding: 12,
                                                borderRadius: 12,
                                                border: "1px solid rgba(255,255,255,0.1)",
                                            }}
                                        >
                                            <input type="hidden" name="docId" value={d.id} />
                                            <div style={{ fontWeight: 600 }}>Set alias</div>
                                            <input
                                                name="alias"
                                                placeholder="e.g. q3-report-2026"
                                                defaultValue={d.alias || ""}
                                                required
                                                style={{
                                                    padding: 10,
                                                    borderRadius: 10,
                                                    border: "1px solid rgba(255,255,255,0.2)",
                                                    background: "transparent",
                                                    color: "inherit",
                                                }}
                                            />
                                            <button
                                                type="submit"
                                                style={{
                                                    padding: "8px 12px",
                                                    borderRadius: 12,
                                                    border: "1px solid rgba(255,255,255,0.2)",
                                                    background: "rgba(255,255,255,0.06)",
                                                    color: "inherit",
                                                    cursor: "pointer",
                                                    width: "fit-content",
                                                }}
                                            >
                                                Save alias
                                            </button>
                                        </form>

                                        <form
                                            action={emailMagicLinkAction}
                                            style={{
                                                display: "grid",
                                                gap: 8,
                                                padding: 12,
                                                borderRadius: 12,
                                                border: "1px solid rgba(255,255,255,0.1)",
                                            }}
                                        >
                                            <input type="hidden" name="docId" value={d.id} />
                                            <input type="hidden" name="alias" value={d.alias || ""} />
                                            <div style={{ fontWeight: 600 }}>Email magic link</div>
                                            <input
                                                name="to"
                                                placeholder="recipient@email.com"
                                                required
                                                style={{
                                                    padding: 10,
                                                    borderRadius: 10,
                                                    border: "1px solid rgba(255,255,255,0.2)",
                                                    background: "transparent",
                                                    color: "inherit",
                                                }}
                                            />
                                            <input
                                                name="subject"
                                                placeholder="Subject (optional)"
                                                style={{
                                                    padding: 10,
                                                    borderRadius: 10,
                                                    border: "1px solid rgba(255,255,255,0.2)",
                                                    background: "transparent",
                                                    color: "inherit",
                                                }}
                                            />
                                            <div style={{ opacity: 0.7, fontSize: 13 }}>
                                                (Requires an alias first)
                                            </div>
                                            <button
                                                type="submit"
                                                style={{
                                                    padding: "8px 12px",
                                                    borderRadius: 12,
                                                    border: "1px solid rgba(255,255,255,0.2)",
                                                    background: "rgba(255,255,255,0.06)",
                                                    color: "inherit",
                                                    cursor: "pointer",
                                                    width: "fit-content",
                                                }}
                                                disabled={!d.alias}
                                                title={!d.alias ? "Set alias first" : "Send email"}
                                            >
                                                Send email
                                            </button>
                                        </form>
                                    </div>
                                </div>
                            </div>
                        );
                    })}

                    {rows.length === 0 ? (
                        <div style={{ opacity: 0.7 }}>No documents yet.</div>
                    ) : null}
                </div>
            </section>
        </div>
    );
}
