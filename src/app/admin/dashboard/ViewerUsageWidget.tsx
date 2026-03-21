// src/app/admin/dashboard/ViewerUsageWidget.tsx
import { sql } from "@/lib/db";
import {
  getPlanForUser,
  getActiveShareCountForOwner,
  getStorageBytesForOwner,
  getMonthlyViewCount,
  getDailyUploadCount,
} from "@/lib/monetization";
import { getBillingFlags } from "@/lib/settings";

export const runtime = "nodejs";

function fmtBytes(n: number | null): string {
  if (n == null) return "-";
  if (!Number.isFinite(n) || n < 0) return "-";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  const digits = i === 0 ? 0 : i <= 2 ? 1 : 2;
  return `${v.toFixed(digits)} ${units[i]}`;
}

async function tableExists(fqTable: string): Promise<boolean> {
  try {
    const rows = (await sql`select to_regclass(${fqTable})::text as reg`) as unknown as Array<{ reg: string | null }>;
    return !!rows?.[0]?.reg;
  } catch {
    return false;
  }
}

export default async function ViewerUsageWidget(props: {
  userId: string;
  upgradeHref?: string | null;
  sharesHref?: string;
  showUpgradeCta?: boolean;
}) {
  const userId = String(props.userId || "").trim();
  if (!userId) return null;

  const hasPlans = await tableExists("public.plans");
  const hasUsers = await tableExists("public.users");
  const hasMonthly = await tableExists("public.user_usage_monthly");
  const hasDaily = await tableExists("public.user_usage_daily");

  let planName = "Free";
  let planId: string = "free";
  let maxActiveShares: number | null = 3;
  let maxStorageBytes: number | null = 104857600;
  let maxViewsPerMonth: number | null = 100;
  let maxUploadsPerDay: number | null = 10;

  try {
    if (hasPlans && hasUsers) {
      const plan = await getPlanForUser(userId);
      planId = String(plan.id || "free");
      planName = plan.name;
      maxActiveShares = plan.maxActiveShares;
      maxStorageBytes = plan.maxStorageBytes;
      maxViewsPerMonth = plan.maxViewsPerMonth;
      maxUploadsPerDay = plan.maxUploadsPerDay;
    }
  } catch {
    // keep defaults
  }

  let activeShares = 0;
  let usedStorage = 0;
  let monthlyViews: number | null = null;
  let dailyUploads: number | null = null;

  try {
    activeShares = await getActiveShareCountForOwner(userId);
  } catch {
    activeShares = 0;
  }

  try {
    usedStorage = await getStorageBytesForOwner(userId);
  } catch {
    usedStorage = 0;
  }

  try {
    monthlyViews = hasMonthly ? await getMonthlyViewCount(userId) : null;
  } catch {
    monthlyViews = null;
  }

  try {
    dailyUploads = hasDaily ? await getDailyUploadCount(userId) : null;
  } catch {
    dailyUploads = null;
  }

  const sharesLeft = maxActiveShares == null ? null : Math.max(0, maxActiveShares - activeShares);
  const storageLeft = maxStorageBytes == null ? null : Math.max(0, maxStorageBytes - usedStorage);
  const storagePct =
    maxStorageBytes && maxStorageBytes > 0
      ? Math.min(100, Math.max(0, Math.round((usedStorage / maxStorageBytes) * 100)))
      : null;
  const storageWarn = storagePct != null && storagePct >= 80;

  const viewsLeft =
    maxViewsPerMonth == null || monthlyViews == null ? null : Math.max(0, maxViewsPerMonth - monthlyViews);
  const uploadsLeft =
    maxUploadsPerDay == null || dailyUploads == null ? null : Math.max(0, maxUploadsPerDay - dailyUploads);
  const billingFlags = await getBillingFlags();
  const showUpgrade =
    (props.showUpgradeCta ?? true) &&
    billingFlags.flags.pricingUiEnabled &&
    planId !== "pro" &&
    !!props.upgradeHref;
  const sharesHref = props.sharesHref || "#shares";

  return (
    <section className="surface-panel-strong rounded-sm p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-[var(--text-primary)]">Usage Snapshot</div>
          <div className="mt-0.5 text-xs text-[var(--text-muted)]">Plan: {planName}</div>
        </div>
        <div className="flex items-center gap-2">
          {showUpgrade ? (
            <a href={props.upgradeHref!} className="btn-base btn-primary rounded-sm px-3 py-1.5 text-xs">
              Upgrade to Pro
            </a>
          ) : null}
          <a href={sharesHref} className="btn-base btn-secondary rounded-sm px-3 py-1.5 text-xs">
            Open shares
          </a>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <MetricCard
          title="Active shares"
          value={`${activeShares}${maxActiveShares == null ? " / inf" : ` / ${maxActiveShares}`}`}
          note={sharesLeft == null ? "No hard share cap" : `${sharesLeft} share${sharesLeft === 1 ? "" : "s"} remaining`}
        />
        <MetricCard
          title="Storage"
          value={`${fmtBytes(usedStorage)}${maxStorageBytes == null ? " / inf" : ` / ${fmtBytes(maxStorageBytes)}`}`}
          note={storageLeft == null ? "No hard storage cap" : `${fmtBytes(storageLeft)} remaining`}
          warning={storageWarn ? `Storage usage is ${storagePct}% of plan limit.` : null}
        />
        <MetricCard
          title="Monthly views"
          value={
            monthlyViews == null
              ? `-${maxViewsPerMonth == null ? " / inf" : " (tracking not enabled)"}`
              : `${monthlyViews}${maxViewsPerMonth == null ? " / inf" : ` / ${maxViewsPerMonth}`}`
          }
          note={viewsLeft == null ? "" : `${viewsLeft} left this month`}
        />
        <MetricCard
          title="Uploads today"
          value={
            dailyUploads == null
              ? `-${maxUploadsPerDay == null ? " / inf" : " (tracking not enabled)"}`
              : `${dailyUploads}${maxUploadsPerDay == null ? " / inf" : ` / ${maxUploadsPerDay}`}`
          }
          note={uploadsLeft == null ? "" : `${uploadsLeft} left today`}
        />
      </div>
    </section>
  );
}

function MetricCard(props: {
  title: string;
  value: string;
  note?: string;
  warning?: string | null;
}) {
  return (
    <div className="selection-tile rounded-sm p-3">
      <div className="text-xs text-[var(--text-faint)]">{props.title}</div>
      <div className="mt-1 text-lg font-semibold text-[var(--text-primary)]">{props.value}</div>
      {props.note ? <div className="mt-1 text-xs text-[var(--text-muted)]">{props.note}</div> : null}
      {props.warning ? (
        <div className="mt-2 rounded-sm border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-700">
          {props.warning}
        </div>
      ) : null}
    </div>
  );
}
