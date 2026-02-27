import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const PAGES = ["/", "/projects", "/projects/doclinks", "/about", "/privacy", "/terms", "/login", "/report"];

for (const path of PAGES) {
  test(`axe: ${path}`, async ({ page }) => {
    await page.goto(path, { waitUntil: "networkidle" });

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();

    const summary = accessibilityScanResults.violations
      .map((v) => `${v.id}: ${v.help} (${v.nodes.length} nodes)`)
      .join("\n");

    expect(accessibilityScanResults.violations, summary).toEqual([]);
  });
}

