import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";

export async function requireOwner() {
    const owner = (process.env.OWNER_EMAIL || "").trim().toLowerCase();
    if (!owner) throw new Error("Missing OWNER_EMAIL");

    const session = await getServerSession(authOptions);
    const email = (session?.user?.email || "").trim().toLowerCase();

    if (!email) throw new Error("UNAUTHENTICATED");
    if (email !== owner) throw new Error("FORBIDDEN");

    return session;
}
