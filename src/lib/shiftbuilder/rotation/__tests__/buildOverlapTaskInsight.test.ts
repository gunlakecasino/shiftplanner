import { describe, expect, it } from "vitest";
import {
  buildOverlapTaskInsight,
  isOverlapInsightSlotKey,
  overlapInsightBandFromSlotKey,
  type OverlapTaskHistoryRow,
} from "../buildOverlapTaskInsight";

const pool = () => [
  { id: "t1", label: "Sweep floors" },
  { id: "t2", label: "Restock" },
  { id: "t3", label: "Count drawers" },
];

const hist = (rows: Partial<OverlapTaskHistoryRow>[]): OverlapTaskHistoryRow[] =>
  rows.map((r) => ({
    nightDate: r.nightDate ?? "2026-07-01",
    tmId: r.tmId ?? "tmA",
    tmName: r.tmName ?? "Alice",
    taskLabel: r.taskLabel ?? "Sweep floors",
    taskKey: r.taskKey ?? "sweep floors",
    isOneOff: r.isOneOff,
  }));

describe("overlapInsightBandFromSlotKey / isOverlapInsightSlotKey", () => {
  it("parses UI and DB keys", () => {
    expect(overlapInsightBandFromSlotKey("OL-PM-0")).toBe("PM");
    expect(overlapInsightBandFromSlotKey("OL-AM-5")).toBe("AM");
    expect(overlapInsightBandFromSlotKey("overlap_pm_3")).toBe("PM");
    expect(overlapInsightBandFromSlotKey("overlap_am")).toBe("AM");
    expect(overlapInsightBandFromSlotKey("Z4")).toBeNull();
  });

  it("isOverlapInsightSlotKey only matches indexed OL UI keys", () => {
    expect(isOverlapInsightSlotKey("OL-PM-0")).toBe(true);
    expect(isOverlapInsightSlotKey("OL-AM-3")).toBe(true);
    expect(isOverlapInsightSlotKey("OL-PM")).toBe(false);
    expect(isOverlapInsightSlotKey("overlap_pm_0")).toBe(false);
    expect(isOverlapInsightSlotKey("Z1")).toBe(false);
  });
});

describe("buildOverlapTaskInsight", () => {
  it("marks empty seat and empty pool", () => {
    const m = buildOverlapTaskInsight({
      band: "PM",
      tonightIso: "2026-07-12",
      tmId: null,
      standingPool: [],
      tonightChips: [],
      history: [],
    });
    expect(m.emptySeat).toBe(true);
    expect(m.poolEmpty).toBe(true);
    expect(m.standingPool).toEqual([]);
    expect(m.recentForTm).toEqual([]);
    expect(m.recentForTask).toEqual([]);
  });

  it("exposes standing pool and tonight chips (drops coverage)", () => {
    const m = buildOverlapTaskInsight({
      band: "AM",
      tonightIso: "2026-07-12",
      tmId: "tm1",
      standingPool: pool(),
      tonightChips: [
        { label: "Sweep floors", sourceWorkItemId: "t1" },
        { label: "Cover Z4", isCoverage: true },
        { label: "Extra help", isOneOff: true },
      ],
      history: [],
    });
    expect(m.poolEmpty).toBe(false);
    expect(m.emptySeat).toBe(false);
    expect(m.standingPool).toHaveLength(3);
    expect(m.tonightChips.map((c) => c.label)).toEqual(["Sweep floors", "Extra help"]);
    expect(m.tonightChips[0].sourceWorkItemId).toBe("t1");
    expect(m.tonightChips[0].isOneOff).toBe(false);
    expect(m.tonightChips[1].isOneOff).toBe(true);
  });

  it("infers one-off when label not in standing pool", () => {
    const m = buildOverlapTaskInsight({
      band: "PM",
      tonightIso: "2026-07-12",
      tmId: "tm1",
      standingPool: pool(),
      tonightChips: [{ label: "Special project" }],
      history: [],
    });
    expect(m.tonightChips[0].isOneOff).toBe(true);
  });

  it("recentForTask matches by template id then label; ≤10 nights; newest first", () => {
    const rows: Partial<OverlapTaskHistoryRow>[] = [];
    for (let i = 1; i <= 12; i++) {
      const day = String(i).padStart(2, "0");
      rows.push({
        nightDate: `2026-06-${day}`,
        tmId: `tm${i}`,
        tmName: `Person ${i}`,
        taskLabel: "Sweep floors",
        taskKey: "t1",
      });
    }
    // Other task should not pollute
    rows.push({
      nightDate: "2026-07-10",
      tmId: "other",
      tmName: "Other",
      taskLabel: "Restock",
      taskKey: "t2",
    });
    // Label-only legacy match
    rows.push({
      nightDate: "2026-07-11",
      tmId: "legacy",
      tmName: "Legacy",
      taskLabel: "Sweep floors",
      taskKey: "sweep floors",
    });

    const m = buildOverlapTaskInsight({
      band: "PM",
      tonightIso: "2026-07-12",
      tmId: "tmX",
      standingPool: pool(),
      tonightChips: [{ label: "Sweep floors", sourceWorkItemId: "t1" }],
      history: hist(rows),
      recentForTaskLimit: 10,
    });

    expect(m.recentForTask).toHaveLength(10);
    expect(m.recentForTask[0].nightDate).toBe("2026-07-11");
    expect(m.recentForTask[0].tmName).toBe("Legacy");
    // Restock night excluded
    expect(m.recentForTask.some((r) => r.tmId === "other")).toBe(false);
  });

  it("recentForTask empty when no chip", () => {
    const m = buildOverlapTaskInsight({
      band: "PM",
      tonightIso: "2026-07-12",
      tmId: "tmA",
      standingPool: pool(),
      tonightChips: [],
      history: hist([{ nightDate: "2026-07-11", taskLabel: "Sweep floors", taskKey: "t1" }]),
    });
    expect(m.recentForTask).toEqual([]);
  });

  it("recentForTm lists tasks for assigned TM within window; empty seat skips", () => {
    const history = hist([
      {
        nightDate: "2026-07-11",
        tmId: "tmA",
        tmName: "Alice",
        taskLabel: "Sweep floors",
        taskKey: "t1",
      },
      {
        nightDate: "2026-07-10",
        tmId: "tmA",
        tmName: "Alice",
        taskLabel: "Restock",
        taskKey: "t2",
      },
      {
        nightDate: "2026-07-10",
        tmId: "tmB",
        tmName: "Bob",
        taskLabel: "Count drawers",
        taskKey: "t3",
      },
      {
        nightDate: "2026-07-11",
        tmId: "tmA",
        tmName: "Alice",
        taskLabel: "SWEEP FLOORS",
        taskKey: "sweep floors",
      },
    ]);

    const empty = buildOverlapTaskInsight({
      band: "PM",
      tonightIso: "2026-07-12",
      tmId: null,
      standingPool: pool(),
      history,
    });
    expect(empty.recentForTm).toEqual([]);

    const m = buildOverlapTaskInsight({
      band: "PM",
      tonightIso: "2026-07-12",
      tmId: "tmA",
      standingPool: pool(),
      history,
    });
    expect(m.recentForTm).toEqual([
      { nightDate: "2026-07-11", taskLabel: "Sweep floors" },
      { nightDate: "2026-07-10", taskLabel: "Restock" },
    ]);
  });

  it("ignores history on or after tonightIso", () => {
    const m = buildOverlapTaskInsight({
      band: "AM",
      tonightIso: "2026-07-12",
      tmId: "tmA",
      standingPool: pool(),
      tonightChips: [{ label: "Sweep floors", sourceWorkItemId: "t1" }],
      history: hist([
        {
          nightDate: "2026-07-12",
          tmId: "tmA",
          taskLabel: "Sweep floors",
          taskKey: "t1",
        },
        {
          nightDate: "2026-07-13",
          tmId: "tmB",
          tmName: "Bob",
          taskLabel: "Sweep floors",
          taskKey: "t1",
        },
        {
          nightDate: "2026-07-11",
          tmId: "tmC",
          tmName: "Cara",
          taskLabel: "Sweep floors",
          taskKey: "t1",
        },
      ]),
    });
    expect(m.recentForTask).toEqual([
      { nightDate: "2026-07-11", tmName: "Cara", tmId: "tmC" },
    ]);
    expect(m.recentForTm).toEqual([]);
  });

  it("is deterministic for same input", () => {
    const input = {
      band: "PM" as const,
      tonightIso: "2026-07-12",
      tmId: "tmA",
      standingPool: pool(),
      tonightChips: [{ label: "Restock", sourceWorkItemId: "t2" }],
      history: hist([
        {
          nightDate: "2026-07-05",
          tmId: "tmB",
          tmName: "Bob",
          taskLabel: "Restock",
          taskKey: "t2",
        },
        {
          nightDate: "2026-07-08",
          tmId: "tmA",
          tmName: "Alice",
          taskLabel: "Count drawers",
          taskKey: "t3",
        },
      ]),
    };
    expect(buildOverlapTaskInsight(input)).toEqual(buildOverlapTaskInsight(input));
  });
});
