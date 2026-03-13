import { requireRole } from "@/lib/authz";
import { PACKS } from "@/lib/packs";
import { AdminPageIntro, AdminSection } from "../_components/AdminPagePrimitives";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
          <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5">
            <div className="flex items-center gap-4">
              <img src="/branding/cyang_primary.svg" alt="cyang.io" className="h-14 w-14 rounded-2xl border border-white/10 bg-[#07131f] p-2" />
              <div>
                <div className="text-lg font-semibold text-white">cyang.io / DocLinks</div>
                <div className="mt-1 text-sm text-white/60">Security-forward document sharing with controlled delivery.</div>
              </div>
            </div>
            <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-white/45">Share surface tone</div>
              <div className="mt-2 text-sm text-white/70">
                Calm dark shell, visible security status, crisp access labels, and intentional trust language.
              </div>
            </div>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5">
            <div className="text-xs uppercase tracking-[0.16em] text-white/45">Branding posture</div>
            <div className="mt-3 space-y-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="text-sm font-medium text-white">Primary logo</div>
                <div className="mt-1 text-sm text-white/62">The current workspace uses the shipped cyang primary mark.</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="text-sm font-medium text-white">Watermark-enabled packs</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {watermarkPacks.map((pack) => (
                    <span key={pack.id} className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/68">
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
