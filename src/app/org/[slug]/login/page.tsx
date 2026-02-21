// src/app/org/[slug]/login/page.tsx
import Link from "next/link";

import { getOrgBySlug } from "@/lib/orgs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function OrgLoginPage({ params }: { params: { slug: string } }) {
  const slug = String(params?.slug || "").trim().toLowerCase();
  const org = await getOrgBySlug(slug);

  if (!org) {
    return (
      <main className="min-h-screen bg-black text-white">
        <div className="mx-auto max-w-md px-6 py-16">
          <div className="rounded-3xl bg-white/5 p-8 ring-1 ring-white/10">
            <div className="text-xs text-white/60">cyang.io</div>
            <h1 className="mt-2 text-2xl font-semibold">Organization not found</h1>
            <p className="mt-2 text-sm text-white/70">
              No organization exists for <span className="font-mono text-white">{slug}</span>.
            </p>
            <p className="mt-6 text-xs text-white/50">
              <Link href="/" className="text-white/70 hover:underline">
                Back to home
              </Link>
            </p>
          </div>
        </div>
      </main>
    );
  }

  const showEnterprise = org.oidcEnabled && !!org.oidcIssuer && !!org.oidcClientId && !!org.oidcClientSecretEnc;

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-md px-6 py-16">
        <div className="rounded-3xl bg-white/5 p-8 ring-1 ring-white/10">
          <div className="text-xs text-white/60">cyang.io</div>
          <h1 className="mt-2 text-2xl font-semibold">
            Sign in to {org.name ?? org.slug}
          </h1>
          <p className="mt-2 text-sm text-white/70">
            Tenant login: <span className="font-mono text-white/90">{org.slug}</span>
          </p>

          <a
            href={`/org/${org.slug}/auth/google`}
            className="mt-6 block w-full rounded-2xl bg-white px-5 py-3 text-center text-sm font-medium text-black hover:bg-white/90"
          >
            Sign in with Google
          </a>

          <a
            href={`/org/${org.slug}/auth/enterprise-oidc`}
            className={`mt-3 block w-full rounded-2xl px-5 py-3 text-center text-sm font-medium ${
              showEnterprise ? "bg-white/10 text-white hover:bg-white/15" : "bg-white/5 text-white/30 cursor-not-allowed"
            }`}
            aria-disabled={!showEnterprise}
          >
            Sign in with Enterprise SSO
          </a>

          {!showEnterprise ? (
            <p className="mt-3 text-xs text-white/50">
              Enterprise SSO isn’t enabled for this organization yet.
            </p>
          ) : null}

          <div className="mt-6 text-xs text-white/50">
            <p>
              Need access? Contact your organization admin.
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
