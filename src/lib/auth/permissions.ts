import type { OpsRole, OpsUser, ShiftBuilderPermissions } from "./opsAuthTypes";
import { isViewerStoredAccount } from "./roleStorage";

export type { OpsRole, ShiftBuilderPermissions };

function permissionsBaseRole(user: Pick<OpsUser, "role" | "permissions">): OpsRole {
  if (isViewerStoredAccount(user.role, user.permissions)) {
    return "viewer";
  }
  return user.role;
}

/**
 * Roles with a fixed capability contract — stored DB overrides must not change access.
 * - admin / viewer: legacy overrides cannot widen access
 * - sudo_admin (+ leadership aliases): zero restrictions — all nights, settings, reports
 */
const CANONICAL_TEMPLATE_ROLES: OpsRole[] = [
  "admin",
  "viewer",
  "sudo_admin",
  "ops_director",
  "ops_manager",
];

export function isUnrestrictedOpsRole(
  permissions: Pick<ShiftBuilderPermissions, "canAccessSudo" | "canSeeDraftData"> | null | undefined,
): boolean {
  return Boolean(permissions?.canAccessSudo && permissions?.canSeeDraftData);
}

export function getEffectivePermissions(user: Pick<OpsUser, "role" | "permissions">): ShiftBuilderPermissions {
  const baseRole = permissionsBaseRole(user);

  if (CANONICAL_TEMPLATE_ROLES.includes(baseRole)) {
    return getPermissionsForRole(baseRole);
  }

  const base = getPermissionsForRole(baseRole);
  let effective = mergePermissions(base, user.permissions);
  if (!["sudo_admin", "graves_ops_super"].includes(user.role)) {
    effective = { ...effective, canSeeDraftData: false };
  }
  return effective;
}

export function getPermissionsForRole(role: OpsRole): ShiftBuilderPermissions {
  switch (role) {
    case "viewer":
      return {
        canEditAssignments: true,
        canLockUnlock: false,
        canApplySchedules: false,
        canPublish: false,
        canSeeDraftData: false,
        canAccessSudo: false,
        canAccessReports: false,
        canRunEngine: false,
        canManageTeam: false,
        canEditPublishedOnly: true,
        // Viewers are walled off from the Projects/ops-work-item system entirely:
        // no /shiftbuilder/projects access, no Projects nav link, no board task
        // awareness pill/badges, and no task API access at any level. Their task
        // work stays on the board itself (night_slot_tasks via the card TasksPad),
        // which is gated only by night-lock and needs none of these flags.
        canAccessTasks: false,
        canManageTasks: false,
        canCompleteOwnTasks: false,
        // Narrow intake door: viewers may submit task/project requests from the
        // board and manage only their own submissions. Separate from the wall.
        canRequestTasks: true,
      };

    case "admin":
      return {
        canEditAssignments: true,
        canLockUnlock: false,
        canApplySchedules: false,
        canPublish: false,
        canSeeDraftData: false,
        canAccessSudo: false,
        canAccessReports: false,
        canRunEngine: false,
        canManageTeam: false,
        canEditPublishedOnly: true,
        // Projects/tasks access removed for now — admins are walled off from the
        // ops-work-item system (pages, nav link, board awareness pill/badges, and
        // the task APIs at every level), same as viewer. Card task management on
        // the board (night_slot_tasks) is unaffected.
        canAccessTasks: false,
        canManageTasks: false,
        canCompleteOwnTasks: false,
        canRequestTasks: false,
      };

    case "sudo_admin":
    case "ops_director":
      return {
        canEditAssignments: true,
        canLockUnlock: true,
        canApplySchedules: true,
        canPublish: true,
        canSeeDraftData: true,
        canAccessSudo: true,
        canAccessReports: true,
        canRunEngine: true,
        canManageTeam: true,
        canEditPublishedOnly: false,
        canAccessTasks: true,
        canManageTasks: true,
        canCompleteOwnTasks: true,
        canRequestTasks: false,
      };

    case "ops_manager":
      return {
        canEditAssignments: true,
        canLockUnlock: true,
        canApplySchedules: true,
        canPublish: true,
        canSeeDraftData: true,
        canAccessSudo: true,
        canAccessReports: true,
        canRunEngine: true,
        canManageTeam: true,
        canEditPublishedOnly: false,
        canAccessTasks: true,
        canManageTasks: true,
        canCompleteOwnTasks: true,
        canRequestTasks: false,
      };

    case "graves_ops_super":
      return {
        canEditAssignments: true,
        canLockUnlock: true,
        canApplySchedules: false,
        canPublish: false,
        canSeeDraftData: false,
        canAccessSudo: false,
        canAccessReports: false,
        canRunEngine: false,
        canManageTeam: false,
        canEditPublishedOnly: false,
        canAccessTasks: true,
        canManageTasks: true,
        canCompleteOwnTasks: true,
        canRequestTasks: false,
      };

    case "days_ops_super":
    case "swings_ops_super":
      return {
        canEditAssignments: true,
        canLockUnlock: true,
        canApplySchedules: false,
        canPublish: false,
        canSeeDraftData: false,
        canAccessSudo: false,
        canAccessReports: false,
        canRunEngine: false,
        canManageTeam: false,
        canEditPublishedOnly: false,
        canAccessTasks: true,
        canManageTasks: false,
        canCompleteOwnTasks: true,
        canRequestTasks: false,
      };

    case "utility_ops_super":
    case "ops_super":
    default:
      return {
        canEditAssignments: true,
        canLockUnlock: true,
        canApplySchedules: false,
        canPublish: false,
        canSeeDraftData: false,
        canAccessSudo: false,
        canAccessReports: false,
        canRunEngine: false,
        canManageTeam: false,
        canEditPublishedOnly: false,
        canAccessTasks: true,
        canManageTasks: false,
        canCompleteOwnTasks: true,
        canRequestTasks: false,
      };
  }
}

export function mergePermissions(
  base: ShiftBuilderPermissions,
  overrides?: Partial<ShiftBuilderPermissions> | null,
): ShiftBuilderPermissions {
  if (!overrides) return { ...base };

  const sanitized: Partial<ShiftBuilderPermissions> = {};
  if (typeof overrides.canEditAssignments === "boolean") sanitized.canEditAssignments = overrides.canEditAssignments;
  if (typeof overrides.canLockUnlock === "boolean") sanitized.canLockUnlock = overrides.canLockUnlock;
  if (typeof overrides.canApplySchedules === "boolean") sanitized.canApplySchedules = overrides.canApplySchedules;
  if (typeof overrides.canPublish === "boolean") sanitized.canPublish = overrides.canPublish;
  if (typeof overrides.canSeeDraftData === "boolean") sanitized.canSeeDraftData = overrides.canSeeDraftData;
  if (typeof overrides.canAccessSudo === "boolean") sanitized.canAccessSudo = overrides.canAccessSudo;
  if (typeof overrides.canAccessReports === "boolean") {
    sanitized.canAccessReports = overrides.canAccessReports;
  }
  if (typeof overrides.canRunEngine === "boolean") sanitized.canRunEngine = overrides.canRunEngine;
  if (typeof overrides.canManageTeam === "boolean") sanitized.canManageTeam = overrides.canManageTeam;
  if (typeof overrides.canEditPublishedOnly === "boolean") {
    sanitized.canEditPublishedOnly = overrides.canEditPublishedOnly;
  }
  if (typeof overrides.canAccessTasks === "boolean") sanitized.canAccessTasks = overrides.canAccessTasks;
  if (typeof overrides.canManageTasks === "boolean") sanitized.canManageTasks = overrides.canManageTasks;
  if (typeof overrides.canCompleteOwnTasks === "boolean") {
    sanitized.canCompleteOwnTasks = overrides.canCompleteOwnTasks;
  }
  if (typeof overrides.canRequestTasks === "boolean") {
    sanitized.canRequestTasks = overrides.canRequestTasks;
  }

  return { ...base, ...sanitized };
}