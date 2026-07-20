import { describe, expect, it } from "vitest";
import { mapPrintSideTasks } from "./printSideTasks";

describe("mapPrintSideTasks", () => {
  it("puts open urgent work first and resolves assigned display names", () => {
    const tasks = mapPrintSideTasks(
      [
        {
          id: "done",
          title: "Finished item",
          status: "complete",
          priority: "urgent",
          assignee_tm_id: "tm-2",
          completed_at: "2026-07-20T06:15:00.000Z",
          updated_by_name: "Morgan",
          created_at: "2026-07-18T00:00:00.000Z",
        },
        {
          id: "normal",
          title: "Normal item",
          status: "not_started",
          priority: "normal",
          assignee_tm_id: null,
          created_at: "2026-07-19T00:00:00.000Z",
        },
        {
          id: "urgent",
          title: "Urgent item",
          status: "in_progress",
          priority: "urgent",
          assignee_tm_id: "tm-1",
          created_at: "2026-07-20T00:00:00.000Z",
        },
      ],
      new Map([
        ["tm-1", "Avery"],
        ["tm-2", "Jordan"],
      ]),
    );

    expect(tasks.map((task) => task.id)).toEqual(["urgent", "normal", "done"]);
    expect(tasks[0].assigneeName).toBe("Avery");
    expect(tasks[1].assigneeName).toBeNull();
    expect(tasks[2]).toMatchObject({
      assigneeName: "Jordan",
      completed: true,
      completedByName: "Morgan",
      completedAt: "2026-07-20T06:15:00.000Z",
    });
  });

  it("does not expose stale completion metadata on open tasks", () => {
    const [task] = mapPrintSideTasks([
      {
        id: "reopened",
        title: "Reopened",
        status: "in_progress",
        completed_at: "2026-07-20T06:15:00.000Z",
        updated_by_name: "Prior completer",
      },
    ]);

    expect(task.completed).toBe(false);
    expect(task.completedAt).toBeNull();
    expect(task.completedByName).toBeNull();
  });
});
