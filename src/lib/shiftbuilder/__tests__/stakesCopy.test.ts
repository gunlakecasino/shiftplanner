import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  APPLY_TO_LIVE_CONFIRM,
  APPLY_TO_LIVE_CONFIRM_LABEL,
  APPLY_TO_LIVE_POINT,
  PUBLISH_DAY_CONFIRM,
  PUBLISH_DAY_CONFIRM_LABEL,
  PUBLISH_WEEK_CONFIRM,
  UNPUBLISH_DAY_CONFIRM,
  UNPUBLISH_DAY_CONFIRM_LABEL,
  UNPUBLISH_WEEK_CONFIRM,
} from "../stakesCopy";

const client = readFileSync(
  resolve(process.cwd(), "src/app/shiftbuilder/ShiftBuilderClient.tsx"),
  "utf8",
);
const floatingNav = readFileSync(
  resolve(process.cwd(), "src/app/shiftbuilder/components/FloatingNav.tsx"),
  "utf8",
);

describe("Apply / Publish stakes copy", () => {
  it("names that TMs see Apply immediately", () => {
    expect(APPLY_TO_LIVE_CONFIRM).toBe(
      "This writes to the live board — TMs will see it immediately.",
    );
    expect(APPLY_TO_LIVE_POINT).toContain("TMs immediately");
    expect(APPLY_TO_LIVE_CONFIRM_LABEL).toBe("Apply to Live");
    expect(client).toContain("APPLY_TO_LIVE_CONFIRM");
    expect(client).toContain("APPLY_TO_LIVE_POINT");
    expect(client).toContain("await confirmDialog(");
  });

  it("Publish Day / Unpublish Day still exist and are not one-click silent", () => {
    expect(PUBLISH_DAY_CONFIRM).toBe(
      "Publishing makes this night visible to TMs on the floor now.",
    );
    expect(UNPUBLISH_DAY_CONFIRM).toBe(
      "Unpublishing hides this night from TMs. The board returns to draft.",
    );
    expect(floatingNav).toContain("Publish Day");
    expect(floatingNav).toContain("Unpublish Day");
    expect(client).toContain("PUBLISH_DAY_CONFIRM");
    expect(client).toContain("UNPUBLISH_DAY_CONFIRM");
    expect(client).toContain("PUBLISH_DAY_CONFIRM_LABEL");
    expect(client).toContain("UNPUBLISH_DAY_CONFIRM_LABEL");
    expect(client).not.toContain(
      "Disable confirm popup when publishing",
    );
    expect(client).toContain("if (!okToToggle)");
  });

  it("week publish / unpublish also confirm with TM-visible stakes", () => {
    expect(PUBLISH_WEEK_CONFIRM).toContain("TMs on the floor now");
    expect(UNPUBLISH_WEEK_CONFIRM).toContain("hides those nights from TMs");
    expect(client).toContain("PUBLISH_WEEK_CONFIRM");
    expect(client).toContain("UNPUBLISH_WEEK_CONFIRM");
    expect(client).toContain("if (!okToToggleWeek)");
  });
});
