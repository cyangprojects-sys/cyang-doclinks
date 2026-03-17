import Link from "next/link";

export function StatusPageIntro() {
  return (
    <section className="glass-card-strong ui-sheen rounded-[30px] p-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.16em] text-white/55">cyang.io Trust Center</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">System Status</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/68 sm:text-base">
            Live health and availability for cyang.io services. Check platform reliability, current service posture,
            and update cadence in one place.
          </p>
        </div>
        <div className="max-w-sm rounded-2xl border border-white/12 bg-white/[0.03] p-4 text-sm text-white/63">
          Anonymous traffic reads a cached public health snapshot. Detailed diagnostics stay available without turning
          every public page view into dependency fan-out.
        </div>
      </div>
    </section>
  );
}

export function StatusPageResources() {
  return (
    <section className="glass-card rounded-[24px] p-4 sm:p-5">
      <h2 className="text-base font-semibold text-white">Related trust resources</h2>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
        <Link
          href="/trust"
          className="rounded-xl border border-white/12 bg-black/25 px-3 py-2 text-sm text-white/82 transition-colors hover:bg-white/10"
        >
          Trust Center
        </Link>
        <Link
          href="/trust/procurement"
          className="rounded-xl border border-white/12 bg-black/25 px-3 py-2 text-sm text-white/82 transition-colors hover:bg-white/10"
        >
          Procurement package
        </Link>
        <Link
          href="/legal/security-policy"
          className="rounded-xl border border-white/12 bg-black/25 px-3 py-2 text-sm text-white/82 transition-colors hover:bg-white/10"
        >
          Security Policy
        </Link>
        <Link
          href="/legal/service-level-agreement"
          className="rounded-xl border border-white/12 bg-black/25 px-3 py-2 text-sm text-white/82 transition-colors hover:bg-white/10"
        >
          SLA
        </Link>
        <Link
          href="/report"
          className="rounded-xl border border-white/12 bg-black/25 px-3 py-2 text-sm text-white/82 transition-colors hover:bg-white/10"
        >
          Report abuse
        </Link>
        <Link
          href="/contact"
          className="rounded-xl border border-white/12 bg-black/25 px-3 py-2 text-sm text-white/82 transition-colors hover:bg-white/10"
        >
          Contact
        </Link>
      </div>
    </section>
  );
}
