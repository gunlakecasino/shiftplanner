import { describe, expect, it } from "vitest";
import {
  formatCardPlacementTrailLabel,
  trailLabelMatchesSlotKey,
} from "../placementPadHelpers";

describe("formatCardPlacementTrailLabel", () => {
  it("keeps restroom side (M/W) so trails are not ambiguous", () => {
    expect(formatCardPlacementTrailLabel("MRR8")).toBe("RR8M");
    expect(formatCardPlacementTrailLabel("WRR8")).toBe("RR8W");
    expect(formatCardPlacementTrailLabel("MRR1")).toBe("RR1M");
  });

  it("formats zones and trash clearly", () => {
    expect(formatCardPlacementTrailLabel("Z3")).toBe("Z3");
    expect(formatCardPlacementTrailLabel("Z9SR")).toBe("Z9SR");
    // Legacy TR/SP UI keys → short trail codes
    expect(formatCardPlacementTrailLabel("TR1")).toBe("TSH1");
    expect(formatCardPlacementTrailLabel("SP2")).toBe("SUP2");
    expect(formatCardPlacementTrailLabel("OAS1")).toBe("OAS1");
  });

  it("maps ADM and role-bearing AUX shells to ADMIN / Z9SR", () => {
    expect(formatCardPlacementTrailLabel("ADM")).toBe("ADMIN");
    expect(formatCardPlacementTrailLabel("admin")).toBe("ADMIN");
    const auxDefs = [
      { key: "AUX1", role: "admin", label: "ADMIN" },
      { key: "AUX2", role: "z9sr", label: "Z9 SR" },
    ];
    expect(formatCardPlacementTrailLabel("AUX1", undefined, auxDefs)).toBe("ADMIN");
    expect(formatCardPlacementTrailLabel("AUX2", undefined, auxDefs)).toBe("Z9SR");
  });

  it("maps numbered aux roles to short codes (TSH / SUP / OAS)", () => {
    const auxDefs = [
      { key: "AUX1", role: "admin", label: "ADMIN" },
      { key: "AUX2", role: "z9sr", label: "Z9 SR" },
      { key: "AUX3", role: "trash", label: "TRASH 1" },
      { key: "AUX4", role: "trash", label: "TRASH 2" },
      { key: "AUX5", role: "support", label: "SUPPORT 1" },
      { key: "AUX6", role: "oasis", label: "OASIS 1" },
      { key: "AUX7", role: "job_coach", label: "JOB COACH" },
      { key: "AUX8", role: "step_up", label: "STEP UP" },
    ];
    expect(formatCardPlacementTrailLabel("AUX3", undefined, auxDefs)).toBe("TSH1");
    expect(formatCardPlacementTrailLabel("AUX4", undefined, auxDefs)).toBe("TSH2");
    expect(formatCardPlacementTrailLabel("AUX5", undefined, auxDefs)).toBe("SUP1");
    expect(formatCardPlacementTrailLabel("AUX6", undefined, auxDefs)).toBe("OAS1");
    expect(formatCardPlacementTrailLabel("AUX7", undefined, auxDefs)).toBe("JC");
    expect(formatCardPlacementTrailLabel("AUX8", undefined, auxDefs)).toBe("STEP");
  });
});

describe("trailLabelMatchesSlotKey", () => {
  it("matches RR8M/RR8W to either side of the same RR number (area critical)", () => {
    expect(trailLabelMatchesSlotKey("RR8M", "MRR8")).toBe(true);
    expect(trailLabelMatchesSlotKey("RR8W", "WRR8")).toBe(true);
    // Same restroom number is one rotation area (engine prior-3 merges sides).
    expect(trailLabelMatchesSlotKey("RR8M", "WRR8")).toBe(true);
    expect(trailLabelMatchesSlotKey("RR8M", "MRR6")).toBe(false);
  });

  it("matches bare RR8 to either side (area-level)", () => {
    expect(trailLabelMatchesSlotKey("RR8", "MRR8")).toBe(true);
    expect(trailLabelMatchesSlotKey("RR8", "WRR8")).toBe(true);
  });

  it("matches zones and trash (legacy TR + short TSH)", () => {
    expect(trailLabelMatchesSlotKey("Z3", "Z3")).toBe(true);
    expect(trailLabelMatchesSlotKey("TR1", "TR1")).toBe(true);
    expect(trailLabelMatchesSlotKey("T1", "TR1")).toBe(true);
    expect(trailLabelMatchesSlotKey("TSH1", "TR1")).toBe(true);
    expect(trailLabelMatchesSlotKey("SUP2", "SP2")).toBe(true);
    expect(trailLabelMatchesSlotKey("OAS1", "OAS1")).toBe(true);
  });
});
