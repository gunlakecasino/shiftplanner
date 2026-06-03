import type { CSSProperties } from "react";

/** Velvet glass shell — matches MarkerPad / command palette (--sb-glass*). */
export function velvetGlassPillStyle(extra?: CSSProperties): CSSProperties {
  return {
    background: "var(--sb-glass)",
    backdropFilter: "var(--sb-glass-blur)",
    WebkitBackdropFilter: "var(--sb-glass-blur)",
    border: "1px solid var(--sb-glass-border)",
    boxShadow:
      "inset 0 1px 0 var(--sb-glass-highlight), 0 8px 28px -10px rgba(0,0,0,0.4)",
    borderRadius: 6,
    color: "var(--sb-text-1, #1c1c1e)",
    ...extra,
  };
}

export const CANVAS_PILL_MONO =
  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";

/** Fixed stack anchor — sits above ops status pill (bottom 10px). */
export const ROTATION_HEALTH_BOTTOM_PX = 44;