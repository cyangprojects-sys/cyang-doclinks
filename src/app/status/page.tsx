import { SiteShell } from "@/app/components/SiteShell";
import StatusCenterClient from "./StatusCenterClient";
import { StatusPageIntro, StatusPageResources } from "./StatusPageChrome";
import type { Metadata } from "next";

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
      <div className="mx-auto flex w-full max-w-[1700px] flex-col gap-6 px-3 py-8 sm:px-4 lg:px-6">
        <StatusPageIntro />
        <StatusCenterClient />
        <StatusPageResources />
      </div>
    </SiteShell>
  );
}
