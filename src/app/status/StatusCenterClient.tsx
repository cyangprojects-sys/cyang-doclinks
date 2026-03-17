"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { deriveStatusPageScenario, type PlatformState, type StatusSnapshot } from "@/lib/statusPageScenario";

type ServiceState = PlatformState;
type IncidentState = "investigating" | "identified" | "monitoring" | "resolved";

type ServiceItem = {
  key: string;
  name: string;
  description: string;
  status: ServiceState;
  latencyMs: number | null;
  uptime30d: number;
  trend: number[];
};

type IncidentUpdate = {
  status: IncidentState;
  timestamp: string;
  message: string;
};

type IncidentItem = {
  id: string;
  title: string;
  summary: string;
  status: IncidentState;
  startedAt: string;
  resolvedAt: string | null;
  updates: IncidentUpdate[];
};

type UptimeDay = {
  date: string;
  status: PlatformState;
};

export type StatusPreview =
  | "live"
  | "operational"
  | "degraded"
  | "partial_outage"
  | "major_outage"
  | "maintenance"
  | "loading";

const PREVIEW_VALUES = new Set<StatusPreview>([
  "live",
  "operational",
  "degraded",
  "partial_outage",
  "major_outage",
  "maintenance",
  "loading",
]);

const AUTO_REFRESH_MS = 120_000;
const STATUS_SUBSCRIBE_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STATUS_SUBSCRIBE_STORAGE_KEY = "cyang_status_subscription_email";

type StatusSubscribeApiResponse = {
  ok?: boolean;
  message?: string;
};

const SERVICE_CATALOG: Array<{
  key: string;
  name: string;
  description: string;
  baseLatency: number | null;
  baseUptime: number;
}> = [
  { key: "website", name: "Website", description: "Marketing site and customer entry routes.", baseLatency: 118, baseUptime: 99.99 },
  { key: "api", name: "API", description: "Core API endpoints for docs, links, and account actions.", baseLatency: 152, baseUptime: 99.98 },
  { key: "protected_links", name: "Protected Links", description: "Token generation, access checks, and secure delivery.", baseLatency: 164, baseUptime: 99.97 },
  { key: "file_uploads", name: "File Uploads", description: "Signed upload flow and transfer handling.", baseLatency: 228, baseUptime: 99.95 },
  { key: "document_processing", name: "Document Processing", description: "Scan queue, sanitization, and processing workers.", baseLatency: 304, baseUptime: 99.93 },
  { key: "authentication", name: "Authentication", description: "Google, SSO, and email sign-in flows.", baseLatency: 136, baseUptime: 99.99 },
  { key: "admin_dashboard", name: "Workspace Dashboard", description: "Workspace operations and controls.", baseLatency: 182, baseUptime: 99.96 },
  { key: "member_access", name: "Member Access", description: "Member workspace access and document workflows.", baseLatency: 176, baseUptime: 99.97 },
  { key: "email_delivery", name: "Email Delivery", description: "Transactional notifications and share emails.", baseLatency: 248, baseUptime: 99.92 },
  { key: "background_jobs", name: "Background Jobs", description: "Scheduled scans, retention, and maintenance tasks.", baseLatency: null, baseUptime: 99.9 },
];

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function isoDaysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function statusRank(status: PlatformState) {
  if (status === "major_outage") return 5;
  if (status === "partial_outage") return 4;
  if (status === "degraded") return 3;
  if (status === "maintenance") return 2;
  return 1;
}

function statusConfig(status: PlatformState) {
  if (status === "operational") {
    return {
      label: "Operational",
      short: "Operational",
      badge: "border-emerald-400/30 bg-emerald-400/12 text-emerald-100",
      dot: "bg-emerald-300/90",
      headline: "All core systems are operating normally.",
      summary: "Customers can sign in, share protected links, and access documents without disruption.",
    };
  }
  if (status === "degraded") {
    return {
      label: "Degraded Performance",
      short: "Degraded",
      badge: "border-amber-400/30 bg-amber-400/12 text-amber-100",
      dot: "bg-amber-300/90",
      headline: "Some services are slower than normal.",
      summary: "Core availability is intact, but response times are elevated for selected workflows.",
    };
  }
  if (status === "partial_outage") {
    return {
      label: "Partial Outage",
      short: "Partial outage",
      badge: "border-orange-400/30 bg-orange-400/12 text-orange-100",
      dot: "bg-orange-300/90",
      headline: "A subset of services is currently unavailable.",
      summary: "Customers may see intermittent failures in affected workflows while we restore full service.",
    };
  }
  if (status === "major_outage") {
    return {
      label: "Major Outage",
      short: "Major outage",
      badge: "border-rose-400/35 bg-rose-400/14 text-rose-100",
      dot: "bg-rose-300/90",
      headline: "We are actively responding to a major service disruption.",
      summary: "Multiple core workflows are impacted. Updates will be posted as mitigation progresses.",
    };
  }
  return {
    label: "Maintenance",
    short: "Maintenance",
    badge: "border-sky-400/30 bg-sky-400/12 text-sky-100",
    dot: "bg-sky-300/90",
    headline: "Scheduled maintenance is in progress.",
    summary: "Some operations may be delayed while planned maintenance tasks complete.",
  };
}

function incidentStateConfig(status: IncidentState) {
  if (status === "investigating") return { label: "Investigating", badge: "border-amber-400/30 bg-amber-400/12 text-amber-100" };
  if (status === "identified") return { label: "Identified", badge: "border-orange-400/30 bg-orange-400/12 text-orange-100" };
  if (status === "monitoring") return { label: "Monitoring", badge: "border-sky-400/30 bg-sky-400/12 text-sky-100" };
  return { label: "Resolved", badge: "border-emerald-400/30 bg-emerald-400/12 text-emerald-100" };
}

function latencyForStatus(baseLatency: number | null, status: ServiceState) {
  if (baseLatency == null) return null;
  if (status === "operational") return baseLatency;
  if (status === "maintenance") return Math.round(baseLatency * 1.08);
  if (status === "degraded") return Math.round(baseLatency * 1.44);
  if (status === "partial_outage") return Math.round(baseLatency * 1.72);
  return Math.round(baseLatency * 2.2);
}

function uptimeForStatus(base: number, status: ServiceState) {
  if (status === "operational") return base;
  if (status === "maintenance") return clamp(base - 0.05, 97, 99.99);
  if (status === "degraded") return clamp(base - 0.2, 95, 99.99);
  if (status === "partial_outage") return clamp(base - 1.3, 90, 99.99);
  return clamp(base - 3.8, 80, 99.99);
}

function trendForStatus(status: ServiceState) {
  if (status === "operational") return [97, 98, 98, 99, 99, 99, 100];
  if (status === "maintenance") return [99, 99, 98, 96, 95, 97, 99];
  if (status === "degraded") return [93, 92, 90, 88, 89, 90, 91];
  if (status === "partial_outage") return [86, 82, 80, 78, 79, 81, 83];
  return [70, 62, 55, 48, 50, 53, 58];
}

function serviceStatusForScenario(key: string, scenario: PlatformState): ServiceState {
  if (scenario === "operational") return "operational";
  if (scenario === "maintenance") {
    if (key === "background_jobs" || key === "document_processing") return "maintenance";
    return "operational";
  }
  if (scenario === "degraded") {
    if (key === "api" || key === "protected_links" || key === "file_uploads" || key === "document_processing") return "degraded";
    return "operational";
  }
  if (scenario === "partial_outage") {
    if (key === "authentication" || key === "member_access") return "partial_outage";
    if (key === "api" || key === "admin_dashboard" || key === "protected_links") return "degraded";
    return "operational";
  }
  if (key === "api" || key === "authentication" || key === "protected_links" || key === "member_access") return "major_outage";
  if (key === "website" || key === "admin_dashboard" || key === "file_uploads") return "partial_outage";
  return "degraded";
}

function buildServices(scenario: PlatformState): ServiceItem[] {
  return SERVICE_CATALOG.map((item) => {
    const status = serviceStatusForScenario(item.key, scenario);
    return {
      key: item.key,
      name: item.name,
      description: item.description,
      status,
      latencyMs: latencyForStatus(item.baseLatency, status),
      uptime30d: uptimeForStatus(item.baseUptime, status),
      trend: trendForStatus(status),
    };
  });
}

function buildIncidents(scenario: PlatformState): IncidentItem[] {
  if (scenario === "operational") return [];
  if (scenario === "degraded") {
    return [
      {
        id: "inc-latency-links",
        title: "Elevated latency for protected link creation",
        summary: "A subset of customers may notice slower protected link creation requests.",
        status: "investigating",
        startedAt: isoDaysAgo(0),
        resolvedAt: null,
        updates: [
          {
            status: "investigating",
            timestamp: new Date(Date.now() - 26 * 60 * 1000).toISOString(),
            message: "We are investigating elevated response times for link creation endpoints.",
          },
        ],
      },
    ];
  }
  if (scenario === "partial_outage") {
    return [
      {
        id: "inc-auth-intermittent",
        title: "Intermittent authentication failures",
        summary: "Sign-in attempts may fail intermittently while mitigation is rolled out.",
        status: "identified",
        startedAt: isoDaysAgo(0),
        resolvedAt: null,
        updates: [
          { status: "investigating", timestamp: new Date(Date.now() - 48 * 60 * 1000).toISOString(), message: "We are investigating sign-in failures impacting a subset of users." },
          { status: "identified", timestamp: new Date(Date.now() - 22 * 60 * 1000).toISOString(), message: "Root cause identified. Mitigation rollout is in progress." },
        ],
      },
    ];
  }
  if (scenario === "major_outage") {
    return [
      {
        id: "inc-platform-major",
        title: "Platform-wide service disruption",
        summary: "Core workflows are impacted. Recovery is in progress.",
        status: "investigating",
        startedAt: isoDaysAgo(0),
        resolvedAt: null,
        updates: [
          { status: "investigating", timestamp: new Date(Date.now() - 34 * 60 * 1000).toISOString(), message: "We are investigating broad service availability issues." },
        ],
      },
    ];
  }
  return [
    {
      id: "inc-maint-window",
      title: "Scheduled platform maintenance",
      summary: "Planned maintenance is active. Some workflows may experience short delays.",
      status: "monitoring",
      startedAt: isoDaysAgo(0),
      resolvedAt: null,
      updates: [
        { status: "monitoring", timestamp: new Date(Date.now() - 20 * 60 * 1000).toISOString(), message: "Maintenance tasks are running as planned with limited customer impact." },
      ],
    },
  ];
}

function buildUptime(scenario: PlatformState): UptimeDay[] {
  const days: UptimeDay[] = [];
  for (let i = 29; i >= 0; i -= 1) {
    days.push({ date: isoDaysAgo(i), status: "operational" });
  }
  if (scenario === "degraded") {
    days[24].status = "degraded";
    days[29].status = "degraded";
  } else if (scenario === "partial_outage") {
    days[19].status = "degraded";
    days[27].status = "partial_outage";
  } else if (scenario === "major_outage") {
    days[18].status = "degraded";
    days[26].status = "partial_outage";
    days[29].status = "major_outage";
  } else if (scenario === "maintenance") {
    days[28].status = "maintenance";
    days[29].status = "maintenance";
  }
  return days;
}

function uptimeWeight(status: PlatformState) {
  if (status === "operational") return 100;
  if (status === "degraded") return 99.4;
  if (status === "maintenance") return 99.8;
  if (status === "partial_outage") return 96;
  return 85;
}

function dailyBarClass(status: PlatformState) {
  if (status === "operational") return "bg-emerald-300/90";
  if (status === "degraded") return "bg-amber-300/90";
  if (status === "maintenance") return "bg-sky-300/90";
  if (status === "partial_outage") return "bg-orange-300/90";
  return "bg-rose-300/90";
}

function fmtDateTime(value: string | number | null) {
  if (!value) return "Unavailable";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function fmtRelative(value: string | number | null) {
  if (!value) return "Unavailable";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Unavailable";
  const minutes = Math.round((Date.now() - d.getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function UptimeSparkline({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = Math.max(max - min, 1);
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1 || 1)) * 100;
    const y = 100 - ((v - min) / range) * 100;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-8 w-24" aria-hidden="true">
      <polyline points={points} fill="none" stroke="rgba(138,193,255,0.92)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ServiceGlyph({ name }: { name: string }) {
  const lower = name.toLowerCase();
  if (lower.includes("auth")) {
    return (
      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
        <path d="M12 3 20 7v5.5c0 4.2-2.5 6.8-8 8.5-5.5-1.7-8-4.3-8-8.5V7z" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    );
  }
  if (lower.includes("upload")) {
    return (
      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
        <path d="M12 16V6m0 0-3.5 3.5M12 6l3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M4 18v.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V18" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    );
  }
  if (lower.includes("api")) {
    return (
      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
        <path d="M6 6h12v12H6z" stroke="currentColor" strokeWidth="1.6" />
        <path d="M9 12h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
      <circle cx="12" cy="12" r="6.8" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 8.8v3.5M12 15.8h.01" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6" aria-live="polite" aria-busy="true">
      <section className="glass-card-strong rounded-[30px] p-6 sm:p-8">
        <div className="h-5 w-32 animate-pulse rounded bg-white/10" />
        <div className="mt-3 h-10 w-72 animate-pulse rounded bg-white/10" />
        <div className="mt-3 h-5 w-full max-w-2xl animate-pulse rounded bg-white/10" />
      </section>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="glass-card-strong rounded-2xl p-4">
            <div className="h-5 w-36 animate-pulse rounded bg-white/10" />
            <div className="mt-3 h-4 w-full animate-pulse rounded bg-white/10" />
          </div>
        ))}
      </section>
    </div>
  );
}

function readPreviewFromLocation(): StatusPreview {
  if (typeof window === "undefined") return "live";
  const preview = String(new URLSearchParams(window.location.search).get("preview") || "")
    .trim()
    .toLowerCase() as StatusPreview;
  return PREVIEW_VALUES.has(preview) ? preview : "live";
}

export default function StatusCenterClient({ preview }: { preview?: StatusPreview }) {
  const [previewMode, setPreviewMode] = useState<StatusPreview>(preview ?? "live");
  const [loading, setLoading] = useState((preview ?? "live") === "loading");
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<StatusSnapshot | null>(null);
  const [lastRefreshAt, setLastRefreshAt] = useState<number | null>(null);
  const [subscriptionEmail, setSubscriptionEmail] = useState("");
  const [subscriptionBusy, setSubscriptionBusy] = useState(false);
  const [subscriptionFeedback, setSubscriptionFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    const nextPreview = preview ?? readPreviewFromLocation();
    setPreviewMode(nextPreview);
    setLoading(nextPreview === "loading");
  }, [preview]);

  const refreshSnapshot = useCallback(async (silent = false) => {
    if (previewMode === "loading") return;
    if (!silent) setLoading(true);
    setRefreshing(silent);
    try {
      const res = await fetch("/api/health/public", { cache: "no-store", headers: { Accept: "application/json" } });
      const payload = (await res.json()) as Partial<StatusSnapshot>;
      if (!res.ok) {
        setSnapshot({ ok: false, service: "cyang.io", ts: Date.now(), error: typeof payload.error === "string" ? payload.error : `HTTP_${res.status}` });
        setErrorMsg("Live telemetry is temporarily unavailable. Showing fallback service posture.");
      } else {
        setSnapshot({
          ok: Boolean(payload.ok),
          service: typeof payload.service === "string" ? payload.service : "cyang.io",
          ts: Number(payload.ts || Date.now()),
          status: payload.status === "ok" || payload.status === "degraded" || payload.status === "down" ? payload.status : undefined,
          error: typeof payload.error === "string" ? payload.error : undefined,
        });
        setErrorMsg(null);
      }
    } catch {
      setSnapshot({ ok: false, service: "cyang.io", ts: Date.now(), error: "NETWORK" });
      setErrorMsg("Unable to reach live telemetry right now. Showing fallback service posture.");
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLastRefreshAt(Date.now());
    }
  }, [previewMode]);

  useEffect(() => {
    if (previewMode === "loading") return;
    void refreshSnapshot(false);
  }, [previewMode, refreshSnapshot]);

  useEffect(() => {
    if (previewMode === "loading") return;
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void refreshSnapshot(true);
    }, AUTO_REFRESH_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refreshSnapshot(true);
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [previewMode, refreshSnapshot]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = String(window.localStorage.getItem(STATUS_SUBSCRIBE_STORAGE_KEY) || "").trim().toLowerCase();
    if (stored && STATUS_SUBSCRIBE_EMAIL_RE.test(stored)) {
      setSubscriptionEmail(stored);
    }
  }, []);

  const submitSubscription = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const email = subscriptionEmail.trim().toLowerCase();
    if (!STATUS_SUBSCRIBE_EMAIL_RE.test(email)) {
      setSubscriptionFeedback({ tone: "error", message: "Enter a valid email address." });
      return;
    }

    setSubscriptionBusy(true);
    setSubscriptionFeedback(null);
    try {
      const res = await fetch("/api/status/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ email }),
      });
      const payload = (await res.json().catch(() => ({}))) as StatusSubscribeApiResponse;
      if (!res.ok || !payload.ok) {
        setSubscriptionFeedback({
          tone: "error",
          message: payload.message || "Unable to subscribe right now. Please try again shortly.",
        });
        return;
      }
      window.localStorage.setItem(STATUS_SUBSCRIBE_STORAGE_KEY, email);
      setSubscriptionFeedback({
        tone: "success",
        message: payload.message || "You are subscribed to daily status updates.",
      });
    } catch {
      setSubscriptionFeedback({
        tone: "error",
        message: "Network error while subscribing. Please try again.",
      });
    } finally {
      setSubscriptionBusy(false);
    }
  }, [subscriptionEmail]);

  const scenario = useMemo<PlatformState>(() => {
    return deriveStatusPageScenario(snapshot, previewMode);
  }, [previewMode, snapshot]);

  const services = useMemo(() => buildServices(scenario), [scenario]);
  const incidents = useMemo(() => buildIncidents(scenario), [scenario]);
  const uptime = useMemo(() => buildUptime(scenario), [scenario]);
  const state = useMemo(() => services.reduce<PlatformState>((worst, cur) => (statusRank(cur.status) > statusRank(worst) ? cur.status : worst), "operational"), [services]);
  const stateUi = useMemo(() => statusConfig(state), [state]);
  const uptimePercent = useMemo(() => {
    const avg = uptime.reduce((sum, d) => sum + uptimeWeight(d.status), 0) / Math.max(uptime.length, 1);
    return Math.min(100, avg);
  }, [uptime]);
  const openIncidents = incidents.filter((i) => i.status !== "resolved").length;

  const technical = useMemo(() => ({
    service: snapshot?.service ?? "cyang.io",
    ok: snapshot?.ok ?? false,
    timestamp: snapshot?.ts ?? null,
    environment: (typeof process.env.NEXT_PUBLIC_APP_ENV === "string" && process.env.NEXT_PUBLIC_APP_ENV.trim()) || "production",
    build: (typeof process.env.NEXT_PUBLIC_BUILD_SHA === "string" && process.env.NEXT_PUBLIC_BUILD_SHA.trim()) || "current",
    status: snapshot?.status ?? null,
    error: snapshot?.error ?? null,
  }), [snapshot]);

  if (loading && !snapshot) return <LoadingSkeleton />;

  return (
    <div className="space-y-6">
      <section className="glass-card-strong ui-sheen rounded-[30px] p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.16em] text-white/55">cyang.io Trust Center</div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">System Status</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/68 sm:text-base">
              Live health and availability for cyang.io services. Check platform reliability, recent incidents, and update cadence in one place.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium ${stateUi.badge}`}>
              <span className={`h-2 w-2 rounded-full ${stateUi.dot}`} />
              {stateUi.label}
            </span>
            <div className="text-xs text-white/55">Last updated {fmtDateTime(snapshot?.ts ?? null)} ({fmtRelative(snapshot?.ts ?? null)})</div>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-white/12 bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/58">Auto-refresh every 2m while visible</span>
              <button type="button" onClick={() => void refreshSnapshot(true)} disabled={refreshing} className="btn-base rounded-xl border border-white/14 bg-white/[0.04] px-3 py-1.5 text-xs text-white/82 hover:border-white/24 hover:bg-white/[0.08] disabled:opacity-60">
                {refreshing ? "Refreshing..." : "Refresh now"}
              </button>
            </div>
          </div>
        </div>
      </section>

      {errorMsg ? <div className="rounded-2xl border border-amber-400/30 bg-amber-400/12 px-4 py-3 text-sm text-amber-100">{errorMsg}</div> : null}

      <section className="glass-card-strong rounded-[30px] p-6 sm:p-7">
        <div className="grid gap-4 xl:grid-cols-[1.2fr_minmax(0,0.8fr)]">
          <div>
            <div className="text-xs uppercase tracking-[0.16em] text-white/45">Overall platform status</div>
            <h2 className="mt-2 text-2xl font-semibold text-white">{stateUi.headline}</h2>
            <p className="mt-3 max-w-2xl text-sm text-white/67">{stateUi.summary}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <div className="rounded-2xl border border-white/12 bg-white/[0.04] p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-white/45">30-day uptime</div>
              <div className="mt-2 text-2xl font-semibold text-white">{uptimePercent.toFixed(2)}%</div>
              <div className="mt-1 text-sm text-white/60">Platform availability over the last 30 days.</div>
            </div>
            <div className="rounded-2xl border border-white/12 bg-white/[0.04] p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-white/45">Open incidents</div>
              <div className="mt-2 text-2xl font-semibold text-white">{openIncidents}</div>
              <div className="mt-1 text-sm text-white/60">{openIncidents === 0 ? "No unresolved incidents at this time." : "Incident response is currently in progress."}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="glass-card-strong rounded-[30px] p-5 sm:p-6">
        <div className="mb-4">
          <div className="text-xs uppercase tracking-[0.16em] text-white/45">Services</div>
          <h2 className="mt-2 text-xl font-semibold text-white">Core service health</h2>
          <p className="mt-1 text-sm text-white/62">At-a-glance status for key product systems.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {services.map((service) => {
            const ui = statusConfig(service.status);
            return (
              <article key={service.key} className="rounded-2xl border border-white/12 bg-white/[0.03] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-medium text-white">
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-white/12 bg-white/[0.05] text-white/82">
                        <ServiceGlyph name={service.name} />
                      </span>
                      <span>{service.name}</span>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-white/56">{service.description}</p>
                  </div>
                  <span className={`inline-flex shrink-0 items-center rounded-full border px-2 py-1 text-[11px] ${ui.badge}`}>{ui.short}</span>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-white/56">
                  <span>{service.latencyMs != null ? `${service.latencyMs}ms p95` : "Latency n/a"}</span>
                  <span>{service.uptime30d.toFixed(2)}% uptime</span>
                </div>
                <div className="mt-2 flex justify-end">
                  <UptimeSparkline values={service.trend} />
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="glass-card-strong rounded-[30px] p-5 sm:p-6">
        <div className="mb-4">
          <div className="text-xs uppercase tracking-[0.16em] text-white/45">Incident history</div>
          <h2 className="mt-2 text-xl font-semibold text-white">Recent events</h2>
        </div>
        {incidents.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/16 bg-white/[0.03] px-5 py-8 text-center">
            <div className="text-lg font-semibold text-white">No recent incidents</div>
            <p className="mx-auto mt-2 max-w-2xl text-sm text-white/62">We have not recorded incidents in the current reporting window. Core systems are operating as expected.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {incidents.map((incident) => {
              const ui = incidentStateConfig(incident.status);
              return (
                <article key={incident.id} className="rounded-2xl border border-white/12 bg-white/[0.03] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold text-white">{incident.title}</h3>
                      <p className="mt-1 text-sm text-white/64">{incident.summary}</p>
                    </div>
                    <span className={`inline-flex items-center rounded-full border px-2 py-1 text-[11px] ${ui.badge}`}>{ui.label}</span>
                  </div>
                  <div className="mt-3 text-xs text-white/56">Started {fmtDateTime(incident.startedAt)}</div>
                  <div className="mt-3 space-y-2 border-l border-white/12 pl-3">
                    {incident.updates.map((update, idx) => {
                      const updateUi = incidentStateConfig(update.status);
                      return (
                        <div key={`${incident.id}-${idx}`} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className={`rounded-full border px-2 py-0.5 ${updateUi.badge}`}>{updateUi.label}</span>
                            <span className="text-white/55">{fmtDateTime(update.timestamp)}</span>
                          </div>
                          <p className="mt-2 text-sm text-white/67">{update.message}</p>
                        </div>
                      );
                    })}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="glass-card-strong rounded-[30px] p-5 sm:p-6">
        <div className="mb-4">
          <div className="text-xs uppercase tracking-[0.16em] text-white/45">Reliability</div>
          <h2 className="mt-2 text-xl font-semibold text-white">Uptime over 30 days</h2>
        </div>
        <div className="grid gap-4 xl:grid-cols-[1.35fr_minmax(0,0.65fr)]">
          <div className="rounded-2xl border border-white/12 bg-white/[0.03] p-4">
            <div className="mt-3 grid grid-cols-[repeat(15,minmax(0,1fr))] gap-1 sm:grid-cols-[repeat(30,minmax(0,1fr))]">
              {uptime.map((day) => (
                <div key={day.date} className={`h-8 rounded ${dailyBarClass(day.status)}`} title={`${fmtDateTime(day.date)} · ${statusConfig(day.status).short}`} />
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-white/58">
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-300/90" />Operational</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-300/90" />Degraded</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-orange-300/90" />Partial outage</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-rose-300/90" />Major outage</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-sky-300/90" />Maintenance</span>
            </div>
          </div>
          <div className="rounded-2xl border border-white/12 bg-white/[0.03] p-4">
            <div className="text-xs uppercase tracking-[0.16em] text-white/45">Highlights</div>
            <div className="mt-3 text-3xl font-semibold text-white">{uptimePercent.toFixed(2)}%</div>
            <div className="mt-1 text-sm text-white/63">Platform uptime over the last 30 days.</div>
            <div className="mt-4 space-y-2 text-sm text-white/65">
              <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2"><span className="font-medium text-white">Open incidents:</span> {openIncidents}</div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2"><span className="font-medium text-white">Last refresh:</span> {lastRefreshAt ? fmtDateTime(lastRefreshAt) : "Pending"}</div>
            </div>
          </div>
        </div>
      </section>

      <details className="glass-card-strong rounded-[24px] p-4 sm:p-5">
        <summary className="cursor-pointer list-none text-sm font-semibold text-white">Technical diagnostics (advanced)</summary>
        <div className="mt-3 rounded-2xl border border-white/12 bg-black/20 p-4">
          <p className="mb-3 text-xs text-white/56">
            This section is intended for engineering review and integration troubleshooting.
          </p>
          <pre className="overflow-auto whitespace-pre-wrap text-xs leading-6 text-white/72">
{JSON.stringify(technical, null, 2)}
          </pre>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-white/55">
            <a href="/api/health/live" target="_blank" rel="noreferrer" className="underline hover:text-white">Live</a>
            <a href="/api/health/ready" target="_blank" rel="noreferrer" className="underline hover:text-white">Ready</a>
            <a href="/api/health/deps" target="_blank" rel="noreferrer" className="underline hover:text-white">Dependencies</a>
          </div>
        </div>
      </details>

      <section className="glass-card-strong rounded-[24px] p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">Need help or updates?</h2>
            <p className="mt-1 text-sm text-white/62">Contact support for account-specific questions, or subscribe for daily platform updates delivered at 6:00 AM UTC.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <a href="mailto:support@cyang.io" className="btn-base btn-secondary rounded-xl px-3 py-2">Contact support</a>
            <Link href="/contact" className="btn-base btn-secondary rounded-xl px-3 py-2">Contact page</Link>
            <Link href="/security-disclosure" className="btn-base btn-secondary rounded-xl px-3 py-2">Security docs</Link>
          </div>
        </div>
        <form onSubmit={submitSubscription} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center" noValidate>
          <label className="sr-only" htmlFor="status-subscribe-email">Email address</label>
          <input
            id="status-subscribe-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@company.com"
            value={subscriptionEmail}
            onChange={(event) => setSubscriptionEmail(event.target.value)}
            className="h-11 w-full rounded-xl border border-white/14 bg-white/[0.04] px-3.5 text-sm text-white placeholder:text-white/42 outline-none transition focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/20 sm:max-w-sm"
            required
          />
          <button
            type="submit"
            disabled={subscriptionBusy}
            className="btn-base rounded-xl border border-cyan-300/30 bg-cyan-300/18 px-4 py-2.5 text-sm font-medium text-cyan-100 hover:border-cyan-200/40 hover:bg-cyan-300/25 disabled:opacity-60"
          >
            {subscriptionBusy ? "Subscribing..." : "Subscribe to updates"}
          </button>
        </form>
        {subscriptionFeedback ? (
          <div
            className={`mt-3 rounded-xl border px-3 py-2 text-sm ${
              subscriptionFeedback.tone === "success"
                ? "border-emerald-400/30 bg-emerald-400/12 text-emerald-100"
                : "border-amber-400/30 bg-amber-400/12 text-amber-100"
            }`}
            role="status"
            aria-live="polite"
          >
            {subscriptionFeedback.message}
          </div>
        ) : null}
      </section>

      <section className="glass-card rounded-[24px] p-4 sm:p-5">
        <h2 className="text-base font-semibold text-white">Related trust resources</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
          <Link href="/trust" className="rounded-xl border border-white/12 bg-black/25 px-3 py-2 text-sm text-white/82 transition-colors hover:bg-white/10">
            Trust Center
          </Link>
          <Link href="/trust/procurement" className="rounded-xl border border-white/12 bg-black/25 px-3 py-2 text-sm text-white/82 transition-colors hover:bg-white/10">
            Procurement package
          </Link>
          <Link href="/legal/security-policy" className="rounded-xl border border-white/12 bg-black/25 px-3 py-2 text-sm text-white/82 transition-colors hover:bg-white/10">
            Security Policy
          </Link>
          <Link href="/legal/service-level-agreement" className="rounded-xl border border-white/12 bg-black/25 px-3 py-2 text-sm text-white/82 transition-colors hover:bg-white/10">
            SLA
          </Link>
          <Link href="/report" className="rounded-xl border border-white/12 bg-black/25 px-3 py-2 text-sm text-white/82 transition-colors hover:bg-white/10">
            Report abuse
          </Link>
          <Link href="/contact" className="rounded-xl border border-white/12 bg-black/25 px-3 py-2 text-sm text-white/82 transition-colors hover:bg-white/10">
            Contact
          </Link>
        </div>
      </section>
    </div>
  );
}
