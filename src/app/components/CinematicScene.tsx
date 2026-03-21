import type { ReactNode } from "react";

function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function AmbientScene({
  tone = "cool",
  className,
}: {
  tone?: "cool" | "steel" | "signal";
  className?: string;
}) {
  return (
    <div className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)} aria-hidden="true">
      <div className={cn("ambient-orb ambient-orb-a", tone === "steel" && "ambient-orb-steel", tone === "signal" && "ambient-orb-signal")} />
      <div className={cn("ambient-orb ambient-orb-b", tone === "steel" && "ambient-orb-signal", tone === "signal" && "ambient-orb-steel")} />
      <div className="ambient-beam ambient-beam-a" />
      <div className="ambient-beam ambient-beam-b" />
      <div className="ambient-ring ambient-ring-a" />
      <div className="ambient-ring ambient-ring-b" />
      <div className="ambient-grid-mask" />
    </div>
  );
}

export function SectionTransition({
  label,
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div className={cn("cinematic-bleed relative py-8 sm:py-12", className)} aria-hidden="true">
      <div className="mx-auto flex w-full max-w-[1600px] items-center gap-4 px-4 sm:px-6 lg:px-8">
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-300 to-transparent" />
        {label ? <div className="text-[10px] uppercase tracking-[0.34em] text-[var(--text-faint)]">{label}</div> : null}
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-300 to-transparent" />
      </div>
    </div>
  );
}

export function VisualSignalCluster({
  title,
  items,
  className,
}: {
  title?: string;
  items: Array<{ label: string; value: string }>;
  className?: string;
}) {
  return (
    <div className={cn("signal-cluster surface-panel relative overflow-hidden rounded-sm p-5 sm:p-6", className)}>
      <AmbientScene tone="signal" className="opacity-80" />
      {title ? <div className="relative text-[11px] uppercase tracking-[0.24em] text-[var(--text-faint)]">{title}</div> : null}
      <div className="relative mt-4 space-y-3">
        {items.map((item, index) => (
          <div key={item.label} className="signal-row">
            <div className="signal-index">{String(index + 1).padStart(2, "0")}</div>
            <div className="min-w-0 flex-1">
              <div className="text-xs uppercase tracking-[0.18em] text-[var(--text-faint)]">{item.label}</div>
              <div className="mt-1 text-sm text-[var(--text-secondary)]">{item.value}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function StoryBand({
  eyebrow,
  title,
  body,
  aside,
  children,
  reverse,
}: {
  eyebrow: string;
  title: ReactNode;
  body: string;
  aside?: ReactNode;
  children?: ReactNode;
  reverse?: boolean;
}) {
  return (
    <div className={cn("grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.8fr)] lg:items-end", reverse && "lg:[&>*:first-child]:order-2 lg:[&>*:last-child]:order-1")}>
      <div>
        <div className="text-[11px] uppercase tracking-[0.24em] text-[var(--text-faint)]">{eyebrow}</div>
        <h2 className="mt-4 text-balance text-4xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-5xl lg:text-6xl">
          {title}
        </h2>
        <p className="mt-5 max-w-2xl text-base leading-8 text-[var(--text-secondary)] sm:text-lg">{body}</p>
        {children ? <div className="mt-8">{children}</div> : null}
      </div>
      {aside ? <div>{aside}</div> : null}
    </div>
  );
}
