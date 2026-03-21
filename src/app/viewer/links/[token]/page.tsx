import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireDocWrite, requireUser } from "@/lib/authz";
import { sql } from "@/lib/db";
import {
  clearSharePasswordAction,
  extendShareExpirationAction,
  forceSharePasswordResetAction,
  resetShareViewsCountAction,
  revokeDocShareAction,
  setShareMaxViewsAction,
  setSharePasswordAction,
} from "@/app/admin/actions";
import { AdminPageIntro, AdminSection } from "@/app/admin/_components/AdminPagePrimitives";

export const runtime = "nodejs";

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

export default async function ViewerLinkDetailPage({
  params,
}: {
  params: Promise<{ token: string }> | { token: string };
}) {
  let user;
  try {
    user = await requireUser();
  } catch {
    redirect("/signin");
  }

  const resolved = await Promise.resolve(params);
  const token = String(resolved.token || "").trim();
  if (!token) notFound();

  if (user.role === "admin" || user.role === "owner") {
    redirect(`/admin/links/${encodeURIComponent(token)}`);
  }

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
  try {
    await requireDocWrite(share.doc_id);
  } catch {
    notFound();
  }

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
            <Link href="/viewer/links" className="btn-base btn-secondary rounded-sm px-3 py-2 text-sm">
              Back to Links
            </Link>
            <Link href={`/s/${encodeURIComponent(share.token)}`} target="_blank" rel="noreferrer" className="btn-base btn-secondary rounded-sm px-3 py-2 text-sm">
              Open Link
            </Link>
          </>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="surface-panel p-5">
          <div className="text-xs uppercase tracking-[0.18em] text-[var(--text-faint)]">Status</div>
          <div className="mt-3 text-2xl font-semibold text-slate-950">{statusLabel}</div>
          <div className="mt-1 text-sm text-[var(--text-secondary)]">Current live access posture.</div>
        </div>
        <div className="surface-panel p-5">
          <div className="text-xs uppercase tracking-[0.18em] text-[var(--text-faint)]">Views</div>
          <div className="mt-3 text-2xl font-semibold text-slate-950">{fmtInt(share.view_count)}</div>
          <div className="mt-1 text-sm text-[var(--text-secondary)]">Total recorded opens for this link.</div>
        </div>
        <div className="surface-panel p-5">
          <div className="text-xs uppercase tracking-[0.18em] text-[var(--text-faint)]">Recipient</div>
          <div className="mt-3 text-lg font-semibold text-slate-950">{share.to_email || "No fixed recipient"}</div>
          <div className="mt-1 text-sm text-[var(--text-secondary)]">Recipient routing for this access path.</div>
        </div>
        <div className="surface-panel p-5">
          <div className="text-xs uppercase tracking-[0.18em] text-[var(--text-faint)]">Expires</div>
          <div className="mt-3 text-lg font-semibold text-slate-950">{fmtDate(share.expires_at)}</div>
          <div className="mt-1 text-sm text-[var(--text-secondary)]">Current expiry for this protected link.</div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1fr_minmax(0,0.95fr)]">
        <AdminSection
          title="Access settings"
          description="Change password posture, expiry, and view controls with clear one-link scope."
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <form action={setSharePasswordAction} className="surface-panel-soft p-4">
              <div className="text-sm font-medium text-slate-950">Set or rotate password</div>
              <div className="mt-1 text-sm text-[var(--text-secondary)]">
                {share.has_password ? "This link is currently password protected." : "This link does not currently require a password."}
              </div>
              <input type="hidden" name="token" value={share.token} />
              <input
                type="password"
                name="password"
                minLength={4}
                placeholder="New password"
                className="field-input mt-3 w-full px-3 py-2.5 text-sm"
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="submit" className="btn-base btn-primary rounded-sm px-3 py-2 text-sm font-semibold">
                  Save Password
                </button>
                <button formAction={clearSharePasswordAction} className="btn-base btn-secondary rounded-sm px-3 py-2 text-sm">
                  Clear Password
                </button>
                <button formAction={forceSharePasswordResetAction} className="btn-base btn-secondary rounded-sm px-3 py-2 text-sm">
                  Clear Saved Unlocks
                </button>
              </div>
            </form>

            <div className="surface-panel-soft p-4">
              <div className="text-sm font-medium text-slate-950">Expiry and view controls</div>
              <div className="mt-3 flex flex-wrap gap-2">
                <form action={extendShareExpirationAction}>
                  <input type="hidden" name="token" value={share.token} />
                  <input type="hidden" name="days" value="7" />
                  <button type="submit" className="btn-base btn-secondary rounded-sm px-3 py-2 text-sm">
                    Extend 7 days
                  </button>
                </form>
                <form action={extendShareExpirationAction}>
                  <input type="hidden" name="token" value={share.token} />
                  <input type="hidden" name="days" value="30" />
                  <button type="submit" className="btn-base btn-secondary rounded-sm px-3 py-2 text-sm">
                    Extend 30 days
                  </button>
                </form>
                <form action={resetShareViewsCountAction}>
                  <input type="hidden" name="token" value={share.token} />
                  <button type="submit" className="btn-base btn-secondary rounded-sm px-3 py-2 text-sm">
                    Reset Views
                  </button>
                </form>
              </div>

              <form action={setShareMaxViewsAction} className="mt-4 rounded-sm border border-[var(--border-subtle)] bg-white p-4">
                <input type="hidden" name="token" value={share.token} />
                <label className="text-sm text-[var(--text-secondary)]">
                  Total view cap
                  <input
                    type="number"
                    min={0}
                    name="maxViews"
                    defaultValue={share.max_views ?? 0}
                    className="field-input mt-2 w-full px-3 py-2.5 text-sm"
                  />
                </label>
                <div className="mt-1 text-xs text-[var(--text-faint)]">Use 0 to remove the cap.</div>
                <button type="submit" className="btn-base btn-secondary mt-3 rounded-sm px-3 py-2 text-sm">
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
          <div className="rounded-sm border border-[rgba(186,71,50,0.18)] bg-[rgba(186,71,50,0.06)] p-4">
            <div className="text-sm font-medium text-slate-950">Remove this link</div>
            <div className="mt-1 text-sm text-[var(--text-secondary)]">Revoking the link blocks further access without touching the underlying document.</div>
            <form action={revokeDocShareAction} className="mt-4">
              <input type="hidden" name="token" value={share.token} />
              <button type="submit" className="btn-base rounded-sm border border-[rgba(186,71,50,0.2)] bg-[rgba(186,71,50,0.09)] px-3 py-2 text-sm text-[var(--danger)] hover:bg-[rgba(186,71,50,0.14)]">
                Revoke Access
              </button>
            </form>
          </div>

          <div className="mt-4 rounded-sm border border-[var(--border-subtle)] bg-[var(--surface-soft)] p-4">
            <div className="text-xs uppercase tracking-[0.16em] text-[var(--text-faint)]">Link summary</div>
            <div className="mt-3 space-y-2 text-sm text-[var(--text-secondary)]">
              <div>Token: <span className="font-mono text-slate-950">{share.token}</span></div>
              <div>Created: <span className="text-slate-950">{fmtDate(share.created_at)}</span></div>
              <div>Document: <span className="text-slate-950">{share.doc_title || share.doc_id}</span></div>
              <div>Scan state: <span className="text-slate-950">{share.scan_status || "unknown"}</span></div>
            </div>
          </div>
        </AdminSection>
      </div>

      <AdminSection
        title="Recent activity"
        description="Token-level event logging is still limited, so this feed shows document activity since this link was created."
      >
        <div className="overflow-hidden rounded-sm border border-[var(--border-subtle)]">
          <div className="max-h-[380px] overflow-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 bg-[var(--surface-soft)] text-xs text-[var(--text-faint)] backdrop-blur">
                <tr>
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">IP Hash</th>
                  <th className="px-4 py-3">Device Hash</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {activityRows.length ? (
                  activityRows.map((row, index) => (
                    <tr key={`${row.created_at}-${index}`} className="bg-white">
                      <td className="px-4 py-3 text-[var(--text-secondary)]">{fmtDate(row.created_at)}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-950">{row.ip_hash || "Unknown"}</td>
                      <td className="px-4 py-3 font-mono text-xs text-[var(--text-secondary)]">{row.user_agent_hash || "Unavailable"}</td>
                    </tr>
                  ))
                ) : (
                  <tr className="bg-white">
                    <td colSpan={3} className="px-4 py-10 text-center text-sm text-[var(--text-secondary)]">
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
