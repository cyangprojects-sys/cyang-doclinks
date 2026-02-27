type AllowedSpec = {
  ext: string;
  mimes: string[];
  canonical: string;
  family:
    | "document"
    | "spreadsheet"
    | "presentation"
    | "image"
    | "archive"
    | "audio_video";
};

const ALLOWED: AllowedSpec[] = [
  { ext: "pdf", mimes: ["application/pdf", "application/x-pdf"], canonical: "application/pdf", family: "document" },
  { ext: "doc", mimes: ["application/msword"], canonical: "application/msword", family: "document" },
  {
    ext: "docx",
    mimes: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    canonical: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    family: "document",
  },
  { ext: "txt", mimes: ["text/plain"], canonical: "text/plain", family: "document" },
  { ext: "rtf", mimes: ["application/rtf", "text/rtf"], canonical: "application/rtf", family: "document" },
  { ext: "odt", mimes: ["application/vnd.oasis.opendocument.text"], canonical: "application/vnd.oasis.opendocument.text", family: "document" },
  { ext: "xls", mimes: ["application/vnd.ms-excel"], canonical: "application/vnd.ms-excel", family: "spreadsheet" },
  {
    ext: "xlsx",
    mimes: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    canonical: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    family: "spreadsheet",
  },
  { ext: "csv", mimes: ["text/csv", "application/csv"], canonical: "text/csv", family: "spreadsheet" },
  { ext: "ppt", mimes: ["application/vnd.ms-powerpoint"], canonical: "application/vnd.ms-powerpoint", family: "presentation" },
  {
    ext: "pptx",
    mimes: ["application/vnd.openxmlformats-officedocument.presentationml.presentation"],
    canonical: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    family: "presentation",
  },
  { ext: "jpg", mimes: ["image/jpeg"], canonical: "image/jpeg", family: "image" },
  { ext: "jpeg", mimes: ["image/jpeg"], canonical: "image/jpeg", family: "image" },
  { ext: "png", mimes: ["image/png"], canonical: "image/png", family: "image" },
  { ext: "gif", mimes: ["image/gif"], canonical: "image/gif", family: "image" },
  { ext: "bmp", mimes: ["image/bmp"], canonical: "image/bmp", family: "image" },
  { ext: "svg", mimes: ["image/svg+xml"], canonical: "image/svg+xml", family: "image" },
  { ext: "heic", mimes: ["image/heic", "image/heif"], canonical: "image/heic", family: "image" },
  { ext: "zip", mimes: ["application/zip", "application/x-zip-compressed"], canonical: "application/zip", family: "archive" },
  { ext: "rar", mimes: ["application/vnd.rar", "application/x-rar-compressed"], canonical: "application/vnd.rar", family: "archive" },
  { ext: "mp3", mimes: ["audio/mpeg"], canonical: "audio/mpeg", family: "audio_video" },
  { ext: "wav", mimes: ["audio/wav", "audio/x-wav"], canonical: "audio/wav", family: "audio_video" },
  { ext: "mp4", mimes: ["video/mp4"], canonical: "video/mp4", family: "audio_video" },
  { ext: "mov", mimes: ["video/quicktime"], canonical: "video/quicktime", family: "audio_video" },
  { ext: "avi", mimes: ["video/x-msvideo"], canonical: "video/x-msvideo", family: "audio_video" },
];

const BY_EXT = new Map(ALLOWED.map((s) => [s.ext, s]));

const BLOCKED_EXT = new Set([
  "js",
  "mjs",
  "cjs",
  "vbs",
  "vbe",
  "ps1",
  "psm1",
  "py",
  "php",
  "exe",
  "msi",
  "com",
  "scr",
  "dll",
  "sys",
  "lnk",
  "pif",
  "bat",
  "cmd",
  "wsf",
  "jar",
  "apk",
  "app",
  "deb",
  "rpm",
  "bin",
  "sh",
  "docm",
  "xlsm",
  "pptm",
]);

const BLOCKED_MIME_PREFIXES = ["application/x-msdownload", "application/x-executable"];
const BLOCKED_MIME_EXACT = new Set([
  "application/x-dosexec",
  "application/x-elf",
  "application/x-mach-binary",
  "application/java-archive",
  "application/x-sh",
]);

export const ALLOWED_UPLOAD_EXTENSIONS = ALLOWED.map((s) => s.ext);

function extOf(filename: string): string {
  const n = String(filename || "").trim().toLowerCase();
  const idx = n.lastIndexOf(".");
  return idx >= 0 ? n.slice(idx + 1) : "";
}

function normalizeMime(mime: string | null | undefined): string {
  return String(mime || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
}

function isLikelyExecutableSignature(bytes: Buffer): boolean {
  if (bytes.length >= 2 && bytes[0] === 0x4d && bytes[1] === 0x5a) return true; // MZ
  if (bytes.length >= 4 && bytes[0] === 0x7f && bytes[1] === 0x45 && bytes[2] === 0x4c && bytes[3] === 0x46) return true; // ELF
  if (bytes.length >= 4) {
    const sig = bytes.readUInt32BE(0);
    if (sig === 0xfeedface || sig === 0xfeedfacf || sig === 0xcefaedfe || sig === 0xcffaedfe) return true; // Mach-O
  }
  return false;
}

function startsWithAscii(bytes: Buffer, text: string): boolean {
  return bytes.subarray(0, text.length).toString("ascii") === text;
}

function detectMimeFromBytes(bytes: Buffer, filename: string): string | null {
  if (!bytes.length) return null;
  if (startsWithAscii(bytes, "%PDF-")) return "application/pdf";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (startsWithAscii(bytes, "GIF87a") || startsWithAscii(bytes, "GIF89a")) return "image/gif";
  if (startsWithAscii(bytes, "BM")) return "image/bmp";
  if (bytes.length >= 4 && startsWithAscii(bytes, "RIFF") && bytes.subarray(8, 12).toString("ascii") === "WAVE") return "audio/wav";
  if (bytes.length >= 12 && bytes.subarray(4, 8).toString("ascii") === "ftyp") {
    const brand = bytes.subarray(8, 12).toString("ascii").toLowerCase();
    if (brand.includes("heic") || brand.includes("heix") || brand.includes("heif") || brand.includes("mif1")) return "image/heic";
    if (brand.includes("qt")) return "video/quicktime";
    return "video/mp4";
  }
  if (bytes.length >= 4 && startsWithAscii(bytes, "PK\u0003\u0004")) return "application/zip";
  if (bytes.length >= 7 && startsWithAscii(bytes, "Rar!\u001a\u0007")) return "application/vnd.rar";
  if (startsWithAscii(bytes, "ID3") || (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) return "audio/mpeg";
  if (bytes.length >= 12 && startsWithAscii(bytes, "RIFF") && bytes.subarray(8, 12).toString("ascii") === "AVI ") return "video/x-msvideo";
  if (bytes.length >= 8 && bytes.subarray(0, 8).toString("hex").toLowerCase() === "d0cf11e0a1b11ae1") {
    // Legacy Office container (doc/xls/ppt share same signature).
    const ext = extOf(filename);
    const spec = BY_EXT.get(ext);
    return spec ? spec.canonical : "application/x-ole-storage";
  }
  const headText = bytes.subarray(0, Math.min(bytes.length, 4096)).toString("utf8").trimStart();
  if (headText.startsWith("<svg") || headText.startsWith("<?xml") && headText.toLowerCase().includes("<svg")) return "image/svg+xml";
  if (/^[\t\r\n\x20-\x7e]+$/.test(headText)) {
    const ext = extOf(filename);
    if (ext === "csv") return "text/csv";
    if (ext === "rtf" && headText.startsWith("{\\rtf")) return "application/rtf";
    return "text/plain";
  }
  return null;
}

export type UploadTypeValidationResult =
  | { ok: true; ext: string; canonicalMime: string; family: AllowedSpec["family"] }
  | { ok: false; error: "BAD_FILENAME" | "DISALLOWED_TYPE" | "EXECUTABLE_BLOCKED" | "MIME_MISMATCH"; message: string };

export function validateUploadType(args: {
  filename: string;
  declaredMime: string | null | undefined;
  bytes?: Buffer | null;
}): UploadTypeValidationResult {
  const filename = String(args.filename || "").trim();
  if (!filename || filename.length > 240 || /[\\/:*?"<>|]/.test(filename) || filename.includes("..")) {
    return { ok: false, error: "BAD_FILENAME", message: "Invalid filename." };
  }

  const ext = extOf(filename);
  if (!ext || BLOCKED_EXT.has(ext)) {
    return { ok: false, error: "EXECUTABLE_BLOCKED", message: "Executable file types are blocked." };
  }

  const spec = BY_EXT.get(ext);
  if (!spec) {
    return { ok: false, error: "DISALLOWED_TYPE", message: "File type is not allowed." };
  }

  const declared = normalizeMime(args.declaredMime);
  if (declared) {
    if (BLOCKED_MIME_EXACT.has(declared) || BLOCKED_MIME_PREFIXES.some((p) => declared.startsWith(p))) {
      return { ok: false, error: "EXECUTABLE_BLOCKED", message: "Executable MIME type is blocked." };
    }
    if (!spec.mimes.includes(declared)) {
      return { ok: false, error: "MIME_MISMATCH", message: "Declared MIME type does not match file extension." };
    }
  }

  if (args.bytes && args.bytes.length > 0) {
    if (isLikelyExecutableSignature(args.bytes)) {
      return { ok: false, error: "EXECUTABLE_BLOCKED", message: "Executable file signature detected." };
    }
    const detected = normalizeMime(detectMimeFromBytes(args.bytes, filename));
    if (detected) {
      const detectedAllowed = spec.mimes.includes(detected) || (detected === "application/zip" && ["docx", "xlsx", "pptx", "odt", "zip"].includes(ext));
      if (!detectedAllowed) {
        return { ok: false, error: "MIME_MISMATCH", message: "Detected MIME type does not match allowed type." };
      }
    } else if (declared) {
      // If no deterministic signature is available, keep the declared MIME gate.
      const declaredAllowed = spec.mimes.includes(declared);
      if (!declaredAllowed) {
        return { ok: false, error: "MIME_MISMATCH", message: "Unable to validate file MIME type." };
      }
    }
  }

  return { ok: true, ext, canonicalMime: spec.canonical, family: spec.family };
}
