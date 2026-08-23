import type { CSSProperties } from "react";
import type { Transition } from "framer-motion";
type PadAnchor = "left" | "right" | "bottom";

/** Matches `--sb-motion-pad` / P0 board language. */
export const PAD_MOTION_MS = 280;
export const PAD_MOTION_EASE = [0.22, 1, 0.36, 1] as const;

export const padTween: Transition = {
  type: "tween",
  duration: PAD_MOTION_MS / 1000,
  ease: PAD_MOTION_EASE,
};

/** Reduced-motion pads snap; no fade/slide leftover. */
export const padInstant: Transition = {
  type: "tween",
  duration: 0,
};

export type PadOrigin = {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
};

export function queryPadHostRect(hostId: string | undefined): DOMRect | null {
  if (!hostId || typeof document === "undefined") return null;
  const safe = typeof CSS !== "undefined" && typeof CSS.escape === "function"
    ? CSS.escape(hostId)
    : hostId.replace(/["\\]/g, "\\$&");
  const host = document.querySelector(
    `[data-placement-host="${safe}"], [data-task-host="${safe}"], [data-slot-key="${safe}"]`,
  ) as HTMLElement | null;
  return host?.getBoundingClientRect() ?? null;
}

function destBox(style: CSSProperties | null, fallbackW: number, fallbackH: number) {
  const left = typeof style?.left === "number" ? style.left : 0;
  const top = typeof style?.top === "number" ? style.top : 0;
  const width = typeof style?.width === "number" ? style.width : fallbackW;
  const maxH = typeof style?.maxHeight === "number" ? style.maxHeight : fallbackH;
  return { left, top, width, height: maxH };
}

/** Shared-element origin: pad grows out of the interaction card. Card/rails stay put. */
export function padOriginFromHost(
  hostRect: DOMRect | null,
  destStyle: CSSProperties | null,
  fallbackW: number,
  fallbackH: number,
): PadOrigin | null {
  if (!hostRect) return null;
  const dest = destBox(destStyle, fallbackW, fallbackH);
  if (!dest.width || !dest.height) return null;
  return {
    x: hostRect.left + hostRect.width / 2 - (dest.left + dest.width / 2),
    y: hostRect.top + hostRect.height / 2 - (dest.top + Math.min(dest.height, hostRect.height * 1.4) / 2),
    scaleX: Math.max(0.22, Math.min(1, hostRect.width / dest.width)),
    scaleY: Math.max(0.18, Math.min(1, hostRect.height / dest.height)),
  };
}

export function padFlyoutPresence(
  reduced: boolean | null,
  origin: PadOrigin | null,
  _anchor: PadAnchor = "right",
) {
  if (reduced) {
    return {
      initial: { opacity: 1, x: 0, y: 0, scaleX: 1, scaleY: 1 },
      animate: { opacity: 1, x: 0, y: 0, scaleX: 1, scaleY: 1 },
      exit: { opacity: 1, x: 0, y: 0, scaleX: 1, scaleY: 1 },
      transition: padInstant,
    };
  }
  if (origin) {
    return {
      initial: { opacity: 0.88, x: origin.x, y: origin.y, scaleX: origin.scaleX, scaleY: origin.scaleY },
      animate: { opacity: 1, x: 0, y: 0, scaleX: 1, scaleY: 1 },
      exit: { opacity: 0.88, x: origin.x, y: origin.y, scaleX: origin.scaleX, scaleY: origin.scaleY },
      transition: padTween,
    };
  }
  // Last-resort: grow from the slot, never a modal slide-over.
  return {
    initial: { opacity: 0.88, x: 0, y: 0, scaleX: 0.28, scaleY: 0.22 },
    animate: { opacity: 1, x: 0, y: 0, scaleX: 1, scaleY: 1 },
    exit: { opacity: 0.88, x: 0, y: 0, scaleX: 0.28, scaleY: 0.22 },
    transition: padTween,
  };
}

export function padDockPresence(reduced: boolean | null) {
  if (reduced) {
    return {
      initial: { opacity: 1 },
      animate: { opacity: 1 },
      exit: { opacity: 1 },
      transition: padInstant,
    };
  }
  return {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: padTween,
  };
}
