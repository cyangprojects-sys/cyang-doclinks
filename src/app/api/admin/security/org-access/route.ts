import { NextResponse } from "next/server";
import { requireRole, type Role } from "@/lib/authz";
import {
  createOrgInvite,
  listOrgMemberships,
  listPendingOrgInvites,
  orgMembershipTablesReady,
  revokeOrgInvite,
  upsertMembership,
} from "@/lib/orgMembership";
import { sql } from "@/lib/db";
import { logSecurityEvent } from "@/lib/securityTelemetry";
import { resolvePublicAppBaseUrl } from "@/lib/publicBaseUrl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_ORG_ACCESS_FORM_BYTES = 8 * 1024;

function normEmail(email: unknown): string {
  return String(email || "").trim().toLowerCase();
}

function parseFormBodyLength(req: Request): number {
  const raw = String(req.headers.get("content-length") || "").trim();
  const size = Number(raw);
  return Number.isFinite(size) && size > 0 ? size : 0;
}

function parseRole(role: unknown): Role | null {
  const r = String(role || "").trim().toLowerCase();
  if (r === "viewer" || r === "admin" || r === "owner") return r;
  return null;
}

async function requireOwnerInOrg() {
  const u = await requireRole("owner");
  if (!u.orgId) throw new Error("ORG_REQUIRED");
  return u;
}

export async function GET() {
  try {
    const u = await requireOwnerInOrg();
    if (!(await orgMembershipTablesReady())) {
      return NextResponse.json({ ok: false, error: "TABLES_MISSING" }, { status: 409 });
    }
    const [members, invites] = await Promise.all([
      listOrgMemberships(u.orgId!),
      listPendingOrgInvites(u.orgId!),
    ]);
    return NextResponse.json({ ok: true, members, invites });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "SERVER_ERROR";
    const status = msg === "FORBIDDEN" || msg === "UNAUTHENTICATED" ? 403 : msg === "ORG_REQUIRED" ? 400 : 500;
    const safeError = msg === "ORG_REQUIRED" ? "ORG_REQUIRED" : status === 403 ? "FORBIDDEN" : "SERVER_ERROR";
    return NextResponse.json({ ok: false, error: safeError }, { status });
  }
}

export async function POST(req: Request) {
  let appBaseUrl: string;
  try {
    appBaseUrl = resolvePublicAppBaseUrl(req.url);
  } catch {
    return NextResponse.json({ ok: false, error: "ENV_MISCONFIGURED" }, { status: 500 });
  }

  try {
    const u = await requireOwnerInOrg();
    if (!(await orgMembershipTablesReady())) {
      return NextResponse.json({ ok: false, error: "TABLES_MISSING" }, { status: 409 });
    }

    if (parseFormBodyLength(req) > MAX_ORG_ACCESS_FORM_BYTES) {
      return NextResponse.redirect(new URL("/admin/security?error=PAYLOAD_TOO_LARGE", appBaseUrl), { status: 303 });
    }

    const form = await req.formData();
    const action = String(form.get("action") || "").trim();

    if (action === "invite") {
      const email = normEmail(form.get("email"));
      const role = parseRole(form.get("role")) || "viewer";
      const expiresDays = Number(form.get("expires_days") || 7);
      if (!email || !email.includes("@")) {
        return NextResponse.redirect(new URL("/admin/security?error=invalid_invite_email", appBaseUrl), { status: 303 });
      }

      const { token } = await createOrgInvite({
        orgId: u.orgId!,
        email,
        role,
        invitedByUserId: u.id,
        expiresDays,
      });

      const inviteUrl = `${appBaseUrl}/org/${encodeURIComponent(u.orgSlug || "default")}/login?invite=${encodeURIComponent(token)}`;

      await logSecurityEvent({
        type: "org_invite_created",
        severity: "medium",
        actorUserId: u.id,
        orgId: u.orgId,
        scope: "org_membership",
        message: "Organization invite created",
        meta: { email, role },
      });

      return NextResponse.redirect(new URL(`/admin/security?saved=org_invite&invite_url=${encodeURIComponent(inviteUrl)}`, appBaseUrl), { status: 303 });
    }

    if (action === "set_member_role") {
      const userId = String(form.get("user_id") || "").trim();
      const role = parseRole(form.get("role"));
      if (!userId || !role) {
        return NextResponse.redirect(new URL("/admin/security?error=invalid_member_role", appBaseUrl), { status: 303 });
      }
      await upsertMembership({
        orgId: u.orgId!,
        userId,
        role,
        invitedByUserId: u.id,
      });
      await sql`
        update public.users
        set role = ${role}
        where id = ${userId}::uuid
      `;
      return NextResponse.redirect(new URL("/admin/security?saved=org_member_role", appBaseUrl), { status: 303 });
    }

    if (action === "remove_member") {
      const userId = String(form.get("user_id") || "").trim();
      if (!userId) {
        return NextResponse.redirect(new URL("/admin/security?error=invalid_member", appBaseUrl), { status: 303 });
      }
      await sql`
        update public.org_memberships
        set revoked_at = now()
        where org_id = ${u.orgId!}::uuid
          and user_id = ${userId}::uuid
      `;
      return NextResponse.redirect(new URL("/admin/security?saved=org_member_removed", appBaseUrl), { status: 303 });
    }

    if (action === "revoke_invite") {
      const inviteId = String(form.get("invite_id") || "").trim();
      if (!inviteId) {
        return NextResponse.redirect(new URL("/admin/security?error=invalid_invite", appBaseUrl), { status: 303 });
      }
      await revokeOrgInvite({ orgId: u.orgId!, inviteId });
      return NextResponse.redirect(new URL("/admin/security?saved=org_invite_revoked", appBaseUrl), { status: 303 });
    }

    return NextResponse.redirect(new URL("/admin/security?error=bad_action", appBaseUrl), { status: 303 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "SERVER_ERROR";
    const safeError =
      msg === "FORBIDDEN" || msg === "UNAUTHENTICATED"
        ? "FORBIDDEN"
        : msg.startsWith("APP_BASE_URL_")
          ? "ENV_MISCONFIGURED"
          : "SERVER_ERROR";
    return NextResponse.redirect(new URL(`/admin/security?error=${encodeURIComponent(safeError)}`, appBaseUrl), { status: 303 });
  }
}
