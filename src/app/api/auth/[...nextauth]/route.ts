import { handlers } from "@/auth";

// Ensure Node.js runtime (OIDC + crypto + DB adapters are more reliable here than Edge)
export const runtime = "nodejs";

export const { GET, POST } = handlers;
