import type { DeploymentChangeAction } from "@/lib/shiftbuilder/deploymentChangeLog";
import type { ShiftBuilderPermissions } from "./opsAuthTypes";

export type PermissionKey = keyof ShiftBuilderPermissions;

/** Minimum permission bit required to record a given audit action. */
export function permissionRequiredForAuditAction(
  action: DeploymentChangeAction,
): PermissionKey | "authenticated" {
  switch (action) {
    case "assign":
    case "unassign":
    case "task_add":
    case "task_remove":
    case "coverage_add":
    case "break_change":
    case "task_color":
      return "canEditAssignments";
    case "lock":
    case "unlock":
    case "night_lock":
    case "night_unlock":
      return "canLockUnlock";
    case "publish":
    case "unpublish":
      return "canPublish";
    case "schedule_apply":
      return "canApplySchedules";
    case "engine_run":
      return "canRunEngine";
    case "engine_config":
    case "defaults_push":
    case "task_catalog":
    case "tm_defaults":
    case "settings_update":
    case "settings_nav":
    case "user_update":
      return "canAccessSudo";
    case "team_update":
    case "roster_update":
      return "canManageTeam";
    case "print":
    case "session_start":
    case "session_end":
    default:
      return "authenticated";
  }
}

export function hasOpsPermission(
  permissions: ShiftBuilderPermissions,
  key: PermissionKey | "authenticated",
): boolean {
  if (key === "authenticated") return true;
  return Boolean(permissions[key]);
}