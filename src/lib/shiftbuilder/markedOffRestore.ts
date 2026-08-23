/**
 * Marked-off / Restore helpers for SheetBuilder.
 *
 * Internal storage stays `call_offs`. Operator language is Unavailable /
 * Marked Off unless they explicitly chose Call-off as a reason.
 * Restore may re-place the snapshotted seat when canPlace still allows;
 * copy must never claim the seat if only the roster came back.
 */

import { dbToUi, uiToDb } from "./slot-keys";

export const MARKED_OFF_RAIL_LABEL = "Marked Off";

export type RestoreSeatSnapshot = {
  slotKey: string;
  slotType: string;
  rrSide: "mens" | "womens" | null;
  isLocked: boolean;
  uiKey: string;
};

export type RestoreOutcome = {
  ok: true;
  restored: "seat" | "roster";
  seatLabel?: string;
  uiKey?: string;
  isLocked?: boolean;
  blockReason?: string;
};

type ZoneSeatRow = {
  slot_key?: string | null;
  slot_type?: string | null;
  rr_side?: string | null;
  is_locked?: boolean | null;
};

function compactSeatLabel(uiKey: string, slotKey: string): string {
  const key = uiKey.trim();
  if (!key || key.startsWith("UNK:")) return slotKey || key || "the seat";
  return key;
}

export function restoreSeatLabel(seat: RestoreSeatSnapshot | null | undefined): string | null {
  if (!seat) return null;
  const ui =
    seat.uiKey?.trim() ||
    dbToUi(seat.slotKey, seat.slotType, seat.rrSide ?? null);
  return compactSeatLabel(ui, seat.slotKey);
}

export function parseRestoreSeat(raw: unknown): RestoreSeatSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const slotKey = typeof row.slotKey === "string" ? row.slotKey.trim() : "";
  const slotType = typeof row.slotType === "string" ? row.slotType.trim() : "";
  if (!slotKey || !slotType) return null;
  const rrSide =
    row.rrSide === "mens" || row.rrSide === "womens" ? row.rrSide : null;
  const uiFromRow = typeof row.uiKey === "string" ? row.uiKey.trim() : "";
  const uiKey = uiFromRow || dbToUi(slotKey, slotType, rrSide);
  return {
    slotKey,
    slotType,
    rrSide,
    isLocked: row.isLocked === true,
    uiKey,
  };
}

export function serializeRestoreSeat(seat: RestoreSeatSnapshot): RestoreSeatSnapshot {
  return {
    slotKey: seat.slotKey,
    slotType: seat.slotType,
    rrSide: seat.rrSide ?? null,
    isLocked: !!seat.isLocked,
    uiKey: seat.uiKey,
  };
}

function rankSeat(uiKey: string, slotType: string): number {
  const typeRank =
    slotType === "zone" ? 0 : slotType === "rr" ? 1 : slotType === "aux" ? 2 : 3;
  const z = uiKey.match(/^Z(\d+)$/);
  if (z) return typeRank * 100 + Number(z[1]);
  const rr = uiKey.match(/^[MW]RR(\d+)$/);
  if (rr) return typeRank * 100 + Number(rr[1]);
  return typeRank * 100 + 50;
}

export function snapshotFromZoneRows(
  rows: ZoneSeatRow[] | null | undefined,
): RestoreSeatSnapshot | null {
  if (!rows?.length) return null;
  const seats: RestoreSeatSnapshot[] = [];
  for (const row of rows) {
    const slotKey = typeof row.slot_key === "string" ? row.slot_key.trim() : "";
    const slotType = typeof row.slot_type === "string" ? row.slot_type.trim() : "";
    if (!slotKey || !slotType) continue;
    const rrSide =
      row.rr_side === "mens" || row.rr_side === "womens" ? row.rr_side : null;
    const uiKey = dbToUi(slotKey, slotType, rrSide);
    seats.push({
      slotKey,
      slotType,
      rrSide,
      isLocked: row.is_locked === true,
      uiKey: uiKey.startsWith("UNK:") ? slotKey : uiKey,
    });
  }
  if (seats.length === 0) return null;
  seats.sort(
    (a, b) => rankSeat(a.uiKey, a.slotType) - rankSeat(b.uiKey, b.slotType),
  );
  return seats[0];
}

export function snapshotFromUiAssignments(
  assignments: Record<string, { tmId?: string | null; isLocked?: boolean } | null | undefined>,
  tmId: string,
): RestoreSeatSnapshot | null {
  const id = tmId.trim();
  if (!id) return null;
  const seats: RestoreSeatSnapshot[] = [];
  for (const [uiKey, row] of Object.entries(assignments ?? {})) {
    if (!row || row.tmId !== id) continue;
    try {
      const mapped = uiToDb(uiKey);
      seats.push({
        slotKey: mapped.slot_key,
        slotType: mapped.slot_type,
        rrSide: mapped.rr_side ?? null,
        isLocked: row.isLocked === true,
        uiKey,
      });
    } catch {
      seats.push({
        slotKey: uiKey,
        slotType: "zone",
        rrSide: null,
        isLocked: row.isLocked === true,
        uiKey,
      });
    }
  }
  if (seats.length === 0) return null;
  seats.sort(
    (a, b) => rankSeat(a.uiKey, a.slotType) - rankSeat(b.uiKey, b.slotType),
  );
  return seats[0];
}

export function operatorUnavailableReasonLabel(
  reason: string | null | undefined,
): string {
  const r = (reason ?? "").trim().toLowerCase();
  if (r === "called_off" || r === "call_off" || r === "call-off") return "called off";
  if (r === "pto") return "PTO";
  if (r === "loa") return "LOA";
  if (r === "off") return "off";
  return "unavailable";
}

export function markUnavailableToast(
  tmName: string,
  reason?: string | null,
): string {
  const label = operatorUnavailableReasonLabel(reason);
  if (label === "unavailable") return `${tmName} marked unavailable for tonight`;
  return `${tmName} marked ${label} for tonight`;
}

export function restoreOutcomeCopy(args: {
  tmName: string;
  restored: "seat" | "roster";
  seatLabel?: string | null;
  blockReason?: string | null;
}): string {
  if (args.restored === "seat" && args.seatLabel) {
    return `${args.tmName} restored to ${args.seatLabel}`;
  }
  if (args.blockReason) {
    return `${args.tmName} restored to tonight's roster — ${args.blockReason}`;
  }
  return `${args.tmName} restored to tonight's roster`;
}

export function restoreButtonLabel(
  seatLabel: string | null | undefined,
  canOfferSeat: boolean,
): string {
  if (canOfferSeat && seatLabel) return `Restore to ${seatLabel}`;
  return "Restore";
}

export function seatTakenReason(seatLabel: string): string {
  return `${seatLabel} is already filled`;
}

export function canOfferRestoreSeat(args: {
  seat: RestoreSeatSnapshot | null | undefined;
  occupantTmId?: string | null;
}): boolean {
  if (!args.seat?.uiKey) return false;
  const occupant = typeof args.occupantTmId === "string" ? args.occupantTmId.trim() : "";
  return occupant.length === 0;
}

export function markedOffChipBadge(reason?: string | null): string {
  const label = operatorUnavailableReasonLabel(reason);
  if (label === "called off") return "call-off";
  if (label === "PTO") return "PTO";
  if (label === "LOA") return "LOA";
  return "off";
}
