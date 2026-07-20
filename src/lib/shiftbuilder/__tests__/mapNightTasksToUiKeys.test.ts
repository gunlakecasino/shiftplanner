import { describe, expect, it } from "vitest";
import { mapNightTasksToUiKeys } from "../mapNightTasksToUiKeys";
import { buildCoveredByIndex } from "../coverageHelpers";
import type { NightSlotTask } from "../data";
import type { AuxDef } from "../placement";

function task(partial: Partial<NightSlotTask> & { slotKey: string }): NightSlotTask {
  return {
    id: partial.id ?? `t-${partial.slotKey}`,
    nightId: "n1",
    slotKey: partial.slotKey,
    slotType: partial.slotType ?? "aux",
    rrSide: partial.rrSide ?? null,
    taskLabel: partial.taskLabel ?? "Do thing",
    catalogTaskId: null,
    sortOrder: 0,
    color: null,
    isCoverage: false,
  };
}

const flexLayout: AuxDef[] = [
  { key: "AUX1", role: "admin", label: "ADMIN", locations: [] },
  { key: "AUX2", role: "z9sr", label: "Z9 SR", locations: [] },
  { key: "AUX3", role: "support", label: "SUPPORT 1", locations: [] },
  { key: "AUX4", role: "step_up", label: "STEP UP", locations: [] },
];

describe("mapNightTasksToUiKeys (flex AUX print parity)", () => {
  it("remaps admin / support_1 / step_up DB keys onto AUXn shells", () => {
    const mapped = mapNightTasksToUiKeys(
      [
        task({ slotKey: "admin", taskLabel: "Admin task" }),
        task({ slotKey: "support_1", taskLabel: "Support task" }),
        task({ slotKey: "step_up", taskLabel: "Step task" }),
      ],
      flexLayout,
    );

    expect(mapped.AUX1?.map((t) => t.taskLabel)).toEqual(["Admin task"]);
    expect(mapped.AUX3?.map((t) => t.taskLabel)).toEqual(["Support task"]);
    expect(mapped.AUX4?.map((t) => t.taskLabel)).toEqual(["Step task"]);
    // Must not leave tasks under legacy trail keys only
    expect(mapped.ADM).toBeUndefined();
    expect(mapped.SP1).toBeUndefined();
    expect(mapped.STEP).toBeUndefined();
  });

  it("maps zone tasks without requiring auxDefs", () => {
    const mapped = mapNightTasksToUiKeys(
      [task({ slotKey: "zone_3", slotType: "zone", taskLabel: "Zone task" })],
      [],
    );
    expect(mapped.Z3?.map((t) => t.taskLabel)).toEqual(["Zone task"]);
  });

  it("projects canonical restroom coverage into PDF-compatible task rows", () => {
    const assignments = {
      MRR7: { tmId: "gary", tmName: "Gary", additionalCoverageSlots: ["Z7"] },
      WRR7: { tmId: "amanda", tmName: "Amanda", additionalCoverageSlots: ["Z7"] },
    };

    const mapped = mapNightTasksToUiKeys([], [], assignments);

    expect(mapped.MRR7).toMatchObject([
      { taskLabel: "And Zone 7", isCoverage: true, coverageSide: "B" },
    ]);
    expect(mapped.WRR7).toMatchObject([
      { taskLabel: "And Zone 7", isCoverage: true, coverageSide: "A" },
    ]);
    expect(buildCoveredByIndex(assignments, mapped).Z7).toMatchObject([
      { tmName: "Amanda", side: "A", sourceKey: "WRR7", isSynthetic: true },
      { tmName: "Gary", side: "B", sourceKey: "MRR7", isSynthetic: true },
    ]);
  });

  it("uses the operational Z9 Smoking Room label for a flexible AUX shell", () => {
    const z9Layout: AuxDef[] = [
      { key: "AUX2", role: "z9sr", label: "", locations: [] },
    ];
    const assignments = {
      Z9: { tmId: "joy", tmName: "Joy", additionalCoverageSlots: ["AUX2"] },
    };

    const mapped = mapNightTasksToUiKeys([], z9Layout, assignments);

    expect(mapped.Z9).toMatchObject([
      { taskLabel: "And Zone 9 Smoking Room", isCoverage: true },
    ]);
    expect(buildCoveredByIndex(assignments, mapped, z9Layout).AUX2).toMatchObject([
      { tmName: "Joy", sourceKey: "Z9", isSynthetic: true },
    ]);
  });

  it("does not duplicate a legacy banner already representing canonical coverage", () => {
    const mapped = mapNightTasksToUiKeys(
      [
        task({
          id: "legacy-coverage",
          slotKey: "rr_7",
          slotType: "rr",
          rrSide: "mens",
          taskLabel: "And Zone 7",
          isCoverage: true,
        }),
      ],
      [],
      { MRR7: { tmId: "gary", tmName: "Gary", additionalCoverageSlots: ["Z7"] } },
    );

    expect(mapped.MRR7?.filter((row) => row.isCoverage)).toHaveLength(1);
    expect(mapped.MRR7?.[0].id).toBe("legacy-coverage");
  });

  it("suppresses synthetic empty-zone fallback when the zone is directly staffed", () => {
    const mapped = mapNightTasksToUiKeys([], [], {
      MRR1: { tmId: "daryl", tmName: "Daryl", additionalCoverageSlots: ["Z1"] },
      Z1: { tmId: "zone-tm", tmName: "Zone TM" },
    });

    expect(mapped.MRR1).toBeUndefined();
  });
});
