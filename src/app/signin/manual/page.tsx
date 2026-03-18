import ManualSignInClient from "./ManualSignInClient";

export const runtime = "nodejs";

export default async function ManualSignInPage(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = (await props.searchParams) || {};
  const rawIntent = Array.isArray(searchParams.intent) ? searchParams.intent[0] : searchParams.intent;
  const intent = rawIntent === "admin" ? "admin" : "viewer";

  return <ManualSignInClient intent={intent} />;
}
