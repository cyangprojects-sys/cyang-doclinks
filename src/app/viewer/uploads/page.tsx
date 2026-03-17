import { redirect } from "next/navigation";

export const runtime = "nodejs";

export default async function ViewerUploadsAliasPage({
  searchParams,
}: {
  searchParams: Promise<{ openPicker?: string; fromCreateLink?: string; show?: string; count?: string }>;
}) {
  const params = await searchParams;
  const next = new URLSearchParams();
  if (String(params.openPicker || "") === "1") next.set("openPicker", "1");
  if (String(params.fromCreateLink || "") === "1") next.set("fromCreateLink", "1");
  const qs = next.toString();
  redirect(`/viewer/documents${qs ? `?${qs}` : ""}`);
}
