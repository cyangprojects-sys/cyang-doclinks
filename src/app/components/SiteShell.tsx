// app/components/SiteShell.tsx
import { SiteHeader } from "./SiteHeader";
import { SiteFooter } from "./SiteFooter";
import PublicFunnelTracker from "./PublicFunnelTracker";

export function SiteShell(props: {
  children: React.ReactNode;
  maxWidth?: "4xl" | "6xl" | "full";
}) {
  const maxWidthClass =
    props.maxWidth === "4xl"
      ? "max-w-[1280px]"
      : props.maxWidth === "full"
        ? "max-w-[2200px]"
        : "max-w-[1680px]";

  return (
    <main className="marketing-shell min-h-screen text-white">
      <PublicFunnelTracker />
      <div className={`relative mx-auto w-full ${maxWidthClass} px-3 py-6 sm:px-4 sm:py-8 lg:px-6 lg:py-9 xl:px-8`}>
        <SiteHeader />
        {props.children}
        <SiteFooter />
      </div>
    </main>
  );
}
