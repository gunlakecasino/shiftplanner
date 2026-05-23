/**
 * Slot key translation: UI (Golden) keys ↔ DB shape.
 *
 * UI keys live in src/app/shiftbuilder/page.tsx and follow Golden conventions:
 *   • Z1…Z10                   — zone slots
 *   • MRR1, WRR1, MRR6, WRR6…  — restroom slots, M/W split (RR 1 is the paired
 *                                 restrooms 1+2; UI calls it "RR 1+2" but the
 *                                 numeric key is 1)
 *   • Z9SR, ADM, TR1, TR2,
 *     SP1, SP2                 — default AUX slots
 *   • AUX6, AUX7…              — operator-added AUX slots
 *
 * DB shape mirrors src/lib/shiftbuilder/data.ts conventions and the
 * zone_assignments table:
 *   { slot_key: string; slot_type: 'zone'|'rr'|'aux'; rr_side: 'mens'|'womens'|null }
 *
 * The RR 1 ↔ rr_1_2 mapping is the one quirk — physical restrooms 1 and 2
 * are paired in operations, so the DB key reflects that.
 */

export type SlotType = "zone" | "rr" | "aux" | "overlap";
export type RRSide = "mens" | "womens" | null;

export interface DbSlot {
  slot_key: string;
  slot_type: SlotType;
  rr_side: RRSide;
}

// RR num (1, 6, 7, 8, 10) ↔ DB key segment. Add to this map when the physical
// restroom inventory changes.
const RR_NUM_TO_DB: Record<number, string> = {
  1: "rr_1_2",
  6: "rr_6",
  7: "rr_7",
  8: "rr_8",
  10: "rr_10",
};
const RR_DB_TO_NUM: Record<string, number> = {
  rr_1_2: 1,
  rr_6: 6,
  rr_7: 7,
  rr_8: 8,
  rr_10: 10,
};

// Default AUX UI key ↔ DB key. Operator-added slots use the AUX{N} ↔ aux_{N}
// fallback pattern below.
const AUX_UI_TO_DB: Record<string, string> = {
  Z9SR: "z9_sr",
  ADM: "admin",
  TR1: "trash_1",
  TR2: "trash_2",
  SP1: "support_1",
  SP2: "support_2",
};
const AUX_DB_TO_UI: Record<string, string> = {
  z9_sr: "Z9SR",
  admin: "ADM",
  trash_1: "TR1",
  trash_2: "TR2",
  support_1: "SP1",
  support_2: "SP2",
};

/**
 * UI slot key → DB shape. Throws on unmappable keys so we fail loudly during
 * development rather than silently writing junk rows.
 */
export function uiToDb(uiKey: string): DbSlot {
  // Zones: Z1 … Z10
  const zMatch = uiKey.match(/^Z(\d+)$/);
  if (zMatch) {
    return { slot_key: `zone_${zMatch[1]}`, slot_type: "zone", rr_side: null };
  }

  // RR: MRRn / WRRn
  const rrMatch = uiKey.match(/^([MW])RR(\d+)$/);
  if (rrMatch) {
    const num = parseInt(rrMatch[2], 10);
    const dbKey = RR_NUM_TO_DB[num];
    if (!dbKey) throw new Error(`slot-keys: unknown RR number "${num}" in "${uiKey}"`);
    return {
      slot_key: dbKey,
      slot_type: "rr",
      rr_side: rrMatch[1] === "M" ? "mens" : "womens",
    };
  }

  // Default AUX (Z9SR, ADM, …)
  if (AUX_UI_TO_DB[uiKey]) {
    return { slot_key: AUX_UI_TO_DB[uiKey], slot_type: "aux", rr_side: null };
  }

  // Numbered family AUX — support / trash / generic. Mirror the same naming
  // the DB already uses for support_1 / support_2 / trash_1 / trash_2 so a
  // SUPPORT 3 added by the operator round-trips to support_3.
  let m = uiKey.match(/^SP(\d+)$/);
  if (m) return { slot_key: `support_${m[1]}`, slot_type: "aux", rr_side: null };

  m = uiKey.match(/^TR(\d+)$/);
  if (m) return { slot_key: `trash_${m[1]}`, slot_type: "aux", rr_side: null };

  // Generic operator-added AUX (AUX6, AUX7, …)
  m = uiKey.match(/^AUX(\d+)$/);
  if (m) return { slot_key: `aux_${m[1]}`, slot_type: "aux", rr_side: null };

  // Overlaps: OL-PM-0..5, OL-AM-0..5 — the breaks view's bottom band. PM is
  // the 11p-1a overlap; AM is the 5a-7a overlap. We store them in
  // zone_assignments with slot_type='overlap' so the existing race-free
  // persist path Just Works without a second table to coordinate.
  m = uiKey.match(/^OL-(PM|AM)-(\d+)$/);
  if (m) {
    return {
      slot_key: `overlap_${m[1].toLowerCase()}_${m[2]}`,
      slot_type: "overlap",
      rr_side: null,
    };
  }

  throw new Error(`slot-keys: cannot translate UI key "${uiKey}"`);
}

/**
 * DB shape → UI slot key. Returns the canonical UI key the rest of the app
 * expects. If the DB row references something we don't recognize (legacy data,
 * partial migration), we return a sentinel "UNK:<rawKey>" so it's at least
 * visible during development.
 */
export function dbToUi(slot_key: string, slot_type: string, rr_side: string | null): string {
  // ── Passthrough guard ──────────────────────────────────────────────────────
  // Earlier versions of the batch planner wrote UI-format keys directly to
  // zone_assignments without going through uiToDb (e.g. slot_key="Z1" instead
  // of "zone_1"). If we detect an already-converted key, return it immediately
  // so mixed-format data in the DB never produces UNK:* sentinels and never
  // corrupts the planner's currentDraft.
  if (/^Z\d+$/.test(slot_key)) return slot_key;                       // Z1..Z10
  if (/^[MW]RR\d+$/.test(slot_key)) return slot_key;                  // MRR1, WRR7 …
  if (/^(Z9SR|ADM)$/.test(slot_key)) return slot_key;                 // named aux
  if (/^(TR|SP|AUX)\d+$/.test(slot_key)) return slot_key;            // TR1, SP2, AUX6 …
  if (/^OL-(PM|AM)-\d+$/.test(slot_key)) return slot_key;            // overlap slots
  // ──────────────────────────────────────────────────────────────────────────

  if (slot_type === "zone") {
    const m = slot_key.match(/^zone_(\d+)$/);
    if (m) return `Z${m[1]}`;
  }

  if (slot_type === "rr") {
    const num = RR_DB_TO_NUM[slot_key];
    if (num != null) {
      return rr_side === "womens" ? `WRR${num}` : `MRR${num}`;
    }
  }

  if (slot_type === "aux") {
    if (AUX_DB_TO_UI[slot_key]) return AUX_DB_TO_UI[slot_key];

    // Numbered families — support_N → SP{N}, trash_N → TR{N}.
    let m = slot_key.match(/^support_(\d+)$/);
    if (m) return `SP${m[1]}`;

    m = slot_key.match(/^trash_(\d+)$/);
    if (m) return `TR${m[1]}`;

    // Generic operator-added aux_N → AUX{N}.
    m = slot_key.match(/^aux_(\d+)$/);
    if (m) return `AUX${m[1]}`;
  }

  if (slot_type === "overlap") {
    const m = slot_key.match(/^overlap_(pm|am)_(\d+)$/);
    if (m) return `OL-${m[1].toUpperCase()}-${m[2]}`;
  }

  return `UNK:${slot_key}`;
}

/**
 * UI slot key → human-readable label for the Command Palette header and any
 * other display surface that needs a friendly slot name.
 *
 * Examples:
 *   "TR1"     → "Trash 1"
 *   "Z3"      → "Zone 3"
 *   "MRR7"    → "RR 7 (Men's)"
 *   "WRR1"    → "RR 1+2 (Women's)"
 *   "ADM"     → "Admin"
 *   "Z9SR"    → "Z9 SR"
 *   "SP3"     → "Support 3"
 *   "OL-PM-1" → "PM Overlap 2"
 *   "AUX6"    → "Aux 6"
 */
export function slotKeyToLabel(uiKey: string): string {
  // Zones: Z1 … Z10
  const zMatch = uiKey.match(/^Z(\d+)$/);
  if (zMatch) return `Zone ${zMatch[1]}`;

  // RR slots: MRR1, WRR7, etc.
  const rrMatch = uiKey.match(/^([MW])RR(\d+)$/);
  if (rrMatch) {
    const num = parseInt(rrMatch[2], 10);
    const side = rrMatch[1] === "M" ? "Men's" : "Women's";
    // RR number 1 is the paired 1+2 station
    return num === 1 ? `RR 1+2 (${side})` : `RR ${num} (${side})`;
  }

  // Named AUX
  if (uiKey === "Z9SR") return "Z9 SR";
  if (uiKey === "ADM")  return "Admin";

  // TR/SP numbered families
  const trMatch = uiKey.match(/^TR(\d+)$/);
  if (trMatch) return `Trash ${trMatch[1]}`;

  const spMatch = uiKey.match(/^SP(\d+)$/);
  if (spMatch) return `Support ${spMatch[1]}`;

  // Operator-added AUX slots
  const auxMatch = uiKey.match(/^AUX(\d+)$/);
  if (auxMatch) return `Aux ${auxMatch[1]}`;

  // Overlaps: OL-PM-0..5, OL-AM-0..5 (0-indexed internally, display 1-indexed)
  const olMatch = uiKey.match(/^OL-(PM|AM)-(\d+)$/);
  if (olMatch) return `${olMatch[1]} Overlap ${parseInt(olMatch[2], 10) + 1}`;

  // Fallback: return key as-is — still readable, never blank
  return uiKey;
}

/**
 * Helper for the AUX layout-detection logic. Given a DB AUX slot_key, return
 * the matching UI key + a sensible label so the shiftbuilder can synthesize
 * an operator-added slot definition when loading.
 *
 * Returns null for keys that map to a default slot (caller already knows
 * about them via DEFAULT_AUX_DEFS) or that we can't parse.
 */
export function auxDbKeyToDef(slot_key: string): { uiKey: string; label: string } | null {
  if (AUX_DB_TO_UI[slot_key]) {
    // It's a default — caller already knows about it. Not an operator addition.
    return null;
  }

  // support_N → SP{N} / "SUPPORT N"
  let m = slot_key.match(/^support_(\d+)$/);
  if (m) {
    return { uiKey: `SP${m[1]}`, label: `SUPPORT ${m[1]}` };
  }

  // trash_N → TR{N} / "TRASH N"
  m = slot_key.match(/^trash_(\d+)$/);
  if (m) {
    return { uiKey: `TR${m[1]}`, label: `TRASH ${m[1]}` };
  }

  // Generic aux_N → AUX{N} / "AUX N"
  m = slot_key.match(/^aux_(\d+)$/);
  if (m) {
    const n = parseInt(m[1], 10);
    return { uiKey: `AUX${n}`, label: `AUX ${n}` };
  }

  return null;
}
