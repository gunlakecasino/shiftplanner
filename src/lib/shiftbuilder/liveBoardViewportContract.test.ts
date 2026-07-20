import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const globalsCss = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");

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
});
