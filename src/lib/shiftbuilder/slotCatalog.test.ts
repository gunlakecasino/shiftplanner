import { describe, it, expect } from "vitest";
import {
  SLOT_CATALOG,
  slotValue,
  slotEntryFromValue,
  slotCatalogLabel,
  resolveSlotTriple,
  auxDbSlotKey,
  rrDbSlotComposite,
} from "./slotCatalog";

// These lock the DB-key ↔ board-card-key alignment — the exact thing an
// adversarial review caught breaking (aux badges keyed by UI keys). A task's
// stored (slot_key, rr_side) must produce the same composite the board card
// computes for its slot, or badges silently vanish.

describe("slot catalog shape", () => {
  it("covers zones, restrooms (both sides), aux, and both overlaps", () => {
    const bySection = (s: string) => SLOT_CATALOG.filter((e) => e.section === s).length;
    expect(bySection("zone")).toBe(10);
    expect(bySection("rr")).toBe(10); // 5 restrooms × 2 sides
    expect(bySection("aux")).toBeGreaterThanOrEqual(4);
    expect(bySection("am-overlap")).toBe(6);
    expect(bySection("pm-overlap")).toBe(6);
  });

  it("uses DB slot keys (zone_1, rr_1_2, admin, overlap_am_0)", () => {
    const keys = new Set(SLOT_CATALOG.map((e) => e.slotKey));
    expect(keys.has("zone_1")).toBe(true);
    expect(keys.has("rr_1_2")).toBe(true);
    expect(keys.has("admin")).toBe(true);
    expect(keys.has("overlap_am_0")).toBe(true);
    expect(keys.has("overlap_pm_5")).toBe(true);
  });
});

describe("value round-trip", () => {
  it("slotValue ↔ slotEntryFromValue is stable for RR (two sides per key)", () => {
    const mens = slotEntryFromValue(slotValue("rr_6", "mens"));
    const womens = slotEntryFromValue(slotValue("rr_6", "womens"));
    expect(mens?.rrSide).toBe("mens");
    expect(womens?.rrSide).toBe("womens");
    expect(mens?.slotType).toBe("rr");
  });
});

describe("resolveSlotTriple (server authority)", () => {
  it("returns all-null for empty", () => {
    expect(resolveSlotTriple(null, null)).toEqual({ slotKey: null, slotType: null, rrSide: null });
  });
  it("derives slotType from a zone key regardless of client-sent type", () => {
    expect(resolveSlotTriple("zone_4", null)).toEqual({ slotKey: "zone_4", slotType: "zone", rrSide: null });
  });
  it("derives type + keeps side for a restroom", () => {
    expect(resolveSlotTriple("rr_6", "mens")).toEqual({ slotKey: "rr_6", slotType: "rr", rrSide: "mens" });
  });
  it("derives aux type", () => {
    expect(resolveSlotTriple("admin", null)).toEqual({ slotKey: "admin", slotType: "aux", rrSide: null });
  });
});

describe("board card key alignment", () => {
  it("aux role → the same DB key a catalog aux task carries", () => {
    expect(auxDbSlotKey("admin", "ADM")).toBe("admin");
    expect(auxDbSlotKey("z9sr", "Z9SR")).toBe("z9_sr");
    expect(auxDbSlotKey("trash", "TR1")).toBe("trash_1");
    expect(auxDbSlotKey("oasis", "OAS1")).toBe("oasis_1");
    expect(auxDbSlotKey("job_coach", "JC")).toBe("job_coach");
    expect(auxDbSlotKey("step_up", "STEP")).toBe("step_up");
    // custom/unknown role → fallback
    expect(auxDbSlotKey("blank", "AUX7")).toBe("AUX7");
  });

  it("catalog includes oasis / job coach / step up aux entries", () => {
    const keys = new Set(SLOT_CATALOG.map((e) => e.slotKey));
    expect(keys.has("oasis_1")).toBe(true);
    expect(keys.has("job_coach")).toBe(true);
    expect(keys.has("step_up")).toBe(true);
  });


  it("RR composite matches a stored RR task's composite", () => {
    // Task stored as slot_key='rr_6', rr_side='mens' → composite 'rr_6|mens'
    expect(rrDbSlotComposite(6, "mens")).toBe("rr_6|mens");
    // RR 1+2 special case
    expect(rrDbSlotComposite(1, "womens")).toBe("rr_1_2|womens");
  });

  it("catalog label reads back for a stored slot", () => {
    expect(slotCatalogLabel("zone_4", null)).toBe("Zone 4");
    expect(slotCatalogLabel("rr_6", "womens")).toBe("RR 6 (Women's)");
    expect(slotCatalogLabel(null, null)).toBeNull();
  });
});
