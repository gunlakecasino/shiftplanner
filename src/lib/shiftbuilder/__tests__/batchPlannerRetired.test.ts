import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BATCH_PLANNER_RETIRED_ERROR,
  BATCH_PLANNER_RETIRED_STATUS,
  RETIRED_BATCH_PLANNER_ACTIONS,
  isRetiredBatchPlannerAction,
  retiredBatchPlannerResponse,
} from "../batchPlannerRetired";
import {
  batchRunEngineForNight,
  batchRunEngineForWeek,
  listNightsForWeek,
  listWeeksWithNights,
} from "../sudoBatchPlanner";

const mutationsRoute = readFileSync(
  resolve(process.cwd(), "src/app/api/shiftbuilder/mutations/route.ts"),
  "utf8",
);
const clientWrappers = readFileSync(
  resolve(process.cwd(), "src/lib/shiftbuilder/sudoBatchPlanner.ts"),
  "utf8",
);
const settingsConfig = readFileSync(
  resolve(process.cwd(), "src/app/shiftbuilder/settings/settingsConfig.ts"),
  "utf8",
);
const settingsShell = readFileSync(
  resolve(process.cwd(), "src/app/shiftbuilder/settings/SettingsShell.tsx"),
  "utf8",
);

describe("Batch Planner retired — fail closed", () => {
  it("names the retired mutation actions", () => {
    expect(RETIRED_BATCH_PLANNER_ACTIONS).toEqual([
      "batch_run_engine_week",
      "batch_run_engine_night",
      "list_batch_weeks",
      "list_batch_nights",
    ]);
    for (const action of RETIRED_BATCH_PLANNER_ACTIONS) {
      expect(isRetiredBatchPlannerAction(action)).toBe(true);
    }
    expect(isRetiredBatchPlannerAction("batch_apply_draft")).toBe(false);
    expect(isRetiredBatchPlannerAction("upsert_zone_assignment")).toBe(false);
  });

  it("returns a clear 410, never a silent ok", () => {
    const res = retiredBatchPlannerResponse();
    expect(res.status).toBe(410);
    expect(res.status).toBe(BATCH_PLANNER_RETIRED_STATUS);
    expect(res.error).toBe(
      "Batch Planner retired — use Run Engine → Draft → Apply",
    );
    expect(res.error).toBe(BATCH_PLANNER_RETIRED_ERROR);
    expect(res.error).toMatch(/Run Engine/);
    expect(res.error).toMatch(/Draft/);
    expect(res.error).toMatch(/Apply/);
  });

  it("mutations route hard-disables Batch Planner before any live write", () => {
    expect(mutationsRoute).toContain("isRetiredBatchPlannerAction");
    expect(mutationsRoute).toContain("retiredBatchPlannerResponse");
    expect(mutationsRoute).toContain("BATCH_PLANNER_RETIRED_ERROR");
    expect(mutationsRoute).not.toContain(
      'import(\n          "@/lib/shiftbuilder/sudoBatchPlanner.server"',
    );
    expect(mutationsRoute).not.toContain("batchRunEngineForWeekServer");
    expect(mutationsRoute).not.toContain("batchRunEngineForNightServer");
    expect(mutationsRoute).not.toContain("listWeeksWithNightsServer");
    expect(mutationsRoute).not.toContain("listNightsForWeekServer");
    expect(mutationsRoute).not.toMatch(
      /case "batch_run_engine_week":[\s\S]{0,200}batchRunEngineForWeekServer/,
    );
  });

  it("client wrappers throw the retired error and do not POST", async () => {
    expect(clientWrappers).toContain("BATCH_PLANNER_RETIRED_ERROR");
    expect(clientWrappers).toContain("throw new Error(BATCH_PLANNER_RETIRED_ERROR)");
    expect(clientWrappers).not.toContain('postOpsMutation<BatchWeekResult>("batch_run_engine_week"');
    expect(clientWrappers).not.toContain('postOpsMutation<BatchNightResult>("batch_run_engine_night"');
    expect(clientWrappers).not.toContain('"list_batch_nights"');
    expect(clientWrappers).not.toContain('"list_batch_weeks"');
    await expect(batchRunEngineForWeek("week-1")).rejects.toThrow(BATCH_PLANNER_RETIRED_ERROR);
    await expect(batchRunEngineForNight("night-1")).rejects.toThrow(BATCH_PLANNER_RETIRED_ERROR);
    await expect(listNightsForWeek("week-1")).rejects.toThrow(BATCH_PLANNER_RETIRED_ERROR);
    await expect(listWeeksWithNights()).rejects.toThrow(BATCH_PLANNER_RETIRED_ERROR);
  });

  it("Settings has no planner tab and ?tab=planner still redirects", () => {
    expect(settingsConfig).not.toContain('id: "planner"');
    expect(settingsConfig).toContain('planner: "engine"');
    expect(settingsShell).toContain('if (raw === "planner")');
    expect(settingsShell).toContain('router.replace("/shiftbuilder/settings?tab=engine"');
    expect(settingsShell).not.toContain("<BatchPlannerTab");
  });
});
