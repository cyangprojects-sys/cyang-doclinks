import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

function src(path: string): string {
  return readFileSync(path, "utf8");
}

test.describe("public redirect base URL guardrails", () => {
  test("public redirect routes do not derive absolute redirect host from req.url", () => {
    const shareDownload = src("src/app/s/[token]/download/route.ts");
    expect(shareDownload.includes("resolvePublicAppBaseUrl(req.url)")).toBeTruthy();
    expect(shareDownload.includes("new URL(`/s/${encodeURIComponent(t)}/raw`, req.url)")).toBeFalsy();

    const shareRaw = src("src/app/s/[token]/raw/route.ts");
    expect(shareRaw.includes("resolvePublicAppBaseUrl(req.url)")).toBeTruthy();
    expect(shareRaw.includes("new URL(`/s/${token}`, req.url)")).toBeFalsy();
    expect(shareRaw.includes("Location: new URL(`/t/${ticketId}`, req.url).toString()")).toBeFalsy();

    const aliasRaw = src("src/app/d/[alias]/raw/route.ts");
    expect(aliasRaw.includes("resolvePublicAppBaseUrl(req.url)")).toBeTruthy();
    expect(aliasRaw.includes("Location: new URL(`/t/${ticketId}`, req.url).toString()")).toBeFalsy();

    const serve = src("src/app/serve/[docId]/route.ts");
    expect(serve.includes("resolvePublicAppBaseUrl(req.url)")).toBeTruthy();
    expect(serve.includes("Location: new URL(`/t/${ticketId}`, req.url).toString()")).toBeFalsy();
  });
});
