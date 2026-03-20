import type { Metadata } from "next";
import { SiteShell } from "@/app/components/SiteShell";
import StatusCenterClient from "./StatusCenterClient";
import { StatusPageIntro, StatusPageResources } from "./StatusPageChrome";

export const runtime = "nodejs";
export const dynamic = "force-static";
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Status - cyang.io",
  description:
    "Live service health, availability updates, incident history, and reliability transparency for cyang.io and Doclinks.",
};

export default function StatusPage() {
  return (
    <SiteShell maxWidth="full">
      <StatusPageIntro />
      <div className="mx-auto w-full max-w-[1220px] px-4 pb-10 sm:px-6 lg:px-8">
        <StatusCenterClient />
      </div>
      <StatusPageResources />
    </SiteShell>
  );
}
