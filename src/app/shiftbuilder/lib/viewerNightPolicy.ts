import type { ShiftBuilderPermissions } from "@/lib/auth/opsAuthTypes";
import type { FetchNightCoreOptions } from "../hooks/fetchNightCoreData";
import type { FetchNightSecondaryOptions } from "../hooks/fetchNightSecondaryData";

/**
 * Floor viewer marker (`canEditPublishedOnly`).
 * When true, read and write paths are gated to published nights only
 * (see assertNightEditable.server.ts and useShiftData publishedOnlyPolicy).
 */
export function isPublishedOnlyViewer(
  permissions: Pick<
    ShiftBuilderPermissions,
    "canEditPublishedOnly" | "canSeeDraftData" | "canAccessSudo"
  > | null | undefined,
): boolean {
  if (permissions?.canAccessSudo || permissions?.canSeeDraftData) return false;
  return Boolean(permissions?.canEditPublishedOnly);
}

export function nightFetchOptionsForPermissions(
  permissions: Pick<
    ShiftBuilderPermissions,
    "canEditPublishedOnly" | "canSeeDraftData" | "canAccessSudo"
  > | null | undefined,
): FetchNightCoreOptions & FetchNightSecondaryOptions {
  return { publishedOnlyPolicy: isPublishedOnlyViewer(permissions) };
}