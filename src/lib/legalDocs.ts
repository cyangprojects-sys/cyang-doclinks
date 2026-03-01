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

function docsDir() {
  return path.join(process.cwd(), "docs");
}

export function getLegalDocBySlug(slug: string) {
  return LEGAL_DOCS.find((d) => d.slug === slug) || null;
}

export async function readLegalDocMarkdown(file: string) {
  const fullPath = path.join(docsDir(), file);
  return await readFile(fullPath, "utf8");
}

