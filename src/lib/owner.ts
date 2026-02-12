import { auth } from "@/auth";

export async function requireOwner() {
    const session = await auth();
    const email = session?.user?.email || null;

    if (!email) return { ok: false as const, reason: "UNAUTHENTICATED" as const };

    const owner = (process.env.OWNER_EMAIL || "").toLowerCase();
    if (!owner) throw new Error("Missing OWNER_EMAIL");

    if (email.toLowerCase() !== owner) {
        return { ok: false as const, reason: "FORBIDDEN" as const };
    }

    return { ok: true as const, email };
}
