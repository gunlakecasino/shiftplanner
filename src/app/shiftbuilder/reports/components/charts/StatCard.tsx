"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type StatCardProps = {
  label: string;
  value: string | number;
  sub?: string;
  icon?: LucideIcon;
  accent?: string;
  trend?: "up" | "down" | "neutral";
  className?: string;
};

export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  accent = "#4D1A8A",
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        "sb-reports-stat-card group relative overflow-hidden rounded-2xl border p-4",
        className,
      )}
      style={{
        borderColor: `color-mix(in srgb, ${accent} 18%, var(--sb-settings-border-paper, rgba(0,0,0,0.07)))`,
        background: `linear-gradient(145deg, color-mix(in srgb, ${accent} 6%, var(--ios-background-secondary)) 0%, var(--ios-background-secondary) 55%)`,
      }}
    >
      <div
        className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-[0.12]"
        style={{ background: accent }}
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[1.2px] text-[var(--ios-label-tertiary)]">
            {label}
          </div>
          <div
            className="mt-1 text-[28px] font-bold leading-none tracking-[-0.8px] tabular-nums"
            style={{ fontFamily: "var(--font-bricolage, system-ui)", color: "var(--ios-label)" }}
          >
            {value}
          </div>
          {sub && (
            <div className="mt-1.5 text-[11px] text-[var(--ios-label-tertiary)]">{sub}</div>
          )}
        </div>
        {Icon && (
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
            style={{
              background: `color-mix(in srgb, ${accent} 14%, transparent)`,
              color: accent,
            }}
          >
            <Icon size={18} strokeWidth={2.2} />
          </div>
        )}
      </div>
    </div>
  );
}