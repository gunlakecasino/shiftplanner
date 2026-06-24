import {
  ZONE_DEFS,
  RR_DEFS,
  MAX_AUX_SLOTS,
  ZONE_ICONS,
  RR_ICONS,
  AUX_ICONS,
  getZoneColor,
  getRRAccent,
  getAuxAccent,
} from "@/lib/shiftbuilder/constants";
import { slotKeyToLabel } from "@/lib/shiftbuilder/slot-keys";

export const GRAVE_DOW_IDX = [5, 6, 0, 1, 2, 3, 4] as const;
export const GRAVE_DOW_LABELS = ["Fri", "Sat", "Sun", "Mon", "Tue", "Wed", "Thu"] as const;

export function getSlotColor(uiKey: string): string {
  if (/^Z\d+$/.test(uiKey)) return getZoneColor(uiKey);
  const rr = uiKey.match(/^[MW]RR(\d+)$/);
  if (rr) return getRRAccent(parseInt(rr[1]));
  return getAuxAccent(uiKey);
}

export function getSlotIcon(uiKey: string): string {
  if (ZONE_ICONS[uiKey]) return ZONE_ICONS[uiKey];
  const rr = uiKey.match(/^[MW]RR(\d+)$/);
  if (rr) return RR_ICONS[parseInt(rr[1])] ?? "●";
  return AUX_ICONS[uiKey] ?? "✦";
}

export function getSlotShortLabel(uiKey: string): string {
  if (/^Z\d+$/.test(uiKey)) return uiKey;
  const rr = uiKey.match(/^([MW])RR(\d+)$/);
  if (rr) {
    const num = parseInt(rr[2]);
    const base = num === 1 ? "RR 1+2" : `RR ${num}`;
    return `${base} ${rr[1]}`;
  }
  return slotKeyToLabel(uiKey);
}

export function sortedSlotKeys(keys: string[]): string[] {
  const zoneNum = (k: string) => {
    const m = k.match(/^Z(\d+)$/);
    return m ? parseInt(m[1]) : null;
  };
  const rrNum = (k: string) => {
    const m = k.match(/^[MW]RR(\d+)$/);
    return m ? parseInt(m[1]) : null;
  };
  const isMens = (k: string) => k.startsWith("M");

  return [...keys].sort((a, b) => {
    const za = zoneNum(a);
    const zb = zoneNum(b);
    if (za !== null && zb !== null) return za - zb;
    if (za !== null) return -1;
    if (zb !== null) return 1;

    const ra = rrNum(a);
    const rb = rrNum(b);
    if (ra !== null && rb !== null) {
      if (ra !== rb) return ra - rb;
      return isMens(a) ? -1 : 1;
    }
    if (ra !== null) return -1;
    if (rb !== null) return 1;

    return a.localeCompare(b);
  });
}

export const ALL_SLOT_KEYS: string[] = sortedSlotKeys([
  ...ZONE_DEFS.map((z) => z.key),
  ...RR_DEFS.flatMap((r) => [`MRR${r.num}`, `WRR${r.num}`]),
  ...Array.from({ length: MAX_AUX_SLOTS }, (_, i) => `AUX${i + 1}`),
]);

export function formatReportDate(iso: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${parseInt(m)}/${parseInt(d)}/${y.slice(2)}`;
}

export function daysSince(iso: string): number {
  if (!iso) return Infinity;
  return Math.floor((Date.now() - new Date(iso + "T12:00:00").getTime()) / 86_400_000);
}

export function recencyColor(days: number): string {
  if (days <= 7) return "#34C759";
  if (days <= 14) return "#FFD60A";
  if (days <= 30) return "#FF9500";
  return "#FF453A";
}

export const RECENCY_BUCKETS = [
  { label: "≤7d", max: 7, color: "#34C759" },
  { label: "8–14d", max: 14, color: "#FFD60A" },
  { label: "15–30d", max: 30, color: "#FF9500" },
  { label: ">30d", max: Infinity, color: "#FF453A" },
] as const;