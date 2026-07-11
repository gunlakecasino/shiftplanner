import { describe, expect, it } from "vitest";
import {
  historyDeleteFilter,
  historyInsertRow,
  matrixTmsAfterHistoryChange,
  type HistorySlotMutation,
} from "../historyOwnership";

describe("historyDeleteFilter", () => {
  it("assign filter is night×slot only — ignores tmId", () => {
    const mut: HistorySlotMutation = {
      kind: "assign",
      nightId: "night-1",
      uiSlotKey: "Z3",
      tmId: "tm_b",
      slotType: "zone",
      rrSide: null,
    };
    expect(historyDeleteFilter(mut)).toEqual({
      nightId: "night-1",
      slotKey: "Z3",
    });
    // tmId is present on the mutation but never part of the delete filter
    expect(historyDeleteFilter(mut)).not.toHaveProperty("tmId");
  });

  it("clear uses the same night×slot filter", () => {
    const assign: HistorySlotMutation = {
      kind: "assign",
      nightId: "night-1",
      uiSlotKey: "Z3",
      tmId: "tm_a",
      slotType: "zone",
      rrSide: null,
    };
    const clear: HistorySlotMutation = {
      kind: "clear",
      nightId: "night-1",
      uiSlotKey: "Z3",
      slotType: "zone",
      rrSide: null,
    };
    expect(historyDeleteFilter(clear)).toEqual(historyDeleteFilter(assign));
  });

  it("RR slots use UI keys (MRR/WRR)", () => {
    const mut: HistorySlotMutation = {
      kind: "clear",
      nightId: "n",
      uiSlotKey: "MRR8",
      slotType: "rr",
      rrSide: "mens",
    };
    expect(historyDeleteFilter(mut).slotKey).toBe("MRR8");
  });
});

describe("historyInsertRow", () => {
  it("maps assign mutation to a committed history row with UI slot key", () => {
    expect(
      historyInsertRow({
        kind: "assign",
        nightId: "night-1",
        uiSlotKey: "Z9SR",
        tmId: "tm_x",
        slotType: "aux",
        rrSide: null,
      }),
    ).toEqual({
      tm_id: "tm_x",
      night_id: "night-1",
      slot_key: "Z9SR",
      slot_type: "aux",
      rr_side: null,
      is_committed: true,
    });
  });
});

describe("matrixTmsAfterHistoryChange", () => {
  it("includes previous occupants and new assignee", () => {
    expect(matrixTmsAfterHistoryChange(["tm_a"], "tm_b").sort()).toEqual([
      "tm_a",
      "tm_b",
    ]);
  });

  it("clear-only refreshes cleared TMs", () => {
    expect(matrixTmsAfterHistoryChange(["tm_a", "tm_a"])).toEqual(["tm_a"]);
  });

  it("dedupes when reassigning same TM", () => {
    expect(matrixTmsAfterHistoryChange(["tm_a"], "tm_a")).toEqual(["tm_a"]);
  });
});
