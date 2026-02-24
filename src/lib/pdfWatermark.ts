import { PDFDocument, degrees, rgb, StandardFonts } from "pdf-lib";

/**
 * Server-side PDF watermark stamping for Controlled Information Infrastructure.
 *
 * This produces a new PDF with the watermark "burned in" to every page.
 * It is intentionally light-weight (no external binaries) and runs in Node.
 *
 * NOTE: The original PDF bytes are never modified in-place; we return a new Buffer.
 */

export type WatermarkIdentity =
  | { kind: "known"; label: string } // e.g. email or "Name <email>"
  | { kind: "anon"; label: string }; // e.g. "Viewer 3f9c…"

export type WatermarkSpec = {
  identity: WatermarkIdentity;
  timestampIso: string;
  shareIdShort: string;
  docIdShort: string;
  ipHashShort?: string | null;
  // Optional custom text provided by share/doc policy (e.g. "Confidential – RFP Response")
  customText?: string | null;
};

function safeLine(s: string) {
  return String(s || "").replace(/[\r\n]+/g, " ").trim();
}

function buildLines(spec: WatermarkSpec) {
  const id = safeLine(spec.identity.label);
  const t = safeLine(spec.timestampIso);
  const share = safeLine(spec.shareIdShort);
  const doc = safeLine(spec.docIdShort);

  const metaParts: string[] = [];
  if (spec.ipHashShort) metaParts.push(`ip:${safeLine(spec.ipHashShort)}`);

  const header = spec.customText ? safeLine(spec.customText) : "Confidential";
  const line1 = `${header}`;
  const line2 = `${id} • ${t}`;
  const line3 = `share:${share} • doc:${doc}${metaParts.length ? " • " + metaParts.join(" • ") : ""}`;

  return { line1, line2, line3 };
}

/**
 * Apply a repeating diagonal watermark + footer line to each page.
 */
export async function stampPdfWithWatermark(inputPdf: Buffer, spec: WatermarkSpec): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(inputPdf, { ignoreEncryption: true });

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pages = pdfDoc.getPages();
  const { line1, line2, line3 } = buildLines(spec);

  for (const page of pages) {
    const { width, height } = page.getSize();

    // Diagonal repeating watermark pattern.
    // We draw multiple watermarks across the page so cropping is harder.
    const angle = degrees(-25);

    // Base styling: subtle gray with low opacity.
    const color = rgb(0.55, 0.55, 0.55);

    const bigSize = Math.max(22, Math.min(44, Math.floor(Math.min(width, height) / 18)));
    const smallSize = Math.max(10, Math.min(14, Math.floor(bigSize / 3)));

    const spacingX = Math.max(260, Math.floor(width / 2));
    const spacingY = Math.max(220, Math.floor(height / 2));

    // Start slightly off-canvas so tiling covers edges.
    for (let y = -height; y < height * 2; y += spacingY) {
      for (let x = -width; x < width * 2; x += spacingX) {
        page.drawText(line1, {
          x,
          y,
          size: bigSize,
          font: fontBold,
          color,
          opacity: 0.12,
          rotate: angle,
        });
        page.drawText(line2, {
          x,
          y - bigSize - 6,
          size: smallSize,
          font,
          color,
          opacity: 0.12,
          rotate: angle,
        });
      }
    }

    // Footer line (clear, readable forensic string)
    const footer = `${line2} • ${line3}`;
    page.drawText(footer, {
      x: 24,
      y: 14,
      size: 9,
      font,
      color: rgb(0.35, 0.35, 0.35),
      opacity: 0.65,
    });
  }

  const bytes = await pdfDoc.save({ useObjectStreams: true });
  return Buffer.from(bytes);
}
