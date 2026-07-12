import { describe, expect, it } from "vitest";
import {
  placementRepeatKey,
  placementRepeatKeysMatch,
  formatCardPlacementTrailLabel,
  trailLabelMatchesSlotKey,
  normalizePlacementIdentity,
  shouldShowPlacementFitChip,
} from "../placementPadHelpers";
import { normalizeHistoryUiKey } from "../../constants";

describe("placementRepeatKey", () => {
  it("placementRepeatKey collapses OL-PM-0 and OL-PM-3 to OL-PM", () => {
    expect(placementRepeatKey("OL-PM-0")).toBe("OL-PM");
    expect(placementRepeatKey("OL-PM-3")).toBe("OL-PM");
    expect(placementRepeatKey("OL-PM-5")).toBe("OL-PM");
    expect(placementRepeatKey("OL-PM")).toBe("OL-PM");
  });

  it("placementRepeatKey collapses overlap_pm_3 DB form to OL-PM", () => {
    expect(placementRepeatKey("overlap_pm_3")).toBe("OL-PM");
    expect(placementRepeatKey("overlap_pm")).toBe("OL-PM");
    expect(placementRepeatKey("overlap_am_0")).toBe("OL-AM");
    expect(placementRepeatKey("overlap_am")).toBe("OL-AM");
    expect(placementRepeatKey("OL-AM-2")).toBe("OL-AM");
    expect(placementRepeatKey("OL-AM")).toBe("OL-AM");
  });

  it("placementRepeatKey leaves MRR8/WRR8/Z3 unchanged", () => {
    // RR sides still collapse to area RR8 (existing contract)
    expect(placementRepeatKey("MRR8")).toBe("RR8");
    expect(placementRepeatKey("WRR8")).toBe("RR8");
    expect(placementRepeatKey("Z3")).toBe("Z3");
  });
});

describe("placementRepeatKeysMatch", () => {
  it("placementRepeatKeysMatch true within band false across AM/PM", () => {
    expect(placementRepeatKeysMatch("OL-PM-0", "OL-PM-3")).toBe(true);
    expect(placementRepeatKeysMatch("OL-PM", "OL-PM-4")).toBe(true);
    expect(placementRepeatKeysMatch("overlap_pm_1", "OL-PM-5")).toBe(true);
    expect(placementRepeatKeysMatch("OL-AM-0", "OL-AM-3")).toBe(true);
    expect(placementRepeatKeysMatch("OL-PM-0", "OL-AM-0")).toBe(false);
    expect(placementRepeatKeysMatch("OL-PM", "OL-AM")).toBe(false);
    expect(placementRepeatKeysMatch("overlap_pm_0", "overlap_am_0")).toBe(false);
  });
});

describe("formatCardPlacementTrailLabel OL", () => {
  it("formatCardPlacementTrailLabel maps OL-PM-N and OL-PM to OL-PM", () => {
    expect(formatCardPlacementTrailLabel("OL-PM-0")).toBe("OL-PM");
    expect(formatCardPlacementTrailLabel("OL-PM-3")).toBe("OL-PM");
    expect(formatCardPlacementTrailLabel("OL-PM")).toBe("OL-PM");
    expect(formatCardPlacementTrailLabel("OL-AM-1")).toBe("OL-AM");
    expect(formatCardPlacementTrailLabel("OL-AM")).toBe("OL-AM");
    expect(formatCardPlacementTrailLabel("overlap_pm_3")).toBe("OL-PM");
    expect(formatCardPlacementTrailLabel("overlap_am_0")).toBe("OL-AM");
  });
});

describe("trailLabelMatchesSlotKey OL", () => {
  it("trailLabelMatchesSlotKey band label matches any index", () => {
    expect(trailLabelMatchesSlotKey("OL-PM", "OL-PM-0")).toBe(true);
    expect(trailLabelMatchesSlotKey("OL-PM", "OL-PM-3")).toBe(true);
    expect(trailLabelMatchesSlotKey("OL-PM", "OL-PM-5")).toBe(true);
    expect(trailLabelMatchesSlotKey("OL-AM", "OL-AM-2")).toBe(true);
    expect(trailLabelMatchesSlotKey("OL-PM", "OL-AM-0")).toBe(false);
  });

  it("trailLabelMatchesSlotKey legacy OL-PM-0 chip matches OL-PM-4 slot", () => {
    expect(trailLabelMatchesSlotKey("OL-PM-0", "OL-PM-4")).toBe(true);
    expect(trailLabelMatchesSlotKey("OL-PM-2", "OL-PM-5")).toBe(true);
    expect(trailLabelMatchesSlotKey("OL-AM-0", "OL-AM-3")).toBe(true);
    expect(trailLabelMatchesSlotKey("OL-PM-0", "OL-AM-0")).toBe(false);
  });
});

describe("OL storage identity (no history rewrite)", () => {
  it("normalizePlacementIdentity / normalizeHistoryUiKey keep indexed OL keys", () => {
    // Match/display collapses; storage helpers must not rewrite to band form.
    expect(normalizeHistoryUiKey("OL-PM-3")).toBe("OL-PM-3");
    expect(normalizePlacementIdentity("OL-PM-3")).toBe("OL-PM-3");
    expect(normalizePlacementIdentity("OL-AM-0")).toBe("OL-AM-0");
  });

  it("fit chips remain disabled for OL after band collapse", () => {
    expect(shouldShowPlacementFitChip("OL-PM-0")).toBe(false);
    expect(shouldShowPlacementFitChip("OL-PM")).toBe(false);
    expect(shouldShowPlacementFitChip("overlap_pm_3")).toBe(false);
    expect(shouldShowPlacementFitChip("OL-AM-2")).toBe(false);
  });
});
