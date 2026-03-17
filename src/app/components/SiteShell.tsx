// app/components/SiteShell.tsx
import { SiteHeader } from "./SiteHeader";
import { SiteFooter } from "./SiteFooter";
import PublicFunnelTrackerDeferred from "./PublicFunnelTrackerDeferred";
import { getPublicRuntimeConfig, type PublicRuntimeConfig } from "@/lib/publicRuntimeConfig";

export function SiteShell(props: {
  children: React.ReactNode;
  maxWidth?: "4xl" | "6xl" | "full";
  publicConfig?: PublicRuntimeConfig;
}) {
  const maxWidthClass =
    props.maxWidth === "4xl"
      ? "max-w-[1280px]"
      : props.maxWidth === "full"
        ? "max-w-[2200px]"
        : "max-w-[1680px]";
  const publicConfig = props.publicConfig ?? getPublicRuntimeConfig();

  return (
    <main className="marketing-shell min-h-screen text-white">
      <PublicFunnelTrackerDeferred />
      <div className={`relative mx-auto w-full ${maxWidthClass} px-3 py-6 sm:px-4 sm:py-8 lg:px-6 lg:py-9 xl:px-8`}>
        <SiteHeader config={publicConfig} />
        {props.children}
        <SiteFooter config={publicConfig} />
      </div>
    </main>
  );
}
