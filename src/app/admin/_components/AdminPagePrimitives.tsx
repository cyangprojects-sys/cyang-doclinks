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
    <section className="glass-card-strong ui-sheen rounded-[32px] p-6 sm:p-7">
      <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-3xl">
          <div className="text-xs uppercase tracking-[0.18em] text-cyan-200/72">{eyebrow}</div>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">{title}</h2>
          <p className="mt-3 text-sm leading-6 text-white/68 sm:text-base">{description}</p>
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
            "glass-card-strong rounded-[26px] p-5",
            item.tone === "warning"
              ? "border-amber-300/20"
              : item.tone === "danger"
                ? "border-rose-300/20"
                : "",
          ].join(" ")}
        >
          <div className="text-xs uppercase tracking-[0.18em] text-white/45">{item.label}</div>
          <div className="mt-3 text-3xl font-semibold text-white">{item.value}</div>
          <div className="mt-1 text-sm text-white/60">{item.hint}</div>
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
    <div className="glass-card-strong sticky top-[98px] z-20 rounded-[24px] p-2">
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => {
          const active = tab.key === current;
          return (
            <Link
              key={tab.key}
              href={tab.href}
              className={[
                "rounded-2xl border px-4 py-2.5 text-sm transition",
                active
                  ? "border-cyan-300/28 bg-cyan-400/12 text-white"
                  : "border-transparent bg-transparent text-white/64 hover:border-white/10 hover:bg-white/[0.04] hover:text-white",
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
    <section className="glass-card-strong rounded-[28px] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          {description ? <p className="mt-1 text-sm text-white/62">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}
