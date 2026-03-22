import ResetPasswordClient from "./ResetPasswordClient";

export const runtime = "nodejs";

function firstValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? String(value[0] || "") : String(value || "");
}

export default async function SignInResetPage(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = (await props.searchParams) || {};
  const email = firstValue(searchParams.email);
  const token = firstValue(searchParams.token);

  return <ResetPasswordClient email={email} token={token} />;
}
