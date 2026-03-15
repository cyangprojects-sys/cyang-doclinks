import type { Metadata } from "next";
import Link from "next/link";
import ViewerLinkLauncher from "./ViewerLinkLauncher";

export const metadata: Metadata = {
  title: "Viewer Workspace",
  description: "Open and review shared DocLinks content in your authenticated viewer workspace.",
};

export default function ViewerDashboardPage() {
  return (
    <div className="space-y-4">
      <section className="glass-card-strong ui-sheen rounded-[30px] border-white/14 p-6 sm:p-7">
        <p className="text-xs uppercase tracking-[0.16em] text-cyan-200/86">Secure access</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          Open shared files with a dedicated viewer experience.
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-white/70 sm:text-base">
          This workspace is intentionally focused on recipients. It keeps document viewing flows clear while
          workspace management stays in the admin area.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Chip label="Recipient-only space" />
          <Chip label="Secure link access" />
          <Chip label="No admin controls" />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.15fr_minmax(0,0.85fr)]">
        <div className="glass-card-strong rounded-[26px] border-white/12 p-5 sm:p-6">
          <div className="text-xs uppercase tracking-[0.16em] text-white/54">Open shared content</div>
          <h3 className="mt-2 text-xl font-semibold text-white">Paste a secure link or token</h3>
          <p className="mt-2 text-sm text-white/65">
            Supports DocLinks URLs and direct token paths. You can paste full links from email or just the token.
          </p>
          <div className="mt-4">
            <ViewerLinkLauncher />
          </div>
        </div>

        <div className="glass-card-strong rounded-[26px] border-white/12 p-5 sm:p-6">
          <div className="text-xs uppercase tracking-[0.16em] text-white/54">Need workspace management?</div>
          <h3 className="mt-2 text-xl font-semibold text-white">Owner and admin controls are separate</h3>
          <p className="mt-2 text-sm text-white/65">
            If you manage documents, links, team settings, or billing, switch to the dedicated owner/admin sign-in.
          </p>
          <div className="mt-4 flex flex-wrap gap-2.5">
            <Link
              href="/signin?intent=admin"
              className="btn-base rounded-xl border border-cyan-300/38 bg-cyan-300 px-4 py-2.5 text-sm font-semibold text-[#07131f] hover:bg-cyan-200"
            >
              Workspace owner sign-in
            </Link>
            <Link
              href="/projects/doclinks"
              className="btn-base rounded-xl border border-white/12 bg-white/[0.05] px-4 py-2.5 text-sm text-white/78 hover:border-white/22 hover:bg-white/[0.1]"
            >
              Product overview
            </Link>
          </div>
        </div>
      </section>

      <section className="glass-card-strong rounded-[26px] border-white/12 p-5 sm:p-6">
        <div className="text-xs uppercase tracking-[0.16em] text-white/54">How to use this space</div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <Step title="1. Open the secure link" body="Use the paste box above or open links from invitation emails." />
          <Step title="2. Complete access checks" body="Enter any required passcode and trust checks on the secure page." />
          <Step title="3. Review and continue" body="Return here anytime to open the next shared item quickly." />
        </div>
      </section>
    </div>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-white/14 bg-white/[0.05] px-3 py-1.5 text-xs text-white/74">
      {label}
    </span>
  );
}

function Step({ title, body }: { title: string; body: string }) {
  return (
    <article className="rounded-2xl border border-white/12 bg-white/[0.03] p-4">
      <h4 className="text-sm font-semibold text-white">{title}</h4>
      <p className="mt-1 text-sm text-white/64">{body}</p>
    </article>
  );
}
