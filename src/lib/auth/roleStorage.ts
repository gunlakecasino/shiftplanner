import type { OpsRole } from "./opsAuthTypes";
import { getPermissionsForRole } from "./permissions";
import { sanitizePermissionOverrides } from "./permissionCatalog";
import type { ShiftBuilderPermissions } from "./opsAuthTypes";

/** Legacy shim before `viewer` existed on the user_role enum. */
export const VIEWER_STORED_ROLE = "utility_ops_super" as const;

export function isViewerStoredAccount(
  role: string,
  permissions: Partial<ShiftBuilderPermissions> | Record<string, unknown> | null | undefined,
): boolean {
  if (role === "viewer") return true;
  return role === VIEWER_STORED_ROLE && permissions?.canEditPublishedOnly === true;
}

/** Map UI role → persisted DB role + permission overrides. */
export function resolveStoredUserRole(
  role: string,
  permissions?: Partial<ShiftBuilderPermissions> | null,
): { role: string; permissions: Partial<ShiftBuilderPermissions> | null } {
  if (role === "viewer") {
    return {
      role: "viewer",
      permissions: sanitizePermissionOverrides(getPermissionsForRole("viewer")),
    };
  }

  if (role === "sudo_admin") {
    return {
      role: "sudo_admin",
      permissions: sanitizePermissionOverrides(permissions),
    };
  }

  if (role === "admin") {
    return {
      role: "admin",
      permissions: sanitizePermissionOverrides(getPermissionsForRole("admin")),
    };
  }

  return {
    role: role.trim() || "viewer",
    permissions: sanitizePermissionOverrides(permissions),
  };
}

/** Map DB row → operator-facing role for UI and session payloads. */
export function resolveDisplayRole(
  role: string,
  permissions: Partial<ShiftBuilderPermissions> | Record<string, unknown> | null | undefined,
): OpsRole | string {
  if (isViewerStoredAccount(role, permissions)) {
    return "viewer";
  }
  return role;
}