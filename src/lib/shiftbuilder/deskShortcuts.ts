/**
 * SheetBuilder Wave 3 — documented desk bindings.
 * Cheatsheet and the keyboard hook share this list. Nothing here is theater.
 */

export type DeskShortcutGroup = "day" | "roster" | "night" | "help";

export type DeskShortcut = {
  id: string;
  /** Display glyphs, in order. */
  keys: string[];
  action: string;
  group: DeskShortcutGroup;
};

export const DESK_SHORTCUT_GROUPS: { id: DeskShortcutGroup; label: string }[] = [
  { id: "day", label: "Day" },
  { id: "roster", label: "Roster & assign" },
  { id: "night", label: "Night" },
  { id: "help", label: "Help" },
];

export const DESK_SHORTCUTS: DeskShortcut[] = [
  { id: "prev-day", keys: ["←"], action: "Previous day", group: "day" },
  { id: "next-day", keys: ["→"], action: "Next day", group: "day" },
  { id: "roster-up", keys: ["↑"], action: "Previous name in roster", group: "roster" },
  { id: "roster-down", keys: ["↓"], action: "Next name in roster", group: "roster" },
  { id: "assign", keys: ["A"], action: "Focus next open assignment", group: "roster" },
  { id: "draft", keys: ["D"], action: "Draft on or off", group: "night" },
  { id: "apply", keys: ["⌘", "↵"], action: "Apply to Live — opens confirm", group: "night" },
  { id: "discard", keys: ["⇧", "D"], action: "Discard draft — opens confirm", group: "night" },
  { id: "print", keys: ["⌘", "P"], action: "Print", group: "night" },
  { id: "refresh", keys: ["⇧", "R"], action: "Refresh day", group: "night" },
  { id: "undo", keys: ["⌘", "Z"], action: "Undo", group: "night" },
  { id: "redo", keys: ["⌘", "⇧", "Z"], action: "Redo", group: "night" },
  { id: "cheatsheet", keys: ["?"], action: "This cheatsheet", group: "help" },
];

const TYPING_SELECTOR =
  "input, textarea, select, [contenteditable]:not([contenteditable='false'])";

/** True when the event is coming from a field that should keep its own keys. */
export function isDeskTypingTarget(target: EventTarget | null): boolean {
  if (typeof Element === "undefined") return false;
  if (!(target instanceof Element)) return false;
  if (target.closest(TYPING_SELECTOR)) return true;
  const role = target.getAttribute("role");
  if (role === "textbox" || role === "searchbox" || role === "combobox") return true;
  return false;
}

/** Confirm / Print / pads already own Escape and letters. */
export function isDeskModalLock(target: EventTarget | null): boolean {
  if (typeof document === "undefined" || typeof Element === "undefined") return false;
  if (!(target instanceof Element)) {
    return !!document.querySelector(
      '[role="alertdialog"], [aria-modal="true"]:not([data-sb-cheatsheet])',
    );
  }
  return !!target.closest(
    '[role="alertdialog"], [aria-modal="true"]:not([data-sb-cheatsheet]), .pcc-root',
  );
}

export function focusCycled<T extends HTMLElement>(
  nodes: T[],
  delta: number,
): T | null {
  if (nodes.length === 0) return null;
  const active = document.activeElement;
  const current = nodes.findIndex(
    (node) => node === active || node.contains(active),
  );
  const start = current < 0 ? (delta > 0 ? -1 : 0) : current;
  const next = (start + delta + nodes.length) % nodes.length;
  const node = nodes[next] ?? null;
  node?.focus();
  return node;
}
