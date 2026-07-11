import { describe, expect, it } from "vitest";
import {
  normalizeTaskTextStyle,
  remapTaskTextStyleForLabelChange,
  formatTaskLabelTitleCase,
} from "../taskTextStyle";

describe("normalizeTaskTextStyle", () => {
  it("returns null for empty", () => {
    expect(normalizeTaskTextStyle(null)).toBeNull();
    expect(normalizeTaskTextStyle({})).toBeNull();
  });

  it("keeps bold + fontSize", () => {
    expect(normalizeTaskTextStyle({ fontWeight: "bold", fontSizePx: 13 })).toEqual({
      fontWeight: "bold",
      fontSizePx: 13,
    });
  });
});

describe("remapTaskTextStyleForLabelChange", () => {
  it("moves spans when substring survives", () => {
    const style = {
      spans: [{ start: 0, end: 4, bold: true }],
    };
    const next = remapTaskTextStyleForLabelChange(style, "Test room", "Test zone");
    expect(next?.spans?.[0]).toMatchObject({ start: 0, end: 4, bold: true });
  });
});

describe("formatTaskLabelTitleCase", () => {
  it("title-cases words", () => {
    expect(formatTaskLabelTitleCase("sweep high limit")).toMatch(/Sweep/);
  });
});
