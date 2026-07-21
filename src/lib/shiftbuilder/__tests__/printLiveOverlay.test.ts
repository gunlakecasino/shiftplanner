import { describe, expect, it } from "vitest";
import { buildOverlapRows } from "@/app/shiftbuilder/print/buildPrintDaySnapshot";
import { applyLiveBoardToPrintSnapshot } from "@/app/shiftbuilder/print/mergePrintSnapshot";
import { pageTaskRowsForOverlapRows } from "@/app/shiftbuilder/print/OfficialGravesPrintPages";
import type { PrintDaySnapshot } from "@/app/shiftbuilder/print/printPreviewTypes";
import type { NightSlotTask } from "@/lib/shiftbuilder/data";

function task(id: string, label: string, isCoverage = false): NightSlotTask {
  return {
    id,
    nightId: "night",
    slotKey: "overlap_pm_2",
    slotType: "overlap",
    rrSide: null,
    taskLabel: label,
    catalogTaskId: null,
    sortOrder: Number(id.replace(/\D/g, "")) || 0,
    color: null,
    markerType: null,
    textStyle: null,
    isCoverage,
  };
}

function snapshotWithGage(): PrintDaySnapshot {
  return {
    dayIndex: 0,
    day: {} as PrintDaySnapshot["day"],
    assignments: {
      "OL-PM-2": { tmId: "tm_gage", tmName: "Gage", breakGroup: 0 },
    },
    tasksBySlot: {},
    auxDefs: [],
    amOverlapDayName: "Tuesday",
    amOverlapDateNum: 21,
    nextDayColor: "#000000",
    breakCounts: { 1: 0, 2: 0, 3: 0, 4: 0 },
  };
}

describe("applyLiveBoardToPrintSnapshot", () => {
  it("keeps the persisted name for the same TM when live state has a dash", () => {
    const result = applyLiveBoardToPrintSnapshot(snapshotWithGage(), {
      assignments: {
        "OL-PM-2": { tmId: "tm_gage", tmName: "-", breakGroup: 0 },
      },
      auxDefs: [],
      tasksBySlot: {},
    });

    expect(result.assignments["OL-PM-2"]).toMatchObject({
      tmId: "tm_gage",
      tmName: "Gage",
    });
  });

  it("repairs dash names in the overlap print model when a TM is assigned", () => {
    const snapshot = snapshotWithGage();
    snapshot.assignments["OL-PM-2"] = {
      tmId: "tm_gage",
      tmName: "-",
      breakGroup: 4,
    };

    const pmRow = buildOverlapRows(snapshot).find((row) => row.key === "PM");
    const gageSlot = pmRow?.slots.find((slot) => slot.key === "OL-PM-2");

    expect(gageSlot).toMatchObject({
      tmId: "tm_gage",
      tmName: "Gage",
      empty: false,
    });
  });

  it("keeps all overlap task lines and trims the projects/tasks register instead", () => {
    const snapshot = snapshotWithGage();
    snapshot.tasksBySlot["OL-PM-2"] = [
      task("task-1", "Vacuuming"),
      task("task-2", "Glass & Countertops"),
      task("task-3", "Tables & Restrooms"),
      task("task-4", "Extra project line"),
      task("task-5", "And Zone 9", true),
    ];

    const pmRow = buildOverlapRows(snapshot).find((row) => row.key === "PM");
    const gageSlot = pmRow?.slots.find((slot) => slot.key === "OL-PM-2");

    expect(gageSlot?.tmName).toBe("Gage");
    expect(gageSlot?.tasks.filter((line) => !line.isCoverage).map((line) => line.label)).toEqual([
      "Vacuuming",
      "Glass & Countertops",
      "Tables & Restrooms",
      "Extra project line",
    ]);
    expect(gageSlot?.tasks.some((line) => line.isCoverage && line.label === "And Zone 9")).toBe(true);
    expect(pageTaskRowsForOverlapRows(buildOverlapRows(snapshot))).toBe(7);
  });
});
