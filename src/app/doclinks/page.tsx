import type { Metadata } from "next";
import { DoclinksPageView } from "../components/DoclinksPageView";
import { SiteShell } from "../components/SiteShell";
import { getPublicRuntimeConfig } from "@/lib/publicRuntimeConfig";

export const revalidate = 900;

export const metadata: Metadata = {
  title: "Doclinks - cyang.io",
  description:
    "Doclinks is controlled document delivery with serve-time access enforcement, scan-gated serving, bounded lifecycle controls, and audit visibility.",
  alternates: {
    canonical: "/doclinks",
  },
};

export default function DoclinksPage() {
  const publicConfig = getPublicRuntimeConfig();

  return (
    <SiteShell maxWidth="full" publicConfig={publicConfig}>
      <DoclinksPageView publicConfig={publicConfig} />
    </SiteShell>
  );
}
