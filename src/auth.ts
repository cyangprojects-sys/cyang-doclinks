import NextAuth from "next-auth";

// Keep your existing providers here (unchanged).
// Example:
// import GitHub from "next-auth/providers/github";

// Back-compat: older code imports { authOptions } from "@/auth"
export const authOptions: any = {
    // providers: [
    //   GitHub({
    //     clientId: process.env.GITHUB_ID!,
    //     clientSecret: process.env.GITHUB_SECRET!,
    //   }),
    // ],

    session: { strategy: "jwt" },

    callbacks: {
        async session({ session, token }: any) {
            if (session?.user) {
                session.user.email = token?.email ?? session.user.email;
            }
            return session;
        },
    },
};

// Auth.js v5-style exports (what we're using elsewhere)
export const { handlers, auth, signIn, signOut } = NextAuth(authOptions);
