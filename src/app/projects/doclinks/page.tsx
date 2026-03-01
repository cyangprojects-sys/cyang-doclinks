// app/projects/doclinks/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { SiteShell } from "../../components/SiteShell";
import { DemoDocButton } from "@/components/DemoDocButton";
import { DEMO_DOC_URL } from "@/lib/demo";

export const metadata: Metadata = {
  title: "Doclinks — cyang.io",
  description:
    "Doclinks is secure document delivery infrastructure with policy-enforced access, scan-gated delivery, and audit visibility.",
};

export default function DoclinksPage() {
  return (
    <SiteShell maxWidth="full">
      <section className="relative mt-16 grid gap-10 md:grid-cols-12 md:items-end">
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -top-24 left-10 h-64 w-64 rounded-full bg-emerald-500/12 blur-3xl" />
          <div className="absolute -bottom-32 right-0 h-80 w-80 rounded-full bg-white/10 blur-3xl" />
        </div>

        <div className="md:col-span-7">
          <p className="inline-flex items-center gap-2 rounded-full bg-white/5 px-4 py-2 text-xs text-white/70 ring-1 ring-white/10">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            Project: Doclinks
          </p>

          <h1 className="mt-6 text-4xl font-semibold tracking-tight md:text-5xl">
            Secure document delivery infrastructure
            <span className="block text-white/70">for teams that cannot lose control.</span>
          </h1>

          <p className="mt-5 max-w-2xl text-base leading-relaxed text-white/70">
            Built for operations and compliance managers at small organizations, Doclinks delivers sensitive documents
            with token-based access, enforced expiration controls, and audit visibility.
          </p>

          <div className="mt-6 flex flex-wrap gap-2 text-xs text-white/60">
            <Pill>Encryption default</Pill>
            <Pill>MIME + signature checks</Pill>
            <Pill>Executable/macro blocking</Pill>
            <Pill>Immutable audit log</Pill>
            <Pill>Quarantine enforcement</Pill>
            <Pill>Expires shares</Pill>
            <Pill>Max views</Pill>
            <Pill>Revocation</Pill>
            <Pill>Rate limiting</Pill>
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/signin"
              className="rounded-2xl bg-white px-6 py-3 text-sm font-medium text-black hover:bg-white/90"
            >
              Start Free
            </Link>

            <Link
              href="/projects/doclinks#security-model"
              className="rounded-2xl bg-white/10 px-6 py-3 text-sm font-medium text-white ring-1 ring-white/10 hover:bg-white/15"
            >
              View Security
            </Link>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            <Stat title="Storage + Crypto" value="R2 + AES-256-GCM" />
            <Stat title="Enforcement" value="Alias/token + ticket checks" />
            <Stat title="Observability" value="Immutable + exportable logs" />
          </div>
        </div>

        <div className="md:col-span-5">
          <div className="rounded-3xl bg-white/5 p-6 ring-1 ring-white/10">
            <h2 className="text-sm font-medium text-white/90">Request flow</h2>

            <div className="mt-4 space-y-3">
              <Step
                n="1"
                title="Upload securely"
                desc="Upload business documents through encrypted storage paths."
              />
              <Step
                n="2"
                title="Set access policy"
                desc="Apply expiration, view limits, and recipient controls."
              />
              <Step
                n="3"
                title="Deliver with control"
                desc="Serve access through tokenized checks and audit every event."
              />
            </div>

            <div className="mt-6 rounded-2xl bg-black/40 p-4 ring-1 ring-white/10">
              <p className="text-xs leading-relaxed text-white/60">
                Live demo: {" "}
                <DemoDocButton
                  label="Open the demo document"
                  className="text-white/85 hover:underline"
                />
                .
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="mt-20 md:mt-28">
        <div className="flex items-end justify-between gap-6">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">What it optimizes for</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/70">
              A clean UX, plus security defaults that don’t rely on the link being secret.
            </p>
          </div>
          <Link
            href="/admin"
            className="hidden rounded-2xl bg-white/5 px-4 py-2 text-sm text-white/80 ring-1 ring-white/10 hover:bg-white/10 sm:inline-flex"
          >
            Open admin →
          </Link>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <Feature
            title="Small surface area"
            desc="Purpose-built for external delivery, without broad storage complexity."
          />
          <Feature
            title="Controlled delivery"
            desc="Policy enforcement happens on every serve request."
          />
          <Feature
            title="Auditability"
            desc="Access visibility and exportable audit records support review."
          />
        </div>
      </section>

      <section id="security-model" className="mt-16">
        <h2 className="text-2xl font-semibold tracking-tight">Security model (high level)</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-12">
          <div className="md:col-span-7">
            <div className="rounded-3xl bg-white/5 p-6 ring-1 ring-white/10">
              <ul className="space-y-3 text-sm text-white/70">
                <ListItem>
                  <b className="text-white/85">Authorization lives on the server.</b> Links
                  resolve to a record; the server decides whether to serve the file.
                </ListItem>
                <ListItem>
                  <b className="text-white/85">Least privilege storage.</b> R2 objects are
                  not public; access is mediated by the app.
                </ListItem>
                <ListItem>
                  <b className="text-white/85">Access is auditable.</b> Delivery activity can be tracked for review and export.
                </ListItem>
                <ListItem>
                  <b className="text-white/85">Operational guardrails.</b> Rate limiting and
                  policy clamps reduce abuse and accidental leaks.
                </ListItem>
                <ListItem>
                  <b className="text-white/85">Scan-gated delivery.</b> Files flagged as infected, failed, or quarantined are blocked.
                </ListItem>
              </ul>
            </div>
          </div>

          <div className="md:col-span-5">
            <div className="rounded-3xl bg-white/5 p-6 ring-1 ring-white/10">
              <h3 className="text-sm font-medium text-white/90">Common controls</h3>
              <div className="mt-4 grid gap-3">
                <Control title="Expiration" desc="Time-box access to reduce lingering risk." />
                <Control title="Max views" desc="Cap how many times a share can be opened." />
                <Control title="Audit logs" desc="Know when, how, and from where it was accessed." />
                <Control title="Revocation" desc="Disable a share immediately server-side." />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="why-doclinks" className="mt-16">
        <div className="flex items-end justify-between gap-6">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Why not Drive or Dropbox?</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/70">
              Those tools optimize for broad storage and collaboration. Doclinks is built for controlled external delivery of sensitive documents.
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-12">
          <div className="md:col-span-7">
            <div className="rounded-3xl bg-white/5 p-6 ring-1 ring-white/10">
              <h3 className="text-sm font-medium text-white/90">Doclinks vs typical share links</h3>
              <div className="mt-4 space-y-3">
                <Compare
                  leftTitle="Policy enforcement"
                  left="Server-side checks on every request (expiry, max views, throttles)."
                  rightTitle="Typical"
                  right="Often: “If you have the link, you’re in.”"
                />
                <Compare
                  leftTitle="Observability"
                  left="Access visibility + audit exports for operational review."
                  rightTitle="Typical"
                  right="Little-to-no reliable access history."
                />
                <Compare
                  leftTitle="Delivery posture"
                  left="Built for controlled delivery of sensitive external documents."
                  rightTitle="Typical"
                  right="Built for general storage and broad sharing convenience."
                />
              </div>

              <div className="mt-6 rounded-2xl bg-black/40 p-4 ring-1 ring-white/10">
                <p className="text-xs leading-relaxed text-white/60">
                  The goal is clear: controlled delivery, enforced architecture, and operational clarity.
                </p>
              </div>
            </div>
          </div>

          <div className="md:col-span-5">
            <div className="rounded-3xl bg-white/5 p-6 ring-1 ring-white/10">
              <h3 className="text-sm font-medium text-white/90">What you can control</h3>
              <div className="mt-4 grid gap-3">
                <Control title="Time-box access" desc="Reduce risk with expiration." />
                <Control title="Cap usage" desc="View caps reduce uncontrolled resharing." />
                <Control title="Revoke instantly" desc="Disable a token server-side." />
                <Control title="Review access" desc="Logs help you validate behavior." />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="pricing" className="mt-16">
        <h2 className="text-2xl font-semibold tracking-tight">Pricing</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/70">
          Transparent numbers. Clear capability differences.
        </p>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-3xl bg-white/5 p-6 ring-1 ring-white/10">
            <div className="text-lg font-semibold text-white">Free</div>
            <div className="mt-1 text-sm text-white/65">$0/month</div>
            <ul className="mt-4 space-y-2 text-sm text-white/75">
              <li>25 MB max upload</li>
              <li>100 MB total storage</li>
              <li>Limited active shares</li>
              <li>Basic audit logs</li>
            </ul>
            <Link href="/signin" className="mt-5 inline-flex rounded-xl bg-white px-4 py-2 text-sm font-medium text-black hover:bg-white/90">
              Start Free
            </Link>
          </div>
          <div className="rounded-3xl border border-amber-300/40 bg-white/5 p-6 ring-1 ring-amber-200/15">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/55 bg-amber-300/12 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-amber-100">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />
              Pro
            </div>
            <div className="mt-3 text-lg font-semibold text-white">Pro - $12/month</div>
            <ul className="mt-4 space-y-2 text-sm text-white/85">
              <li>100 MB max upload</li>
              <li>5 GB total storage</li>
              <li>Custom expiration controls</li>
              <li>Audit export</li>
              <li>Advanced access controls</li>
            </ul>
            <Link href="/admin/upgrade" className="btn-base ui-premium mt-5 inline-flex rounded-xl px-4 py-2 text-sm font-semibold">
              Upgrade to Pro
            </Link>
          </div>
        </div>
      </section>

      <section className="mt-16">
        <h2 className="text-2xl font-semibold tracking-tight">Supported Upload Types</h2>
        <div className="mt-6 rounded-3xl bg-white/5 p-6 ring-1 ring-white/10">
          <p className="text-sm leading-relaxed text-white/70">
            Allowed: Documents (.pdf, .doc, .docx, .txt, .rtf, .odt), Spreadsheets (.xls, .xlsx, .csv),
            Presentations (.ppt, .pptx), Images (.jpg, .jpeg, .png, .gif, .bmp, .heic), Archives (.zip, .rar),
            Audio/Video (.mp3, .wav, .mp4, .mov, .avi).
          </p>
          <p className="mt-3 text-sm leading-relaxed text-amber-200/80">
            Blocked: executable, script, shortcut, and macro-enabled types (including .exe, .js, .ps1, .lnk, .docm, .xlsm, .pptm), and anything not explicitly allowlisted.
          </p>
        </div>
      </section>

      <section className="mt-16">
        <h2 className="text-2xl font-semibold tracking-tight">Current build status</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-12">
          <div className="md:col-span-7">
            <div className="rounded-3xl bg-white/5 p-6 ring-1 ring-white/10">
              <ul className="space-y-3 text-sm text-white/70">
                <ListItem>
                  <b className="text-white/85">Encryption is default.</b> New uploads are encrypted and legacy migration tooling is in place.
                </ListItem>
                <ListItem>
                  <b className="text-white/85">Access control is enforced.</b> Expiry, revocation, max-views, password gates, and scan-state blocks are enforced server-side.
                </ListItem>
                <ListItem>
                  <b className="text-white/85">Viewer hardening shipped.</b> Public inline flows are view-oriented with reduced direct-open and raw URL exposure.
                </ListItem>
                <ListItem>
                  <b className="text-white/85">Plan guardrails are active.</b> View, storage, and active-share limits are enforced by plan.
                </ListItem>
              </ul>
            </div>
          </div>
          <div className="md:col-span-5">
            <div className="rounded-3xl bg-white/5 p-6 ring-1 ring-white/10">
              <h3 className="text-sm font-medium text-white/90">Ops and governance</h3>
              <div className="mt-4 grid gap-3">
                <Control title="Immutable audit trail" desc="Upload/view/share/admin actions append to tamper-evident logs." />
                <Control title="Org access model" desc="Membership and invite flows back enterprise RBAC." />
                <Control title="Cron automation" desc="Cloudflare cron handles scan, retention, and rotation operational jobs." />
                <Control title="Build hygiene" desc="Runtime-only env loading avoids build-time module crashes." />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="mt-16">
        <h2 className="text-2xl font-semibold tracking-tight">FAQ</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Faq
            q="Is this secure if someone forwards the link?"
            a="Forwarding a link is expected. Doclinks relies on server-side enforcement (expiry, max views, rate limits, policy checks) rather than treating the URL as a password."
          />
          <Faq
            q="Do R2 objects ever become public?"
            a="The intended posture is private objects with access mediated by the app. The app decides if a request is allowed, then serves the content."
          />
          <Faq
            q="Is this a competitor clone?"
            a="No. It is focused on controlled external document delivery with enforced policies and audit visibility."
          />
          <Faq
            q="What’s next?"
            a="Hardening the share model (one-time tickets, stronger viewer controls) and making analytics/retention fully automated."
          />
        </div>
      </section>

      <section className="mt-16">
        <h2 className="text-2xl font-semibold tracking-tight">Use it</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Callout
            title="Admin upload"
            desc="Upload supported file types and generate a shareable link."
            href="/admin"
            cta="Open Admin Upload →"
          />
          <Callout
            title="Open a demo document"
            desc="See a live shared document behind server-side enforcement."
            href={DEMO_DOC_URL}
            external
            cta="Open demo →"
          />
        </div>
      </section>

      <section className="mt-16">
        <h2 className="text-2xl font-semibold tracking-tight">Roadmap (near-term)</h2>
        <div className="mt-6 rounded-3xl bg-white/5 p-6 ring-1 ring-white/10">
          <ul className="space-y-3 text-sm text-white/70">
            <li className="flex gap-2">
              <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-white/30" />
              <span>Alias management UI (create/rename/expire) with safer defaults</span>
            </li>
            <li className="flex gap-2">
              <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-white/30" />
              <span>Access policies (allowlists, one-time tickets, stronger viewer controls)</span>
            </li>
            <li className="flex gap-2">
              <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-white/30" />
              <span>Analytics rollups (daily views, top docs, retention cleanup)</span>
            </li>
          </ul>
        </div>
      </section>
    </SiteShell>
  );
}

function Stat({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
      <div className="text-xs text-white/60">{title}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}

function Step(props: { n: string; title: string; desc: string }) {
  return (
    <div className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
      <div className="flex items-start gap-3">
        <div className="grid h-7 w-7 place-items-center rounded-lg bg-white/10 text-xs font-semibold ring-1 ring-white/10">
          {props.n}
        </div>
        <div>
          <div className="text-sm font-medium text-white/90">{props.title}</div>
          <div className="mt-1 text-xs leading-relaxed text-white/60">{props.desc}</div>
        </div>
      </div>
    </div>
  );
}

function Feature({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-3xl bg-white/5 p-6 ring-1 ring-white/10">
      <div className="text-lg font-semibold">{title}</div>
      <p className="mt-2 text-sm leading-relaxed text-white/70">{desc}</p>
    </div>
  );
}

function Callout(props: {
  title: string;
  desc: string;
  href: string;
  cta: string;
  external?: boolean;
}) {
  const className =
    "group rounded-3xl bg-white/5 p-6 ring-1 ring-white/10 hover:bg-white/10";

  if (props.external) {
    return (
      <a
        href={props.href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
        aria-label={`${props.title} (opens in a new tab)`}
      >
        <div className="text-lg font-semibold">{props.title}</div>
        <p className="mt-2 text-sm leading-relaxed text-white/70">{props.desc}</p>
        <div className="mt-4 text-sm text-white/80 group-hover:text-white">{props.cta}</div>
      </a>
    );
  }

  return (
    <Link href={props.href} className={className}>
      <div className="text-lg font-semibold">{props.title}</div>
      <p className="mt-2 text-sm leading-relaxed text-white/70">{props.desc}</p>
      <div className="mt-4 text-sm text-white/80 group-hover:text-white">{props.cta}</div>
    </Link>
  );
}

function Control(props: { title: string; desc: string }) {
  return (
    <div className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
      <div className="text-sm font-medium text-white/90">{props.title}</div>
      <div className="mt-1 text-xs leading-relaxed text-white/60">{props.desc}</div>
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-white/5 px-3 py-1 text-[11px] text-white/60 ring-1 ring-white/10">
      {children}
    </span>
  );
}

function Compare(props: {
  leftTitle: string;
  left: string;
  rightTitle: string;
  right: string;
}) {
  return (
    <div className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <div className="text-xs font-medium text-white/80">{props.leftTitle}</div>
          <div className="mt-1 text-xs leading-relaxed text-white/60">{props.left}</div>
        </div>
        <div>
          <div className="text-xs font-medium text-white/80">{props.rightTitle}</div>
          <div className="mt-1 text-xs leading-relaxed text-white/60">{props.right}</div>
        </div>
      </div>
    </div>
  );
}

function Faq(props: { q: string; a: string }) {
  return (
    <div className="rounded-3xl bg-white/5 p-6 ring-1 ring-white/10">
      <div className="text-sm font-medium text-white/90">{props.q}</div>
      <p className="mt-2 text-sm leading-relaxed text-white/70">{props.a}</p>
    </div>
  );
}

function ListItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-white/30" />
      <span>{children}</span>
    </li>
  );
}






