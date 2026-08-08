import { describe, expect, it } from "vitest";
import type { AuxDef } from "@/lib/shiftbuilder/placement";
import {
  configuredOfficialAuxDefs,
  officialAuxGridColumnCount,
} from "@/app/shiftbuilder/print/OfficialGravesPrintPages";

describe("official AUX print layout", () => {
  it("keeps all four configured AUX cards and reserves a fifth column for Side Tasks", () => {
    const auxDefs: AuxDef[] = [
      { key: "AUX1", role: "admin", label: "ADMIN", locations: ["Floor Admin"] },
      { key: "AUX2", role: "z9sr", label: "Z9 SR", locations: ["Z9 Smoking Room"] },
      { key: "AUX3", role: "blank", label: "TRAINING", locations: [] },
      { key: "AUX4", role: "job_coach", label: "JOB COACH", locations: ["Job Coach"] },
    ];

    const configured = configuredOfficialAuxDefs(auxDefs);

    expect(configured.map((def) => def.key)).toEqual([
      "AUX1",
      "AUX2",
      "AUX3",
      "AUX4",
    ]);
    expect(officialAuxGridColumnCount(configured.length)).toBe(5);
  });

  it("omits only truly unconfigured blank shells", () => {
    const auxDefs: AuxDef[] = [
      { key: "AUX1", role: "admin", label: "ADMIN", locations: ["Floor Admin"] },
      { key: "AUX2", role: "blank", label: "", locations: [] },
    ];

    const configured = configuredOfficialAuxDefs(auxDefs);

    expect(configured.map((def) => def.key)).toEqual(["AUX1"]);
    expect(officialAuxGridColumnCount(configured.length)).toBe(2);
  });
});
