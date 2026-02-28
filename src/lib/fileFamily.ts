export type FileFamily = "pdf" | "image" | "video" | "audio" | "office" | "file";

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
    default:
      return "FILE";
  }
}

