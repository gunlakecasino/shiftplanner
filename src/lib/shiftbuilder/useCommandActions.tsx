"use client";

import { useMemo } from "react";
import { type Snapshot, type AuxDef } from "./useShiftHistory";
import type { TeamMember } from "@/lib/shiftbuilder/data";
import { slotKeyToLabel } from "@/lib/shiftbuilder/slot-keys";

// lucide-react icons — already a project dependency, zero extra install needed
import {
  Moon,
  Sun,
  PenLine,
  Eraser,
  Layers,
  ClipboardList,
  PlusCircle,
  MinusCircle,
  Zap,
  CheckCircle,
  Undo2,
  Printer,
  UserMinus,
  ArrowLeftRight,
  Coffee,
  Lock,
  GitMerge,
} from "lucide-react";

// Types for the master command palette (Phase 2 core)
export type CommandGroup =
  | "Roster"
  | "Actions"
  | "Visual"
  | "Navigation"
  | "Filters"
  | "History"
  | "Contextual";

export interface CommandItem {
  id: string;
  label: string;
  keywords: string[];
  group: CommandGroup;
  /** Optional icon or badge JSX */
  icon?: React.ReactNode;
  /** Rich metadata for rendering (GRAVE status, current assignment, etc.) */
  metadata?: Record<string, any>;
  handler: () => void;
  disabled?: boolean;
  /** If true, the palette stays open after executing this item (e.g. filter toggles) */
  keepOpen?: boolean;
}

export interface CommandContext {
  selectedDayIndex: number;
  graveOnly: boolean;
  hasUndo: boolean;
  hasRedo: boolean;
  assignmentsCount: number;
  auxCount: number;
}

interface UseCommandActionsProps {
  // Roster data (GRAVE + full)
  graveRoster: TeamMember[];
  realRoster: TeamMember[];
  assignments: Record<string, any>;
  auxDefs: AuxDef[];

  // Day / filter state
  selectedDayIndex: number;
  DAY_DEFS: Array<{ index: number; name: string; short: string }>;
  graveOnly: boolean;

  // History
  shiftHistory: {
    canUndo: boolean;
    canRedo: boolean;
    undo: () => Snapshot | null;
    redo: () => Snapshot | null;
  };

  // Callbacks from parent (ShiftBuilderClient)
  onSetGraveOnly: (value: boolean) => void;
  onSetSelectedDayIndex: (index: number) => void;
  onAddAuxSlot: () => void;
  onRemoveLastAuxSlot: () => void;
  onRunEngine?: () => void;
  onDiscardDraft?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onPrint?: () => void;
  onPrintWeek?: () => void;

  // Real assignment support
  assign?: (slotKey: string, tmId: string, tmName: string) => void;

  // Draft mode support (for Command Palette labels)
  isDraftMode?: boolean;

  // ADP schedule data — TMs scheduled for tonight (drives prioritization)
  scheduledTmIdsTonight?: Set<string>;
  calledOffIds?: Set<string>;

  // Grok structured suggestions (new A+B intelligence path)
  onApplyGrokSuggestions?: (actions: any[]) => void;
  onTriggerGrokBoardAnalysis?: () => void;

  // === Phase 3: Hot-word action callbacks ===
  // These power the dynamic per-slot actions ("Clear Zone 1: Jessica", "Swap…", etc.)
  // that make the palette a true keyboard/pencil command surface.
  onRemoveFromSlot?: (slotKey: string) => void;
  onToggleLock?: (slotKey: string) => void;
  /** Cycle break group for the TM currently in this slot (1→2→3→1). */
  onCycleBreak?: (slotKey: string) => void;
  /** Open the palette pre-seeded for this slot (for "Swap Zone X" flow). */
  onOpenPaletteForSlot?: (slotKey: string) => void;
  /** Wipe all card border colors at once ("Reset All Card Borders"). */
  onClearAllBorders?: () => void;
}

/**
 * Master command registry for the Cmd+K palette.
 * Returns a stable, searchable list of CommandItem objects.
 *
 * Phase 2 scope: Basic roster search + key actions + navigation + filters + history.
 * Richer contextual + task items will be added in later phases.
 */
export function useCommandActions({
  graveRoster,
  realRoster,
  assignments,
  auxDefs,
  selectedDayIndex,
  DAY_DEFS,
  graveOnly,
  shiftHistory,
  onSetGraveOnly,
  onSetSelectedDayIndex,
  onAddAuxSlot,
  onRemoveLastAuxSlot,
  onRunEngine,
  onDiscardDraft,
  onUndo,
  onRedo,
  onPrint,
  onPrintWeek,
  assign,
  isDraftMode = false,
  scheduledTmIdsTonight = new Set(),
  calledOffIds = new Set(),
  onApplyGrokSuggestions,
  onTriggerGrokBoardAnalysis,
  onRemoveFromSlot,
  onToggleLock,
  onCycleBreak,
  onOpenPaletteForSlot,
  onClearAllBorders,
}: UseCommandActionsProps): CommandItem[] {
  // Defensive local alias — prevents Fast Refresh / closure issues when the hook
  // is used across many re-renders during heavy development (matches the errors seen in logs).
  const draftMode = !!isDraftMode;
  // Include tm_id values in the fingerprint so the "on Z1" hint refreshes
  // when a TM moves between slots. Just listing slot keys would miss moves
  // where the key set is unchanged.
  const assignmentsFingerprint = useMemo(
    () =>
      Object.entries(assignments)
        .map(([k, v]) => `${k}:${(v as any)?.tmId ?? ""}`)
        .join(","),
    [assignments]
  );

  const context: CommandContext = useMemo(
    () => ({
      selectedDayIndex,
      graveOnly,
      hasUndo: shiftHistory.canUndo,
      hasRedo: shiftHistory.canRedo,
      assignmentsCount: Object.keys(assignments).length,
      auxCount: auxDefs.length,
    }),
    [selectedDayIndex, graveOnly, shiftHistory.canUndo, shiftHistory.canRedo, assignmentsFingerprint, auxDefs]
  );

  const items = useMemo<CommandItem[]>(() => {
    const result: CommandItem[] = [];

    // ========== ROSTER (GRAVE + full roster with rich metadata) ==========
    const rosterToShow = graveOnly ? graveRoster : realRoster;
    const hasScheduleData = scheduledTmIdsTonight.size > 0;

    // Build roster items: scheduled-unplaced TMs float to the top of the group
    // so the operator sees "who still needs a slot" at a glance.
    const makeRosterItem = (tm: typeof rosterToShow[number]): CommandItem => {
      const currentAssignment = Object.entries(assignments).find(
        ([, a]) => (a as any)?.tmId === tm.id
      )?.[0];

      const isScheduledUnplaced =
        hasScheduleData &&
        scheduledTmIdsTonight.has(tm.id) &&
        !currentAssignment &&
        !calledOffIds.has(tm.id);

      // Keywords include BOTH display name and full name so operators can
      // search either ("Cookie" or "Cookie Cookies"). Display surface still
      // uses the display name consistently.
      const keywords = [
        tm.name,
        tm.fullName,
        tm.id,
        tm.primarySection || "",
        tm.gravePool ? "grave" : "",
        (tm as any).isPMOverlap ? "pm overlap" : "",
        (tm as any).isAMOverlap ? "am overlap" : "",
        currentAssignment ? currentAssignment : "unassigned",
        isScheduledUnplaced ? "scheduled tonight unplaced" : "",
      ].filter(Boolean) as string[];

      return {
        id: `roster-${tm.id}`,
        label: tm.name || tm.fullName || tm.id,
        keywords,
        group: "Roster",
        metadata: {
          tm,
          currentAssignment,
          isGrave: !!tm.gravePool,
          isPMOverlap: !!(tm as any).isPMOverlap,
          isAMOverlap: !!(tm as any).isAMOverlap,
          isPorter: tm.primarySection === "Porter",
          isScheduledUnplaced,
        },
        handler: () => {
          // Legacy quickActionFor path removed in palette upgrade Phase 1.
          // All card-driven assignment now goes through the contextual palette flow.
          console.log("[Command] Roster item selected (will be handled via contextual palette):", tm.name || tm.fullName);
        },
      };
    };

    // Multi-pass push when schedule data exists — scheduled-unplaced float to the top,
    // sorted by eligibility tier: G (full grave) → PM overlap → AM overlap.
    // Everyone else follows in the original alphabetical order.
    if (hasScheduleData) {
      const isUnplaced = (tm: typeof rosterToShow[number]) => {
        const deployed = Object.values(assignments).some((a: any) => a?.tmId === tm.id);
        return scheduledTmIdsTonight.has(tm.id) && !deployed && !calledOffIds.has(tm.id);
      };
      const isPorterTm = (tm: typeof rosterToShow[number]) =>
        (tm.primarySection || "").toLowerCase().includes("porter");

      // Pass 1a: scheduled + unplaced + full grave (not PM, not AM, not porter)
      rosterToShow
        .filter((tm) => isUnplaced(tm) && !isPorterTm(tm) && !(tm as any).isPMOverlap && !(tm as any).isAMOverlap)
        .forEach((tm) => result.push(makeRosterItem(tm)));
      // Pass 1b: scheduled + unplaced + PM overlap
      rosterToShow
        .filter((tm) => isUnplaced(tm) && (tm as any).isPMOverlap)
        .forEach((tm) => result.push(makeRosterItem(tm)));
      // Pass 1c: scheduled + unplaced + AM overlap (not PM)
      rosterToShow
        .filter((tm) => isUnplaced(tm) && (tm as any).isAMOverlap && !(tm as any).isPMOverlap)
        .forEach((tm) => result.push(makeRosterItem(tm)));
      // Pass 2: everyone else (deployed, not scheduled, called off) — preserves alpha order
      rosterToShow
        .filter((tm) => !isUnplaced(tm))
        .forEach((tm) => result.push(makeRosterItem(tm)));
    } else {
      rosterToShow.forEach((tm) => result.push(makeRosterItem(tm)));
    }

    // ========== ACTIONS ==========
    result.push({
      id: "action-toggle-grave",
      label: graveOnly ? "Show All Team Members" : "Filter to GRAVE Eligible Only",
      keywords: ["grave", "filter", "eligible", "toggle"],
      group: "Actions",
      icon: graveOnly
        ? <Sun size={15} className="opacity-60" />
        : <Moon size={15} className="opacity-60" />,
      handler: () => onSetGraveOnly(!graveOnly),
      keepOpen: true,
    });

    // New visual attention command
    result.push({
      id: "visual-add-card-border",
      label: "Add Card Border",
      keywords: ["border", "outline", "highlight", "card", "zone", "attention", "mark", "flag"],
      group: "Visual",
      icon: <PenLine size={15} className="opacity-60" />,
      handler: () => {
        // This will be handled specially in the palette for multi-step flow
        console.log("[Command] Add Card Border initiated");
      },
    });

    result.push({
      id: "visual-remove-card-border",
      label: "Remove Card Border",
      keywords: ["border", "remove", "clear", "outline", "unhighlight", "card"],
      group: "Visual",
      icon: <Eraser size={15} className="opacity-60" />,
      handler: () => {
        console.log("[Command] Remove Card Border initiated");
      },
    });

    result.push({
      id: "tasks",
      label: "Tasks",
      keywords: ["task", "tasks", "todo", "note", "add task"],
      group: "Actions",
      icon: <ClipboardList size={15} className="opacity-60" />,
      handler: () => {
        // Handled specially in CommandPalette for multi-step zone + free text flow
      },
      keepOpen: true,
    });

    result.push({
      id: "coverage",
      label: "Add Coverage",
      keywords: ["coverage", "cover", "double", "pair", "and zone", "and restroom", "also"],
      group: "Actions",
      icon: <GitMerge size={15} className="opacity-60" />,
      handler: () => {
        // Handled specially in CommandPalette — opens coverage slot picker
      },
      keepOpen: true,
    });

    result.push({
      id: "action-add-aux",
      label: "Add AUX Slot",
      keywords: ["aux", "add", "extra", "auxiliary"],
      group: "Actions",
      icon: <PlusCircle size={15} className="opacity-60" />,
      handler: onAddAuxSlot,
    });

    if (auxDefs.length > 0) {
      result.push({
        id: "action-remove-aux",
        label: "Remove Last AUX Slot",
        keywords: ["aux", "remove", "delete", "last"],
        group: "Actions",
        icon: <MinusCircle size={15} className="opacity-60" />,
        handler: onRemoveLastAuxSlot,
      });
    }

    if (onRunEngine) {
      result.push({
        id: "action-run-engine",
        label: draftMode ? "Apply Current Draft & Save" : "Run Engine (Enter Draft Mode)",
        keywords: ["engine", "auto", "assign", "optimize", "run", "draft"],
        group: "Actions",
        icon: draftMode
          ? <CheckCircle size={15} className="opacity-60" />
          : <Zap size={15} className="opacity-60" />,
        handler: onRunEngine,
      });
    }

    if (draftMode) {
      // Note: when draftMode is true, the "Run Engine" item (above) already
      // relabels to "Apply Current Draft & Save" and fires applyDraft. The
      // explicit "Apply Draft & Confirm" below is a more discoverable second
      // entry point with the same effect. Both are intentional.
      if (onRunEngine) {
        result.push({
          id: "action-apply-draft",
          label: "Apply Draft & Confirm",
          keywords: ["apply", "save", "confirm", "draft"],
          group: "Actions",
          icon: <CheckCircle size={15} className="opacity-60" />,
          handler: onRunEngine,
        });
      }
      if (onDiscardDraft) {
        result.push({
          id: "action-discard-draft",
          label: "Discard Draft",
          keywords: ["discard", "cancel", "draft", "undo"],
          group: "Actions",
          icon: <Undo2 size={15} className="opacity-60" />,
          handler: onDiscardDraft,
        });
      }
    }

    // Grok board analysis lives as a prominent always-visible button at the
    // top of the Command Palette itself (CommandPalette.tsx). No command-list
    // entry needed — having both was confusing and the list entry was a no-op
    // anyway (parent's onTrigger only called setCmdkOpen, which the palette's
    // own onSelect then closed).

    if (onPrint) {
      result.push({
        id: "action-print",
        label: "Print Deployment Sheet",
        keywords: ["print", "pdf", "export", "paper"],
        group: "Actions",
        icon: <Printer size={15} className="opacity-60" />,
        handler: onPrint,
      });
    }

    if (onPrintWeek) {
      result.push({
        id: "action-print-week",
        label: "Print Entire Week",
        keywords: ["print", "week", "all", "all days", "full week", "book", "pdf", "export", "14 pages"],
        group: "Actions",
        icon: <Printer size={15} className="opacity-60" />,
        handler: onPrintWeek,
      });
    }

    // ========== PHASE 3: HOT-WORD ACTIONS (dynamic per filled slot) ==========
    // Generate one block of searchable actions for every slot that currently has
    // a TM assigned. This powers natural commands like "clear z3", "swap zone 6",
    // "break jessica", "lock zone 1" typed straight from ⌘K root.
    const filledSlots = Object.entries(assignments).filter(
      ([, a]) => !!(a as any)?.tmId
    ) as [string, { tmId: string; tmName?: string; breakGroup?: number }][];

    filledSlots.forEach(([slotKey, a]) => {
      const tmName = a.tmName || a.tmId;
      const slotLabel = slotKeyToLabel(slotKey);
      // Shared keyword base for all actions on this slot
      const slotBase = [slotKey.toLowerCase(), slotLabel.toLowerCase(), tmName.toLowerCase()];

      // "Clear Zone 1: Jessica" — unassign the TM from this slot
      if (onRemoveFromSlot) {
        result.push({
          id: `clear-slot-${slotKey}`,
          label: `Clear ${slotLabel}: ${tmName}`,
          keywords: ["clear", "remove", "unassign", "free up", "empty", ...slotBase],
          group: "Actions",
          icon: <UserMinus size={15} className="opacity-60" />,
          handler: () => onRemoveFromSlot(slotKey),
        });
      }

      // "Swap Zone 1: Jessica" — open palette pre-seeded for this slot so operator
      // can pick a replacement (person-selection mode with current occupant visible)
      if (onOpenPaletteForSlot) {
        result.push({
          id: `swap-slot-${slotKey}`,
          label: `Swap ${slotLabel}: ${tmName}`,
          keywords: ["swap", "replace", "reassign", "change", "who", ...slotBase],
          group: "Actions",
          icon: <ArrowLeftRight size={15} className="opacity-60" />,
          handler: () => onOpenPaletteForSlot(slotKey),
        });
      }

      // "Cycle Break: Jessica (Zone 1)" — advance break group 1→2→3→1
      if (onCycleBreak) {
        const currentBreak = a.breakGroup ?? 0;
        const nextBreak = (currentBreak % 3) + 1;
        result.push({
          id: `break-slot-${slotKey}`,
          label: `Cycle Break: ${tmName} on ${slotLabel}${currentBreak ? ` (now ${currentBreak}→${nextBreak})` : ""}`,
          keywords: ["break", "cycle", "break group", "rotate", ...slotBase],
          group: "Actions",
          icon: <Coffee size={15} className="opacity-60" />,
          handler: () => onCycleBreak(slotKey),
        });
      }

      // "Toggle Lock: Zone 1 (Jessica)" — lock or unlock this assignment
      if (onToggleLock) {
        result.push({
          id: `lock-slot-${slotKey}`,
          label: `Toggle Lock: ${slotLabel} (${tmName})`,
          keywords: ["lock", "unlock", "pin", "protect", "toggle lock", ...slotBase],
          group: "Actions",
          icon: <Lock size={15} className="opacity-60" />,
          handler: () => onToggleLock(slotKey),
        });
      }
    });

    // "Reset All Card Borders" — wipes every visual border at once
    if (onClearAllBorders) {
      result.push({
        id: "visual-reset-all-borders",
        label: "Reset All Card Borders",
        keywords: ["reset", "clear", "borders", "all borders", "remove borders", "visual", "clean up"],
        group: "Visual",
        icon: <Layers size={15} className="opacity-60" />,
        handler: onClearAllBorders,
      });
    }

    // ========== NAVIGATION ==========
    DAY_DEFS.forEach((day, index) => {
      result.push({
        id: `nav-day-${index}`,
        label: `Switch to ${day.name}`,
        keywords: ["day", "switch", day.name.toLowerCase(), day.short.toLowerCase()],
        group: "Navigation",
        metadata: { dayIndex: index, day },
        handler: () => onSetSelectedDayIndex(index),
        disabled: index === selectedDayIndex,
      });
    });

    // ========== HISTORY (Undo / Redo) ==========
    if (shiftHistory.canUndo) {
      result.push({
        id: "history-undo",
        label: "Undo Last Change",
        keywords: ["undo", "back", "revert"],
        group: "History",
        handler: () => {
          const prev = shiftHistory.undo();
          if (prev && onUndo) onUndo();
        },
      });
    }

    if (shiftHistory.canRedo) {
      result.push({
        id: "history-redo",
        label: "Redo Last Change",
        keywords: ["redo", "forward"],
        group: "History",
        handler: () => {
          const next = shiftHistory.redo();
          if (next && onRedo) onRedo();
        },
      });
    }

    return result;
    // `assignments` is intentionally NOT in this list — its identity changes
    // on every parent render and would defeat the memo. The fingerprint
    // (slot keys + tm_ids) captures the meaningful diff. The memo body reads
    // `assignments` via closure; that's safe because the closure is recreated
    // every time the fingerprint changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    graveRoster,
    realRoster,
    assignmentsFingerprint,
    auxDefs,
    selectedDayIndex,
    DAY_DEFS,
    graveOnly,
    shiftHistory,
    onSetGraveOnly,
    onSetSelectedDayIndex,
    onAddAuxSlot,
    onRemoveLastAuxSlot,
    onRunEngine,
    onDiscardDraft,
    onUndo,
    onRedo,
    onPrint,
    onPrintWeek,
    assign,
    draftMode,
    scheduledTmIdsTonight,
    calledOffIds,
    onRemoveFromSlot,
    onToggleLock,
    onCycleBreak,
    onOpenPaletteForSlot,
    onClearAllBorders,
  ]);

  return items;
}
