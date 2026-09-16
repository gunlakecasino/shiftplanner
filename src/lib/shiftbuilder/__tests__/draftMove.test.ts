import { describe, expect, it } from "vitest";
import { applyDraftMoveOrSwapToMap } from "../draftMove";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("applyDraftMoveOrSwapToMap", () => {
  it("patches TM identity only and never copies additionalCoverageSlots", () => {
    const committed = {
      Z1: {
        tmId: "jessica",
        tmName: "Jessica A",
        additionalCoverageSlots: ["Z2"],
      },
      Z3: {
        tmId: "kaylee",
        tmName: "Kaylee",
        additionalCoverageSlots: ["Z4"],
      },
    };

    const after = applyDraftMoveOrSwapToMap(
      {},
      committed,
      "Z1",
      "Z3",
      { tmId: "jessica", tmName: "Jessica A" },
      { tmId: "kaylee", tmName: "Kaylee" },
    );

    expect(after.Z1).toEqual({
      proposedTmId: "kaylee",
      proposedTmName: "Kaylee",
      previousTmId: "jessica",
      previousTmName: "Jessica A",
    });
    expect(after.Z3).toEqual({
      proposedTmId: "jessica",
      proposedTmName: "Jessica A",
      previousTmId: "kaylee",
      previousTmName: "Kaylee",
    });
    expect(JSON.stringify(after)).not.toContain("additionalCoverageSlots");
    expect(JSON.stringify(after)).not.toContain("additional_coverage_slots");
    expect(committed.Z1.additionalCoverageSlots).toEqual(["Z2"]);
    expect(committed.Z3.additionalCoverageSlots).toEqual(["Z4"]);
  });

  it("clears the source seat in draft without inventing coverage", () => {
    const after = applyDraftMoveOrSwapToMap(
      {},
      { MRR7: { tmId: "gary", tmName: "Gary" } },
      "MRR7",
      "Z3",
      { tmId: "gary", tmName: "Gary" },
      null,
    );
    expect(after.MRR7).toMatchObject({ proposedClear: true });
    expect(after.Z3).toMatchObject({ proposedTmId: "gary", proposedTmName: "Gary" });
    expect(after.Z3).not.toHaveProperty("additionalCoverageSlots");
  });
});

describe("draft apply keeps seat coverage", () => {
  it("buildFinalAssignmentsFromDraft uses clearTmKeepSeatCoverage", () => {
    const runner = readFileSync(
      resolve(process.cwd(), "src/app/shiftbuilder/hooks/useEngineRunner.ts"),
      "utf8",
    );
    expect(runner).toContain("applyDraftMoveOrSwapToMap");
    expect(runner).toContain("clearTmKeepSeatCoverage(newAssignments, slotKey)");
    expect(runner).toContain("additionalCoverageSlots: coverageSlotsOf(current)");
    expect(runner).not.toMatch(/if \(info\.proposedClear\) \{\s*delete newAssignments\[slotKey\]/);
  });
});
