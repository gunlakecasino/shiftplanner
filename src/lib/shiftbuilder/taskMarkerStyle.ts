import type React from "react";

export type TaskMarkerType = "highlight" | "underline" | "circle" | "none";

/** Default felt ink when a marker style is chosen without an explicit color. */
export const DEFAULT_TASK_MARKER_COLOR = "#ffcc00";

export function normalizeTaskMarkerType(
  raw: string | null | undefined,
): TaskMarkerType {
  if (raw === "underline" || raw === "circle" || raw === "none" || raw === "highlight") {
    return raw;
  }
  return "highlight";
}

export function taskMarkerInk(color: string | null | undefined): string {
  return color ?? DEFAULT_TASK_MARKER_COLOR;
}

export function shouldRenderTaskMarker(
  markerType: TaskMarkerType,
  color: string | null | undefined,
): boolean {
  if (markerType === "none") return false;
  if (markerType === "underline" || markerType === "circle") return true;
  return Boolean(color);
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const full =
    h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6);
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Resolve the color persisted for felt line/ring when none was picked. */
export function resolveTaskAppearanceColor(
  color: string | null | undefined,
  markerType: TaskMarkerType,
): string | null {
  if (color) return color;
  if (markerType === "underline" || markerType === "circle") {
    return DEFAULT_TASK_MARKER_COLOR;
  }
  return null;
}

/** RGBA helper for highlight wash layers. */
export function taskMarkerWash(ink: string, alpha: number): string {
  return hexToRgba(ink, alpha);
}

/**
 * Base container style for highlight markers — ink wash is rendered via SVG in TaskMarkerLabel.
 */
export function taskMarkerContainerStyle(
  color: string | null | undefined,
  markerType: TaskMarkerType,
  opts?: {
    base?: React.CSSProperties;
    isPrint?: boolean;
  },
): React.CSSProperties {
  const base = opts?.base ?? {};
  const type = normalizeTaskMarkerType(markerType);

  if (type !== "highlight" || !shouldRenderTaskMarker(type, color)) return base;

  return {
    ...base,
    backgroundColor: "transparent",
    borderLeft: "none",
  };
}