/**
 * Synthetic roster + context builders for the engine test suite.
 *
 * Deterministic and DB-free — every invariant test constructs boards from these
 * so the suite runs fully offline (principle N7/N8).
 */

import type { ZoneDetailEntry } from "../../../data";
import { FALLBACK_CONFIG } from "../../../engineConfig";
import { DEFAULT_AUX_DEFS } from "../../../constants";
import { buildNightContext } from "../../context";
import type { NightContext, WeekNightRecord } from "../../types";

export interface RosterOpts {
  males?: number;
  females?: number;
  amOverlap?: number;
  pmOverlap?: number;
  /** Base skill score for everyone (0–10). */
  skill?: number;
}

export interface RosterMember extends Record<string, unknown> {
  id: string;
  name: string;
  gender: "M" | "F";
  gravePool: string;
  isAMOverlap: boolean;
  isPMOverlap: boolean;
  skill_score: number;
}

/** Build a mixed roster. Full-grave males/females + optional overlap-band TMs. */
export function makeRoster(opts: RosterOpts = {}): RosterMember[] {
  const { males = 8, females = 8, amOverlap = 0, pmOverlap = 0, skill = 6 } = opts;
  const out: RosterMember[] = [];
  for (let i = 1; i <= males; i++) {
    out.push({
      id: `tm_m${i}`, name: `Male ${i}`, gender: "M",
      gravePool: "Full", isAMOverlap: false, isPMOverlap: false, skill_score: skill,
    });
  }
  for (let i = 1; i <= females; i++) {
    out.push({
      id: `tm_f${i}`, name: `Female ${i}`, gender: "F",
      gravePool: "Full", isAMOverlap: false, isPMOverlap: false, skill_score: skill,
    });
  }
  for (let i = 1; i <= amOverlap; i++) {
    out.push({
      id: `tm_am${i}`, name: `AM ${i}`, gender: i % 2 ? "M" : "F",
      gravePool: "AM", isAMOverlap: true, isPMOverlap: false, skill_score: skill,
    });
  }
  for (let i = 1; i <= pmOverlap; i++) {
    out.push({
      id: `tm_pm${i}`, name: `PM ${i}`, gender: i % 2 ? "M" : "F",
      gravePool: "PM", isAMOverlap: false, isPMOverlap: true, skill_score: skill,
    });
  }
  return out;
}

export function skillScoresFrom(members: RosterMember[]): Map<string, number> {
  return new Map(members.map((m) => [m.id, m.skill_score]));
}

export interface MakeContextOpts {
  nightIso?: string;
  members?: RosterMember[];
  histories?: Record<string, ZoneDetailEntry | null>;
  weeklyRecentHistory?: Map<string, WeekNightRecord[]>;
  assignments?: NightContext["assignments"];
  scheduledTmIds?: Set<string>;
  slotDifficulty?: Map<string, number>;
  preferencesByTm?: NightContext["preferencesByTm"];
}

/** Assemble a NightContext from fixtures via the real loader. */
export function makeContext(opts: MakeContextOpts = {}): NightContext {
  const members = opts.members ?? makeRoster();
  return buildNightContext({
    nightIso: opts.nightIso ?? "2026-07-03",
    config: FALLBACK_CONFIG,
    auxDefs: DEFAULT_AUX_DEFS,
    members,
    assignments: opts.assignments ?? {},
    histories: opts.histories ?? {},
    weeklyRecentHistory: opts.weeklyRecentHistory,
    scheduledTmIds: opts.scheduledTmIds,
    skillScores: skillScoresFrom(members),
    slotDifficulty: opts.slotDifficulty ?? new Map(),
    preferencesByTm: opts.preferencesByTm,
  });
}
