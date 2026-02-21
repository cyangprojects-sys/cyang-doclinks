import { handlers } from "@/auth";

// App Router route handlers for NextAuth/Auth.js
export const { GET, POST } = handlers;

// Ensure this runs on Node (not Edge) to avoid subtle crypto/provider issues.
export const runtime = "nodejs";
