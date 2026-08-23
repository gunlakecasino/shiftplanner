"use client";

import React, { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Plus, X } from "lucide-react";
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
  WEEKDAY_SHORT,
} from "@/lib/shiftbuilder/rotation/overlapPoolSelect";
import {
  useCreateSlotDefault,
  useDeleteSlotDefault,
  useSlotDefaults,
  useUpdateSlotDefault,
} from "../hooks/useOverlapDefaults";

function slotLabel(slotKey: string, rrSide: string | null): string {
  const side = rrSide === "mens" ? " (Men's)" : rrSide === "womens" ? " (Women's)" : "";
  if (slotKey.startsWith("zone_")) return `Zone ${slotKey.slice(5)}`;
  if (slotKey.startsWith("rr_")) return `Restroom ${slotKey.slice(3).replace(/_/g, "+")}${side}`;
  return slotKey.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) + side;
}

interface SlotGroup {
  key: string;
  slotKey: string;
  slotType: string;
  rrSide: string | null;
  label: string;
  items: WorkItem[];
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
      next = [d];
    } else if (days.includes(d)) {
      next = days.filter((x) => x !== d);
    } else {
      next = [...days, d].sort((a, b) => a - b);
    }
    onPatch({
      recurrenceDays: next.length === 0 || next.length === 7 ? null : next,
    });
  };

  return (
    <div className="rounded-lg border border-[var(--ios-gray-5)] bg-[var(--ios-background-secondary)] px-2.5 py-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-medium text-[var(--ios-label)]">{item.title}</div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {canManage ? (
              <button
                type="button"
                onClick={() => onPatch({ priority: nextPriority(priority) })}
                className="rounded border border-[var(--ios-gray-5)] px-1.5 py-0.5 text-[10px] text-[var(--ios-label-secondary)]"
                title="Cycle priority"
              >
                {priority}
              </button>
            ) : (
              <span className="text-[10px] text-[var(--ios-label-tertiary)]">{priority}</span>
            )}
            {WEEKDAY_SHORT.map((label, d) => {
              const on = everyNight || days.includes(d);
              return (
                <button
                  key={`${label}-${d}`}
                  type="button"
                  disabled={!canManage}
                  onClick={() => toggleDay(d)}
                  className={`h-5 w-5 rounded text-[9px] font-semibold ${
                    on
                      ? "bg-[var(--ios-label)] text-[var(--ios-background)]"
                      : "text-[var(--ios-label-quaternary)]"
                  }`}
                >
                  {label}
                </button>
              );
            })}
            <span className="ml-0.5 text-[9px] text-[var(--ios-label-quaternary)]">
              {formatRecurrenceDaysLabel(item.recurrenceDays)}
            </span>
          </div>
        </div>
        {canManage && (
          <div className="flex shrink-0 flex-col items-center gap-0.5">
            <button
              type="button"
              disabled={isFirst}
              onClick={() => onMove(-1)}
              className="text-[var(--ios-label-tertiary)] disabled:opacity-30"
              aria-label="Move up"
            >
              <ChevronUp size={13} />
            </button>
            <button
              type="button"
              disabled={isLast}
              onClick={() => onMove(1)}
              className="text-[var(--ios-label-tertiary)] disabled:opacity-30"
              aria-label="Move down"
            >
              <ChevronDown size={13} />
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="text-[var(--ios-label-quaternary)]"
              aria-label={`Remove ${item.title}`}
            >
              <X size={12} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function OverlapPoolDefaultsPanel({ canManage }: { canManage: boolean }) {
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

  const submitAdd = async (g: SlotGroup) => {
    const title = draft.trim();
    if (!title) {
      setAddingTo(null);
      return;
    }
    const slotKey = g.isOverlapPool ? canonicalizeDefaultSlotKey(g.slotKey) : g.slotKey;
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
    const aOrd = a.poolSortOrder ?? index;
    const bOrd = b.poolSortOrder ?? j;
    await Promise.all([
      updateDefault.mutateAsync({ id: a.id, patch: { poolSortOrder: bOrd } }),
      updateDefault.mutateAsync({ id: b.id, patch: { poolSortOrder: aOrd } }),
    ]);
  };

  return (
    <section className="space-y-3 border-t border-[var(--ios-gray-5)] pt-5">
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ios-label-tertiary)]">
          Standing tasks
        </div>
        <p className="mt-1.5 text-[12px] leading-snug text-[var(--ios-label-tertiary)]">
          Zone, restroom, and AUX chips seed those cards on a new grave night.
          AM / PM overlap pools feed Apply Overlap Tasks for staffed seats — not empty cards.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-1.5">
          {[0, 1].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-[var(--ios-gray-6)]" />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {groups.map((g) => (
            <div key={g.key} className="rounded-xl border border-[var(--ios-gray-5)] px-3 py-2.5">
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <span className="text-[12px] font-semibold text-[var(--ios-label)]">{g.label}</span>
                <span className="text-[10px] tabular-nums text-[var(--ios-label-quaternary)]">
                  {g.items.length}
                </span>
              </div>
              {g.isOverlapPool && (
                <p className="mb-1.5 text-[10.5px] leading-snug text-[var(--ios-label-quaternary)]">
                  {OVERLAP_POOL_BLURB}
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
                      onPatch={(patch) => updateDefault.mutate({ id: d.id, patch })}
                      onMove={(dir) => void movePoolItem(g, idx, dir)}
                    />
                  ))}
                  {canManage &&
                    (addingTo === g.key ? (
                      <input
                        autoFocus
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onBlur={() => void submitAdd(g)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void submitAdd(g);
                          if (e.key === "Escape") {
                            setAddingTo(null);
                            setDraft("");
                          }
                        }}
                        placeholder="Task label…"
                        className="h-8 w-full rounded-md border border-[var(--ios-gray-5)] bg-[var(--ios-background-secondary)] px-2 text-[11px] outline-none"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setAddingTo(g.key);
                          setDraft("");
                        }}
                        className="inline-flex items-center gap-1 rounded-md border border-dashed border-[var(--ios-gray-4)] px-2 py-1 text-[11px] text-[var(--ios-label-secondary)]"
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
                      className="inline-flex items-center gap-1 rounded-md border border-[var(--ios-gray-5)] bg-[var(--ios-background-secondary)] px-2 py-1 text-[11px] text-[var(--ios-label)]"
                    >
                      {d.title}
                      {canManage && (
                        <button
                          type="button"
                          onClick={() => deleteDefault.mutate(d.id)}
                          className="text-[var(--ios-label-quaternary)]"
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
                        onBlur={() => void submitAdd(g)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void submitAdd(g);
                          if (e.key === "Escape") {
                            setAddingTo(null);
                            setDraft("");
                          }
                        }}
                        placeholder="Task label…"
                        className="h-7 w-[140px] rounded-md border border-[var(--ios-gray-5)] bg-[var(--ios-background-secondary)] px-2 text-[11px] outline-none"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setAddingTo(g.key);
                          setDraft("");
                        }}
                        className="inline-flex items-center gap-1 rounded-md border border-dashed border-[var(--ios-gray-4)] px-2 py-1 text-[11px] text-[var(--ios-label-secondary)]"
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
    </section>
  );
}
