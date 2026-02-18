// src/lib/admin.ts
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";

export async function getOwnerEmail(): Promise<string> {
    const owner = (process.env.OWNER_EMAIL || "").toLowerCase().trim();
    if (!owner) throw new Error("Missing OWNER_EMAIL");
    return owner;
}

export async function isOwnerAdmin(): Promise<boolean> {
    const session = (await getServerSession(authOptions)) as any;
    const email = (session?.user?.email as string | undefined) ?? "";
    if (!email) return false;

    const owner = await getOwnerEmail();
    return email.toLowerCase() === owner;
}

// Throws on fail (use inside Server Actions / routes)
export async function requireOwnerAdmin(): Promise<string> {
    const session = (await getServerSession(authOptions)) as any;
    const email = (session?.user?.email as string | undefined) ?? null;

    if (!email) throw new Error("Unauthorized.");

    const owner = await getOwnerEmail();
    if (email.toLowerCase() !== owner) throw new Error("Forbidden.");

    return email;
}
