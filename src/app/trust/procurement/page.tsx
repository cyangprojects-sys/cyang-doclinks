import type { Metadata } from "next";
import Link from "next/link";
import { SiteShell } from "@/app/components/SiteShell";
import { getSecurityEmail, getSupportEmail } from "@/lib/legal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Procurement and Trust Package - cyang.io",
  description:
    "Procurement-ready trust package for Doclinks and cyang.io: security, privacy, SLA, DPA, subprocessors, and operational documentation.",
};

const PACKAGE_ITEMS = [
  {
    title: "Security package",
    body: "Security Policy, disclosure process, control summary, and operating assumptions.",
  },
  {
    title: "Privacy and processing package",
    body: "Privacy Policy, DPA structure, subprocessors, and data handling boundaries.",
  },
  {
    title: "Reliability package",
    body: "SLA commitments, status visibility, and incident communication posture.",
  },
  {
    title: "Platform terms package",
    body: "Terms of Service, Acceptable Use Policy, DMCA process, and legal center index.",
  },
];

const EVALUATION_STEPS = [
  "Review Security Policy, Privacy Policy, and Terms for baseline fit.",
  "Validate DPA, Subprocessors, and Data Retention for data-handling requirements.",
  "Review SLA and Status posture for reliability and escalation expectations.",
  "Use Contact route for procurement questions and trust package coordination.",
];

const CHECKLIST = [
  "Security controls are described in plain language and anchored in policy docs.",
  "Privacy and processor roles are documented for legal/procurement review.",
  "Subprocessor transparency is maintained and publicly visible.",
  "SLA and status surfaces define service and incident expectations.",
  "Abuse and security reporting routes are explicit and accessible.",
];

const DOC_MATRIX: Array<{ doc: string; audience: string; link: string; useCase: string }> = [
  { doc: "Security Policy", audience: "Security / IT", link: "/legal/security-policy", useCase: "Control posture and response model" },
  { doc: "Data Processing Addendum", audience: "Privacy / Legal", link: "/legal/data-processing-addendum", useCase: "Controller/processor terms" },
  { doc: "Subprocessors", audience: "Privacy / Compliance", link: "/legal/subprocessors", useCase: "Vendor and processing transparency" },
  { doc: "Service Level Agreement", audience: "Operations / Procurement", link: "/legal/service-level-agreement", useCase: "Availability and credits" },
  { doc: "Privacy Policy", audience: "Legal / Compliance", link: "/legal/privacy-policy", useCase: "Data collection and rights baseline" },
  { doc: "Terms of Service", audience: "Legal / Procurement", link: "/legal/terms-of-service", useCase: "Commercial and usage framework" },
];

export default function ProcurementTrustPage() {
  const supportEmail = getSupportEmail();
  const securityEmail = getSecurityEmail();
  const legalEmail = "legal@cyang.io";
  const mailSubject = "Doclinks Procurement Trust Package Request";
  const mailBody = [
    "Hello cyang.io team,",
    "",
    "Please share the current procurement trust package for Doclinks.",
    "",
    "Company:",
    "Role:",
    "Use case:",
    "Required timeline:",
    "Required documents:",
    "",
    "Thanks,",
  ].join("\n");
  const requestMailto = `mailto:${legalEmail}?subject=${encodeURIComponent(mailSubject)}&body=${encodeURIComponent(mailBody)}`;

  return (
    <SiteShell maxWidth="full">
      <section className="relative mt-10 grid gap-6 lg:grid-cols-12 lg:items-end">
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -left-16 top-0 h-72 w-72 rounded-full bg-sky-400/12 blur-3xl" />
          <div className="absolute right-0 top-8 h-80 w-80 rounded-full bg-teal-300/10 blur-3xl" />
        </div>

        <div className="lg:col-span-8">
          <span className="ui-badge inline-flex rounded-full px-3 py-1 text-xs uppercase tracking-[0.16em]">
            Procurement trust package
          </span>
          <h1 className="font-editorial mt-5 max-w-5xl text-4xl leading-[1.04] tracking-tight text-white sm:text-5xl lg:text-6xl">
            Business-ready trust documentation for Doclinks evaluations.
          </h1>
          <p className="mt-7 max-w-3xl text-base leading-relaxed text-white/72 sm:text-lg">
            This page gives security, procurement, and legal evaluators a fast path to the right documents, review
            sequence, and support channels.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <a
              href={requestMailto}
              data-funnel-action="procurement_request"
              data-funnel-label="request_procurement_package"
              data-funnel-location="trust"
              data-funnel-tier="primary"
              className="btn-base btn-primary rounded-xl px-6 py-3 text-sm font-semibold"
            >
              Request trust package
            </a>
            <Link href="/legal" className="btn-base btn-secondary rounded-xl px-6 py-3 text-sm">
              Open Legal Center
            </Link>
            <Link href="/contact" className="btn-base btn-secondary rounded-xl px-6 py-3 text-sm">
              Contact
            </Link>
          </div>
        </div>

        <div className="lg:col-span-4">
          <div className="glass-card-strong rounded-3xl p-6">
            <div className="text-xs uppercase tracking-[0.14em] text-white/55">Fast review path</div>
            <ul className="mt-4 space-y-2 text-sm text-white/72">
              {EVALUATION_STEPS.map((step) => (
                <li key={step} className="flex gap-2">
                  <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-sky-200/70" />
                  <span>{step}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="mt-16 md:mt-20">
        <SectionIntro
          eyebrow="Package contents"
          title="What is included in the procurement trust package"
          body="Each lane maps to customer-facing documents and trust surfaces already live on cyang.io."
        />
        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {PACKAGE_ITEMS.map((item) => (
            <InfoCard key={item.title} title={item.title} body={item.body} />
          ))}
        </div>
      </section>

      <section className="mt-16 md:mt-20">
        <SectionIntro
          eyebrow="Document matrix"
          title="Document-to-audience map"
          body="Use this matrix to route each reviewer to the right source quickly."
        />
        <div className="mt-8 glass-card rounded-3xl p-5 sm:p-6">
          <div className="hidden overflow-hidden rounded-2xl border border-white/10 md:block">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-white/5 text-white/88">
                <tr>
                  <th className="px-4 py-3 font-semibold">Document</th>
                  <th className="px-4 py-3 font-semibold">Primary audience</th>
                  <th className="px-4 py-3 font-semibold">Use in review</th>
                </tr>
              </thead>
              <tbody>
                {DOC_MATRIX.map((row) => (
                  <tr key={row.doc} className="border-t border-white/10">
                    <td className="px-4 py-3 text-white/85">
                      <Link href={row.link} className="underline underline-offset-4 hover:text-white">
                        {row.doc}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-white/72">{row.audience}</td>
                    <td className="px-4 py-3 text-white/72">{row.useCase}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 md:hidden">
            {DOC_MATRIX.map((row) => (
              <div key={row.doc} className="rounded-2xl border border-white/12 bg-black/25 p-4">
                <Link href={row.link} className="text-sm font-medium text-white/90 underline underline-offset-4">
                  {row.doc}
                </Link>
                <div className="mt-2 text-xs text-white/68">{row.audience}</div>
                <div className="mt-1 text-xs text-white/62">{row.useCase}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-16 md:mt-20">
        <SectionIntro
          eyebrow="Evaluation checklist"
          title="What buyers usually need to confirm"
          body="A concise checklist for security-conscious and procurement-led evaluations."
        />
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {CHECKLIST.map((item) => (
            <ChecklistItem key={item} text={item} />
          ))}
        </div>
      </section>

      <section className="mt-16 mb-2 md:mt-20">
        <div className="glass-card-strong ui-sheen rounded-3xl p-7 sm:p-8">
          <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Need coordinated procurement support?</h2>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-white/72">
            Reach the appropriate team directly and keep your review moving without ambiguity.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <ContactTile href={`mailto:${legalEmail}`} label="Legal" detail={legalEmail} />
            <ContactTile href={`mailto:${securityEmail}`} label="Security" detail={securityEmail} />
            <ContactTile href={`mailto:${supportEmail}`} label="Support" detail={supportEmail} />
            <ContactTile href="/status" label="Status" detail="Operational status and incidents" />
            <ContactTile href="/report" label="Report abuse" detail="Trust and safety escalation path" />
          </div>
        </div>
      </section>
    </SiteShell>
  );
}

function SectionIntro(props: { eyebrow: string; title: string; body: string }) {
  return (
    <div className="max-w-4xl">
      <span className="ui-badge inline-flex rounded-full px-3 py-1 text-xs uppercase tracking-[0.15em]">{props.eyebrow}</span>
      <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">{props.title}</h2>
      <p className="mt-3 text-sm leading-relaxed text-white/72 sm:text-base">{props.body}</p>
    </div>
  );
}

function InfoCard(props: { title: string; body: string }) {
  return (
    <article className="glass-card rounded-3xl p-6">
      <h3 className="text-lg font-semibold tracking-tight text-white">{props.title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-white/70">{props.body}</p>
    </article>
  );
}

function ChecklistItem({ text }: { text: string }) {
  return (
    <div className="glass-card rounded-3xl p-6 text-sm leading-relaxed text-white/72">
      <div className="flex gap-2">
        <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-sky-200/70" />
        <span>{text}</span>
      </div>
    </div>
  );
}

function ContactTile(props: { href: string; label: string; detail: string }) {
  const isExternal = props.href.startsWith("mailto:");
  if (isExternal) {
    return (
      <a href={props.href} className="rounded-2xl border border-white/14 bg-white/8 p-4 transition-colors hover:bg-white/14">
        <div className="text-sm font-medium text-white/92">{props.label}</div>
        <p className="mt-1 text-xs leading-relaxed text-white/67">{props.detail}</p>
      </a>
    );
  }
  return (
    <Link href={props.href} className="rounded-2xl border border-white/14 bg-white/8 p-4 transition-colors hover:bg-white/14">
      <div className="text-sm font-medium text-white/92">{props.label}</div>
      <p className="mt-1 text-xs leading-relaxed text-white/67">{props.detail}</p>
    </Link>
  );
}

