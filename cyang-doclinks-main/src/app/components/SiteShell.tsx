// app/components/SiteShell.tsx
import { SiteHeader } from "./SiteHeader";
import { SiteFooter } from "./SiteFooter";

export function SiteShell(props: {
    children: React.ReactNode;
    maxWidth?: "4xl" | "6xl";
}) {
    const maxWidthClass = props.maxWidth === "4xl" ? "max-w-4xl" : "max-w-6xl";

    return (
        <main className="min-h-screen bg-black text-white">
            {/* Consistent background */}
            <div className="pointer-events-none fixed inset-0 opacity-30">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(56,189,248,0.28),transparent_40%),radial-gradient(circle_at_80%_30%,rgba(168,85,247,0.25),transparent_45%),radial-gradient(circle_at_50%_80%,rgba(34,197,94,0.18),transparent_40%)]" />
                <div className="absolute inset-0 bg-gradient-to-b from-black via-black/70 to-black" />
            </div>

            {/* Consistent container */}
            <div className={`relative mx-auto ${maxWidthClass} px-6 py-10`}>
                <SiteHeader />
                {props.children}
                <SiteFooter />
            </div>
        </main>
    );
}
