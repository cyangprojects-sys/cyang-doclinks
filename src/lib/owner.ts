import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";

export async function requireOwner() {
    const session = (await getServerSession(authOptions)) as any;
    const email = (session?.user?.email as string | undefined) ?? null;

    if (!email) return { ok: false as const, reason: "UNAUTHENTICATED" as const };

    const owner = (process.env.OWNER_EMAIL || "").toLowerCase();
    if (!owner) throw new Error("Missing OWNER_EMAIL");

    if (email.toLowerCase() !== owner) {
        return { ok: false as const, reason: "FORBIDDEN" as const };
    }

    return { ok: true as const, email };
}
