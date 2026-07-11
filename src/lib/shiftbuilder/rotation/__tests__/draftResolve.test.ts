import { describe, expect, it } from "vitest";
import { resolveSlotAssignmentRow } from "../placementFitForSlot";

describe("resolveSlotAssignmentRow", () => {
  const live = {
    Z1: { tmId: "tm_live", tmName: "Live" },
  };

  it("treats proposedClear as unassigned even if live has a TM", () => {
    const row = resolveSlotAssignmentRow(
      "Z1",
      live,
      true,
      { Z1: { proposedClear: true } },
    );
    expect(row).toBeNull();
  });

  it("accepts draft with proposedTmId only", () => {
    const row = resolveSlotAssignmentRow(
      "Z1",
      live,
      true,
      { Z1: { proposedTmId: "tm_draft" } },
    );
    expect(row?.tmId).toBe("tm_draft");
    expect(row?.tmName).toBe("tm_draft");
  });

  it("prefers draft name when both present", () => {
    const row = resolveSlotAssignmentRow(
      "Z1",
      live,
      true,
      { Z1: { proposedTmId: "tm_d", proposedTmName: "Draft" } },
    );
    expect(row).toEqual({
      tmId: "tm_d",
      tmName: "Draft",
      provenance: undefined,
    });
  });
});
