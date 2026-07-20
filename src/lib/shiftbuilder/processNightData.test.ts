/**
 * processNightData pure projection tests (PR 18).
 *
 * Locks the framework-agnostic night processors used by the board / worker:
 *   - buildAssignmentsRecord / enrich path
 *   - computeBreakCounts + computeInRotationCount
 *   - prepareBreaksWaveData
 *   - processNightData entry-point composition
 */
import { describe, expect, it } from "vitest";
import { BREAK_GROUP_OVERLAPS } from "./constants";
import {
  buildAssignmentsRecord,
  computeBreakCounts,
  computeInRotationCount,
  prepareBreaksWaveData,
  processNightData,
} from "./processNightData";

describe("buildAssignmentsRecord", () => {
  it("returns empty object for null / non-array input", () => {
    expect(buildAssignmentsRecord(null)).toEqual({});
    expect(buildAssignmentsRecord(undefined)).toEqual({});
  });

  it("maps DB rows to UI keys and always uses card defaults", () => {
    const out = buildAssignmentsRecord([
      {
        slotKey: "zone_4",
        slotType: "zone",
        tmId: "tm_a",
        tmName: "Alice",
        breakGroup: 2,
      },
      {
        slotKey: "rr_6",
        slotType: "rr",
        rrSide: "mens",
        tmId: "tm_b",
        tmName: "Bob",
        breakGroup: 1,
      },
    ]);
    expect(out.Z4).toMatchObject({
      tmId: "tm_a",
      tmName: "Alice",
      breakGroup: 1,
    });
    expect(out.MRR6).toMatchObject({
      tmId: "tm_b",
      tmName: "Bob",
      breakGroup: 2,
    });
  });

  it("skips rows without tmId", () => {
    const out = buildAssignmentsRecord([
      { slotKey: "zone_1", tmName: "ghost", breakGroup: 1 },
      { slotKey: "zone_2", tmId: "tm_c", tmName: "Cara", breakGroup: 3 },
    ]);
    expect(out.Z1).toBeUndefined();
    expect(out.Z2?.tmId).toBe("tm_c");
  });
});

describe("computeBreakCounts / computeInRotationCount", () => {
  it("counts waves 1–3 and overlaps; ignores empty + OL- slots", () => {
    const assignments = {
      Z1: { tmId: "a", tmName: "A", breakGroup: 1 },
      Z2: { tmId: "b", tmName: "B", breakGroup: 1 },
      Z3: { tmId: "c", tmName: "C", breakGroup: 2 },
      Z4: { tmId: "d", tmName: "D", breakGroup: 3 },
      ADM: { tmId: "e", tmName: "E", breakGroup: BREAK_GROUP_OVERLAPS },
      "OL-AM-1": { tmId: "f", tmName: "F", breakGroup: 1 }, // excluded
      Z5: { tmId: null, tmName: null, breakGroup: 1 }, // empty
    };
    const counts = computeBreakCounts(assignments);
    expect(counts).toEqual({ 1: 2, 2: 1, 3: 1, 4: 1 });
    expect(computeInRotationCount(counts)).toBe(5);
  });

  it("returns zeros for null/empty", () => {
    expect(computeBreakCounts(null)).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0 });
    expect(computeInRotationCount(computeBreakCounts({}))).toBe(0);
  });
});

describe("prepareBreaksWaveData", () => {
  it("groups placed TMs into wave columns and skips OL- keys", () => {
    const assignments = {
      Z4: { tmId: "tm_a", tmName: "Alice", breakGroup: 1 },
      MRR6: { tmId: "tm_b", tmName: "Bob", breakGroup: 1 },
      ADM: { tmId: "tm_c", tmName: "Cara", breakGroup: 2 },
      "OL-PM-1": { tmId: "tm_d", tmName: "Dan", breakGroup: 1 },
    };
    const waves = prepareBreaksWaveData(assignments);
    expect(waves).toHaveLength(4);
    const w1 = waves.find((w) => w.wave === 1)!;
    expect(w1.count).toBe(2);
    expect(w1.items.map((i) => i.slotKey).sort()).toEqual(["MRR6", "Z4"]);
    expect(w1.items.find((i) => i.slotKey === "Z4")?.type).toBe("zone");
    expect(w1.items.find((i) => i.slotKey === "MRR6")?.type).toBe("rr");
    const w2 = waves.find((w) => w.wave === 2)!;
    expect(w2.count).toBe(1);
    expect(w2.items[0]).toMatchObject({ slotKey: "ADM", type: "aux", tmName: "Cara" });
  });

  it("returns empty array for null assignments", () => {
    expect(prepareBreaksWaveData(null)).toEqual([]);
  });
});

describe("processNightData (entry point)", () => {
  it("composes assignments → counts → waves in one pure projection", () => {
    const result = processNightData({
      rawDbAssignments: [
        {
          slotKey: "zone_4",
          slotType: "zone",
          tmId: "tm_a",
          tmName: "Alice",
          breakGroup: 1,
        },
        {
          slotKey: "zone_5",
          slotType: "zone",
          tmId: "tm_b",
          tmName: "Bob",
          breakGroup: 2,
        },
        {
          slotKey: "rr_6",
          slotType: "rr",
          rrSide: "womens",
          tmId: "tm_c",
          tmName: "Cara",
          breakGroup: 1,
        },
      ],
    });

    expect(result.assignments.Z4?.tmId).toBe("tm_a");
    expect(result.assignments.Z5?.tmId).toBe("tm_b");
    expect(result.assignments.WRR6?.tmId).toBe("tm_c");
    expect(result.breakCounts[1]).toBe(2);
    expect(result.breakCounts[2]).toBe(1);
    expect(result.inRotation).toBe(3);
    expect(result.waves.find((w) => w.wave === 1)?.count).toBe(2);
    expect(result.waves.find((w) => w.wave === 2)?.count).toBe(1);
  });

  it("is deterministic for the same input", () => {
    const input = {
      rawDbAssignments: [
        {
          slotKey: "zone_1",
          slotType: "zone",
          tmId: "tm_x",
          tmName: "X",
          breakGroup: 3,
        },
      ],
    };
    expect(processNightData(input)).toEqual(processNightData(input));
  });
});
