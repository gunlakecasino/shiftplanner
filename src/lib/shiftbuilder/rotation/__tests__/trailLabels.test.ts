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
    expect(formatCardPlacementTrailLabel("TR1")).toBe("TR1");
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

  it("matches zones and trash", () => {
    expect(trailLabelMatchesSlotKey("Z3", "Z3")).toBe(true);
    expect(trailLabelMatchesSlotKey("TR1", "TR1")).toBe(true);
    expect(trailLabelMatchesSlotKey("T1", "TR1")).toBe(true);
  });
});
