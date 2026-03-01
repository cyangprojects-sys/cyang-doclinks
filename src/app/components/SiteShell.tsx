// app/components/SiteShell.tsx
import { SiteHeader } from "./SiteHeader";
import { SiteFooter } from "./SiteFooter";

export function SiteShell(props: {
  children: React.ReactNode;
  maxWidth?: "4xl" | "6xl";
}) {
  const maxWidthClass = props.maxWidth === "4xl" ? "max-w-4xl" : "max-w-6xl";

  return (
    <main className="marketing-shell min-h-screen text-white">
      <div className={`relative mx-auto ${maxWidthClass} px-5 py-7 sm:px-7 sm:py-10`}>
        <SiteHeader />
        {props.children}
        <SiteFooter />
      </div>
    </main>
  );
}
