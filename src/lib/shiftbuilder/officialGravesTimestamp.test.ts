import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OfficialGravesDeploymentPage } from "@/app/shiftbuilder/print/OfficialGravesPrintPages";
import { buildDayDefs } from "./dateUtils";
import type { PrintDaySnapshot } from "@/app/shiftbuilder/print/printPreviewTypes";

function renderHeader(includeTimestamp: boolean): string {
  const friday = new Date(2026, 6, 17);
  const days = buildDayDefs(friday, friday);
  const snapshot: PrintDaySnapshot = {
    dayIndex: 0,
    day: days[0],
    assignments: {},
    tasksBySlot: {},
    auxDefs: [],
    amOverlapDayName: "Saturday",
    amOverlapDateNum: 18,
    nextDayColor: days[1].color,
    breakCounts: { 1: 0, 2: 0, 3: 0, 4: 0 },
  };

  return renderToStaticMarkup(
    React.createElement(OfficialGravesDeploymentPage, {
      snapshot,
      weekDayDefs: days,
      printedAt: "2026-07-20T03:30:00-04:00",
      includeTimestamp,
    }),
  );
}

describe("Official Graves print timestamp", () => {
  it("renders the complete stamp when enabled", () => {
    const html = renderHeader(true);
    expect(html).toContain('class="sb-approved-as-of"');
    expect(html).toContain("AS OF");
    expect(html).toContain("JUL 20 - 3:30 AM");
  });

  it("removes the complete stamp when disabled", () => {
    const html = renderHeader(false);
    expect(html).not.toContain('class="sb-approved-as-of"');
    expect(html).not.toContain("AS OF");
  });
});
