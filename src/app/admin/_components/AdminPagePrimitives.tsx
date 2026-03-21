import Link from "next/link";

export function AdminPageIntro({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: React.ReactNode;
}) {
  return (
    <section className="surface-panel-strong p-6 sm:p-7">
      <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-3xl">
          <div className="text-xs uppercase tracking-[0.18em] text-[var(--accent-primary)]">{eyebrow}</div>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">{title}</h2>
          <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)] sm:text-base">{description}</p>
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </section>
  );
}

export function AdminKpiGrid({
  items,
}: {
  items: Array<{ label: string; value: string; hint: string; tone?: "default" | "warning" | "danger" }>;
}) {
  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <div
          key={item.label}
          className={[
            "surface-panel p-5",
            item.tone === "warning"
              ? "border-[rgba(161,109,27,0.18)] bg-[rgba(161,109,27,0.05)]"
              : item.tone === "danger"
                ? "border-[rgba(186,71,50,0.18)] bg-[rgba(186,71,50,0.05)]"
                : "",
          ].join(" ")}
        >
          <div className="text-xs uppercase tracking-[0.18em] text-[var(--text-faint)]">{item.label}</div>
          <div className="mt-3 text-3xl font-semibold text-slate-950">{item.value}</div>
          <div className="mt-1 text-sm text-[var(--text-secondary)]">{item.hint}</div>
        </div>
      ))}
    </section>
  );
}

export function AdminTabs({
  tabs,
  current,
}: {
  tabs: Array<{ key: string; label: string; href: string }>;
  current: string;
}) {
  return (
    <div className="surface-panel-strong sticky top-[98px] z-20 rounded-sm p-2">
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => {
          const active = tab.key === current;
          return (
            <Link
              key={tab.key}
              href={tab.href}
              className={[
                "rounded-sm border px-4 py-2.5 text-sm transition",
                active
                  ? "border-[var(--border-accent)] bg-[var(--surface-selected)] text-[var(--accent-primary)] shadow-[var(--shadow-soft)]"
                  : "border-transparent bg-transparent text-[var(--text-secondary)] hover:border-[var(--border-subtle)] hover:bg-[var(--surface-soft)] hover:text-[var(--text-primary)]",
              ].join(" ")}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function AdminSection({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="surface-panel-strong p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl">
          <h3 className="text-lg font-semibold text-slate-950">{title}</h3>
          {description ? <p className="mt-1 text-sm text-[var(--text-secondary)]">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}
