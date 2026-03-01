export type FileFamily = "pdf" | "image" | "video" | "audio" | "office" | "archive" | "file";

type DetectArgs = {
  contentType?: string | null;
  filename?: string | null;
};

const OFFICE_EXTENSIONS = new Set([
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "odt",
  "ods",
  "odp",
]);

const ARCHIVE_EXTENSIONS = new Set(["zip", "rar"]);

const MICROSOFT_OFFICE_EXTENSIONS = new Set(["doc", "docx", "xls", "xlsx", "ppt", "pptx"]);
const MICROSOFT_OFFICE_MIME_TYPES = new Set([
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

function extensionOf(filename?: string | null): string {
  const name = String(filename || "").trim().toLowerCase();
  if (!name) return "";
  const idx = name.lastIndexOf(".");
  if (idx < 0 || idx === name.length - 1) return "";
  return name.slice(idx + 1);
}

export function detectFileFamily(args: DetectArgs): FileFamily {
  const m = String(args.contentType || "").trim().toLowerCase();
  const ext = extensionOf(args.filename);

  if (m === "application/pdf" || ext === "pdf") return "pdf";
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  if (
    m === "application/zip" ||
    m === "application/x-zip-compressed" ||
    m === "application/vnd.rar" ||
    m === "application/x-rar-compressed" ||
    ARCHIVE_EXTENSIONS.has(ext)
  ) {
    return "archive";
  }

  if (
    m === "application/msword" ||
    m === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    m === "application/vnd.ms-excel" ||
    m === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    m === "application/vnd.ms-powerpoint" ||
    m === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    m === "application/vnd.oasis.opendocument.text" ||
    m === "application/vnd.oasis.opendocument.spreadsheet" ||
    m === "application/vnd.oasis.opendocument.presentation" ||
    OFFICE_EXTENSIONS.has(ext)
  ) {
    return "office";
  }

  return "file";
}

export function isMicrosoftOfficeDocument(args: DetectArgs): boolean {
  const m = String(args.contentType || "").trim().toLowerCase();
  const ext = extensionOf(args.filename);
  return MICROSOFT_OFFICE_MIME_TYPES.has(m) || MICROSOFT_OFFICE_EXTENSIONS.has(ext);
}

export function fileFamilyLabel(family: FileFamily): string {
  switch (family) {
    case "pdf":
      return "PDF";
    case "image":
      return "IMAGE";
    case "video":
      return "VIDEO";
    case "audio":
      return "AUDIO";
    case "office":
      return "OFFICE";
    case "archive":
      return "ARCHIVE";
    default:
      return "FILE";
  }
}
