import { describe, expect, it } from "vitest";
import { multiPersonCoverageSourceKeys } from "./printCoverage";

describe("multiPersonCoverageSourceKeys", () => {
  it("suppresses break pills only for sources sharing a covered target", () => {
    const keys = multiPersonCoverageSourceKeys({
      Z1: [
        { tmName: "Alex", sourceKey: "MRR1", taskLabel: "And Zone 1", side: "A" },
        { tmName: "Blair", sourceKey: "WRR1", taskLabel: "And Zone 1", side: "B" },
      ],
      Z2: [{ tmName: "Casey", sourceKey: "MRR2", taskLabel: "And Zone 2" }],
    });

    expect([...keys].sort()).toEqual(["MRR1", "WRR1"]);
  });
});
