import type { ReactNode } from "react";
import {
  Breadcrumbs,
  CTAGroup,
  Eyebrow,
  PolicyMeta,
  PremiumCard,
  Section,
} from "./PublicPrimitives";

export function PolicyPageShell({
  breadcrumbs,
  eyebrow,
  title,
  body,
  meta,
  actions,
  aside,
}: {
  breadcrumbs: Array<{ label: string; href?: string }>;
  eyebrow: string;
  title: ReactNode;
  body: string;
  meta?: Array<{ label: string; value: ReactNode }>;
  actions?: Array<{ href: string; label: string; tone?: "primary" | "secondary"; external?: boolean }>;
  aside?: ReactNode;
}) {
  return (
    <Section className="pt-8 sm:pt-12">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)] lg:items-end">
        <div className="max-w-4xl">
          <Breadcrumbs items={breadcrumbs} />
          <Eyebrow className="mt-5">{eyebrow}</Eyebrow>
          <h1 className="font-editorial mt-6 text-balance text-4xl leading-[0.98] tracking-[-0.03em] text-slate-950 sm:text-5xl lg:text-6xl">
            {title}
          </h1>
          <p className="mt-6 max-w-3xl text-base leading-8 text-[var(--text-secondary)] sm:text-lg">{body}</p>
          {actions?.length ? <CTAGroup className="mt-8" actions={actions} /> : null}
        </div>

        <PremiumCard strong>
          {meta?.length ? <PolicyMeta items={meta} /> : null}
          {aside ? <div className={meta?.length ? "mt-6" : undefined}>{aside}</div> : null}
        </PremiumCard>
      </div>
    </Section>
  );
}
