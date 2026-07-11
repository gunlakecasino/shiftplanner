import { describe, expect, it } from "vitest";
import {
  defaultAuxDefsForNewNight,
  ensureCoreAuxRoles,
  ensureAdminFirst,
  applyAuxRole,
  applyAuxLabel,
  auxUiKeyToDb,
  parseAuxLayoutJson,
  coerceMislabeledAuxRoles,
  inferAuxRoleFromLabel,
  trailKeyFromDbSlotAndLayout,
  remapAssignmentsToAuxKeys,
  ensureAuxShellsForAssignmentKeys,
  roleNthFromAssignmentKey,
} from "../auxLayout";
import { uiToDb, dbToUi } from "../slot-keys";

describe("defaultAuxDefsForNewNight", () => {
  it("always seeds admin + z9sr first", () => {
    const defs = defaultAuxDefsForNewNight();
    expect(defs[0]).toMatchObject({ role: "admin", label: "ADMIN" });
    expect(defs[1]).toMatchObject({ role: "z9sr", label: "Z9 SR" });
    expect(defs.some((d) => d.role === "blank")).toBe(true);
  });
});

describe("ensureCoreAuxRoles", () => {
  it("promotes blanks when admin/z9sr missing", () => {
    const blanks = [
      { key: "AUX1", role: "blank" as const, label: "", locations: [] },
      { key: "AUX2", role: "blank" as const, label: "", locations: [] },
      { key: "AUX3", role: "blank" as const, label: "Custom", locations: [] },
    ];
    const next = ensureCoreAuxRoles(blanks);
    expect(next.find((d) => d.role === "admin")?.label).toBe("ADMIN");
    expect(next.find((d) => d.role === "z9sr")?.label).toBe("Z9 SR");
    expect(next[0].role).toBe("admin");
    expect(next[1].role).toBe("z9sr");
    // Labeled blank preserved
    expect(next.some((d) => d.label === "Custom")).toBe(true);
  });

  it("reorders existing admin/z9sr to front", () => {
    const defs = [
      { key: "AUX1", role: "trash" as const, label: "TRASH 1", locations: [] },
      { key: "AUX2", role: "z9sr" as const, label: "Z9 SR", locations: [] },
      { key: "AUX3", role: "admin" as const, label: "ADMIN", locations: [] },
    ];
    const next = ensureCoreAuxRoles(defs);
    expect(next.map((d) => d.role)).toEqual(["admin", "z9sr", "trash"]);
  });

  it("ensureAdminFirst is alias of ensureCoreAuxRoles", () => {
    const defs = defaultAuxDefsForNewNight();
    expect(ensureAdminFirst(defs)).toEqual(ensureCoreAuxRoles(defs));
  });
});

describe("applyAuxRole + auxUiKeyToDb (Oasis / Trash / Support / JC / STEP)", () => {
  it("numbers oasis / trash / support 1–2 and maps single-instance roles", () => {
    let defs = defaultAuxDefsForNewNight();
    // AUX3..AUX6 are blank shells after admin+z9sr
    defs = applyAuxRole(defs, "AUX3", "oasis");
    defs = applyAuxRole(defs, "AUX4", "oasis");
    defs = applyAuxRole(defs, "AUX5", "trash");
    defs = applyAuxRole(defs, "AUX6", "support");
    // Grow if needed for JC / STEP
    if (defs.length < 8) {
      defs = [
        ...defs,
        { key: "AUX7", role: "blank" as const, label: "", locations: [] },
        { key: "AUX8", role: "blank" as const, label: "", locations: [] },
      ];
    }
    defs = applyAuxRole(defs, "AUX7", "job_coach");
    defs = applyAuxRole(defs, "AUX8", "step_up");

    expect(defs.find((d) => d.key === "AUX3")).toMatchObject({
      role: "oasis",
      label: "OASIS 1",
    });
    expect(defs.find((d) => d.key === "AUX4")).toMatchObject({
      role: "oasis",
      label: "OASIS 2",
    });
    expect(defs.find((d) => d.key === "AUX5")?.label).toBe("TRASH 1");
    expect(defs.find((d) => d.key === "AUX6")?.label).toBe("SUPPORT 1");
    expect(defs.find((d) => d.key === "AUX7")?.label).toBe("JOB COACH");
    expect(defs.find((d) => d.key === "AUX8")?.label).toBe("STEP UP");

    expect(auxUiKeyToDb("AUX3", defs)?.slot_key).toBe("oasis_1");
    expect(auxUiKeyToDb("AUX4", defs)?.slot_key).toBe("oasis_2");
    expect(auxUiKeyToDb("AUX5", defs)?.slot_key).toBe("trash_1");
    expect(auxUiKeyToDb("AUX6", defs)?.slot_key).toBe("support_1");
    expect(auxUiKeyToDb("AUX7", defs)?.slot_key).toBe("job_coach");
    expect(auxUiKeyToDb("AUX8", defs)?.slot_key).toBe("step_up");
  });

  it("round-trips new aux DB keys through uiToDb / dbToUi", () => {
    expect(dbToUi("oasis_1", "aux", null)).toBe("OAS1");
    expect(dbToUi("oasis_2", "aux", null)).toBe("OAS2");
    expect(dbToUi("job_coach", "aux", null)).toBe("JC");
    expect(dbToUi("step_up", "aux", null)).toBe("STEP");
    expect(uiToDb("OAS1").slot_key).toBe("oasis_1");
    expect(uiToDb("JC").slot_key).toBe("job_coach");
    expect(uiToDb("STEP").slot_key).toBe("step_up");
    expect(uiToDb("TSH2").slot_key).toBe("trash_2");
    expect(uiToDb("SUP1").slot_key).toBe("support_1");
  });

  it("parses layout JSON with new roles", () => {
    const parsed = parseAuxLayoutJson([
      { key: "AUX1", role: "admin", label: "ADMIN", locations: [] },
      { key: "AUX2", role: "z9sr", label: "Z9 SR", locations: [] },
      { key: "AUX3", role: "oasis", label: "OASIS 1", locations: ["Oasis"] },
      { key: "AUX4", role: "job_coach", label: "JOB COACH", locations: [] },
      { key: "AUX5", role: "step_up", label: "STEP UP", locations: [] },
    ]);
    expect(parsed?.map((d) => d.role)).toEqual([
      "admin",
      "z9sr",
      "oasis",
      "job_coach",
      "step_up",
    ]);
  });
});

describe("Step Up is opt-in (not permanent) + mislabel repair", () => {
  it("does not seed step_up on a new night", () => {
    const defs = defaultAuxDefsForNewNight();
    expect(defs.some((d) => d.role === "step_up")).toBe(false);
    expect(defs.map((d) => d.role)).toEqual([
      "admin",
      "z9sr",
      "blank",
      "blank",
      "blank",
      "blank",
    ]);
  });

  it("infers step_up from STEP UP label and promotes support shells", () => {
    expect(inferAuxRoleFromLabel("STEP UP")).toBe("step_up");
    expect(inferAuxRoleFromLabel("STEPUP")).toBe("step_up");

    let defs = defaultAuxDefsForNewNight();
    defs = applyAuxRole(defs, "AUX3", "support");
    defs = applyAuxLabel(defs, "AUX3", "STEP UP");
    expect(defs.find((d) => d.key === "AUX3")).toMatchObject({
      role: "step_up",
      label: "STEP UP",
    });
    expect(auxUiKeyToDb("AUX3", defs)?.slot_key).toBe("step_up");
  });

  it("coerces legacy support+STEP UP layout to real step_up role", () => {
    const legacy = [
      { key: "AUX1", role: "admin" as const, label: "ADMIN", locations: ["Floor Admin"] },
      { key: "AUX2", role: "z9sr" as const, label: "Z9 SR", locations: ["Z9 Smoking Room"] },
      {
        key: "AUX3",
        role: "support" as const,
        label: "STEP UP",
        locations: ["Float Support"],
      },
    ];
    const fixed = coerceMislabeledAuxRoles(legacy);
    expect(fixed.find((d) => d.key === "AUX3")?.role).toBe("step_up");
  });

  it("maps support_1 history to STEP when that night's layout was labeled STEP UP", () => {
    const layout = [
      { key: "AUX1", role: "admin" as const, label: "ADMIN", locations: [] },
      { key: "AUX2", role: "z9sr" as const, label: "Z9 SR", locations: [] },
      {
        key: "AUX3",
        role: "support" as const,
        label: "STEP UP",
        locations: ["Float Support"],
      },
    ];
    // Cookie Jul 9: stored as support_1 while shell showed STEP UP
    expect(trailKeyFromDbSlotAndLayout("support_1", "aux", null, layout)).toBe(
      "STEP",
    );
    expect(trailKeyFromDbSlotAndLayout("step_up", "aux", null, layout)).toBe(
      "STEP",
    );
    // Real support without step-up label stays SUP1
    const realSupport = [
      ...layout.slice(0, 2),
      {
        key: "AUX3",
        role: "support" as const,
        label: "SUPPORT 1",
        locations: ["Float Support"],
      },
    ];
    expect(
      trailKeyFromDbSlotAndLayout("support_1", "aux", null, realSupport),
    ).toBe("SUP1");
  });

  it("maps aux_3 ghost rows to STEP when AUX3 is the step_up shell", () => {
    const layout = [
      { key: "AUX1", role: "admin" as const, label: "ADMIN", locations: [] },
      { key: "AUX2", role: "z9sr" as const, label: "Z9 SR", locations: [] },
      {
        key: "AUX3",
        role: "step_up" as const,
        label: "STEP UP",
        locations: ["Step Up"],
      },
    ];
    // uiToDb without auxDefs wrote aux_3 — must not show as AUX3 in trails
    expect(trailKeyFromDbSlotAndLayout("aux_3", "aux", null, layout)).toBe(
      "STEP",
    );
    expect(trailKeyFromDbSlotAndLayout("AUX3", "aux", null, layout)).toBe(
      "STEP",
    );
  });

  it("remaps STEP/admin assignment keys onto AUXn shells so cards show TMs", () => {
    expect(roleNthFromAssignmentKey("STEP")).toEqual({ role: "step_up", nth: 0 });
    expect(roleNthFromAssignmentKey("ADM")).toEqual({ role: "admin", nth: 0 });
    expect(roleNthFromAssignmentKey("SUP1")).toEqual({ role: "support", nth: 0 });

    let defs = defaultAuxDefsForNewNight();
    defs = applyAuxRole(defs, "AUX3", "step_up");
    const remapped = remapAssignmentsToAuxKeys(
      {
        STEP: { tmId: "tm_cookie", tmName: "Cookie", breakGroup: 1 },
        ADM: { tmId: "tm_admin", tmName: "Admin", breakGroup: 2 },
      },
      defs,
    );
    expect(remapped.AUX3?.tmId).toBe("tm_cookie");
    expect(remapped.AUX1?.tmId).toBe("tm_admin");
    expect(remapped.STEP).toBeUndefined();
    expect(remapped.ADM).toBeUndefined();
  });

  it("recreates missing step_up shell when assignment exists but layout lost the role", () => {
    // Layout only has admin + blanks — step_up assignment would vanish without this.
    const defs = defaultAuxDefsForNewNight();
    const ensured = ensureAuxShellsForAssignmentKeys(defs, ["STEP", "ADM"]);
    expect(ensured.some((d) => d.role === "step_up")).toBe(true);
    expect(ensured.some((d) => d.role === "admin")).toBe(true);
    const remapped = remapAssignmentsToAuxKeys(
      { STEP: { tmId: "tm_x", tmName: "X" } },
      ensured,
    );
    const stepKey = ensured.find((d) => d.role === "step_up")!.key;
    expect(remapped[stepKey]?.tmId).toBe("tm_x");
  });
});
