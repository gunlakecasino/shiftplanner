import type { ShiftBuilderPermissions } from "@/lib/auth/opsAuthTypes";
import type { FetchNightCoreOptions } from "../hooks/fetchNightCoreData";
import type { FetchNightSecondaryOptions } from "../hooks/fetchNightSecondaryData";

/**
 * Floor viewer marker (`canEditPublishedOnly`).
 * When true, read and write paths are gated to published nights only
 * (see assertNightEditable.server.ts and useShiftData publishedOnlyPolicy).
 */
export function isPublishedOnlyViewer(
  permissions: Pick<ShiftBuilderPermissions, "canEditPublishedOnly" | "canSeeDraftData"> | null | undefined,
): boolean {
  return Boolean(permissions?.canEditPublishedOnly && !permissions?.canSeeDraftData);
}

export function nightFetchOptionsForPermissions(
  permissions: Pick<ShiftBuilderPermissions, "canEditPublishedOnly" | "canSeeDraftData"> | null | undefined,
): FetchNightCoreOptions & FetchNightSecondaryOptions {
  return { publishedOnlyPolicy: isPublishedOnlyViewer(permissions) };
}