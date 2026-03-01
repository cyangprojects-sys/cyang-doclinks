import Link from "next/link";

type BadgeTone = "default" | "good" | "warn";

export function ShareBadge({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: BadgeTone;
}) {
  const toneClass =
    tone === "good"
      ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-100"
      : tone === "warn"
      ? "border-amber-300/30 bg-amber-300/10 text-amber-100"
      : "ui-badge";

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs ${toneClass}`}>
      {children}
    </span>
  );
}

export function ShareShell({
  token,
  title,
  subtitle,
  children,
}: {
  token: string;
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main className="app-shell min-h-screen px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <img src="/branding/cyang_primary.svg" alt="cyang.io" className="h-5 w-5 object-contain opacity-90" />
              <div className="text-xs uppercase tracking-[0.14em] text-white/55">cyang.io</div>
            </div>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-white sm:text-2xl">{title}</h1>
            {subtitle ? <div className="mt-1 text-sm text-white/65">{subtitle}</div> : null}
          </div>
          <Link
            href={`/report?token=${encodeURIComponent(token)}`}
            className="btn-base btn-secondary rounded-xl px-3 py-2 text-xs sm:text-sm"
          >
            Report abuse
          </Link>
        </div>
        <section className="glass-card-strong rounded-2xl p-4 sm:p-6">{children}</section>
        <div className="mt-4 text-xs text-white/55">
          Controlled delivery by cyang.io. Access may expire or be revoked by policy.
        </div>
      </div>
    </main>
  );
}
