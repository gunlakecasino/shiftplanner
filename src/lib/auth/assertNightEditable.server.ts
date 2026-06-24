import { createAdminClientSafe } from "@/app/api/admin/_lib/createAdminClient";
import type { ShiftBuilderPermissions } from "./opsAuthTypes";

type NightRef = {
  nightId?: string | null;
  date?: string | null;
};

async function loadNightStatus(ref: NightRef): Promise<string | null> {
  const client = createAdminClientSafe();
  if (!client) return null;

  const nightId = ref.nightId?.trim();
  if (nightId) {
    const { data } = await client.from("nights").select("status").eq("id", nightId).maybeSingle();
    return (data?.status as string | null) ?? null;
  }

  const date = ref.date?.trim();
  if (date) {
    const { data } = await client
      .from("nights")
      .select("status")
      .eq("night_date", date)
      .maybeSingle();
    return (data?.status as string | null) ?? null;
  }

  return null;
}

/** Viewers may only read or mutate published nights; sudo / planning roles may access drafts. */
export async function assertActorCanReadNight(
  permissions: ShiftBuilderPermissions,
  ref: NightRef,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (
    permissions.canAccessSudo ||
    permissions.canSeeDraftData ||
    !permissions.canEditPublishedOnly
  ) {
    return { ok: true };
  }

  const status = await loadNightStatus(ref);
  if (status !== "published") {
    return {
      ok: false,
      error: "This night is unpublished — your role can only access published days",
    };
  }

  return { ok: true };
}

/** Viewers may only mutate published nights; sudo / planning roles may edit drafts. */
export async function assertActorCanEditNight(
  permissions: ShiftBuilderPermissions,
  ref: NightRef,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (
    permissions.canAccessSudo ||
    permissions.canSeeDraftData ||
    !permissions.canEditPublishedOnly
  ) {
    return { ok: true };
  }

  const status = await loadNightStatus(ref);
  if (status !== "published") {
    return {
      ok: false,
      error: "This night is unpublished — your role can only access published days",
    };
  }

  return { ok: true };
}

export function nightRefFromMutationBody(body: Record<string, unknown>): NightRef {
  return {
    nightId: body.nightId != null ? String(body.nightId) : null,
    date: body.date != null ? String(body.date) : null,
  };
}