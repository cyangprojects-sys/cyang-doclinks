import type { Metadata } from "next";
import Link from "next/link";
import { SiteShell } from "@/app/components/SiteShell";
import { getBillingFlags } from "@/lib/settings";
import { getPrivacyEmail, getSecurityEmail, getSupportEmail } from "@/lib/legal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Contact - cyang.io",
  description:
    "Contact cyang.io for product support, business questions, privacy requests, and security reporting.",
};

export default async function ContactPage() {
  const supportEmail = getSupportEmail();
  const securityEmail = getSecurityEmail();
  const privacyEmail = getPrivacyEmail();
  const legalEmail = "legal@cyang.io";
  const flagsRes = await getBillingFlags();
  const showPricingUi = flagsRes.flags.pricingUiEnabled;

  return (
    <SiteShell maxWidth="full">
      <section className="relative mt-10 grid gap-6 lg:grid-cols-12 lg:items-end">
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -left-16 top-0 h-72 w-72 rounded-full bg-sky-400/12 blur-3xl" />
          <div className="absolute right-0 top-8 h-80 w-80 rounded-full bg-teal-300/10 blur-3xl" />
        </div>

        <div className="lg:col-span-8">
          <span className="ui-badge inline-flex rounded-full px-3 py-1 text-xs uppercase tracking-[0.16em]">
            Contact
          </span>
          <h1 className="font-editorial mt-5 max-w-5xl text-4xl leading-[1.04] tracking-tight text-white sm:text-5xl lg:text-6xl">
            Reach the right team quickly.
          </h1>
          <p className="mt-7 max-w-3xl text-base leading-relaxed text-white/72 sm:text-lg">
            Use this page for product support, business and procurement questions, privacy requests, and security
            reporting routes.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <a href={`mailto:${supportEmail}`} className="btn-base btn-primary rounded-xl px-6 py-3 text-sm font-semibold">
              Email support
            </a>
            <Link href="/trust" className="btn-base btn-secondary rounded-xl px-6 py-3 text-sm">
              Trust Center
            </Link>
            <Link href="/status" className="btn-base btn-secondary rounded-xl px-6 py-3 text-sm">
              View status
            </Link>
          </div>
        </div>

        <div className="lg:col-span-4">
          <div className="glass-card-strong rounded-3xl p-6">
            <div className="text-xs uppercase tracking-[0.14em] text-white/55">Response posture</div>
            <ul className="mt-4 space-y-2 text-sm text-white/72">
              <li className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-sky-200/70" />
                <span>General support reviewed on business days.</span>
              </li>
              <li className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-sky-200/70" />
                <span>Security disclosures are triaged with priority.</span>
              </li>
              <li className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-sky-200/70" />
                <span>Privacy and legal requests are routed to dedicated channels.</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section className="mt-16 md:mt-20 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ContactCard
          title="Product and account support"
          body="Questions about onboarding, access, or product usage."
          actionLabel={supportEmail}
          actionHref={`mailto:${supportEmail}`}
        />
        <ContactCard
          title="Security reporting"
          body="Responsible disclosure for vulnerabilities or security concerns."
          actionLabel={securityEmail}
          actionHref={`mailto:${securityEmail}`}
          secondaryHref="/security-disclosure"
          secondaryLabel="Disclosure policy"
        />
        <ContactCard
          title="Privacy and data requests"
          body="Privacy questions, data handling inquiries, and request routing."
          actionLabel={privacyEmail}
          actionHref={`mailto:${privacyEmail}`}
          secondaryHref="/privacy"
          secondaryLabel="Privacy Policy"
        />
        <ContactCard
          title="Legal and procurement"
          body="Commercial review and legal documentation questions."
          actionLabel={legalEmail}
          actionHref={`mailto:${legalEmail}`}
          secondaryHref="/legal"
          secondaryLabel="Legal Center"
        />
      </section>

      <section className="mt-16 mb-2 md:mt-20">
        <div className="glass-card rounded-3xl p-7 sm:p-8">
          <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Related trust and support resources</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <QuickLink href="/projects/doclinks" label="Doclinks" />
            {showPricingUi ? <QuickLink href="/pricing" label="Pricing" /> : null}
            <QuickLink href="/trust" label="Trust Center" />
            <QuickLink href="/trust/procurement" label="Procurement Package" />
            <QuickLink href="/report" label="Report abuse" />
            <QuickLink href="/status" label="Status" />
          </div>
        </div>
      </section>
    </SiteShell>
  );
}

function ContactCard(props: {
  title: string;
  body: string;
  actionLabel: string;
  actionHref: string;
  secondaryHref?: string;
  secondaryLabel?: string;
}) {
  return (
    <article className="glass-card rounded-3xl p-6">
      <h2 className="text-lg font-semibold tracking-tight text-white">{props.title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-white/70">{props.body}</p>
      <a
        href={props.actionHref}
        className="mt-4 inline-flex text-sm text-white/85 underline underline-offset-4 hover:text-white"
      >
        {props.actionLabel}
      </a>
      {props.secondaryHref && props.secondaryLabel ? (
        <div className="mt-3">
          <Link href={props.secondaryHref} className="text-xs text-white/68 underline underline-offset-4 hover:text-white">
            {props.secondaryLabel}
          </Link>
        </div>
      ) : null}
    </article>
  );
}

function QuickLink(props: { href: string; label: string }) {
  return (
    <Link href={props.href} className="rounded-2xl border border-white/12 bg-black/25 p-4 text-sm text-white/86 transition-colors hover:bg-white/12">
      {props.label}
    </Link>
  );
}
