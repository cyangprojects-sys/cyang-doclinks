import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { requireRole } from "@/lib/authz";

// Legacy helper; kept for compatibility.
// Requires at least "admin".
export async function requireOwner() {
    await requireRole("admin");
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) throw new Error("UNAUTHENTICATED");
    return session;
}
