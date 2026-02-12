// src/auth.ts
import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

function parseOwnerEmails() {
    const raw = process.env.OWNER_EMAILS ?? process.env.OWNER_EMAIL ?? "";
    return raw
        .split(/[, \n\r\t]+/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
}

const OWNER_EMAILS = parseOwnerEmails();

export const authOptions: NextAuthOptions = {
    providers: [
        GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID || "",
            clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
        }),
    ],

    callbacks: {
        async signIn({ user }) {
            const email = (user.email || "").toLowerCase();
            return OWNER_EMAILS.includes(email);
        },
    },
};
