"use client";

import { useMemo } from "react";
import { type Snapshot, type AuxDef } from "./useShiftHistory";
import type { TeamMember } from "@/lib/shiftbuilder/data";

// Types for the master command palette (Phase 2 core)
export type CommandGroup =
  | "Roster"
  | "Actions"
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

  // Real assignment support
  assign?: (slotKey: string, tmId: string, tmName: string) => void;

  // Draft mode support (for Command Palette labels)
  isDraftMode?: boolean;

  // Grok structured suggestions (new A+B intelligence path)
  onApplyGrokSuggestions?: (actions: any[]) => void;
  onTriggerGrokBoardAnalysis?: () => void;
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
  assign,
  isDraftMode = false,
  onApplyGrokSuggestions,
  onTriggerGrokBoardAnalysis,
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

    rosterToShow.forEach((tm) => {
      const currentAssignment = Object.entries(assignments).find(
        ([, a]) => (a as any)?.tmId === tm.id
      )?.[0];

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
      ].filter(Boolean) as string[];

      result.push({
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
        },
        handler: () => {
          // Legacy quickActionFor path removed in palette upgrade Phase 1.
          // All card-driven assignment now goes through the contextual palette flow.
          console.log("[Command] Roster item selected (will be handled via contextual palette):", tm.name || tm.fullName);
        },
      });
    });

    // ========== ACTIONS ==========
    result.push({
      id: "action-toggle-grave",
      label: graveOnly ? "Show All Team Members" : "Filter to GRAVE Eligible Only",
      keywords: ["grave", "filter", "eligible", "toggle"],
      group: "Actions",
      handler: () => onSetGraveOnly(!graveOnly),
      keepOpen: true,
    });

    // New visual attention command
    result.push({
      id: "visual-add-card-border",
      label: "Add Card Border",
      keywords: ["border", "outline", "highlight", "card", "zone", "attention", "mark", "flag"],
      group: "Actions",
      handler: () => {
        // This will be handled specially in the palette for multi-step flow
        console.log("[Command] Add Card Border initiated");
      },
    });

    result.push({
      id: "action-add-aux",
      label: "Add AUX Slot",
      keywords: ["aux", "add", "extra", "auxiliary"],
      group: "Actions",
      handler: onAddAuxSlot,
    });

    if (auxDefs.length > 0) {
      result.push({
        id: "action-remove-aux",
        label: "Remove Last AUX Slot",
        keywords: ["aux", "remove", "delete", "last"],
        group: "Actions",
        handler: onRemoveLastAuxSlot,
      });
    }

    if (onRunEngine) {
      result.push({
        id: "action-run-engine",
        label: draftMode ? "Apply Current Draft & Save" : "Run Engine (Enter Draft Mode)",
        keywords: ["engine", "auto", "assign", "optimize", "run", "draft"],
        group: "Actions",
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
          handler: onRunEngine,
        });
      }
      if (onDiscardDraft) {
        result.push({
          id: "action-discard-draft",
          label: "Discard Draft",
          keywords: ["discard", "cancel", "draft", "undo"],
          group: "Actions",
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
        handler: onPrint,
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
    assign,
    draftMode,
  ]);

  return items;
}
