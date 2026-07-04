"use client";

import * as React from "react";
import { ClipboardList } from "lucide-react";
import { useBoardTasksStore, useTmTaskCount } from "../hooks/useBoardTaskSummary";

/**
 * Small counter badge shown on a deployment card when its occupant TM has open
 * Ops Tasks due by the viewed night. Teal (tasks accent) normally, red when any
 * are overdue. Informational only — never affects placement (T1). Builder-only;
 * never rendered in print (guarded by isPrintPreview at the call site).
 */
export function CardTaskBadge({ tmId }: { tmId: string | null | undefined }) {
  const hidden = useBoardTasksStore((s) => s.hidden);
  const count = useTmTaskCount(tmId);

  if (hidden || !count || count.open <= 0) return null;
  const overdue = count.overdue > 0;

  return (
    <span
      className="sb-card-task-badge no-print inline-flex items-center gap-0.5 rounded-full px-1.5 py-[1px] text-[9px] font-semibold leading-none tabular-nums"
      title={`${count.open} open task${count.open === 1 ? "" : "s"} tonight${overdue ? ` · ${count.overdue} overdue` : ""}`}
      style={{
        background: overdue ? "color-mix(in srgb, var(--ios-red) 15%, transparent)" : "var(--sb-projects-accent-tint, rgba(48,176,199,0.14))",
        color: overdue ? "var(--ios-red)" : "var(--sb-projects-accent, #30b0c7)",
        border: `1px solid ${overdue ? "color-mix(in srgb, var(--ios-red) 40%, transparent)" : "var(--sb-projects-accent-border, rgba(48,176,199,0.36))"}`,
      }}
    >
      <ClipboardList size={9} strokeWidth={2.4} />
      {count.open}
    </span>
  );
}
