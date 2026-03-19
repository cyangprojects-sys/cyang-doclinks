import type { PublicRuntimeConfig } from "@/lib/publicRuntimeConfig";
import SiteHeaderClient from "./SiteHeaderClient";

export function SiteHeader({ config }: { config: PublicRuntimeConfig }) {
  return <SiteHeaderClient config={config} />;
}
