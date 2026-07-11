import { describe, expect, it } from "vitest";
import { preferTaskIdFilter } from "../taskMutationIdentity";

describe("preferTaskIdFilter", () => {
  it("prefers taskId over label", () => {
    expect(
      preferTaskIdFilter({
        nightId: "n1",
        slotKey: "zone_1",
        taskId: "uuid-1",
        taskLabel: "Old",
      }),
    ).toEqual({ mode: "id", taskId: "uuid-1" });
  });

  it("falls back to label", () => {
    expect(
      preferTaskIdFilter({
        nightId: "n1",
        slotKey: "zone_1",
        taskLabel: "Sweep",
      }),
    ).toEqual({ mode: "label", taskLabel: "Sweep" });
  });

  it("throws when neither", () => {
    expect(() =>
      preferTaskIdFilter({ nightId: "n1", slotKey: "zone_1" }),
    ).toThrow(/taskId or taskLabel/);
  });
});
