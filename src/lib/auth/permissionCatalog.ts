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
    description: "Edit the Graves Default Schedule master grid",
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
    label: "Access Settings (Sudo)",
    group: "Administrative",
    description: "Open OMS Settings — engine, users, defaults, and full admin tools",
  },
  {
    key: "canAccessReports",
    label: "Access Reports",
    group: "Administrative",
    description: "Open /shiftbuilder/reports placement analytics",
  },
  {
    key: "canEditPublishedOnly",
    label: "Published Nights Only",
    group: "Editing",
    description:
      "Floor viewer marker — read and write allowed only on published nights (locks Viewer role)",
  },
  {
    key: "canAccessTasks",
    label: "Access Projects & Tasks",
    group: "Viewing",
    description: "Open /shiftbuilder/projects — view projects, tasks, and assigned work",
  },
  {
    key: "canManageTasks",
    label: "Manage Projects & Tasks",
    group: "Editing",
    description: "Create/edit/assign/delete any project or task; complete tasks assigned to others",
  },
  {
    key: "canCompleteOwnTasks",
    label: "Complete Own Tasks",
    group: "Editing",
    description: "Mark tasks assigned to you complete without full task management access",
  },
  {
    key: "canRequestTasks",
    label: "Request Tasks & Projects",
    group: "Editing",
    description:
      "Submit task/project requests from the board and manage only your own submissions (they land pending a manager's approval)",
  },
];

export type OpsRoleOption = {
  value: OpsRole;
  label: string;
  description: string;
  surface: "sudo" | "admin" | "reports" | "team";
};

/** Primary roles shown in Settings → Users. Legacy roles remain valid for existing accounts. */
export const OPS_ROLE_OPTIONS: OpsRoleOption[] = [
  {
    value: "sudo_admin",
    label: "Sudo Admin",
    description: "Full control — settings, publish, engine, all nights",
    surface: "sudo",
  },
  {
    value: "admin",
    label: "Admin",
    description: "Published nights on canvas — same floor access as Viewer (no reports or settings)",
    surface: "team",
  },
  {
    value: "viewer",
    label: "Viewer",
    description: "Floor operator — published nights only (view and edit placements, tasks, coverage)",
    surface: "team",
  },
];

const LEGACY_ROLE_OPTIONS: OpsRoleOption[] = [
  {
    value: "ops_director",
    label: "Ops Director (legacy)",
    description: "Legacy leadership role",
    surface: "sudo",
  },
  {
    value: "ops_manager",
    label: "Ops Manager (legacy)",
    description: "Legacy manager role",
    surface: "sudo",
  },
  {
    value: "graves_ops_super",
    label: "Graves Supervisor (legacy)",
    description: "Legacy grave shift supervisor",
    surface: "team",
  },
  {
    value: "days_ops_super",
    label: "Days Supervisor (legacy)",
    description: "Legacy day shift supervisor",
    surface: "team",
  },
  {
    value: "swings_ops_super",
    label: "Swings Supervisor (legacy)",
    description: "Legacy swing shift supervisor",
    surface: "team",
  },
  {
    value: "utility_ops_super",
    label: "Utility Supervisor (legacy)",
    description: "Legacy utility supervisor",
    surface: "team",
  },
];

export const ALL_ROLE_OPTIONS: OpsRoleOption[] = [...OPS_ROLE_OPTIONS, ...LEGACY_ROLE_OPTIONS];

export function roleLabel(role: string): string {
  return ALL_ROLE_OPTIONS.find((r) => r.value === role)?.label ?? role;
}

export function roleSurface(role: string): "sudo" | "admin" | "reports" | "team" {
  return ALL_ROLE_OPTIONS.find((r) => r.value === role)?.surface ?? "team";
}

/** Options for role pickers — includes legacy role when editing an existing legacy account. */
export function roleOptionsForUser(currentRole?: string | null): OpsRoleOption[] {
  if (!currentRole || OPS_ROLE_OPTIONS.some((r) => r.value === currentRole)) {
    return OPS_ROLE_OPTIONS;
  }
  const legacy = LEGACY_ROLE_OPTIONS.find((r) => r.value === currentRole);
  return legacy ? [...OPS_ROLE_OPTIONS, legacy] : OPS_ROLE_OPTIONS;
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
  if (
    role === "admin" ||
    role === "viewer" ||
    role === "sudo_admin" ||
    role === "ops_director" ||
    role === "ops_manager"
  ) {
    return getPermissionsForRole(role);
  }
  const base = getPermissionsForRole(role);
  const merged = { ...base, ...(sanitizePermissionOverrides(overrides) ?? {}) };
  if (!["sudo_admin", "graves_ops_super"].includes(role)) {
    merged.canSeeDraftData = false;
  }
  return merged;
}