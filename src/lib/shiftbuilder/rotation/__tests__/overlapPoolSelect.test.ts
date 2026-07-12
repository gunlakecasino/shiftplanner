import { describe, expect, it } from "vitest";
import {
  compareForStaffingCut,
  cutPoolForStaffing,
  filterPoolByDay,
  formatRecurrenceDaysLabel,
  isEligibleOnWeekday,
  nextPriority,
  priorityRank,
  selectOverlapPoolForNight,
  weekdayFromIsoDate,
  type SelectablePoolTask,
} from "../overlapPoolSelect";

const base = (
  partial: Partial<SelectablePoolTask> & Pick<SelectablePoolTask, "id" | "label">,
): SelectablePoolTask => ({
  band: "PM",
  priority: "normal",
  ...partial,
});

describe("overlapPoolSelect", () => {
  it("priorityRank orders urgent > high > normal > low", () => {
    expect(priorityRank("urgent")).toBeGreaterThan(priorityRank("high"));
    expect(priorityRank("high")).toBeGreaterThan(priorityRank("normal"));
    expect(priorityRank("normal")).toBeGreaterThan(priorityRank("low"));
    expect(priorityRank(null)).toBe(priorityRank("normal"));
  });

  it("weekdayFromIsoDate Wednesday 2026-07-15 is 3 in Detroit", () => {
    expect(weekdayFromIsoDate("2026-07-15")).toBe(3);
  });

  it("isEligibleOnWeekday: empty days = every night", () => {
    expect(isEligibleOnWeekday(null, 5)).toBe(true);
    expect(isEligibleOnWeekday([], 5)).toBe(true);
    expect(isEligibleOnWeekday([5], 5)).toBe(true);
    expect(isEligibleOnWeekday([5], 1)).toBe(false);
  });

  it("filterPoolByDay keeps Fri-only on Friday, drops on Monday", () => {
    const pool = [
      base({ id: "a", label: "Every", recurrenceDays: null }),
      base({ id: "b", label: "Fri only", recurrenceDays: [5] }),
      base({ id: "c", label: "Mon only", recurrenceDays: [1] }),
    ];
    // 2026-07-17 is Friday
    const fri = filterPoolByDay(pool, "2026-07-17");
    expect(fri.eligible.map((t) => t.id).sort()).toEqual(["a", "b"]);
    expect(fri.skippedDay.map((t) => t.id)).toEqual(["c"]);

    // 2026-07-13 is Monday
    const mon = filterPoolByDay(pool, "2026-07-13");
    expect(mon.eligible.map((t) => t.id).sort()).toEqual(["a", "c"]);
  });

  it("cutPoolForStaffing prefers urgent over low when n=2", () => {
    const eligible = [
      base({ id: "low1", label: "Low", priority: "low" }),
      base({ id: "urg", label: "Must", priority: "urgent" }),
      base({ id: "norm", label: "Norm", priority: "normal" }),
      base({ id: "high", label: "High", priority: "high" }),
    ];
    const { selected, skippedStaffing } = cutPoolForStaffing(eligible, 2);
    expect(selected.map((t) => t.id)).toEqual(["urg", "high"]);
    expect(skippedStaffing.map((t) => t.id).sort()).toEqual(["low1", "norm"]);
  });

  it("cutPoolForStaffing uses poolSortOrder within same priority", () => {
    const eligible = [
      base({ id: "b", label: "B", priority: "high", poolSortOrder: 2 }),
      base({ id: "a", label: "A", priority: "high", poolSortOrder: 0 }),
      base({ id: "c", label: "C", priority: "high", poolSortOrder: 1 }),
    ];
    const { selected } = cutPoolForStaffing(eligible, 2);
    expect(selected.map((t) => t.id)).toEqual(["a", "c"]);
  });

  it("cutPoolForStaffing uses globalDue when priority ties and no sort", () => {
    const eligible = [
      base({ id: "old", label: "Old", priority: "normal" }),
      base({ id: "new", label: "New", priority: "normal" }),
    ];
    const due = new Map([
      ["old", 30],
      ["new", 2],
    ]);
    const { selected } = cutPoolForStaffing(eligible, 1, { dueByTaskId: due });
    expect(selected[0]?.id).toBe("old");
  });

  it("selectOverlapPoolForNight: 2 seats Fri drops Mon-only and low priority", () => {
    const pool = [
      base({ id: "must", label: "Battery", priority: "urgent", recurrenceDays: null }),
      base({ id: "fri", label: "Fri deep", priority: "high", recurrenceDays: [5] }),
      base({ id: "mon", label: "Mon only", priority: "urgent", recurrenceDays: [1] }),
      base({ id: "nice", label: "Nice", priority: "low", recurrenceDays: null }),
    ];
    // Friday
    const { selected, debug } = selectOverlapPoolForNight(pool, 2, "2026-07-17");
    expect(selected.map((t) => t.id)).toEqual(["must", "fri"]);
    expect(debug.skippedDay.map((t) => t.id)).toEqual(["mon"]);
    expect(debug.skippedStaffing.map((t) => t.id)).toEqual(["nice"]);
    expect(debug.n).toBe(2);
    expect(debug.weekday).toBe(5);
  });

  it("selectOverlapPoolForNight: empty seats → nothing selected", () => {
    const pool = [base({ id: "a", label: "A", priority: "urgent" })];
    const { selected } = selectOverlapPoolForNight(pool, 0, "2026-07-17");
    expect(selected).toHaveLength(0);
  });

  it("nextPriority cycles urgent→high→normal→low→urgent", () => {
    expect(nextPriority("urgent")).toBe("high");
    expect(nextPriority("low")).toBe("urgent");
  });

  it("formatRecurrenceDaysLabel", () => {
    expect(formatRecurrenceDaysLabel(null)).toBe("Every night");
    expect(formatRecurrenceDaysLabel([5, 6])).toBe("Fri·Sat");
  });

  it("compareForStaffingCut is stable with seedOrder", () => {
    const a = base({ id: "a", label: "A", priority: "normal" });
    const b = base({ id: "b", label: "B", priority: "normal" });
    const seedOrder = new Map([
      ["a", 1],
      ["b", 0],
    ]);
    expect(compareForStaffingCut(a, b, { seedOrder })).toBeGreaterThan(0);
  });
});
