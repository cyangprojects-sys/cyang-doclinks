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
import { resolvePublicAppBaseUrl } from "@/lib/publicBaseUrl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROLES: Role[] = ["viewer", "admin", "owner"];
const MAX_SECURITY_RBAC_BODY_BYTES = 8 * 1024;

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

function parseJsonBodyLength(req: Request): number {
  const raw = String(req.headers.get("content-length") || "").trim();
  const out = Number(raw);
  return Number.isFinite(out) ? Math.max(0, Math.floor(out)) : 0;
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
    return NextResponse.json({ ok: false, error: status === 403 ? "FORBIDDEN" : "SERVER_ERROR" }, { status });
  }
}

export async function POST(req: Request) {
  let appBaseUrl: string;
  const ct = String(req.headers.get("content-type") || "").toLowerCase();
  try {
    appBaseUrl = resolvePublicAppBaseUrl(req.url);
  } catch {
    return NextResponse.json({ ok: false, error: "ENV_MISCONFIGURED" }, { status: 500 });
  }

  try {
    if (parseJsonBodyLength(req) > MAX_SECURITY_RBAC_BODY_BYTES) {
      if (ct.includes("application/json")) {
        return NextResponse.json({ ok: false, error: "PAYLOAD_TOO_LARGE" }, { status: 413 });
      }
      return NextResponse.redirect(new URL("/admin/security?error=PAYLOAD_TOO_LARGE", appBaseUrl), { status: 303 });
    }
    const user = await requirePermission("security.keys.manage");

    let payload: { permission?: unknown; role?: unknown; allowed?: unknown } = {};
    if (ct.includes("application/json")) {
      const parsed = await req.json().catch(() => null);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return NextResponse.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });
      }
      payload = parsed as typeof payload;
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
    return NextResponse.redirect(new URL("/admin/security?saved=rbac", appBaseUrl), { status: 303 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "SERVER_ERROR";
    const status = msg === "FORBIDDEN" || msg === "UNAUTHENTICATED" ? 403 : 500;
    const safeError = status === 403 ? "FORBIDDEN" : "SERVER_ERROR";
    if (String(req.headers.get("content-type") || "").toLowerCase().includes("application/json")) {
      return NextResponse.json({ ok: false, error: safeError }, { status });
    }
    return NextResponse.redirect(new URL(`/admin/security?error=${encodeURIComponent(safeError)}`, appBaseUrl), { status: 303 });
  }
}
