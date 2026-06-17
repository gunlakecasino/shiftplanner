/**
 * Flex aux row — layout resolution, migration, and role-aware key mapping.
 */

import type { AuxDef, AuxRole } from "./placement";
import type { DbSlot } from "./slot-keys";
import {
  BLANK_AUX_DEFS,
  AUX_ROLE_PRESETS,
  MAX_AUX_SLOTS,
  defaultLabelForAuxRole,
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
  /^(admin|z9_sr|trash_\d+|support_\d+|aux_\d+)$/;

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
  if (/^trash_\d+$/.test(slotKey)) return "trash";
  if (/^support_\d+$/.test(slotKey)) return "support";
  if (/^aux_\d+$/.test(slotKey)) return "blank";
  return null;
}

type TypedAuxRole = Exclude<AuxRole, "blank">;

function labelForRole(role: AuxRole, nthAmongRole: number): string {
  if (role === "blank") return "";
  const preset = AUX_ROLE_PRESETS[role as TypedAuxRole];
  if (!preset) return "";
  if (role === "trash" || role === "support") {
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
  const validRoles: AuxRole[] = ["blank", "z9sr", "admin", "trash", "support"];
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
  if (parsed?.length) return parsed;
  if (!nightHasAuxAssignmentData(rawDbAssignments)) {
    return defaultAuxDefsForNewNight();
  }
  return migrateAuxLayoutFromDbRows(rawDbAssignments);
}

export function remapAssignmentsToAuxKeys(
  assignments: Record<string, any>,
  auxDefs: AuxDef[],
): Record<string, any> {
  const out = { ...assignments };

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
    if (role === "blank" && isAuxSlotEmpty(d, assignments)) return d;
  }
  return null;
}

export function applyAuxRole(
  auxDefs: AuxDef[],
  slotKey: string,
  role: AuxRole,
): AuxDef[] {
  const trashCount = auxDefs.filter((d) => d.role === "trash" && d.key !== slotKey).length;
  const supportCount = auxDefs.filter((d) => d.role === "support" && d.key !== slotKey).length;
  const preset = role === "blank" ? null : AUX_ROLE_PRESETS[role as TypedAuxRole];
  const nth =
    role === "trash" ? trashCount : role === "support" ? supportCount : 0;
  const autoLabel =
    role === "blank" ? "" : defaultLabelForAuxRole(role, nth);

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

export function applyAuxLabel(
  auxDefs: AuxDef[],
  slotKey: string,
  label: string,
): AuxDef[] {
  return auxDefs.map((d) =>
    d.key === slotKey ? { ...d, label: label.trim() } : d,
  );
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
    case "trash": {
      const n =
        auxDefs.filter((d) => d.role === "trash").findIndex((d) => d.key === uiKey) + 1;
      return { slot_key: `trash_${n}`, slot_type: "aux", rr_side: null };
    }
    case "support": {
      const n =
        auxDefs.filter((d) => d.role === "support").findIndex((d) => d.key === uiKey) + 1;
      return { slot_key: `support_${n}`, slot_type: "aux", rr_side: null };
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

/**
 * Ensures the "admin" aux card (if present or needed) is always the first in the list.
 * If an admin role exists later, it is moved to front.
 * If no admin exists, the first editable (blank) card is replaced with the admin card,
 * keeping the total count the same (replaces first blank with admin).
 */
export function ensureAdminFirst(defs: AuxDef[]): AuxDef[] {
  if (!defs || defs.length === 0) return defs;
  const adminIndex = defs.findIndex((d) => d.role === "admin");
  if (adminIndex === 0) return defs;

  let next = [...defs];
  let adminDef: AuxDef;

  if (adminIndex > 0) {
    adminDef = next.splice(adminIndex, 1)[0];
  } else {
    // No admin: replace the first card (the first editable/blank) with admin.
    // Keep the key of the replaced slot if possible.
    const replaceKey = next.length > 0 ? next[0].key : "AUX1";
    adminDef = {
      key: replaceKey,
      role: "admin" as const,
      label: "ADMIN",
      locations: ["Floor Admin"],
    };
    if (next.length > 0) {
      next.shift(); // remove the first editable being replaced
    }
  }

  return [adminDef, ...next];
}

export function defaultAuxDefsForNewNight(): AuxDef[] {
  const adminDef: AuxDef = {
    key: "AUX1",
    role: "admin" as const,
    label: "ADMIN",
    locations: ["Floor Admin"],
  };
  const blanks = Array.from({ length: 5 }, (_, i) => ({
    key: `AUX${i + 2}`,
    role: "blank" as const,
    label: "",
    locations: [],
  }));
  return [adminDef, ...blanks];
}