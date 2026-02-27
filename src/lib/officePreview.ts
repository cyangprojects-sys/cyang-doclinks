import mammoth from "mammoth";
import JSZip from "jszip";
import * as XLSX from "xlsx";

export type OfficePreviewResult =
  | { ok: true; html: string }
  | { ok: false; error: string; message: string };

function shellHtml(body: string): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      :root { color-scheme: dark; }
      html, body { margin: 0; padding: 0; background: #0b1220; color: #e5e7eb; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; }
      .wrap { padding: 16px; line-height: 1.6; }
      table { border-collapse: collapse; width: 100%; max-width: 100%; overflow: auto; display: block; }
      th, td { border: 1px solid #334155; padding: 6px 8px; font-size: 12px; }
      a { color: #7dd3fc; text-decoration: underline; }
      h1,h2,h3 { margin-top: 1.25em; }
      p, li { font-size: 14px; }
      pre { white-space: pre-wrap; word-break: break-word; }
    </style>
  </head>
  <body><div class="wrap">${body}</div></body>
</html>`;
}

function sanitizeHtml(input: string): string {
  return String(input || "")
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/\son\w+='[^']*'/gi, "");
}

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function mimeKind(mimeType: string): "docx" | "sheet" | "pptx" | "unsupported" {
  const m = String(mimeType || "").toLowerCase();
  if (
    m === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    m === "application/msword" ||
    m === "application/vnd.oasis.opendocument.text"
  ) {
    return "docx";
  }
  if (
    m === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    m === "application/vnd.ms-excel" ||
    m === "text/csv"
  ) {
    return "sheet";
  }
  if (
    m === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    m === "application/vnd.ms-powerpoint"
  ) {
    return "pptx";
  }
  return "unsupported";
}

async function convertDocxLike(bytes: Buffer): Promise<OfficePreviewResult> {
  try {
    const out = await mammoth.convertToHtml({ buffer: bytes });
    const html = sanitizeHtml(out.value || "");
    if (!html.trim()) {
      return { ok: false, error: "EMPTY_CONVERSION", message: "No previewable content found." };
    }
    return { ok: true, html: shellHtml(html) };
  } catch {
    return { ok: false, error: "DOC_CONVERSION_FAILED", message: "Document conversion failed." };
  }
}

function convertSpreadsheet(bytes: Buffer): OfficePreviewResult {
  try {
    const wb = XLSX.read(bytes, { type: "buffer" });
    const names = wb.SheetNames || [];
    if (!names.length) return { ok: false, error: "EMPTY_WORKBOOK", message: "Workbook has no sheets." };
    const parts: string[] = [];
    for (const name of names.slice(0, 5)) {
      const ws = wb.Sheets[name];
      if (!ws) continue;
      const table = XLSX.utils.sheet_to_html(ws, { editable: false });
      parts.push(`<h2>${esc(name)}</h2>${sanitizeHtml(table)}`);
    }
    const html = parts.join("<hr/>");
    if (!html.trim()) return { ok: false, error: "EMPTY_CONVERSION", message: "No previewable sheet data found." };
    return { ok: true, html: shellHtml(html) };
  } catch {
    return { ok: false, error: "SHEET_CONVERSION_FAILED", message: "Spreadsheet conversion failed." };
  }
}

async function convertPptxLike(bytes: Buffer): Promise<OfficePreviewResult> {
  try {
    const zip = await JSZip.loadAsync(bytes);
    const slideFiles = Object.keys(zip.files)
      .filter((n) => /^ppt\/slides\/slide\d+\.xml$/i.test(n))
      .sort((a, b) => {
        const ai = Number((a.match(/slide(\d+)\.xml/i) || [])[1] || 0);
        const bi = Number((b.match(/slide(\d+)\.xml/i) || [])[1] || 0);
        return ai - bi;
      });
    if (!slideFiles.length) {
      return { ok: false, error: "EMPTY_PRESENTATION", message: "Presentation has no slides." };
    }
    const parts: string[] = [];
    for (const [idx, f] of slideFiles.slice(0, 50).entries()) {
      const xml = await zip.files[f].async("text");
      const texts = [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) => m[1]).filter(Boolean);
      const content = texts.length
        ? `<ul>${texts.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`
        : "<p><em>No extractable text on this slide.</em></p>";
      parts.push(`<h2>Slide ${idx + 1}</h2>${content}`);
    }
    return { ok: true, html: shellHtml(parts.join("<hr/>")) };
  } catch {
    return { ok: false, error: "PPT_CONVERSION_FAILED", message: "Presentation conversion failed." };
  }
}

export async function convertOfficeBytes(args: {
  bytes: Buffer;
  mimeType: string;
}): Promise<OfficePreviewResult> {
  const kind = mimeKind(args.mimeType);
  if (kind === "docx") return convertDocxLike(args.bytes);
  if (kind === "sheet") return convertSpreadsheet(args.bytes);
  if (kind === "pptx") return convertPptxLike(args.bytes);
  return { ok: false, error: "UNSUPPORTED_MIME", message: "Unsupported office type for conversion." };
}

