"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ClipboardList, X } from "lucide-react";
import { useBoardTasksStore } from "../hooks/useBoardTaskSummary";

/**
 * Floating ops pill — the at-a-glance "tasks tonight" readout for the board.
 * Docks bottom-left; when the Graves roster is open, shifts right so it never
 * sits on top of the roster panel.
 */
export function BoardTaskPill() {
  const total = useBoardTasksStore((s) => s.total);
  const overdue = useBoardTasksStore((s) => s.overdue);
  const hidden = useBoardTasksStore((s) => s.hidden);
  const setHidden = useBoardTasksStore((s) => s.setHidden);
  const [rosterOpen, setRosterOpen] = React.useState(false);

  React.useEffect(() => {
    if (typeof document === "undefined") return;
    const sync = () => setRosterOpen(document.body.classList.contains("sb-roster-open"));
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  if (typeof document === "undefined") return null;
  if (hidden || total <= 0) return null;

  // Clear of roster panel when open (CSS var published by ShiftBuilderClient).
  const left = rosterOpen
    ? "calc(var(--sb-roster-inset, 268px) + 8px)"
    : "20px";

  return createPortal(
    <div
      className="sb-board-task-pill no-print fixed bottom-14 z-[118] flex items-center gap-2 rounded-full py-1.5 pl-3 pr-1.5 shadow-2xl"
      style={{
        left,
        background: "var(--sb-glass)",
        backdropFilter: "var(--sb-glass-blur)",
        WebkitBackdropFilter: "var(--sb-glass-blur)",
        border: "1px solid var(--sb-glass-border)",
        boxShadow: "inset 0 1px 0 var(--sb-glass-highlight), 0 12px 32px -12px rgba(0,0,0,0.45)",
        fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
        transition: "left 280ms cubic-bezier(0.22, 1, 0.36, 1)",
      }}
      role="status"
      aria-live="polite"
    >
      <Link
        href="/shiftbuilder/projects"
        className="flex items-center gap-2 text-[12.5px] font-medium text-foreground"
        title="Open Projects & Tasks"
      >
        <ClipboardList size={14} strokeWidth={2.2} style={{ color: "var(--sb-projects-accent, #30b0c7)" }} />
        <span className="tabular-nums">
          {total} task{total === 1 ? "" : "s"} due
        </span>
        {overdue > 0 && (
          <span className="tabular-nums font-semibold" style={{ color: "var(--ios-red)" }}>
            · {overdue} overdue
          </span>
        )}
      </Link>
      <button
        type="button"
        onClick={() => setHidden(true)}
        aria-label="Hide task overlay"
        title="Hide task overlay"
        className="flex items-center justify-center rounded-full p-1 text-muted-foreground transition-colors hover:text-foreground"
      >
        <X size={12} strokeWidth={2.5} />
      </button>
    </div>,
    document.body,
  );
}
