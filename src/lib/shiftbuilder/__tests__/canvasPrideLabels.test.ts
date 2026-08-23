import { describe, expect, it } from "vitest";
import {
  coverageChipTone,
  formatCanvasCoverageChip,
  formatCanvasRepeatReason,
  formatCanvasRrSideLabel,
  formatCanvasTrailChip,
  parseCanvasRrToken,
} from "../canvasPrideLabels";

describe("formatCanvasRrSideLabel", () => {
  it("puts gender first and keeps the 1+2 station honest", () => {
    expect(formatCanvasRrSideLabel(1, "womens")).toEqual({
      line: "Women's 1+2",
      title: "Women's restroom 1+2",
    });
    expect(formatCanvasRrSideLabel(1, "mens")).toEqual({
      line: "Men's 1+2",
      title: "Men's restroom 1+2",
    });
  });

  it("keeps later rooms gendered without the truncated WOMEN'S suffix", () => {
    expect(formatCanvasRrSideLabel(6, "womens").line).toBe("Women's 6");
    expect(formatCanvasRrSideLabel(7, "womens").line).toBe("Women's 7");
    expect(formatCanvasRrSideLabel(8, "womens").line).toBe("Women's 8");
    expect(formatCanvasRrSideLabel(10, "womens").line).toBe("Women's 10");
    expect(formatCanvasRrSideLabel(10, "mens").line).toBe("Men's 10");
  });

  it("never emits concatenated RR + WOMEN'S debug titles", () => {
    for (const num of [1, 6, 7, 8, 10]) {
      expect(formatCanvasRrSideLabel(num, "womens").line).not.toMatch(/RR .*WOMEN/i);
      expect(formatCanvasRrSideLabel(num, "mens").line).not.toMatch(/RR .*MEN/i);
    }
  });
});

describe("parseCanvasRrToken — gender stays on the named half", () => {
  it("maps WRR / RR*W to women's and MRR / RR*M to men's", () => {
    expect(parseCanvasRrToken("WRR6")).toEqual({ num: 6, side: "womens" });
    expect(parseCanvasRrToken("MRR6")).toEqual({ num: 6, side: "mens" });
    expect(parseCanvasRrToken("RR10W")).toEqual({ num: 10, side: "womens" });
    expect(parseCanvasRrToken("RR10M")).toEqual({ num: 10, side: "mens" });
    expect(parseCanvasRrToken("RR1M")).toEqual({ num: 1, side: "mens" });
  });

  it("does not invent a gender from a bare restroom token", () => {
    expect(parseCanvasRrToken("RR10")).toBeNull();
    expect(parseCanvasRrToken("Restroom 7")).toBeNull();
  });
});

describe("formatCanvasTrailChip", () => {
  it("replaces grey trail codes with human chips", () => {
    expect(formatCanvasTrailChip("RR1M").label).toBe("Men's 1+2");
    expect(formatCanvasTrailChip("RR10M").label).toBe("Men's 10");
    expect(formatCanvasTrailChip("RR8W").label).toBe("Women's 8");
    expect(formatCanvasTrailChip("Z4").label).toBe("Zone 4");
    expect(formatCanvasTrailChip("SUP1").label).toBe("Support 1");
    expect(formatCanvasTrailChip("ADMIN").label).toBe("Admin");
    expect(formatCanvasTrailChip("Z9SR").label).toBe("Z9 SR");
  });

  it("keeps WRR coverage language on the women's half", () => {
    expect(formatCanvasTrailChip("WRR7").label).toBe("Women's 7");
    expect(formatCanvasTrailChip("WRR7").label.startsWith("Men's")).toBe(false);
    expect(formatCanvasTrailChip("MRR7").label).toBe("Men's 7");
    expect(formatCanvasTrailChip("MRR7").label.startsWith("Women's")).toBe(false);
  });
});

describe("formatCanvasCoverageChip", () => {
  it("turns And / + coverage tasks into scanable Covering chips", () => {
    expect(formatCanvasCoverageChip("And Zone 9")).toBe("Covering Zone 9");
    expect(formatCanvasCoverageChip("+ ZONE 6")).toBe("Covering Zone 6");
    expect(formatCanvasCoverageChip("And Women's Restroom 7")).toBe(
      "Covering Women's 7",
    );
    expect(formatCanvasCoverageChip("And Men's Restroom 10")).toBe(
      "Covering Men's 10",
    );
  });

  it("does not leak a women's coverage label onto men's copy", () => {
    expect(formatCanvasCoverageChip("And Women's Restroom 6")).toBe(
      "Covering Women's 6",
    );
    expect(formatCanvasCoverageChip("And Women's Restroom 6").startsWith("Covering Men's")).toBe(false);
  });
});

describe("coverageChipTone", () => {
  it("keeps gold/yellow covering chips readable (no pale-yellow-on-white)", () => {
    const gold = coverageChipTone("#ffcc00");
    expect(gold.ink).toBe("#6B4E00");
    expect(gold.surface).toBe("#F3E4B0");
    expect(gold.surface.toLowerCase()).not.toBe("#ffffff");
    expect(gold.ink.toLowerCase()).not.toBe("#ffffff");
    expect(gold.ink.toLowerCase()).not.toBe("#ffcc00");
  });

  it("maps zone and RR accents to dark same-family ink on tinted paper", () => {
    expect(coverageChipTone("#ff3b30").ink).toBe("#8A1C16");
    expect(coverageChipTone("#C05A98").ink).toBe("#7D3A68");
    expect(coverageChipTone("#007aff").ink).toBe("#004A9E");
    expect(coverageChipTone("#34c759").ink).toBe("#176B32");
    expect(coverageChipTone("#a2845e").surface).not.toBe("#ffffff");
  });
});

describe("formatCanvasRepeatReason", () => {
  it("explains JT's red RR10M as a human restroom repeat", () => {
    expect(formatCanvasRepeatReason("MRR10")).toBe(
      "Same restroom as a recent night: Men's 10",
    );
    expect(formatCanvasRepeatReason("RR10M")).toBe(
      "Same restroom as a recent night: Men's 10",
    );
    expect(formatCanvasRepeatReason("Z4")).toBe(
      "Same zone as a recent night: Zone 4",
    );
  });
});
