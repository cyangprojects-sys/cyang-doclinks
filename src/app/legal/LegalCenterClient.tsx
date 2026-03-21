"use client";

import { useState } from "react";
import Link from "next/link";
import { MaturityBadge, PremiumCard } from "@/app/components/PublicPrimitives";

type LegalDocCategory = "platform_terms" | "privacy_data" | "security_reliability";

type LegalDocMeta = {
  slug: string;
  title: string;
  summary: string;
  category: LegalDocCategory;
  badges: string[];
  effectiveDate: string;
  lastUpdated: string;
  appliesTo: string;
  atGlance: string;
  startHereLabel: string;
};

const LEGAL_CATEGORY_META: Record<LegalDocCategory, { label: string; description: string }> = {
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

function formatDate(isoDate: string): string {
  const parsed = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return parsed.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default function LegalCenterClient({ docs }: { docs: LegalDocMeta[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<LegalDocCategory | "all">("all");

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = docs.filter((doc) => {
    if (category !== "all" && doc.category !== category) return false;
    if (!normalizedQuery) return true;
    const haystack = [
      doc.title,
      doc.summary,
      doc.atGlance,
      doc.badges.join(" "),
      doc.startHereLabel,
      doc.appliesTo,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(normalizedQuery);
  });

  const groups = {
    platform_terms: filtered.filter((doc) => doc.category === "platform_terms"),
    privacy_data: filtered.filter((doc) => doc.category === "privacy_data"),
    security_reliability: filtered.filter((doc) => doc.category === "security_reliability"),
  } satisfies Record<LegalDocCategory, LegalDocMeta[]>;

  return (
    <div className="space-y-8">
      <PremiumCard strong>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <label htmlFor="legal-search" className="text-[11px] uppercase tracking-[0.22em] text-[var(--text-faint)]">
              Search legal docs
            </label>
            <input
              id="legal-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search terms, privacy, DPA, SLA, security..."
              className="field-input mt-3 w-full px-4 py-3 text-sm"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {[
              { id: "all", label: "All" },
              { id: "platform_terms", label: LEGAL_CATEGORY_META.platform_terms.label },
              { id: "privacy_data", label: LEGAL_CATEGORY_META.privacy_data.label },
              { id: "security_reliability", label: LEGAL_CATEGORY_META.security_reliability.label },
            ].map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setCategory(option.id as LegalDocCategory | "all")}
                className={[
                  "selection-pill px-3 py-2 text-xs",
                  category === option.id
                    ? "selection-pill-active"
                    : "",
                ].join(" ")}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 text-xs text-[var(--text-faint)]">
          Showing {filtered.length} document{filtered.length === 1 ? "" : "s"}.
        </div>
      </PremiumCard>

      {(Object.keys(groups) as LegalDocCategory[]).map((groupKey) => {
        const docsInGroup = groups[groupKey];
        if (!docsInGroup.length) return null;

        return (
          <section key={groupKey}>
            <div className="max-w-3xl">
              <h2 className="text-2xl font-semibold tracking-[-0.03em] text-slate-950">{LEGAL_CATEGORY_META[groupKey].label}</h2>
              <p className="mt-2 text-sm leading-7 text-[var(--text-secondary)]">{LEGAL_CATEGORY_META[groupKey].description}</p>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {docsInGroup.map((doc) => (
                <PremiumCard key={doc.slug} className="h-full">
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-faint)]">{doc.startHereLabel}</div>
                    <MaturityBadge tone="neutral">{LEGAL_CATEGORY_META[groupKey].label}</MaturityBadge>
                  </div>
                  <h3 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">{doc.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-[var(--text-secondary)]">{doc.summary}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {doc.badges.map((badge) => (
                      <span key={badge} className="ui-badge px-2.5 py-1 text-[11px]">
                        {badge}
                      </span>
                    ))}
                  </div>
                  <dl className="mt-5 grid gap-3 text-xs text-[var(--text-faint)] sm:grid-cols-2">
                    <div>
                      <dt className="uppercase tracking-[0.16em]">Effective</dt>
                      <dd className="mt-1 text-[var(--text-secondary)]">{formatDate(doc.effectiveDate)}</dd>
                    </div>
                    <div>
                      <dt className="uppercase tracking-[0.16em]">Updated</dt>
                      <dd className="mt-1 text-[var(--text-secondary)]">{formatDate(doc.lastUpdated)}</dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="uppercase tracking-[0.16em]">Applies to</dt>
                      <dd className="mt-1 text-[var(--text-secondary)]">{doc.appliesTo}</dd>
                    </div>
                  </dl>
                  <div className="mt-6">
                    <Link href={`/legal/${doc.slug}`} className="btn-base btn-secondary inline-flex px-4 py-2.5 text-sm">
                      Read document
                    </Link>
                  </div>
                </PremiumCard>
              ))}
            </div>
          </section>
        );
      })}

      {!filtered.length ? (
        <PremiumCard>
          <p className="text-sm leading-7 text-[var(--text-secondary)]">No documents matched your current search or category filter.</p>
        </PremiumCard>
      ) : null}
    </div>
  );
}
