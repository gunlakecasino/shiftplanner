/**
 * Card-level VECTORS — standing marks on a slot, not a TM.
 *
 * Exactly three. A zone / restroom / aux / overlap card can hold ONE.
 * The mark stays on the card when the TM is cleared or moved.
 */

import { dbToUi } from "./slot-keys";

export const CARD_VECTOR_IDS = ["sweep_9_10_sr", "sweep_5_8_hl", "laundry"] as const;

export type CardVector = (typeof CARD_VECTOR_IDS)[number];

export const CARD_VECTOR_SWEEP_INK = "#f15a29";
export const CARD_VECTOR_LAUNDRY_INK = "#1c75bc";

export const CARD_VECTOR_META: Record<
  CardVector,
  { id: CardVector; ink: string; label: string; ariaLabel: string }
> = {
  sweep_9_10_sr: {
    id: "sweep_9_10_sr",
    ink: CARD_VECTOR_SWEEP_INK,
    label: "Sweep 9 | 10 | SR",
    ariaLabel: "Sweep 9, 10, SR",
  },
  sweep_5_8_hl: {
    id: "sweep_5_8_hl",
    ink: CARD_VECTOR_SWEEP_INK,
    label: "Sweep 5 | 8 | HL",
    ariaLabel: "Sweep 5, 8, HL",
  },
  laundry: {
    id: "laundry",
    ink: CARD_VECTOR_LAUNDRY_INK,
    label: "Laundry",
    ariaLabel: "Laundry",
  },
};

/** Brian's shipped artwork. Do not redraw or recreate as <text>. */
export const CARD_VECTOR_SRC: Record<CardVector, string> = {
  sweep_9_10_sr: "/card-vectors/sweep-9-10-sr.svg",
  sweep_5_8_hl: "/card-vectors/sweep-5-8-hl.svg",
  laundry: "/card-vectors/laundry.svg",
};

/** Intrinsic viewBoxes of the shipped files — keeps <img> from defaulting huge. */
export const CARD_VECTOR_VIEWBOX: Record<CardVector, { width: number; height: number }> = {
  sweep_9_10_sr: { width: 100.96, height: 16.2 },
  sweep_5_8_hl: { width: 99.64, height: 14.63 },
  laundry: { width: 40.87, height: 14.34 },
};

/** Leftover sweeper chips that used to stand in for vectors. Do not show as the mark. */
export const LEGACY_SWEEPER_TASK_LABELS = [
  "Sweep 9/10/SR",
  "Sweep 9 / 10 / SR",
  "Sweeper 9 / 10 / SR",
  "Sweep 5/8/HL",
  "Sweep 5 / 8 / HL",
  "Sweeper 5 / 8 / HL",
] as const;

/**
 * Canned zone / RR duty titles that auto-seed from Card Defaults
 * (`ops_work_items.is_slot_default`) plus leftover official-print aliases.
 * Desk cards hide these. Coverage banners, extra-coverage chips, and real
 * custom tasks stay. Overlap standing-pool titles are intentionally omitted.
 */
export const CANNED_DEFAULT_DESK_TASK_LABELS = [
  // Live zone slot defaults
  "Zone 1 Elevators + Stairwells",
  "Zone 1 Self Serve Station",
  "Lobby Restrooms + Trash",
  "Zone 3 Self Serve Station",
  "Poker Room: Clean Black Drink Trays",
  "High Limit Table Games",
  "Promo Stage",
  "Team Member Locker Room",
  "Team Member Smoking Room",
  "Zone 6 Entry Door Glass",
  "Zone 6 Outside Smoking Area",
  "Pit 1 + 2: Trash",
  "Pit 1 + 2: Vacuum",
  "Zone 7 Self Serve Station",
  "Zone 7 Smoking Room",
  "Pit 3: Trash",
  "Pit 3: Vacuum",
  "Social Bar Tables",
  "High Limit Slots Restroom",
  "Pit 4: Trash",
  "Pit 4: Vacuum",
  "Zone 10 Outdoor Smoking Area",
  "Zone 10 Self Serve Station",
  // Live RR slot defaults (same canned list, also lands on desk cards)
  "Buffet Restroom (After Lunch)",
  "Zone 1 Family Restroom",
  "C.B.K. Locker Rooms",
  "131 Restroom",
  "Assist Zone 7 Smoking Room",
  "T.D.R. Restroom",
  "Team Member Locker Rooms",
  "Zone 8 Family Restroom",
  // Official / catalog aliases still sitting on some nights
  "Chill Bar: Bartop Machines",
  "Team Member Hallway",
  "Team Member Locker Rooms",
  "Team Member Restroom",
  "Locker Rooms",
  "Restroom",
  "Smoking Room",
  "Red Tray Carts",
  "Vacuum",
  "Trash",
  "Poker Room",
  "Black Tray Carts",
  "Lobby Restrooms",
  "Lobby Trash",
  "Table Games / PIT",
  "T.D.R. Restroom",
  "Team Member Locker Room",
  "Main Entry North",
  "Main Entry South",
  "Food Court North",
  "Food Court South",
  "Slots West",
  "Slots East",
  "High Limit",
  "Table Games North",
  "Table Games South",
  "Poker",
] as const;

const CARD_VECTOR_SET = new Set<string>(CARD_VECTOR_IDS);
const LEGACY_SWEEPER_SET = new Set(
  LEGACY_SWEEPER_TASK_LABELS.map((label) => normalizeTaskLabel(label)),
);
const CANNED_DEFAULT_DESK_SET = new Set(
  CANNED_DEFAULT_DESK_TASK_LABELS.map((label) => normalizeTaskLabel(label)),
);

function normalizeTaskLabel(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, " ");
}

export function isCardVector(value: unknown): value is CardVector {
  return typeof value === "string" && CARD_VECTOR_SET.has(value);
}

export function parseCardVector(value: unknown): CardVector | null {
  if (value == null || value === "") return null;
  return isCardVector(value) ? value : null;
}

export function isLegacySweeperTaskLabel(label: string | null | undefined): boolean {
  if (!label) return false;
  return LEGACY_SWEEPER_SET.has(normalizeTaskLabel(label));
}

export function isCannedDefaultDeskTaskLabel(label: string | null | undefined): boolean {
  if (!label) return false;
  return CANNED_DEFAULT_DESK_SET.has(normalizeTaskLabel(label));
}

export function isCannedDefaultDeskTask(task: {
  isCoverage?: boolean;
  isOneOff?: boolean;
  taskLabel?: string;
}): boolean {
  if (task.isCoverage) return false;
  if (task.isOneOff) return false;
  return isCannedDefaultDeskTaskLabel(task.taskLabel);
}

/** Desk cards: drop coverage (rendered as banners/chips), leftover sweeper labels, and canned defaults. Custom tasks stay. */
export function visibleDeskSlotTasks<T extends {
  isCoverage?: boolean;
  isOneOff?: boolean;
  catalogTaskId?: string | null;
  taskLabel?: string;
}>(
  tasks: T[] | undefined | null,
): T[] {
  return (tasks ?? []).filter(
    (task) =>
      !task.isCoverage &&
      !isLegacySweeperTaskLabel(task.taskLabel) &&
      !isCannedDefaultDeskTask(task),
  );
}

export type CardVectorDefaultRow = {
  slotKey: string;
  slotType: string;
  rrSide?: string | null;
  cardVector?: string | null;
};

/** DB slot_defaults rows → UI slot key map (Z1, MRR8, ADM, OL-PM-0). */
export function buildCardVectorUiMap(rows: CardVectorDefaultRow[] | undefined | null): Record<string, CardVector> {
  const out: Record<string, CardVector> = {};
  for (const row of rows ?? []) {
    const vector = parseCardVector(row.cardVector);
    if (!vector) continue;
    const uiKey = dbToUi(row.slotKey, row.slotType, row.rrSide ?? null);
    if (!uiKey || uiKey.startsWith("UNK:")) continue;
    out[uiKey] = vector;
  }
  return out;
}

export function cardVectorForSlot(
  map: Record<string, CardVector> | undefined | null,
  uiKey: string,
): CardVector | null {
  if (!map || !uiKey) return null;
  return parseCardVector(map[uiKey]);
}
