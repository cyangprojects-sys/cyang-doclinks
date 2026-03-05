import crypto from "crypto";
import { sql } from "@/lib/db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_STREAM_KEY_LEN = 160;
const MAX_ACTION_LEN = 120;
const MAX_SUBJECT_LEN = 256;
const MAX_IP_HASH_LEN = 128;
const MAX_PAYLOAD_DEPTH = 4;
const MAX_PAYLOAD_ARRAY_ITEMS = 64;
const MAX_PAYLOAD_OBJECT_KEYS = 64;
const MAX_PAYLOAD_KEY_LEN = 64;
const MAX_PAYLOAD_STRING_LEN = 512;

type ImmutableAuditEvent = {
  streamKey: string;
  action: string;
  actorUserId?: string | null;
  orgId?: string | null;
  docId?: string | null;
  subjectId?: string | null;
  ipHash?: string | null;
  payload?: Record<string, unknown> | null;
};

function clampText(value: unknown, maxLen: number): string | null {
  const s = String(value || "").trim();
  if (!s) return null;
  return s.slice(0, maxLen);
}

function normalizeUuidOrNull(value: unknown): string | null {
  const s = String(value || "").trim();
  if (!s) return null;
  return UUID_RE.test(s) ? s : null;
}

function sanitizePayload(value: unknown, depth: number = 0): unknown {
  if (value == null) return null;
  if (typeof value === "string") return value.slice(0, MAX_PAYLOAD_STRING_LEN);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (depth >= MAX_PAYLOAD_DEPTH) return "[truncated]";
  if (Array.isArray(value)) {
    return value.slice(0, MAX_PAYLOAD_ARRAY_ITEMS).map((v) => sanitizePayload(v, depth + 1));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    const entries = Object.entries(value as Record<string, unknown>).slice(0, MAX_PAYLOAD_OBJECT_KEYS);
    for (const [k, v] of entries) {
      const key = String(k || "").slice(0, MAX_PAYLOAD_KEY_LEN);
      if (!key) continue;
      out[key] = sanitizePayload(v, depth + 1);
    }
    return out;
  }
  return String(value).slice(0, MAX_PAYLOAD_STRING_LEN);
}

function stableJson(input: unknown): string {
  if (input === null || typeof input !== "object") return JSON.stringify(input);
  if (Array.isArray(input)) return `[${input.map(stableJson).join(",")}]`;
  const obj = input as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableJson(obj[k])}`).join(",")}}`;
}

function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export async function appendImmutableAudit(
  event: ImmutableAuditEvent,
  options?: { strict?: boolean }
): Promise<void> {
  const streamKey = clampText(event.streamKey, MAX_STREAM_KEY_LEN) || "";
  const action = clampText(event.action, MAX_ACTION_LEN) || "";
  if (!streamKey || !action) return;

  const occurredAt = new Date().toISOString();
  const payload = sanitizePayload(event.payload ?? {}) as Record<string, unknown>;
  const actorUserId = normalizeUuidOrNull(event.actorUserId);
  const orgId = normalizeUuidOrNull(event.orgId);
  const docId = normalizeUuidOrNull(event.docId);
  const subjectId = clampText(event.subjectId, MAX_SUBJECT_LEN);
  const ipHash = clampText(event.ipHash, MAX_IP_HASH_LEN);

  try {
    const prevRows = (await sql`
      select seq::bigint as seq, event_hash::text as event_hash
      from public.immutable_audit_log
      where stream_key = ${streamKey}
      order by seq desc
      limit 1
    `) as unknown as Array<{ seq: number | string; event_hash: string }>;

    const prevSeq = Number(prevRows?.[0]?.seq ?? 0);
    const previousHash = prevRows?.[0]?.event_hash ?? "";
    const seq = prevSeq + 1;

    const payloadHash = sha256Hex(stableJson(payload));
    const eventHash = sha256Hex(
      [streamKey, seq, occurredAt, action, previousHash, payloadHash].join("|")
    );

    await sql`
      insert into public.immutable_audit_log
        (stream_key, seq, previous_hash, event_hash, action, actor_user_id, org_id, doc_id, subject_id, ip_hash, payload, occurred_at)
      values
        (
          ${streamKey},
          ${seq}::bigint,
          ${previousHash || null},
          ${eventHash},
          ${action},
          ${actorUserId}::uuid,
          ${orgId}::uuid,
          ${docId}::uuid,
          ${subjectId},
          ${ipHash},
          ${JSON.stringify(payload)}::jsonb,
          ${occurredAt}::timestamptz
        )
    `;
  } catch (e) {
    if (options?.strict || String(process.env.IMMUTABLE_AUDIT_STRICT || "").trim() === "1") {
      throw e;
    }
    // best-effort
  }
}
