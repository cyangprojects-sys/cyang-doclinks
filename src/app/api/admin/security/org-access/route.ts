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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normEmail(email: unknown): string {
  return String(email || "").trim().toLowerCase();
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
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const u = await requireOwnerInOrg();
    if (!(await orgMembershipTablesReady())) {
      return NextResponse.json({ ok: false, error: "TABLES_MISSING" }, { status: 409 });
    }

    const form = await req.formData();
    const action = String(form.get("action") || "").trim();

    if (action === "invite") {
      const email = normEmail(form.get("email"));
      const role = parseRole(form.get("role")) || "viewer";
      const expiresDays = Number(form.get("expires_days") || 7);
      if (!email || !email.includes("@")) {
        return NextResponse.redirect(new URL("/admin/security?error=invalid_invite_email", req.url), { status: 303 });
      }

      const { token } = await createOrgInvite({
        orgId: u.orgId!,
        email,
        role,
        invitedByUserId: u.id,
        expiresDays,
      });

      const base = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
      const inviteUrl = `${String(base).replace(/\/+$/, "")}/org/${encodeURIComponent(u.orgSlug || "default")}/login?invite=${encodeURIComponent(token)}`;

      await logSecurityEvent({
        type: "org_invite_created",
        severity: "medium",
        actorUserId: u.id,
        orgId: u.orgId,
        scope: "org_membership",
        message: "Organization invite created",
        meta: { email, role },
      });

      return NextResponse.redirect(new URL(`/admin/security?saved=org_invite&invite_url=${encodeURIComponent(inviteUrl)}`, req.url), { status: 303 });
    }

    if (action === "set_member_role") {
      const userId = String(form.get("user_id") || "").trim();
      const role = parseRole(form.get("role"));
      if (!userId || !role) {
        return NextResponse.redirect(new URL("/admin/security?error=invalid_member_role", req.url), { status: 303 });
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
      return NextResponse.redirect(new URL("/admin/security?saved=org_member_role", req.url), { status: 303 });
    }

    if (action === "remove_member") {
      const userId = String(form.get("user_id") || "").trim();
      if (!userId) {
        return NextResponse.redirect(new URL("/admin/security?error=invalid_member", req.url), { status: 303 });
      }
      await sql`
        update public.org_memberships
        set revoked_at = now()
        where org_id = ${u.orgId!}::uuid
          and user_id = ${userId}::uuid
      `;
      return NextResponse.redirect(new URL("/admin/security?saved=org_member_removed", req.url), { status: 303 });
    }

    if (action === "revoke_invite") {
      const inviteId = String(form.get("invite_id") || "").trim();
      if (!inviteId) {
        return NextResponse.redirect(new URL("/admin/security?error=invalid_invite", req.url), { status: 303 });
      }
      await revokeOrgInvite({ orgId: u.orgId!, inviteId });
      return NextResponse.redirect(new URL("/admin/security?saved=org_invite_revoked", req.url), { status: 303 });
    }

    return NextResponse.redirect(new URL("/admin/security?error=bad_action", req.url), { status: 303 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "SERVER_ERROR";
    return NextResponse.redirect(new URL(`/admin/security?error=${encodeURIComponent(msg)}`, req.url), { status: 303 });
  }
}

