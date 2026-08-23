"use client";

import React from "react";
import { createPortal } from "react-dom";
import {
  DESK_SHORTCUT_GROUPS,
  DESK_SHORTCUTS,
} from "@/lib/shiftbuilder/deskShortcuts";

type Props = {
  open: boolean;
  onClose: () => void;
};

/**
 * Calm in-app cheatsheet. Lists only real desk bindings — no Run Engine / R,
 * no ⌘K, no agentic theater.
 */
export function KeyboardCheatsheet({ open, onClose }: Props) {
  const cardRef = React.useRef<HTMLDivElement>(null);
  const closeRef = React.useRef<HTMLButtonElement>(null);
  const previousFocusRef = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    closeRef.current?.focus();
    return () => {
      previousFocusRef.current?.focus();
      previousFocusRef.current = null;
    };
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !cardRef.current) return;
      const focusable = Array.from(
        cardRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="sb-cheatsheet-root"
      role="presentation"
      onMouseDown={onClose}
    >
      <div
        ref={cardRef}
        data-sb-cheatsheet=""
        role="dialog"
        aria-modal="true"
        aria-labelledby="sb-cheatsheet-title"
        className="sb-cheatsheet"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="sb-cheatsheet__head">
          <div>
            <h2 id="sb-cheatsheet-title" className="sb-cheatsheet__title">
              Keyboard
            </h2>
            <p className="sb-cheatsheet__lead">
              Hardware keys for the night. ⌘ is Command or Control.
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="sb-cheatsheet__close sb-interactive"
            onClick={onClose}
          >
            Close
          </button>
        </header>

        <div className="sb-cheatsheet__body">
          {DESK_SHORTCUT_GROUPS.map((group) => {
            const rows = DESK_SHORTCUTS.filter((row) => row.group === group.id);
            if (rows.length === 0) return null;
            return (
              <section key={group.id} className="sb-cheatsheet__group">
                <h3 className="sb-cheatsheet__group-label">{group.label}</h3>
                <ul className="sb-cheatsheet__list">
                  {rows.map((row) => (
                    <li key={row.id} className="sb-cheatsheet__row">
                      <span className="sb-cheatsheet__action">{row.action}</span>
                      <span className="sb-cheatsheet__keys" aria-hidden="true">
                        {row.keys.map((glyph, i) => (
                          <kbd key={`${row.id}-${glyph}-${i}`} className="sb-cheatsheet__key">
                            {glyph}
                          </kbd>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}
