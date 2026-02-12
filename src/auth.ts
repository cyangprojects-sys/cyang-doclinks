import NextAuth, { type NextAuthConfig } from "next-auth";

// If you already have providers here, keep them.
// import GitHub from "next-auth/providers/github";

export const authOptions: NextAuthConfig = {
    // providers: [
    //   GitHub({
    //     clientId: process.env.GITHUB_ID!,
    //     clientSecret: process.env.GITHUB_SECRET!,
    //   }),
    // ],

    session: { strategy: "jwt" },

    callbacks: {
        async session({ session, token }) {
            if (session.user) {
                session.user.email = (token.email as string | undefined) ?? session.user.email;
            }
            return session;
        },
    },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authOptions);
