import {
    uploadPdfAction,
    createOrAssignAliasAction,
    emailMagicLinkAction,
    deleteDocAction,
} from "./actions";
import DeleteDocForm from "./DeleteDocForm";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type DocRow = {
    id: string;
    title: string;
    original_filename: string;
    byte_size: number;
    created_at: string;
    r2_key: string;
    alias: string | null;
};

function formatBytes(n: number) {
    if (!Number.isFinite(n)) return "";
    if (n < 1024) return `${n} B`;
    const kb = n / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    return `${mb.toFixed(1)} MB`;
}

export default async function AdminPage() {
    const rows = (await sql`
    select
      d.id::text as id,
      d.title,
      d.original_filename,
      d.byte_size,
      d.created_at::text as created_at,
      d.r2_key,
      (
        select a.alias
        from doc_aliases a
        where a.doc_id = d.id
        order by a.created_at desc nulls last
        limit 1
      ) as alias
    from docs d
    order by d.created_at desc
    limit 200
  `) as unknown as DocRow[];

    return (
        <div style={{ display: "grid", gap: 18 }}>
            <section
                style={{
                    padding: 16,
                    borderRadius: 16,
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: "rgba(255,255,255,0.03)",
                }}
            >
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>
                    Upload PDF
                </div>

                <form action={uploadPdfAction} style={{ display: "grid", gap: 10 }}>
                    <label style={{ display: "grid", gap: 6 }}>
                        <div style={{ opacity: 0.8 }}>Title</div>
                        <input
                            name="title"
                            required
                            placeholder="e.g. Final Clearance Memo"
                            style={{
                                padding: 10,
                                borderRadius: 12,
                                border: "1px solid rgba(255,255,255,0.18)",
                                background: "rgba(0,0,0,0.25)",
                                color: "white",
                            }}
                        />
                    </label>

                    <label style={{ display: "grid", gap: 6 }}>
                        <div style={{ opacity: 0.8 }}>PDF File</div>
                        <input
                            type="file"
                            name="file"
                            accept="application/pdf"
                            required
                            style={{ color: "white" }}
                        />
                    </label>

                    <div>
                        <button
                            type="submit"
                            style={{
                                padding: "10px 14px",
                                borderRadius: 12,
                                border: "1px solid rgba(255,255,255,0.18)",
                                background: "rgba(255,255,255,0.07)",
                                color: "white",
                                cursor: "pointer",
                                fontWeight: 600,
                            }}
                        >
                            Upload
                        </button>
                    </div>
                </form>
            </section>

            <section
                style={{
                    padding: 16,
                    borderRadius: 16,
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: "rgba(255,255,255,0.03)",
                }}
            >
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>
                    Documents
                </div>

                <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
                        <thead>
                            <tr style={{ textAlign: "left", opacity: 0.75 }}>
                                <th style={{ padding: 10 }}>Title</th>
                                <th style={{ padding: 10 }}>File</th>
                                <th style={{ padding: 10 }}>Size</th>
                                <th style={{ padding: 10 }}>Alias</th>
                                <th style={{ padding: 10 }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((d) => (
                                <tr key={d.id} style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                                    <td style={{ padding: 10, verticalAlign: "top" }}>
                                        <div style={{ fontWeight: 650 }}>{d.title}</div>
                                        <div style={{ opacity: 0.6, marginTop: 4, fontSize: 12 }}>
                                            {d.created_at}
                                        </div>
                                        <div style={{ opacity: 0.6, marginTop: 4, fontSize: 12 }}>
                                            id: {d.id}
                                        </div>
                                    </td>

                                    <td style={{ padding: 10, verticalAlign: "top" }}>
                                        <div style={{ opacity: 0.8 }}>{d.original_filename}</div>
                                        <div style={{ opacity: 0.5, marginTop: 4, fontSize: 12 }}>
                                            {d.r2_key}
                                        </div>
                                    </td>

                                    <td style={{ padding: 10, verticalAlign: "top" }}>
                                        {formatBytes(d.byte_size)}
                                    </td>

                                    <td style={{ padding: 10, verticalAlign: "top" }}>
                                        <div style={{ marginBottom: 10 }}>
                                            <div style={{ fontSize: 12, opacity: 0.7 }}>Current</div>
                                            <div style={{ fontWeight: 600 }}>
                                                {d.alias ? d.alias : <span style={{ opacity: 0.6 }}>—</span>}
                                            </div>
                                            {d.alias ? (
                                                <div style={{ marginTop: 6 }}>
                                                    <a
                                                        href={`/d/${d.alias}`}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        style={{ opacity: 0.85 }}
                                                    >
                                                        Open link
                                                    </a>
                                                </div>
                                            ) : null}
                                        </div>

                                        <form action={createOrAssignAliasAction} style={{ display: "grid", gap: 8 }}>
                                            <input type="hidden" name="docId" value={d.id} />
                                            <input
                                                name="alias"
                                                placeholder="new-alias"
                                                style={{
                                                    padding: 8,
                                                    borderRadius: 10,
                                                    border: "1px solid rgba(255,255,255,0.18)",
                                                    background: "rgba(0,0,0,0.25)",
                                                    color: "white",
                                                }}
                                            />
                                            <button
                                                type="submit"
                                                style={{
                                                    padding: "8px 10px",
                                                    borderRadius: 10,
                                                    border: "1px solid rgba(255,255,255,0.18)",
                                                    background: "rgba(255,255,255,0.07)",
                                                    color: "white",
                                                    cursor: "pointer",
                                                }}
                                            >
                                                Set alias
                                            </button>
                                        </form>
                                    </td>

                                    <td style={{ padding: 10, verticalAlign: "top" }}>
                                        <div style={{ display: "grid", gap: 10 }}>
                                            <form action={emailMagicLinkAction} style={{ display: "grid", gap: 8 }}>
                                                <input type="hidden" name="docId" value={d.id} />
                                                <input type="hidden" name="alias" value={d.alias || ""} />
                                                <input
                                                    name="to"
                                                    placeholder="email@example.com"
                                                    style={{
                                                        padding: 8,
                                                        borderRadius: 10,
                                                        border: "1px solid rgba(255,255,255,0.18)",
                                                        background: "rgba(0,0,0,0.25)",
                                                        color: "white",
                                                    }}
                                                />
                                                <button
                                                    type="submit"
                                                    disabled={!d.alias}
                                                    title={!d.alias ? "Set an alias first" : "Send email"}
                                                    style={{
                                                        padding: "8px 10px",
                                                        borderRadius: 10,
                                                        border: "1px solid rgba(255,255,255,0.18)",
                                                        background: d.alias ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.03)",
                                                        color: "white",
                                                        cursor: d.alias ? "pointer" : "not-allowed",
                                                        opacity: d.alias ? 1 : 0.6,
                                                    }}
                                                >
                                                    Email link
                                                </button>
                                            </form>

                                            <div style={{ paddingTop: 6 }}>
                                                <DeleteDocForm docId={d.id} title={d.title} action={deleteDocAction} />
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            ))}

                            {rows.length === 0 ? (
                                <tr>
                                    <td colSpan={5} style={{ padding: 12, opacity: 0.7 }}>
                                        No documents yet.
                                    </td>
                                </tr>
                            ) : null}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
}
