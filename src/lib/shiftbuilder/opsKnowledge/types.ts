/**
 * opsKnowledge/types.ts — the Supervisor Brain data model.
 *
 * Externalizes the tribal knowledge an Ops Supervisor carries in their head into
 * structured, editable data the AI can reason with. Mixed capture (per operator
 * direction 2026-07-03): structured fields for the safety-critical and queryable
 * (accommodations, capability ratings, hard policies) + free-text notes for the
 * nuanced. See docs/AI_SUPERVISOR_BRAIN.md.
 *
 * Shared across the ops system — not placement-specific — so it can later power
 * breaks, task assignment, recaps, and proactive supervision.
 */

/** 1 = struggles, 3 = solid, 5 = excellent. */
export type Rating = 1 | 2 | 3 | 4 | 5;

/** Structured, often safety-critical limit. `hard` becomes a guard constraint. */
export interface Accommodation {
  kind: "no_sweeper" | "no_stairs" | "no_heavy_lifting" | "limited_standing" | "other";
  label: string;
  severity: "hard" | "soft";
  /** Slot keys this blocks outright (e.g. ["Z5","Z9"]). */
  blockedSlotKeys?: string[];
  /** Zone tags this blocks (matched against ZoneProfile.tags, e.g. "sweeper"). */
  blockedTags?: string[];
  note?: string;
}

/** Capability for a specific area/slot — replaces the single flat skill number. */
export interface CapabilityRating {
  /** Slot key ("Z7") or area label ("highlimit", "restrooms"). */
  area: string;
  level: Rating;
  note?: string;
}

export interface TmDossier {
  tmId: string;
  capabilities: CapabilityRating[];
  accommodations: Accommodation[];
  reliability?: Rating;
  trainingStatus?: "trainee" | "developing" | "seasoned" | "trainer";
  /** Areas to deliberately rotate them INTO to grow them (opposite of "keep fresh"). */
  developmentGoals?: string[];
  /** Free-text tribal knowledge the AI reads verbatim. */
  notes?: string;
}

/** A relationship between two TMs. */
export interface ChemistryLink {
  aTmId: string;
  bTmId: string;
  kind: "keep_together" | "keep_apart";
  strength: "hard" | "soft";
  reason?: string;
}

export interface ZoneProfile {
  slotKey: string;
  physicalDemand?: Rating;
  guestFacing?: Rating;
  needsReliable?: boolean;
  /** e.g. "sweeper", "stairs", "highlimit" — matched by Accommodation.blockedTags. */
  tags?: string[];
  note?: string;
}

/** An operator-authored rule-of-thumb. `hard` is enforced; `soft` guides. */
export interface Policy {
  id: string;
  text: string;
  strength: "hard" | "soft";
  active: boolean;
}

export interface OpsKnowledge {
  dossiers: Record<string, TmDossier>;
  chemistry: ChemistryLink[];
  zoneProfiles: Record<string, ZoneProfile>;
  policies: Policy[];
  updatedAt?: string;
}

export function emptyOpsKnowledge(): OpsKnowledge {
  return { dossiers: {}, chemistry: [], zoneProfiles: {}, policies: [] };
}
