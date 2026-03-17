import { requireRole } from "@/lib/authz";
import AbuseReportsPage from "../(owner)/abuse/page";
import DmcaPage from "../(owner)/dmca/page";
import ViewerUploadsPage from "../(owner)/viewer-uploads/page";
import { AdminPageIntro, AdminTabs } from "../_components/AdminPagePrimitives";

export const runtime = "nodejs";

const TABS = [
  { key: "uploads", label: "Viewer Uploads", href: "/admin/review?tab=uploads" },
  { key: "abuse", label: "Abuse Reports", href: "/admin/review?tab=abuse" },
  { key: "takedowns", label: "Takedowns", href: "/admin/review?tab=takedowns" },
];

export default async function ReviewQueuePage(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole("owner");
  const params = (await props.searchParams) || {};
  const tabRaw = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const currentTab = TABS.some((tab) => tab.key === tabRaw) ? String(tabRaw) : "uploads";

  return (
    <div className="space-y-6">
      <AdminPageIntro
        eyebrow="Review Queue"
        title="Handle risky uploads, abuse, and takedowns from one owner workspace."
        description="This queue consolidates moderation work so owners can review evidence, resolve incidents, and preserve a clean access posture without hopping between unrelated tools."
      />
      <AdminTabs tabs={TABS} current={currentTab} />
      {currentTab === "uploads" ? <ViewerUploadsPage /> : null}
      {currentTab === "abuse" ? <AbuseReportsPage /> : null}
      {currentTab === "takedowns" ? <DmcaPage /> : null}
    </div>
  );
}
