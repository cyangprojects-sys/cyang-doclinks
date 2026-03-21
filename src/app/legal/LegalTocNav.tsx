"use client";

import { useEffect, useMemo, useState } from "react";

type LegalHeading = {
  id: string;
  text: string;
  level: 2 | 3;
};

type Props = {
  headings: LegalHeading[];
};

export default function LegalTocNav({ headings }: Props) {
  const [activeId, setActiveId] = useState<string>(headings[0]?.id || "");

  const ids = useMemo(() => headings.map((heading) => heading.id), [headings]);

  useEffect(() => {
    if (!ids.length) return;

    const updateFromHash = () => {
      const hash = window.location.hash.replace(/^#/, "");
      if (hash && ids.includes(hash)) {
        setActiveId(hash);
      }
    };

    updateFromHash();
    window.addEventListener("hashchange", updateFromHash);

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (!visible.length) return;
        const next = visible[0].target.id;
        if (next) setActiveId(next);
      },
      {
        rootMargin: "-28% 0px -58% 0px",
        threshold: [0.1, 0.5, 1],
      }
    );

    for (const id of ids) {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    }

    return () => {
      window.removeEventListener("hashchange", updateFromHash);
      observer.disconnect();
    };
  }, [ids]);

  if (!headings.length) return null;

  const onJump = (event: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    event.preventDefault();
    const target = document.getElementById(id);
    if (!target) return;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "start" });
    window.history.replaceState(null, "", `#${id}`);
    setActiveId(id);
  };

  return (
    <>
      <details className="surface-panel rounded-sm p-4 lg:hidden" open>
        <summary className="cursor-pointer list-none text-sm font-medium text-slate-950">On this page</summary>
        <nav className="mt-3 space-y-1" aria-label="Legal document table of contents">
          {headings.map((heading) => {
            const isActive = activeId === heading.id;
            return (
              <a
                key={heading.id}
                href={`#${heading.id}`}
                onClick={(event) => onJump(event, heading.id)}
                className={[
                  "block rounded-sm px-2.5 py-1.5 text-xs transition-colors",
                  heading.level === 3 ? "ml-3" : "",
                  isActive
                    ? "bg-[var(--surface-selected)] text-[var(--accent-primary)]"
                    : "text-[var(--text-secondary)] hover:bg-[var(--surface-soft)] hover:text-[var(--text-primary)]",
                ].join(" ")}
              >
                {heading.text}
              </a>
            );
          })}
        </nav>
      </details>

      <aside className="surface-panel sticky top-24 hidden rounded-sm p-4 lg:block">
        <div className="text-xs uppercase tracking-[0.14em] text-[var(--text-faint)]">On this page</div>
        <nav className="mt-3 space-y-1" aria-label="Legal document table of contents">
          {headings.map((heading) => {
            const isActive = activeId === heading.id;
            return (
              <a
                key={heading.id}
                href={`#${heading.id}`}
                onClick={(event) => onJump(event, heading.id)}
                className={[
                  "block rounded-sm px-2.5 py-1.5 text-xs transition-colors",
                  heading.level === 3 ? "ml-3" : "",
                  isActive
                    ? "bg-[var(--surface-selected)] text-[var(--accent-primary)]"
                    : "text-[var(--text-secondary)] hover:bg-[var(--surface-soft)] hover:text-[var(--text-primary)]",
                ].join(" ")}
              >
                {heading.text}
              </a>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
