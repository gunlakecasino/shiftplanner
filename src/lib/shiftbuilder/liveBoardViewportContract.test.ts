import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const globalsCss = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
const shiftBuilderClient = readFileSync(
  resolve(process.cwd(), "src/app/shiftbuilder/ShiftBuilderClient.tsx"),
  "utf8",
);
const shiftBuilderBoard = readFileSync(
  resolve(process.cwd(), "src/app/shiftbuilder/components/ShiftBuilderBoard.tsx"),
  "utf8",
);
const floatingNav = readFileSync(
  resolve(process.cwd(), "src/app/shiftbuilder/components/FloatingNav.tsx"),
  "utf8",
);
const settingsConfig = readFileSync(
  resolve(process.cwd(), "src/app/shiftbuilder/settings/settingsConfig.ts"),
  "utf8",
);
const middleware = readFileSync(resolve(process.cwd(), "src/middleware.ts"), "utf8");

describe("live board short-landscape viewport contract", () => {
  const compactStart = globalsCss.indexOf("/* Short landscape boards must fit");
  const compactEnd = globalsCss.indexOf("/* ==========================================================================\n   iPad Pro", compactStart);
  const compactCss = globalsCss.slice(compactStart, compactEnd);

  it("uses bounded card tracks so task content cannot push overlaps below the board", () => {
    expect(compactStart).toBeGreaterThan(-1);
    expect(compactEnd).toBeGreaterThan(compactStart);
    expect(compactCss).toContain("(max-height: 1300px)");
    expect(compactCss).toContain("grid-auto-rows: 132px !important");
    expect(compactCss).toContain("grid-auto-rows: 252px !important");
    expect(compactCss).toContain("grid-auto-rows: 96px !important");
    expect(compactCss).not.toContain("minmax(148px, auto)");
    expect(compactCss).not.toContain("minmax(262px, auto)");
    expect(compactCss).not.toContain("minmax(108px, auto)");
  });

  it("keeps the canvas as a vertical-scroll fallback", () => {
    const landscapeStart = globalsCss.indexOf("@media (orientation: landscape)");
    const landscapeCss = globalsCss.slice(landscapeStart, compactStart);

    expect(landscapeStart).toBeGreaterThan(-1);
    expect(landscapeCss).toContain("overflow-y: auto !important");
  });

  it("allows desktop wheel input to reach the board scroll owner", () => {
    expect(shiftBuilderClient).not.toContain('addEventListener("wheel"');
  });

  it("temporarily hides the rotation floater and the header Run Day action", () => {
    expect(shiftBuilderBoard).not.toContain("<RotationHealthFloater");
    expect(floatingNav).not.toContain("sb-run-day-btn");
  });
});

describe("SheetBuilder chrome slim (PR A)", () => {
  it("launchpad advertises Home / Team / Settings only", () => {
    expect(floatingNav).toContain("<strong>Home</strong>");
    expect(floatingNav).toContain("<strong>Team</strong>");
    expect(floatingNav).toContain("<strong>Settings</strong>");
    expect(floatingNav).not.toContain("<strong>Reports</strong>");
    expect(floatingNav).not.toContain("<strong>Projects</strong>");
  });

  it("More menu keeps the canvas loop and drops retired chrome", () => {
    expect(floatingNav).toContain("Run Day Placements");
    expect(floatingNav).toContain("Apply to Live");
    expect(floatingNav).toContain("Discard Draft");
    expect(floatingNav).toContain("Graves Schedule");
    expect(floatingNav).toContain("Refresh Day");
    expect(floatingNav).toContain("Clear Day");
    expect(floatingNav).toContain("View Print Preview");
    expect(floatingNav).not.toContain(">Optimize Week<");
    expect(floatingNav).not.toContain("Grave Cover Guide");
    expect(floatingNav).not.toContain("Weekly View");
    expect(floatingNav).not.toContain("Week Health");
    expect(floatingNav).not.toContain("Request Work");
  });

  it("does not mount Timefold on the canvas client", () => {
    expect(shiftBuilderClient).not.toContain("TimefoldResultsSheet");
    expect(shiftBuilderClient).not.toContain("useTimefoldOptimize");
    expect(shiftBuilderClient).not.toContain("timefoldSheetOpen");
  });

  it("drops Batch Planner from settings tabs and redirects the legacy query", () => {
    expect(settingsConfig).not.toContain('id: "planner"');
    expect(settingsConfig).toContain("planner: \"engine\"");
    expect(settingsConfig).toContain('label: "Card Defaults"');
    expect(settingsConfig).toContain('label: "Engine Config"');
    expect(settingsConfig).toContain('label: "Users"');
    expect(settingsConfig).toContain('label: "Audit Log"');
  });

  it("prod-redirects /sheetbuilder/ai and /sheetbuilder/dev the same way as /shiftbuilder/ai", () => {
    expect(middleware).toContain('url.pathname.startsWith("/sheetbuilder/dev")');
    expect(middleware).toContain('url.pathname === "/sheetbuilder/ai"');
    expect(middleware).toContain('url.pathname === "/shiftbuilder/ai"');
  });
});
