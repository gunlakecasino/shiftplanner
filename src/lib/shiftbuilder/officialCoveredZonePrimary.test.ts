import React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GoldenZoneCard } from "@/app/shiftbuilder/print/GoldenPrintComponents";
import { OfficialGravesDeploymentPage } from "@/app/shiftbuilder/print/OfficialGravesPrintPages";
import type { PrintDaySnapshot } from "@/app/shiftbuilder/print/printPreviewTypes";
import { buildDayDefs } from "./dateUtils";
import type { NightSlotTask } from "./data";
import { formatSecondaryZonePrimaryLabel } from "./coverageHelpers";

function task(
  id: string,
  slotKey: string,
  taskLabel: string,
  isCoverage = false,
): NightSlotTask {
  return {
    id,
    nightId: "night-1",
    slotKey,
    slotType: "zone",
    rrSide: null,
    taskLabel,
    catalogTaskId: null,
    sortOrder: 0,
    color: null,
    isCoverage,
  };
}

function renderKathyCoverage(): string {
  const friday = new Date(2026, 6, 24);
  const days = buildDayDefs(friday, friday);
  const snapshot: PrintDaySnapshot = {
    dayIndex: 0,
    day: days[0],
    assignments: {
      Z5: { tmId: "kathy", tmName: "Kathy", breakGroup: 3 },
    },
    tasksBySlot: {
      Z3: [task("z3-task", "Z3", "Beverage Station")],
      Z5: [task("z5-coverage", "Z5", "And Zone 3", true)],
    },
    auxDefs: [],
    amOverlapDayName: "Saturday",
    amOverlapDateNum: 25,
    nextDayColor: days[1].color,
    breakCounts: { 1: 0, 2: 0, 3: 1, 4: 0 },
  };

  return renderToStaticMarkup(
    React.createElement(OfficialGravesDeploymentPage, {
      snapshot,
      weekDayDefs: days,
      includeTimestamp: false,
    }),
  );
}

describe("covered secondary-zone primary context", () => {
  it("formats only direct zone-to-zone coverage", () => {
    expect(formatSecondaryZonePrimaryLabel("Z3", "Z5")).toBe("AND ZONE 5");
    expect(formatSecondaryZonePrimaryLabel("zone_3", "zone_5")).toBe(
      "AND ZONE 5",
    );
    expect(formatSecondaryZonePrimaryLabel("Z3", "MRR6")).toBeNull();
    expect(formatSecondaryZonePrimaryLabel("MRR3", "Z5")).toBeNull();
    expect(formatSecondaryZonePrimaryLabel("Z3", "Z9SR")).toBeNull();
  });

  it("prints the primary zone beside Kathy on the covered Zone 3 card", () => {
    const html = renderKathyCoverage();

    expect(html).toMatch(/sb-approved-assignment-card[^"]*is-covered/);
    expect(html).toContain(
      '<span>Kathy</span><span class="sb-approved-card-primary-zone">AND ZONE 5</span>',
    );
    expect(html).toContain("- Beverage Station");
    expect(html.match(/AND ZONE 5/g)).toHaveLength(1);
  });

  it("uses the same inline context in the planning print card", () => {
    const html = renderToStaticMarkup(
      React.createElement(GoldenZoneCard, {
        slotKey: "Z3",
        tasks: [{ id: "z3-task", label: "Beverage Station" }],
        empty: true,
        coveredBy: [
          {
            tmName: "Kathy",
            tmId: "kathy",
            sourceKey: "Z5",
            taskLabel: "And Zone 3",
          },
        ],
      }),
    );

    expect(html).toContain(
      '<span class="sb-golden-covered-zone-name">Kathy</span><span class="sb-golden-covered-zone-primary">AND ZONE 5</span>',
    );
    expect(html).toContain("covered sb-card-covered");
    expect(html).toContain("text-[#111827]");
  });

  it("keeps preview and exported-PDF styling identical", () => {
    const sourceCss = readFileSync(
      join(
        process.cwd(),
        "src/app/shiftbuilder/print/printPreview.css",
      ),
      "utf8",
    );
    const exportCss = readFileSync(
      join(process.cwd(), "public/shiftbuilder-print-preview.css"),
      "utf8",
    );

    expect(exportCss).toBe(sourceCss);
    expect(exportCss).toContain(".sb-golden-covered-zone-primary");
    expect(exportCss).toContain(".sb-approved-card-primary-zone");
    expect(exportCss).toContain(
      ".sb-approved-assignment-card.is-covered .sb-approved-card-accent",
    );
    expect(exportCss).toContain(
      ".print-artboard .sb-assignment-card.sb-card-covered",
    );
    expect(exportCss).toMatch(
      /\.sb-approved-assignment-card\.is-covered \.sb-approved-card-tasks \{\s+color: #111827;/,
    );
  });
});
