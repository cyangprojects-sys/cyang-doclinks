import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role?: "owner" | "admin" | "viewer";
      orgId?: string | null;
      orgSlug?: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    role?: "owner" | "admin" | "viewer";
    orgId?: string | null;
    orgSlug?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: string;
    role?: "owner" | "admin" | "viewer";
    orgId?: string | null;
    orgSlug?: string | null;
  }
}

export {};
