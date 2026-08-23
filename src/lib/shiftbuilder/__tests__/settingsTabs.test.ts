import { describe, expect, it } from "vitest";
import {
  SETTINGS_TABS,
  resolveSettingsTab,
} from "@/app/shiftbuilder/settings/settingsConfig";

describe("settings tabs (PR A)", () => {
  it("exposes Card Defaults, Engine Config, Users, and Audit — not Batch Planner", () => {
    expect(SETTINGS_TABS.map((tab) => tab.id)).toEqual([
      "defaults",
      "engine",
      "users",
      "auditLog",
    ]);
    expect(SETTINGS_TABS.some((tab) => tab.label === "Batch Planner")).toBe(false);
    expect(SETTINGS_TABS.find((tab) => tab.id === "defaults")?.description).toContain(
      "standing OL",
    );
  });

  it("redirects ?tab=planner to Engine Config", () => {
    expect(resolveSettingsTab("planner")).toBe("engine");
    expect(resolveSettingsTab("engine")).toBe("engine");
    expect(resolveSettingsTab("defaults")).toBe("defaults");
    expect(resolveSettingsTab(null)).toBe("defaults");
  });
});
