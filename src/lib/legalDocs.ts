import path from "node:path";
import { readFile } from "node:fs/promises";

export type LegalDocCategory = "platform_terms" | "privacy_data" | "security_reliability";

export type LegalHeading = {
  id: string;
  text: string;
  level: 2 | 3;
};

export type LegalDocMeta = {
  slug: string;
  title: string;
  file: string;
  summary: string;
  category: LegalDocCategory;
  badges: string[];
  effectiveDate: string;
  lastUpdated: string;
  appliesTo: string;
  atGlance: string;
  related: string[];
  primaryContact: string;
  startHereLabel: string;
};

export const LEGAL_CATEGORY_META: Record<
  LegalDocCategory,
  { label: string; description: string }
> = {
  platform_terms: {
    label: "Platform Terms",
    description: "Core service terms, acceptable behavior, and content process policies.",
  },
  privacy_data: {
    label: "Privacy and Data",
    description: "How data is handled, processed, retained, and disclosed to subprocessors.",
  },
  security_reliability: {
    label: "Security and Reliability",
    description: "Security controls, service commitments, and operational trust posture.",
  },
};

export const LEGAL_DOCS: LegalDocMeta[] = [
  {
    slug: "terms-of-service",
    title: "Terms of Service",
    file: "TERMS_OF_SERVICE.md",
    summary: "Service agreement covering access, accounts, billing, responsibilities, and legal terms.",
    category: "platform_terms",
    badges: ["Core", "Business-ready"],
    effectiveDate: "2026-03-01",
    lastUpdated: "2026-03-16",
    appliesTo: "All cyang.io and Doclinks users",
    atGlance:
      "Defines how the service can be used, account obligations, billing terms, ownership boundaries, and legal remedies.",
    related: ["acceptable-use-policy", "privacy-policy", "service-level-agreement"],
    primaryContact: "legal@cyang.io",
    startHereLabel: "Start here",
  },
  {
    slug: "acceptable-use-policy",
    title: "Acceptable Use Policy",
    file: "ACCEPTABLE_USE_POLICY.md",
    summary: "Rules that prohibit abuse, fraud, malware delivery, and harmful platform behavior.",
    category: "platform_terms",
    badges: ["Core", "Safety"],
    effectiveDate: "2026-03-01",
    lastUpdated: "2026-03-16",
    appliesTo: "All users and shared-link recipients",
    atGlance:
      "Explains prohibited behavior, abuse categories, enforcement actions, and escalation paths.",
    related: ["terms-of-service", "dmca-policy", "security-policy"],
    primaryContact: "abuse@cyang.io",
    startHereLabel: "Core safety",
  },
  {
    slug: "dmca-policy",
    title: "DMCA Policy",
    file: "DMCA_POLICY.md",
    summary: "Copyright notice, takedown, and counter-notice process for hosted content.",
    category: "platform_terms",
    badges: ["Core", "IP"],
    effectiveDate: "2026-03-01",
    lastUpdated: "2026-03-16",
    appliesTo: "Copyright claimants and affected users",
    atGlance:
      "Documents how to submit notices, what a valid notice requires, and how counter-notice review is handled.",
    related: ["terms-of-service", "acceptable-use-policy"],
    primaryContact: "dmca@cyang.io",
    startHereLabel: "IP process",
  },
  {
    slug: "privacy-policy",
    title: "Privacy Policy",
    file: "PRIVACY_POLICY.md",
    summary: "What data is collected, why it is used, how it is protected, and user rights.",
    category: "privacy_data",
    badges: ["Privacy", "Core"],
    effectiveDate: "2026-03-01",
    lastUpdated: "2026-03-16",
    appliesTo: "Visitors, account users, and workspace members",
    atGlance:
      "Covers data collection, purposes, lawful handling, retention, rights, and cross-border processing safeguards.",
    related: ["data-processing-addendum", "subprocessors", "security-policy"],
    primaryContact: "privacy@cyang.io",
    startHereLabel: "Privacy first",
  },
  {
    slug: "data-processing-addendum",
    title: "Data Processing Addendum",
    file: "DATA_PROCESSING_ADDENDUM.md",
    summary: "Enterprise data-processing terms for controller/processor responsibilities.",
    category: "privacy_data",
    badges: ["Enterprise", "Privacy"],
    effectiveDate: "2026-03-01",
    lastUpdated: "2026-03-16",
    appliesTo: "Business customers requiring processor terms",
    atGlance:
      "Defines processing scope, security measures, subprocessors, transfer terms, and customer rights support obligations.",
    related: ["privacy-policy", "subprocessors", "security-policy"],
    primaryContact: "privacy@cyang.io",
    startHereLabel: "Procurement",
  },
  {
    slug: "subprocessors",
    title: "Subprocessors",
    file: "SUBPROCESSORS.md",
    summary: "Current third-party processors with purpose and data handling role transparency.",
    category: "privacy_data",
    badges: ["Transparency", "Enterprise"],
    effectiveDate: "2026-03-01",
    lastUpdated: "2026-03-16",
    appliesTo: "Business and compliance evaluators",
    atGlance:
      "Lists subprocessors, purpose, data category, and governance expectations for vendor controls.",
    related: ["privacy-policy", "data-processing-addendum", "security-policy"],
    primaryContact: "privacy@cyang.io",
    startHereLabel: "Vendor transparency",
  },
  {
    slug: "security-policy",
    title: "Security Policy",
    file: "SECURITY_POLICY.md",
    summary: "Customer-facing security controls, incident handling, and disclosure expectations.",
    category: "security_reliability",
    badges: ["Security", "Core"],
    effectiveDate: "2026-03-01",
    lastUpdated: "2026-03-16",
    appliesTo: "All users and security evaluators",
    atGlance:
      "Summarizes control layers including encryption, access control, monitoring, vulnerability handling, and incident response.",
    related: ["service-level-agreement", "privacy-policy", "subprocessors"],
    primaryContact: "security@cyang.io",
    startHereLabel: "Security overview",
  },
  {
    slug: "service-level-agreement",
    title: "Service Level Agreement",
    file: "SERVICE_LEVEL_AGREEMENT.md",
    summary: "Paid-plan uptime commitments, exclusions, and service credit process.",
    category: "security_reliability",
    badges: ["Operational", "Enterprise"],
    effectiveDate: "2026-03-01",
    lastUpdated: "2026-03-16",
    appliesTo: "Paid Doclinks plans",
    atGlance:
      "Defines uptime calculation, downtime exclusions, credit schedules, and claim process for qualifying incidents.",
    related: ["terms-of-service", "security-policy"],
    primaryContact: "legal@cyang.io",
    startHereLabel: "Reliability",
  },
];

const LEGAL_DOC_FILE_SET = new Set(LEGAL_DOCS.map((doc) => doc.file));
const LEGAL_SLUG_RE = /^[a-z0-9][a-z0-9-]{1,63}$/;
const LEGAL_FILE_RE = /^[A-Z0-9_]{1,80}\.md$/;

function docsDir() {
  return path.join(process.cwd(), "docs");
}

export function slugifyHeading(text: string): string {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

export function extractLegalHeadings(markdown: string): LegalHeading[] {
  const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
  const headings: LegalHeading[] = [];
  const seen = new Map<string, number>();

  for (const raw of lines) {
    const line = raw.trim();
    const match = line.match(/^(##|###)\s+(.+)$/);
    if (!match) continue;

    const level = match[1] === "##" ? 2 : 3;
    const text = match[2].trim();
    const base = slugifyHeading(text);
    if (!base) continue;

    const count = seen.get(base) || 0;
    seen.set(base, count + 1);
    const id = count === 0 ? base : `${base}-${count + 1}`;

    headings.push({ id, text, level: level as 2 | 3 });
  }

  return headings;
}

export function getLegalDocBySlug(slug: string) {
  const s = String(slug || "").trim().toLowerCase().slice(0, 64);
  if (!LEGAL_SLUG_RE.test(s)) return null;
  return LEGAL_DOCS.find((doc) => doc.slug === s) || null;
}

export function getRelatedLegalDocs(slug: string): LegalDocMeta[] {
  const doc = getLegalDocBySlug(slug);
  if (!doc) return [];
  return doc.related
    .map((relatedSlug) => getLegalDocBySlug(relatedSlug))
    .filter((value): value is LegalDocMeta => Boolean(value));
}

export async function readLegalDocMarkdown(file: string) {
  const name = String(file || "").trim().slice(0, 128);
  const base = docsDir();
  const resolved = path.resolve(base, name);
  const baseWithSep = base.endsWith(path.sep) ? base : `${base}${path.sep}`;

  if (
    !name ||
    !LEGAL_FILE_RE.test(name) ||
    !LEGAL_DOC_FILE_SET.has(name) ||
    path.basename(name) !== name ||
    !resolved.startsWith(baseWithSep)
  ) {
    throw new Error("INVALID_LEGAL_DOC_FILE");
  }

  return await readFile(resolved, "utf8");
}
