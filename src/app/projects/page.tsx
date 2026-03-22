import type { Metadata } from "next";
import { ProductsPageView } from "../components/ProductsPageView";
import { SiteShell } from "../components/SiteShell";
import { getPublicRuntimeConfig } from "@/lib/publicRuntimeConfig";

export const revalidate = 900;

export const metadata: Metadata = {
  title: "Products - cyang.io",
  description:
    "Products and systems built by cyang.io, with Doclinks as the flagship and trust-centered software growth as the operating model.",
  alternates: {
    canonical: "/products",
  },
};

export default function ProjectsPage() {
  const publicConfig = getPublicRuntimeConfig();
  return (
    <SiteShell maxWidth="full" publicConfig={publicConfig}>
      <ProductsPageView publicConfig={publicConfig} />
    </SiteShell>
  );
}
