import { createAdminClientSafe } from "@/app/api/admin/_lib/createAdminClient";
import { getEffectivePermissions } from "./permissions";
import { resolveDisplayRole } from "./roleStorage";
import type { OpsRole, OpsUser } from "./opsAuthTypes";

const USER_PROFILE_SELECT =
  "id, email, full_name, username, role, permissions, must_change_pin, is_active, pin_issued_at, locked_until";

export type VerifyPinEdgeUser = {
  id: string;
  email?: string | null;
  full_name?: string | null;
  username?: string | null;
  role?: string | null;
  permissions?: Record<string, boolean> | null;
  must_change_pin?: boolean | null;
};

function mapRowToOpsUser(data: {
  id: string;
  email?: string | null;
  full_name?: string | null;
  username?: string | null;
  role?: string | null;
  permissions?: Record<string, boolean> | null;
  must_change_pin?: boolean | null;
}): OpsUser {
  const permissions = data.permissions ?? null;
  return {
    id: data.id,
    email: data.email ?? "",
    full_name: data.full_name ?? "",
    username: data.username ?? "",
    role: resolveDisplayRole(data.role ?? "viewer", permissions) as OpsRole,
    permissions,
    must_change_pin: Boolean(data.must_change_pin),
  };
}

/** Map edge verify-pin success payload when server admin client is unavailable. */
export function opsUserFromEdgePayload(edge: VerifyPinEdgeUser): OpsUser | null {
  if (!edge?.id) return null;
  return mapRowToOpsUser(edge);
}

export async function loadOpsUserById(userId: string): Promise<OpsUser | null> {
  const client = createAdminClientSafe();
  if (!client) {
    console.warn("[loadOpsUserById] Admin client unavailable — set SUPABASE_SERVICE_ROLE_KEY on the server");
    return null;
  }

  const { data, error } = await client
    .from("users")
    .select(USER_PROFILE_SELECT)
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("[loadOpsUserById] Query failed:", error.message);
    return null;
  }
  if (!data) {
    console.warn("[loadOpsUserById] No user row for id:", userId);
    return null;
  }
  if (!data.is_active) {
    console.warn("[loadOpsUserById] User inactive:", userId);
    return null;
  }

  return mapRowToOpsUser(data);
}

/**
 * After edge PIN verification succeeds, prefer a fresh DB row; fall back to the
 * edge profile so production login works when Railway lacks service-role reload.
 */
export async function resolveOpsUserAfterPinVerify(
  edgeUser: VerifyPinEdgeUser,
): Promise<OpsUser | null> {
  const loaded = await loadOpsUserById(edgeUser.id);
  if (loaded) return loaded;
  return opsUserFromEdgePayload(edgeUser);
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