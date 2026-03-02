import { sql } from "@/lib/db";
import DmcaActionsClient from "./DmcaActionsClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = {
  id: string;
  created_at: string;
  status: string;

  doc_id: string | null;
  share_token: string | null;

  requester_email: string | null;
  requester_name: string | null;
  claimant_company: string | null;

  message: string | null;

  doc_title: string | null;
  moderation_status: string | null;
  scan_status: string | null;
  risk_level: string | null;
  dmca_status: string | null;
};

export default async function DmcaPage() {
  const rows = (await sql`
    select
      n.id::text as id,
      n.created_at::text as created_at,
      n.status::text as status,
      n.doc_id::text as doc_id,
      n.share_token::text as share_token,
      n.requester_email::text as requester_email,
      n.requester_name::text as requester_name,
      n.claimant_company::text as claimant_company,
      n.message::text as message,

      d.title::text as doc_title,
      d.moderation_status::text as moderation_status,
      d.scan_status::text as scan_status,
      d.risk_level::text as risk_level,
      d.dmca_status::text as dmca_status
    from public.dmca_notices n
    left join public.docs d on d.id = n.doc_id
    order by n.created_at desc
    limit 200
  `) as unknown as Row[];

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs text-white/60">Owner</div>
          <h1 className="mt-1 text-xl font-semibold text-white">DMCA / takedown notices</h1>
          <div className="mt-1 text-sm text-white/60">
            New notices auto-quarantine the referenced doc (if resolvable). High-risk docs remain quarantined until
            reviewed.
          </div>
        </div>
      </div>

      <div className="mt-6 space-y-3">
        {rows.length === 0 ? (
          <div className="glass-card-strong rounded-2xl p-5 text-sm text-white/60">No notices yet.</div>
        ) : null}

        <div className="max-h-[920px] space-y-3 overflow-auto pr-1">
        {rows.map((r) => (
          <div key={r.id} className="glass-card-strong rounded-2xl p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-[260px]">
                <div className="text-xs text-white/50">{r.created_at}</div>
                <div className="mt-1 text-sm font-medium text-white">
                  {r.doc_title || r.doc_id || r.share_token || "Unresolved notice"}
                </div>
                <div className="mt-1 text-xs text-white/50">
                  dmca_status: {r.dmca_status || "n/a"} · moderation: {r.moderation_status || "n/a"} · scan:{" "}
                  {r.scan_status || "n/a"} · risk: {r.risk_level || "n/a"}
                </div>
                <div className="mt-2 text-xs text-white/60">
                  From: {r.requester_name || "Unknown"} {r.requester_email ? `(${r.requester_email})` : ""}
                  {r.claimant_company ? ` · ${r.claimant_company}` : ""}
                </div>
              </div>

              <div className="flex-1">
                <div className="text-xs text-white/40">Message</div>
                <div className="mt-1 whitespace-pre-wrap text-sm text-white/80">{r.message || "(no message)"}</div>

                <div className="mt-4">
                  <DmcaActionsClient noticeId={r.id} docId={r.doc_id} status={r.status} />
                </div>
              </div>
            </div>
          </div>
        ))}
        </div>
      </div>

      <div className="glass-card-strong mt-10 rounded-2xl p-5">
        <div className="text-sm font-medium text-white">Public endpoint</div>
        <div className="mt-1 text-sm text-white/60">
          Accepts JSON POST to <code className="rounded bg-black/30 px-1 py-0.5">/api/v1/takedown</code> with{" "}
          <code className="rounded bg-black/30 px-1 py-0.5">token</code>,{" "}
          <code className="rounded bg-black/30 px-1 py-0.5">alias</code>, or{" "}
          <code className="rounded bg-black/30 px-1 py-0.5">doc_id</code>.
        </div>
      </div>
    </main>
  );
}
