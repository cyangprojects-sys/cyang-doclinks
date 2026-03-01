// src/app/login/page.tsx
"use client";

import { signIn } from "next-auth/react";
import Link from "next/link";

export default function LoginPage() {
    return (
        <main className="min-h-screen bg-black text-white">
            <div className="mx-auto max-w-md px-6 py-16">
                <div className="rounded-3xl bg-white/5 p-8 ring-1 ring-white/10">
                    <div className="text-xs text-white/60">cyang.io</div>
                    <h1 className="mt-2 text-2xl font-semibold">Sign in</h1>
                    <p className="mt-2 text-sm text-white/70">
                        Access the controlled document delivery console.
                        <span className="ml-1 text-white/60">(Enterprise SSO appears only if configured.)</span>
                    </p>

                    <button
                        onClick={() => signIn("google", { callbackUrl: "/admin" })}
                        className="mt-6 w-full rounded-2xl bg-white px-5 py-3 text-sm font-medium text-black hover:bg-white/90"
                    >
                        Sign in with Google
                    </button>

<button
    onClick={() => signIn("enterprise-oidc", { callbackUrl: "/admin" })}
    className="mt-3 w-full rounded-2xl bg-white/10 px-5 py-3 text-sm font-medium text-white hover:bg-white/15"
>
    Sign in with Enterprise SSO
</button>

                    <div className="mt-6 text-xs text-white/50">
                        <p>
                            Access is restricted by policy and role.
                        </p>
                        <p className="mt-2">
                            <Link href="/" className="text-white/70 hover:underline">
                                Back to home
                            </Link>
                        </p>
                    </div>
                </div>
            </div>
        </main>
    );
}
