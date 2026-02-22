// src/app/admin/dashboard/ViewerUsageWidget.tsx
import Link from "next/link";
import { sql } from "@/lib/db";
import {
  getActiveShareCountForOwner,
  getDailyUploadCount,
  getMonthlyViewCount,
  getPlanForUser,
  getStorageBytesForOwner,
  type Plan,
} from "@/lib/monetization";

export const runtime = "nodejs";

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  const decimals = i <= 1 ? 0 : i === 2 ? 1 : 2;
  return `${v.toFixed(decimals)} ${units[i]}`;
}

async function tableExists(fqTable: string): Promise<boolean> {
  try {
    const rows = (await sql`select to_regclass(${fqTable})::text as reg`) as unknown as Array<{ reg: string | null }>;
    return !!rows?.[0]?.reg;
  } catch {
    return false;
  }
}

type Usage = {
  plan: Plan;
  storageUsedBytes: number;
  activeShares: number;
  monthlyViews: number | null;
  dailyUploads: number | null;
};

async function getUsage(userId: string): Promise<Usage> {
  // Plan / usage tables are optional (kept "hidden" until pricing is finalized).
  // We render best-effort data: if a table is missing, we fall back to safe defaults.
  let plan: Plan = {
    id: "free",
    name: "Free",
    maxViewsPerMonth: 100,
    maxActiveShares: 3,
    maxStorageBytes: 524288000,
    maxUploadsPerDay: 10,
    maxFileSizeBytes: 26214400,
    allowCustomExpiration: false,
    allowAuditExport: false,
  };

  const hasPlans = await tableExists("public.plans");
  const hasUsers = await tableExists("public.users");
  const hasMonthly = await tableExists("public.user_usage_monthly");
  const hasDaily = await tableExists("public.user_usage_daily");

  if (hasPlans && hasUsers) {
    try {
      plan = await getPlanForUser(userId);
    } catch {
      // ignore
    }
  }

  let storageUsedBytes = 0;
  let activeShares = 0;
  try {
    storageUsedBytes = await getStorageBytesForOwner(userId);
  } catch {
    storageUsedBytes = 0;
  }

  try {
    activeShares = await getActiveShareCountForOwner(userId);
  } catch {
    activeShares = 0;
  }

  let monthlyViews: number | null = null;
  if (hasMonthly) {
    try {
      monthlyViews = await getMonthlyViewCount(userId);
    } catch {
      monthlyViews = null;
    }
  }

  let dailyUploads: number | null = null;
  if (hasDaily) {
    try {
      dailyUploads = await getDailyUploadCount(userId);
    } catch {
      dailyUploads = null;
    }
  }

  return { plan, storageUsedBytes, activeShares, monthlyViews, dailyUploads };
}

export default async function ViewerUsageWidget(props: { userId: string }) {
  const u = await getUsage(props.userId);

  const storageLimit = u.plan.maxStorageBytes;
  const sharesLimit = u.plan.maxActiveShares;
  const viewsLimit = u.plan.maxViewsPerMonth;
  const uploadsLimit = u.plan.maxUploadsPerDay;

  const storageRemaining =
    storageLimit == null ? null : Math.max(0, storageLimit - u.storageUsedBytes);
  const sharesRemaining = sharesLimit == null ? null : Math.max(0, sharesLimit - u.activeShares);
  const viewsRemaining =
    viewsLimit == null || u.monthlyViews == null ? null : Math.max(0, viewsLimit - u.monthlyViews);
  const uploadsRemaining =
    uploadsLimit == null || u.dailyUploads == null ? null : Math.max(0, uploadsLimit - u.dailyUploads);

  return (
    <section className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4 shadow-sm">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-sm text-neutral-400">Your account</div>
          <h2 className="text-lg font-semibold text-neutral-50">Usage & limits</h2>
        </div>
        <div className="text-xs text-neutral-500">
          Plan: <span className="text-neutral-300">{u.plan.name}</span>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-3">
          <div className="text-xs text-neutral-500">Storage</div>
          <div className="mt-1 text-sm text-neutral-200">
            <span className="font-medium">{formatBytes(u.storageUsedBytes)}</span> used
            {storageLimit != null ? (
              <>
                {" "}
                / <span className="text-neutral-300">{formatBytes(storageLimit)}</span>
              </>
            ) : null}
          </div>
          {storageRemaining != null ? (
            <div className="mt-1 text-xs text-neutral-400">
              {formatBytes(storageRemaining)} free space left
            </div>
          ) : (
            <div className="mt-1 text-xs text-neutral-500">Unlimited</div>
          )}
        </div>

        <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-3">
          <div className="text-xs text-neutral-500">Active shares</div>
          <div className="mt-1 text-sm text-neutral-200">
            <span className="font-medium">{u.activeShares}</span> active
            {sharesLimit != null ? (
              <>
                {" "}
                / <span className="text-neutral-300">{sharesLimit}</span>
              </>
            ) : null}
          </div>
          {sharesRemaining != null ? (
            <div className="mt-1 text-xs text-neutral-400">{sharesRemaining} shares left</div>
          ) : (
            <div className="mt-1 text-xs text-neutral-500">Unlimited</div>
          )}
        </div>

        <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-3">
          <div className="text-xs text-neutral-500">Views (this month)</div>
          {u.monthlyViews == null || viewsLimit == null ? (
            <div className="mt-1 text-sm text-neutral-500">Tracking not enabled</div>
          ) : (
            <>
              <div className="mt-1 text-sm text-neutral-200">
                <span className="font-medium">{u.monthlyViews}</span> used /{" "}
                <span className="text-neutral-300">{viewsLimit}</span>
              </div>
              <div className="mt-1 text-xs text-neutral-400">{viewsRemaining} views left</div>
            </>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-neutral-400">
        <span className="rounded-full border border-neutral-800 bg-neutral-950 px-2 py-1">
          Tip: upload → share link from your doc row
        </span>
        <span className="rounded-full border border-neutral-800 bg-neutral-950 px-2 py-1">
          Keep shares short-lived for security
        </span>
        {u.dailyUploads != null && uploadsLimit != null ? (
          <span className="rounded-full border border-neutral-800 bg-neutral-950 px-2 py-1">
            Today: {u.dailyUploads}/{uploadsLimit} uploads
            {uploadsRemaining != null ? ` (${uploadsRemaining} left)` : ""}
          </span>
        ) : null}
        <Link className="ml-auto text-neutral-300 hover:underline" href="#docs">
          Jump to documents →
        </Link>
      </div>
    </section>
  );
}
