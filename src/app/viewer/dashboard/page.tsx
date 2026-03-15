import ViewerOverviewPage from "../page";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function ViewerDashboardAliasPage(
  props: Parameters<typeof ViewerOverviewPage>[0]
) {
  return <ViewerOverviewPage {...props} />;
}
