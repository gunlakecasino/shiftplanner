import { describe, expect, it } from "vitest";
import {
  formatCardPlacementTrailLabel,
  formatPlacementUiLabel,
  trailLabelMatchesSlotKey,
  buildPlacementTrailLabels,
  canonicalizeAuxSlotKeyForTrail,
  getLastPlacementSequence,
  normalizePlacementIdentity,
} from "../placementPadHelpers";
import { normalizeHistoryUiKey } from "../../constants";

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

  it("maps STEP / JC without treating STEP as support (no startsWith SP)", () => {
    expect(formatCardPlacementTrailLabel("STEP")).toBe("STEP");
    expect(formatCardPlacementTrailLabel("step_up")).toBe("STEP");
    expect(formatCardPlacementTrailLabel("JC")).toBe("JC");
    expect(formatCardPlacementTrailLabel("job_coach")).toBe("JC");
  });

  it("maps ADM and role-bearing AUX shells via that night's layout only", () => {
    expect(formatCardPlacementTrailLabel("ADM")).toBe("ADMIN");
    expect(formatCardPlacementTrailLabel("admin")).toBe("ADMIN");
    const auxDefs = [
      { key: "AUX1", role: "admin", label: "ADMIN" },
      { key: "AUX2", role: "z9sr", label: "Z9 SR" },
    ];
    expect(formatCardPlacementTrailLabel("AUX1", undefined, auxDefs)).toBe("ADMIN");
    expect(formatCardPlacementTrailLabel("AUX2", undefined, auxDefs)).toBe("Z9SR");
  });

  it("maps numbered aux roles to short codes (TSH / SUP / OAS / STEP)", () => {
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

  it("does not invent SP1 for bare AUXn without that night's layout", () => {
    expect(formatCardPlacementTrailLabel("AUX3")).toBe("AUX3");
    expect(formatCardPlacementTrailLabel("AUX8")).toBe("AUX8");
  });
});

describe("canonicalizeAuxSlotKeyForTrail", () => {
  it("maps Step Up shell to STEP using that night's layout", () => {
    const nightA = [
      { key: "AUX1", role: "admin" },
      { key: "AUX2", role: "z9sr" },
      { key: "AUX3", role: "step_up", label: "STEP UP" },
    ];
    expect(canonicalizeAuxSlotKeyForTrail("AUX3", nightA)).toBe("STEP");
  });

  it("does not rewrite yesterday Step Up via today's Support shell", () => {
    // Yesterday AUX3 = Step Up; today AUX3 = Support 1.
    const today = [
      { key: "AUX1", role: "admin" },
      { key: "AUX2", role: "z9sr" },
      { key: "AUX3", role: "support", label: "SUPPORT 1" },
    ];
    // If we wrongly used today's layout for yesterday's AUX3 we'd get SUP1.
    expect(canonicalizeAuxSlotKeyForTrail("AUX3", today)).toBe("SUP1");
    // Correct: already-stable STEP from the placement night is left alone.
    expect(canonicalizeAuxSlotKeyForTrail("STEP", today)).toBe("STEP");
  });
});

describe("buildPlacementTrailLabels", () => {
  it("does not map historical AUXn through tonight's auxDefs (Step Up ≠ SP1)", () => {
    const tonightAux = [
      { key: "AUX1", role: "admin" },
      { key: "AUX2", role: "z9sr" },
      // Tonight AUX3 is Support — must not rewrite yesterday's AUX3 Step Up.
      { key: "AUX3", role: "support", label: "SUPPORT 1" },
    ];
    const history = {
      tmId: "t1",
      tmName: "Test",
      zoneDates: { AUX3: ["2026-07-10"] },
      zoneCounts: { AUX3: 1 },
      totalAssignments: 1,
      totalNights: 1,
      lastDate: "2026-07-10",
    };
    // Without per-night layout, leave AUX3 (never SUP1/SP1 from tonight).
    const labels = buildPlacementTrailLabels(
      history as any,
      "2026-07-11",
      3,
      undefined,
      tonightAux,
    );
    expect(labels).toEqual(["AUX3"]);
    expect(labels[0]).not.toMatch(/^(SP|SUP)/);

    // With correct per-night layout → STEP.
    const labelsFixed = buildPlacementTrailLabels(
      history as any,
      "2026-07-11",
      3,
      undefined,
      tonightAux,
      {
        "2026-07-10": [
          { key: "AUX3", role: "step_up", label: "STEP UP" },
        ],
      },
    );
    expect(labelsFixed).toEqual(["STEP"]);
  });

  it("formats pre-canonical week entries (STEP) without remapping", () => {
    const labels = buildPlacementTrailLabels(
      null,
      "2026-07-11",
      3,
      [{ nightDate: "2026-07-10", slotKey: "STEP" }],
      [{ key: "AUX3", role: "support" }],
    );
    expect(labels).toEqual(["STEP"]);
  });
});

describe("formatPlacementUiLabel (pad matrix + LAST 5)", () => {
  it("never collapses STEP UP into STEPUP or leaves raw SP1", () => {
    expect(formatPlacementUiLabel("STEP")).toBe("STEP");
    expect(formatPlacementUiLabel("step_up")).toBe("STEP");
    expect(formatPlacementUiLabel("SP1")).toBe("SUP1");
    expect(formatPlacementUiLabel("AUX3", "STEP UP", [
      { key: "AUX3", role: "step_up", label: "STEP UP" },
    ])).toBe("STEP");
    // Free-text fallback alone (no role key)
    expect(formatPlacementUiLabel("", "STEP UP")).toBe("STEP");
    expect(formatPlacementUiLabel("STEPUP")).toBe("STEP");
  });
});

describe("normalizeHistoryUiKey / pad LAST 5 sequence", () => {
  it("maps step_up and SP1 to trail vocabulary", () => {
    expect(normalizeHistoryUiKey("step_up")).toBe("STEP");
    expect(normalizeHistoryUiKey("STEP")).toBe("STEP");
    expect(normalizeHistoryUiKey("STEPUP")).toBe("STEP");
    expect(normalizeHistoryUiKey("SP1")).toBe("SUP1");
    expect(normalizeHistoryUiKey("TR2")).toBe("TSH2");
    expect(normalizePlacementIdentity("step_up")).toBe("STEP");
  });

  it("LAST 5 sequence shows STEP not SP1 for step_up history keys", () => {
    const history = {
      tmId: "t1",
      tmName: "Cookie",
      zoneDates: {
        step_up: ["2026-07-10"],
        Z4: ["2026-07-09"],
        SP1: ["2026-07-08"],
      },
      zoneCounts: {},
      totalAssignments: 3,
      totalNights: 3,
      lastDate: "2026-07-10",
    };
    const seq = getLastPlacementSequence(history as any, 5, "2026-07-11");
    expect(seq[0]).toBe("STEP");
    expect(seq).toContain("SUP1");
    expect(seq).not.toContain("SP1");
    expect(seq).not.toContain("step_up");
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
    expect(trailLabelMatchesSlotKey("STEP", "STEP")).toBe(true);
    expect(trailLabelMatchesSlotKey("STEP", "step_up")).toBe(true);
  });
});
