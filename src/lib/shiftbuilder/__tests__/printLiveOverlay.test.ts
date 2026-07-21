import { describe, expect, it } from "vitest";
import { buildOverlapRows } from "@/app/shiftbuilder/print/buildPrintDaySnapshot";
import { applyLiveBoardToPrintSnapshot } from "@/app/shiftbuilder/print/mergePrintSnapshot";
import type { PrintDaySnapshot } from "@/app/shiftbuilder/print/printPreviewTypes";

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
});
