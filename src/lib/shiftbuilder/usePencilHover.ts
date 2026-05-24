import { useState, useRef, useCallback } from "react";
import type React from "react";

// ─── Pencil hover hook ────────────────────────────────────────────────────────
// Detects Apple Pencil Pro 2 hover (pointerType === "pen", buttons === 0)
// so cards show a gold ring before contact — giving operators a clean aim target.
//
// Also fires onLongHover(element) after `longHoverDelay` ms of uninterrupted
// hover — this is the web-accessible substitute for the squeeze gesture.
// (Apple Pencil Pro squeeze is consumed by iPadOS at the system level and
// NEVER reaches a Safari web app — it requires native UIPencilInteraction /
// onPencilSqueeze SwiftUI API. The `button === 2` hack does not work.)
//
// clearLongHoverTimer is exported so the card's onPointerDown can cancel
// the pending palette-open when the user makes contact instead of hovering.
export function usePencilHover(
  onLongHover?: (el: HTMLElement) => void,
  longHoverDelay = 3500,
) {
  const [isPenHovering, setIsPenHovering] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearLongHoverTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const penHoverHandlers = {
    onPointerEnter: (e: React.PointerEvent<HTMLElement>) => {
      if (e.pointerType !== "pen") return;
      setIsPenHovering(true);
      // Only arm long-hover during true hover (Pencil above glass, not touching).
      // When touching, buttons === 1; hover pointer has buttons === 0.
      if (e.buttons === 0 && onLongHover) {
        const el = e.currentTarget; // capture DOM ref before React async-nulls it
        clearLongHoverTimer();
        timerRef.current = setTimeout(() => onLongHover(el), longHoverDelay);
      }
    },
    onPointerLeave: (e: React.PointerEvent) => {
      if (e.pointerType !== "pen") return;
      setIsPenHovering(false);
      clearLongHoverTimer();
    },
    // pointercancel fires on OS interruption (Scribble, multitask, incoming call).
    // Without this the hover ring and timer would freeze in the "active" state.
    onPointerCancel: (e: React.PointerEvent) => {
      if (e.pointerType !== "pen") return;
      setIsPenHovering(false);
      clearLongHoverTimer();
    },
  };

  return { isPenHovering, penHoverHandlers, clearLongHoverTimer };
}
