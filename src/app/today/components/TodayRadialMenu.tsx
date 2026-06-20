"use client";

import { createPortal } from "react-dom";
import { Lock, MapPin, Plus, Users } from "lucide-react";
import { cn } from "@/lib/utils";

export type RadialMenuAction = "assign" | "task" | "lock" | "coverage";

type TodayRadialMenuProps = {
  open: boolean;
  x: number;
  y: number;
  accentColor: string;
  slotLabel?: string;
  onSelect: (action: RadialMenuAction) => void;
  onClose: () => void;
};

const ITEMS: { id: RadialMenuAction; label: string; icon: React.ReactNode; angle: number }[] = [
  { id: "assign", label: "Assign", icon: <Users className="h-4 w-4" />, angle: -90 },
  { id: "task", label: "Task", icon: <Plus className="h-4 w-4" />, angle: 0 },
  { id: "lock", label: "Lock", icon: <Lock className="h-4 w-4" />, angle: 90 },
  { id: "coverage", label: "Coverage", icon: <MapPin className="h-4 w-4" />, angle: 180 },
];

const RADIUS = 56;

export function TodayRadialMenu({
  open,
  x,
  y,
  accentColor,
  slotLabel,
  onSelect,
  onClose,
}: TodayRadialMenuProps) {
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <>
      <button
        type="button"
        className="fixed inset-0 z-[80] cursor-default bg-black/10 backdrop-blur-[1px]"
        aria-label="Close menu"
        onClick={onClose}
      />
      <div
        className="fixed z-[81] pointer-events-none"
        style={{ left: x, top: y, transform: "translate(-50%, -50%)" }}
        role="menu"
        aria-label={slotLabel ? `Actions for ${slotLabel}` : "Slot actions"}
      >
        <div
          className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-white/95 shadow-xl backdrop-blur-md"
          style={{ borderColor: accentColor, boxShadow: `0 0 0 4px ${accentColor}22` }}
        />
        {ITEMS.map((item) => {
          const rad = (item.angle * Math.PI) / 180;
          const left = Math.cos(rad) * RADIUS;
          const top = Math.sin(rad) * RADIUS;
          return (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              className={cn(
                "pointer-events-auto absolute flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border bg-white text-[9px] font-bold uppercase tracking-wide shadow-md transition hover:scale-105 active:scale-95",
              )}
              style={{
                left: `calc(50% + ${left}px)`,
                top: `calc(50% + ${top}px)`,
                borderColor: `${accentColor}55`,
                color: accentColor,
              }}
              onClick={() => {
                onSelect(item.id);
                onClose();
              }}
            >
              {item.icon}
              <span className="mt-0.5">{item.label}</span>
            </button>
          );
        })}
      </div>
    </>,
    document.body,
  );
}