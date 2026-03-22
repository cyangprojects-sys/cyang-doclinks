import type { Metadata } from "next";
import { DoclinksPageView } from "../../components/DoclinksPageView";
import { SiteShell } from "../../components/SiteShell";
import { getPublicRuntimeConfig } from "@/lib/publicRuntimeConfig";

export const revalidate = 900;

export const metadata: Metadata = {
  title: "Doclinks - cyang.io",
  description:
    "Doclinks helps teams securely share sensitive documents with protected links, access controls, lifecycle limits, and visibility after send.",
  alternates: {
    canonical: "/doclinks",
  },
};

export default function LegacyDoclinksPage() {
  const publicConfig = getPublicRuntimeConfig();

  return (
    <SiteShell maxWidth="full" publicConfig={publicConfig}>
      <DoclinksPageView publicConfig={publicConfig} />
    </SiteShell>
  );
}
