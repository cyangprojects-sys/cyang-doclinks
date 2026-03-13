import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/authz";
import { sql } from "@/lib/db";
import {
  clearSharePasswordAction,
  extendShareExpirationAction,
  forceSharePasswordResetAction,
  resetShareViewsCountAction,
  revokeDocShareAction,
  setShareMaxViewsAction,
  setSharePasswordAction,
} from "../../actions";
import { AdminPageIntro, AdminSection } from "../../_components/AdminPagePrimitives";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function fmtDate(value: string | null) {
  if (!value) return "No date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function fmtInt(value: number | null | undefined) {
  const safe = Number(value ?? 0);
  try {
    return new Intl.NumberFormat().format(safe);
  } catch {
    return String(safe);
  }
}

export default async function LinkDetailPage({
  params,
}: {
  params: Promise<{ token: string }> | { token: string };
}) {
  const user = await requireRole("admin");
  const resolved = await Promise.resolve(params);
  const token = String(resolved.token || "").trim();
  if (!token) notFound();

  const orgFilter = user.orgId
    ? sql`and d.org_id = ${user.orgId}::uuid`
    : sql``;

  const linkRows = (await sql`
    select
      st.token::text as token,
      st.doc_id::text as doc_id,
      st.to_email::text as to_email,
      st.created_at::text as created_at,
      st.expires_at::text as expires_at,
      st.max_views::int as max_views,
      coalesce(st.views_count, 0)::int as view_count,
      st.revoked_at::text as revoked_at,
      (st.password_hash is not null)::boolean as has_password,
      d.title::text as doc_title,
      coalesce(d.scan_status::text, 'unscanned') as scan_status,
      coalesce(d.moderation_status::text, 'active') as moderation_status
    from public.share_tokens st
    join public.docs d on d.id = st.doc_id
    where st.token = ${token}
      ${orgFilter}
    limit 1
  `) as unknown as Array<{
    token: string;
    doc_id: string;
    to_email: string | null;
    created_at: string | null;
    expires_at: string | null;
    max_views: number | null;
    view_count: number;
    revoked_at: string | null;
    has_password: boolean;
    doc_title: string | null;
    scan_status: string | null;
    moderation_status: string | null;
  }>;

  const share = linkRows[0];
  if (!share) notFound();

  const activityRows = (await sql`
    select
      created_at::text as created_at,
      ip_hash::text as ip_hash,
      user_agent_hash::text as user_agent_hash
    from public.doc_views
    where doc_id = ${share.doc_id}::uuid
      and created_at >= ${share.created_at}::timestamptz
    order by created_at desc
    limit 20
  `.catch(() => [] as unknown[])) as Array<{
    created_at: string;
    ip_hash: string | null;
    user_agent_hash?: string | null;
  }>;

  const expiresSoon =
    share.expires_at &&
    new Date(share.expires_at).getTime() > Date.now() &&
    new Date(share.expires_at).getTime() <= Date.now() + 7 * 24 * 60 * 60 * 1000;
  const statusLabel = share.revoked_at
    ? "Access removed"
    : share.expires_at && new Date(share.expires_at).getTime() <= Date.now()
      ? "Expired"
      : expiresSoon
        ? "Expiring soon"
        : "Active";

  return (
    <div className="space-y-6">
      <AdminPageIntro
        eyebrow="Link Detail"
        title={share.doc_title || "Protected link"}
        description="Adjust one protected link without losing the surrounding document context. Keep expiry, password posture, and view controls tight when access needs to change."
        actions={
          <>
            <Link href="/admin/links" className="btn-base btn-secondary rounded-xl px-3 py-2 text-sm">
              Back to Links
            </Link>
            <Link href={`/s/${encodeURIComponent(share.token)}`} target="_blank" rel="noreferrer" className="btn-base btn-secondary rounded-xl px-3 py-2 text-sm">
              Open Link
            </Link>
          </>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="glass-card-strong rounded-[26px] p-5">
          <div className="text-xs uppercase tracking-[0.18em] text-white/45">Status</div>
          <div className="mt-3 text-2xl font-semibold text-white">{statusLabel}</div>
          <div className="mt-1 text-sm text-white/60">Current live access posture.</div>
        </div>
        <div className="glass-card-strong rounded-[26px] p-5">
          <div className="text-xs uppercase tracking-[0.18em] text-white/45">Views</div>
          <div className="mt-3 text-2xl font-semibold text-white">{fmtInt(share.view_count)}</div>
          <div className="mt-1 text-sm text-white/60">Total recorded opens for this link.</div>
        </div>
        <div className="glass-card-strong rounded-[26px] p-5">
          <div className="text-xs uppercase tracking-[0.18em] text-white/45">Recipient</div>
          <div className="mt-3 text-lg font-semibold text-white">{share.to_email || "No fixed recipient"}</div>
          <div className="mt-1 text-sm text-white/60">Recipient routing for this access path.</div>
        </div>
        <div className="glass-card-strong rounded-[26px] p-5">
          <div className="text-xs uppercase tracking-[0.18em] text-white/45">Expires</div>
          <div className="mt-3 text-lg font-semibold text-white">{fmtDate(share.expires_at)}</div>
          <div className="mt-1 text-sm text-white/60">Current expiry for this protected link.</div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1fr_minmax(0,0.95fr)]">
        <AdminSection
          title="Access settings"
          description="Change password posture, expiry, and view controls with clear one-link scope."
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <form action={setSharePasswordAction} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="text-sm font-medium text-white">Set or rotate password</div>
              <div className="mt-1 text-sm text-white/60">
                {share.has_password ? "This link is currently password protected." : "This link does not currently require a password."}
              </div>
              <input type="hidden" name="token" value={share.token} />
              <input
                type="password"
                name="password"
                minLength={4}
                placeholder="New password"
                className="mt-3 w-full rounded-xl border border-white/14 bg-black/20 px-3 py-2.5 text-sm text-white placeholder:text-white/38"
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="submit" className="btn-base rounded-xl border border-cyan-300/38 bg-cyan-300 px-3 py-2 text-sm font-semibold text-[#07131f] hover:bg-cyan-200">
                  Save Password
                </button>
                <button formAction={clearSharePasswordAction} className="btn-base btn-secondary rounded-xl px-3 py-2 text-sm">
                  Clear Password
                </button>
                <button formAction={forceSharePasswordResetAction} className="btn-base btn-secondary rounded-xl px-3 py-2 text-sm">
                  Clear Saved Unlocks
                </button>
              </div>
            </form>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="text-sm font-medium text-white">Expiry and view controls</div>
              <div className="mt-3 flex flex-wrap gap-2">
                <form action={extendShareExpirationAction}>
                  <input type="hidden" name="token" value={share.token} />
                  <input type="hidden" name="days" value="7" />
                  <button type="submit" className="btn-base btn-secondary rounded-xl px-3 py-2 text-sm">
                    Extend 7 days
                  </button>
                </form>
                <form action={extendShareExpirationAction}>
                  <input type="hidden" name="token" value={share.token} />
                  <input type="hidden" name="days" value="30" />
                  <button type="submit" className="btn-base btn-secondary rounded-xl px-3 py-2 text-sm">
                    Extend 30 days
                  </button>
                </form>
                <form action={resetShareViewsCountAction}>
                  <input type="hidden" name="token" value={share.token} />
                  <button type="submit" className="btn-base btn-secondary rounded-xl px-3 py-2 text-sm">
                    Reset Views
                  </button>
                </form>
              </div>

              <form action={setShareMaxViewsAction} className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
                <input type="hidden" name="token" value={share.token} />
                <label className="text-sm text-white/68">
                  Total view cap
                  <input
                    type="number"
                    min={0}
                    name="maxViews"
                    defaultValue={share.max_views ?? 0}
                    className="mt-2 w-full rounded-xl border border-white/14 bg-black/20 px-3 py-2.5 text-sm text-white"
                  />
                </label>
                <div className="mt-1 text-xs text-white/48">Use 0 to remove the cap.</div>
                <button type="submit" className="btn-base mt-3 rounded-xl border border-white/12 bg-white/[0.06] px-3 py-2 text-sm text-white/82 hover:bg-white/[0.1]">
                  Save View Cap
                </button>
              </form>
            </div>
          </div>
        </AdminSection>

        <AdminSection
          title="Destructive actions"
          description="Use these when a recipient should immediately lose access."
        >
          <div className="rounded-2xl border border-rose-400/26 bg-rose-400/[0.08] p-4">
            <div className="text-sm font-medium text-white">Remove this link</div>
            <div className="mt-1 text-sm text-white/62">Revoking the link blocks further access without touching the underlying document.</div>
            <form action={revokeDocShareAction} className="mt-4">
              <input type="hidden" name="token" value={share.token} />
              <button type="submit" className="btn-base rounded-xl border border-rose-300/28 bg-rose-400/14 px-3 py-2 text-sm text-rose-50 hover:bg-rose-400/20">
                Revoke Access
              </button>
            </form>
          </div>

          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="text-xs uppercase tracking-[0.16em] text-white/45">Link summary</div>
            <div className="mt-3 space-y-2 text-sm text-white/68">
              <div>Token: <span className="font-mono text-white/82">{share.token}</span></div>
              <div>Created: <span className="text-white/82">{fmtDate(share.created_at)}</span></div>
              <div>Document: <span className="text-white/82">{share.doc_title || share.doc_id}</span></div>
              <div>Scan state: <span className="text-white/82">{share.scan_status || "unknown"}</span></div>
            </div>
          </div>
        </AdminSection>
      </div>

      <AdminSection
        title="Recent activity"
        description="Token-level event logging is still limited, so this feed shows document activity since this link was created."
      >
        <div className="overflow-hidden rounded-2xl border border-white/10">
          <div className="max-h-[380px] overflow-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 bg-[#10192b]/95 text-xs text-white/58 backdrop-blur">
                <tr>
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">IP Hash</th>
                  <th className="px-4 py-3">Device Hash</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {activityRows.length ? (
                  activityRows.map((row, index) => (
                    <tr key={`${row.created_at}-${index}`} className="bg-black/10">
                      <td className="px-4 py-3 text-white/62">{fmtDate(row.created_at)}</td>
                      <td className="px-4 py-3 font-mono text-xs text-white/78">{row.ip_hash || "Unknown"}</td>
                      <td className="px-4 py-3 font-mono text-xs text-white/62">{row.user_agent_hash || "Unavailable"}</td>
                    </tr>
                  ))
                ) : (
                  <tr className="bg-black/10">
                    <td colSpan={3} className="px-4 py-10 text-center text-sm text-white/54">
                      No activity has been recorded since this link was created.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </AdminSection>
    </div>
  );
}
