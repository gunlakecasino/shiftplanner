/**
 * Desk capture MVP — operator "what went wrong" + action/error rings + night snapshot.
 * No session replay. PIN-like digits are redacted before download or submit.
 */

import { SHIFTBUILDER_VERSION } from "@/app/shiftbuilder/version";

export const DESK_CAPTURE_RING_MAX = 40;

export type DeskCaptureRingKind = "action" | "error";

export type DeskCaptureRingEntry = {
  at: string;
  kind: DeskCaptureRingKind;
  message: string;
  slotKey?: string;
  action?: string;
};

export type DeskCaptureNightSeat = {
  slotKey: string;
  tmId?: string | null;
  tmName?: string | null;
  coverageSlots?: string[];
};

export type DeskCaptureSnapshot = {
  capturedAt: string;
  version: string;
  note: string;
  nightId: string | null;
  nightDate: string | null;
  isDraftMode: boolean;
  seats: DeskCaptureNightSeat[];
  auxRoles: Array<{ key: string; role: string; label: string }>;
  actions: DeskCaptureRingEntry[];
  errors: DeskCaptureRingEntry[];
};

const actionRing: DeskCaptureRingEntry[] = [];
const errorRing: DeskCaptureRingEntry[] = [];

function pushRing(ring: DeskCaptureRingEntry[], entry: DeskCaptureRingEntry): void {
  ring.push(entry);
  if (ring.length > DESK_CAPTURE_RING_MAX) ring.splice(0, ring.length - DESK_CAPTURE_RING_MAX);
}

/** Strip PIN-like 6-digit runs and pin= / PIN: payloads. Never persist raw PIN. */
export function redactDeskCaptureText(raw: string): string {
  if (!raw) return raw;
  return raw
    .replace(/\bpin\s*[:=]\s*\S+/gi, "pin=[redacted]")
    .replace(/\b\d{6}\b/g, "[redacted]");
}

/** Drop `/pin/i` keys and redact string leaves before persist or download. */
export function redactDeskCapturePack(value: unknown): unknown {
  if (typeof value === "string") return redactDeskCaptureText(value);
  if (Array.isArray(value)) return value.map((item) => redactDeskCapturePack(item));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (/pin/i.test(key)) continue;
      out[key] = redactDeskCapturePack(child);
    }
    return out;
  }
  return value;
}

export function recordDeskCaptureAction(entry: {
  message: string;
  slotKey?: string;
  action?: string;
}): void {
  pushRing(actionRing, {
    at: new Date().toISOString(),
    kind: "action",
    message: redactDeskCaptureText(entry.message),
    slotKey: entry.slotKey,
    action: entry.action,
  });
}

export function recordDeskCaptureError(message: string, slotKey?: string): void {
  pushRing(errorRing, {
    at: new Date().toISOString(),
    kind: "error",
    message: redactDeskCaptureText(message),
    slotKey,
  });
}

export function peekDeskCaptureRings(): {
  actions: DeskCaptureRingEntry[];
  errors: DeskCaptureRingEntry[];
} {
  return {
    actions: actionRing.map((e) => ({ ...e })),
    errors: errorRing.map((e) => ({ ...e })),
  };
}

export function resetDeskCaptureRingsForTests(): void {
  actionRing.length = 0;
  errorRing.length = 0;
}

export function buildDeskCaptureSnapshot(args: {
  note: string;
  nightId?: string | null;
  nightDate?: string | null;
  isDraftMode?: boolean;
  assignments?: Record<string, { tmId?: string | null; tmName?: string | null; additionalCoverageSlots?: string[] | null; additional_coverage_slots?: string[] | null }>;
  auxDefs?: Array<{ key: string; role?: string; label?: string }>;
}): DeskCaptureSnapshot {
  const seats: DeskCaptureNightSeat[] = [];
  for (const [slotKey, row] of Object.entries(args.assignments ?? {})) {
    const coverage =
      row?.additionalCoverageSlots ?? row?.additional_coverage_slots ?? [];
    seats.push({
      slotKey,
      tmId: row?.tmId ?? null,
      tmName: row?.tmName ?? null,
      coverageSlots: Array.isArray(coverage)
        ? coverage.filter((k): k is string => typeof k === "string")
        : [],
    });
  }

  return {
    capturedAt: new Date().toISOString(),
    version: SHIFTBUILDER_VERSION,
    note: redactDeskCaptureText(args.note.trim()).slice(0, 280),
    nightId: args.nightId ?? null,
    nightDate: args.nightDate ?? null,
    isDraftMode: !!args.isDraftMode,
    seats,
    auxRoles: (args.auxDefs ?? []).map((d) => ({
      key: d.key,
      role: d.role ?? "blank",
      label: d.label ?? "",
    })),
    ...peekDeskCaptureRings(),
  };
}

export function deskCaptureFilename(snapshot: DeskCaptureSnapshot): string {
  const day = snapshot.nightDate || snapshot.capturedAt.slice(0, 10);
  return `sheetbuilder-capture-${day}.json`;
}

export function downloadDeskCaptureJson(snapshot: DeskCaptureSnapshot): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([JSON.stringify(redactDeskCapturePack(snapshot), null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = deskCaptureFilename(snapshot);
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
