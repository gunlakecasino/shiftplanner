"use client";

import React, { useRef, useCallback, useEffect } from "react";
import { useShiftCompletion } from "@/hooks/useShiftCompletion";
import { useShiftBuilderStore } from "../store/useShiftBuilderStore";
import type { DayDef } from "@/lib/shiftbuilder/dateUtils";

/**
 * useNotes
 *
 * Extracted for world-class decomposition (Phase 2 continuation).
 * Manages the imperatively-driven notes pad (contentEditable to preserve undo/cursor),
 * debounced persistence, AI ghost-text completion, and suggestion acceptance.
 *
 * Returns stable refs + handlers so Client remains a thin composer.
 * History snapshots still coordinated via pendingHistoryRef in caller.
 */
export interface UseNotesParams {
  selectedDay: DayDef;
  nightId: string | null;
  showToast: (msg: string, type?: "success" | "error" | "info") => void;
  getAssignmentsSnapshot: () => Record<string, any>;
  scheduledTmIdsTonight: Set<string>;
  assignedThisNight: Set<string>;
  DAY_DEFS: DayDef[];
  selectedDayIndex: number;
}

export interface UseNotesReturn {
  notesRef: React.RefObject<HTMLDivElement | null>;
  notesSaveTimerRef: React.RefObject<ReturnType<typeof setTimeout> | null>;
  notesCompletion: ReturnType<typeof useShiftCompletion>;
  handleNotesInput: () => void;
  acceptNotesSuggestion: () => void;
}

export function useNotes({
  selectedDay,
  nightId,
  showToast,
  getAssignmentsSnapshot,
  scheduledTmIdsTonight,
  assignedThisNight,
  DAY_DEFS,
  selectedDayIndex,
}: UseNotesParams): UseNotesReturn {
  const notesRef = useRef<HTMLDivElement | null>(null);
  const notesSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notesCompletion = useShiftCompletion({
    surface: "notes",
    context: {
      day: DAY_DEFS[selectedDayIndex]?.name,
      assignments: Object.fromEntries(
        Object.entries(getAssignmentsSnapshot()).map(([k, v]: [string, any]) => [
          k,
          { tmId: v?.tmId, tmName: v?.tmName },
        ])
      ),
      scheduledUnplaced: Array.from(scheduledTmIdsTonight)
        .filter((id) => !assignedThisNight.has(id))
        .slice(0, 12),
    },
  });

  const handleNotesInput = useCallback(() => {
    if (notesSaveTimerRef.current) clearTimeout(notesSaveTimerRef.current);
    const captureNid = nightId;
    const captureDate = selectedDay.date;
    const captureDayName = selectedDay.name;
    if (notesRef.current) {
      notesCompletion.handleChange(notesRef.current.innerText);
    }
    notesSaveTimerRef.current = setTimeout(async () => {
      if (!notesRef.current) return;
      const text = notesRef.current.innerText;
      try {
        let nid = captureNid;
        if (!nid) {
          const { getOrCreateNightForDate } = await import("@/lib/shiftbuilder/data");
          nid = await getOrCreateNightForDate(captureDate, captureDayName);
        }
        if (!nid) return;
        const { saveNightNotes } = await import("@/lib/shiftbuilder/data");
        await saveNightNotes(nid, text);
      } catch (e: any) {
        console.error("[shiftbuilder] notes save failed", e);
        showToast(`Couldn't save notes: ${e?.message ?? "unknown error"}`);
      }
    }, 600);
  }, [nightId, selectedDay.date, selectedDay.name, showToast, notesCompletion]);

  const acceptNotesSuggestion = useCallback(() => {
    const accepted = notesCompletion.accept();
    if (notesRef.current) {
      const suffix = accepted.slice((notesRef.current.innerText ?? "").length);
      if (suffix) {
        notesRef.current.focus();
        const sel = window.getSelection();
        if (sel) {
          sel.selectAllChildren(notesRef.current);
          sel.collapseToEnd();
        }
        document.execCommand("insertText", false, suffix);
      }
    }
  }, [notesCompletion]);

  // Clear timer on day change to avoid stale writes (caller effect can also do this).
  useEffect(() => {
    return () => {
      if (notesSaveTimerRef.current) {
        clearTimeout(notesSaveTimerRef.current);
        notesSaveTimerRef.current = null;
      }
    };
  }, [selectedDay.date]);

  return {
    notesRef,
    notesSaveTimerRef,
    notesCompletion,
    handleNotesInput,
    acceptNotesSuggestion,
  };
}
