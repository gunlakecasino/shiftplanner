import { describe, expect, it } from "vitest";
import { mapNightTasksToUiKeys } from "../mapNightTasksToUiKeys";
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
});
