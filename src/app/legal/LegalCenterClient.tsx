"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

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

type Props = {
  docs: LegalDocMeta[];
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

export default function LegalCenterClient({ docs }: Props) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<LegalDocCategory | "all">("all");
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return docs.filter((doc) => {
      if (category !== "all" && doc.category !== category) return false;
      if (!q) return true;
      const haystack = [doc.title, doc.summary, doc.atGlance, doc.badges.join(" "), doc.startHereLabel].join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [docs, query, category]);

  const grouped = useMemo(() => {
    const bucket: Record<LegalDocCategory, LegalDocMeta[]> = {
      platform_terms: [],
      privacy_data: [],
      security_reliability: [],
    };

    for (const doc of filtered) {
      bucket[doc.category].push(doc);
    }

    return bucket;
  }, [filtered]);

  const onCopyLink = async (slug: string) => {
    const url = `${window.location.origin}/legal/${slug}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedSlug(slug);
      setTimeout(() => setCopiedSlug((prev) => (prev === slug ? null : prev)), 1400);
    } catch {
      setCopiedSlug(null);
    }
  };

  const categoryOptions: Array<{ id: LegalDocCategory | "all"; label: string }> = [
    { id: "all", label: "All" },
    { id: "platform_terms", label: LEGAL_CATEGORY_META.platform_terms.label },
    { id: "privacy_data", label: LEGAL_CATEGORY_META.privacy_data.label },
    { id: "security_reliability", label: LEGAL_CATEGORY_META.security_reliability.label },
  ];

  return (
    <div className="space-y-6">
      <section className="glass-card rounded-3xl p-5 sm:p-6">
        <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <label htmlFor="legal-search" className="text-xs uppercase tracking-[0.14em] text-white/55">
              Search legal docs
            </label>
            <input
              id="legal-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search terms, privacy, security, DPA, SLA..."
              className="mt-2 w-full rounded-xl border border-white/12 bg-black/25 px-3 py-2.5 text-sm text-white placeholder:text-white/35 outline-none transition-colors hover:border-white/25 focus:border-sky-300/60 focus:ring-2 focus:ring-sky-300/20"
            />
          </div>

          <div className="flex flex-wrap gap-2 lg:justify-end">
            {categoryOptions.map((option) => {
              const active = category === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setCategory(option.id)}
                  className={[
                    "rounded-full border px-3 py-1.5 text-xs transition-colors",
                    active
                      ? "border-sky-200/35 bg-sky-300/12 text-sky-100"
                      : "border-white/14 bg-white/6 text-white/72 hover:bg-white/12 hover:text-white",
                  ].join(" ")}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-3 text-xs text-white/58">
          Showing {filtered.length} document{filtered.length === 1 ? "" : "s"}.
        </div>
      </section>

      {(Object.keys(grouped) as LegalDocCategory[]).map((groupKey) => {
        const docsInGroup = grouped[groupKey];
        if (!docsInGroup.length) return null;
        const groupMeta = LEGAL_CATEGORY_META[groupKey];

        return (
          <section key={groupKey} className="space-y-3">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-white">{groupMeta.label}</h2>
              <p className="mt-1 text-sm leading-relaxed text-white/68">{groupMeta.description}</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {docsInGroup.map((doc) => (
                <article key={doc.slug} className="glass-card rounded-3xl p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-[0.12em] text-white/55">{groupMeta.label}</div>
                      <h3 className="mt-2 text-xl font-semibold tracking-tight text-white">{doc.title}</h3>
                    </div>
                    <span className="ui-badge rounded-full px-2.5 py-1 text-[11px]">{doc.startHereLabel}</span>
                  </div>

                  <p className="mt-3 text-sm leading-relaxed text-white/72">{doc.summary}</p>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {doc.badges.map((badge) => (
                      <span key={badge} className="ui-badge rounded-full px-2.5 py-1 text-[11px]">
                        {badge}
                      </span>
                    ))}
                  </div>

                  <dl className="mt-5 grid gap-2 text-xs text-white/60 sm:grid-cols-2">
                    <div>
                      <dt className="uppercase tracking-[0.1em] text-white/50">Effective</dt>
                      <dd className="mt-0.5 text-white/72">{formatDate(doc.effectiveDate)}</dd>
                    </div>
                    <div>
                      <dt className="uppercase tracking-[0.1em] text-white/50">Updated</dt>
                      <dd className="mt-0.5 text-white/72">{formatDate(doc.lastUpdated)}</dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="uppercase tracking-[0.1em] text-white/50">Applies to</dt>
                      <dd className="mt-0.5 text-white/72">{doc.appliesTo}</dd>
                    </div>
                  </dl>

                  <div className="mt-6 flex flex-wrap gap-2">
                    <Link href={`/legal/${doc.slug}`} className="btn-base btn-secondary rounded-xl px-4 py-2.5 text-sm">
                      Read document
                    </Link>
                    <button
                      type="button"
                      onClick={() => void onCopyLink(doc.slug)}
                      className="btn-base btn-secondary rounded-xl px-4 py-2.5 text-sm"
                    >
                      {copiedSlug === doc.slug ? "Link copied" : "Copy link"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        );
      })}

      {!filtered.length ? (
        <section className="glass-card rounded-3xl p-6 text-sm text-white/72">
          No documents matched your current search or filter. Try broader terms or reset filters.
        </section>
      ) : null}
    </div>
  );
}
