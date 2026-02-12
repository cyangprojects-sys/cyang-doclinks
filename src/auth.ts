// src/auth.ts
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

const ownerEmail = (process.env.OWNER_EMAIL || "").toLowerCase().trim();

export const { handlers, auth, signIn, signOut } = NextAuth({
    session: { strategy: "jwt" },

    providers: [
        Google({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        }),
    ],

    pages: {
        signIn: "/login",
    },

    callbacks: {
        async signIn({ user }) {
            const email = (user.email || "").toLowerCase().trim();
            if (!ownerEmail) return false; // fail closed if not configured
            return email === ownerEmail;
        },
    },
});
