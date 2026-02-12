import type { NextAuthOptions } from "next-auth";

// If you already have providers, import + use them here.
// Example:
// import GitHubProvider from "next-auth/providers/github";

export const authOptions: NextAuthOptions = {
    // ✅ Required by your installed types
    providers: [
        // Add your real providers here.
        // GitHubProvider({
        //   clientId: process.env.GITHUB_ID!,
        //   clientSecret: process.env.GITHUB_SECRET!,
        // }),
    ],

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
