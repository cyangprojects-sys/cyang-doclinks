import NextAuth from "next-auth";
import type { NextAuthConfig } from "next-auth";

// Example provider import (swap to yours)
// import GitHub from "next-auth/providers/github";

const config: NextAuthConfig = {
    // providers: [
    //   GitHub({
    //     clientId: process.env.GITHUB_ID!,
    //     clientSecret: process.env.GITHUB_SECRET!,
    //   }),
    // ],

    session: { strategy: "jwt" },

    // This is the key part: ensure session.user.email exists.
    callbacks: {
        async session({ session, token }) {
            // token.email is usually present when provider supplies email
            if (session.user) {
                session.user.email = (token.email as string | undefined) ?? session.user.email;
            }
            return session;
        },
    },
};

export const { handlers, auth, signIn, signOut } = NextAuth(config);
