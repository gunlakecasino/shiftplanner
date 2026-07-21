import { describe, expect, it } from "vitest";
import { BREAK_GROUP_OVERLAPS } from "./constants";
import {
  enrichAssignmentsWithBreakGroups,
  resolveEffectiveBreakGroup,
  slotDefaultLookupKey,
  type SlotDefaultBreakMap,
} from "./breakGroupResolve";

describe("fixed break group resolution", () => {
  const defaults: SlotDefaultBreakMap = new Map([
    [slotDefaultLookupKey("zone_4", null), 1],
  ]);

  it("ignores legacy per-night overrides", () => {
    expect(resolveEffectiveBreakGroup(3, "zone_4", null, defaults)).toBe(1);
    expect(resolveEffectiveBreakGroup(0, "zone_4", null, defaults)).toBe(1);
  });

  it("puts a scheduled OL-break TM on the overlap wave", () => {
    const assignments = enrichAssignmentsWithBreakGroups(
      [
        {
          slotKey: "zone_4",
          slotType: "zone",
          tmId: "tm_overlap_break",
          tmName: "Overlap Break TM",
          breakGroup: 2,
        },
      ],
      defaults,
      new Set(["tm_overlap_break"]),
    );

    expect(assignments.Z4?.breakGroup).toBe(BREAK_GROUP_OVERLAPS);
    expect(assignments.Z4?.breakGroupExplicit).toBeUndefined();
  });

  it("normalizes legacy overlap rows stored with aux slot_type", () => {
    const assignments = enrichAssignmentsWithBreakGroups(
      [
        {
          slotKey: "overlap_pm_2",
          slotType: "aux",
          tmId: "tm_gage",
          tmName: "Gage",
          breakGroup: 4,
        },
      ],
      new Map(),
    );

    expect(assignments["OL-PM-2"]).toMatchObject({
      tmId: "tm_gage",
      tmName: "Gage",
    });
    expect(assignments["UNK:overlap_pm_2"]).toBeUndefined();
  });
});
