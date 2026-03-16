import { permanentRedirect } from "next/navigation";

export const runtime = "nodejs";

export default function PrivacyPage() {
  permanentRedirect("/legal/privacy-policy");
}
