import { permanentRedirect } from "next/navigation";

export const runtime = "nodejs";

export default function TermsPage() {
  permanentRedirect("/legal/terms-of-service");
}
