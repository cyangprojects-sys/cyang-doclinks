// src/lib/pdfSafety.ts
//
// Lightweight PDF safety validation and heuristic risk detection.
//
// Goals:
//  - Validate that unencrypted uploads are really PDFs (magic bytes + basic structure checks)
//  - Detect common "risky" PDF capabilities (JS, embedded files, launch actions, etc.)
//  - Keep it serverless-friendly: bounded reads via S3 Range requests
//
// IMPORTANT:
// This is NOT a full malware scanner. It is a low-cost guardrail that:
//  - blocks obvious non-PDF uploads
//  - flags PDFs with risky features so the UI can warn / force download-only
//
// For stronger scanning, integrate an async pipeline (ClamAV / commercial scanner) and
// mark docs as pending/clean/quarantined in DB.

import { GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { r2Client } from "@/lib/r2";

export type PdfRiskLevel = "low" | "medium" | "high";

export type PdfSafetyResult =
  | {
      ok: true;
      isPdf: true;
      riskLevel: PdfRiskLevel;
      flags: string[];
      details: Record<string, unknown>;
    }
  | {
      ok: false;
      error: "NOT_PDF" | "UNREADABLE" | "TOO_LARGE" | "INTERNAL";
      message: string;
      details?: Record<string, unknown>;
    };

function bufToAscii(b: Buffer): string {
  // loss-tolerant scan string
  return b.toString("latin1");
}

function hasPdfHeader(head: Buffer): boolean {
  const s = head.toString("latin1");
  return s.startsWith("%PDF-");
}

function findFlags(sample: string): string[] {
  const flags: string[] = [];

  // High-risk capabilities
  if (sample.includes("/JavaScript") || sample.includes("/JS")) flags.push("pdf:javascript");
  if (sample.includes("/Launch")) flags.push("pdf:launch_action");
  if (sample.includes("/EmbeddedFile") || sample.includes("/Filespec")) flags.push("pdf:embedded_file");
  if (sample.includes("/RichMedia") || sample.includes("/Flash")) flags.push("pdf:rich_media");
  if (sample.includes("/OpenAction")) flags.push("pdf:open_action");
  if (sample.includes("/AA")) flags.push("pdf:additional_actions");

  // Phishing-ish / link-y signals (lower severity)
  if (sample.includes("/URI")) flags.push("pdf:uri_links");
  if (sample.includes("/GoToR")) flags.push("pdf:remote_goto");

  return Array.from(new Set(flags));
}

function riskFromFlags(flags: string[]): PdfRiskLevel {
  const high = new Set([
    "pdf:javascript",
    "pdf:embedded_file",
    "pdf:launch_action",
    "pdf:rich_media",
  ]);
  const medium = new Set(["pdf:open_action", "pdf:additional_actions"]);

  if (flags.some((f) => high.has(f))) return "high";
  if (flags.some((f) => medium.has(f))) return "medium";
  if (flags.length) return "medium";
  return "low";
}

async function readRange(args: { bucket: string; key: string; range: string }): Promise<Buffer> {
  const res = await r2Client.send(
    new GetObjectCommand({
      Bucket: args.bucket,
      Key: args.key,
      Range: args.range,
    })
  );

  const body: any = (res as any).Body;
  if (!body) return Buffer.alloc(0);

  // In Node.js, Body is a stream.
  const chunks: Buffer[] = [];
  for await (const chunk of body as any) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function countPdfPages(text: string): number {
  // Heuristic page marker count used as a hard guardrail.
  const matches = text.match(/\/Type\s*\/Page\b/g);
  return matches ? matches.length : 0;
}

export async function validatePdfInR2(args: {
  bucket: string;
  key: string;
  // Maximum bytes to sample from the start of the file (default 256KB)
  sampleBytes?: number;
  // Absolute max allowed size (safety)
  absMaxBytes?: number;
  // Hard page count cap. 0/undefined disables.
  maxPdfPages?: number;
  // Max object size eligible for full page-count pass.
  pageCountCheckMaxBytes?: number;
}): Promise<PdfSafetyResult> {
  const sampleBytes = Math.max(4 * 1024, Math.min(Number(args.sampleBytes ?? 256 * 1024), 1024 * 1024));
  const absMaxBytes = Number(args.absMaxBytes ?? 1_000_000_000);
  const maxPdfPages = Math.max(0, Number(args.maxPdfPages ?? 0));
  const pageCountCheckMaxBytes = Math.max(1024 * 1024, Number(args.pageCountCheckMaxBytes ?? 25 * 1024 * 1024));

  try {
    const head = await r2Client.send(new HeadObjectCommand({ Bucket: args.bucket, Key: args.key }));
    const size = Number((head as any)?.ContentLength ?? 0);

    if (!Number.isFinite(size) || size <= 0) {
      return { ok: false, error: "UNREADABLE", message: "Object size is invalid." };
    }
    if (Number.isFinite(absMaxBytes) && absMaxBytes > 0 && size > absMaxBytes) {
      return { ok: false, error: "TOO_LARGE", message: "Object exceeds absolute max.", details: { size, absMaxBytes } };
    }

    const first = await readRange({ bucket: args.bucket, key: args.key, range: `bytes=0-${sampleBytes - 1}` });
    if (!first.length) return { ok: false, error: "UNREADABLE", message: "Unable to read object bytes." };

    if (!hasPdfHeader(first.subarray(0, Math.min(first.length, 8)))) {
      return { ok: false, error: "NOT_PDF", message: "Missing %PDF- header (not a valid PDF)." };
    }

    const sample = bufToAscii(first);
    const flags = findFlags(sample);
    const riskLevel = riskFromFlags(flags);
    let pageCount = countPdfPages(sample);

    if (maxPdfPages > 0 && size <= pageCountCheckMaxBytes && size > first.length) {
      const full = await readRange({ bucket: args.bucket, key: args.key, range: `bytes=0-${size - 1}` });
      if (full.length) {
        pageCount = countPdfPages(bufToAscii(full));
      }
    }

    if (maxPdfPages > 0 && pageCount > maxPdfPages) {
      return {
        ok: false,
        error: "INTERNAL",
        message: "PDF exceeds max page count policy.",
        details: { pageCount, maxPdfPages },
      };
    }

    return {
      ok: true,
      isPdf: true,
      riskLevel,
      flags,
      details: { sampledBytes: first.length, size, pageCount, maxPdfPages: maxPdfPages || null },
    };
  } catch (e: unknown) {
    const errName = e instanceof Error ? e.name : "Error";
    const errMsg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      error: "INTERNAL",
      message: "PDF validation failed.",
      details: { err: errName, message: errMsg },
    };
  }
}
