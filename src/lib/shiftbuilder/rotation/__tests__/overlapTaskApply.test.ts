import { describe, it, expect } from "vitest";
import {
  normalizeTaskLabel,
  overlapBandFromSlotKey,
  isOverlapSlotKey,
  dedupeOverlapPoolTasks,
  randomAssignPoolToSeats,
  mergeStandingOnlyTasks,
  standingPoolLabelSet,
  hashStringSeed,
  seededShuffle,
} from "../overlapTaskApply";

describe("normalizeTaskLabel", () => {
  it("trims lowercases and collapses whitespace", () => {
    expect(normalizeTaskLabel("  Foo   Bar ")).toBe("foo bar");
  });
  it("handles null/empty", () => {
    expect(normalizeTaskLabel(null)).toBe("");
    expect(normalizeTaskLabel(undefined)).toBe("");
    expect(normalizeTaskLabel("")).toBe("");
  });
});

describe("overlapBandFromSlotKey", () => {
  it("maps indexed and unindexed AM/PM keys", () => {
    expect(overlapBandFromSlotKey("overlap_am_0")).toBe("AM");
    expect(overlapBandFromSlotKey("overlap_am_5")).toBe("AM");
    expect(overlapBandFromSlotKey("overlap_am")).toBe("AM");
    expect(overlapBandFromSlotKey("overlap_pm_3")).toBe("PM");
    expect(overlapBandFromSlotKey("overlap_pm")).toBe("PM");
  });
  it("rejects non-overlap keys", () => {
    expect(overlapBandFromSlotKey("zone_1")).toBeNull();
    expect(overlapBandFromSlotKey("OL-PM-0")).toBeNull();
    expect(overlapBandFromSlotKey("overlap_xx_0")).toBeNull();
  });
  it("isOverlapSlotKey mirrors band parse", () => {
    expect(isOverlapSlotKey("overlap_pm_1")).toBe(true);
    expect(isOverlapSlotKey("admin")).toBe(false);
  });
});

describe("dedupeOverlapPoolTasks", () => {
  it("dedupes by id then by normalized label", () => {
    const out = dedupeOverlapPoolTasks([
      { id: "a", label: "Sweep", band: "AM" },
      { id: "a", label: "Sweep again", band: "AM" },
      { id: "b", label: "SWEEP", band: "AM" },
      { id: "c", label: "Count", band: "AM" },
    ]);
    expect(out.map((t) => t.id)).toEqual(["a", "c"]);
    expect(out.map((t) => t.label)).toEqual(["Sweep", "Count"]);
  });
});

describe("randomAssignPoolToSeats", () => {
  it("assigns n = min(pool, seats) deterministically for a seed", () => {
    const pool = [
      { id: "t1", label: "T1", band: "PM" as const },
      { id: "t2", label: "T2", band: "PM" as const },
      { id: "t3", label: "T3", band: "PM" as const },
    ];
    const seats = [
      { dbSlotKey: "overlap_pm_0", tmId: "tmA" },
      { dbSlotKey: "overlap_pm_1", tmId: "tmB" },
    ];
    const a = randomAssignPoolToSeats(pool, seats, 1);
    const b = randomAssignPoolToSeats(pool, seats, 1);
    expect(a).toEqual(b);
    expect(a).toHaveLength(2);
    const seatKeys = new Set(a.map((x) => x.seat.dbSlotKey));
    expect(seatKeys.size).toBe(2);
    const taskIds = new Set(a.map((x) => x.task.id));
    expect(taskIds.size).toBe(2);
  });

  it("returns empty when pool or seats empty", () => {
    expect(
      randomAssignPoolToSeats([], [{ dbSlotKey: "overlap_pm_0", tmId: "x" }], 1),
    ).toEqual([]);
    expect(
      randomAssignPoolToSeats(
        [{ id: "t1", label: "T1", band: "PM" }],
        [],
        1,
      ),
    ).toEqual([]);
  });

  it("leaves extra seats unassigned when pool smaller", () => {
    const pool = [{ id: "t1", label: "T1", band: "AM" as const }];
    const seats = [
      { dbSlotKey: "overlap_am_0", tmId: "a" },
      { dbSlotKey: "overlap_am_1", tmId: "b" },
      { dbSlotKey: "overlap_am_2", tmId: "c" },
    ];
    const result = randomAssignPoolToSeats(pool, seats, 42);
    expect(result).toHaveLength(1);
  });
});

describe("mergeStandingOnlyTasks", () => {
  it("replaces standing pool labels and preserves manuals + coverage", () => {
    const standing = standingPoolLabelSet([
      { id: "1", label: "Pool Task", band: "PM" },
      { id: "2", label: "Other Pool", band: "PM" },
    ]);
    const merged = mergeStandingOnlyTasks({
      existing: [
        { taskLabel: "Pool Task", isCoverage: false },
        { taskLabel: "Manual one-off", isCoverage: false },
        { taskLabel: "Cover A", isCoverage: true },
      ],
      newStanding: [{ taskLabel: "Other Pool", taskColor: "#fff", sourceWorkItemId: "2" }],
      standingPoolLabels: standing,
      standingPoolIds: ["1", "2"],
      preserveCoverage: true,
    });
    expect(merged.map((t) => t.taskLabel)).toEqual([
      "Other Pool",
      "Manual one-off",
      "Cover A",
    ]);
    expect(merged.find((t) => t.taskLabel === "Cover A")?.isCoverage).toBe(true);
    expect(merged.find((t) => t.taskLabel === "Manual one-off")?.isCoverage).toBe(
      false,
    );
    expect(merged.find((t) => t.taskLabel === "Other Pool")?.sourceWorkItemId).toBe("2");
    expect(merged.find((t) => t.taskLabel === "Other Pool")?.isOneOff).toBe(false);
  });

  it("does not treat unknown labels as standing", () => {
    const merged = mergeStandingOnlyTasks({
      existing: [{ taskLabel: "Free text chip", isCoverage: false }],
      newStanding: [{ taskLabel: "Standing", sourceWorkItemId: "s1" }],
      standingPoolLabels: ["standing"],
      standingPoolIds: ["s1"],
    });
    expect(merged.map((t) => t.taskLabel)).toEqual(["Standing", "Free text chip"]);
  });

  it("drops standing when newStanding empty (pool wipe of standing only)", () => {
    const merged = mergeStandingOnlyTasks({
      existing: [
        { taskLabel: "Standing", isCoverage: false },
        { taskLabel: "Keep me", isCoverage: false },
      ],
      newStanding: [],
      standingPoolLabels: ["standing"],
    });
    expect(merged.map((t) => t.taskLabel)).toEqual(["Keep me"]);
  });

  it("always preserves is_one_off even when label matches pool", () => {
    const merged = mergeStandingOnlyTasks({
      existing: [
        { taskLabel: "Pool Task", isCoverage: false, isOneOff: true },
        {
          taskLabel: "Old Standing",
          isCoverage: false,
          sourceWorkItemId: "p1",
          isOneOff: false,
        },
      ],
      newStanding: [
        {
          taskLabel: "New Standing",
          sourceWorkItemId: "p2",
          isOneOff: false,
        },
      ],
      standingPoolLabels: ["pool task", "old standing", "new standing"],
      standingPoolIds: ["p1", "p2"],
    });
    expect(merged.map((t) => t.taskLabel)).toEqual(["New Standing", "Pool Task"]);
    expect(merged.find((t) => t.taskLabel === "Pool Task")?.isOneOff).toBe(true);
    expect(merged.find((t) => t.taskLabel === "New Standing")?.isOneOff).toBe(false);
  });

  it("identifies standing by source_work_item_id even if label renamed", () => {
    const merged = mergeStandingOnlyTasks({
      existing: [
        {
          taskLabel: "Renamed Local Label",
          isCoverage: false,
          sourceWorkItemId: "tpl-a",
          isOneOff: false,
        },
      ],
      newStanding: [{ taskLabel: "Canonical Title", sourceWorkItemId: "tpl-b" }],
      standingPoolLabels: ["canonical title", "something else"],
      standingPoolIds: ["tpl-a", "tpl-b"],
    });
    // Old standing dropped by id membership; new standing inserted
    expect(merged.map((t) => t.taskLabel)).toEqual(["Canonical Title"]);
    expect(merged[0].sourceWorkItemId).toBe("tpl-b");
  });
});

describe("seed helpers", () => {
  it("hashStringSeed is stable", () => {
    expect(hashStringSeed("night-abc")).toBe(hashStringSeed("night-abc"));
    expect(hashStringSeed("a")).not.toBe(hashStringSeed("b"));
  });
  it("seededShuffle is deterministic", () => {
    expect(seededShuffle([1, 2, 3, 4], 9)).toEqual(seededShuffle([1, 2, 3, 4], 9));
  });
});
