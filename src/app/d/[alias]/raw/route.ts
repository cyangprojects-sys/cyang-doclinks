// src/app/d/[alias]/raw/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import type { NextRequest } from "next/server";
import { r2Client } from "@/lib/r2";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { resolveDoc } from "@/lib/resolveDoc";

function pickFilename(title: string | null, original: string | null, fallback: string) {
  const base = (title || original || fallback).trim() || fallback;
  return base.replace(/[^\w.\- ]+/g, "_");
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ alias: string }> }): Promise<Response> {
  const { alias: rawAlias } = await ctx.params;
  const alias = String(rawAlias || "").trim();

  if (!alias) {
    return new Response("Missing alias", { status: 400 });
  }

  const resolved = await resolveDoc({ alias });

  if (!resolved.ok) {
    const status = resolved.error === "PASSWORD_REQUIRED" ? 302 : 404;
    // If password required for alias, you probably want to redirect to /d/[alias] (not raw)
    if (resolved.error === "PASSWORD_REQUIRED") {
      return new Response(null, {
        status: 302,
        headers: { Location: `/d/${encodeURIComponent(alias)}` },
      });
    }
    return new Response("Not found", { status });
  }

  const obj = await r2Client.send(
    new GetObjectCommand({
      Bucket: resolved.bucket,
      Key: resolved.r2Key,
    })
  );

  if (!obj.Body) {
    return new Response("Object body missing", { status: 500 });
  }

  const filename = pickFilename(resolved.title, resolved.originalFilename, alias) + ".pdf";
  const contentType = resolved.contentType || "application/pdf";

  return new Response(obj.Body as any, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, max-age=0, must-revalidate",
    },
  });
}
