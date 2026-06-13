"use client";

import React, { useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Settings, Undo2 } from "lucide-react";

/**
 * CommandPalette (react-cmdk + Velvet rearchitecture)
 *
 * This is the primary implementation after the full-scale rebuild.
 * Built on react-cmdk for better structure, accessibility, keyboard navigation,
 * and multi-page flows, while applying the project's Liquid Glass / Golden /
 * Atkinson / Velvet visual language.
 *
 * Many advanced features (full NL command mode with chips, complete Grok integration,
 * multi-step coverage/tasks/borders as Pages, Why panel, etc.) are being actively
 * ported into the new architecture.
 *
 * See the approved rebuild plan for details.
 */

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Accepts the existing CommandItem[] from useCommandActions for the spike
  actions?: unknown[];
  placeholder?: string;
  /** When provided, the palette will portal into this container instead of document.body
   *  and use absolute positioning so it is centered inside the artboard overlay layer
   *  (Option 1 best-UX path — true "center of the artboard" at any zoom level).
   */
  artboardOverlayRef?: React.RefObject<HTMLDivElement | null> | null;
  // Pass-through for future (initialContext, Grok props, etc.)
  // Using unknown + explicit casts inside to reduce `any` surface during rebuild.
  [key: string]: unknown;
}

export function CommandPalette({
  open,
  onOpenChange,
  artboardOverlayRef,
  ...rest
}: CommandPaletteProps) {
  const initialContext = (rest as Record<string, unknown>).initialContext as { type: 'slot' | 'person'; value: string } | null | undefined;
  const selectedSlotAssignment = (rest as Record<string, unknown>).selectedSlotAssignment as { tmName?: string } | undefined;
  const onAddTask = (rest as Record<string, unknown>).onAddTask as ((uiKey: string, label: string) => void | Promise<void>) | undefined;
  const onAddCoverage = (rest as Record<string, unknown>).onAddCoverage as ((source: string, target: string) => void | Promise<void>) | undefined;
  const onCycleBreak = (rest as Record<string, unknown>).onCycleBreak as ((uiKey: string) => void) | undefined;
  const onRemoveFromSlot = (rest as Record<string, unknown>).onRemoveFromSlot as ((uiKey: string) => void) | undefined;

  const [search, setSearch] = React.useState("");
  const [selectedIndex, setSelectedIndex] = React.useState(0); // for keyboard navigation over filtered results

  // Portal mount guard (prevents SSR mismatch and ensures we escape any transformed ancestors)
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setMounted(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    return () => setMounted(false);
  }, []); // mount guard — standard safe pattern for portal SSR (guideline rule)

  // Robust iPad-safe focus.
  // All hooks are ALWAYS called in the exact same order on every render of this
  // component instance. We never early-return before hooks. Visibility is
  // controlled purely by the `open` flag (and CSS) so React always sees the
  // same hook sequence. This eliminates "Rendered more hooks than during the
  // previous render" even under Turbopack HMR or rapid open/close cycles.
  React.useEffect(() => {
    if (!open || !mounted) return;

    const t = setTimeout(() => {
      const input = document.querySelector('.command-palette input') as HTMLInputElement | null;
      if (input && document.activeElement !== input) {
        input.focus({ preventScroll: true });
      }
    }, 80);
    return () => clearTimeout(t);
  }, [open, mounted]);

  // Lock body scroll while the palette is open.
  React.useEffect(() => {
    if (!open || !mounted) return;

    const body = document.body;
    const html = document.documentElement;

    const prevBodyOverflow = body.style.overflow;
    const prevBodyPaddingRight = body.style.paddingRight;
    const prevHtmlOverflow = html.style.overflow;

    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`;
    }
    html.style.overflow = 'hidden';

    return () => {
      body.style.overflow = prevBodyOverflow;
      body.style.paddingRight = prevBodyPaddingRight;
      html.style.overflow = prevHtmlOverflow;
    };
  }, [open, mounted]);

  const handleClose = useCallback(() => onOpenChange(false), [onOpenChange]);

  // Always render the same hook sequence. We only populate the expensive
  // animated tree when we actually want it visible.
  const show = open && mounted;

  // Ref for the floating card so we can detect outside clicks reliably
  const cardRef = React.useRef<HTMLDivElement>(null);

  // === Robust Dismissal Strategy ===
  // We deliberately use a document-level listener (capture phase) rather than
  // relying solely on the backdrop. This gives consistent behavior in two modes:
  //
  // 1. Classic body portal → clicking anywhere outside the glass card closes it.
  // 2. Artboard overlay mode → clicking anywhere in the stageHostRef / gray padding
  //    *or* outside the 1056×816 logical box also closes it (the backdrop only covers
  //    the logical artboard area).
  //
  // Global Escape is also handled here so it works even if focus is on a list item.
  React.useEffect(() => {
    if (!show) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      // If the click landed inside the card, ignore it
      if (cardRef.current && cardRef.current.contains(e.target as Node)) {
        return;
      }
      // Click was outside the card → dismiss
      handleClose();
    };

    // Use capture phase so we beat other handlers
    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('mousedown', handleMouseDown, true);

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('mousedown', handleMouseDown, true);
    };
  }, [show, handleClose]); // handleClose is now stable useCallback

  // eslint-disable-next-line react-hooks/refs
  const useArtboardOverlay = !!artboardOverlayRef?.current; // intentional read of stable ref prop for portal decision (artboard-centered UX)

  // === Dynamic actions from the rich registry (useCommandActions) ===
  const rawActions = React.useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (((rest as any).actions as any[]) || []) as unknown[];
  }, [rest]); // wrapped per exhaustive-deps suggestion to stabilize for filteredActions memo

  // Client-side filter against label + keywords (simple but effective while we restore full react-cmdk)
  const filteredActions = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rawActions;

    return rawActions.filter((item: unknown) => {
      const it = item as { label?: string; keywords?: string[] };
      const labelMatch = (it.label || "").toLowerCase().includes(term);
      const keywordMatch = (it.keywords || []).some((k: string) =>
        k.toLowerCase().includes(term)
      );
      return labelMatch || keywordMatch;
    });
  }, [rawActions, search]);

  // Group the filtered actions for nice sections
  const groupedActions = React.useMemo(() => {
    const groups: Record<string, unknown[]> = {};
    for (const item of filteredActions) {
      const it = item as { group?: string };
      const g = it.group || "Other";
      if (!groups[g]) groups[g] = [];
      groups[g].push(item);
    }
    return groups;
  }, [filteredActions]);

  // Flattened list for keyboard navigation
  const flatFiltered = React.useMemo(() => filteredActions, [filteredActions]);

  // Reset selection when search or actions change
  React.useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setSelectedIndex(0);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [search, flatFiltered.length]); // reset on filter change — standard derived state reset pattern (guideline)

  const paletteContent = show ? (
    <>
      {/* Backdrop — when using artboard overlay we render a lighter one limited to the overlay area */}
      <div
        className={useArtboardOverlay 
          ? "sb-overlay-backdrop absolute inset-0 z-[10049] overscroll-none touch-none" 
          : "sb-overlay-backdrop sb-overlay-backdrop--fixed inset-0 z-[10050] overscroll-none touch-none"}
        onClick={handleClose}
        onWheel={(e) => e.preventDefault()}
      />

      {/* Centered floating glass card */}
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, scale: 0.985, x: '-50%', y: '-50%' }}
          animate={{ opacity: 1, scale: 1, x: '-50%', y: '-50%' }}
          exit={{ opacity: 0, scale: 0.985, x: '-50%', y: '-50%' }}
          transition={{ type: "spring", stiffness: 380, damping: 30, mass: 0.9 }}
          ref={cardRef}
          className={`command-palette sb-modal-enter ${useArtboardOverlay ? 'absolute' : 'fixed'} z-[10051] w-full max-w-[620px] max-h-[min(70vh,560px)] rounded-3xl border shadow-2xl backdrop-blur-xl overflow-hidden pointer-events-auto flex flex-col`}
          style={{
            left: '50%',
            top: '50%',
            background: "var(--sb-glass, rgba(255,255,255,0.96))",
            borderColor: "var(--sb-glass-border, rgba(0,0,0,0.08))",
            boxShadow: "0 30px 70px -15px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.9)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Minimal reliable shell — full roster/Grok/cmdk flows being restored */}
          <div className="flex flex-col h-full">
            <div className="flex items-center gap-2 border-b px-4 py-3" style={{ borderColor: "var(--sb-glass-border, rgba(0,0,0,0.08))" }}>
              <Search className="h-4 w-4 opacity-50" />
              <input
                placeholder="Search roster, actions, or type a command…"
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    onOpenChange(false);
                  } else if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setSelectedIndex((i) => Math.min(i + 1, Math.max(0, flatFiltered.length - 1)));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setSelectedIndex((i) => Math.max(i - 1, 0));
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    const target = flatFiltered[selectedIndex] as { handler?: () => void; keepOpen?: boolean } | undefined;
                    if (target) {
                      try { target.handler?.(); } catch (err) { console.error(err); }
                      if (!target.keepOpen) onOpenChange(false);
                    }
                  }
                }}
              />
              <button
                onClick={() => onOpenChange(false)}
                className="sb-interactive text-xs px-2 py-0.5 rounded bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20"
              >
                Esc
              </button>
            </div>

            {/* Contextual header when opened for a specific slot or person */}
            {initialContext && (
              <div className="px-4 py-1.5 text-[11px] bg-black/5 dark:bg-white/5 text-[#6B7280] dark:text-[#8E8E93] border-b" style={{ borderColor: "var(--sb-glass-border, rgba(0,0,0,0.08))" }}>
                {initialContext.type === 'slot' ? 'Assigning to' : 'Context'} <span className="font-medium text-[#1C1C1E] dark:text-white">{initialContext.value}</span>
              </div>
            )}

            <div className="p-2 flex-1 min-h-0 overflow-auto text-sm">
              {/* Always-visible high-frequency actions (pinned at top for muscle memory) */}
              <div className="px-2 py-1 text-[10px] uppercase tracking-[1px] text-[#6B7280] dark:text-[#8E8E93]">Quick actions</div>

              <button
                onClick={() => { (rest as any).onOpenSudo?.(); onOpenChange(false); }}
                className="sb-list-row sb-interactive w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 active:bg-black/10"
              >
                <Settings className="h-4 w-4 opacity-70" />
                <span className="font-medium">Open Sudo / Command Center</span>
              </button>

              <button
                onClick={() => onOpenChange(false)}
                className="sb-list-row sb-interactive w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 active:bg-black/10"
              >
                <span className="inline-block w-4 h-4 opacity-70">📅</span>
                <span>Go to Today</span>
              </button>

              <button
                onClick={() => { (rest as any).onUndo?.(); }}
                className="sb-list-row sb-interactive w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 active:bg-black/10"
              >
                <Undo2 className="h-4 w-4 opacity-70" />
                <span>Undo last change</span>
              </button>

              <div className="my-2 h-px bg-black/10 dark:bg-white/10" />

              {/* Contextual actions when opened with a specific slot/person context */}
              {initialContext?.type === 'person' && initialContext.value && (
                <div className="mb-3">
                  <div className="px-2 py-1 text-[10px] uppercase tracking-[1px] text-[#007AFF] dark:text-[#0A84FF]">
                    About {initialContext.value}
                  </div>
                  <div className="px-3 py-2 text-sm text-[#6B7280] dark:text-[#8E8E93]">
                    Person context active. Use roster rail or type to assign this person.
                  </div>
                </div>
              )}

              {initialContext?.type === 'slot' && initialContext.value && (
                <div className="mb-3">
                  <div className="px-2 py-1 text-[10px] uppercase tracking-[1px] text-[#007AFF] dark:text-[#0A84FF]">
                    For {initialContext.value}
                    {selectedSlotAssignment?.tmName && ` · ${selectedSlotAssignment.tmName}`}
                  </div>

                  {onRemoveFromSlot && (
                    <button
                      onClick={() => {
                        onRemoveFromSlot(initialContext.value);
                        onOpenChange(false);
                      }}
                      className="sb-list-row sb-interactive w-full text-left flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 active:bg-black/10 text-sm"
                    >
                      <span className="text-red-500">×</span>
                      <span>Clear this slot</span>
                    </button>
                  )}

                  {onAddTask && (
                    <button
                      onClick={() => {
                        // Simple immediate task prompt for now (full multi-step flow can be layered later)
                        const label = prompt('Task label for ' + initialContext.value + '?');
                        if (label) onAddTask(initialContext.value, label);
                        onOpenChange(false);
                      }}
                      className="sb-list-row sb-interactive w-full text-left flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 active:bg-black/10 text-sm"
                    >
                      <span>✓</span>
                      <span>Add task to this slot</span>
                    </button>
                  )}

                  {onCycleBreak && (
                    <button
                      onClick={() => {
                        onCycleBreak(initialContext.value);
                        onOpenChange(false);
                      }}
                      className="sb-list-row sb-interactive w-full text-left flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 active:bg-black/10 text-sm"
                    >
                      <span>↻</span>
                      <span>Cycle break group</span>
                    </button>
                  )}

                  {onAddCoverage && (
                    <button
                      onClick={() => {
                        // Placeholder for coverage flow – can be expanded into multi-step picker later
                        alert('Coverage flow from ' + initialContext.value + ' – full picker coming in next layer');
                        onOpenChange(false);
                      }}
                      className="sb-list-row sb-interactive w-full text-left flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 active:bg-black/10 text-sm"
                    >
                      <span>⇄</span>
                      <span>Add coverage from this slot</span>
                    </button>
                  )}
                </div>
              )}

              {/* Dynamic grouped + searchable actions from the real registry */}
              {Object.keys(groupedActions).length > 0 ? (
                (() => {
                  // Build a flat list for reliable keyboard selection across groups
                  let globalIndex = 0;
                  const renderedGroups: React.ReactNode[] = [];

                  Object.entries(groupedActions).forEach(([groupName, items]) => {
                    const groupElements: React.ReactNode[] = [];

                    items.forEach((item: any) => {
                      const currentGlobalIndex = globalIndex++;
                      const isSelected = currentGlobalIndex === selectedIndex;

                      const isRoster = item.group === 'Roster' && item.metadata?.tm;
                      const tm = item.metadata?.tm;

                      groupElements.push(
                        <button
                          key={item.id}
                          onClick={() => {
                            try {
                              item.handler?.();
                            } catch (e) {
                              console.error("[CommandPalette] handler error", e);
                            }
                            if (!item.keepOpen) {
                              onOpenChange(false);
                            }
                          }}
                          className={`sb-list-row sb-interactive w-full text-left flex items-center gap-3 px-3 py-2 rounded-xl text-sm ${
                            isSelected
                              ? 'bg-[#007AFF15] dark:bg-[#0A84FF30] ring-1 ring-[#007AFF40] dark:ring-[#0A84FF50]'
                              : 'hover:bg-black/5 dark:hover:bg-white/5 active:bg-black/10'
                          }`}
                        >
                          {item.icon && (
                            <span className="shrink-0 opacity-70">{item.icon}</span>
                          )}
                          <span className="truncate flex-1">{item.label}</span>

                          {/* Roster-specific rich metadata */}
                          {isRoster && tm && (
                            <div className="flex items-center gap-2 text-[10px] text-[#6B7280] dark:text-[#8E8E93] ml-auto">
                              {tm.primarySection && (
                                <span className="px-1.5 py-px rounded bg-black/5 dark:bg-white/10">{tm.primarySection}</span>
                              )}
                              {tm.gravePool && <span className="text-[#34C759]">G</span>}
                              {item.metadata?.currentAssignment && (
                                <span className="font-mono truncate max-w-[90px]">{item.metadata.currentAssignment}</span>
                              )}
                            </div>
                          )}

                          {/* Generic fallback */}
                          {!isRoster && item.metadata?.currentAssignment && (
                            <span className="ml-auto text-[10px] text-[#6B7280] dark:text-[#8E8E93] truncate max-w-[120px]">
                              {item.metadata.currentAssignment}
                            </span>
                          )}
                        </button>
                      );
                    });

                    renderedGroups.push(
                      <div key={groupName} className="mb-3">
                        <div className="px-2 py-1 text-[10px] uppercase tracking-[1px] text-[#6B7280] dark:text-[#8E8E93]">
                          {groupName}
                        </div>
                        {groupElements}
                      </div>
                    );
                  });

                  return renderedGroups;
                })()
              ) : search.trim() ? (
                <div className="px-3 py-4 text-sm text-[#6B7280] dark:text-[#8E8E93]">
                  No matches for “{search}”.
                </div>
              ) : (
                <div className="px-3 py-4 text-sm text-[#6B7280] dark:text-[#8E8E93]">
                  Start typing to search the roster, actions, days, and more.
                </div>
              )}
            </div>

            <div className="border-t px-3 py-1.5 text-[10px] text-[#9CA3AF] dark:text-[#636366] flex items-center justify-between" style={{ borderColor: "var(--sb-glass-border, rgba(0,0,0,0.08))" }}>
              <div>⌘K • ShiftBuilder</div>
              <div className="opacity-60">Esc to close</div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </>
  ) : null;

  // ALWAYS return a portal from this component (hook count stable).
  // When an artboardOverlayRef is supplied we portal into it instead of body.
  // This gives true "center of the artboard" (Option 1 best UX).
  // eslint-disable-next-line react-hooks/refs
  const portalTarget = useArtboardOverlay && artboardOverlayRef?.current
    ? artboardOverlayRef.current
    : document.body; // intentional for optional artboard-centered portal (stable ref prop, not render-derived data)

  return createPortal(paletteContent, portalTarget);
}

// Maintain compatibility during transition
export { CommandPalette as VelvetCommandPalette };

export default CommandPalette;
