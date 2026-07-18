import { describe, it, expect } from "vitest";
import {
  measureDeploymentTaskPressure,
  solveOfficialDeploymentLayout,
} from "@/app/shiftbuilder/print/deploymentPrintLayout";
import type { PrintDaySnapshot } from "@/app/shiftbuilder/print/printPreviewTypes";

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
    } as PrintDaySnapshot["day"],
    assignments: {},
    tasksBySlot: tasks as PrintDaySnapshot["tasksBySlot"],
    auxDefs: [
      { key: "AUX1", label: "Admin", role: "admin", locations: [] },
      { key: "AUX2", label: "Z9 SR", role: "z9sr", locations: [] },
    ],
    amOverlapDayName: "Saturday",
    amOverlapDateNum: 16,
    nextDayColor: "#3B82F6",
    breakCounts: { 1: 0, 2: 0, 3: 0, 4: 0 },
  };
}

describe("deploymentPrintLayout (11px + adaptive aux)", () => {
  it("defaults to 11px task type", () => {
    const layout = solveOfficialDeploymentLayout(snapshotWithTasks({}));
    expect(layout.taskFontPx).toBe(11);
    expect(layout.taskDenseFontPx).toBe(11);
    expect(layout.auxFlexGrow).toBe(0);
  });

  it("grows aux flex when aux cards carry multiple tasks", () => {
    const layout = solveOfficialDeploymentLayout(
      snapshotWithTasks({
        AUX1: [
          { id: "a1", taskLabel: "One" },
          { id: "a2", taskLabel: "Two" },
          { id: "a3", taskLabel: "Three" },
        ],
      }),
    );
    expect(layout.auxFlexGrow).toBeGreaterThan(0);
    expect(layout.taskFontPx).toBe(11);
  });

  it("grows zones under heavy load without shrinking type first", () => {
    const tasks = Object.fromEntries(
      Array.from({ length: 6 }, (_, i) => [
        `Z${i + 1}`,
        Array.from({ length: 7 }, (__, j) => ({
          id: `${i}-${j}`,
          taskLabel: `Task ${j}`,
        })),
      ]),
    );
    const snap = snapshotWithTasks(tasks);
    expect(measureDeploymentTaskPressure(snap)).toBe(7);
    const layout = solveOfficialDeploymentLayout(snap);
    expect(layout.zonesFlexGrow).toBeGreaterThan(8);
    expect(layout.taskFontPx).toBe(11);
  });
});
