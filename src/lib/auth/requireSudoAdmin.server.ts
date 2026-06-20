import type { NextRequest } from "next/server";
import { createAdminClientSafe } from "@/app/api/admin/_lib/createAdminClient";
import { readSessionUserId } from "./opsSession.server";

export type SudoAdminActor = {
  id: string;
  role: string;
  full_name: string;
  username: string;
  is_active: boolean;
};

export async function requireSudoAdmin(
  request: NextRequest,
): Promise<{ ok: true; actor: SudoAdminActor } | { ok: false; status: number; error: string }> {
  const userId = readSessionUserId(request);
  if (!userId) {
    return { ok: false, status: 401, error: "Not authenticated — sudo_admin session required" };
  }

  const client = createAdminClientSafe();
  if (!client) {
    return { ok: false, status: 503, error: "Service unavailable" };
  }

  const { data: user, error } = await client
    .from("users")
    .select("id, role, full_name, username, is_active, must_change_pin")
    .eq("id", userId)
    .maybeSingle();

  if (error || !user) {
    return { ok: false, status: 401, error: "Session invalid" };
  }

  if (!user.is_active) {
    return { ok: false, status: 403, error: "Account is inactive" };
  }

  if (user.must_change_pin) {
    return { ok: false, status: 403, error: "Complete PIN setup before admin actions" };
  }

  if (user.role !== "sudo_admin") {
    return { ok: false, status: 403, error: "sudo_admin role required" };
  }

  return {
    ok: true,
    actor: {
      id: user.id,
      role: user.role,
      full_name: user.full_name,
      username: user.username,
      is_active: user.is_active,
    },
  };
}

export async function countActiveSudoAdmins(excludeUserId?: string): Promise<number> {
  const client = createAdminClientSafe();
  if (!client) return 0;

  let query = client
    .from("users")
    .select("id", { count: "exact", head: true })
    .eq("role", "sudo_admin")
    .eq("is_active", true);

  if (excludeUserId) {
    query = query.neq("id", excludeUserId);
  }

  const { count } = await query;
  return count ?? 0;
}