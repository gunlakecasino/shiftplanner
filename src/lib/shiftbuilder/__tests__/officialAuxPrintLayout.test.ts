import { describe, expect, it } from "vitest";
import type { AuxDef } from "@/lib/shiftbuilder/placement";
import {
  configuredOfficialAuxDefs,
  officialAuxCardGridShape,
} from "@/app/shiftbuilder/print/OfficialGravesPrintPages";

describe("official AUX print layout", () => {
  it("fits up to five configured AUX cards in one row beside Side Tasks", () => {
    const auxDefs: AuxDef[] = [
      { key: "AUX1", role: "admin", label: "ADMIN", locations: ["Floor Admin"] },
      { key: "AUX2", role: "z9sr", label: "Z9 SR", locations: ["Z9 Smoking Room"] },
      { key: "AUX3", role: "blank", label: "TRAINING", locations: [] },
      { key: "AUX4", role: "job_coach", label: "JOB COACH", locations: ["Job Coach"] },
      { key: "AUX5", role: "support", label: "SUPPORT 1", locations: ["Support"] },
    ];

    const configured = configuredOfficialAuxDefs(auxDefs);

    expect(configured.map((def) => def.key)).toEqual([
      "AUX1",
      "AUX2",
      "AUX3",
      "AUX4",
      "AUX5",
    ]);
    expect(officialAuxCardGridShape(configured.length)).toEqual({
      columns: 5,
      rows: 1,
    });
  });

  it("wraps additional configured AUX cards after the five-column row", () => {
    expect(officialAuxCardGridShape(6)).toEqual({
      columns: 5,
      rows: 2,
    });
  });

  it("omits only truly unconfigured blank shells", () => {
    const auxDefs: AuxDef[] = [
      { key: "AUX1", role: "admin", label: "ADMIN", locations: ["Floor Admin"] },
      { key: "AUX2", role: "blank", label: "", locations: [] },
    ];

    const configured = configuredOfficialAuxDefs(auxDefs);

    expect(configured.map((def) => def.key)).toEqual(["AUX1"]);
    expect(officialAuxCardGridShape(configured.length)).toEqual({
      columns: 1,
      rows: 1,
    });
  });
});
