import { describe, expect, it } from "vitest";
import {
  buildBoardTaskSummary,
  type BoardProjectPill,
} from "@/app/shiftbuilder/hooks/useBoardTaskSummary";
import { combinedProjects } from "@/app/shiftbuilder/components/CardProjectPills";

describe("board project pills", () => {
  it("maps an exact-date parent project to both its assigned TM and zone", () => {
    const summary = buildBoardTaskSummary(
      [
        {
          dueDate: "2026-07-27",
          assigneeTmId: "tm-7",
          slotKey: "zone_7",
          rrSide: null,
          projectId: "project-side-tasks",
        },
      ],
      [
        {
          id: "project-side-tasks",
          title: "Check Side Tasks",
          taskColor: "#AF52DE",
        },
      ],
      "2026-07-27",
    );

    expect(summary.projectsByTm["tm-7"]).toEqual([
      {
        projectId: "project-side-tasks",
        title: "Check Side Tasks",
        color: "#AF52DE",
      },
    ]);
    expect(summary.projectsBySlot.zone_7).toEqual(summary.projectsByTm["tm-7"]);
  });

  it("deduplicates multiple tasks from the same project on one card", () => {
    const task = {
      dueDate: "2026-07-27",
      assigneeTmId: "tm-7",
      slotKey: null,
      rrSide: null,
      projectId: "project-side-tasks",
    };
    const summary = buildBoardTaskSummary(
      [task, task],
      [{ id: "project-side-tasks", title: "Check Side Tasks", taskColor: null }],
      "2026-07-27",
    );

    expect(summary.projectsByTm["tm-7"]).toHaveLength(1);
    expect(summary.projectsByTm["tm-7"][0].color).toBe("#AF52DE");
    expect(summary.byTm["tm-7"].open).toBe(2);
  });

  it("keeps overdue work in counts without carrying its project pill to a later date", () => {
    const summary = buildBoardTaskSummary(
      [
        {
          dueDate: "2026-07-26",
          assigneeTmId: "tm-7",
          slotKey: "zone_7",
          rrSide: null,
          projectId: "project-side-tasks",
        },
      ],
      [{ id: "project-side-tasks", title: "Check Side Tasks", taskColor: null }],
      "2026-07-27",
    );

    expect(summary.total).toBe(1);
    expect(summary.overdue).toBe(1);
    expect(summary.projectsByTm["tm-7"]).toBeUndefined();
    expect(summary.projectsBySlot.zone_7).toBeUndefined();
  });

  it("merges TM and slot project sources without repeating the same pill", () => {
    const project: BoardProjectPill = {
      projectId: "project-side-tasks",
      title: "Check Side Tasks",
      color: "#AF52DE",
    };

    expect(combinedProjects([project], [project])).toEqual([project]);
  });
});
