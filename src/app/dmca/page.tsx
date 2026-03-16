import { permanentRedirect } from "next/navigation";

export const runtime = "nodejs";

export default function DmcaPage() {
  permanentRedirect("/legal/dmca-policy");
}
