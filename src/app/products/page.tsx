import { permanentRedirect } from "next/navigation";

export const runtime = "nodejs";

export default function ProductsAliasPage() {
  permanentRedirect("/projects");
}
