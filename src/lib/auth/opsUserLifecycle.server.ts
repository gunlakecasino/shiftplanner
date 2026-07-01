import bcrypt from "bcryptjs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveStoredUserRole } from "./roleStorage";

const BCRYPT_ROUNDS = 12;
const TEMP_PIN_TTL_MS = 72 * 60 * 60 * 1000;

export type OpsPinChangeErrorCode =
  | "incorrect"
  | "expired"
  | "not_authorized"
  | "not_found"
  | "validation"
  | "pin_taken";

export class OpsPinChangeError extends Error {
  readonly code: OpsPinChangeErrorCode;

  constructor(message: string, code: OpsPinChangeErrorCode) {
    super(message);
    this.name = "OpsPinChangeError";
    this.code = code;
  }
}

function normalizeBcryptHash(hash: string): string {
  return hash.replace(/^\$2a\$/, "$2b$");
}

export function isTempPinExpired(
  pinIssuedAt: string | null | undefined,
  mustChangePin: boolean,
): boolean {
  if (!mustChangePin || !pinIssuedAt) return false;
  const issued = new Date(pinIssuedAt).getTime();
  return !Number.isNaN(issued) && issued < Date.now() - TEMP_PIN_TTL_MS;
}

export async function verifyOpsPin(pin: string, storedHash: string): Promise<boolean> {
  return bcrypt.compare(pin, normalizeBcryptHash(storedHash));
}

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

const MAX_PIN_GENERATION_ATTEMPTS = 25;

/**
 * True if `pin` matches any OTHER active user's stored PIN hash. PINs are bcrypt-hashed
 * with per-row salts, so this can't be a DB unique constraint — it requires comparing
 * against every active user's hash. Only used at PIN creation/change time (low frequency),
 * never on the login hot path.
 */
async function isPinTakenByOtherActiveUser(
  client: SupabaseClient,
  pin: string,
  excludeUserId?: string,
): Promise<boolean> {
  const { data, error } = await client
    .from("users")
    .select("id, pin_hash")
    .eq("is_active", true)
    .not("pin_hash", "is", null);

  if (error) throw new Error(error.message);

  for (const row of data ?? []) {
    if (excludeUserId && row.id === excludeUserId) continue;
    if (!row.pin_hash) continue;
    if (await bcrypt.compare(pin, normalizeBcryptHash(row.pin_hash))) return true;
  }
  return false;
}

/** Generate a random 6-digit PIN that no other active user currently holds. */
async function generateUniqueSixDigitPin(client: SupabaseClient): Promise<string> {
  for (let attempt = 0; attempt < MAX_PIN_GENERATION_ATTEMPTS; attempt++) {
    const candidate = generateSixDigitPin();
    if (!(await isPinTakenByOtherActiveUser(client, candidate))) return candidate;
  }
  throw new Error("Could not generate a unique PIN — contact an administrator");
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

  const temporaryPin = await generateUniqueSixDigitPin(client);
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
  const temporaryPin = await generateUniqueSixDigitPin(client);
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

/** First-login / admin-reset PIN change — uses bcryptjs (not Postgres crypt). */
export async function changeOpsUserPin(
  client: SupabaseClient,
  input: {
    userId: string;
    currentPin: string;
    newPin: string;
    requireMustChange?: boolean;
  },
): Promise<void> {
  const { userId, currentPin, newPin, requireMustChange = true } = input;

  const { data: row, error } = await client
    .from("users")
    .select("pin_hash, must_change_pin, pin_issued_at, is_active")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new OpsPinChangeError(error.message, "validation");
  }
  if (!row?.pin_hash || !row.is_active) {
    throw new OpsPinChangeError("user not found or inactive", "not_found");
  }

  if (requireMustChange && !row.must_change_pin) {
    throw new OpsPinChangeError(
      "PIN change not authorized for this account state",
      "not_authorized",
    );
  }

  if (isTempPinExpired(row.pin_issued_at, Boolean(row.must_change_pin))) {
    throw new OpsPinChangeError(
      "Temporary PIN has expired — contact your administrator",
      "expired",
    );
  }

  const currentOk = await verifyOpsPin(currentPin, row.pin_hash);
  if (!currentOk) {
    throw new OpsPinChangeError("Current PIN is incorrect", "incorrect");
  }

  if (await isPinTakenByOtherActiveUser(client, newPin, userId)) {
    throw new OpsPinChangeError(
      "That PIN is already in use — choose a different one",
      "pin_taken",
    );
  }

  const pin_hash = await hashOpsPin(newPin);
  const now = new Date().toISOString();

  const { error: updateErr } = await client
    .from("users")
    .update({
      pin_hash,
      must_change_pin: false,
      last_pin_change_at: now,
      pin_issued_at: null,
      failed_pin_attempts: 0,
      locked_until: null,
      updated_at: now,
    })
    .eq("id", userId);

  if (updateErr) {
    throw new OpsPinChangeError(updateErr.message, "validation");
  }
}