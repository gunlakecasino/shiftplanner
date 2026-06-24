// @ts-nocheck
import { describe, it, expect } from "vitest";
import {
  measureDeploymentTaskPressure,
  solveOfficialDeploymentLayout,
} from "./deploymentPrintLayout";
import type { PrintDaySnapshot } from "./printPreviewTypes";

function snapshotWithTasks(
  tasks: Record<string, { id: string; taskLabel: string; isCoverage?: boolean }[]>,
): PrintDaySnapshot {
  return {
    dayIndex: 0,
    day: {
      index: 0,
      name: "Friday",
      short: "Fri",
      dateNum: 15,
      monthYear: "Jun 2026",
      color: "#E85D04",
      date: new Date("2026-06-15"),
      isToday: false,
    },
    assignments: {},
    tasksBySlot: tasks as PrintDaySnapshot["tasksBySlot"],
    auxDefs: [
      { key: "AUX1", label: "Admin", role: "admin" },
      { key: "AUX2", label: "ZSR", role: "zsr" },
    ],
    amOverlapDayName: "Saturday",
    amOverlapDateNum: 16,
    nextDayColor: "#3B82F6",
    breakCounts: { 1: 0, 2: 0, 3: 0, 4: 0 },
  };
}

describe("deploymentPrintLayout", () => {
  it("keeps default flex weights for light task loads with RR and aux pinned", () => {
    const layout = solveOfficialDeploymentLayout(snapshotWithTasks({}));
    expect(layout.zonesFlexGrow).toBeCloseTo(6, 1);
    expect(layout.rrFlexGrow).toBe(0);
    expect(layout.auxFlexGrow).toBe(0);
    expect(layout.density).toBe("normal");
  });

  it("grows zones under heavy tasks without stealing RR or aux flex", () => {
    const tasks = Object.fromEntries(
      Array.from({ length: 6 }, (_, i) => [
        `Z${i + 1}`,
        Array.from({ length: 7 }, (__, j) => ({
          id: `${i}-${j}`,
          taskLabel: `Task ${j}`,
        })),
      ]),
    );
    const layout = solveOfficialDeploymentLayout(snapshotWithTasks(tasks));
    expect(measureDeploymentTaskPressure(snapshotWithTasks(tasks))).toBe(7);
    expect(layout.auxFlexGrow).toBe(0);
    expect(layout.rrFlexGrow).toBe(0);
    expect(layout.zonesFlexGrow).toBeGreaterThan(8);
    expect(layout.density).toBe("tight");
  });
});