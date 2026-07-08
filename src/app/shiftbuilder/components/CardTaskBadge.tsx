"use client";

import * as React from "react";
import { ClipboardList } from "lucide-react";
import { useBoardTasksStore, useTmTaskCount, useSlotTaskCount } from "../hooks/useBoardTaskSummary";

/**
 * Small counter badge shown on a deployment card when EITHER its occupant TM or
 * its slot has open Ops Tasks due by the viewed night. Teal (tasks accent)
 * normally, red when any are overdue. Informational only — never affects
 * placement (T1). Builder-only; never rendered in print (guarded at the call site).
 *
 * slotKey is the DB slot composite (e.g. "zone_1", "admin", "rr_6|mens").
 */
export function CardTaskBadge({
  tmId,
  slotKey,
}: {
  tmId: string | null | undefined;
  slotKey?: string | null;
}) {
  const hidden = useBoardTasksStore((s) => s.hidden);
  const tmCount = useTmTaskCount(tmId);
  const slotCount = useSlotTaskCount(slotKey);

  // Combine so a card lights up if its occupant OR its slot has tasks.
  const open = (tmCount?.open ?? 0) + (slotCount?.open ?? 0);
  const overdueN = (tmCount?.overdue ?? 0) + (slotCount?.overdue ?? 0);
  if (hidden || open <= 0) return null;
  const count = { open, overdue: overdueN };
  const overdue = overdueN > 0;

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
