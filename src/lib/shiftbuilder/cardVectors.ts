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

/** Leftover sweeper chips that used to stand in for vectors. Do not show as the mark. */
export const LEGACY_SWEEPER_TASK_LABELS = [
  "Sweep 9/10/SR",
  "Sweep 9 / 10 / SR",
  "Sweeper 9 / 10 / SR",
  "Sweep 5/8/HL",
  "Sweep 5 / 8 / HL",
  "Sweeper 5 / 8 / HL",
] as const;

const CARD_VECTOR_SET = new Set<string>(CARD_VECTOR_IDS);
const LEGACY_SWEEPER_SET = new Set(
  LEGACY_SWEEPER_TASK_LABELS.map((label) => normalizeTaskLabel(label)),
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

export function visibleDeskSlotTasks<T extends { isCoverage?: boolean; taskLabel?: string }>(
  tasks: T[] | undefined | null,
): T[] {
  return (tasks ?? []).filter((task) => !task.isCoverage && !isLegacySweeperTaskLabel(task.taskLabel));
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
