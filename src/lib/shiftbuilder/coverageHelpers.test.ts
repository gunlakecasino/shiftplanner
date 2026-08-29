import { describe, expect, it } from "vitest";
import {
  buildCoverageLabelIndex,
  buildCoveredByIndex,
  canonicalCoverageTargetKey,
  dedupeCoveredByEntries,
  expandCoverageToKeys,
  getSlotCoverageLabel,
  parseCoverageTargetFromTaskLabel,
  persistSlotForCoverageSource,
} from "./coverageHelpers";
import { uiToDb } from "./slot-keys";

describe("gendered restroom coverage labels", () => {
  it("labels WRR and MRR distinctly", () => {
    expect(getSlotCoverageLabel("WRR7")).toBe("Women's Restroom 7");
    expect(getSlotCoverageLabel("MRR7")).toBe("Men's Restroom 7");
    expect(getSlotCoverageLabel("WRR6")).toBe("Women's Restroom 6");
    expect(getSlotCoverageLabel("MRR6")).toBe("Men's Restroom 6");
    expect(getSlotCoverageLabel("Z7")).toBe("Zone 7");
  });

  it("indexes gendered restroom labels to the matching half", () => {
    const index = buildCoverageLabelIndex();
    expect(index.get("Women's Restroom 7")).toBe("WRR7");
    expect(index.get("Men's Restroom 7")).toBe("MRR7");
    expect(index.get("Restroom 7")).toBeUndefined();
    expect(index.get("RR 7")).toBeUndefined();
  });
});

describe("Brian 2026-08-23 — WRR6 covering WRR7 must not leak to men's", () => {
  const assignments = {
    WRR6: { tmId: "amanda", tmName: "Amanda" },
    MRR6: { tmId: "gary", tmName: "Gary" },
    WRR7: { tmId: null, tmName: "" },
    MRR7: { tmId: "drew", tmName: "Drew" },
  };

  it("does not put WRR6's coverage task or covered-by onto MRR6 / MRR7", () => {
    const selectedTasks = {
      WRR6: [
        {
          id: "cov-wrr6-wrr7",
          taskLabel: "And Women's Restroom 7",
          isCoverage: true,
        },
      ],
    };

    const coveredBy = buildCoveredByIndex(assignments, selectedTasks);

    expect(coveredBy.WRR7).toMatchObject([
      { tmName: "Amanda", sourceKey: "WRR6" },
    ]);
    expect(coveredBy.MRR7).toBeUndefined();
    expect(coveredBy.MRR6).toBeUndefined();
    expect(coveredBy.WRR6).toBeUndefined();
    expect(selectedTasks.MRR6).toBeUndefined();
  });

  it("parses legacy And Restroom 7 from a women's source as WRR7 only", () => {
    const index = buildCoverageLabelIndex();
    expect(
      parseCoverageTargetFromTaskLabel("And Restroom 7", index, "WRR6"),
    ).toBe("WRR7");
    expect(
      parseCoverageTargetFromTaskLabel("And Restroom 7", index, "MRR6"),
    ).toBe("MRR7");
    expect(
      parseCoverageTargetFromTaskLabel("And Restroom 7", index, "Z6"),
    ).toBeNull();

    const coveredBy = buildCoveredByIndex(assignments, {
      WRR6: [{ taskLabel: "And Restroom 7", isCoverage: true }],
    });

    expect(coveredBy.WRR7).toMatchObject([
      { tmName: "Amanda", sourceKey: "WRR6" },
    ]);
    expect(coveredBy.MRR7).toBeUndefined();
  });

  it("does not expand a gendered RR target onto the other half", () => {
    expect(expandCoverageToKeys("WRR7")).toEqual(["WRR7"]);
    expect(expandCoverageToKeys("MRR7")).toEqual(["MRR7"]);
    expect(expandCoverageToKeys("Z7")).toEqual(["Z7"]);
  });

  it("persists rr_side from the gendered source key and never null for MRR/WRR", () => {
    expect(persistSlotForCoverageSource("WRR6")).toMatchObject({
      slot_key: "rr_6",
      slot_type: "rr",
      rr_side: "womens",
    });
    expect(persistSlotForCoverageSource("MRR6")).toMatchObject({
      slot_key: "rr_6",
      slot_type: "rr",
      rr_side: "mens",
    });
    expect(uiToDb("WRR6").rr_side).toBe("womens");
    expect(uiToDb("MRR7").rr_side).toBe("mens");
  });

  it("keeps men's RR→RR coverage on the men's half only", () => {
    const coveredBy = buildCoveredByIndex(
      {
        MRR6: { tmId: "gary", tmName: "Gary" },
        WRR6: { tmId: "amanda", tmName: "Amanda" },
      },
      {
        MRR6: [{ taskLabel: "And Men's Restroom 7", isCoverage: true }],
      },
    );
    expect(coveredBy.MRR7).toMatchObject([{ tmName: "Gary", sourceKey: "MRR6" }]);
    expect(coveredBy.WRR7).toBeUndefined();
  });

  it("does not expand an explicit cross-gender RR label onto the other half", () => {
    const coveredBy = buildCoveredByIndex(
      { WRR6: { tmId: "amanda", tmName: "Amanda" } },
      { WRR6: [{ taskLabel: "And Men's Restroom 7", isCoverage: true }] },
    );
    expect(coveredBy.MRR7).toMatchObject([{ tmName: "Amanda", sourceKey: "WRR6" }]);
    expect(coveredBy.WRR7).toBeUndefined();
  });

  it("does not expand an explicit Zone→WRR target onto the men's half", () => {
    const coveredBy = buildCoveredByIndex(
      { Z3: { tmId: "kathy", tmName: "Kathy" } },
      { Z3: [{ taskLabel: "And Women's Restroom 7", isCoverage: true }] },
    );
    expect(coveredBy.WRR7).toMatchObject([{ tmName: "Kathy", sourceKey: "Z3" }]);
    expect(coveredBy.MRR7).toBeUndefined();
  });

  it("leaves zone-to-zone coverage on the named zone only", () => {
    const coveredBy = buildCoveredByIndex(
      { Z3: { tmId: "kathy", tmName: "Kathy" } },
      { Z3: [{ taskLabel: "And Zone 4", isCoverage: true }] },
    );
    expect(coveredBy.Z4).toMatchObject([{ tmName: "Kathy", sourceKey: "Z3" }]);
    expect(coveredBy.Z3).toBeUndefined();
  });
});

describe("Z9SR / AUX2 is one seat", () => {
  const z9Layout = [{ key: "AUX2", role: "z9sr" as const, label: "Z9 SR", locations: [] }];

  it("canonicalizes Z9SR onto tonight's z9sr AUX shell", () => {
    expect(canonicalCoverageTargetKey("Z9SR", z9Layout)).toBe("AUX2");
    expect(canonicalCoverageTargetKey("AUX2", z9Layout)).toBe("AUX2");
    expect(canonicalCoverageTargetKey("Z3", z9Layout)).toBe("Z3");
  });

  it("renders one TM once when two coverage tasks alias the same Z9 SR seat", () => {
    const coveredBy = buildCoveredByIndex(
      { Z3: { tmId: "sheri", tmName: "Sheri O" } },
      {
        Z3: [
          { id: "a", taskLabel: "And Zone 9 Smoking Room", isCoverage: true, coverageSide: "A" },
          { id: "b", taskLabel: "And Z9 SR", isCoverage: true, coverageSide: "B" },
        ],
      },
      z9Layout,
    );

    expect(coveredBy.AUX2).toHaveLength(1);
    expect(coveredBy.AUX2).toMatchObject([{ tmName: "Sheri O", sourceKey: "Z3" }]);
    expect(coveredBy.Z9SR).toBeUndefined();
  });

  it("dedupes the same coverer even when A/B sides were already assigned", () => {
    expect(
      dedupeCoveredByEntries([
        { tmName: "Sheri O", tmId: "sheri", side: "A", sourceKey: "Z3", taskLabel: "And AUX2" },
        { tmName: "Sheri O", tmId: "sheri", side: "B", sourceKey: "Z3", taskLabel: "And Z9SR" },
      ]),
    ).toHaveLength(1);
  });
});
