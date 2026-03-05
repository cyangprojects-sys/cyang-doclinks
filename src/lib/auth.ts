import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { requireRole } from "@/lib/authz";

function normalizeSessionEmail(value: unknown): string | null {
    const raw = String(value || "").trim().toLowerCase();
    if (!raw || raw.length > 320 || /[\r\n\0]/.test(raw)) return null;
    return raw;
}

// Legacy helper; kept for compatibility.
// Requires at least "admin".
export async function requireOwner() {
    await requireRole("admin");
    const session = await getServerSession(authOptions);
    if (!normalizeSessionEmail(session?.user?.email)) throw new Error("UNAUTHENTICATED");
    return session;
}
