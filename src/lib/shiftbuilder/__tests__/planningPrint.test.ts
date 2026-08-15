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
    },
    tasksBySlot: { Z5: zoneFiveTasks },
    auxDefs: [],
    amOverlapDayName: "Saturday",
    amOverlapDateNum: 15,
    nextDayColor: "#006ec8",
    breakCounts: { 1: 0, 2: 1, 3: 0, 4: 0 },
    placementTrailsByTmId: {
      "tm-jack": ["Z4", "RR8M", "ADMIN"],
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("planning worksheet print", () => {
  it("removes the alert, prints the TM trail, and packs all Zone 5 subtasks", () => {
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
    expect(html).toContain("sb-golden-placement-trail");
    expect(html).toContain("Z4");
    expect(html).toContain("RR8M");
    expect(html).toContain("ADMIN");
    expect(html.match(/sb-golden-subtask-row/g)).toHaveLength(2);
    expect(html).toContain("Red Tray Carts");
    expect(html).toContain("Vacuum");
    expect(html).toContain("Trash");
  });

  it("defaults sudo-admin print commands to no timestamp", () => {
    const base = tonightPlanningPrintConfig(0);

    expect(applyPrintRoleDefaults(base, true).includeTimestamp).toBe(false);
    expect(applyPrintRoleDefaults(base, false).includeTimestamp).toBe(true);
  });

  it("anchors the history read to the planned night and keeps three newest placements", async () => {
    const history: ZoneDetailEntry = {
      tmId: "tm-jack",
      tmName: "Jack",
      zoneDates: {
        Z4: ["2026-08-13"],
        Z3: ["2026-08-12"],
        Z2: ["2026-08-11"],
        Z1: ["2026-08-10"],
      },
      zoneCounts: { Z1: 1, Z2: 1, Z3: 1, Z4: 1 },
      totalAssignments: 4,
      totalNights: 4,
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
      "Z4",
      "Z3",
      "Z2",
    ]);
    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(request.throughDate).toBe("2026-08-14");
  });
});
