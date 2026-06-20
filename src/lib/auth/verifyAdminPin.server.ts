import { createAdminClientSafe } from "@/app/api/admin/_lib/createAdminClient";

const PIN_RE = /^\d{6}$/;

/** Verify a sudo_admin's own PIN before destructive admin actions. */
export async function verifyAdminPin(userId: string, pin: string): Promise<boolean> {
  const trimmed = pin?.trim() ?? "";
  if (!PIN_RE.test(trimmed)) return false;

  const client = createAdminClientSafe();
  if (!client) return false;

  const { data, error } = await client.rpc("verify_user_pin", {
    p_user_id: userId,
    p_pin: trimmed,
  });

  if (error) {
    console.warn("[verifyAdminPin] rpc failed", error.message);
    return false;
  }

  return data === true;
}