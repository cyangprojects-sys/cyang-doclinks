import ViewerOverviewPage from "../page";

export const runtime = "nodejs";

export default function ViewerDashboardAliasPage(
  props: Parameters<typeof ViewerOverviewPage>[0]
) {
  return <ViewerOverviewPage {...props} />;
}
