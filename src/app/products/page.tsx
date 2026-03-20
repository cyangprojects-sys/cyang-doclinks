import type { Metadata } from "next";
import { ProductsPageView } from "../components/ProductsPageView";
import { SiteShell } from "../components/SiteShell";

export const revalidate = 900;

export const metadata: Metadata = {
  title: "Products - cyang.io",
  description:
    "Products and systems built by cyang.io, with Doclinks as the flagship and trust-centered software growth as the operating model.",
  alternates: {
    canonical: "/products",
  },
};

export default function ProductsPage() {
  return (
    <SiteShell maxWidth="full">
      <ProductsPageView />
    </SiteShell>
  );
}
