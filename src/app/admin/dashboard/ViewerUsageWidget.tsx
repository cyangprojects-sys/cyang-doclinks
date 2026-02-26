// src/app/admin/dashboard/ViewerUsageWidget.tsx
import { sql } from "@/lib/db";
import { getPlanForUser, getActiveShareCountForOwner, getStorageBytesForOwner, getMonthlyViewCount, getDailyUploadCount } from "@/lib/monetization";

export const runtime = "nodejs";

function fmtBytes(n: number | null): string {
  if (n == null) return "—";
  if (!Number.isFinite(n) || n < 0) return "—";
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

export default async function ViewerUsageWidget(props: { userId: string }) {
  const userId = String(props.userId || "").trim();
  if (!userId) return null;

  const hasPlans = await tableExists("public.plans");
  const hasUsers = await tableExists("public.users");
  const hasMonthly = await tableExists("public.user_usage_monthly");
  const hasDaily = await tableExists("public.user_usage_daily");

  // Plan + usage are best-effort (widget must not break if tables aren't deployed yet)
  let planName = "Free";
  let maxActiveShares: number | null = 3;
  let maxStorageBytes: number | null = 524288000; // 500MB
  let maxViewsPerMonth: number | null = 100;
  let maxUploadsPerDay: number | null = 10;

  try {
    if (hasPlans && hasUsers) {
      const plan = await getPlanForUser(userId);
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

  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-neutral-100">Your usage</div>
          <div className="mt-0.5 text-xs text-neutral-500">Plan: {planName}</div>
        </div>
        <a
          href="#shares"
          className="rounded-md border border-neutral-800 bg-neutral-950 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-900"
        >
          Manage shares
        </a>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-3">
          <div className="text-xs text-neutral-500">Active shares</div>
          <div className="mt-1 text-lg font-semibold text-neutral-100">
            {activeShares}
            {maxActiveShares == null ? (
              <span className="text-sm font-normal text-neutral-500"> / ∞</span>
            ) : (
              <span className="text-sm font-normal text-neutral-500"> / {maxActiveShares}</span>
            )}
          </div>
          <div className="mt-1 text-xs text-neutral-500">
            {sharesLeft == null ? "Unlimited shares" : `${sharesLeft} share${sharesLeft === 1 ? "" : "s"} left`}
          </div>
        </div>

        <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-3">
          <div className="text-xs text-neutral-500">Storage</div>
          <div className="mt-1 text-lg font-semibold text-neutral-100">
            {fmtBytes(usedStorage)}
            {maxStorageBytes == null ? (
              <span className="text-sm font-normal text-neutral-500"> / ∞</span>
            ) : (
              <span className="text-sm font-normal text-neutral-500"> / {fmtBytes(maxStorageBytes)}</span>
            )}
          </div>
          <div className="mt-1 text-xs text-neutral-500">
            {storageLeft == null ? "Unlimited storage" : `${fmtBytes(storageLeft)} free`}
          </div>
          {storageWarn ? (
            <div className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs text-amber-200">
              Storage usage is {storagePct}% of plan limit.
            </div>
          ) : null}
        </div>

        <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-3">
          <div className="text-xs text-neutral-500">Monthly views</div>
          <div className="mt-1 text-lg font-semibold text-neutral-100">
            {monthlyViews == null ? "—" : monthlyViews}
            {maxViewsPerMonth == null ? (
              <span className="text-sm font-normal text-neutral-500"> / ∞</span>
            ) : monthlyViews == null ? (
              <span className="text-sm font-normal text-neutral-500"> (tracking not enabled)</span>
            ) : (
              <span className="text-sm font-normal text-neutral-500"> / {maxViewsPerMonth}</span>
            )}
          </div>
          <div className="mt-1 text-xs text-neutral-500">
            {viewsLeft == null ? "" : `${viewsLeft} left this month`}
          </div>
        </div>

        <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-3">
          <div className="text-xs text-neutral-500">Uploads today</div>
          <div className="mt-1 text-lg font-semibold text-neutral-100">
            {dailyUploads == null ? "—" : dailyUploads}
            {maxUploadsPerDay == null ? (
              <span className="text-sm font-normal text-neutral-500"> / ∞</span>
            ) : dailyUploads == null ? (
              <span className="text-sm font-normal text-neutral-500"> (tracking not enabled)</span>
            ) : (
              <span className="text-sm font-normal text-neutral-500"> / {maxUploadsPerDay}</span>
            )}
          </div>
          <div className="mt-1 text-xs text-neutral-500">{uploadsLeft == null ? "" : `${uploadsLeft} left today`}</div>
        </div>
      </div>
    </section>
  );
}
