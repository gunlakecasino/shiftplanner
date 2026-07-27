import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OfficialGravesDeploymentPage } from "@/app/shiftbuilder/print/OfficialGravesPrintPages";
import {
  asOfTimestampTone,
  operationalShiftDateKey,
} from "@/app/shiftbuilder/print/AsOfTimestamp";
import { buildDayDefs } from "./dateUtils";
import type { PrintDaySnapshot } from "@/app/shiftbuilder/print/printPreviewTypes";

function renderHeader(
  includeTimestamp: boolean,
  printedAt = "2026-07-18T03:30:00-04:00",
): string {
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
      printedAt,
      includeTimestamp,
    }),
  );
}

describe("Official Graves print timestamp", () => {
  it("renders the refined date-led stamp when enabled", () => {
    const html = renderHeader(true);
    expect(html).toContain("sb-as-of-timestamp is-current sb-approved-as-of");
    expect(html).toContain('data-timestamp-tone="current"');
    expect(html).toContain("AS OF SAT");
    expect(html).toContain("JUL 18");
    expect(html).toContain("3:30");
    expect(html).toContain("AM");
    expect(html).toContain("EDT");
  });

  it("removes the complete stamp when disabled", () => {
    const html = renderHeader(false);
    expect(html).not.toContain("sb-as-of-timestamp");
  });

  it("uses the muted advance state when printing a future shift", () => {
    const html = renderHeader(true, "2026-07-17T03:30:00-04:00");
    expect(html).toContain('data-timestamp-tone="advance"');
    expect(html).not.toContain("is-current");
  });

  it("honors the 8:30 AM grave-shift rollover", () => {
    expect(operationalShiftDateKey("2026-07-18T08:29:00-04:00")).toBe(
      "2026-07-17",
    );
    expect(operationalShiftDateKey("2026-07-18T08:30:00-04:00")).toBe(
      "2026-07-18",
    );
  });

  it("distinguishes current, advance, and past selected shifts", () => {
    const friday = { dateNum: 17, monthYear: "July 2026" };
    expect(asOfTimestampTone(friday, "2026-07-18T03:30:00-04:00")).toBe(
      "current",
    );
    expect(asOfTimestampTone(friday, "2026-07-17T03:30:00-04:00")).toBe(
      "advance",
    );
    expect(asOfTimestampTone(friday, "2026-07-19T03:30:00-04:00")).toBe(
      "past",
    );
  });
});
