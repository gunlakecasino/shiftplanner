"use client";

import React from "react";
import {
  focusCycled,
  isDeskModalLock,
  isDeskTypingTarget,
} from "@/lib/shiftbuilder/deskShortcuts";

export type DeskKeyboardActions = {
  goPrevDay: () => void;
  goNextDay: () => void;
  rosterOpen: boolean;
  setRosterOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  toggleDraft?: () => void;
  applyDraft?: () => void;
  discardDraft?: () => void;
  refreshDay?: () => void;
  canDraft?: boolean;
};

type Options = DeskKeyboardActions & {
  cheatsheetOpen: boolean;
  setCheatsheetOpen: React.Dispatch<React.SetStateAction<boolean>>;
};

function rosterRows(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>(
      ".sb-roster-shell--open .sb-roster-row",
    ),
  );
}

function assignInvites(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>(
      ".sb-builder-stage .sb-unassigned-invite",
    ),
  );
}

/**
 * Hardware-keyboard desk bindings. Touch-primary iPad is unchanged:
 * these only fire on keydown and never steal fields or modal traps.
 */
export function useDeskKeyboard({
  cheatsheetOpen,
  setCheatsheetOpen,
  goPrevDay,
  goNextDay,
  rosterOpen,
  setRosterOpen,
  toggleDraft,
  applyDraft,
  discardDraft,
  refreshDay,
  canDraft = false,
}: Options) {
  const actionsRef = React.useRef({
    goPrevDay,
    goNextDay,
    rosterOpen,
    setRosterOpen,
    toggleDraft,
    applyDraft,
    discardDraft,
    refreshDay,
    canDraft,
    cheatsheetOpen,
    setCheatsheetOpen,
  });
  actionsRef.current = {
    goPrevDay,
    goNextDay,
    rosterOpen,
    setRosterOpen,
    toggleDraft,
    applyDraft,
    discardDraft,
    refreshDay,
    canDraft,
    cheatsheetOpen,
    setCheatsheetOpen,
  };

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const a = actionsRef.current;
      const key = e.key;
      const lower = key.length === 1 ? key.toLowerCase() : key;
      const meta = e.metaKey || e.ctrlKey;

      if (key === "?" || (key === "/" && e.shiftKey)) {
        if (isDeskTypingTarget(e.target)) return;
        e.preventDefault();
        a.setCheatsheetOpen((open) => !open);
        return;
      }

      if (key === "Escape" && a.cheatsheetOpen) {
        e.preventDefault();
        a.setCheatsheetOpen(false);
        return;
      }

      if (a.cheatsheetOpen) return;
      if (isDeskTypingTarget(e.target)) return;
      if (isDeskModalLock(e.target)) return;

      if (key === "ArrowLeft" && !meta && !e.altKey) {
        e.preventDefault();
        a.goPrevDay();
        return;
      }
      if (key === "ArrowRight" && !meta && !e.altKey) {
        e.preventDefault();
        a.goNextDay();
        return;
      }

      if ((key === "ArrowUp" || key === "ArrowDown") && !meta && !e.altKey) {
        e.preventDefault();
        const delta = key === "ArrowDown" ? 1 : -1;
        if (!a.rosterOpen) {
          a.setRosterOpen(true);
          window.requestAnimationFrame(() => {
            focusCycled(rosterRows(), delta);
          });
          return;
        }
        focusCycled(rosterRows(), delta);
        return;
      }

      if (lower === "a" && !meta && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        focusCycled(assignInvites(), 1);
        return;
      }

      if (lower === "d" && !meta && !e.altKey && a.canDraft) {
        e.preventDefault();
        if (e.shiftKey) {
          a.discardDraft?.();
        } else {
          a.toggleDraft?.();
        }
        return;
      }

      if (key === "Enter" && meta && a.canDraft) {
        e.preventDefault();
        a.applyDraft?.();
        return;
      }

      if (lower === "r" && e.shiftKey && !meta && !e.altKey) {
        if (!a.refreshDay) return;
        e.preventDefault();
        a.refreshDay();
        return;
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
