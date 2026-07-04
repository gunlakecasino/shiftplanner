import { describe, it, expect } from "vitest";
import { distributeTasks } from "./pools";

describe("distributeTasks — round_robin", () => {
  it("cycles members in order across tasks", () => {
    const result = distributeTasks(["t1", "t2", "t3", "t4", "t5"], ["a", "b"], "round_robin");
    expect(result).toEqual([
      { taskId: "t1", assigneeTmId: "a" },
      { taskId: "t2", assigneeTmId: "b" },
      { taskId: "t3", assigneeTmId: "a" },
      { taskId: "t4", assigneeTmId: "b" },
      { taskId: "t5", assigneeTmId: "a" },
    ]);
  });

  it("gives each task a distinct member when members >= tasks", () => {
    const result = distributeTasks(["t1", "t2", "t3"], ["a", "b", "c", "d"], "round_robin");
    expect(result.map((r) => r.assigneeTmId)).toEqual(["a", "b", "c"]);
  });
});

describe("distributeTasks — random", () => {
  it("is deterministic for a given seed", () => {
    const a = distributeTasks(["t1", "t2", "t3"], ["a", "b", "c"], "random", 42);
    const b = distributeTasks(["t1", "t2", "t3"], ["a", "b", "c"], "random", 42);
    expect(a).toEqual(b);
  });

  it("assigns every task to some member", () => {
    const members = ["a", "b", "c"];
    const result = distributeTasks(["t1", "t2", "t3", "t4"], members, "random", 7);
    expect(result).toHaveLength(4);
    for (const r of result) expect(members).toContain(r.assigneeTmId);
  });
});

describe("distributeTasks — edge cases", () => {
  it("returns nothing for manual mode", () => {
    expect(distributeTasks(["t1"], ["a"], "manual")).toEqual([]);
  });

  it("returns nothing with no members", () => {
    expect(distributeTasks(["t1", "t2"], [], "round_robin")).toEqual([]);
  });

  it("returns nothing with no tasks", () => {
    expect(distributeTasks([], ["a", "b"], "round_robin")).toEqual([]);
  });
});
