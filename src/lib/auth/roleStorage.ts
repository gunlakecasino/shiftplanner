import type { OpsRole } from "./opsAuthTypes";
import { getPermissionsForRole } from "./permissions";
import { sanitizePermissionOverrides } from "./permissionCatalog";
import type { ShiftBuilderPermissions } from "./opsAuthTypes";

/** DB enum value used until `viewer` is added to `user_role` in production. */
export const VIEWER_STORED_ROLE = "utility_ops_super" as const;

export function isViewerStoredAccount(
  role: string,
  permissions: Partial<ShiftBuilderPermissions> | Record<string, unknown> | null | undefined,
): boolean {
  return role === VIEWER_STORED_ROLE && permissions?.canEditPublishedOnly === true;
}

/** Map UI role → persisted DB role + permission overrides. */
export function resolveStoredUserRole(
  role: string,
  permissions?: Partial<ShiftBuilderPermissions> | null,
): { role: string; permissions: Partial<ShiftBuilderPermissions> | null } {
  if (role === "viewer") {
    return {
      role: VIEWER_STORED_ROLE,
      permissions: sanitizePermissionOverrides(getPermissionsForRole("viewer")),
    };
  }

  if (role === "sudo_admin") {
    return {
      role: "sudo_admin",
      permissions: sanitizePermissionOverrides(permissions),
    };
  }

  return {
    role: role.trim() || VIEWER_STORED_ROLE,
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