"use client";

import React from "react";
import { ClipboardList } from "lucide-react";

export function EmptyState({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="sb-projects-card flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <ClipboardList size={28} strokeWidth={1.5} className="text-[var(--ios-label-quaternary)]" />
      <p className="text-[13px] font-medium text-[var(--ios-label-secondary)]">{title}</p>
      <p className="max-w-xs text-[11.5px] text-[var(--ios-label-tertiary)]">{subtitle}</p>
    </div>
  );
}
