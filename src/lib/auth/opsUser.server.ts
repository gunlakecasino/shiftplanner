import { createAdminClientSafe } from "@/app/api/admin/_lib/createAdminClient";
import { getEffectivePermissions } from "./permissions";
import { resolveDisplayRole } from "./roleStorage";
import type { OpsRole, OpsUser } from "./opsAuthTypes";

const USER_PROFILE_SELECT =
  "id, email, full_name, username, role, permissions, must_change_pin, is_active, pin_issued_at, locked_until";

export async function loadOpsUserById(userId: string): Promise<OpsUser | null> {
  const client = createAdminClientSafe();
  if (!client) return null;

  const { data, error } = await client
    .from("users")
    .select(USER_PROFILE_SELECT)
    .eq("id", userId)
    .maybeSingle();

  if (error || !data || !data.is_active) return null;

  const permissions = data.permissions ?? null;
  return {
    id: data.id,
    email: data.email ?? "",
    full_name: data.full_name ?? "",
    username: data.username ?? "",
    role: resolveDisplayRole(data.role, permissions) as OpsRole,
    permissions,
    must_change_pin: Boolean(data.must_change_pin),
  };
}

export function userForClientResponse(user: OpsUser) {
  const permissions = getEffectivePermissions(user);
  return {
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    username: user.username,
    role: user.role,
    permissions: user.permissions ?? null,
    must_change_pin: Boolean(user.must_change_pin),
    effective_permissions: permissions,
  };
}