import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser, roleAtLeast } from "@/lib/authz";
import {
  getDocAvailabilityHint,
  isOwnerEmail,
  resolveAliasDocIdBypass,
  userOwnsDoc,
} from "@/lib/aliasPreview";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  context: {
    params: Promise<{ alias: string }>;
  }
) {
  const params = await context.params;
  const alias = String(params.alias || "").trim().toLowerCase();
  if (!alias) {
    return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }

  const bypass = await resolveAliasDocIdBypass(alias);
  if (!bypass.ok) {
    return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }

  const ownerEmail = await isOwnerEmail();
  const user = await getAuthedUser();
  const isPrivileged =
    ownerEmail ||
    (user ? roleAtLeast(user.role, "admin") || (await userOwnsDoc(user.id, bypass.docId)) : false);

  if (!isPrivileged) {
    return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
  }

  const availability = await getDocAvailabilityHint(bypass.docId);
  return NextResponse.json({
    ok: true,
    status_signature: availability.statusSignature,
    should_auto_refresh: availability.shouldAutoRefresh,
  });
}
