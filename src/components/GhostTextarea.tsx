"use client";

/**
 * GhostTextarea
 *
 * A drop-in replacement for <textarea> that renders AI-generated ghost text
 * as a visual overlay. The ghost text appears inline (greyed out) after the
 * cursor and is accepted on Tab or dismissed on Escape.
 *
 * Implementation approach:
 *   - Two overlapping layers: a real <textarea> (transparent bg, z-10) on top
 *     of a <div> (z-0) that renders "typed text + ghost text" with identical
 *     font/padding so ghost text appears exactly where the cursor sits.
 *   - This avoids the contenteditable complexity while keeping native textarea
 *     behaviour (multiline wrap, resize, selection, accessibility).
 *
 * Props (extends standard textarea props):
 *   ghostText    — the current suggestion string (from useShiftCompletion)
 *   onAccept     — called with the full accepted string when Tab is pressed
 *   onDismiss    — called when Escape is pressed to clear ghost text
 */

import * as React from "react";
import { cn } from "@/lib/utils";

interface GhostTextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** The AI suggestion to display after the cursor */
  ghostText?: string;
  /** Called with the new full value when the user accepts the suggestion (Tab) */
  onAccept?: (value: string) => void;
  /** Called when the user dismisses the suggestion (Escape) */
  onDismiss?: () => void;
}

export const GhostTextarea = React.forwardRef<
  HTMLTextAreaElement,
  GhostTextareaProps
>(
  (
    {
      ghostText = "",
      onAccept,
      onDismiss,
      value,
      defaultValue,
      onChange,
      onKeyDown,
      className,
      style,
      ...rest
    },
    ref
  ) => {
    const internalRef = React.useRef<HTMLTextAreaElement>(null);
    const textareaRef = (ref as React.RefObject<HTMLTextAreaElement>) ?? internalRef;

    // We need to track the current value to build the ghost overlay.
    const [internalValue, setInternalValue] = React.useState<string>(
      (value as string) ?? (defaultValue as string) ?? ""
    );

    // Keep internal value in sync when controlled.
    React.useEffect(() => {
      if (value !== undefined) setInternalValue(value as string);
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setInternalValue(e.target.value);
      onChange?.(e);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Tab" && ghostText) {
        e.preventDefault();
        const accepted = internalValue + ghostText;
        setInternalValue(accepted);
        onAccept?.(accepted);

        // Move cursor to end.
        requestAnimationFrame(() => {
          const el = textareaRef.current;
          if (el) {
            el.selectionStart = accepted.length;
            el.selectionEnd = accepted.length;
          }
        });
        return;
      }

      if (e.key === "Escape" && ghostText) {
        e.preventDefault();
        onDismiss?.();
        return;
      }

      onKeyDown?.(e);
    };

    // Shared style for both layers (font, size, padding, lineHeight must match exactly).
    const sharedStyle: React.CSSProperties = {
      fontFamily: "inherit",
      fontSize: "inherit",
      lineHeight: "inherit",
      letterSpacing: "inherit",
      fontWeight: "inherit",
      padding: "inherit",
      ...style,
    };

    return (
      <div className="relative w-full h-full" style={{ isolation: "isolate" }}>
        {/* ── Ghost layer (behind the textarea) ── */}
        <div
          aria-hidden="true"
          className={cn(
            // Same visual styling as the textarea
            "absolute inset-0 whitespace-pre-wrap break-words overflow-hidden pointer-events-none select-none",
            "text-[length:inherit] leading-[inherit]",
            className
          )}
          style={{
            ...sharedStyle,
            // The overlay must not be selectable or interactive.
            zIndex: 0,
            color: "transparent", // Typed text is invisible here — shown in real textarea above.
          }}
        >
          {/* Typed portion — transparent (real textarea renders it) */}
          <span>{internalValue}</span>
          {/* Ghost portion — visible hint color */}
          {ghostText && (
            <span
              style={{
                color: "var(--ghost-text-color, rgba(148,163,184,0.6))",
                pointerEvents: "none",
              }}
            >
              {ghostText}
            </span>
          )}
        </div>

        {/* ── Real textarea (transparent bg so ghost layer shows through) ── */}
        <textarea
          ref={textareaRef}
          value={value !== undefined ? value : internalValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          className={cn(
            "relative w-full h-full bg-transparent resize-none",
            // Make typed text visible; caret visible; ghost shows from layer below.
            "text-inherit caret-inherit",
            className
          )}
          style={{
            ...sharedStyle,
            zIndex: 1,
            position: "relative",
            // Background must be transparent so the ghost layer shows through.
            background: "transparent",
          }}
          {...rest}
        />
      </div>
    );
  }
);

GhostTextarea.displayName = "GhostTextarea";
