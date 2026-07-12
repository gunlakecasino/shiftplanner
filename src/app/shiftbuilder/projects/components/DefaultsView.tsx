"use client";

import React, { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, LayoutGrid, Plus, X } from "lucide-react";
import type { WorkItem, WorkItemPriority } from "@/lib/tasks/types";
import {
  canonicalizeDefaultSlotKey,
  canonicalOverlapPoolSlotKey,
  overlapPoolBand,
  OVERLAP_POOL_BLURB,
  overlapPoolGroupKey,
  overlapPoolLabel,
  type OverlapPoolBand,
} from "@/lib/shiftbuilder/overlapPoolDefaults";
import {
  formatRecurrenceDaysLabel,
  nextPriority,
  normalizeRecurrenceDays,
  PRIORITY_CYCLE,
  WEEKDAY_SHORT,
} from "@/lib/shiftbuilder/rotation/overlapPoolSelect";
import { useSlotDefaults } from "../hooks/useProjectsData";
import {
  useCreateSlotDefault,
  useDeleteSlotDefault,
  useUpdateSlotDefault,
} from "../hooks/useTaskMutations";
import { EmptyState } from "./EmptyState";

/** Human label for a non-pool slot group, derived from slot_key + rr_side. */
function slotLabel(slotKey: string, rrSide: string | null): string {
  const side = rrSide === "mens" ? " (Men's)" : rrSide === "womens" ? " (Women's)" : "";
  if (slotKey.startsWith("zone_")) return `Zone ${slotKey.slice(5)}`;
  if (slotKey.startsWith("rr_")) return `Restroom ${slotKey.slice(3).replace(/_/g, "+")}${side}`;
  return slotKey.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) + side;
}

interface SlotGroup {
  key: string;
  /** Write target for new tasks (canonical `_0` for OL pools). */
  slotKey: string;
  slotType: string;
  rrSide: string | null;
  label: string;
  items: WorkItem[];
  /** Band pool card (union read of all indices; write to `_0`). */
  isOverlapPool?: boolean;
  poolBand?: OverlapPoolBand;
}

function emptyPoolGroup(band: OverlapPoolBand): SlotGroup {
  return {
    key: overlapPoolGroupKey(band),
    slotKey: canonicalOverlapPoolSlotKey(band),
    slotType: "overlap",
    rrSide: null,
    label: overlapPoolLabel(band),
    items: [],
    isOverlapPool: true,
    poolBand: band,
  };
}

const PRIORITY_TONE: Record<string, string> = {
  urgent: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30",
  high: "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30",
  normal: "bg-[var(--ios-gray-6)] text-[var(--ios-label-secondary)] border-[var(--sb-settings-border-paper)]",
  low: "bg-[var(--ios-gray-6)] text-[var(--ios-label-quaternary)] border-dashed border-[var(--sb-settings-border-paper)]",
};

function sortPoolItems(items: WorkItem[]): WorkItem[] {
  const rank: Record<string, number> = { urgent: 4, high: 3, normal: 2, low: 1 };
  return [...items].sort((a, b) => {
    const pr = (rank[b.priority] ?? 2) - (rank[a.priority] ?? 2);
    if (pr !== 0) return pr;
    const sa = a.poolSortOrder ?? 1e9;
    const sb = b.poolSortOrder ?? 1e9;
    if (sa !== sb) return sa - sb;
    return a.title.localeCompare(b.title);
  });
}

function OverlapPoolTaskCard({
  item,
  canManage,
  onDelete,
  onPatch,
  onMove,
  isFirst,
  isLast,
}: {
  item: WorkItem;
  canManage: boolean;
  onDelete: () => void;
  onPatch: (patch: {
    priority?: string;
    recurrenceDays?: number[] | null;
    poolSortOrder?: number | null;
  }) => void;
  onMove: (dir: -1 | 1) => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const days = normalizeRecurrenceDays(item.recurrenceDays) ?? [];
  const everyNight = days.length === 0;
  const priority = (item.priority ?? "normal") as WorkItemPriority;

  const toggleDay = (d: number) => {
    if (!canManage) return;
    let next: number[];
    if (everyNight) {
      // Starting from every night: selecting a day means "only these"
      next = [d];
    } else if (days.includes(d)) {
      next = days.filter((x) => x !== d);
    } else {
      next = [...days, d].sort((a, b) => a - b);
    }
    // Empty or all 7 → every night (null)
    onPatch({
      recurrenceDays: next.length === 0 || next.length === 7 ? null : next,
    });
  };

  const setEveryNight = () => {
    if (!canManage) return;
    onPatch({ recurrenceDays: null });
  };

  return (
    <div className="w-full rounded-lg border border-[var(--sb-settings-border-paper)] bg-[var(--ios-background-secondary)] px-2 py-1.5 space-y-1">
      <div className="flex items-start gap-1.5">
        {canManage && (
          <div className="flex flex-col gap-0.5 pt-0.5">
            <button
              type="button"
              disabled={isFirst}
              onClick={() => onMove(-1)}
              className="text-[var(--ios-label-quaternary)] hover:text-[var(--ios-label)] disabled:opacity-30"
              aria-label="Move up (more important)"
              title="Higher importance within priority"
            >
              <ChevronUp size={12} />
            </button>
            <button
              type="button"
              disabled={isLast}
              onClick={() => onMove(1)}
              className="text-[var(--ios-label-quaternary)] hover:text-[var(--ios-label)] disabled:opacity-30"
              aria-label="Move down (less important)"
              title="Lower importance within priority"
            >
              <ChevronDown size={12} />
            </button>
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11.5px] font-medium text-[var(--ios-label)] truncate">
              {item.title}
            </span>
            <button
              type="button"
              disabled={!canManage}
              onClick={() => canManage && onPatch({ priority: nextPriority(priority) })}
              className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${PRIORITY_TONE[priority] ?? PRIORITY_TONE.normal}`}
              title={
                canManage
                  ? `Priority: ${priority} (click to cycle: ${PRIORITY_CYCLE.join(" → ")})`
                  : `Priority: ${priority}`
              }
            >
              {priority}
            </button>
            {canManage && (
              <button
                type="button"
                onClick={onDelete}
                className="ml-auto text-[var(--ios-label-quaternary)] hover:text-[var(--sb-projects-overdue)]"
                aria-label={`Remove ${item.title}`}
              >
                <X size={12} />
              </button>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <button
              type="button"
              disabled={!canManage}
              onClick={setEveryNight}
              className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${
                everyNight
                  ? "bg-[var(--sb-projects-accent)]/15 text-[var(--sb-projects-accent)]"
                  : "text-[var(--ios-label-quaternary)] hover:bg-[var(--ios-gray-6)]"
              }`}
              title="Eligible every grave night"
            >
              All
            </button>
            {WEEKDAY_SHORT.map((label, d) => {
              const on = everyNight || days.includes(d);
              const dim = everyNight ? false : !days.includes(d);
              return (
                <button
                  key={`${item.id}-d${d}`}
                  type="button"
                  disabled={!canManage}
                  onClick={() => toggleDay(d)}
                  className={`h-5 w-5 rounded text-[9px] font-semibold tabular-nums ${
                    on && !dim
                      ? "bg-[var(--sb-projects-accent)] text-white"
                      : everyNight
                        ? "bg-[var(--sb-projects-accent)]/20 text-[var(--sb-projects-accent)]"
                        : "bg-[var(--ios-gray-6)] text-[var(--ios-label-quaternary)]"
                  }`}
                  title={formatRecurrenceDaysLabel(everyNight ? null : days)}
                >
                  {label}
                </button>
              );
            })}
            <span className="text-[9px] text-[var(--ios-label-quaternary)] ml-0.5">
              {formatRecurrenceDaysLabel(item.recurrenceDays)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function DefaultsView({ canManage }: { canManage: boolean }) {
  const { data: defaults = [], isLoading } = useSlotDefaults();
  const createDefault = useCreateSlotDefault();
  const updateDefault = useUpdateSlotDefault();
  const deleteDefault = useDeleteSlotDefault();
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const groups = useMemo<SlotGroup[]>(() => {
    const map = new Map<string, SlotGroup>();
    map.set(overlapPoolGroupKey("am"), emptyPoolGroup("am"));
    map.set(overlapPoolGroupKey("pm"), emptyPoolGroup("pm"));

    for (const d of defaults) {
      const slotKey = d.slotKey ?? "";
      const rrSide = d.rrSide ?? null;
      const band = overlapPoolBand(slotKey);
      if (band) {
        map.get(overlapPoolGroupKey(band))!.items.push(d);
        continue;
      }
      const key = `${slotKey}|${rrSide ?? ""}`;
      let g = map.get(key);
      if (!g) {
        g = {
          key,
          slotKey,
          slotType: d.slotType ?? "zone",
          rrSide,
          label: slotLabel(slotKey, rrSide),
          items: [],
        };
        map.set(key, g);
      }
      g.items.push(d);
    }

    // Sort OL pool items by importance
    for (const band of ["am", "pm"] as OverlapPoolBand[]) {
      const g = map.get(overlapPoolGroupKey(band))!;
      g.items = sortPoolItems(g.items);
    }

    const pools = [map.get(overlapPoolGroupKey("am"))!, map.get(overlapPoolGroupKey("pm"))!];
    const others = [...map.values()]
      .filter((g) => !g.isOverlapPool)
      .sort((a, b) => a.slotKey.localeCompare(b.slotKey) || a.label.localeCompare(b.label));
    return [...others, ...pools];
  }, [defaults]);

  const hasNonPoolItems = groups.some((g) => !g.isOverlapPool && g.items.length > 0);
  const hasPoolItems = groups.some((g) => g.isOverlapPool && g.items.length > 0);
  const showEmpty = !isLoading && !hasNonPoolItems && !hasPoolItems && !canManage;

  const submitAdd = async (g: SlotGroup) => {
    const title = draft.trim();
    if (!title) {
      setAddingTo(null);
      return;
    }
    const slotKey = g.isOverlapPool
      ? canonicalizeDefaultSlotKey(g.slotKey)
      : g.slotKey;
    const maxSort = g.isOverlapPool
      ? Math.max(-1, ...g.items.map((i) => i.poolSortOrder ?? -1))
      : null;
    await createDefault.mutateAsync({
      title,
      slotKey,
      slotType: g.slotType,
      rrSide: g.rrSide,
      priority: "normal",
      poolSortOrder: g.isOverlapPool ? maxSort! + 1 : null,
    });
    setDraft("");
    setAddingTo(null);
  };

  const movePoolItem = async (g: SlotGroup, index: number, dir: -1 | 1) => {
    const sorted = sortPoolItems(g.items);
    const j = index + dir;
    if (j < 0 || j >= sorted.length) return;
    const a = sorted[index];
    const b = sorted[j];
    // Swap pool_sort_order (use index if null)
    const aOrd = a.poolSortOrder ?? index;
    const bOrd = b.poolSortOrder ?? j;
    await Promise.all([
      updateDefault.mutateAsync({ id: a.id, patch: { poolSortOrder: bOrd } }),
      updateDefault.mutateAsync({ id: b.id, patch: { poolSortOrder: aOrd } }),
    ]);
  };

  return (
    <div className="space-y-3">
      <div className="sb-projects-card px-3 py-2 space-y-1.5">
        <p className="text-[11.5px] leading-snug text-[var(--ios-label-tertiary)]">
          <span className="font-semibold text-[var(--ios-label-secondary)]">Nightly defaults.</span>{" "}
          Zone, restroom, and AUX chips auto-populate those cards on every new grave night.
        </p>
        <p className="text-[11.5px] leading-snug text-[var(--ios-label-tertiary)]">
          <span className="font-semibold text-[var(--ios-label-secondary)]">AM / PM Overlap Pools</span>{" "}
          feed <span className="font-medium text-[var(--ios-label-secondary)]">Apply Overlap Tasks</span>
          . Set <em>priority</em> (must-do vs if-staffed), <em>days</em> (which nights), and order.
          Apply cuts to staffed seats: urgent/high first. Not auto-seeded on empty OL cards.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-1.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-[var(--ios-gray-6)]" />
          ))}
        </div>
      ) : showEmpty ? (
        <EmptyState
          title="No default tasks"
          subtitle="Add per-slot nightly defaults, or standing tasks under AM/PM Overlap Pool."
        />
      ) : (
        <div className="space-y-2">
          {groups.map((g) => (
            <div key={g.key} className="sb-projects-card px-3 py-2.5">
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <LayoutGrid size={13} className="text-[var(--sb-projects-accent)]" />
                <span className="text-[12.5px] font-semibold text-[var(--ios-label)]">{g.label}</span>
                <span className="text-[10px] tabular-nums text-[var(--ios-label-quaternary)]">
                  {g.items.length}
                </span>
              </div>
              {g.isOverlapPool && (
                <p className="mb-1.5 text-[10.5px] leading-snug text-[var(--ios-label-quaternary)]">
                  {OVERLAP_POOL_BLURB} Higher priority runs first when fewer seats are staffed.
                </p>
              )}

              {g.isOverlapPool ? (
                <div className="space-y-1.5">
                  {sortPoolItems(g.items).map((d, idx, arr) => (
                    <OverlapPoolTaskCard
                      key={d.id}
                      item={d}
                      canManage={canManage}
                      isFirst={idx === 0}
                      isLast={idx === arr.length - 1}
                      onDelete={() => deleteDefault.mutate(d.id)}
                      onPatch={(patch) =>
                        updateDefault.mutate({ id: d.id, patch })
                      }
                      onMove={(dir) => void movePoolItem(g, idx, dir)}
                    />
                  ))}
                  {canManage &&
                    (addingTo === g.key ? (
                      <input
                        autoFocus
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onBlur={() => submitAdd(g)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void submitAdd(g);
                          if (e.key === "Escape") {
                            setAddingTo(null);
                            setDraft("");
                          }
                        }}
                        placeholder="Task label…"
                        className="h-8 w-full rounded-md border border-[var(--sb-projects-accent-border)] bg-[var(--ios-background-secondary)] px-2 text-[11px] outline-none"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setAddingTo(g.key);
                          setDraft("");
                        }}
                        className="inline-flex items-center gap-1 rounded-md border border-dashed border-[var(--sb-projects-accent-border)] px-2 py-1 text-[11px] font-medium text-[var(--sb-projects-accent)]"
                      >
                        <Plus size={11} /> pool task
                      </button>
                    ))}
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-1.5">
                  {g.items.map((d) => (
                    <span
                      key={d.id}
                      className="inline-flex items-center gap-1 rounded-md border border-[var(--sb-settings-border-paper)] bg-[var(--ios-background-secondary)] px-2 py-1 text-[11px] text-[var(--ios-label)]"
                    >
                      {d.title}
                      {canManage && (
                        <button
                          type="button"
                          onClick={() => deleteDefault.mutate(d.id)}
                          className="text-[var(--ios-label-quaternary)] hover:text-[var(--sb-projects-overdue)]"
                          aria-label={`Remove ${d.title}`}
                        >
                          <X size={11} />
                        </button>
                      )}
                    </span>
                  ))}
                  {canManage &&
                    (addingTo === g.key ? (
                      <input
                        autoFocus
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onBlur={() => submitAdd(g)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void submitAdd(g);
                          if (e.key === "Escape") {
                            setAddingTo(null);
                            setDraft("");
                          }
                        }}
                        placeholder="Task label…"
                        className="h-7 w-[140px] rounded-md border border-[var(--sb-projects-accent-border)] bg-[var(--ios-background-secondary)] px-2 text-[11px] outline-none"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setAddingTo(g.key);
                          setDraft("");
                        }}
                        className="inline-flex items-center gap-1 rounded-md border border-dashed border-[var(--sb-projects-accent-border)] px-2 py-1 text-[11px] font-medium text-[var(--sb-projects-accent)]"
                      >
                        <Plus size={11} /> task
                      </button>
                    ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
