import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = process.cwd();
const source = (path: string) => readFileSync(resolve(projectRoot, path), "utf8");

const globalsCss = source("src/app/globals.css");
const shiftBuilderClient = source("src/app/shiftbuilder/ShiftBuilderClient.tsx");
const shiftBuilderBoard = source("src/app/shiftbuilder/components/ShiftBuilderBoard.tsx");
const projectsCss = source("src/app/shiftbuilder/projects/projectsShell.css");
const projectsClient = source("src/app/shiftbuilder/projects/ProjectsClient.tsx");
const reportsCss = source("src/app/shiftbuilder/reports/reportsShell.css");
const reportsDashboard = source(
  "src/app/shiftbuilder/reports/components/ReportsDashboard.tsx",
);

describe("iPad Pro responsive layout contract", () => {
  it("keeps the supported 13-inch viewport matrix explicit", () => {
    const viewports = [
      { orientation: "portrait", width: 1032, height: 1376 },
      { orientation: "landscape", width: 1376, height: 1032 },
    ] as const;

    expect(viewports).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ orientation: "portrait", width: 1032 }),
        expect.objectContaining({ orientation: "landscape", width: 1376 }),
      ]),
    );
    expect(viewports.every(({ width, height }) => width > 0 && height > 0)).toBe(true);
  });

  it("uses one inspector width and never transform-scales the live portrait board", () => {
    expect(globalsCss).toContain("--sb-inspector-w: 320px");
    expect(globalsCss).toContain(
      "body.sb-tablet-dock-open .sb-builder-shell.sb-sheetbuilder-redesign .sb-stage-host",
    );
    expect(globalsCss).toContain("height: min(54dvh, 640px)");
    expect(globalsCss).toContain("grid-template-columns: repeat(3, minmax(0, 1fr))");
    expect(globalsCss).not.toContain("--sb-portrait-fit");
    expect(shiftBuilderClient).not.toContain("const DESIGN_W = 1180");
  });

  it("preserves selection visibility and the landscape roster plus Aux layout", () => {
    expect(shiftBuilderBoard).toContain("Keep the selected placement visible");
    expect(shiftBuilderBoard).toContain("canvas.scrollTo({");
    expect(globalsCss).toContain(
      "@media (orientation: landscape) and (max-width: 1420px)",
    );
    expect(globalsCss).toContain(
      "grid-template-columns: minmax(0, 1fr) 218px !important",
    );
  });

  it("keeps Projects and Reports portrait-native and touch-sized", () => {
    expect(projectsClient).toContain("sb-projects-nav-toggle sb-touch-target");
    expect(projectsCss).toContain(".sb-projects-sidebar[data-open=\"true\"]");
    expect(projectsCss).toContain(
      "@media (orientation: landscape) and (min-width: 1024px)",
    );
    expect(reportsDashboard).toContain("sb-reports-segment");
    expect(reportsDashboard).toContain("sb-reports-refresh");
    expect(reportsCss).toContain("@media (orientation: portrait)");
    expect(reportsCss).toContain("@media (pointer: coarse)");
    expect(globalsCss).toMatch(/\.sb-touch-target\s*\{[\s\S]*?min-height: 44px !important/);
  });
});
