/**
 * Flex aux row — layout resolution, migration, and role-aware key mapping.
 */

import type { AuxDef, AuxRole } from "./placement";
import type { DbSlot } from "./slot-keys";
import {
  BLANK_AUX_DEFS,
  AUX_ROLE_PRESETS,
  MAX_AUX_SLOTS,
  NUMBERED_AUX_ROLES,
  auxRoleTrailCode,
  defaultLabelForAuxRole,
  normalizeHistoryUiKey,
} from "./constants";

export { MAX_AUX_SLOTS };

const LEGACY_UI_TO_ROLE: Record<string, AuxRole> = {
  Z9SR: "z9sr",
  ADM: "admin",
  TR1: "trash",
  TR2: "trash",
  SP1: "support",
  SP2: "support",
};

const LEGACY_REMAP_ORDER: Array<{ legacyKey: string; role: AuxRole; nth: number }> = [
  { legacyKey: "Z9SR", role: "z9sr", nth: 0 },
  { legacyKey: "ADM", role: "admin", nth: 0 },
  { legacyKey: "TR1", role: "trash", nth: 0 },
  { legacyKey: "TR2", role: "trash", nth: 1 },
  { legacyKey: "SP1", role: "support", nth: 0 },
  { legacyKey: "SP2", role: "support", nth: 1 },
];

const DB_AUX_SLOT_RE =
  /^(admin|z9_sr|trash_\d+|support_\d+|oasis_\d+|job_coach|step_up|aux_\d+)$/;

function nextAuxKey(existing: AuxDef[]): string {
  let n = existing.length + 1;
  let candidate = `AUX${n}`;
  while (existing.some((d) => d.key === candidate)) {
    n++;
    candidate = `AUX${n}`;
  }
  return candidate;
}

function blankSlot(key: string): AuxDef {
  return { key, role: "blank", label: "", locations: [] };
}

function roleFromDbSlotKey(slotKey: string): AuxRole | null {
  if (slotKey === "admin") return "admin";
  if (slotKey === "z9_sr") return "z9sr";
  if (slotKey === "job_coach") return "job_coach";
  if (slotKey === "step_up") return "step_up";
  if (/^trash_\d+$/.test(slotKey)) return "trash";
  if (/^support_\d+$/.test(slotKey)) return "support";
  if (/^oasis_\d+$/.test(slotKey)) return "oasis";
  if (/^aux_\d+$/.test(slotKey)) return "blank";
  return null;
}

type TypedAuxRole = Exclude<AuxRole, "blank">;

function labelForRole(role: AuxRole, nthAmongRole: number): string {
  if (role === "blank") return "";
  const preset = AUX_ROLE_PRESETS[role as TypedAuxRole];
  if (!preset) return "";
  if (NUMBERED_AUX_ROLES.has(role)) {
    return `${preset.labelBase} ${nthAmongRole + 1}`;
  }
  return preset.label ?? "";
}

function ensureAuxDefShape(raw: unknown): AuxDef | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const key = typeof o.key === "string" ? o.key : "";
  if (!/^AUX\d+$/.test(key)) return null;
  const role = (o.role as AuxRole) || "blank";
  const validRoles: AuxRole[] = [
    "blank",
    "z9sr",
    "admin",
    "trash",
    "support",
    "oasis",
    "job_coach",
    "step_up",
  ];
  const safeRole = validRoles.includes(role) ? role : "blank";
  return {
    key,
    role: safeRole,
    label: typeof o.label === "string" ? o.label : "",
    locations: Array.isArray(o.locations)
      ? o.locations.filter((x): x is string => typeof x === "string")
      : [],
  };
}

export function parseAuxLayoutJson(raw: unknown): AuxDef[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const parsed = raw.map(ensureAuxDefShape).filter(Boolean) as AuxDef[];
  return parsed.length > 0 ? parsed.slice(0, MAX_AUX_SLOTS) : null;
}

/** Default 6-blank layout matching legacy role order (for migration). */
export function legacyMigratedAuxLayout(extraCount = 0): AuxDef[] {
  const roles: AuxRole[] = ["z9sr", "admin", "trash", "trash", "support", "support"];
  const defs: AuxDef[] = roles.map((role, i) => {
    const key = `AUX${i + 1}`;
    const preset = AUX_ROLE_PRESETS[role as TypedAuxRole];
    const trashN = role === "trash" ? (i === 2 ? 0 : 1) : 0;
    const supportN = role === "support" ? (i === 4 ? 0 : 1) : 0;
    const nth = role === "trash" ? trashN : role === "support" ? supportN : 0;
    return {
      key,
      role,
      label: labelForRole(role, nth),
      locations: preset?.locations ? [...preset.locations] : [],
    };
  });
  for (let i = 0; i < extraCount && defs.length < MAX_AUX_SLOTS; i++) {
    defs.push(blankSlot(nextAuxKey(defs)));
  }
  return defs;
}

export function migrateAuxLayoutFromDbRows(
  rawDbAssignments: Array<{ slotKey?: string; slot_key?: string }> | undefined | null,
): AuxDef[] {
  const rows = rawDbAssignments ?? [];
  const auxDbKeys = rows
    .map((r) => r.slotKey ?? r.slot_key ?? "")
    .filter((k) => DB_AUX_SLOT_RE.test(k));

  const uniqueAux = new Set(auxDbKeys);
  const extraGeneric = [...uniqueAux].filter((k) => /^aux_\d+$/.test(k)).length;
  const slotCount = Math.min(
    MAX_AUX_SLOTS,
    Math.max(6, 6 + Math.max(0, extraGeneric)),
  );

  const layout = legacyMigratedAuxLayout(Math.max(0, slotCount - 6));

  // Mark generic aux_N slots as blank shells if we expanded count
  return layout;
}

function nightHasAuxAssignmentData(
  rawDbAssignments: Array<{ slotKey?: string; slot_key?: string; tmId?: string | null; tm_id?: string | null }> | undefined | null,
): boolean {
  if (!rawDbAssignments?.length) return false;
  return rawDbAssignments.some((r) => {
    const k = r.slotKey ?? r.slot_key ?? "";
    if (!DB_AUX_SLOT_RE.test(k)) return false;
    return !!(r.tmId ?? r.tm_id);
  });
}

export function resolveAuxLayout(
  storedLayout: unknown,
  rawDbAssignments: Array<{ slotKey?: string; slot_key?: string; tmId?: string | null; tm_id?: string | null }> | undefined | null,
): AuxDef[] {
  const parsed = parseAuxLayoutJson(storedLayout);
  if (parsed?.length) {
    // Coerce mislabeled "STEP UP" support shells → real step_up (not permanent seed).
    return ensureCoreAuxRoles(coerceMislabeledAuxRoles(parsed));
  }
  if (!nightHasAuxAssignmentData(rawDbAssignments)) {
    return defaultAuxDefsForNewNight();
  }
  return ensureCoreAuxRoles(
    coerceMislabeledAuxRoles(migrateAuxLayoutFromDbRows(rawDbAssignments)),
  );
}

/**
 * Map a UI/DB assignment key to { role, nth } for flex AUXn shells.
 * Critical: dbToUi("step_up") → "STEP", but cards render as AUX3 with role step_up.
 * Without this remap, assigned TMs disappear on refresh.
 */
export function roleNthFromAssignmentKey(
  key: string,
): { role: AuxRole; nth: number } | null {
  if (!key) return null;
  const k = key.trim();
  if (k === "ADM" || k === "ADMIN" || k === "admin") return { role: "admin", nth: 0 };
  if (k === "Z9SR" || k === "z9_sr") return { role: "z9sr", nth: 0 };
  if (k === "STEP" || k === "step_up" || k === "STEPUP") return { role: "step_up", nth: 0 };
  if (k === "JC" || k === "job_coach") return { role: "job_coach", nth: 0 };

  let m = k.match(/^(?:SP|SUP|support_)(\d+)$/i);
  if (m) return { role: "support", nth: Math.max(0, parseInt(m[1], 10) - 1) };
  m = k.match(/^(?:TR|TSH|trash_)(\d+)$/i);
  if (m) return { role: "trash", nth: Math.max(0, parseInt(m[1], 10) - 1) };
  m = k.match(/^(?:OAS|oasis_)(\d+)$/i);
  if (m) return { role: "oasis", nth: Math.max(0, parseInt(m[1], 10) - 1) };

  // Already a flex shell key — leave as-is (caller skips)
  if (/^AUX\d+$/i.test(k)) return null;
  return null;
}

/**
 * Ensure layout has a shell for every role that has a live assignment.
 * Prevents ghost TMs when DB has step_up/admin/… but aux_layout lost the role.
 */
export function ensureAuxShellsForAssignmentKeys(
  auxDefs: AuxDef[],
  assignmentKeys: string[],
): AuxDef[] {
  let next = ensureCoreAuxRoles(auxDefs?.length ? [...auxDefs] : defaultAuxDefsForNewNight());

  for (const key of assignmentKeys) {
    const parsed = roleNthFromAssignmentKey(key);
    if (!parsed) continue;
    const { role, nth } = parsed;
    const shells = next.filter((d) => d.role === role);
    if (shells[nth]) continue;

    // Need more shells of this role — promote blanks or append.
    while (next.filter((d) => d.role === role).length <= nth) {
      const blank = next.find((d) => d.role === "blank" && !d.label?.trim());
      if (blank) {
        next = applyAuxRole(next, blank.key, role);
        continue;
      }
      if (next.length >= MAX_AUX_SLOTS) break;
      const slot = createBlankAuxSlot(next);
      if (!slot) break;
      next = applyAuxRole([...next, slot], slot.key, role);
    }
  }

  return ensureCoreAuxRoles(next);
}

export function remapAssignmentsToAuxKeys(
  assignments: Record<string, any>,
  auxDefs: AuxDef[],
): Record<string, any> {
  const out = { ...assignments };

  // Legacy fixed keys + role-stable trail keys → flex AUXn
  const candidates = Object.keys(out);
  for (const key of candidates) {
    const data = out[key];
    if (!data?.tmId && !data?.tmName) continue;
    if (/^AUX\d+$/i.test(key)) continue; // already on a shell

    const parsed = roleNthFromAssignmentKey(key);
    if (!parsed) continue;
    const shells = auxDefs.filter((d) => d.role === parsed.role);
    const target = shells[parsed.nth] ?? shells[0];
    if (!target) continue;
    if (out[target.key]?.tmId && out[target.key].tmId !== data.tmId) continue;
    out[target.key] = { ...data };
    if (target.key !== key) delete out[key];
  }

  // Also run legacy order for any remaining TR1/SP1 etc.
  for (const { legacyKey, role, nth } of LEGACY_REMAP_ORDER) {
    const data = out[legacyKey];
    if (!data?.tmId && !data?.tmName) continue;
    const slots = auxDefs.filter((d) => d.role === role);
    const target = slots[nth];
    if (target && !out[target.key]?.tmId) {
      out[target.key] = data;
      delete out[legacyKey];
    }
  }

  return out;
}

export function createBlankAuxSlot(existing: AuxDef[]): AuxDef | null {
  if (existing.length >= MAX_AUX_SLOTS) return null;
  return blankSlot(nextAuxKey(existing));
}

export function isAuxSlotEmpty(
  def: AuxDef,
  assignments: Record<string, { tmId?: string; tmName?: string }> = {},
): boolean {
  const a = assignments[def.key];
  return !(a?.tmId || a?.tmName);
}

export function findRemovableEmptyAuxSlot(
  auxDefs: AuxDef[],
  assignments: Record<string, { tmId?: string; tmName?: string }> = {},
): AuxDef | null {
  if (auxDefs.length <= 1) return null;
  for (let i = auxDefs.length - 1; i >= 0; i--) {
    const d = auxDefs[i];
    const role = d.role ?? "blank";
    // Never remove permanent Admin / Z9 SR shells.
    if (role === "admin" || role === "z9sr") continue;
    if (role === "blank" && isAuxSlotEmpty(d, assignments)) return d;
  }
  return null;
}

export function applyAuxRole(
  auxDefs: AuxDef[],
  slotKey: string,
  role: AuxRole,
): AuxDef[] {
  const nthAmongRole = NUMBERED_AUX_ROLES.has(role)
    ? auxDefs.filter((d) => d.role === role && d.key !== slotKey).length
    : 0;
  const preset = role === "blank" ? null : AUX_ROLE_PRESETS[role as TypedAuxRole];
  const autoLabel =
    role === "blank" ? "" : defaultLabelForAuxRole(role, nthAmongRole);

  return auxDefs.map((d) =>
    d.key === slotKey
      ? {
          ...d,
          role,
          label: role === "blank" ? "" : autoLabel,
          locations: preset?.locations ? [...preset.locations] : [],
        }
      : d,
  );
}

/**
 * Infer a typed aux role from free-text / custom labels.
 * "STEP UP" / "STEPUP" → step_up so we never keep role=support with a Step Up name
 * (that wrote support_1 to the DB and showed as SP1 in trails).
 */
export function inferAuxRoleFromLabel(label: string): AuxRole | null {
  const compact = (label || "").replace(/\s+/g, "").toUpperCase();
  if (!compact) return null;
  if (compact === "STEPUP" || compact === "STEP" || compact === "STEP_UP") {
    return "step_up";
  }
  if (compact === "JOBCOACH" || compact === "JC" || compact === "JOB_COACH") {
    return "job_coach";
  }
  if (compact === "ADMIN" || compact === "ADM") return "admin";
  if (compact === "Z9SR" || compact === "Z9SMOKINGROOM") return "z9sr";
  if (/^OASIS\d*$/.test(compact) || /^OAS\d*$/.test(compact)) return "oasis";
  if (/^TRASH\d*$/.test(compact) || /^TSH\d*$/.test(compact)) return "trash";
  if (/^SUPPORT\d*$/.test(compact) || /^SUP\d*$/.test(compact)) return "support";
  return null;
}

export function applyAuxLabel(
  auxDefs: AuxDef[],
  slotKey: string,
  label: string,
): AuxDef[] {
  const trimmed = label.trim();
  // Typing a known role name promotes the shell to that role (DB key + trail id).
  const inferred = inferAuxRoleFromLabel(trimmed);
  if (inferred) {
    return applyAuxRole(auxDefs, slotKey, inferred);
  }
  return auxDefs.map((d) =>
    d.key === slotKey ? { ...d, label: trimmed } : d,
  );
}

/**
 * Repair shells that were labeled Step Up / Job Coach but still typed as support
 * or blank (operator custom-label path before role promotion).
 * Step Up is NOT a permanent core card — this only fixes mis-typed shells that
 * already exist; it never invents a Step Up card on a clean night.
 */
export function coerceMislabeledAuxRoles(defs: AuxDef[]): AuxDef[] {
  if (!defs?.length) return defs;
  let next = defs;
  for (const d of defs) {
    const inferred = inferAuxRoleFromLabel(d.label || "");
    if (!inferred) continue;
    // Only lift support/blank shells that were clearly renamed to a single-instance role.
    if (
      (inferred === "step_up" || inferred === "job_coach") &&
      (d.role === "support" || d.role === "blank")
    ) {
      next = applyAuxRole(next, d.key, inferred);
    }
  }
  return next;
}

/**
 * Given a DB zone_assignments slot_key and that night's aux_layout, return the
 * stable trail id (STEP, SUP1, …). Fixes Cookie-style nights where support_1
 * was the storage key for a shell labeled "STEP UP".
 */
export function trailKeyFromDbSlotAndLayout(
  slotKey: string,
  slotType: string,
  rrSide: string | null | undefined,
  layout: AuxDef[] | null | undefined,
): string {
  const rawDefs = layout?.length ? layout : null;
  const defs = rawDefs ? coerceMislabeledAuxRoles(rawDefs) : null;

  // Cookie Jul-9 path: DB has support_1, layout shell is role=support label="STEP UP".
  // Inspect the raw layout before coerce (coerce removes the support shell).
  if (rawDefs?.length) {
    const supportN = slotKey.match(/^support_(\d+)$/);
    if (supportN) {
      const n = parseInt(supportN[1], 10);
      const supportShells = rawDefs.filter((d) => d.role === "support");
      const shell = supportShells[n - 1];
      if (shell && inferAuxRoleFromLabel(shell.label || "") === "step_up") {
        return "STEP";
      }
    }

    // Generic aux_N / AUXn storage (uiToDb without auxDefs, or live board keys)
    // → resolve via that night's shell role so trails never show AUX3 for Step Up.
    const auxN = slotKey.match(/^(?:aux_|AUX)(\d+)$/i);
    if (auxN) {
      const uiKey = `AUX${auxN[1]}`;
      const shell = rawDefs.find((d) => d.key === uiKey);
      if (shell) {
        if (shell.role === "step_up" || inferAuxRoleFromLabel(shell.label || "") === "step_up") {
          return "STEP";
        }
        if (shell.role === "job_coach" || inferAuxRoleFromLabel(shell.label || "") === "job_coach") {
          return "JC";
        }
        if (shell.role && shell.role !== "blank") {
          const nth = NUMBERED_AUX_ROLES.has(shell.role)
            ? rawDefs
                .filter((x) => x.role === shell.role)
                .findIndex((x) => x.key === shell.key)
            : 0;
          return auxRoleTrailCode(shell.role, nth >= 0 ? nth : 0);
        }
        if (shell.label?.trim()) {
          const inferred = inferAuxRoleFromLabel(shell.label);
          if (inferred) return auxRoleTrailCode(inferred, 0);
        }
      }
    }
  }

  if (defs?.length) {
    // Reverse auxUiKeyToDb: find the shell that owns this DB key.
    for (const d of defs) {
      if (d.role === "blank") continue;
      const mapped = auxUiKeyToDb(d.key, defs);
      if (mapped?.slot_key === slotKey) {
        if (d.role === "step_up" || inferAuxRoleFromLabel(d.label) === "step_up") {
          return "STEP";
        }
        if (d.role === "job_coach" || inferAuxRoleFromLabel(d.label) === "job_coach") {
          return "JC";
        }
        const nth = NUMBERED_AUX_ROLES.has(d.role)
          ? defs.filter((x) => x.role === d.role).findIndex((x) => x.key === d.key)
          : 0;
        return auxRoleTrailCode(d.role, nth >= 0 ? nth : 0);
      }
    }

    // After coerce, support_N rows with a step_up shell → STEP.
    if (/^support_\d+$/.test(slotKey) && defs.some((d) => d.role === "step_up")) {
      return "STEP";
    }
  }

  // Fallback without importing slot-keys (avoids circular auxLayout ↔ slot-keys).
  void slotType;
  void rrSide;
  if (slotKey === "step_up") return "STEP";
  if (slotKey === "job_coach") return "JC";
  if (slotKey === "admin") return "ADMIN";
  if (slotKey === "z9_sr") return "Z9SR";
  const zone = slotKey.match(/^zone_(\d+)$/);
  if (zone) return `Z${zone[1]}`;
  if (slotKey === "rr_1_2") {
    return rrSide === "womens" ? "RR1W" : "RR1M";
  }
  const rr = slotKey.match(/^rr_(\d+)$/);
  if (rr) {
    const side = rrSide === "womens" ? "W" : "M";
    return `RR${rr[1]}${side}`;
  }
  return normalizeHistoryUiKey(slotKey);
}

export function isAuxSlotKey(uiKey: string, auxDefs?: AuxDef[]): boolean {
  if (/^AUX\d+$/.test(uiKey)) return true;
  if (!auxDefs) return LEGACY_UI_TO_ROLE[uiKey] != null;
  return auxDefs.some((d) => d.key === uiKey);
}

/** Role-aware UI key → DB slot for flex AUXn keys. */
export function auxUiKeyToDb(uiKey: string, auxDefs: AuxDef[]): DbSlot | null {
  const def = auxDefs.find((d) => d.key === uiKey);
  if (!def || def.role === "blank") return null;

  switch (def.role) {
    case "admin":
      return { slot_key: "admin", slot_type: "aux", rr_side: null };
    case "z9sr":
      return { slot_key: "z9_sr", slot_type: "aux", rr_side: null };
    case "job_coach":
      return { slot_key: "job_coach", slot_type: "aux", rr_side: null };
    case "step_up":
      return { slot_key: "step_up", slot_type: "aux", rr_side: null };
    case "trash":
    case "support":
    case "oasis": {
      const n =
        auxDefs.filter((d) => d.role === def.role).findIndex((d) => d.key === uiKey) + 1;
      const prefix =
        def.role === "trash" ? "trash" : def.role === "support" ? "support" : "oasis";
      return { slot_key: `${prefix}_${n}`, slot_type: "aux", rr_side: null };
    }
    default:
      return null;
  }
}

export function isTypedAuxDef(def: AuxDef): boolean {
  return def.role !== "blank";
}

export function activeAuxDefs(auxDefs: AuxDef[]): AuxDef[] {
  return auxDefs.filter(isTypedAuxDef);
}

const CORE_AUX_ROLES: Array<{
  role: "admin" | "z9sr";
  label: string;
  locations: string[];
}> = [
  { role: "admin", label: "ADMIN", locations: ["Floor Admin"] },
  { role: "z9sr", label: "Z9 SR", locations: ["Z9 Smoking Room"] },
];

function promoteBlankToRole(
  defs: AuxDef[],
  role: "admin" | "z9sr",
  label: string,
  locations: string[],
): AuxDef[] {
  const next = [...defs];
  const emptyBlankIdx = next.findIndex(
    (d) => d.role === "blank" && !d.label?.trim(),
  );
  if (emptyBlankIdx >= 0) {
    next[emptyBlankIdx] = {
      ...next[emptyBlankIdx],
      role,
      label,
      locations: [...locations],
    };
    return next;
  }
  // No blank shell: append a new core card if under max.
  if (next.length < MAX_AUX_SLOTS) {
    next.push({
      key: nextAuxKey(next),
      role,
      label,
      locations: [...locations],
    });
  }
  return next;
}

/**
 * Ensures Admin and Zone 9 Smoking Room cards are always present, with Admin first
 * and Z9 SR second — matching ops expectation that both fixed aux roles are permanent.
 *
 * - Existing admin / z9sr cards are reordered to the front (admin, then z9sr).
 * - Missing roles are promoted from empty blank shells (never overwrites labeled cards).
 * - If no blank shells remain and under MAX_AUX_SLOTS, a new card is appended.
 */
export function ensureCoreAuxRoles(defs: AuxDef[]): AuxDef[] {
  if (!defs || defs.length === 0) {
    return defaultAuxDefsForNewNight();
  }

  let next = [...defs];

  for (const core of CORE_AUX_ROLES) {
    if (!next.some((d) => d.role === core.role)) {
      next = promoteBlankToRole(next, core.role, core.label, core.locations);
    }
  }

  // Stable order: admin, z9sr, then everything else (preserve relative order of the rest).
  const admin = next.find((d) => d.role === "admin");
  const z9 = next.find((d) => d.role === "z9sr");
  const rest = next.filter((d) => d.role !== "admin" && d.role !== "z9sr");
  const ordered: AuxDef[] = [];
  if (admin) ordered.push(admin);
  if (z9) ordered.push(z9);
  ordered.push(...rest);

  // Normalize labels/locations for core roles so UI never shows a bare "AUX1" shell
  // when the role is admin/z9sr.
  return ordered.map((d) => {
    if (d.role === "admin") {
      return {
        ...d,
        label: d.label?.trim() ? d.label : "ADMIN",
        locations:
          d.locations?.length > 0 ? d.locations : ["Floor Admin"],
      };
    }
    if (d.role === "z9sr") {
      return {
        ...d,
        label: d.label?.trim() ? d.label : "Z9 SR",
        locations:
          d.locations?.length > 0 ? d.locations : ["Z9 Smoking Room"],
      };
    }
    return d;
  });
}

/**
 * @deprecated Prefer ensureCoreAuxRoles — kept for call-site compatibility.
 * Ensures admin first; also ensures Z9 SR via ensureCoreAuxRoles.
 */
export function ensureAdminFirst(defs: AuxDef[]): AuxDef[] {
  return ensureCoreAuxRoles(defs);
}

/** New night: Admin + Z9 SR fixed, then blank shells for operator-configured aux. */
export function defaultAuxDefsForNewNight(): AuxDef[] {
  const adminDef: AuxDef = {
    key: "AUX1",
    role: "admin" as const,
    label: "ADMIN",
    locations: ["Floor Admin"],
  };
  const z9Def: AuxDef = {
    key: "AUX2",
    role: "z9sr" as const,
    label: "Z9 SR",
    locations: ["Z9 Smoking Room"],
  };
  const blanks = Array.from({ length: 4 }, (_, i) => ({
    key: `AUX${i + 3}`,
    role: "blank" as const,
    label: "",
    locations: [] as string[],
  }));
  return [adminDef, z9Def, ...blanks];
}