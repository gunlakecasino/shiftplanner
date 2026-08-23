import { describe, expect, it } from "vitest";
import {
  MARKED_OFF_RAIL_LABEL,
  canOfferRestoreSeat,
  markUnavailableToast,
  markedOffChipBadge,
  operatorUnavailableReasonLabel,
  parseRestoreSeat,
  restoreButtonLabel,
  restoreOutcomeCopy,
  restoreSeatLabel,
  seatTakenReason,
  snapshotFromUiAssignments,
  snapshotFromZoneRows,
} from "./markedOffRestore";

describe("marked-off operator language", () => {
  it("uses Marked Off as the rail label", () => {
    expect(MARKED_OFF_RAIL_LABEL).toBe("Marked Off");
  });

  it("says called off only when that reason was chosen", () => {
    expect(operatorUnavailableReasonLabel("called_off")).toBe("called off");
    expect(operatorUnavailableReasonLabel("unavailable")).toBe("unavailable");
    expect(operatorUnavailableReasonLabel(null)).toBe("unavailable");
    expect(operatorUnavailableReasonLabel("pto")).toBe("PTO");
    expect(markedOffChipBadge("called_off")).toBe("call-off");
    expect(markedOffChipBadge("unavailable")).toBe("off");
  });

  it("toasts Mark unavailable as unavailable, not a call-off", () => {
    expect(markUnavailableToast("Alex", "unavailable")).toBe(
      "Alex marked unavailable for tonight",
    );
    expect(markUnavailableToast("Alex", "called_off")).toBe(
      "Alex marked called off for tonight",
    );
  });
});

describe("restore copy honesty", () => {
  it("never claims the seat when only the roster came back", () => {
    expect(
      restoreOutcomeCopy({
        tmName: "Alex",
        restored: "roster",
        seatLabel: "Z4",
      }),
    ).toBe("Alex restored to tonight's roster");
    expect(
      restoreOutcomeCopy({
        tmName: "Alex",
        restored: "roster",
        seatLabel: "Z4",
        blockReason: seatTakenReason("Z4"),
      }),
    ).toBe("Alex restored to tonight's roster — Z4 is already filled");
    expect(restoreOutcomeCopy({ tmName: "Alex", restored: "roster" })).not.toMatch(
      /restored to Z4/,
    );
  });

  it("names the seat only after a successful re-place", () => {
    expect(
      restoreOutcomeCopy({
        tmName: "Alex",
        restored: "seat",
        seatLabel: "Z4",
      }),
    ).toBe("Alex restored to Z4");
  });

  it("offers Restore to Z4 only when the seat is still empty", () => {
    const seat = {
      slotKey: "zone_4",
      slotType: "zone",
      rrSide: null,
      isLocked: true,
      uiKey: "Z4",
    };
    expect(restoreButtonLabel("Z4", canOfferRestoreSeat({ seat }))).toBe(
      "Restore to Z4",
    );
    expect(
      restoreButtonLabel(
        "Z4",
        canOfferRestoreSeat({ seat, occupantTmId: "someone-else" }),
      ),
    ).toBe("Restore");
    expect(restoreButtonLabel(null, false)).toBe("Restore");
  });
});

describe("restore seat snapshot", () => {
  it("picks the primary zone seat and keeps the lock", () => {
    const seat = snapshotFromZoneRows([
      {
        slot_key: "rr_1_2",
        slot_type: "rr",
        rr_side: "mens",
        is_locked: false,
      },
      { slot_key: "zone_4", slot_type: "zone", rr_side: null, is_locked: true },
    ]);
    expect(seat).toEqual({
      slotKey: "zone_4",
      slotType: "zone",
      rrSide: null,
      isLocked: true,
      uiKey: "Z4",
    });
    expect(restoreSeatLabel(seat)).toBe("Z4");
  });

  it("snapshots from live UI assignments", () => {
    const seat = snapshotFromUiAssignments(
      {
        Z4: { tmId: "tm_a", isLocked: true },
        MRR1: { tmId: "tm_b", isLocked: false },
      },
      "tm_a",
    );
    expect(seat?.uiKey).toBe("Z4");
    expect(seat?.isLocked).toBe(true);
    expect(seat?.slotKey).toBe("zone_4");
  });

  it("round-trips stored JSON", () => {
    const parsed = parseRestoreSeat({
      slotKey: "zone_4",
      slotType: "zone",
      rrSide: null,
      isLocked: true,
      uiKey: "Z4",
    });
    expect(parsed?.uiKey).toBe("Z4");
    expect(parsed?.isLocked).toBe(true);
    expect(parseRestoreSeat(null)).toBeNull();
    expect(parseRestoreSeat({ slotKey: "zone_4" })).toBeNull();
  });
});
