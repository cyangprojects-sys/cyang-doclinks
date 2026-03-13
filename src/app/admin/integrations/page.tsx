import { requireRole } from "@/lib/authz";
import ApiKeysPage from "../(owner)/api-keys/page";
import WebhooksPage from "../(owner)/webhooks/page";
import { AdminPageIntro, AdminTabs } from "../_components/AdminPagePrimitives";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const TABS = [
  { key: "webhooks", label: "Webhooks", href: "/admin/integrations?tab=webhooks" },
  { key: "api-keys", label: "API Keys", href: "/admin/integrations?tab=api-keys" },
];

export default async function IntegrationsPage(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole("owner");
  const params = (await props.searchParams) || {};
  const tabRaw = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const currentTab = TABS.some((tab) => tab.key === tabRaw) ? String(tabRaw) : "webhooks";

  return (
    <div className="space-y-6">
      <AdminPageIntro
        eyebrow="Integrations"
        title="Connect DocLinks to the rest of your operational stack."
        description="Manage outbound webhooks, rotate API credentials, and review delivery health from one place instead of splitting those controls across separate owner screens."
      />
      <AdminTabs tabs={TABS} current={currentTab} />
      {currentTab === "webhooks" ? <WebhooksPage /> : null}
      {currentTab === "api-keys" ? <ApiKeysPage /> : null}
    </div>
  );
}
