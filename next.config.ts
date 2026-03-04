import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const isProd = process.env.NODE_ENV === "production";

// NOTE: This project serves untrusted viewer traffic.
// We set conservative, production-safe security headers globally.
// If you later embed docs in iframes, you'll need to relax frame-ancestors / X-Frame-Options.

function cspValue(frameAncestors: string) {
  const connectSources = new Set(["'self'"]);

  const keywordSources = new Set([
    "self",
    "none",
    "unsafe-inline",
    "unsafe-eval",
    "strict-dynamic",
    "report-sample",
    "unsafe-hashes",
    "wasm-unsafe-eval",
  ]);

  for (const rawToken of String(process.env.CSP_CONNECT_SRC || "").split(/[\s,]+/)) {
    const token = rawToken.trim();
    if (!token) continue;
    const dequoted = token.replace(/^['"]|['"]$/g, "");
    if (!dequoted) continue;
    const lower = dequoted.toLowerCase();
    if (keywordSources.has(lower)) {
      connectSources.add(`'${lower}'`);
    } else {
      connectSources.add(dequoted);
    }
  }

  const r2Endpoint = String(process.env.R2_ENDPOINT || "").trim();
  if (r2Endpoint) {
    try {
      const endpointUrl = new URL(r2Endpoint);
      connectSources.add(endpointUrl.origin);

      const bucket = String(process.env.R2_BUCKET || process.env.R2_BUCKET_NAME || "").trim();
      if (
        bucket &&
        endpointUrl.hostname.endsWith(".r2.cloudflarestorage.com") &&
        !endpointUrl.hostname.startsWith(`${bucket}.`)
      ) {
        connectSources.add(`${endpointUrl.protocol}//${bucket}.${endpointUrl.hostname}`);
      }
    } catch {
      // Ignore malformed endpoint in CSP assembly; runtime env validation handles required format.
    }
  }

  const connectSrc = `connect-src ${Array.from(connectSources).join(" ")}`;

  // Keep this CSP compatible with Next.js + PDF rendering.
  // Keep script/style sources tight and add explicit hosts via CSP_CONNECT_SRC when needed.
  const scriptSrc = "script-src 'self' 'unsafe-inline'";
  const parts = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    `frame-ancestors ${frameAncestors}`,
    "form-action 'self'",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob:",
    "font-src 'self' data: https:",
    connectSrc,
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
  ];

  // Do not add upgrade-insecure-requests in dev/local.
  if (isProd) parts.push("upgrade-insecure-requests");

  return parts.join("; ");
}

const nextConfig: NextConfig = {
  async headers() {
    const strictHeaders: Array<{ key: string; value: string }> = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
      },
      { key: "Content-Security-Policy", value: cspValue("'none'") },
    ];

    // The doc viewer embeds /serve/* in an iframe on first-party pages.
    // Also, some first-party/admin UX may iframe /d/* (preview panes, etc.).
    // Allow SAMEORIGIN framing for viewer surfaces only.
    const serveHeaders: Array<{ key: string; value: string }> = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
      },
      { key: "Content-Security-Policy", value: cspValue("'self'") },
    ];

    if (isProd) {
      // 2 years, preload-ready.
      strictHeaders.push({
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      });
      serveHeaders.push({
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      });
}

    return [
      {
        source: "/serve/:path*",
        headers: serveHeaders,
      },
      {
        // Share viewer page (contains iframe -> /serve/*). Must be allowed to be framed by first-party.
        // This prevents Firefox from blocking when /d/* is shown inside an iframe (admin previews, etc.).
        source: "/d/:path*",
        headers: serveHeaders,
      },
      {
        // Access ticket exchange/stream endpoints may be opened in embedded contexts (e.g., in-app previews).
        // Keep them SAMEORIGIN-framable.
        source: "/t/:path*",
        headers: serveHeaders,
      },
      {
        // Everything else is locked down against framing.
        source: "/((?!serve|d|t).*)",
        headers: strictHeaders,
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
});
