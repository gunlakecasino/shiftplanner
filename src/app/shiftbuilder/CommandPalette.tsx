"use client";

import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { Command as CommandPrimitive } from "cmdk";
import { X, Sparkles, Terminal } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CommandItem, CommandGroup } from "@/lib/shiftbuilder/useCommandActions";
import { askGrokForShiftSuggestions, askGrokForStructuredSuggestions } from "./actions";
import {
  parseCommand,
  applyCompletion,
  type CommandState,
  type Suggestion,
  type ParseContext,
  type GravePoolGroup,
} from "@/lib/shiftbuilder/commandParser";
import type { TeamMember } from "@/lib/shiftbuilder/data";
import type { DisplayNameConflict } from "@/lib/shiftbuilder/tmCommands";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actions: CommandItem[];
  placeholder?: string;
  onAddCardBorder?: (slotKey: string, color: string) => void;

  /** New Phase 1: Pre-fill the palette with a specific slot or person for contextual flows */
  initialContext?: {
    type: 'slot' | 'person';
    value: string; // slotKey (e.g. "Z3") or person id/name
  } | null;

  // Migrated from old fan (Phase 1)
  onRemoveFromSlot?: (slotKey: string) => void;
  onToggleLock?: (slotKey: string) => void;
  onCycleBreak?: (slotKey: string) => void;

  /** Direct assignment from contextual palette (tap slot → pick person, or vice versa) */
  onAssign?: (slotKey: string, tmId: string, tmName: string) => void;

  // For better contextual header in seeded slot mode (Phase 1 polish)
  selectedSlotAssignment?: any;

  // Grok Intelligence v2 (structured suggestions + Draft integration)
  isDraftMode?: boolean;
  onApplyGrokSuggestions?: (actions: any[]) => void;
  requestGrokStructuredSuggestions?: (focus: { type: "slot" | "person" | "board"; value?: string }) => Promise<any>;
  onTriggerGrokBoardAnalysis?: () => void;

  // === Natural-language command mode (`make` / `remove`) ===
  /** Full TM roster — used by the parser for name auto-complete. */
  commandRoster?: TeamMember[];
  /** Current operator shift date — used for "today" resolution. */
  commandShiftDate?: Date;
  /** Current week's days (Fri…Thu) — used for `from <day>` parsing. */
  commandWeekDays?: { date: Date; name: string; short: string }[];
  /** Mutations the palette can invoke when a command resolves. */
  onSetGravePool?: (tmId: string, value: "Full" | "AM" | "PM" | null) => Promise<void>;
  onSetDisplayName?: (tmId: string, newName: string) => Promise<void>;
  onRemoveFromSchedule?: (tmId: string, date: Date) => Promise<void>;
  /** Conflict check fired before the display-name confirmation modal. */
  onCheckDisplayNameConflict?: (
    tmId: string,
    newName: string
  ) => Promise<DisplayNameConflict | null>;

  // === Why? mode (Phase 1 weighted engine) ===
  /** Per-slot top-K candidate ranking with score breakdowns. */
  whyBreakdown?: Record<string, {
    topCandidates: Array<{
      tmId: string;
      tmName: string;
      total: number;
      breakdown: Record<string, { raw: number; weighted: number; note?: string }>;
      excluded?: boolean;
      excludeReason?: string;
    }>;
    pickedTmId: string | null;
    preserved: boolean;
  }>;
  /** Per-slot source label + reasoning (engine vs grok). */
  whyReasoning?: Record<string, { source: "engine" | "grok"; reason?: string }>;
  /** Grok's overall draft summary, if Grok ran. */
  whyGrokExplanation?: string;
  /** Warnings from the guard (rejected picks, fallbacks, etc.) */
  whyWarnings?: string[];
  /** True while draft mode is active so Why? makes sense to show. */
  whyAvailable?: boolean;

  // === SUDO trigger ===
  /** Fired when the operator types `sudo` and presses Enter / accepts. */
  onOpenSudo?: () => void;
}

/**
 * Master Command Palette (Cmd+K)
 *
 * Phase 2: Beautiful Cupertino Liquid Glass overlay + cmdk engine.
 * Heavily customized for Golden PDF calm + Apple-grade precision.
 * No reliance on shadcn CommandDialog so we have full visual control.
 */
export function CommandPalette({
  open,
  onOpenChange,
  actions,
  placeholder = "Search roster, actions, days, history…",
  initialContext = null,
  onRemoveFromSlot,
  onToggleLock,
  onCycleBreak,
  selectedSlotAssignment,
  isDraftMode = false,
  onApplyGrokSuggestions,
  requestGrokStructuredSuggestions,
  onTriggerGrokBoardAnalysis,
  onAddCardBorder,
  commandRoster,
  commandShiftDate,
  commandWeekDays,
  onSetGravePool,
  onSetDisplayName,
  onRemoveFromSchedule,
  onCheckDisplayNameConflict,
  whyBreakdown,
  whyReasoning,
  whyGrokExplanation,
  whyWarnings,
  whyAvailable,
  onOpenSudo,
  onAssign,
}: CommandPaletteProps) {
  // === Multi-step contextual state for powerful workflows ===
  const [selectedPerson, setSelectedPerson] = React.useState<any | null>(null);
  const [selectedSlot, setSelectedSlot] = React.useState<string | null>(null);
  const [contextStep, setContextStep] = React.useState<'root' | 'person-to-slot' | 'slot-to-person'>('root');

  // Border mode states
  const [borderStep, setBorderStep] = React.useState<'idle' | 'select-card' | 'select-color'>('idle');
  const [borderTarget, setBorderTarget] = React.useState<string | null>(null);

  // Track if this open was triggered by tapping a card (for better UX/hints)
  const [seededFromCanvas, setSeededFromCanvas] = React.useState(false);

  // Grok integration state (Phase 2 + v2 Intelligence upgrade)
  const [grokLoading, setGrokLoading] = React.useState(false);
  const [grokResponse, setGrokResponse] = React.useState<string | null>(null);

  // Structured Grok v2 support (rich context + actionable actions)
  const [grokStructured, setGrokStructured] = React.useState<any | null>(null);
  const [grokWarnings, setGrokWarnings] = React.useState<string[]>([]);
  const [grokUsedStructured, setGrokUsedStructured] = React.useState(false);

  // === Why? mode toggle ===
  const [whyOpen, setWhyOpen] = React.useState(false);

  // === Natural-language command mode (make / remove) ===
  const [inputValue, setInputValue] = React.useState("");
  const [commandStatus, setCommandStatus] = React.useState<
    "idle" | "executing" | "success" | "error"
  >("idle");
  const [commandError, setCommandError] = React.useState<string | null>(null);
  const [nameConflict, setNameConflict] = React.useState<DisplayNameConflict | null>(null);
  const [conflictChecking, setConflictChecking] = React.useState(false);

  // Build parser context. The palette only does NL parsing when we have a
  // roster + shift date — otherwise it stays in legacy mode (regular cmdk
  // grouped filtering).
  const parseCtx = React.useMemo<ParseContext | null>(() => {
    if (!commandRoster || !commandShiftDate || !commandWeekDays) return null;
    return {
      roster: commandRoster,
      shiftDate: commandShiftDate,
      weekDays: commandWeekDays,
    };
  }, [commandRoster, commandShiftDate, commandWeekDays]);

  // Run the parser on every input change. Falls back to a no-op state when
  // ctx isn't provided.
  const commandState: CommandState | null = React.useMemo(() => {
    if (!parseCtx) return null;
    const trimmed = inputValue.trimStart().toLowerCase();
    // Only parse if the input clearly looks like a command (starts with
    // make / remove or one of their prefixes). Avoids hijacking normal
    // fuzzy search.
    if (!/^(m|r|s|ma|re|su|mak|rem|sud|make|remove|sudo)\b/.test(trimmed)) return null;
    return parseCommand(inputValue, parseCtx);
  }, [inputValue, parseCtx]);

  const isCommandMode = !!commandState && commandState.kind !== null;

  // Reset context when palette closes
  React.useEffect(() => {
    if (!open) {
      setSelectedPerson(null);
      setSelectedSlot(null);
      setContextStep('root');
      setBorderStep('idle');
      setBorderTarget(null);
      setInputValue("");
      setCommandStatus("idle");
      setCommandError(null);
      setNameConflict(null);
      setConflictChecking(false);
      setWhyOpen(false);
    }
  }, [open]);

  // Phase 1: Seed contextual state when opened with initialContext (card tap)
  React.useEffect(() => {
    if (open && initialContext) {
      setSeededFromCanvas(true);
      if (initialContext.type === 'slot') {
        setSelectedSlot(initialContext.value);
        setSelectedPerson(null);
        setContextStep('slot-to-person');
      } else if (initialContext.type === 'person') {
        // Try to find richer TM data from the current actions (roster items)
        const rosterItem = actions.find(
          (a) => a.group === 'Roster' &&
                 (a.metadata?.tm?.id === initialContext.value ||
                  a.metadata?.tm?.name === initialContext.value ||
                  a.metadata?.tm?.fullName === initialContext.value)
        );
        const tm = rosterItem?.metadata?.tm || { id: initialContext.value, name: initialContext.value };
        setSelectedPerson(tm);
        setSelectedSlot(null);
        setContextStep('person-to-slot');
      }
    } else if (!open) {
      setSeededFromCanvas(false);
      setGrokResponse(null);
      setGrokStructured(null);
      setGrokWarnings([]);
      setGrokUsedStructured(false);
    }
  }, [open, initialContext, actions]);

  const handleAskGrok = async () => {
    if (!selectedSlot && !selectedPerson) return;

    setGrokLoading(true);
    setGrokResponse(null);
    setGrokStructured(null);
    setGrokWarnings([]);
    setGrokUsedStructured(false);

    // Prefer the powerful new structured path when the parent provides it
    if (requestGrokStructuredSuggestions) {
      try {
        const focus = selectedSlot
          ? { type: "slot" as const, value: selectedSlot }
          : { type: "person" as const, value: selectedPerson?.name || selectedPerson?.fullName };

        const result = await requestGrokStructuredSuggestions(focus);

        if (result.usedStructured && result.structured) {
          setGrokStructured(result.structured);
          setGrokWarnings(result.warnings || []);
          setGrokUsedStructured(true);
          setGrokResponse(result.text); // keep raw as fallback
        } else {
          setGrokResponse(result.text);
        }
      } catch (err) {
        setGrokResponse("Grok ran into an error. Please try again.");
        console.error(err);
      } finally {
        setGrokLoading(false);
      }
      return;
    }

    // Fallback to legacy text-only path
    try {
      const context = selectedSlot
        ? {
            type: "slot" as const,
            slotKey: selectedSlot,
            currentAssignment: selectedSlotAssignment?.tmName || undefined,
          }
        : {
            type: "person" as const,
            personName: selectedPerson?.name || selectedPerson?.fullName,
            currentAssignment: selectedPerson?.currentAssignment,
          };

      const result = await askGrokForShiftSuggestions(context);
      setGrokResponse(result);
    } catch (err) {
      setGrokResponse("Grok ran into an error. Please try again.");
      console.error(err);
    } finally {
      setGrokLoading(false);
    }
  };

  // New rich structured path (Grok Intelligence v2)
  // The parent (ShiftBuilderClient) is expected to pass onApplyGrokSuggestions
  // and eventually the data to build a full snapshot.
  const handleApplyGrokActions = (actions: any[]) => {
    if (!onApplyGrokSuggestions || actions.length === 0) return;
    onApplyGrokSuggestions(actions);
    // Keep palette open so operator can review / ask again on the updated draft
  };

  // === Command-mode handlers ===

  const applyTopSuggestion = React.useCallback(() => {
    if (!commandState) return false;
    const top = commandState.suggestions[0];
    if (!top) return false;
    const next = applyCompletion(commandState, top);
    setInputValue(next);
    return true;
  }, [commandState]);

  const applySuggestion = React.useCallback(
    (s: Suggestion) => {
      if (!commandState) return;
      const next = applyCompletion(commandState, s);
      setInputValue(next);
    },
    [commandState]
  );

  const executeCommand = React.useCallback(async () => {
    if (!commandState || !commandState.isComplete) return;

    // sudo: open the admin window. No TM/args needed.
    if (commandState.kind === "sudo") {
      if (onOpenSudo) onOpenSudo();
      setInputValue("");
      onOpenChange(false);
      return;
    }

    if (!commandState.tm) return;
    setCommandStatus("executing");
    setCommandError(null);

    try {
      if (commandState.kind === "make") {
        if (commandState.action === "ineligible") {
          if (!onSetGravePool) throw new Error("setGravePool not wired");
          await onSetGravePool(commandState.tm.id, null);
        } else if (commandState.action === "eligible" && commandState.group) {
          if (!onSetGravePool) throw new Error("setGravePool not wired");
          await onSetGravePool(commandState.tm.id, commandState.group as GravePoolGroup);
        } else if (commandState.action === "display name" && commandState.newName) {
          // Conflict check first
          if (onCheckDisplayNameConflict) {
            setConflictChecking(true);
            const conflict = await onCheckDisplayNameConflict(
              commandState.tm.id,
              commandState.newName
            );
            setConflictChecking(false);
            if (conflict) {
              setNameConflict(conflict);
              setCommandStatus("idle");
              return;
            }
          }
          if (!onSetDisplayName) throw new Error("setDisplayName not wired");
          await onSetDisplayName(commandState.tm.id, commandState.newName);
        } else {
          throw new Error("Incomplete make command");
        }
      } else if (commandState.kind === "remove") {
        if (!onRemoveFromSchedule) throw new Error("removeFromSchedule not wired");
        if (!commandState.when.date) throw new Error("No date resolved");
        await onRemoveFromSchedule(commandState.tm.id, commandState.when.date);
      }

      setCommandStatus("success");
      // Auto-close after a short delay so the operator sees feedback
      setTimeout(() => {
        onOpenChange(false);
      }, 600);
    } catch (err) {
      console.error("[CommandPalette] execute failed:", err);
      setCommandError(err instanceof Error ? err.message : String(err));
      setCommandStatus("error");
    }
  }, [commandState, onSetGravePool, onSetDisplayName, onRemoveFromSchedule, onCheckDisplayNameConflict, onOpenChange]);

  /**
   * Confirm + execute the display-name change after the conflict modal.
   */
  const confirmDisplayNameChange = React.useCallback(async () => {
    if (!commandState?.tm || !commandState.newName) return;
    if (!onSetDisplayName) return;
    setCommandStatus("executing");
    setNameConflict(null);
    try {
      await onSetDisplayName(commandState.tm.id, commandState.newName);
      setCommandStatus("success");
      setTimeout(() => onOpenChange(false), 600);
    } catch (err) {
      setCommandError(err instanceof Error ? err.message : String(err));
      setCommandStatus("error");
    }
  }, [commandState, onSetDisplayName, onOpenChange]);

  // Close on Escape (cmdk also handles this, but we reinforce + back out of context)
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (contextStep !== 'root') {
          // Back out one step instead of closing
          if (contextStep === 'person-to-slot' || contextStep === 'slot-to-person') {
            setSelectedPerson(null);
            setSelectedSlot(null);
            setContextStep('root');
          }
        } else {
          onOpenChange(false);
        }
      }

      // Tab for multi-step navigation (Person <-> Slot context)
      if (e.key === "Tab" && !e.shiftKey) {
        if (selectedPerson && !selectedSlot && contextStep === 'person-to-slot') {
          e.preventDefault();
          // Focus moves conceptually to slot selection (cmdk will handle search)
          // In future we can programmatically focus the input or filter
        }
        if (selectedSlot && !selectedPerson && contextStep === 'slot-to-person') {
          e.preventDefault();
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange, contextStep, selectedPerson, selectedSlot]);

  // Group items for rendering
  const grouped = React.useMemo(() => {
    const groups: Record<CommandGroup, CommandItem[]> = {
      Roster: [],
      Actions: [],
      Navigation: [],
      Filters: [],
      History: [],
      Contextual: [],
    };

    actions.forEach((item) => {
      if (groups[item.group]) {
        groups[item.group].push(item);
      }
    });

    // Only return groups that have items
    return Object.entries(groups).filter(([_, items]) => items.length > 0) as [
      CommandGroup,
      CommandItem[]
    ][];
  }, [actions]);

  if (!open) return null;

  const content = (
    <div
      className="fixed inset-0 z-[9999] flex items-start justify-center pt-[12vh]"
      onClick={() => onOpenChange(false)}
    >
      {/* Backdrop with strong Liquid Glass blur */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-2xl" />

      {/* Main Palette Card — Cupertino Liquid Glass + Golden calm. */}
      <div
        className={cn(
          "relative w-full max-w-[640px] mx-4 rounded-3xl overflow-hidden",
          "border border-white/60 dark:border-white/10",
          "bg-white/90 dark:bg-zinc-950/90",
          "shadow-2xl shadow-black/20",
          "backdrop-blur-3xl",
          "animate-in fade-in zoom-in-95 duration-200",
          // Cupertino Liquid Glass material: subtle inner highlight
          "shadow-[inset_0_1px_0_0_rgba(255,255,255,0.6)] dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)]"
        )}
        style={{ fontFamily: "var(--font-atkinson), var(--font-geist-sans)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Floating category pills — Launchpad-inspired, large touch targets for iPad Pencil.
            These act as both visual section markers and quick filters (Phase 2). */}
        <div className="flex gap-2 px-4 pt-3 pb-1.5 overflow-x-auto no-scrollbar">
          {["Roster", "Actions", "Visual", "Navigation", "History"].map((cat) => (
            <button
              key={cat}
              onClick={() => {
                // For now visual + future filtering. Clicking scrolls/focuses the group.
                const el = document.getElementById(`group-${cat.toLowerCase()}`);
                el?.scrollIntoView({ behavior: "smooth", block: "center" });
              }}
              className="shrink-0 px-3.5 py-1 text-[12px] font-medium tracking-[0.3px] rounded-2xl bg-white/60 dark:bg-zinc-900/60 border border-white/50 dark:border-white/10 hover:bg-white/80 active:bg-white transition-all"
              style={{ fontFamily: "var(--font-atkinson), var(--font-geist-sans)" }}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* === Why? mode toggle — visible only when there's a draft to explain. */}
        {whyAvailable && (
          <div className="px-4 pt-2 pb-1 border-b border-white/60 bg-white/40">
            <button
              onClick={() => setWhyOpen(v => !v)}
              className={cn(
                "flex w-full items-center justify-between rounded-2xl border px-3 py-2 text-sm font-medium tracking-[0.3px] transition-all",
                whyOpen
                  ? "border-purple-400/40 bg-purple-100/40 text-purple-800"
                  : "border-white/40 bg-white/50 text-zinc-700 hover:bg-white/70"
              )}
              style={{ fontFamily: "var(--font-atkinson), var(--font-geist-sans)" }}
            >
              <span className="flex items-center gap-2">
                🔍 Why?
                <span className="text-[10px] text-zinc-500 font-normal">
                  See engine + Grok reasoning per slot
                </span>
              </span>
              <span className="text-[10px] text-zinc-400">{whyOpen ? "▲" : "▼"}</span>
            </button>
          </div>
        )}

        {whyAvailable && whyOpen && (
          <WhyPanel
            breakdown={whyBreakdown ?? {}}
            reasoning={whyReasoning ?? {}}
            grokExplanation={whyGrokExplanation ?? ""}
            warnings={whyWarnings ?? []}
          />
        )}

        {/* === GLOBAL: Prominent "Grok: Analyze Full Board" entry point ===
            Always visible regardless of slot/person selection. This is the
            primary entry point for board-level analysis. */}
        {requestGrokStructuredSuggestions && (
          <div className="px-4 pt-2 pb-2 border-b border-white/60 bg-white/40 dark:bg-zinc-950/40">
            <button
              onClick={async () => {
                if (!requestGrokStructuredSuggestions) return;
                setGrokLoading(true);
                setGrokResponse(null);
                setGrokStructured(null);
                setGrokWarnings([]);
                setGrokUsedStructured(false);

                try {
                  const result = await requestGrokStructuredSuggestions({ type: "board" });
                  if (result.usedStructured && result.structured) {
                    setGrokStructured(result.structured);
                    setGrokWarnings(result.warnings || []);
                    setGrokUsedStructured(true);
                    setGrokResponse(result.text);
                  } else {
                    setGrokResponse(result.text || "Grok analyzed the board.");
                  }
                } catch (e) {
                  setGrokResponse("Grok board analysis failed. Try again.");
                } finally {
                  setGrokLoading(false);
                }
              }}
              disabled={grokLoading}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[#007AFF]/40 bg-[#007AFF]/10 py-2 text-sm font-medium tracking-[0.3px] text-[#007AFF] hover:bg-[#007AFF]/15 active:bg-[#007AFF]/20 disabled:opacity-60 transition-all"
              style={{ fontFamily: "var(--font-atkinson), var(--font-geist-sans)" }}
            >
              <Sparkles className="h-4 w-4" />
              {grokLoading ? "Analyzing entire board with Grok..." : "Grok: Analyze Full Board"}
            </button>
            <div className="text-center text-[10px] text-zinc-500 mt-1 tracking-wide">Respects placement order • Safe Draft preview</div>
          </div>
        )}

        {/* Contextual header for multi-step workflows (Person ↔ Slot) — only shows when context exists */}
        {(selectedPerson || selectedSlot) && (
          <div className="px-4 pt-2.5 pb-1 text-sm border-b border-white/60 bg-white/40 dark:bg-zinc-950/40">
            {selectedPerson && !selectedSlot && (
              <div className="font-medium text-zinc-900 dark:text-zinc-100">
                Assign <span className="font-semibold">{selectedPerson.name || selectedPerson.fullName}</span>
              </div>
            )}
            {selectedSlot && !selectedPerson && (
              <div className="font-medium text-zinc-900 dark:text-zinc-100">
                Assign to <span className="font-semibold">{selectedSlot}</span>
                {selectedSlotAssignment?.tmName && (
                  <span className="text-zinc-500 dark:text-zinc-400 font-normal text-xs ml-2">
                    (currently: {selectedSlotAssignment.tmName})
                  </span>
                )}
              </div>
            )}
            {selectedPerson && selectedSlot && (
              <div className="font-medium text-zinc-900 dark:text-zinc-100">
                Assign <span className="font-semibold">{selectedPerson.name || selectedPerson.fullName}</span> to <span className="font-semibold">{selectedSlot}</span>
              </div>
            )}
            <div className="text-[10px] text-zinc-500 mt-0.5 flex items-center gap-2">
              <span>Tab to switch focus • Enter to confirm</span>
              {seededFromCanvas && (
                <span className="rounded-full bg-zinc-900/5 dark:bg-white/10 px-1.5 py-px text-[9px] tracking-wide">From canvas</span>
              )}
            </div>

            {/* Quick actions migrated from old fan — calm pill style for iPad touch */}
            {selectedSlot && (
              <div className="flex gap-2 px-4 pb-2 pt-1">
                {onRemoveFromSlot && (
                  <button
                    onClick={() => { onRemoveFromSlot(selectedSlot); onOpenChange(false); }}
                    className="text-[11px] px-3 py-1 rounded-full bg-red-500/10 text-red-600 hover:bg-red-500/20 active:scale-[0.985] transition-all border border-red-500/20"
                  >
                    Remove
                  </button>
                )}
                {onToggleLock && (
                  <button
                    onClick={() => { onToggleLock(selectedSlot); /* keep open for more */ }}
                    className="text-[11px] px-3 py-1 rounded-full bg-zinc-900/5 hover:bg-zinc-900/10 active:scale-[0.985] transition-all border border-white/40"
                  >
                    Lock/Unlock
                  </button>
                )}
                {onCycleBreak && (
                  <button
                    onClick={() => onCycleBreak(selectedSlot)}
                    className="text-[11px] px-3 py-1 rounded-full bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 active:scale-[0.985] transition-all border border-amber-500/20"
                  >
                    Cycle Break {selectedSlotAssignment?.breakGroup ? `(now ${selectedSlotAssignment.breakGroup})` : ''}
                  </button>
                )}
              </div>
            )}

            {/* Contextual Grok button — only meaningful with a slot/person selected */}
            <div className="px-4 pb-3 pt-1">
              <button
                onClick={handleAskGrok}
                disabled={grokLoading}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/40 bg-white/50 py-2 text-sm font-medium tracking-[0.3px] hover:bg-white/70 active:bg-white/90 disabled:opacity-60 transition-all"
                style={{ fontFamily: "var(--font-atkinson), var(--font-geist-sans)" }}
              >
                <Sparkles className="h-4 w-4" />
                {grokLoading ? "Asking Grok..." : "Ask Grok for suggestions (this slot/person)"}
              </button>
            </div>
          </div>
        )}

        {/* === Grok results surface — always visible when results exist, regardless of context ===
            Renders the legacy text response (fallback) AND the structured action cards. */}
        {(grokResponse && !grokUsedStructured) ||
        (grokStructured && grokStructured.actions && grokStructured.actions.length > 0) ||
        grokWarnings.length > 0 ? (
          <div className="px-4 py-3 border-b border-white/60 bg-white/30 dark:bg-zinc-950/30">
            {/* Legacy free-text response (only when no structured payload) */}
            {grokResponse && !grokUsedStructured && (
              <div className="rounded-2xl border border-white/30 bg-white/40 p-3 text-[13px] leading-relaxed text-zinc-700 dark:text-zinc-200">
                {grokResponse}
              </div>
            )}

            {/* Structured actionable suggestions (Grok Intelligence v2) */}
            {grokStructured && grokStructured.actions && grokStructured.actions.length > 0 && (
              <div className="space-y-2">
                <div className="text-[11px] font-medium text-zinc-500 tracking-wide px-1">
                  GROK SUGGESTIONS (will enter Draft)
                </div>

                {grokStructured.actions.map((action: any, idx: number) => {
                  const isNote = action.type === 'note';
                  return (
                    <div
                      key={idx}
                      className={cn(
                        "rounded-2xl border p-3 text-[13px] leading-relaxed",
                        isNote
                          ? "border-amber-200 bg-amber-50"
                          : "border-white/40 bg-white/60"
                      )}
                    >
                      <div className={cn(
                        "font-medium",
                        isNote ? "text-amber-800" : "text-zinc-800 dark:text-zinc-100"
                      )}>
                        {action.type === 'assign' && action.slotKey && action.tmId && `Assign to ${action.slotKey}`}
                        {action.type === 'swap' && `Swap ${action.fromSlot} ↔ ${action.toSlot}`}
                        {action.type === 'remove' && action.slotKey && `Remove from ${action.slotKey}`}
                        {isNote && '💡 Note'}
                      </div>
                      <div className={cn(
                        "mt-1 text-[12.5px]",
                        isNote ? "text-amber-800/90" : "text-zinc-600 dark:text-zinc-300"
                      )}>
                        {action.reason}
                      </div>
                      {!isNote && (
                        <button
                          onClick={() => handleApplyGrokActions([action])}
                          className="mt-2 w-full rounded-xl bg-[#007AFF] py-1.5 text-[12px] font-medium text-white active:scale-[0.985] transition-all"
                        >
                          Add to Draft
                        </button>
                      )}
                    </div>
                  );
                })}

                {grokStructured.actions.length > 1 && (
                  <button
                    onClick={() => handleApplyGrokActions(grokStructured.actions)}
                    className="mt-1 w-full rounded-2xl border border-[#007AFF]/60 bg-[#007AFF]/10 py-2 text-[13px] font-medium text-[#007AFF] active:bg-[#007AFF]/20 transition-all"
                  >
                    Add All to Draft
                  </button>
                )}
              </div>
            )}

            {/* Guard warnings from server (important for trust) */}
            {grokWarnings.length > 0 && (
              <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
                Some suggestions were filtered by safety rules: {grokWarnings.join(" • ")}
              </div>
            )}
          </div>
        ) : null}
        {/* Command-mode chip bar — shows parsed command state when typing `make` or `remove`. */}
        {isCommandMode && commandState && (
          <CommandChipBar state={commandState} />
        )}

        {/* Display-name conflict modal */}
        {nameConflict && commandState?.tm && (
          <div className="mx-4 my-2 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-[12.5px] text-amber-900">
            <div className="font-semibold mb-1">Name already taken</div>
            <div>
              <span className="font-medium">{nameConflict.conflictDisplayName}</span> is
              already the display name for another active TM. Pick a different name
              for <span className="font-medium">{commandState.tm.name}</span> or rename
              the conflicting TM first.
            </div>
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => {
                  setNameConflict(null);
                  // Drop the input back to the partial newName so they can keep typing
                  setInputValue(
                    `make ${commandState.tm?.name} display name "`
                  );
                }}
                className="px-2.5 py-1 rounded-full bg-white border border-amber-300 text-amber-900 text-[11px] font-medium hover:bg-amber-100"
              >
                Pick a different name
              </button>
              <button
                onClick={() => {
                  setNameConflict(null);
                  setInputValue("");
                  setCommandStatus("idle");
                }}
                className="px-2.5 py-1 rounded-full bg-amber-200/60 text-amber-900 text-[11px] font-medium hover:bg-amber-200"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Display-name confirmation card (no conflict) */}
        {isCommandMode &&
          commandState?.kind === "make" &&
          commandState.action === "display name" &&
          commandState.isComplete &&
          !nameConflict &&
          commandStatus === "idle" && (
          <div className="mx-4 my-2 rounded-2xl border border-[#007AFF]/30 bg-[#007AFF]/5 p-3 text-[12.5px] text-zinc-800">
            <div className="font-semibold mb-1 flex items-center gap-1.5">
              <Terminal className="h-3.5 w-3.5 text-[#007AFF]" />
              Confirm display name change
            </div>
            <div>
              Change <span className="font-semibold">{commandState.tm?.name}</span> →{" "}
              <span className="font-semibold">"{commandState.newName}"</span> across
              all displays?
            </div>
            <div className="flex gap-2 mt-2">
              <button
                onClick={executeCommand}
                disabled={conflictChecking}
                className="px-2.5 py-1 rounded-full bg-[#007AFF] text-white text-[11px] font-medium hover:bg-[#0066d6] disabled:opacity-60"
              >
                {conflictChecking ? "Checking…" : "Confirm"}
              </button>
              <button
                onClick={() => setInputValue("")}
                className="px-2.5 py-1 rounded-full bg-white border border-zinc-300 text-zinc-700 text-[11px] font-medium hover:bg-zinc-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Command status feedback */}
        {commandStatus === "success" && (
          <div className="mx-4 my-2 rounded-2xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-800">
            ✓ Command executed
          </div>
        )}
        {commandStatus === "error" && (
          <div className="mx-4 my-2 rounded-2xl border border-red-300 bg-red-50 px-3 py-2 text-[12px] text-red-800">
            ✗ {commandError ?? "Something went wrong"}
          </div>
        )}

        {/* Header / Search */}
        <div className="flex items-center px-4 py-3 bg-white/60 dark:bg-zinc-950/60">
          <CommandPrimitive
            className="w-full"
            shouldFilter={!isCommandMode}
            onKeyDown={(e) => {
              if (isCommandMode && commandState) {
                if (e.key === "Tab" && !e.shiftKey) {
                  e.preventDefault();
                  applyTopSuggestion();
                  return;
                }
                if (e.key === "Enter") {
                  if (commandState.isComplete) {
                    // For display name, let the inline confirm card handle it.
                    if (
                      commandState.kind === "make" &&
                      commandState.action === "display name"
                    ) {
                      // do nothing — operator clicks Confirm
                      return;
                    }
                    e.preventDefault();
                    void executeCommand();
                  } else {
                    // If there's a top suggestion, accept it
                    if (commandState.suggestions[0]) {
                      e.preventDefault();
                      applyTopSuggestion();
                    }
                  }
                  return;
                }
              }
            }}
          >
            {/* Cupertino-inspired Search Field treatment */}
            <div className={cn(
              "flex items-center gap-2 px-3 py-1 rounded-2xl border",
              isCommandMode
                ? "bg-[#007AFF]/5 border-[#007AFF]/30"
                : "bg-white/50 dark:bg-zinc-950/50 border-white/60 dark:border-white/10"
            )}>
              <div className="text-zinc-400">
                {isCommandMode ? (
                  <Terminal className="h-4 w-4 text-[#007AFF]" />
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" />
                    <path d="M21 21l-4.35-4.35" />
                  </svg>
                )}
              </div>
              <CommandPrimitive.Input
                autoFocus
                value={inputValue}
                onValueChange={setInputValue}
                aria-label="Search commands, roster, actions, and days"
                placeholder={
                  isCommandMode
                    ? "Type a command — Tab to complete, Enter to run"
                    : contextStep === "person-to-slot"
                    ? "Type slot (e.g. Z10, MRR2)..."
                    : placeholder
                }
                className={cn(
                  "flex-1 bg-transparent text-[15px] placeholder:text-zinc-400/70",
                  "outline-none border-none focus:ring-0",
                  "font-medium tracking-[-0.2px]",
                  isCommandMode && "font-mono text-[14px]"
                )}
                style={{
                  fontFamily: isCommandMode
                    ? "var(--font-geist-mono), monospace"
                    : "var(--font-atkinson), system-ui",
                }}
              />
              <button
                onClick={() => onOpenChange(false)}
                className="text-zinc-400 hover:text-zinc-600 transition-colors p-1"
                aria-label="Close command palette"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <CommandPrimitive.List className="max-h-[420px] overflow-y-auto px-1 py-2 no-scrollbar">
              <CommandPrimitive.Empty className="py-8 text-center text-sm text-zinc-500">
                No results found.
              </CommandPrimitive.Empty>

              {/* Natural-language command-mode suggestions (takes precedence) */}
              {isCommandMode && commandState && (
                <CommandSuggestionList
                  state={commandState}
                  onPick={applySuggestion}
                />
              )}

              {/* Border mode: custom steps (takes precedence) */}
              {!isCommandMode && borderStep === 'select-card' && (
                <>
                  <div className="px-3 py-1 text-[10px] font-medium tracking-[0.75px] text-zinc-500/75">Select card to border</div>
                  {[
                    // Zones (Z1–Z10) + Z9 Smoking Room
                    'Z1','Z2','Z3','Z4','Z5','Z6','Z7','Z8','Z9','Z10','Z9SR',
                    // Restrooms — actual numbering is 1, 6, 7, 8, 10 (not 1–5)
                    'MRR1','MRR6','MRR7','MRR8','MRR10',
                    'WRR1','WRR6','WRR7','WRR8','WRR10',
                    // Auxiliary
                    'ADM','TR1','TR2','SP1','SP2','SP3',
                  ].map((slot) => (
                    <CommandPrimitive.Item
                      key={slot}
                      value={slot}
                      onSelect={() => {
                        setBorderTarget(slot);
                        setBorderStep('select-color');
                      }}
                      className="group flex items-center gap-3 px-3 py-2 mx-1 rounded-2xl cursor-pointer text-sm text-zinc-900 dark:text-zinc-100 data-[selected=true]:bg-zinc-900/5 dark:data-[selected=true]:bg-white/10 transition-colors"
                    >
                      <div className="font-medium">{slot}</div>
                    </CommandPrimitive.Item>
                  ))}
                </>
              )}

              {!isCommandMode && borderStep === 'select-color' && borderTarget && (
                <>
                  <div className="px-3 py-1 text-[10px] font-medium tracking-[0.75px] text-zinc-500/75">Choose border color for {borderTarget}</div>
                  {[
                    { name: 'Red', value: '#EF4444' },
                    { name: 'Blue', value: '#3B82F6' },
                    { name: 'Green', value: '#22C55E' },
                    { name: 'Orange', value: '#F97316' },
                    { name: 'Purple', value: '#8B5CF6' },
                    { name: 'Teal', value: '#14B8A6' },
                    { name: 'Yellow', value: '#EAB308' },
                  ].map((color) => (
                    <CommandPrimitive.Item
                      key={color.name}
                      value={color.name}
                      onSelect={() => {
                        if (onAddCardBorder) {
                          onAddCardBorder(borderTarget, color.value);
                        }
                        setBorderStep('idle');
                        setBorderTarget(null);
                        onOpenChange(false);
                      }}
                      className="group flex items-center gap-3 px-3 py-2 mx-1 rounded-2xl cursor-pointer text-sm text-zinc-900 dark:text-zinc-100 data-[selected=true]:bg-zinc-900/5 dark:data-[selected=true]:bg-white/10 transition-colors"
                    >
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color.value }} />
                      <div className="font-medium">{color.name}</div>
                    </CommandPrimitive.Item>
                  ))}
                </>
              )}

              {/* Normal grouped content (only when not in border or command mode) */}
              {!isCommandMode && borderStep === 'idle' && grouped.map(([groupName, items]) => (
                <CommandPrimitive.Group
                  key={groupName}
                  id={`group-${groupName.toLowerCase()}`}
                  heading={groupName}
                  className="px-3 pt-2.5 pb-1 text-[10px] font-medium tracking-[0.75px] text-zinc-500/75"
                  style={{ fontFamily: "var(--font-atkinson), var(--font-geist-mono)" }}
                >
                  {items.map((item) => (
                    <CommandPrimitive.Item
                      key={item.id}
                      value={`${item.label} ${item.keywords.join(" ")}`}
                      onSelect={() => {
                        // Roster selection in contextual flows
                        if (item.group === "Roster" && item.metadata?.tm) {
                          const tm = item.metadata.tm;

                          // If we already have a slot selected (user tapped a card first),
                          // perform the assignment immediately.
                          if (selectedSlot && onAssign) {
                            onAssign(selectedSlot, tm.id, tm.name || tm.fullName || tm.id);
                            onOpenChange(false);
                            return;
                          }

                          // Otherwise fall back to the multi-step "pick person then pick slot" flow
                          setSelectedPerson(tm);
                          setContextStep('person-to-slot');
                          setSelectedSlot(null);
                          // Do not close — stay open for the next step (choose slot)
                          return;
                        }

                        // Add Card Border multi-step flow
                        if (item.id === "visual-add-card-border") {
                          setBorderStep('select-card');
                          setBorderTarget(null);
                          // stay open for card selection
                          return;
                        }

                        item.handler();

                        // Explicit flag instead of fragile string check on group name
                        if (!item.keepOpen) {
                          onOpenChange(false);
                        }
                      }}
                      disabled={item.disabled}
                      className={cn(
                        "group flex items-center gap-3 px-3 py-3 mx-1 rounded-2xl cursor-pointer", // balanced for iPad Pencil + reduced whitespace
                        "text-sm text-zinc-900 dark:text-zinc-100",
                        "data-[selected=true]:bg-zinc-900/5 dark:data-[selected=true]:bg-white/10 data-[selected=true]:border-l-2 data-[selected=true]:border-zinc-400/60 dark:data-[selected=true]:border-white/40",
                        "data-[disabled=true]:opacity-40 data-[disabled=true]:cursor-not-allowed",
                        "transition-all"
                      )}
                    >
                      {/* Rich rendering for Roster items */}
                      {item.group === "Roster" && item.metadata?.tm && (
                        <RosterItemRow item={item} />
                      )}

                      {/* Default rendering for everything else */}
                      {item.group !== "Roster" && (
                        <>
                          {item.icon && <div className="shrink-0">{item.icon}</div>}
                          <div className="flex-1 truncate font-medium tracking-[-0.2px]">
                            {item.label}
                          </div>
                        </>
                      )}
                    </CommandPrimitive.Item>
                  ))}
                </CommandPrimitive.Group>
              ))}
            </CommandPrimitive.List>
          </CommandPrimitive>
        </div>

        {/* Subtle footer hint */}
        <div
          className="px-4 py-2 text-[10px] text-zinc-400 border-t border-white/50 bg-white/40 dark:bg-zinc-950/40 flex items-center justify-between tracking-[0.5px]"
          style={{ fontFamily: "var(--font-atkinson), var(--font-geist-mono)" }}
        >
          <div className="opacity-70">
            {contextStep !== 'root' ? "Tab to switch • " : ""}
            ↑↓ navigate · ↵ select · esc {contextStep !== 'root' ? "back" : "close"}
          </div>
          <div className="opacity-50">Command Palette</div>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}

/* Rich row for team members in the palette.
 *
 * IMPORTANT: TeamMember from src/lib/shiftbuilder/data.ts is camelCase
 * (fullName, id, primarySection). Reading snake_case fields here was the
 * bug that made every roster row render blank — every property resolved to
 * undefined. Match the canonical shape and fall back gracefully.
 */
function RosterItemRow({ item }: { item: CommandItem }) {
  const tm = item.metadata?.tm;
  if (!tm) return <div>{item.label}</div>;

  const current = item.metadata?.currentAssignment;
  const displayName = tm.name || tm.fullName || tm.id || "(unknown)";

  return (
    <div className="flex items-center gap-3 w-full min-w-0 py-2.5">
      {/* Dominant primary name — Cupertino paragraph treatment + Atkinson priority.
          Secondary metadata (section, current slot) is intentionally de-emphasized
          per Phase 2 direction to reduce visual noise on iPad. */}
      <div className="flex-1 min-w-0">
        <div 
          className="font-semibold text-[15px] tracking-[-0.2px] leading-[1.35] truncate text-zinc-900 dark:text-zinc-50"
          style={{ fontFamily: "var(--font-atkinson), var(--font-geist-sans)" }}
        >
          {displayName}
        </div>
        {/* Very subtle secondary line — only shows current assignment when relevant.
            Section info is now carried primarily by badges. This eliminates the
            previously distracting "section · id · on Zx" micro-text. */}
        {current && (
          <div 
            className="text-[11px] text-zinc-500/70 dark:text-zinc-400/70 mt-px tracking-[-0.1px]"
            style={{ fontFamily: "var(--font-atkinson), var(--font-geist-mono)" }}
          >
            on {current}
          </div>
        )}
      </div>

      {/* Refined badges — slightly larger for touch, calmer opacity */}
      <div className="flex gap-1.5 shrink-0">
        {item.metadata?.isGrave && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#007AFF]/10 text-[#007AFF] font-medium tracking-[0.5px] border border-[#007AFF]/15">G</span>
        )}
        {item.metadata?.isPMOverlap && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#AF52DE]/10 text-[#AF52DE] font-medium tracking-[0.5px] border border-[#AF52DE]/15">PM</span>
        )}
        {item.metadata?.isAMOverlap && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#34C759]/10 text-[#34C759] font-medium tracking-[0.5px] border border-[#34C759]/15">AM</span>
        )}
        {item.metadata?.isPorter && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 font-medium tracking-[0.5px] border border-amber-500/15">P</span>
        )}
      </div>
    </div>
  );
}

/**
 * Token chips that visualize the parsed state of a `make` / `remove` command.
 * Each filled slot becomes a chip; the in-flight slot is a dashed placeholder.
 */
function CommandChipBar({ state }: { state: CommandState }) {
  const chips: { label: string; tone: "verb" | "tm" | "action" | "arg" | "pending" | "sudo"; muted?: boolean }[] = [];

  // sudo has no arguments — render a clean "sudo · open admin window" bar.
  if (state.kind === "sudo") {
    chips.push({ label: "sudo", tone: "sudo" });
    return (
      <div className="px-4 pt-3 pb-1 flex flex-wrap items-center gap-2 border-b border-white/60 bg-red-50/40">
        <span className="text-[11px] px-2 py-0.5 rounded-full font-mono tracking-[0.2px] border bg-red-500/10 text-red-700 border-red-500/30">
          sudo
        </span>
        <span className="text-[11px] text-zinc-600">
          open admin window — Esc to cancel, ↵ to enter
        </span>
        <span className="ml-auto text-[10px] text-red-700 font-medium">
          ↵ to enter
        </span>
      </div>
    );
  }

  if (state.kind) chips.push({ label: state.kind, tone: "verb" });
  else chips.push({ label: "verb", tone: "pending", muted: true });

  if (state.tm) chips.push({ label: state.tm.name || state.tm.id, tone: "tm" });
  else if (state.kind) chips.push({ label: state.tmFragment || "TM name", tone: "pending", muted: true });

  if (state.kind === "make") {
    if (state.action) chips.push({ label: state.action, tone: "action" });
    else if (state.tm) chips.push({ label: "eligible | ineligible | display name", tone: "pending", muted: true });

    if (state.action === "eligible") {
      if (state.group) chips.push({ label: state.group, tone: "arg" });
      else chips.push({ label: "Full | AM | PM", tone: "pending", muted: true });
    }
    if (state.action === "display name") {
      chips.push({ label: state.newName ? `"${state.newName}"` : 'new name', tone: state.newName ? "arg" : "pending", muted: !state.newName });
    }
  } else if (state.kind === "remove") {
    if (state.tm) chips.push({ label: "from", tone: "action" });
    if (state.when.label) chips.push({ label: state.when.label, tone: "arg" });
    else if (state.tm) chips.push({ label: "when", tone: "pending", muted: true });
  }

  return (
    <div className="px-4 pt-3 pb-1 flex flex-wrap items-center gap-1.5 border-b border-white/60 bg-white/40">
      {chips.map((c, i) => (
        <span
          key={i}
          className={cn(
            "text-[11px] px-2 py-0.5 rounded-full font-mono tracking-[0.2px] border",
            c.tone === "verb" && "bg-[#007AFF]/10 text-[#007AFF] border-[#007AFF]/25",
            c.tone === "tm" && "bg-emerald-500/10 text-emerald-700 border-emerald-500/25",
            c.tone === "action" && "bg-zinc-900/5 text-zinc-700 border-zinc-300",
            c.tone === "arg" && "bg-purple-500/10 text-purple-700 border-purple-500/25",
            c.tone === "sudo" && "bg-red-500/10 text-red-700 border-red-500/30",
            c.tone === "pending" && "bg-transparent text-zinc-400 border-dashed border-zinc-300"
          )}
        >
          {c.label}
        </span>
      ))}
      {state.isComplete && (
        <span className="ml-auto text-[10px] text-emerald-700 font-medium">
          ↵ to run
        </span>
      )}
      {state.error && !state.isComplete && (
        <span className="ml-auto text-[10px] text-amber-700">{state.error}</span>
      )}
    </div>
  );
}

/**
 * Why? panel — explains the engine's per-slot picks side-by-side with Grok's.
 *
 * Shows for each slot:
 *   - Engine's top 3 candidates (scores + dominant signals)
 *   - Final pick (may be the engine top OR a Grok override)
 *   - When Grok overrode, the operator-facing reason
 *
 * The visual goal is dense but scannable: each slot is one collapsible row.
 */
function WhyPanel({
  breakdown,
  reasoning,
  grokExplanation,
  warnings,
}: {
  breakdown: Record<string, any>;
  reasoning: Record<string, { source: "engine" | "grok"; reason?: string }>;
  grokExplanation: string;
  warnings: string[];
}) {
  const slots = Object.keys(breakdown).filter((s) => !breakdown[s].preserved);
  return (
    <div className="px-4 py-3 max-h-[260px] overflow-y-auto border-b border-white/60 bg-purple-50/30">
      {grokExplanation && (
        <div className="mb-2 rounded-xl border border-purple-200 bg-white/60 px-3 py-2 text-[12px] text-purple-900 font-mono leading-snug">
          <span className="font-semibold">Grok overall: </span>{grokExplanation}
        </div>
      )}
      {warnings.length > 0 && (
        <div className="mb-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] text-amber-800">
          {warnings.join(" • ")}
        </div>
      )}

      {slots.length === 0 && (
        <div className="text-center text-[12px] text-zinc-500 py-4">
          No engine breakdown for this draft. Run the engine again to see scoring.
        </div>
      )}

      <div className="space-y-1.5">
        {slots.map((slotKey) => {
          const r = breakdown[slotKey];
          const reason = reasoning[slotKey];
          const top = r.topCandidates ?? [];
          const pickedTm = top.find((c: any) => c.tmId === r.pickedTmId);
          const isOverride = reason?.source === "grok";
          return (
            <details
              key={slotKey}
              className={cn(
                "rounded-xl border bg-white/70 px-2.5 py-1.5 text-[12px] font-mono",
                isOverride ? "border-purple-300" : "border-white/60"
              )}
            >
              <summary className="cursor-pointer flex items-center justify-between gap-2 list-none">
                <span className="flex items-center gap-2">
                  <span className="font-semibold text-zinc-700 min-w-[44px]">{slotKey}</span>
                  <span className={cn(
                    "font-medium",
                    isOverride ? "text-purple-800" : "text-zinc-800"
                  )}>
                    {pickedTm ? pickedTm.tmName : "—"}
                  </span>
                  {pickedTm && (
                    <span className="text-zinc-400">
                      ({Number(pickedTm.total).toFixed(2)})
                    </span>
                  )}
                </span>
                <span className="text-[10px] tracking-wide text-zinc-500">
                  {isOverride ? "GROK OVERRIDE" : "ENGINE"}
                </span>
              </summary>
              <div className="mt-1.5 pl-12 space-y-1">
                {isOverride && reason?.reason && (
                  <div className="text-[11px] text-purple-900 leading-snug">
                    <span className="text-purple-500">↳ </span>{reason.reason}
                  </div>
                )}
                <div className="text-[10px] uppercase tracking-[0.5px] text-zinc-400 mt-1">
                  Top candidates
                </div>
                {top.slice(0, 5).map((c: any, idx: number) => {
                  const isPicked = c.tmId === r.pickedTmId;
                  const sigs = Object.entries(c.breakdown)
                    .filter(([, s]: any) => Number.isFinite(s.weighted) && s.weighted !== 0)
                    .sort(([, a]: any, [, b]: any) => Math.abs(b.weighted) - Math.abs(a.weighted))
                    .slice(0, 3);
                  return (
                    <div
                      key={c.tmId}
                      className={cn(
                        "flex items-baseline gap-2 text-[11px] leading-snug",
                        isPicked && !isOverride ? "text-zinc-900 font-medium" : "text-zinc-600",
                        c.excluded && "text-zinc-400 italic"
                      )}
                    >
                      <span className="min-w-[16px] text-zinc-400">{idx + 1}.</span>
                      <span className="min-w-[100px] truncate">{c.tmName}</span>
                      <span className="tabular-nums text-zinc-500 min-w-[36px]">
                        {c.excluded ? "—" : Number(c.total).toFixed(2)}
                      </span>
                      {!c.excluded && sigs.length > 0 && (
                        <span className="text-zinc-400 text-[10px] truncate">
                          {sigs.map(([n, s]: any) => `${n} ${s.weighted >= 0 ? "+" : ""}${Number(s.weighted).toFixed(1)}`).join(" · ")}
                        </span>
                      )}
                      {c.excluded && c.excludeReason && (
                        <span className="text-zinc-400 text-[10px] truncate">{c.excludeReason}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Suggestion list for command mode. Each item is a real cmdk item so the
 * keyboard nav (↑↓) works exactly the same as the rest of the palette.
 */
function CommandSuggestionList({
  state,
  onPick,
}: {
  state: CommandState;
  onPick: (s: Suggestion) => void;
}) {
  if (state.suggestions.length === 0) {
    return (
      <div className="px-3 py-6 text-center text-[12px] text-zinc-500">
        {state.isComplete
          ? "Press Enter to run the command."
          : "Keep typing — no suggestions yet."}
      </div>
    );
  }

  const heading =
    state.nextSlot === "verb"
      ? "Verbs"
      : state.nextSlot === "tm"
      ? "Team members"
      : state.nextSlot === "action"
      ? "Actions"
      : state.nextSlot === "group"
      ? "Eligibility groups"
      : state.nextSlot === "newName"
      ? "Display name"
      : state.nextSlot === "from-keyword"
      ? "Keyword"
      : state.nextSlot === "when"
      ? "When"
      : "Suggestions";

  return (
    <CommandPrimitive.Group
      heading={heading}
      className="px-3 pt-2.5 pb-1 text-[10px] font-medium tracking-[0.75px] text-zinc-500/75"
    >
      {state.suggestions.slice(0, 12).map((s, idx) => (
        <CommandPrimitive.Item
          key={`${s.label}-${idx}`}
          value={`__cmd__ ${s.label} ${s.hint ?? ""}`}
          onSelect={() => onPick(s)}
          className="group flex items-center gap-3 px-3 py-2.5 mx-1 rounded-2xl cursor-pointer text-sm text-zinc-900 data-[selected=true]:bg-[#007AFF]/5 data-[selected=true]:border-l-2 data-[selected=true]:border-[#007AFF]/60 transition-colors"
        >
          <div className="flex-1 min-w-0">
            <div className="font-medium tracking-[-0.2px]">{s.label}</div>
            {s.hint && (
              <div className="text-[11px] text-zinc-500 mt-px font-mono">{s.hint}</div>
            )}
          </div>
          {idx === 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-500 font-mono">
              Tab
            </span>
          )}
        </CommandPrimitive.Item>
      ))}
    </CommandPrimitive.Group>
  );
}
