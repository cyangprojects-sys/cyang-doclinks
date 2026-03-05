import { redirect } from "next/navigation";
import { requireUser } from "@/lib/authz";
import DashboardHeaderActions from "@/app/admin/dashboard/DashboardHeaderActions";
import ViewsByDocTableClient from "@/app/admin/dashboard/ViewsByDocTableClient";
import { getDashboardActivityData, getDashboardHomeData } from "@/app/admin/dashboard/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminActivityPage() {
  let u;
  try {
    u = await requireUser();
  } catch {
    redirect("/api/auth/signin");
  }

  const [data, homeData] = await Promise.all([getDashboardActivityData(u), getDashboardHomeData(u)]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Activity</h1>
          <div className="mt-1 text-sm text-white/65">Document views and audience activity.</div>
        </div>
        <DashboardHeaderActions docs={homeData.headerDocs} planId={data.planId} />
      </div>

      {data.missingCoreTables ? (
        <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4 text-sm text-neutral-300">
          <div className="font-medium text-neutral-100">Activity unavailable</div>
          <div className="mt-1 text-neutral-400">The required view-tracking tables are missing.</div>
        </div>
      ) : (
        <ViewsByDocTableClient rows={data.viewsRows} canManageShares={data.canSeeAll} />
      )}
    </div>
  );
}
