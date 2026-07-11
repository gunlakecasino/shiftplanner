import { describe, expect, it } from "vitest";
import {
  getTmThisWeekRepeatForSlot,
  getTmWeekRepeatForSlotThroughNight,
} from "../shiftRotationHealth";

function mapOf(
  tmId: string,
  rows: Array<{ nightDate: string; slotKey: string }>,
) {
  return new Map([[tmId, rows]]);
}

describe("getTmWeekRepeatForSlotThroughNight", () => {
  it("does not double-count when tonight is already in the map", () => {
    const m = mapOf("tm_a", [
      { nightDate: "2026-07-08", slotKey: "Z3" },
      { nightDate: "2026-07-10", slotKey: "Z3" }, // tonight
    ]);
    expect(
      getTmWeekRepeatForSlotThroughNight(m, "tm_a", "Z3", "2026-07-10", true),
    ).toBe(2);
  });

  it("adds tonight only when missing from map", () => {
    const m = mapOf("tm_a", [{ nightDate: "2026-07-08", slotKey: "Z3" }]);
    expect(
      getTmWeekRepeatForSlotThroughNight(m, "tm_a", "Z3", "2026-07-10", true),
    ).toBe(2);
  });

  it("merges MRR/WRR as same area", () => {
    const m = mapOf("tm_a", [
      { nightDate: "2026-07-08", slotKey: "MRR8" },
      { nightDate: "2026-07-09", slotKey: "WRR8" },
    ]);
    expect(
      getTmWeekRepeatForSlotThroughNight(m, "tm_a", "WRR8", "2026-07-10", true),
    ).toBe(3);
  });
});

describe("getTmThisWeekRepeatForSlot (compat)", () => {
  it("documents that map may include tonight — callers must not always +1", () => {
    const m = mapOf("tm_a", [
      { nightDate: "2026-07-08", slotKey: "Z3" },
      { nightDate: "2026-07-10", slotKey: "Z3" },
    ]);
    // Compat helper returns ALL matching rows (including tonight if present).
    expect(getTmThisWeekRepeatForSlot(m, "tm_a", "Z3").count).toBe(2);
  });
});
