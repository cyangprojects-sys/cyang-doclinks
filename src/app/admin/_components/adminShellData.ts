import { classifyBillingEntitlement, getBillingSnapshotForUser } from "@/lib/billingSubscription";
import { sql } from "@/lib/db";

export type AdminShellBadgeMap = Partial<Record<
  | "documents"
  | "links"
  | "security"
  | "team"
  | "governance"
  | "billing"
  | "integrations"
  | "review",
  { tone: "default" | "warning" | "danger"; value: string }
>>;

export type AdminShellBadgeKey = keyof AdminShellBadgeMap;

export type AdminShellContext = {
  workspaceName: string;
  workspaceLabel: string;
  roleLabel: string;
  planLabel: string;
  orgSlug: string | null;
  badges: AdminShellBadgeMap;
};

type AdminShellContextCacheEntry = {
  expiresAt: number;
  value: AdminShellContext;
};

const adminShellContextCache = new Map<string, AdminShellContextCacheEntry>();
const adminShellContextInFlight = new Map<string, Promise<AdminShellContext>>();

function getAdminShellContextCacheMs() {
  const raw = Number(process.env.ADMIN_SHELL_CONTEXT_CACHE_MS || 30_000);
  if (!Number.isFinite(raw)) return 30_000;
  return Math.max(5_000, Math.min(2 * 60_000, Math.floor(raw)));
}

function normalizeRequestedBadges(keys?: readonly AdminShellBadgeKey[]): AdminShellBadgeKey[] | null {
  if (!keys?.length) return null;
  return Array.from(new Set(keys)).sort();
}

function shouldLoadBadge(requested: ReadonlySet<AdminShellBadgeKey> | null, key: AdminShellBadgeKey) {
  return !requested || requested.has(key);
}

function getAdminShellContextCacheKey(args: {
  userId: string;
  orgId?: string | null;
  orgSlug?: string | null;
  isOwner: boolean;
  requestedBadges?: readonly AdminShellBadgeKey[] | null;
}) {
  const requested = args.requestedBadges?.length ? [...args.requestedBadges].sort().join(",") : "*";
  return [
    args.userId,
    args.orgId ?? "",
    args.orgSlug ?? "",
    args.isOwner ? "owner" : "admin",
    requested,
  ].join("|");
}

function setAdminShellContextCache(key: string, value: AdminShellContext) {
  adminShellContextCache.set(key, {
    value,
    expiresAt: Date.now() + getAdminShellContextCacheMs(),
  });

  if (adminShellContextCache.size > 200) {
    const oldestKey = adminShellContextCache.keys().next().value;
    if (oldestKey) adminShellContextCache.delete(oldestKey);
  }
}

function fallbackContext(args: {
  email?: string | null;
  orgSlug?: string | null;
  isOwner: boolean;
}): AdminShellContext {
  const workspaceName = args.orgSlug ? `${args.orgSlug} workspace` : "DocLinks workspace";
  return {
    workspaceName,
    workspaceLabel: args.isOwner ? "Owner workspace" : "Admin workspace",
    roleLabel: args.isOwner ? "Owner" : "Admin",
    planLabel: "Workspace",
    orgSlug: args.orgSlug ?? null,
    badges: {},
  };
}

export async function getAdminShellContext(args: {
  userId: string;
  email?: string | null;
  orgId?: string | null;
  orgSlug?: string | null;
  isOwner: boolean;
  requestedBadges?: readonly AdminShellBadgeKey[];
}): Promise<AdminShellContext> {
  const requestedBadges = normalizeRequestedBadges(args.requestedBadges);
  const cacheKey = getAdminShellContextCacheKey({ ...args, requestedBadges });
  const cached = adminShellContextCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const existing = adminShellContextInFlight.get(cacheKey);
  if (existing) {
    return existing;
  }

  const loadPromise = (async () => {
    const base = fallbackContext(args);
    const orgId = args.orgId ?? null;
    const orgFilter = orgId ? sql`and org_id = ${orgId}::uuid` : sql``;
    const requestedBadgeSet = requestedBadges ? new Set<AdminShellBadgeKey>(requestedBadges) : null;
    const badges: AdminShellBadgeMap = {};

    if (shouldLoadBadge(requestedBadgeSet, "documents")) {
      try {
        const docCounts = (await sql`
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
          where 1=1
          ${orgFilter}
        `) as unknown as Array<{ pending_scan: number; blocked_docs: number }>;
        const pendingScan = Number(docCounts?.[0]?.pending_scan ?? 0);
        const blockedDocs = Number(docCounts?.[0]?.blocked_docs ?? 0);
        if (blockedDocs > 0) {
          badges.documents = { tone: "danger", value: String(blockedDocs) };
        } else if (pendingScan > 0) {
          badges.documents = { tone: "warning", value: String(pendingScan) };
        }
      } catch {
        // Best-effort nav badges only.
      }
    }

    if (shouldLoadBadge(requestedBadgeSet, "links")) {
      try {
        const linkCounts = (await sql`
          select
            count(*) filter (
              where revoked_at is null
                and expires_at is not null
                and expires_at > now()
                and expires_at <= now() + interval '7 days'
            )::int as expiring_links
          from public.share_tokens
          where 1=1
          ${orgId ? sql`and doc_id in (select id from public.docs where org_id = ${orgId}::uuid)` : sql``}
        `) as unknown as Array<{ expiring_links: number }>;
        const expiringLinks = Number(linkCounts?.[0]?.expiring_links ?? 0);
        if (expiringLinks > 0) {
          badges.links = { tone: "warning", value: String(expiringLinks) };
        }
      } catch {
        // Best-effort nav badges only.
      }
    }

    if (shouldLoadBadge(requestedBadgeSet, "security")) {
      try {
        const securityRows = (await sql`
          select
            count(*) filter (
              where created_at > now() - interval '24 hours'
                and lower(coalesce(severity::text, 'low')) = 'high'
            )::int as high_events
          from public.security_events
        `) as unknown as Array<{ high_events: number }>;
        const highEvents = Number(securityRows?.[0]?.high_events ?? 0);
        if (highEvents > 0) {
          badges.security = { tone: "danger", value: String(highEvents) };
        }
      } catch {
        // Best-effort nav badges only.
      }
    }

    if (orgId && shouldLoadBadge(requestedBadgeSet, "team")) {
      try {
        const inviteRows = (await sql`
          select count(*)::int as pending_invites
          from public.org_invites
          where org_id = ${orgId}::uuid
            and accepted_at is null
            and revoked_at is null
        `) as unknown as Array<{ pending_invites: number }>;
        const pendingInvites = Number(inviteRows?.[0]?.pending_invites ?? 0);
        if (pendingInvites > 0) {
          badges.team = { tone: "warning", value: String(pendingInvites) };
        }
      } catch {
        // Best-effort nav badges only.
      }
    }

    if (args.isOwner && shouldLoadBadge(requestedBadgeSet, "review")) {
      try {
        const reviewRows = (await sql`
          select
            (
              coalesce((select count(*) from public.abuse_reports where lower(coalesce(status::text, 'open')) not in ('resolved', 'closed')), 0) +
              coalesce((select count(*) from public.dmca_notices where lower(coalesce(status::text, 'pending')) not in ('resolved', 'closed')), 0)
            )::int as open_cases
        `) as unknown as Array<{ open_cases: number }>;
        const openCases = Number(reviewRows?.[0]?.open_cases ?? 0);
        if (openCases > 0) {
          badges.review = { tone: "danger", value: String(openCases) };
        }
      } catch {
        // Best-effort nav badges only.
      }
    }

    if (args.isOwner && shouldLoadBadge(requestedBadgeSet, "billing")) {
      try {
        const snapshot = await getBillingSnapshotForUser(args.userId);
        const entitlement = classifyBillingEntitlement(snapshot.subscription);
        if (entitlement === "grace") {
          badges.billing = { tone: "warning", value: "!" };
        } else if (entitlement === "at_risk" || entitlement === "downgraded") {
          badges.billing = { tone: "danger", value: "!" };
        }
        base.planLabel = snapshot.subscription?.planId?.toUpperCase() || "Workspace";
      } catch {
        // Best-effort nav badges only.
      }
    }

    const value = {
      ...base,
      badges,
    };
    setAdminShellContextCache(cacheKey, value);
    return value;
  })().finally(() => {
    adminShellContextInFlight.delete(cacheKey);
  });

  adminShellContextInFlight.set(cacheKey, loadPromise);
  return loadPromise;
}
