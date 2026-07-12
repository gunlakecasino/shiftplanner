import { describe, expect, it } from "vitest";
import {
  dateDiffCalendarDays,
  fairAssignOverlapTasks,
  randomAssignOverlapTasks,
  type PoolTask,
  type StaffedSeat,
  type TaskHistoryEvent,
} from "../overlapTaskFairness";

const seats2 = (): StaffedSeat[] => [
  { dbSlotKey: "overlap_pm_0", tmId: "tmA", tmName: "A" },
  { dbSlotKey: "overlap_pm_1", tmId: "tmB", tmName: "B" },
];

const pool3 = (): PoolTask[] => [
  { templateId: "T1", label: "Task 1" },
  { templateId: "T2", label: "Task 2" },
  { templateId: "T3", label: "Task 3" },
];

const pool2 = (): PoolTask[] => [
  { templateId: "T1", label: "Task 1" },
  { templateId: "T2", label: "Task 2" },
];

describe("overlapTaskFairness", () => {
  it("dateDiffCalendarDays adjacent nights is 1", () => {
    expect(dateDiffCalendarDays("2026-07-12", "2026-07-11")).toBe(1);
  });

  it("fairAssign cold start F1", () => {
    const result = fairAssignOverlapTasks(
      pool3(),
      seats2(),
      [],
      "PM",
      "2026-07-12",
      { seed: 1 },
    );
    expect(result.assignments).toHaveLength(2);
    const tms = new Set(result.assignments.map((a) => a.seat.tmId));
    expect(tms.has("tmA")).toBe(true);
    expect(tms.has("tmB")).toBe(true);
    const tasks = new Set(result.assignments.map((a) => a.task.templateId));
    expect(tasks.size).toBe(2);
    expect(tasks.has("T3") || tasks.size === 2).toBe(true);
    // third task unassigned
    const assigned = new Set(result.assignments.map((a) => a.task.templateId));
    expect(pool3().filter((t) => !assigned.has(t.templateId))).toHaveLength(1);
  });

  it("fairAssign avoids recent pair F2", () => {
    const history: TaskHistoryEvent[] = [
      {
        nightDate: "2026-07-11",
        band: "PM",
        tmId: "tmA",
        taskKey: "T1",
        isOneOff: false,
      },
      {
        nightDate: "2026-07-11",
        band: "PM",
        tmId: "tmB",
        taskKey: "T2",
        isOneOff: false,
      },
    ];
    const result = fairAssignOverlapTasks(
      pool2(),
      seats2(),
      history,
      "PM",
      "2026-07-12",
      { seed: 1, windowNights: 30, sameWeekdayPenalty: 3 },
    );
    expect(result.assignments).toHaveLength(2);
    const byTm = Object.fromEntries(
      result.assignments.map((a) => [a.seat.tmId, a.task.templateId]),
    );
    // Crossed: A should prefer T2, B prefer T1
    expect(byTm.tmA).toBe("T2");
    expect(byTm.tmB).toBe("T1");
  });

  it("fairAssign sameWeekdayPenalty F2b", () => {
    // Tonight Wednesday 2026-07-15
    // 7 days ago Wed: tmA→T1; 6 days ago Tue: tmB→T1
    // pairScore(T1,tmA)=7-3=4; pairScore(T1,tmB)=6 → tmB preferred for T1
    // Single-task pool so greedy doesn't assign a cold T2 first and leave T1 to tmA.
    const history: TaskHistoryEvent[] = [
      {
        nightDate: "2026-07-08",
        band: "PM",
        tmId: "tmA",
        taskKey: "T1",
        isOneOff: false,
      },
      {
        nightDate: "2026-07-09",
        band: "PM",
        tmId: "tmB",
        taskKey: "T1",
        isOneOff: false,
      },
    ];
    const result = fairAssignOverlapTasks(
      [{ templateId: "T1", label: "Task 1" }],
      seats2(),
      history,
      "PM",
      "2026-07-15",
      { seed: 42, windowNights: 30, sameWeekdayPenalty: 3 },
    );
    expect(result.assignments).toHaveLength(1);
    expect(result.assignments[0]?.seat.tmId).toBe("tmB");
    expect(result.assignments[0]?.task.templateId).toBe("T1");
  });

  it("fairAssign ignores other band F3", () => {
    const history: TaskHistoryEvent[] = [
      {
        nightDate: "2026-07-11",
        band: "AM",
        tmId: "tmA",
        taskKey: "T1",
        isOneOff: false,
      },
    ];
    const result = fairAssignOverlapTasks(
      pool2(),
      seats2(),
      history,
      "PM",
      "2026-07-12",
      { seed: 1 },
    );
    // Cold for PM — both seats get tasks (no AM history effect)
    expect(result.assignments).toHaveLength(2);
  });

  it("fairAssign ignores one-offs F4", () => {
    const history: TaskHistoryEvent[] = [
      {
        nightDate: "2026-07-11",
        band: "PM",
        tmId: "tmA",
        taskKey: "T1",
        isOneOff: true,
      },
    ];
    const result = fairAssignOverlapTasks(
      [{ templateId: "T1", label: "Task 1" }],
      [{ dbSlotKey: "overlap_pm_0", tmId: "tmA" }],
      history,
      "PM",
      "2026-07-12",
      { seed: 1, oneOffWeight: 0 },
    );
    expect(result.assignments).toHaveLength(1);
    // cold pairBase for one-off-only history
    expect(result.debug.taskGlobalDue[0]?.due).toBe(31);
  });

  it("n = min(pool,seats); extra seats get no chip", () => {
    const seats: StaffedSeat[] = [
      ...seats2(),
      { dbSlotKey: "overlap_pm_2", tmId: "tmC" },
    ];
    const result = fairAssignOverlapTasks(pool2(), seats, [], "PM", "2026-07-12", {
      seed: 1,
    });
    expect(result.assignments).toHaveLength(2);
  });

  it("seed stable for random fallback", () => {
    const a = randomAssignOverlapTasks(pool3(), seats2(), 99);
    const b = randomAssignOverlapTasks(pool3(), seats2(), 99);
    expect(a.assignments.map((x) => x.task.templateId + x.seat.tmId)).toEqual(
      b.assignments.map((x) => x.task.templateId + x.seat.tmId),
    );
  });
});
