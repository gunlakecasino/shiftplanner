/**
 * Grok Intelligence Layer for the Command Palette
 *
 * This module owns:
 * - The rich, authoritative context snapshot sent to xAI (B in the A+B plan)
 * - The structured action schema Grok must emit (A in the A+B plan)
 * - Safe parsing + server-side guard validation against the single source of truth
 *   (PLACEMENT_ORDER + canPlace / eligibilityCore liturgy)
 *
 * All Grok suggestions for ShiftBuilder MUST flow through types and helpers
 * defined in this file.
 */

import {
  PLACEMENT_ORDER,
  getPlacementOrderText,
  getEligibilityRulesText,
  type AuxDef,
} from "./placement";
import { canPlace, slotTypeForKey, type CanPlaceOptions } from "./engine/eligibility";
import type { TMAccommodationRow } from "./data";
import {
  getXaiFillOrderHardRules,
  getXaiSwapHardRules,
  assignViolatesFillOrder,
  swapViolatesFillOrder,
  swapViolatesOccupancy,
  swapViolatesCrossTierFamily,
} from "./xaiFillOrderContract";
import type { TeamMember } from "./data";

// ========================================================
// STRUCTURED OUTPUT SCHEMA (what Grok is instructed to emit)
// ========================================================

export type GrokActionType = "assign" | "swap" | "remove" | "note";

export interface GrokAction {
  /** The action Grok proposes */
  type: GrokActionType;

  /** Primary target slot (e.g. "Z7", "MRR1", "SP3") */
  slotKey?: string;

  /** Target TM (for assign / the person being moved in a swap) */
  tmId?: string;

  /** For swap actions: the other slot involved */
  fromSlot?: string;
  toSlot?: string;

  /** One-sentence, operator-friendly reason (shown in UI) */
  reason: string;
}

export interface GrokStructuredResponse {
  /** High-level natural language explanation (always shown) */
  explanation: string;

  /** Zero or more executable actions. May be empty if Grok only has advice. */
  actions: GrokAction[];
}

// ========================================================
// RICH CONTEXT SNAPSHOT (sent to Grok — the "B" deep context)
// ========================================================

export interface GrokBoardSnapshot {
  /** Current operational day (e.g. "Friday GRAVE") */
  day: string;

  /** Whether the GRAVE-only filter is active */
  graveOnly: boolean;

  /** The complete authoritative order Grok must respect */
  placementOrder: string[];

  /** Compact view of live assignments (what is actually on the board right now) */
  currentAssignments: Record<
    string,
    {
      tmName: string;
      isLocked?: boolean;
    }
  >;

  /** Draft proposals currently under review (if operator is in Draft Mode) */
  draftAssignments?: Record<
    string,
    {
      proposedTmName: string;
      previousTmName?: string;
    }
  >;

  /** Currently defined AUX / Support slots */
  auxDefs: { key: string; label: string }[];

  /** Enriched candidate pool (only relevant people to keep tokens reasonable) */
  candidates: Array<{
    id: string;
    /** Display name (the canonical operator-visible name — used on cards) */
    name: string;
    /** Full payroll name, when different from display name. Sent so Grok can
     *  disambiguate when two TMs share the same display name. */
    fullName?: string;
    gravePool: string | null;
    isAMOverlap: boolean;
    isPMOverlap: boolean;
    isOnWeek?: boolean;
    /** Current live assignment, if any */
    currentSlot?: string;
  }>;

  /** Quick stats to help Grok reason without scanning the whole board */
  stats: {
    totalGrave: number;
    unassignedGrave: number;
    lockedCount: number;
  };

  /** Why this snapshot was generated (drives prompt tone) */
  contextType: "slot" | "person" | "board" | "draft";

  /** Optional: the specific slot or person that triggered the ask */
  selectedSlotKey?: string;
  selectedPersonName?: string;
}

/**
 * Builds the rich context payload that gets sent to Grok.
 *
 * This is the critical function that prevents the failures seen in the
 * May 21 screenshots (violating placement order, Grave-only rules, etc.).
 *
 * Trimming strategy:
 * - Only include people who are either unassigned or currently on the board.
 * - Always include full placementOrder and eligibility rules via the text helpers.
 * - Draft state is included when present so Grok can propose refinements.
 */
export function buildRichGrokContextSnapshot(params: {
  day: string;
  graveOnly: boolean;
  assignments: Record<string, any>;
  draftAssignments?: Record<string, any>;
  auxDefs: AuxDef[];
  graveRoster: any[]; // already enriched with isAMOverlap / isPMOverlap / gravePool
  realRoster?: any[];
  selectedSlotKey?: string;
  selectedPersonName?: string;
  contextType?: GrokBoardSnapshot["contextType"];
}): GrokBoardSnapshot {
  const {
    day,
    graveOnly,
    assignments,
    draftAssignments = {},
    auxDefs,
    graveRoster,
    selectedSlotKey,
    selectedPersonName,
    contextType = "board",
  } = params;

  // Build compact current assignments
  const currentAssignments: GrokBoardSnapshot["currentAssignments"] = {};
  Object.entries(assignments).forEach(([slotKey, a]) => {
    if (a?.tmName) {
      currentAssignments[slotKey] = {
        tmName: a.tmName,
        isLocked: !!a.isLocked,
      };
    }
  });

  // Compact draft view (only when active)
  let draftView: GrokBoardSnapshot["draftAssignments"] | undefined;
  if (Object.keys(draftAssignments).length > 0) {
    draftView = {};
    Object.entries(draftAssignments).forEach(([slotKey, info]: [string, any]) => {
      draftView![slotKey] = {
        proposedTmName: info.proposedTmName,
        previousTmName: info.previousTmName,
      };
    });
  }

  // Build candidate pool — smart trimming to keep context small but complete
  const assignedTmIds = new Set(
    Object.values(assignments)
      .map((a: any) => a?.tmId)
      .filter(Boolean)
  );

  // Include everyone who has a gravePool (core night people) + anyone already assigned
  // plus overlaps when relevant. This is the key data Grok was missing before.
  const candidates = graveRoster
    .filter((tm) => {
      const hasGrave = !!tm.gravePool;
      const isAssigned = assignedTmIds.has(tm.id);
      const isOverlap = tm.isAMOverlap || tm.isPMOverlap;
      return hasGrave || isAssigned || isOverlap;
    })
    .map((tm) => {
      // Find if this person is currently assigned anywhere
      let currentSlot: string | undefined;
      for (const [slot, a] of Object.entries(assignments)) {
        if ((a as any)?.tmId === tm.id) {
          currentSlot = slot;
          break;
        }
      }

      return {
        id: tm.id,
        // Send display-name (preferred operator language) so Grok's reasoning
        // matches what shows on the cards. Full name is included as a
        // secondary field for disambiguation when display names collide.
        name: tm.name || tm.fullName || tm.id,
        fullName: tm.fullName,
        gravePool: tm.gravePool ?? null,
        isAMOverlap: !!tm.isAMOverlap,
        isPMOverlap: !!tm.isPMOverlap,
        isOnWeek: tm.isOnWeek,
        currentSlot,
      };
    })
    .sort((a, b) => {
      // Put people with gravePool first, then overlaps, then others
      const scoreA = a.gravePool ? 3 : a.isAMOverlap || a.isPMOverlap ? 2 : 1;
      const scoreB = b.gravePool ? 3 : b.isAMOverlap || b.isPMOverlap ? 2 : 1;
      return scoreB - scoreA;
    });

  // Stats
  const totalGrave = graveRoster.filter((t) => !!t.gravePool).length;
  const unassignedGrave = candidates.filter(
    (c) => !c.currentSlot && c.gravePool
  ).length;
  const lockedCount = Object.values(assignments).filter(
    (a: any) => a?.isLocked
  ).length;

  return {
    day,
    graveOnly,
    placementOrder: [...PLACEMENT_ORDER],
    currentAssignments,
    draftAssignments: draftView,
    auxDefs: auxDefs.map((d) => ({ key: d.key, label: d.label })),
    candidates,
    stats: {
      totalGrave,
      unassignedGrave,
      lockedCount,
    },
    contextType,
    selectedSlotKey,
    selectedPersonName,
  };
}

/**
 * Produces the complete system prompt for Grok Intelligence calls.
 * Combines the static rules + the dynamic snapshot.
 */
export function buildGrokIntelligenceSystemPrompt(snapshot: GrokBoardSnapshot): string {
  const orderText = getPlacementOrderText();
  const eligibilityText = getEligibilityRulesText();

  return `You are an expert GRAVE shift planner for ZDS operations. You are operating inside the ShiftBuilder Command Palette as a trusted assistant.

You have access to the live board state via the JSON snapshot below.

CRITICAL RULES — THESE ARE NON-NEGOTIABLE:

${getXaiFillOrderHardRules()}

${orderText}

${eligibilityText}

FILL ORDER ENFORCEMENT: You may change WHO is placed, never the sequence in which core slots must be filled. The server guard deletes any assign/swap that skips ahead of empty higher-priority slots.

${getXaiSwapHardRules()}

DRAFT MODE CONTRACT:
- The operator is almost always working in (or will be moved into) "Draft Mode".
- All suggestions you make become PREVIEWS only. They will be shown to the operator as cards with "Add to Draft" buttons.
- Never suggest direct live changes. Everything goes through the Draft review surface first.
- When the snapshot contains "draftAssignments", you are refining an existing draft. Prefer small, high-value improvements over rewriting the entire board.

OUTPUT CONTRACT — STRICT JSON SCHEMA (field names and value casing are EXACT):

1. First, output exactly one fenced \`\`\`json block with this shape:
\`\`\`json
{
  "explanation": "string — one or two sentences of high-level reasoning the operator will see",
  "actions": [
    {
      "type": "assign",
      "slotKey": "Z7",
      "tmId": "tm_darlene",
      "reason": "one short sentence the operator will see"
    }
  ]
}
\`\`\`

CRITICAL FIELD RULES (the server-side guard rejects anything that violates these):

- The action discriminator field MUST be named exactly \`type\` (lowercase, no underscore). Do NOT emit \`actionType\`, \`action_type\`, or \`Type\` — those will be rejected.
- The value of \`type\` MUST be lowercase: \`"assign"\`, \`"swap"\`, \`"remove"\`, or \`"note"\`. NOT \`"ASSIGN"\`, \`"Assign"\`, or \`"SWAP"\`.
- For \`assign\` actions: provide BOTH \`slotKey\` AND \`tmId\`.
    - \`slotKey\` is a literal key from the \`placementOrder\` array or one of the keys in \`auxDefs\` (e.g. "Z7", "MRR8", "WRR6", "ADM", "Z9SR", "TR1", "SP1", "OL-AM-2").
    - \`tmId\` is the literal \`id\` field from the \`candidates\` array (e.g. "tm_darlene", "tm_jack"). DO NOT emit a display name like "Darlene Sebright"; the guard cannot resolve names and will reject the action.
- For \`swap\` actions: provide \`fromSlot\` and \`toSlot\` — BOTH must already have a TM in the snapshot's assignments. Bilateral exchange only. If \`toSlot\` is empty, use \`assign\` with \`slotKey\` + \`tmId\` instead. Do not provide \`slotKey\` or \`tmId\` for swaps.
- For \`remove\` actions: provide only \`slotKey\`.
- For \`note\` actions: provide only \`reason\`.
- Every action MUST include a clear, one-sentence \`reason\`.
- If you have no actionable suggestions, return an empty \`actions\` array and put your advice in \`explanation\`.

WORKED EXAMPLE — the operator-tapped slot was Z2 currently held by an AM/PM overlap TM, and "tm_darlene" appears in the snapshot's \`candidates\` array as a true grave-only TM:
\`\`\`json
{
  "explanation": "Z2 is held by an AM-overlap TM who should be on an overlap slot. Swapping in Darlene (true grave pool) maintains the eligibility contract.",
  "actions": [
    {
      "type": "assign",
      "slotKey": "Z2",
      "tmId": "tm_darlene",
      "reason": "Replaces an AM/PM overlap TM with a grave-pool TM, complying with zone eligibility rules."
    }
  ]
}
\`\`\`

2. After the JSON block you may add any additional natural language explanation, caveats, or questions for the operator. The JSON block is the only machine-readable surface.

Never violate the placement order or eligibility rules above. The server-side guard rejects any illegal or malformed action before the operator ever sees it.

Current board snapshot (JSON):
${JSON.stringify(snapshot, null, 2)}
`;
}

// ========================================================
// SAFE PARSING + GUARD (server-side protection)
// ========================================================

/**
 * Attempts to extract a structured response from raw Grok text.
 * Looks for the first ```json ... ``` block.
 */
export function parseGrokStructuredResponse(rawText: string): {
  structured?: GrokStructuredResponse;
  rawExplanation: string;
  parseError?: string;
} {
  const jsonBlockMatch = rawText.match(/```json\s*([\s\S]*?)```/i);

  if (!jsonBlockMatch) {
    // No structured block — treat entire response as explanation
    return {
      rawExplanation: rawText.trim(),
      parseError: "No JSON block found — showing raw advice only",
    };
  }

  try {
    const parsed = JSON.parse(jsonBlockMatch[1].trim());

    if (!parsed || typeof parsed !== "object") {
      throw new Error("Parsed value is not an object");
    }

    const explanation =
      typeof parsed.explanation === "string"
        ? parsed.explanation
        : "Grok provided suggestions (see actions below).";

    const actions: GrokAction[] = Array.isArray(parsed.actions)
      ? parsed.actions.filter((a: any) => a && typeof a === "object")
      : [];

    return {
      structured: { explanation, actions },
      rawExplanation: rawText.trim(),
    };
  } catch (err) {
    return {
      rawExplanation: rawText.trim(),
      parseError: `Failed to parse Grok JSON: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Defensive normalization layer. Grok occasionally backslides to its own
 * intuitive field names (\`actionType\`, \`tmName\`, uppercase enums) despite
 * the explicit schema in the system prompt. This function rescues those
 * cases so a small schema drift doesn't silently kill the entire feature.
 *
 * Returns the canonical action shape, or null if the action can't be
 * recovered (caller should surface a warning).
 */
function normalizeRawAction(raw: any, roster: TeamMember[]): GrokAction | null {
  if (!raw || typeof raw !== "object") return null;

  // Accept \`type\` / \`actionType\` / \`action_type\` / \`Type\` (in that priority order)
  let rawType =
    raw.type ?? raw.actionType ?? raw.action_type ?? raw.Type ?? raw.kind;
  if (typeof rawType !== "string") return null;
  const type = rawType.toLowerCase().trim();

  if (!["assign", "swap", "remove", "note"].includes(type)) return null;

  const reason =
    typeof raw.reason === "string"
      ? raw.reason
      : typeof raw.explanation === "string"
      ? raw.explanation
      : "";

  // Helper: pluck a string from a list of candidate property names
  const pick = (keys: string[]): string | undefined => {
    for (const k of keys) {
      const v = raw[k];
      if (typeof v === "string" && v.trim().length > 0) return v.trim();
    }
    return undefined;
  };

  if (type === "assign") {
    const slotKey = pick(["slotKey", "slot_key", "slot"]);
    let tmId = pick(["tmId", "tm_id", "id"]);

    // Recovery: if no tmId but we have a name, fuzzy-resolve via roster
    if (!tmId) {
      const tmName = pick(["tmName", "tm_name", "name", "fullName", "full_name"]);
      if (tmName) {
        const needle = tmName.toLowerCase().trim();
        const match = roster.find((t) => {
          const id = (t.id || "").toLowerCase();
          const full = ((t as any).fullName || "").toLowerCase();
          const short = ((t as any).name || "").toLowerCase();
          return id === needle || full === needle || short === needle;
        });
        if (match) tmId = match.id;
        // No fuzzy partial-match: too risky. Better to warn than silently
        // bind to the wrong person.
      }
    }

    if (!slotKey || !tmId) return null;
    return { type: "assign", slotKey, tmId, reason };
  }

  if (type === "swap") {
    const fromSlot = pick(["fromSlot", "from_slot", "from"]);
    const toSlot = pick(["toSlot", "to_slot", "to"]);
    if (!fromSlot || !toSlot) return null;
    return { type: "swap", fromSlot, toSlot, reason };
  }

  if (type === "remove") {
    const slotKey = pick(["slotKey", "slot_key", "slot"]);
    if (!slotKey) return null;
    return { type: "remove", slotKey, reason };
  }

  // note
  return { type: "note", reason };
}

/**
 * Server-side guard. Normalizes loose action shapes, then filters out any
 * actions that would violate the authoritative placement + eligibility rules.
 *
 * Returns the cleaned actions + any warnings that should be surfaced.
 */
export function guardGrokActions(
  rawActions: any[],
  roster: TeamMember[], // or the enriched version used in the client
  currentAssignments: Record<string, any>,
  /**
   * Hard-gate inputs (P0-2). Optional only for backward compatibility: when a
   * caller omits it, Grok's actions are checked against the bare core liturgy
   * and NOT against operator eligibility rules, the schedule gate, Supervisor
   * dossiers or `tm_accommodations` — i.e. the guard is weaker than the engine
   * it is guarding. `accommodationsByTm` is keyed per TM because this guard
   * loops over actions for many TMs; the rest of the bag is night-wide.
   */
  gate: Omit<CanPlaceOptions, "slotType" | "accommodations"> & {
    accommodationsByTm?: Map<string, TMAccommodationRow[]>;
  } = {}
): { validActions: GrokAction[]; warnings: string[] } {
  const { accommodationsByTm, ...nightGate } = gate;
  const validActions: GrokAction[] = [];
  const warnings: string[] = [];

  for (const raw of rawActions ?? []) {
    const action = normalizeRawAction(raw, roster);

    if (!action) {
      warnings.push(
        `Grok produced an action the guard could not interpret. ` +
          `Expected fields: { type, slotKey, tmId, reason } (and fromSlot/toSlot for swaps). ` +
          `Received: ${JSON.stringify(raw)}`
      );
      continue;
    }

    if (action.type === "assign" && action.slotKey && action.tmId) {
      const tm = roster.find((t) => t.id === action.tmId);
      if (!tm) {
        warnings.push(`Unknown TM id in Grok suggestion: ${action.tmId}`);
        continue;
      }

      const verdict = canPlace(tm, action.slotKey, {
        ...nightGate,
        accommodations: accommodationsByTm?.get(action.tmId),
        slotType: slotTypeForKey(action.slotKey),
      });
      if (!verdict.ok) {
        warnings.push(
          `Grok suggestion rejected by guard: ${tm.name || action.tmId} is not eligible for ${action.slotKey} — ${verdict.reason}.`
        );
        continue;
      }

      const fillOrder = assignViolatesFillOrder(action.slotKey, currentAssignments);
      if (fillOrder.violates) {
        warnings.push(
          `Grok suggestion rejected (fill order): ${fillOrder.reason ?? action.slotKey}`,
        );
        continue;
      }

      validActions.push(action);
    } else if (action.type === "swap" && action.fromSlot && action.toSlot) {
      const crossTier = swapViolatesCrossTierFamily(action.fromSlot, action.toSlot);
      if (crossTier.violates) {
        warnings.push(
          `Grok swap rejected (cross-tier): ${crossTier.reason ?? `${action.fromSlot}→${action.toSlot}`}`,
        );
        continue;
      }
      const occupancy = swapViolatesOccupancy(
        action.fromSlot,
        action.toSlot,
        currentAssignments,
      );
      if (occupancy.violates) {
        warnings.push(
          `Grok swap rejected (occupancy): ${occupancy.reason ?? `${action.fromSlot}→${action.toSlot}`}`,
        );
        continue;
      }
      const fillOrder = swapViolatesFillOrder(
        action.fromSlot,
        action.toSlot,
        currentAssignments,
      );
      if (fillOrder.violates) {
        warnings.push(
          `Grok swap rejected (fill order): ${fillOrder.reason ?? `${action.fromSlot}→${action.toSlot}`}`,
        );
        continue;
      }
      validActions.push(action);
    } else if (action.type === "remove" && action.slotKey) {
      validActions.push(action);
    } else if (action.type === "note") {
      validActions.push(action);
    }
  }

  return { validActions, warnings };
}
