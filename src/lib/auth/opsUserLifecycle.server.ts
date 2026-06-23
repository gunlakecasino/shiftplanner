import bcrypt from "bcryptjs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveStoredUserRole } from "./roleStorage";

const BCRYPT_ROUNDS = 12;

export function generateSixDigitPin(): string {
  let pin = "";
  do {
    pin = String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
  } while (pin === "000000");
  return pin;
}

export async function hashOpsPin(pin: string): Promise<string> {
  if (!/^\d{6}$/.test(pin) || pin === "000000") {
    throw new Error("PIN must be exactly 6 digits");
  }
  return bcrypt.hash(pin, BCRYPT_ROUNDS);
}

export type CreateOpsUserInput = {
  full_name: string;
  username: string;
  email?: string | null;
  role?: string;
  permissions?: Record<string, boolean> | null;
  must_change_pin?: boolean;
};

export type CreateOpsUserResult = {
  userId: string;
  temporaryPin: string;
};

export async function createOpsUserWithPin(
  client: SupabaseClient,
  input: CreateOpsUserInput,
): Promise<CreateOpsUserResult> {
  const full_name = input.full_name.trim();
  const username = input.username.trim();
  const email =
    input.email?.trim() ||
    `${username.toLowerCase().replace(/[^a-z0-9._-]+/g, ".")}@operators.local`;
  const stored = resolveStoredUserRole(input.role?.trim() || "viewer", input.permissions);
  const role = stored.role;
  const permissions = stored.permissions;
  const must_change_pin = input.must_change_pin ?? true;

  if (!full_name || !username) {
    throw new Error("full_name and username are required");
  }

  const { data: existing } = await client
    .from("users")
    .select("id")
    .ilike("username", username)
    .maybeSingle();

  if (existing) {
    throw new Error("username already exists");
  }

  const temporaryPin = generateSixDigitPin();
  const pin_hash = await hashOpsPin(temporaryPin);
  const now = new Date().toISOString();

  const { data: inserted, error } = await client
    .from("users")
    .insert({
      full_name,
      username,
      email,
      role,
      is_active: true,
      pin_hash,
      permissions,
      must_change_pin,
      pin_issued_at: now,
      updated_at: now,
    })
    .select("id")
    .single();

  if (error || !inserted?.id) {
    throw new Error(error?.message || "User insert failed");
  }

  return { userId: inserted.id as string, temporaryPin };
}

export async function issueOpsTemporaryPin(
  client: SupabaseClient,
  userId: string,
): Promise<string> {
  const temporaryPin = generateSixDigitPin();
  const pin_hash = await hashOpsPin(temporaryPin);
  const now = new Date().toISOString();

  const { error } = await client
    .from("users")
    .update({
      pin_hash,
      must_change_pin: true,
      pin_issued_at: now,
      updated_at: now,
    })
    .eq("id", userId);

  if (error) {
    throw new Error(error.message);
  }

  return temporaryPin;
}