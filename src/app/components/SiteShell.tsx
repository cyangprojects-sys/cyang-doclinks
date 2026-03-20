import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";
import PublicFunnelTrackerDeferred from "./PublicFunnelTrackerDeferred";
import {
  getPublicRuntimeConfig,
  type PublicRuntimeConfig,
} from "@/lib/publicRuntimeConfig";

export function SiteShell({
  children,
  maxWidth = "full",
  publicConfig,
}: {
  children: React.ReactNode;
  maxWidth?: "4xl" | "6xl" | "full";
  publicConfig?: PublicRuntimeConfig;
}) {
  const shellWidth =
    maxWidth === "4xl"
      ? "max-w-[1100px]"
      : maxWidth === "6xl"
        ? "max-w-[1320px]"
        : "max-w-[1600px]";
  const config = publicConfig ?? getPublicRuntimeConfig();

  return (
    <main className="marketing-shell min-h-screen text-[var(--text-primary)]">
      <PublicFunnelTrackerDeferred />
      <div className={`relative mx-auto w-full ${shellWidth} px-3 py-3 sm:px-4 sm:py-4 lg:px-6`}>
        <SiteHeader config={config} />
        <div className="relative">{children}</div>
        <SiteFooter config={config} />
      </div>
    </main>
  );
}
