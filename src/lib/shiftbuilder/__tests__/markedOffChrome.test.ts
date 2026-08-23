import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

describe("Marked Off operator chrome", () => {
  it("roster rail defaults to Marked Off, not Called Off", () => {
    const rail = read("src/app/shiftbuilder/components/RosterRail.tsx");
    expect(rail).toContain("MARKED_OFF_RAIL_LABEL");
    expect(rail).not.toContain('label="Called Off"');
    expect(rail).not.toContain(">Called Off<");
  });

  it("nav and notes do not say Called Off as the default state", () => {
    const nav = read("src/app/shiftbuilder/components/FloatingNav.tsx");
    const client = read("src/app/shiftbuilder/ShiftBuilderClient.tsx");
    expect(nav).toContain("marked off");
    expect(nav).not.toContain("Called Off");
    expect(client).toContain("unavailable TMs");
    expect(client).not.toContain("Notes for this night (call-offs");
  });

  it("floor guide and engine chrome use marked-off unless the reason is call-off", () => {
    const tutorial = read(
      "src/app/shiftbuilder/components/grave-cover-guide/tutorialScenario.ts",
    );
    const engine = read("src/app/shiftbuilder/sudo/EngineConfigTab.tsx");
    const marker = read("src/app/shiftbuilder/components/MarkerPad.tsx");
    expect(tutorial).toContain("marked off from Z4");
    expect(tutorial).not.toContain("Martinez called off from Z4");
    expect(engine).toContain("marked-off TMs");
    expect(engine).not.toMatch(/operator notes, call-offs,/);
    // Literal reason option stays — operators still choose Called off when that is the reason.
    expect(marker).toContain("Called off");
    expect(marker).toContain("called_off");
  });
});
