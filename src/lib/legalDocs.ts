import path from "node:path";
import { readFile } from "node:fs/promises";

export type LegalDocMeta = {
  slug: string;
  title: string;
  file: string;
  summary: string;
};

export const LEGAL_DOCS: LegalDocMeta[] = [
  {
    slug: "terms-of-service",
    title: "Terms of Service",
    file: "TERMS_OF_SERVICE.md",
    summary: "Core service terms and use agreement.",
  },
  {
    slug: "privacy-policy",
    title: "Privacy Policy",
    file: "PRIVACY_POLICY.md",
    summary: "How account, usage, and document data are handled.",
  },
  {
    slug: "acceptable-use-policy",
    title: "Acceptable Use Policy",
    file: "ACCEPTABLE_USE_POLICY.md",
    summary: "Prohibited activity and abuse restrictions.",
  },
  {
    slug: "dmca-policy",
    title: "DMCA Policy",
    file: "DMCA_POLICY.md",
    summary: "Copyright notice and takedown process.",
  },
  {
    slug: "data-processing-addendum",
    title: "Data Processing Addendum",
    file: "DATA_PROCESSING_ADDENDUM.md",
    summary: "Processor obligations and data protection terms.",
  },
  {
    slug: "service-level-agreement",
    title: "Service Level Agreement",
    file: "SERVICE_LEVEL_AGREEMENT.md",
    summary: "Uptime commitments and service credits.",
  },
  {
    slug: "security-policy",
    title: "Security Policy",
    file: "SECURITY_POLICY.md",
    summary: "Security controls and disclosure expectations.",
  },
  {
    slug: "subprocessors",
    title: "Subprocessors",
    file: "SUBPROCESSORS.md",
    summary: "Current subprocessors and service providers.",
  },
];

const LEGAL_DOC_FILE_SET = new Set(LEGAL_DOCS.map((d) => d.file));
const LEGAL_SLUG_RE = /^[a-z0-9][a-z0-9-]{1,63}$/;
const LEGAL_FILE_RE = /^[A-Z0-9_]{1,80}\.md$/;

function docsDir() {
  return path.join(process.cwd(), "docs");
}

export function getLegalDocBySlug(slug: string) {
  const s = String(slug || "").trim().toLowerCase().slice(0, 64);
  if (!LEGAL_SLUG_RE.test(s)) return null;
  return LEGAL_DOCS.find((d) => d.slug === s) || null;
}

export async function readLegalDocMarkdown(file: string) {
  const name = String(file || "").trim().slice(0, 128);
  const base = docsDir();
  const resolved = path.resolve(base, name);
  const baseWithSep = base.endsWith(path.sep) ? base : `${base}${path.sep}`;

  // Fail closed: legal docs are loaded only from /docs top-level markdown files.
  if (
    !name ||
    !LEGAL_FILE_RE.test(name) ||
    !LEGAL_DOC_FILE_SET.has(name) ||
    path.basename(name) !== name ||
    !resolved.startsWith(baseWithSep)
  ) {
    throw new Error("INVALID_LEGAL_DOC_FILE");
  }

  const fullPath = resolved;
  return await readFile(fullPath, "utf8");
}
