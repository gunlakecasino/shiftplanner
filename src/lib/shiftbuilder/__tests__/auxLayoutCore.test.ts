import { describe, expect, it } from "vitest";
import {
  defaultAuxDefsForNewNight,
  ensureCoreAuxRoles,
  ensureAdminFirst,
} from "../auxLayout";

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
