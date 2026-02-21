/// <reference types="next" />
/// <reference types="next/image-types/global" />

// NOTE: This file is required for Next.js + TypeScript projects.
// It is also a convenient place to augment NextAuth types used throughout the app.

import type { Role } from "@/lib/authz";

declare module "next-auth" {
  interface Session {
    user?: {
      name?: string | null;
      email?: string | null;
      image?: string | null;

      /** Convenience fields populated by auth.ts callbacks (JWT strategy). */
      id?: string | null;
      role?: Role | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: string | null;
    role?: Role | null;
  }
}
