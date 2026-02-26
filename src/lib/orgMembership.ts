import crypto from "crypto";
import { sql } from "@/lib/db";
import type { Role } from "@/lib/authz";

export type OrgMembershipRole = Role;

function normEmail(email: string): string {
  return String(email || "").trim().toLowerCase();
}

function inviteHashSecret(): string {
  const secret = (process.env.NEXTAUTH_SECRET || process.env.VIEW_SALT || "").trim();
  if (!secret) throw new Error("Missing NEXTAUTH_SECRET or VIEW_SALT for invite hashing.");
  return secret;
}

export function hashInviteToken(token: string): string {
  return crypto.createHmac("sha256", inviteHashSecret()).update(String(token || "")).digest("hex");
}

export function createOrgInviteToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

export async function orgMembershipTablesReady(): Promise<boolean> {
  try {
    const rows = (await sql`
      select
        to_regclass('public.org_memberships')::text as memberships,
        to_regclass('public.org_invites')::text as invites
    `) as unknown as Array<{ memberships: string | null; invites: string | null }>;
    const r = rows?.[0];
    return Boolean(r?.memberships && r?.invites);
  } catch {
    return false;
  }
}

export async function getActiveMembership(args: { orgId: string; userId: string }) {
  const rows = (await sql`
    select role::text as role
    from public.org_memberships
    where org_id = ${args.orgId}::uuid
      and user_id = ${args.userId}::uuid
      and revoked_at is null
    limit 1
  `) as unknown as Array<{ role: OrgMembershipRole }>;
  return rows?.[0] ?? null;
}

export async function upsertMembership(args: {
  orgId: string;
  userId: string;
  role: OrgMembershipRole;
  invitedByUserId?: string | null;
}) {
  await sql`
    insert into public.org_memberships (org_id, user_id, role, invited_by_user_id, joined_at, revoked_at)
    values (${args.orgId}::uuid, ${args.userId}::uuid, ${args.role}, ${args.invitedByUserId ?? null}::uuid, now(), null)
    on conflict (org_id, user_id)
    do update set
      role = excluded.role,
      invited_by_user_id = coalesce(excluded.invited_by_user_id, public.org_memberships.invited_by_user_id),
      revoked_at = null
  `;
}

export async function createOrgInvite(args: {
  orgId: string;
  email: string;
  role: OrgMembershipRole;
  invitedByUserId: string;
  expiresDays?: number;
}) {
  const token = createOrgInviteToken();
  const tokenHash = hashInviteToken(token);
  const days = Math.max(1, Math.min(90, Number(args.expiresDays ?? 7)));
  const email = normEmail(args.email);

  await sql`
    insert into public.org_invites (org_id, email, role, token_hash, invited_by_user_id, expires_at)
    values (${args.orgId}::uuid, ${email}, ${args.role}, ${tokenHash}, ${args.invitedByUserId}::uuid, now() + (${days}::text || ' days')::interval)
  `;

  return { token };
}

export async function revokeOrgInvite(args: { orgId: string; inviteId: string }) {
  await sql`
    update public.org_invites
    set revoked_at = now()
    where id = ${args.inviteId}::uuid
      and org_id = ${args.orgId}::uuid
      and accepted_at is null
      and revoked_at is null
  `;
}

export async function acceptInviteForUser(args: {
  orgId: string;
  userId: string;
  email: string;
  token: string;
}) {
  const tokenHash = hashInviteToken(args.token);
  const email = normEmail(args.email);

  const rows = (await sql`
    update public.org_invites
    set accepted_at = now(),
        accepted_by_user_id = ${args.userId}::uuid
    where org_id = ${args.orgId}::uuid
      and token_hash = ${tokenHash}
      and lower(email) = ${email}
      and accepted_at is null
      and revoked_at is null
      and expires_at > now()
    returning role::text as role, invited_by_user_id::text as invited_by_user_id
  `) as unknown as Array<{ role: OrgMembershipRole; invited_by_user_id: string | null }>;

  const r = rows?.[0];
  if (!r) return null;

  await upsertMembership({
    orgId: args.orgId,
    userId: args.userId,
    role: r.role,
    invitedByUserId: r.invited_by_user_id,
  });

  return r.role;
}

export async function listOrgMemberships(orgId: string) {
  return (await sql`
    select
      om.user_id::text as user_id,
      lower(u.email)::text as email,
      om.role::text as role,
      om.joined_at::text as joined_at,
      om.revoked_at::text as revoked_at
    from public.org_memberships om
    join public.users u on u.id = om.user_id
    where om.org_id = ${orgId}::uuid
    order by
      case om.role when 'owner' then 0 when 'admin' then 1 else 2 end,
      om.joined_at asc
  `) as unknown as Array<{
    user_id: string;
    email: string;
    role: OrgMembershipRole;
    joined_at: string;
    revoked_at: string | null;
  }>;
}

export async function listPendingOrgInvites(orgId: string) {
  return (await sql`
    select
      id::text as id,
      lower(email)::text as email,
      role::text as role,
      created_at::text as created_at,
      expires_at::text as expires_at
    from public.org_invites
    where org_id = ${orgId}::uuid
      and accepted_at is null
      and revoked_at is null
    order by created_at desc
  `) as unknown as Array<{
    id: string;
    email: string;
    role: OrgMembershipRole;
    created_at: string;
    expires_at: string;
  }>;
}

