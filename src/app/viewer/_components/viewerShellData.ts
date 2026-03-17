import { getPlanForUser } from "@/lib/monetization";
import { sql } from "@/lib/db";

export type ViewerShellBadgeMap = Partial<Record<
  "documents" | "links",
  { tone: "default" | "warning" | "danger"; value: string }
>>;

export type ViewerShellContext = {
  workspaceName: string;
  workspaceLabel: string;
  roleLabel: string;
  planLabel: string;
  orgSlug: string | null;
  badges: ViewerShellBadgeMap;
};

type ViewerDocSummaryRow = {
  pending_scan: number | null;
  blocked_docs: number | null;
};

type ViewerLinkSummaryRow = {
  expiring_links: number | null;
};

type ViewerShellContextCacheEntry = {
  expiresAt: number;
  value: ViewerShellContext;
};

const viewerShellContextCache = new Map<string, ViewerShellContextCacheEntry>();
const viewerShellContextInFlight = new Map<string, Promise<ViewerShellContext>>();

function getViewerShellContextCacheMs() {
  const raw = Number(process.env.ADMIN_SHELL_CONTEXT_CACHE_MS || 30_000);
  if (!Number.isFinite(raw)) return 30_000;
  return Math.max(5_000, Math.min(2 * 60_000, Math.floor(raw)));
}

function cacheKey(args: { userId: string; orgId?: string | null; orgSlug?: string | null }) {
  return [args.userId, args.orgId ?? "", args.orgSlug ?? ""].join("|");
}

function fallbackContext(args: { orgSlug?: string | null }): ViewerShellContext {
  const workspaceName = args.orgSlug ? `${args.orgSlug} workspace` : "Doclinks workspace";
  return {
    workspaceName,
    workspaceLabel: "Member workspace",
    roleLabel: "Member",
    planLabel: "Workspace",
    orgSlug: args.orgSlug ?? null,
    badges: {},
  };
}

export async function getViewerShellContext(args: {
  userId: string;
  orgId?: string | null;
  orgSlug?: string | null;
}): Promise<ViewerShellContext> {
  const key = cacheKey(args);
  const cached = viewerShellContextCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const existing = viewerShellContextInFlight.get(key);
  if (existing) {
    return existing;
  }

  const pending = (async (): Promise<ViewerShellContext> => {
    const base = fallbackContext(args);
    const orgId = args.orgId ?? null;
    const orgFilter = orgId ? sql`and org_id = ${orgId}::uuid` : sql``;
    const shareFilter = orgId
      ? sql`and doc_id in (select id from public.docs where org_id = ${orgId}::uuid and owner_id = ${args.userId}::uuid)`
      : sql`and owner_id = ${args.userId}::uuid`;

    const [docSummary, linkSummary, plan] = await Promise.all([
      (sql`
        select
          count(*) filter (
            where lower(coalesce(status::text, 'ready')) <> 'deleted'
              and lower(coalesce(scan_status::text, 'unscanned')) in ('pending', 'running', 'not_scheduled', 'skipped')
          )::int as pending_scan,
          count(*) filter (
            where lower(coalesce(status::text, 'ready')) <> 'deleted'
              and (
                lower(coalesce(scan_status::text, 'unscanned')) in ('malicious', 'quarantined')
                or lower(coalesce(moderation_status::text, 'active')) in ('quarantined', 'blocked')
              )
          )::int as blocked_docs
        from public.docs
        where owner_id = ${args.userId}::uuid
        ${orgFilter}
      ` as Promise<ViewerDocSummaryRow[]>).catch(() => [] as ViewerDocSummaryRow[]),
      (sql`
        select
          count(*) filter (
            where revoked_at is null
              and expires_at is not null
              and expires_at > now()
              and expires_at <= now() + interval '7 days'
          )::int as expiring_links
        from public.share_tokens
        where 1=1
        ${shareFilter}
      ` as Promise<ViewerLinkSummaryRow[]>).catch(() => [] as ViewerLinkSummaryRow[]),
      getPlanForUser(args.userId).catch(() => null),
    ]);

    const badges: ViewerShellBadgeMap = {};
    const pendingScan = Number(docSummary?.[0]?.pending_scan ?? 0);
    const blockedDocs = Number(docSummary?.[0]?.blocked_docs ?? 0);
    if (blockedDocs > 0) {
      badges.documents = { tone: "danger", value: String(blockedDocs) };
    } else if (pendingScan > 0) {
      badges.documents = { tone: "warning", value: String(pendingScan) };
    }

    const expiringLinks = Number(linkSummary?.[0]?.expiring_links ?? 0);
    if (expiringLinks > 0) {
      badges.links = { tone: "warning", value: String(expiringLinks) };
    }

    const value: ViewerShellContext = {
      ...base,
      planLabel: plan?.name || base.planLabel,
      badges,
    };

    viewerShellContextCache.set(key, {
      value,
      expiresAt: Date.now() + getViewerShellContextCacheMs(),
    });
    return value;
  })().finally(() => {
    viewerShellContextInFlight.delete(key);
  });

  viewerShellContextInFlight.set(key, pending);
  return pending;
}
