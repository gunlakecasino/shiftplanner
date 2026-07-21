import { describe, expect, it } from "vitest";
import {
  hasPrintAssigneeName,
  printAssigneeName,
} from "@/app/shiftbuilder/print/printAssigneeName";

describe("printAssigneeName", () => {
  it("never treats a dash as the assigned TM name when a tmId exists", () => {
    expect(printAssigneeName("-", "tm_gage")).toBe("Gage");
    expect(hasPrintAssigneeName("-", "tm_gage")).toBe(true);
  });

  it("preserves real display names", () => {
    expect(printAssigneeName(" Gage ", "tm_gage")).toBe("Gage");
  });

  it("keeps genuinely empty slots empty", () => {
    expect(printAssigneeName("-", null)).toBeNull();
    expect(hasPrintAssigneeName(undefined, undefined)).toBe(false);
  });
});
