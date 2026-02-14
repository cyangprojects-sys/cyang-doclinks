import { NextResponse } from "next/server";
import { z } from "zod";
import { HeadObjectCommand } from "@aws-sdk/client-s3";

import { sql } from "@/lib/db";
import { r2Client, r2Bucket, r2Prefix } from "@/lib/r2";
import { requireOwner } from "@/lib/owner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
    docId: z.string().uuid(),
});

type NewSchemaRow = {
    r2_bucket: string | null;
    r2_key: string | null;
};

type PointerRow = {
    pointer: string | null;
};

async function getR2Location(docId: string): Promise<{ bucket: string; key: string } | null> {
    // Attempt A: new schema columns r2_bucket/r2_key
    try {
        const rows = (await sql`
      select r2_bucket, r2_key
      from docs
      where id = ${docId}::uuid
      limit 1
    `) as unknown as NewSchemaRow[];

        const bucket = rows[0]?.r2_bucket ?? null;
        const key = rows[0]?.r2_key ?? null;
        if (bucket && key) return { bucket, key };
    } catch (e: any) {
        // If columns don't exist, fall through to pointer attempt.
        const msg = String(e?.message || "").toLowerCase();
        const missing =
            msg.includes("column") &&
            (msg.includes("r2_bucket") || msg.includes("r2_key")) &&
            msg.includes("does not exist");
        if (!missing) throw e;
    }

    // Attempt B: legacy pointer column "r2://bucket/key" (or using r2Prefix + key)
    try {
        const rows = (await sql`
      select pointer
      from docs
      where id = ${docId}::uuid
      limit 1
    `) as unknown as PointerRow[];

        const pointer = rows[0]?.pointer ?? null;
        if (!pointer) return null;

        // If pointer is "r2://<bucket>/<key>"
        if (pointer.startsWith("r2://")) {
            const rest = pointer.slice("r2://".length);
            const slash = rest.indexOf("/");
            if (slash <= 0) return null;
            const bucket = rest.slice(0, slash);
            const key = rest.slice(slash + 1);
            if (!bucket || !key) return null;
            return { bucket, key };
        }

        // If pointer is using configured prefix, treat bucket from env and strip prefix to get key
        if (r2Prefix && pointer.startsWith(r2Prefix)) {
            const key = pointer.slice(r2Prefix.length);
            if (!key) return null;
            return { bucket: r2Bucket, key };
        }

        return null;
    } catch (e: any) {
        const msg = String(e?.message || "").toLowerCase();
        const missing = msg.includes("column") && msg.includes("pointer") && msg.includes("does not exist");
        if (!missing) throw e;
        return null;
    }
}

async function tryUpdateStatus(docId: string, status: string) {
    try {
        await sql`update docs set status = ${status} where id = ${docId}::uuid`;
    } catch {
        // ignore if status column doesn't exist
    }
}

async function tryUpdateMeta(docId: string, sizeBytes: number, contentType: string) {
    // Attempt A: update size_bytes/content_type/status
    try {
        await sql`
      update docs
      set status = 'ready',
          size_bytes = ${sizeBytes}::bigint,
          content_type = ${contentType}
      where id = ${docId}::uuid
    `;
        return;
    } catch {
        // ignore — columns might not exist
    }

    // Attempt B: update content_type/size_bytes only
    try {
        await sql`
      update docs
      set size_bytes = ${sizeBytes}::bigint,
          content_type = ${contentType}
      where id = ${docId}::uuid
    `;
        return;
    } catch {
        // ignore
    }

    // Attempt C: update status only
    await tryUpdateStatus(docId, "ready");
}

export async function POST(req: Request) {
    const owner = await requireOwner();
    if (!owner.ok) {
        return NextResponse.json(
            { ok: false, error: owner.reason },
            { status: owner.reason === "UNAUTHENTICATED" ? 401 : 403 }
        );
    }

    const json = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
        return NextResponse.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });
    }

    const { docId } = parsed.data;

    const loc = await getR2Location(docId);
    if (!loc) return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });

    try {
        const head = await r2Client.send(
            new HeadObjectCommand({
                Bucket: loc.bucket,
                Key: loc.key,
            })
        );

        const sizeBytes = Number(head.ContentLength ?? 0);
        const contentType = String(head.ContentType ?? "");

        if (sizeBytes <= 0) {
            await tryUpdateStatus(docId, "failed");
            return NextResponse.json({ ok: false, error: "EMPTY_OBJECT" }, { status: 400 });
        }

        if (contentType !== "application/pdf") {
            await tryUpdateStatus(docId, "failed");
            return NextResponse.json({ ok: false, error: "NOT_PDF" }, { status: 400 });
        }

        await tryUpdateMeta(docId, sizeBytes, contentType);

        return NextResponse.json({
            ok: true,
            doc_id: docId,
            size_bytes: sizeBytes,
            content_type: contentType,
        });
    } catch {
        await tryUpdateStatus(docId, "failed");
        return NextResponse.json({ ok: false, error: "R2_HEAD_FAILED" }, { status: 400 });
    }
}
