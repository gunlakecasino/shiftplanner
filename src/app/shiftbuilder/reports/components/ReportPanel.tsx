"use client";

import { cn } from "@/lib/utils";

type ReportPanelProps = {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
};

export function ReportPanel({
  title,
  subtitle,
  action,
  children,
  className,
  bodyClassName,
}: ReportPanelProps) {
  return (
    <div
      className={cn(
        "sb-reports-panel overflow-hidden rounded-2xl border border-[var(--sb-settings-border-paper)]",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3 border-b border-[var(--sb-settings-border-paper)] px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-[1.4px] text-[var(--ios-label-tertiary)]">
            {title}
          </div>
          {subtitle && (
            <div className="mt-0.5 text-[11px] text-[var(--ios-label-quaternary)]">{subtitle}</div>
          )}
        </div>
        {action}
      </div>
      <div className={cn("p-4 sm:p-5", bodyClassName)}>{children}</div>
    </div>
  );
}