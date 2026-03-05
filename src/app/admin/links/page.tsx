import { redirect } from "next/navigation";
import { requireUser } from "@/lib/authz";
import DashboardHeaderActions from "@/app/admin/dashboard/DashboardHeaderActions";
import SharesTableClient from "@/app/admin/dashboard/SharesTableClient";
import { getDashboardLinksData, getDashboardHomeData } from "@/app/admin/dashboard/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminLinksPage() {
  let u;
  try {
    u = await requireUser();
  } catch {
    redirect("/api/auth/signin");
  }

  const [data, homeData] = await Promise.all([getDashboardLinksData(u), getDashboardHomeData(u)]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Links</h1>
          <div className="mt-1 text-sm text-white/65">Manage protected links and access settings.</div>
        </div>
        <DashboardHeaderActions docs={homeData.headerDocs} planId={data.planId} />
      </div>

      {data.missingCoreTables ? (
        <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4 text-sm text-neutral-300">
          <div className="font-medium text-neutral-100">Links unavailable</div>
          <div className="mt-1 text-neutral-400">The required sharing tables are missing.</div>
        </div>
      ) : (
        <SharesTableClient shares={data.shares} nowTs={data.nowTs} canManageBulk={data.canSeeAll} />
      )}
    </div>
  );
}
