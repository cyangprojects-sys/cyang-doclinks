import Link from "next/link";
import type { ReactNode } from "react";

function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function ContentRail({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("mx-auto w-full max-w-[1220px] px-4 sm:px-6 lg:px-8", className)}>{children}</div>;
}

export function Section({
  children,
  id,
  className,
  railClassName,
}: {
  children: ReactNode;
  id?: string;
  className?: string;
  railClassName?: string;
}) {
  return (
    <section id={id} className={cn("relative py-10 sm:py-14 lg:py-18", className)}>
      <ContentRail className={railClassName}>{children}</ContentRail>
    </section>
  );
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "ui-badge inline-flex rounded-full px-3 py-1 text-[11px] font-medium uppercase tracking-[0.22em]",
        className
      )}
    >
      {children}
    </span>
  );
}

export function DisplayTitle({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h1
      className={cn(
        "font-editorial text-balance text-4xl leading-[0.98] tracking-[-0.03em] text-white sm:text-5xl lg:text-7xl",
        className
      )}
    >
      {children}
    </h1>
  );
}

export function Lead({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("max-w-2xl text-base leading-7 text-white/68 sm:text-lg sm:leading-8", className)}>{children}</p>;
}

export function BodyMuted({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("text-sm leading-7 text-white/64", className)}>{children}</p>;
}

export function MetaLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("text-[11px] font-medium uppercase tracking-[0.22em] text-white/60", className)}>{children}</div>
  );
}

export function LastUpdated({ children }: { children: ReactNode }) {
  return <span className="text-xs text-white/58">Last updated {children}</span>;
}

export function ArrowLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2 text-sm text-white/86 transition-colors hover:text-white", className)}>
      <span>{children}</span>
      <span aria-hidden="true">→</span>
    </Link>
  );
}

export function CTAGroup({
  actions,
  className,
}: {
  actions: Array<{ href: string; label: string; tone?: "primary" | "secondary"; external?: boolean }>;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:flex-wrap", className)}>
      {actions.map((action) =>
        action.external ? (
          <a
            key={`${action.href}-${action.label}`}
            href={action.href}
            className={cn(
              "btn-base inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-medium",
              action.tone === "primary" ? "btn-primary" : "btn-secondary"
            )}
          >
            {action.label}
          </a>
        ) : (
          <Link
            key={`${action.href}-${action.label}`}
            href={action.href}
            className={cn(
              "btn-base inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-medium",
              action.tone === "primary" ? "btn-primary" : "btn-secondary"
            )}
          >
            {action.label}
          </Link>
        )
      )}
    </div>
  );
}

export function MaturityBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "live" | "build" | "lab" | "neutral";
}) {
  const toneClass =
    tone === "live"
      ? "border-emerald-200/28 bg-emerald-300/10 text-emerald-100/90"
      : tone === "build"
        ? "border-sky-200/28 bg-sky-300/10 text-sky-100/90"
        : tone === "lab"
          ? "border-amber-200/28 bg-amber-300/10 text-amber-100/90"
          : "border-white/14 bg-white/6 text-white/72";

  return <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium", toneClass)}>{children}</span>;
}

export function StatusPill({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "positive" | "caution" | "neutral";
}) {
  const toneClass =
    tone === "positive"
      ? "bg-emerald-300/85"
      : tone === "caution"
        ? "bg-amber-300/85"
        : "bg-sky-300/85";

  return (
    <span className="inline-flex items-center gap-2 text-xs text-white/72">
      <span className={cn("h-2 w-2 rounded-full", toneClass)} />
      <span>{label}</span>
    </span>
  );
}

export function GlowDivider({ className }: { className?: string }) {
  return <div className={cn("premium-divider", className)} />;
}

export function PremiumCard({
  children,
  className,
  strong,
  as = "div",
}: {
  children: ReactNode;
  className?: string;
  strong?: boolean;
  as?: "div" | "article";
}) {
  const Component = as;
  return (
    <Component className={cn(strong ? "surface-panel-strong" : "surface-panel", "rounded-[2rem] p-6 sm:p-7", className)}>
      {children}
    </Component>
  );
}

export function SignalCard({
  label,
  value,
  detail,
  className,
}: {
  label: string;
  value: string;
  detail?: string;
  className?: string;
}) {
  return (
    <PremiumCard className={cn("h-full", className)}>
      <MetaLabel>{label}</MetaLabel>
      <div className="mt-3 text-xl font-semibold tracking-tight text-white">{value}</div>
      {detail ? <BodyMuted className="mt-2">{detail}</BodyMuted> : null}
    </PremiumCard>
  );
}

export function LinkTile({
  href,
  title,
  body,
  meta,
  badge,
  ctaLabel,
  className,
}: {
  href: string;
  title: string;
  body: string;
  meta?: string;
  badge?: ReactNode;
  ctaLabel?: string;
  className?: string;
}) {
  return (
    <Link href={href} className={cn("group block", className)}>
      <PremiumCard className="h-full transition-colors group-hover:bg-white/7">
        <div className="flex items-start justify-between gap-4">
          <MetaLabel>{meta || "Open"}</MetaLabel>
          {badge}
        </div>
        <h3 className="mt-3 text-xl font-semibold tracking-tight text-white">{title}</h3>
        <BodyMuted className="mt-2">{body}</BodyMuted>
        <div className="mt-6 inline-flex items-center gap-2 text-sm text-white/82 transition-colors group-hover:text-white">
          <span>{ctaLabel || "Open"}</span>
          <span aria-hidden="true">→</span>
        </div>
      </PremiumCard>
    </Link>
  );
}

export function PillarCard({
  title,
  body,
  microcopy,
}: {
  title: string;
  body: string;
  microcopy?: string;
}) {
  return (
    <div className="group h-full rounded-[2rem] border border-white/8 bg-white/[0.025] p-6 transition-colors hover:border-white/18 hover:bg-white/[0.045] focus-within:border-white/18">
      <div className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">{title}</div>
      <BodyMuted className="mt-3 max-w-sm">{body}</BodyMuted>
      {microcopy ? <div className="mt-6 text-xs uppercase tracking-[0.18em] text-white/58">{microcopy}</div> : null}
    </div>
  );
}

export function PrinciplesGrid({
  items,
  columns = "three",
}: {
  items: Array<{ title: string; body: string; microcopy?: string }>;
  columns?: "three" | "four";
}) {
  return (
    <div className={cn("grid gap-4", columns === "four" ? "md:grid-cols-2 xl:grid-cols-4" : "md:grid-cols-3")}>
      {items.map((item) => (
        <PillarCard key={item.title} title={item.title} body={item.body} microcopy={item.microcopy} />
      ))}
    </div>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  body,
  align = "left",
}: {
  eyebrow?: string;
  title: string;
  body?: string;
  align?: "left" | "center";
}) {
  return (
    <div className={cn("max-w-3xl", align === "center" && "mx-auto text-center")}>
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <h2 className="mt-4 text-balance text-3xl font-semibold tracking-[-0.03em] text-white sm:text-4xl lg:text-5xl">{title}</h2>
      {body ? <Lead className="mt-4 max-w-2xl">{body}</Lead> : null}
    </div>
  );
}

export function PageHero({
  eyebrow,
  title,
  body,
  actions,
  aside,
  className,
}: {
  eyebrow: string;
  title: ReactNode;
  body: string;
  actions?: Array<{ href: string; label: string; tone?: "primary" | "secondary"; external?: boolean }>;
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <Section className={cn("pt-8 sm:pt-12", className)}>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.72fr)] lg:items-end">
        <div className="max-w-4xl">
          <Eyebrow>{eyebrow}</Eyebrow>
          <DisplayTitle className="mt-6">{title}</DisplayTitle>
          <Lead className="mt-6">{body}</Lead>
          {actions?.length ? <CTAGroup className="mt-8" actions={actions} /> : null}
        </div>
        {aside ? <div>{aside}</div> : null}
      </div>
    </Section>
  );
}

export function AmbientGradient({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-[2.5rem]",
        className
      )}
    >
      <div className="absolute -left-[8%] top-[6%] h-40 w-40 rounded-full bg-sky-300/15 blur-3xl sm:h-56 sm:w-56" />
      <div className="absolute right-[4%] top-[8%] h-48 w-48 rounded-full bg-teal-300/12 blur-3xl sm:h-64 sm:w-64" />
      <div className="absolute bottom-[10%] left-[28%] h-32 w-44 rounded-full bg-amber-300/8 blur-3xl" />
    </div>
  );
}

export function LayeredBackdrop({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={cn("hero-grid surface-panel-strong relative overflow-hidden rounded-[2.5rem] p-6 sm:p-8", className)}>
      <AmbientGradient />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
      <div className="absolute inset-y-0 left-[42%] hidden w-px bg-white/8 lg:block" />
      <div className="relative h-full">{children}</div>
    </div>
  );
}

export function CinematicHero({
  eyebrow,
  title,
  body,
  actions,
  stats,
  visual,
}: {
  eyebrow: string;
  title: ReactNode;
  body: string;
  actions: Array<{ href: string; label: string; tone?: "primary" | "secondary"; external?: boolean }>;
  stats?: Array<{ label: string; value: string; detail?: string }>;
  visual: ReactNode;
}) {
  return (
    <Section className="pt-8 sm:pt-12">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)] lg:items-end">
        <div className="max-w-4xl">
          <Eyebrow>{eyebrow}</Eyebrow>
          <DisplayTitle className="mt-6">{title}</DisplayTitle>
          <Lead className="mt-6">{body}</Lead>
          <CTAGroup className="mt-8" actions={actions} />
          {stats?.length ? (
            <div className="mt-10 grid gap-3 sm:grid-cols-3">
              {stats.map((stat) => (
                <SignalCard key={stat.label} label={stat.label} value={stat.value} detail={stat.detail} />
              ))}
            </div>
          ) : null}
        </div>

        <div className="relative">
          <LayeredBackdrop className="min-h-[420px] lg:min-h-[520px]">
            {visual}
          </LayeredBackdrop>
        </div>
      </div>
    </Section>
  );
}

export function StoryPanel({
  title,
  body,
  children,
  badge,
  className,
}: {
  title: string;
  body: string;
  children?: ReactNode;
  badge?: ReactNode;
  className?: string;
}) {
  return (
    <PremiumCard strong className={cn("h-full", className)}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-2xl font-semibold tracking-tight text-white">{title}</h3>
          <BodyMuted className="mt-3 max-w-xl">{body}</BodyMuted>
        </div>
        {badge}
      </div>
      {children ? <div className="mt-8">{children}</div> : null}
    </PremiumCard>
  );
}

export function FeatureBand({
  eyebrow,
  title,
  body,
  points,
  visual,
  reverse,
}: {
  eyebrow?: string;
  title: string;
  body: string;
  points: string[];
  visual: ReactNode;
  reverse?: boolean;
}) {
  return (
    <div className={cn("grid gap-4 lg:grid-cols-2 lg:items-stretch", reverse && "lg:[&>*:first-child]:order-2 lg:[&>*:last-child]:order-1")}>
      <PremiumCard strong className="flex flex-col justify-between">
        <div>
          {eyebrow ? <MetaLabel>{eyebrow}</MetaLabel> : null}
          <h3 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-white">{title}</h3>
          <Lead className="mt-4 max-w-xl text-base">{body}</Lead>
        </div>
        <ul className="mt-8 space-y-3">
          {points.map((point) => (
            <li key={point} className="flex gap-3 text-sm leading-7 text-white/68">
              <span className="mt-3 h-1.5 w-1.5 flex-none rounded-full bg-sky-300/90" />
              <span>{point}</span>
            </li>
          ))}
        </ul>
      </PremiumCard>

      <PremiumCard className="overflow-hidden">
        <div className="h-full min-h-[280px]">{visual}</div>
      </PremiumCard>
    </div>
  );
}

export function TimelineSteps({
  steps,
}: {
  steps: Array<{ id: string; title: string; body: string }>;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-4">
      {steps.map((step) => (
        <PremiumCard key={step.id} className="h-full">
          <div className="inline-flex rounded-full border border-sky-200/25 bg-sky-300/10 px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-sky-100/88">
            {step.id}
          </div>
          <h3 className="mt-5 text-xl font-semibold tracking-tight text-white">{step.title}</h3>
          <BodyMuted className="mt-3">{step.body}</BodyMuted>
        </PremiumCard>
      ))}
    </div>
  );
}

export function VisualProofBand({
  items,
}: {
  items: Array<{ href: string; title: string; body: string; meta?: string; badge?: ReactNode }>;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <LinkTile key={item.href} href={item.href} title={item.title} body={item.body} meta={item.meta} badge={item.badge} />
      ))}
    </div>
  );
}

export function TrustLinkGrid({
  items,
}: {
  items: Array<{ href: string; title: string; body: string; meta?: string; badge?: ReactNode }>;
}) {
  return <VisualProofBand items={items} />;
}

export function DocumentIndexList({
  items,
}: {
  items: Array<{ href: string; title: string; body: string; meta?: ReactNode }>;
}) {
  return (
    <div className="overflow-hidden rounded-[2rem] border border-white/8">
      {items.map((item, index) => (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            "flex flex-col gap-4 bg-white/[0.02] px-5 py-5 transition-colors hover:bg-white/[0.05] sm:flex-row sm:items-start sm:justify-between sm:px-6",
            index !== 0 && "border-t border-white/8"
          )}
        >
          <div className="max-w-2xl">
            <div className="text-lg font-semibold tracking-tight text-white">{item.title}</div>
            <BodyMuted className="mt-2">{item.body}</BodyMuted>
          </div>
          <div className="flex items-center gap-3 text-sm text-white/72">
            {item.meta}
            <span aria-hidden="true">→</span>
          </div>
        </Link>
      ))}
    </div>
  );
}

export function Breadcrumbs({
  items,
}: {
  items: Array<{ label: string; href?: string }>;
}) {
  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.16em] text-white/58">
      {items.map((item, index) => (
        <span key={`${item.label}-${index}`} className="inline-flex items-center gap-2">
          {item.href ? <Link href={item.href} className="transition-colors hover:text-white/72">{item.label}</Link> : <span className="text-white/58">{item.label}</span>}
          {index < items.length - 1 ? <span aria-hidden="true">/</span> : null}
        </span>
      ))}
    </nav>
  );
}

export function PolicyMeta({
  items,
}: {
  items: Array<{ label: string; value: ReactNode }>;
}) {
  return (
    <dl className="grid gap-4 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label}>
          <dt className="text-[11px] uppercase tracking-[0.22em] text-white/58">{item.label}</dt>
          <dd className="mt-2 text-sm text-white/78">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function StickySubnav({
  items,
}: {
  items: Array<{ href: string; label: string }>;
}) {
  return (
    <div className="sticky top-22 z-20 hidden lg:block">
      <div className="surface-panel rounded-[1.75rem] p-4">
        <MetaLabel>On this page</MetaLabel>
        <div className="mt-4 grid gap-2">
          {items.map((item) => (
            <a key={item.href} href={item.href} className="rounded-xl px-3 py-2 text-sm text-white/68 transition-colors hover:bg-white/6 hover:text-white">
              {item.label}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

export function DocumentVisual({
  rows,
  footer,
}: {
  rows: Array<{ label: string; value: string; tone?: "accent" | "neutral" | "warm" }>;
  footer?: ReactNode;
}) {
  return (
    <div className="relative h-full overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#090d13] p-5">
      <AmbientGradient className="rounded-[1.75rem]" />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
      <div className="relative">
        <div className="flex items-center justify-between">
          <MetaLabel>Secure delivery state</MetaLabel>
          <StatusPill label="Serve-time enforced" tone="positive" />
        </div>
        <div className="mt-5 space-y-3">
          {rows.map((row) => (
            <div key={row.label} className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs uppercase tracking-[0.18em] text-white/60">{row.label}</span>
                <span
                  className={cn(
                    "inline-flex rounded-full px-2.5 py-1 text-[11px]",
                    row.tone === "accent"
                      ? "bg-sky-300/12 text-sky-100/90"
                      : row.tone === "warm"
                        ? "bg-amber-300/12 text-amber-100/90"
                        : "bg-white/8 text-white/72"
                  )}
                >
                  {row.value}
                </span>
              </div>
            </div>
          ))}
        </div>
        {footer ? <div className="mt-4 rounded-2xl border border-white/8 bg-black/30 p-4 text-xs text-white/72">{footer}</div> : null}
      </div>
    </div>
  );
}
