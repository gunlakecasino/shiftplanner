"use client";

/**
 * SudoWindow — the privileged admin surface.
 *
 * Trigger: typing `sudo` in the Command Palette.
 * Layout: full-height slide-in panel from the right, ~92% of viewport.
 * Aesthetic: dark theme with Cupertino corners + Atkinson font.
 * Tabs: Schedules (MVP) / SQL Runner / Edge Functions / Logs.
 *
 * Security note: there is no actual authentication today. `sudo` is purely
 * a UI marker on top of an already-exposed service-role key (per Brian's
 * "no auth yet" stance during the research preview). When auth lands this
 * window should require an additional confirmation step.
 */

import React from "react";
import { createPortal } from "react-dom";
import { X, Database, FileSpreadsheet, Code2, Terminal as TerminalIcon, ScrollText, Users, Settings2, ListTodo } from "lucide-react";
import { cn } from "@/lib/utils";
import { SchedulesTab } from "./SchedulesTab";
import { TeamTab } from "./TeamTab";
import { EngineConfigTab } from "./EngineConfigTab";
import { TasksTab } from "./TasksTab";

type SudoTab = "schedules" | "team" | "tasks" | "engine" | "sql" | "edge" | "logs";

const TABS: Array<{
  id: SudoTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  status: "ready" | "coming-soon";
}> = [
  { id: "schedules", label: "Schedules", icon: FileSpreadsheet, status: "ready" },
  { id: "team", label: "Team", icon: Users, status: "ready" },
  { id: "tasks", label: "Tasks", icon: ListTodo, status: "ready" },   // above Engine per operator request
  { id: "engine", label: "Engine Config", icon: Settings2, status: "ready" },
  { id: "sql", label: "SQL Runner", icon: Database, status: "coming-soon" },
  { id: "edge", label: "Edge Functions", icon: Code2, status: "coming-soon" },
  { id: "logs", label: "Logs", icon: ScrollText, status: "coming-soon" },
];

export interface SudoWindowProps {
  open: boolean;
  onClose: () => void;
  /** Fired whenever a sudo action mutates per-night data the main view
   *  cares about (schedule Apply / Unapply / Delete). Parent should
   *  bump its load epoch to refresh roster + night_tm_status state. */
  onDataChanged?: () => void;
}

export function SudoWindow({ open, onClose, onDataChanged }: SudoWindowProps) {
  const [activeTab, setActiveTab] = React.useState<SudoTab>("schedules");

  // Close on Escape.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const content = (
    <div className="fixed inset-0 z-[10000] flex justify-end" aria-modal="true" role="dialog">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Sheet (right slide-in) */}
      <div
        className={cn(
          "relative h-full w-[92vw] max-w-[1400px]",
          "bg-zinc-950 text-zinc-100",
          "border-l border-zinc-800",
          "shadow-2xl shadow-black/50",
          "animate-in slide-in-from-right duration-300",
          "flex flex-col overflow-hidden"
        )}
        style={{ fontFamily: "var(--font-atkinson), var(--font-geist-sans)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Subtle flickering-grid backdrop (CSS-only for now; can swap to MagicUI's component later) */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.15) 1px, transparent 1px)",
            backgroundSize: "20px 20px",
          }}
        />

        {/* Top accent strip — visual signal that you're in admin mode */}
        <div className="h-[3px] w-full bg-gradient-to-r from-red-500/80 via-red-400/60 to-red-500/80" />

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <TerminalIcon className="h-4 w-4 text-red-400" />
            <div className="flex items-baseline gap-2">
              <span className="font-mono font-semibold text-[14px] tracking-wider text-zinc-100">
                SUDO
              </span>
              <span className="text-zinc-500 text-[11px]">·</span>
              <span className="font-mono text-[11px] text-zinc-400">
                dev environment · iazgrcainbokkdqunkok
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-zinc-500 font-mono">
              esc to close
            </span>
            <button
              onClick={onClose}
              className="text-zinc-400 hover:text-zinc-100 rounded p-1 transition-colors"
              aria-label="Close sudo window"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body — left tab rail + content */}
        <div className="flex-1 flex min-h-0">
          {/* Tab rail */}
          <nav className="w-[200px] shrink-0 border-r border-zinc-800 bg-zinc-950/50 py-3 px-2 space-y-0.5">
            {TABS.map((t) => {
              const Icon = t.icon;
              const isActive = activeTab === t.id;
              const isComingSoon = t.status === "coming-soon";
              return (
                <button
                  key={t.id}
                  onClick={() => {
                    if (!isComingSoon) setActiveTab(t.id);
                  }}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium tracking-[0.2px] transition-colors",
                    isActive
                      ? "bg-red-500/15 text-red-200 border border-red-500/30"
                      : isComingSoon
                      ? "text-zinc-600 cursor-not-allowed"
                      : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100 border border-transparent"
                  )}
                  style={{ fontFamily: "var(--font-atkinson), var(--font-geist-sans)" }}
                  disabled={isComingSoon}
                >
                  <Icon className={cn("h-4 w-4", isActive ? "text-red-300" : "")} />
                  <span className="flex-1 text-left">{t.label}</span>
                  {isComingSoon && (
                    <span className="text-[9px] text-zinc-600 uppercase tracking-wider">
                      soon
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Content area */}
          <div className="flex-1 min-h-0 overflow-hidden">
            {activeTab === "schedules" && <SchedulesTab onDataChanged={onDataChanged} />}
            {activeTab === "team" && <TeamTab onDataChanged={onDataChanged} />}
            {activeTab === "tasks" && <TasksTab onDataChanged={onDataChanged} />}
            {activeTab === "engine" && <EngineConfigTab onDataChanged={onDataChanged} />}
            {activeTab === "sql" && <ComingSoonPanel feature="SQL Runner" />}
            {activeTab === "edge" && <ComingSoonPanel feature="Edge Functions" />}
            {activeTab === "logs" && <ComingSoonPanel feature="Logs" />}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-zinc-800 bg-zinc-950/60 px-5 py-1.5 text-[10px] text-zinc-500 font-mono flex items-center justify-between">
          <span>SUDO MODE · no auth · all writes are real</span>
          <span>v0.1 · phase 1</span>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}

function ComingSoonPanel({ feature }: { feature: string }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-8">
      <div className="text-zinc-600 text-[11px] font-mono tracking-wider uppercase mb-2">
        Coming soon
      </div>
      <div className="text-zinc-300 text-lg font-semibold mb-1">{feature}</div>
      <div className="text-zinc-500 text-sm max-w-md">
        This tab will land in a follow-up pass. The MVP focus is the Schedules
        tab — wire up your ADP XLSX export so the engine knows who's actually
        working each night.
      </div>
    </div>
  );
}
