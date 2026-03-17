import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

function src(file: string): string {
  return readFileSync(file, "utf8");
}

test.describe("viewer shell separation", () => {
  test("viewer layout no longer depends on admin shell orchestration", () => {
    const layout = src("src/app/viewer/layout.tsx");
    expect(layout.includes("AdminShell")).toBeFalsy();
    expect(layout.includes("adminNavigation")).toBeFalsy();
    expect(layout.includes("SessionProviders")).toBeFalsy();
    expect(layout.includes("ViewerShell")).toBeTruthy();
    expect(layout.includes("getViewerShellContext")).toBeTruthy();
  });

  test("viewer shell uses viewer-specific navigation", () => {
    const shell = src("src/app/viewer/_components/ViewerShell.tsx");
    expect(shell.includes("VIEWER_NAV_ITEMS")).toBeTruthy();
    expect(shell.includes("AdminShell")).toBeFalsy();
    expect(shell.includes("ADMIN_NAV_GROUPS")).toBeFalsy();
  });
});
