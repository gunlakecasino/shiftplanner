import type { OpsRole, ShiftBuilderPermissions } from "./opsAuthTypes";
import { getPermissionsForRole } from "./permissions";

export type PermissionKey = keyof ShiftBuilderPermissions;

export type PermissionDef = {
  key: PermissionKey;
  label: string;
  group: "Viewing" | "Editing" | "Schedules" | "Advanced" | "Administrative";
  description: string;
};

/** Every ShiftBuilder capability an operator can be granted (or denied via override). */
export const PERMISSION_CATALOG: PermissionDef[] = [
  {
    key: "canSeeDraftData",
    label: "View Unpublished / Draft Schedules",
    group: "Viewing",
    description: "See nights and weeks that have not been published yet",
  },
  {
    key: "canEditAssignments",
    label: "Edit Assignments",
    group: "Editing",
    description: "Drag and drop TMs on the deployment canvas",
  },
  {
    key: "canLockUnlock",
    label: "Lock / Unlock Slots",
    group: "Editing",
    description: "Lock individual positions from further edits",
  },
  {
    key: "canApplySchedules",
    label: "Apply Schedules",
    group: "Schedules",
    description: "Apply uploaded ADP schedules to live nights",
  },
  {
    key: "canPublish",
    label: "Publish / Unpublish",
    group: "Schedules",
    description: "Mark weeks or days as officially published",
  },
  {
    key: "canRunEngine",
    label: "Run Engine / Batch Planner",
    group: "Advanced",
    description: "Trigger the placement engine and batch planner",
  },
  {
    key: "canManageTeam",
    label: "Manage Team Roster",
    group: "Advanced",
    description: "Create and edit TM profiles in Settings → Team",
  },
  {
    key: "canAccessSudo",
    label: "Access Settings (Admin)",
    group: "Administrative",
    description: "Open OMS Settings — engine, users, defaults, reports",
  },
];

export type OpsRoleOption = {
  value: OpsRole;
  label: string;
  description: string;
  surface: "admin" | "team";
};

export const OPS_ROLE_OPTIONS: OpsRoleOption[] = [
  {
    value: "sudo_admin",
    label: "Sudo Admin",
    description: "Full backend control including user management",
    surface: "admin",
  },
  {
    value: "admin",
    label: "Admin",
    description: "Full ShiftBuilder + Settings access",
    surface: "admin",
  },
  {
    value: "ops_director",
    label: "Ops Director",
    description: "Leadership — publish, engine, settings",
    surface: "admin",
  },
  {
    value: "ops_manager",
    label: "Ops Manager",
    description: "Managers — schedules, engine, team",
    surface: "admin",
  },
  {
    value: "graves_ops_super",
    label: "Graves Supervisor",
    description: "Grave shift floor lead — canvas editing",
    surface: "team",
  },
  {
    value: "days_ops_super",
    label: "Days Supervisor",
    description: "Day shift supervisor — canvas editing",
    surface: "team",
  },
  {
    value: "swings_ops_super",
    label: "Swings Supervisor",
    description: "Swing shift supervisor — canvas editing",
    surface: "team",
  },
  {
    value: "utility_ops_super",
    label: "Utility Supervisor",
    description: "Default floor operator — canvas editing",
    surface: "team",
  },
];

export function roleLabel(role: string): string {
  return OPS_ROLE_OPTIONS.find((r) => r.value === role)?.label ?? role;
}

export function roleSurface(role: string): "admin" | "team" {
  return OPS_ROLE_OPTIONS.find((r) => r.value === role)?.surface ?? "team";
}

/** Sanitize permission overrides — only known boolean keys. */
export function sanitizePermissionOverrides(
  input: Partial<ShiftBuilderPermissions> | null | undefined,
): Partial<ShiftBuilderPermissions> | null {
  if (!input) return null;
  const out: Partial<ShiftBuilderPermissions> = {};
  for (const def of PERMISSION_CATALOG) {
    const v = input[def.key];
    if (typeof v === "boolean") out[def.key] = v;
  }
  return Object.keys(out).length > 0 ? out : null;
}

export function effectivePermissionsForUser(
  role: OpsRole,
  overrides: Partial<ShiftBuilderPermissions> | null | undefined,
): ShiftBuilderPermissions {
  const base = getPermissionsForRole(role);
  const merged = { ...base, ...(sanitizePermissionOverrides(overrides) ?? {}) };
  if (!["sudo_admin", "graves_ops_super"].includes(role)) {
    merged.canSeeDraftData = false;
  }
  return merged;
}