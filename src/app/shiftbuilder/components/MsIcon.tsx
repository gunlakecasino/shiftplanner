"use client";

import type { CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Archive,
  BarChart3,
  Brain,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleX,
  Layers,
  Lock,
  Play,
  Printer,
  RefreshCw,
  Save,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  TriangleAlert,
  Undo2,
  UserPlus,
  Users,
  X,
  Zap,
} from "lucide-react";

const MS_TO_LUCIDE: Record<string, LucideIcon> = {
  archive: Archive,
  auto_awesome: Sparkles,
  bar_chart: BarChart3,
  bolt: Zap,
  cancel: CircleX,
  check: Check,
  check_circle: CircleCheck,
  chevron_right: ChevronRight,
  close: X,
  delete: Trash2,
  error: CircleAlert,
  expand_more: ChevronDown,
  groups: Users,
  layers: Layers,
  lock: Lock,
  person_add: UserPlus,
  play_arrow: Play,
  print: Printer,
  psychology: Brain,
  refresh: RefreshCw,
  save: Save,
  search: Search,
  settings: Settings,
  tune: SlidersHorizontal,
  undo: Undo2,
  warning: TriangleAlert,
};

function resolveSize(size?: number, style?: CSSProperties): number {
  if (typeof size === "number" && Number.isFinite(size)) return size;
  const fontSize = style?.fontSize;
  if (typeof fontSize === "number") return fontSize;
  if (typeof fontSize === "string") {
    const parsed = Number.parseFloat(fontSize);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 16;
}

export function MsIcon({
  name,
  className,
  size,
  style,
  fill = 0,
  "aria-hidden": ariaHidden,
  "aria-label": ariaLabel,
}: {
  name: string;
  className?: string;
  size?: number;
  style?: CSSProperties;
  fill?: 0 | 1;
  "aria-hidden"?: boolean;
  "aria-label"?: string;
}) {
  const Icon = MS_TO_LUCIDE[name.trim()];
  if (!Icon) return null;
  const resolved = resolveSize(size, style);
  return (
    <Icon
      className={["ms", className].filter(Boolean).join(" ")}
      size={resolved}
      strokeWidth={fill ? 2.35 : 2}
      style={style}
      aria-hidden={ariaHidden}
      aria-label={ariaLabel}
    />
  );
}
