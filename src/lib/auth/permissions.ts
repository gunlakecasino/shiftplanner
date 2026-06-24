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

  return { ...base, ...sanitized };
}