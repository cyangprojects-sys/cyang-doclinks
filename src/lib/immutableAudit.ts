import crypto from "crypto";
import { sql } from "@/lib/db";

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
  const streamKey = String(event.streamKey || "").trim();
  const action = String(event.action || "").trim();
  if (!streamKey || !action) return;

  const occurredAt = new Date().toISOString();
  const payload = event.payload ?? {};

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
          ${event.actorUserId ? event.actorUserId : null}::uuid,
          ${event.orgId ? event.orgId : null}::uuid,
          ${event.docId ? event.docId : null}::uuid,
          ${event.subjectId ?? null},
          ${event.ipHash ?? null},
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
