import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import {
  RBAC_PERMISSIONS,
  listRolePermissionOverrides,
  permissionsTableExists,
  upsertRolePermissionOverride,
  type Permission,
} from "@/lib/rbac";
import { type Role } from "@/lib/authz";
import { logSecurityEvent } from "@/lib/securityTelemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROLES: Role[] = ["viewer", "admin", "owner"];

function asBool(v: unknown): boolean {
  const s = String(v ?? "").trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(s);
}

function parsePermission(v: unknown): Permission | null {
  const s = String(v ?? "").trim() as Permission;
  return RBAC_PERMISSIONS.includes(s) ? s : null;
}

function parseRole(v: unknown): Role | null {
  const s = String(v ?? "").trim() as Role;
  return ROLES.includes(s) ? s : null;
}

export async function GET() {
  try {
    await requirePermission("security.keys.manage");
    const exists = await permissionsTableExists();
    const rows = exists ? await listRolePermissionOverrides() : [];
    return NextResponse.json({ ok: true, table_exists: exists, overrides: rows });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "SERVER_ERROR";
    const status = msg === "FORBIDDEN" || msg === "UNAUTHENTICATED" ? 403 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requirePermission("security.keys.manage");

    let payload: { permission?: unknown; role?: unknown; allowed?: unknown } = {};
    const ct = String(req.headers.get("content-type") || "").toLowerCase();
    if (ct.includes("application/json")) {
      payload = ((await req.json().catch(() => null)) || {}) as typeof payload;
    } else {
      const form = await req.formData();
      payload = {
        permission: form.get("permission"),
        role: form.get("role"),
        allowed: form.get("allowed"),
      };
    }

    const permission = parsePermission(payload.permission);
    const role = parseRole(payload.role);
    if (!permission || !role) {
      return NextResponse.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });
    }

    await upsertRolePermissionOverride({
      permission,
      role,
      allowed: asBool(payload.allowed),
    });

    await logSecurityEvent({
      type: "rbac_override_updated",
      severity: "high",
      actorUserId: user.id,
      orgId: user.orgId ?? null,
      scope: "rbac",
      message: "RBAC role-permission override updated",
      meta: { permission, role, allowed: asBool(payload.allowed) },
    });

    if (ct.includes("application/json")) {
      return NextResponse.json({ ok: true });
    }
    return NextResponse.redirect(new URL("/admin/security?saved=rbac", req.url), { status: 303 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "SERVER_ERROR";
    const status = msg === "FORBIDDEN" || msg === "UNAUTHENTICATED" ? 403 : 500;
    if (String(req.headers.get("content-type") || "").toLowerCase().includes("application/json")) {
      return NextResponse.json({ ok: false, error: msg }, { status });
    }
    return NextResponse.redirect(new URL(`/admin/security?error=${encodeURIComponent(msg)}`, req.url), { status: 303 });
  }
}

