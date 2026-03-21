import { requireRole } from "@/lib/authz";
import { PACKS } from "@/lib/packs";
import { AdminPageIntro, AdminSection } from "../_components/AdminPagePrimitives";

export const runtime = "nodejs";

export default async function BrandingPage() {
  await requireRole("owner");

  const watermarkPacks = PACKS.filter((pack) => Boolean(pack.settings.watermarkEnabled));

  return (
    <div className="space-y-6">
      <AdminPageIntro
        eyebrow="Branding"
        title="Keep the workspace trustworthy before anyone opens a link."
        description="Branding in DocLinks is about trust signals, not decoration: workspace identity, watermark posture, and clear share presentation that reinforces controlled access."
      />

      <AdminSection
        title="Workspace identity preview"
        description="This preview uses the current shipped cyang.io assets and shows how the admin workspace positions trust and delivery posture today."
      >
        <div className="grid gap-4 xl:grid-cols-[0.95fr_minmax(0,1.05fr)]">
          <div className="surface-panel-strong rounded-sm p-5">
            <div className="flex items-center gap-4">
              <img src="/branding/cyang_primary.svg" alt="cyang.io" className="h-14 w-14 rounded-sm border border-[var(--border-subtle)] bg-[var(--surface-soft)] p-2" />
              <div>
                <div className="text-lg font-semibold text-[var(--text-primary)]">cyang.io / DocLinks</div>
                <div className="mt-1 text-sm text-[var(--text-muted)]">Security-forward document sharing with controlled delivery.</div>
              </div>
            </div>
            <div className="surface-panel-soft mt-5 rounded-sm p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-[var(--text-faint)]">Share surface tone</div>
              <div className="mt-2 text-sm text-[var(--text-secondary)]">
                Calm dark shell, visible security status, crisp access labels, and intentional trust language.
              </div>
            </div>
          </div>

          <div className="surface-panel-strong rounded-sm p-5">
            <div className="text-xs uppercase tracking-[0.16em] text-[var(--text-faint)]">Branding posture</div>
            <div className="mt-3 space-y-3">
              <div className="selection-tile p-4">
                <div className="text-sm font-medium text-[var(--text-primary)]">Primary logo</div>
                <div className="mt-1 text-sm text-[var(--text-secondary)]">The current workspace uses the shipped cyang primary mark.</div>
              </div>
              <div className="selection-tile p-4">
                <div className="text-sm font-medium text-[var(--text-primary)]">Watermark-enabled packs</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {watermarkPacks.map((pack) => (
                    <span key={pack.id} className="rounded-full border border-[var(--border-subtle)] bg-white px-2.5 py-1 text-[11px] text-[var(--text-secondary)]">
                      {pack.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </AdminSection>
    </div>
  );
}
