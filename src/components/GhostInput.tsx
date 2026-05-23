"use client";

/**
 * GhostInput
 *
 * Single-line input with inline AI ghost-text autocomplete.
 * Accepts a suggestion on Tab, dismisses on Escape.
 *
 * Unlike GhostTextarea this component uses a canvas measurement trick
 * to position an absolutely-placed ghost <span> exactly after the
 * current text — so it stays aligned even with variable-width fonts.
 *
 * Props (extends standard input props):
 *   ghostText  — the suggestion fragment (from useShiftCompletion)
 *   onAccept   — called with the full accepted string on Tab
 *   onDismiss  — called on Escape
 */

import * as React from "react";
import { cn } from "@/lib/utils";

interface GhostInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  ghostText?: string;
  onAccept?: (value: string) => void;
  onDismiss?: () => void;
}

export const GhostInput = React.forwardRef<HTMLInputElement, GhostInputProps>(
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
    const internalRef = React.useRef<HTMLInputElement>(null);
    const inputRef = (ref as React.RefObject<HTMLInputElement>) ?? internalRef;
    const measureRef = React.useRef<HTMLSpanElement>(null);

    const [internalValue, setInternalValue] = React.useState<string>(
      (value as string) ?? (defaultValue as string) ?? ""
    );
    const [ghostLeft, setGhostLeft] = React.useState<number>(0);

    // Sync controlled value.
    React.useEffect(() => {
      if (value !== undefined) setInternalValue(value as string);
    }, [value]);

    // Measure text width to place ghost span after the cursor.
    React.useLayoutEffect(() => {
      if (!measureRef.current) return;
      // Force the measure span to match the input's computed style.
      const input = inputRef.current;
      if (input) {
        const cs = window.getComputedStyle(input);
        const span = measureRef.current;
        span.style.fontFamily = cs.fontFamily;
        span.style.fontSize = cs.fontSize;
        span.style.fontWeight = cs.fontWeight;
        span.style.letterSpacing = cs.letterSpacing;
        span.style.paddingLeft = cs.paddingLeft;
      }
      setGhostLeft(measureRef.current.offsetWidth);
    }, [internalValue, inputRef]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setInternalValue(e.target.value);
      onChange?.(e);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Tab" && ghostText) {
        e.preventDefault();
        const accepted = internalValue + ghostText;
        setInternalValue(accepted);
        onAccept?.(accepted);
        return;
      }
      if (e.key === "Escape" && ghostText) {
        e.preventDefault();
        onDismiss?.();
        return;
      }
      onKeyDown?.(e);
    };

    const currentValue = value !== undefined ? (value as string) : internalValue;

    return (
      <div className="relative inline-flex w-full items-center overflow-hidden">
        {/* Hidden measurement span — mirrors input content to measure pixel width */}
        <span
          ref={measureRef}
          aria-hidden="true"
          className="absolute whitespace-pre pointer-events-none invisible"
          style={{ left: 0, top: 0 }}
        >
          {currentValue || " "}
        </span>

        {/* Real input */}
        <input
          ref={inputRef}
          value={currentValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          className={cn("w-full bg-transparent", className)}
          style={{ ...style, position: "relative", zIndex: 1 }}
          {...rest}
        />

        {/* Ghost text overlay */}
        {ghostText && (
          <span
            aria-hidden="true"
            className="pointer-events-none select-none absolute whitespace-pre"
            style={{
              left: ghostLeft,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--ghost-text-color, rgba(148,163,184,0.55))",
              zIndex: 0,
              fontFamily: "inherit",
              fontSize: "inherit",
              fontWeight: "inherit",
              letterSpacing: "inherit",
            }}
          >
            {ghostText}
          </span>
        )}
      </div>
    );
  }
);

GhostInput.displayName = "GhostInput";
