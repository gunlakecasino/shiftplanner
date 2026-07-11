import { describe, expect, it } from "vitest";
import {
  aggregateZoneMatrixFromHistory,
  matrixZoneKeyFromSlotKey,
  placedAtFromNightDate,
} from "../matrixRebuild";

describe("matrixZoneKeyFromSlotKey", () => {
  it("passes UI zone keys", () => {
    expect(matrixZoneKeyFromSlotKey("Z3")).toBe("Z3");
    expect(matrixZoneKeyFromSlotKey("Z9SR")).toBe("Z9SR");
  });

  it("maps DB zone keys", () => {
    expect(matrixZoneKeyFromSlotKey("zone_3")).toBe("Z3");
    expect(matrixZoneKeyFromSlotKey("z9_sr")).toBe("Z9SR");
  });

  it("rejects RR/aux", () => {
    expect(matrixZoneKeyFromSlotKey("MRR8")).toBeNull();
    expect(matrixZoneKeyFromSlotKey("ADM")).toBeNull();
  });
});

describe("aggregateZoneMatrixFromHistory", () => {
  const now = new Date("2026-07-11T12:00:00.000Z");

  it("counts 4w/8w/life and last_placed", () => {
    const rows = [
      { slot_key: "Z3", placed_at: "2026-07-01T12:00:00.000Z" },
      { slot_key: "Z3", placed_at: "2026-06-01T12:00:00.000Z" },
      { slot_key: "zone_5", placed_at: "2026-07-05T12:00:00.000Z" },
      { slot_key: "MRR8", placed_at: "2026-07-05T12:00:00.000Z" },
    ];
    const m = aggregateZoneMatrixFromHistory(rows, now);
    expect(m.get("Z3")?.life).toBe(2);
    expect(m.get("Z3")?.c4).toBe(1); // only July 1 within 28d of July 11
    expect(m.get("Z3")?.last).toBe("2026-07-01T12:00:00.000Z");
    expect(m.get("Z5")?.life).toBe(1);
    expect(m.has("MRR8")).toBe(false);
  });

  it("returns empty map when no zone rows", () => {
    expect(aggregateZoneMatrixFromHistory([{ slot_key: "WRR1", placed_at: "2026-07-01T12:00:00.000Z" }], now).size).toBe(0);
  });
});

describe("placedAtFromNightDate", () => {
  it("uses noon UTC", () => {
    expect(placedAtFromNightDate("2026-07-10")).toBe("2026-07-10T12:00:00.000Z");
  });
});
