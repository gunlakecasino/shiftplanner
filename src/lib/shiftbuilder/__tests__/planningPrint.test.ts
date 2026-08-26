import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PrintPreviewPage } from "@/app/shiftbuilder/print/PrintPreviewPage";
import { hydratePrintPlacementTrails } from "@/app/shiftbuilder/print/buildPrintDaySnapshot";
import {
  applyPrintRoleDefaults,
  tonightPlanningPrintConfig,
} from "@/app/shiftbuilder/print/printConfigUtils";
import type { PrintDaySnapshot } from "@/app/shiftbuilder/print/printPreviewTypes";
import type { DayDef } from "@/lib/shiftbuilder/dateUtils";
import type { NightSlotTask, ZoneDetailEntry } from "@/lib/shiftbuilder/data";

const day: DayDef = {
  index: 0,
  name: "Friday",
  short: "Fri",
  dateNum: 14,
  monthYear: "August 2026",
  color: "#c43b18",
  meta: "11p – 7a",
  date: new Date(2026, 7, 14, 12),
  isToday: false,
};

function task(id: string, taskLabel: string, sortOrder: number): NightSlotTask {
  return {
    id,
    nightId: "night",
    slotKey: "zone_5",
    slotType: "zone",
    rrSide: null,
    taskLabel,
    catalogTaskId: null,
    sortOrder,
    color: null,
    markerType: null,
    textStyle: null,
    isCoverage: false,
  };
}

function snapshot(): PrintDaySnapshot {
  const zoneFiveTasks = [
    "Chill Bar: Bartop Machines",
    "Promo Stage",
    "Team Member Hallway",
    "Locker Rooms",
    "Restroom",
    "Smoking Room",
    "High Limit Table Games",
    "Red Tray Carts",
    "Vacuum",
    "Trash",
  ].map((label, index) => task(`task-${index}`, label, index));

  return {
    dayIndex: 0,
    day,
    assignments: {
      Z5: { tmId: "tm-jack", tmName: "Jack", breakGroup: 2 },
      MRR8: { tmId: "tm-rr", tmName: "Morgan", breakGroup: 3 },
      TR1: { tmId: "tm-trash", tmName: "Taylor", breakGroup: 1 },
      "OL-PM-0": { tmId: "tm-overlap", tmName: "Alex", breakGroup: 4 },
    },
    tasksBySlot: {
      Z5: zoneFiveTasks,
      "OL-PM-0": [task("overlap-task", "Tables and Restrooms", 0)],
    },
    auxDefs: [
      { key: "TR1", role: "trash", label: "TRASH 1", locations: ["Trash"] },
    ],
    amOverlapDayName: "Saturday",
    amOverlapDateNum: 15,
    nextDayColor: "#006ec8",
    breakCounts: { 1: 0, 2: 1, 3: 0, 4: 0 },
    notes: "Saved shift note should not print in the writing grid.",
    placementTrailsByTmId: {
      "tm-jack": ["Z5", "RR8M", "ADMIN"],
      "tm-rr": ["RR8M", "Z2", "SUP1"],
      "tm-trash": ["TSH1", "Z4", "RR7W"],
      "tm-overlap": ["Z6", "RR7W", "Z9SR"],
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("planning worksheet print", () => {
  it("removes the alert, prints the TM trail, and omits default task lists", () => {
    const html = renderToStaticMarkup(
      React.createElement(PrintPreviewPage, {
        view: "deployment",
        snapshot: snapshot(),
        weekDayDefs: [day],
        printVariant: "planning",
      }),
    );
    const secondPageHtml = renderToStaticMarkup(
      React.createElement(PrintPreviewPage, {
        view: "breaks",
        snapshot: snapshot(),
        weekDayDefs: [day],
        printVariant: "planning",
      }),
    );

    expect(html).not.toContain("Not For Floor Distribution");
    expect(secondPageHtml).not.toContain("Shift Planning Notes");
    expect(secondPageHtml).not.toContain("golden-planning-notes-panel-title");
    expect(secondPageHtml).toContain(">Notes<");
    expect(secondPageHtml).not.toContain("Saved shift note should not print");
    expect(secondPageHtml).toContain("Alex");
    expect(secondPageHtml).not.toContain("Recent placements: Z6, RR7W, Z9SR");
    expect(secondPageHtml).toContain(
      'class="sb-golden-placement-trail-item is-repeat" data-placement-repeat="true">TSH1</span>',
    );
    expect(html).toContain("sb-golden-placement-trail");
    expect(html).toContain("Z5");
    expect(html).toContain("RR8M");
    expect(html).toContain("ADMIN");
    expect(html).toContain(
      'class="sb-golden-placement-trail-item is-repeat" data-placement-repeat="true">Z5</span>',
    );
    expect(html).toContain(
      'class="sb-golden-placement-trail-item">RR8M</span>',
    );
    expect(html).toContain(
      'class="sb-golden-placement-trail-item is-repeat" data-placement-repeat="true">RR8M</span>',
    );
    expect(html).not.toContain("sb-golden-subtask-row");
    expect(html).not.toContain("Red Tray Carts");
    expect(html).not.toContain("Vacuum");
    expect(html).not.toContain("Chill Bar: Bartop Machines");
    expect(html).toContain("Jack");
    expect(html).toContain("Morgan");
  });

  it("replaces the official page-two projects register with the writing grid", () => {
    const html = renderToStaticMarkup(
      React.createElement(PrintPreviewPage, {
        view: "breaks",
        snapshot: snapshot(),
        weekDayDefs: [day],
        printVariant: "official",
      }),
    );

    expect(html).not.toContain("SIDE TASKS / PROJECTS");
    expect(html).not.toContain("sb-side-task-register");
    expect(html).toContain("sb-official-notes-projects-events");
    expect(html).toContain(">Notes<");
    expect(html).toContain(">Projects<");
    expect(html).not.toContain("/drop-zones/");
    expect(html).toContain(">Events<");
    expect(html).not.toContain("Saved shift note should not print");
  });

  it("puts the DROP ZONES card beside the official AUX grid on page 1", () => {
    const html = renderToStaticMarkup(
      React.createElement(PrintPreviewPage, {
        view: "deployment",
        snapshot: snapshot(),
        weekDayDefs: [day],
        printVariant: "official",
      }),
    );

    expect(html).toContain("sb-approved-drop-zones-slot");
    expect(html).toContain("/drop-zones/dropZoneBox.svg");
    expect(html).not.toContain("/drop-zones/dz03.svg");
    expect(html).not.toContain("/drop-zones/dz05.svg");
    expect(html).not.toContain("/drop-zones/dz08.svg");
    expect(html).not.toContain("/drop-zones/dz10.svg");
    expect(html).not.toContain("sb-side-task-summary-blank-row");
  });

  it("defaults sudo-admin print commands to no timestamp", () => {
    const base = tonightPlanningPrintConfig(0);

    expect(applyPrintRoleDefaults(base, true).includeTimestamp).toBe(false);
    expect(applyPrintRoleDefaults(base, false).includeTimestamp).toBe(true);
  });

  it("anchors the history read to the planned night and keeps five newest placements", async () => {
    const history: ZoneDetailEntry = {
      tmId: "tm-jack",
      tmName: "Jack",
      zoneDates: {
        Z5: ["2026-08-13"],
        Z4: ["2026-08-12"],
        Z3: ["2026-08-11"],
        Z2: ["2026-08-10"],
        Z1: ["2026-08-09"],
        Z9: ["2026-08-08"],
      },
      zoneCounts: { Z1: 1, Z2: 1, Z3: 1, Z4: 1, Z5: 1, Z9: 1 },
      totalAssignments: 6,
      totalNights: 6,
      lastDate: "2026-08-13",
      zoneDow: {},
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ histories: { "tm-jack": history } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const base = snapshot();
    delete base.placementTrailsByTmId;
    const hydrated = await hydratePrintPlacementTrails(base);

    expect(hydrated.placementTrailsByTmId?.["tm-jack"]).toEqual([
      "Z5",
      "Z4",
      "Z3",
      "Z2",
      "Z1",
    ]);
    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(request.throughDate).toBe("2026-08-14");
  });
});
