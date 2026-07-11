import { describe, expect, it } from "vitest";
import {
  defaultAuxDefsForNewNight,
  ensureCoreAuxRoles,
  ensureAdminFirst,
  applyAuxRole,
  auxUiKeyToDb,
  parseAuxLayoutJson,
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
