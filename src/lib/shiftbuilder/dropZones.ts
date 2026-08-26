/**
 * DROP ZONES card — night-level rotation, not a TM attribute.
 *
 * All three groups stay empty until Brian sends the zone lists.
 * Do not invent discs. An empty group renders the plate only.
 * An explicit night group wins over the 3-night cycle.
 */

export const DROP_ZONE_GROUPS = {
  1: [] as number[],
  2: [] as number[],
  3: [] as number[],
} as const;

export const DROP_ZONE_GROUP_IDS = [1, 2, 3] as const;

export type DropZoneGroup = (typeof DROP_ZONE_GROUP_IDS)[number];

export const DROP_ZONE_PLATE_SRC = "/drop-zones/dropZoneBox.svg";
export const DROP_ZONE_PLATE_VIEWBOX = { width: 192, height: 74.84 };
export const DROP_ZONE_DISC_VIEWBOX = { width: 46.9, height: 46.9 };

export type DropZonesResolution = {
  /** Group the night asked for (explicit or date cycle). */
  scheduledGroup: DropZoneGroup;
  explicitGroup: DropZoneGroup | null;
  /** Group whose discs actually render after empty-list fallback. */
  displayGroup: DropZoneGroup;
  zones: number[];
  usedFallback: boolean;
};

export function dropZoneDiscSrc(zone: number): string {
  return `/drop-zones/dz${String(zone).padStart(2, "0")}.svg`;
}

export function parseDropZoneGroup(value: unknown): DropZoneGroup | null {
  const n = typeof value === "string" ? Number(value) : value;
  if (n === 1 || n === 2 || n === 3) return n;
  return null;
}

/** Consecutive graves rotate 1 → 2 → 3 from the grave calendar date. */
export function cycleDropZoneGroupFromGraveDate(
  iso: string | null | undefined,
): DropZoneGroup {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return 1;
  const [year, month, day] = iso.split("-").map(Number);
  const days = Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
  return ((((days % 3) + 3) % 3) + 1) as DropZoneGroup;
}

export function resolveDropZones(
  explicit: unknown,
  graveDateIso?: string | null,
): DropZonesResolution {
  const explicitGroup = parseDropZoneGroup(explicit);
  const scheduledGroup = explicitGroup ?? cycleDropZoneGroupFromGraveDate(graveDateIso);
  const listed = DROP_ZONE_GROUPS[scheduledGroup];
  return {
    scheduledGroup,
    explicitGroup,
    displayGroup: scheduledGroup,
    zones: [...listed],
    usedFallback: false,
  };
}
