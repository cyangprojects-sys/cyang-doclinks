import { permanentRedirect } from "next/navigation";

export const runtime = "nodejs";

export default function AcceptableUsePage() {
  permanentRedirect("/legal/acceptable-use-policy");
}
