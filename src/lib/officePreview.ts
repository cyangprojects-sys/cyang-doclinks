import mammoth from "mammoth";
import JSZip from "jszip";

export type OfficePreviewResult =
  | { ok: true; html: string }
  | { ok: false; error: string; message: string };

const MAX_OFFICE_PREVIEW_BYTES = 10 * 1024 * 1024;
const MAX_MIME_LEN = 160;

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
    .replace(/\son\w+='[^']*'/gi, "")
    .replace(/\son\w+=([^\s>]+)/gi, "")
    .replace(/\s(href|src)\s*=\s*(['"])\s*javascript:[^'"]*\2/gi, "");
}

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function unescXml(s: string): string {
  return String(s || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function mimeKind(mimeType: string): "docx" | "sheet" | "pptx" | "unsupported" {
  const raw = String(mimeType || "").toLowerCase().split(";", 1)[0].trim().slice(0, MAX_MIME_LEN);
  if (!raw || /[\r\n\0]/.test(raw)) return "unsupported";
  const m = raw;
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

function convertCsv(csvText: string): string {
  const lines = csvText.split(/\r?\n/).slice(0, 1000);
  const rows = lines.map((line) => line.split(",").slice(0, 30));
  const body = rows
    .map((cols) => `<tr>${cols.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`)
    .join("");
  return `<table><tbody>${body}</tbody></table>`;
}

async function convertSpreadsheet(bytes: Buffer, mimeType: string): Promise<OfficePreviewResult> {
  try {
    const mime = String(mimeType || "").toLowerCase().split(";", 1)[0].trim();
    if (mime === "text/csv") {
      const table = convertCsv(bytes.toString("utf8"));
      return { ok: true, html: shellHtml(`<h2>Sheet 1</h2>${table}`) };
    }
    if (mime === "application/vnd.ms-excel") {
      return {
        ok: false,
        error: "XLS_PREVIEW_UNSUPPORTED",
        message: "Legacy .xls preview is not supported. Use .xlsx or .csv for inline preview.",
      };
    }
    const zip = await JSZip.loadAsync(bytes);
    const sharedStrings = new Map<number, string>();
    const sharedXmlFile = zip.file("xl/sharedStrings.xml");
    if (sharedXmlFile) {
      const sharedXml = await sharedXmlFile.async("text");
      const stringNodes = [...sharedXml.matchAll(/<si[\s\S]*?>([\s\S]*?)<\/si>/gi)];
      stringNodes.forEach((node, idx) => {
        const text = [...node[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/gi)].map((m) => unescXml(m[1])).join("");
        sharedStrings.set(idx, text);
      });
    }

    const workbookXmlFile = zip.file("xl/workbook.xml");
    const relsXmlFile = zip.file("xl/_rels/workbook.xml.rels");
    const sheetFiles = Object.keys(zip.files)
      .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(n))
      .sort((a, b) => {
        const ai = Number((a.match(/sheet(\d+)\.xml/i) || [])[1] || 0);
        const bi = Number((b.match(/sheet(\d+)\.xml/i) || [])[1] || 0);
        return ai - bi;
      });
    if (!sheetFiles.length) return { ok: false, error: "EMPTY_WORKBOOK", message: "Workbook has no sheets." };

    const relMap = new Map<string, string>();
    if (relsXmlFile) {
      const relsXml = await relsXmlFile.async("text");
      for (const m of relsXml.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/gi)) {
        relMap.set(m[1], `xl/${String(m[2]).replace(/^\//, "")}`);
      }
    }

    const sheetNameByPath = new Map<string, string>();
    if (workbookXmlFile) {
      const workbookXml = await workbookXmlFile.async("text");
      for (const m of workbookXml.matchAll(/<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/gi)) {
        const name = unescXml(m[1]);
        const relId = m[2];
        const path = relMap.get(relId);
        if (path) sheetNameByPath.set(path, name);
      }
    }

    const parts: string[] = [];
    for (const [sheetIdx, filePath] of sheetFiles.slice(0, 5).entries()) {
      const sheetXml = await zip.files[filePath].async("text");
      const rowParts: string[] = [];
      const rowMatches = [...sheetXml.matchAll(/<row\b[\s\S]*?>([\s\S]*?)<\/row>/gi)].slice(0, 500);
      for (const row of rowMatches) {
        const cells = [...row[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/gi)].slice(0, 30).map((cell) => {
          const attrs = cell[1] || "";
          const inner = cell[2] || "";
          const t = (attrs.match(/\bt="([^"]+)"/i) || [])[1] || "";
          const direct = (inner.match(/<v>([\s\S]*?)<\/v>/i) || [])[1] || "";
          const inline = [...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/gi)].map((m) => unescXml(m[1])).join("");
          const rawValue = inline || direct;
          let value = unescXml(rawValue);
          if (t === "s") {
            const idx = Number(value);
            value = Number.isFinite(idx) ? sharedStrings.get(idx) || "" : "";
          }
          return `<td>${esc(value)}</td>`;
        });
        rowParts.push(`<tr>${cells.join("")}</tr>`);
      }
      const displayName = sheetNameByPath.get(filePath) || `Sheet ${sheetIdx + 1}`;
      parts.push(`<h2>${esc(displayName)}</h2><table><tbody>${rowParts.join("")}</tbody></table>`);
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
  if (!Buffer.isBuffer(args.bytes) || args.bytes.length === 0) {
    return { ok: false, error: "EMPTY_PAYLOAD", message: "Office payload is empty." };
  }
  if (args.bytes.length > MAX_OFFICE_PREVIEW_BYTES) {
    return { ok: false, error: "PAYLOAD_TOO_LARGE", message: "Office payload is too large for preview." };
  }

  const kind = mimeKind(args.mimeType);
  if (kind === "docx") return convertDocxLike(args.bytes);
  if (kind === "sheet") return convertSpreadsheet(args.bytes, args.mimeType);
  if (kind === "pptx") return convertPptxLike(args.bytes);
  return { ok: false, error: "UNSUPPORTED_MIME", message: "Unsupported office type for conversion." };
}
