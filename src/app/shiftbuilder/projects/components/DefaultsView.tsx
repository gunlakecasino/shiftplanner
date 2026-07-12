"use client";

import React, { useMemo, useState } from "react";
import { LayoutGrid, Plus, X } from "lucide-react";
import type { WorkItem } from "@/lib/tasks/types";
import {
  canonicalizeDefaultSlotKey,
  canonicalOverlapPoolSlotKey,
  overlapPoolBand,
  OVERLAP_POOL_BLURB,
  overlapPoolGroupKey,
  overlapPoolLabel,
  type OverlapPoolBand,
} from "@/lib/shiftbuilder/overlapPoolDefaults";
import { useSlotDefaults } from "../hooks/useProjectsData";
import { useCreateSlotDefault, useDeleteSlotDefault } from "../hooks/useTaskMutations";
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

export function DefaultsView({ canManage }: { canManage: boolean }) {
  const { data: defaults = [], isLoading } = useSlotDefaults();
  const createDefault = useCreateSlotDefault();
  const deleteDefault = useDeleteSlotDefault();
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const groups = useMemo<SlotGroup[]>(() => {
    const map = new Map<string, SlotGroup>();
    // Always surface band pool shells so operators can add the first pool task.
    map.set(overlapPoolGroupKey("am"), emptyPoolGroup("am"));
    map.set(overlapPoolGroupKey("pm"), emptyPoolGroup("pm"));

    for (const d of defaults) {
      const slotKey = d.slotKey ?? "";
      const rrSide = d.rrSide ?? null;
      const band = overlapPoolBand(slotKey);
      if (band) {
        // Union read: any overlap_am_* / overlap_pm_* lands in the band pool card.
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

    const pools = [map.get(overlapPoolGroupKey("am"))!, map.get(overlapPoolGroupKey("pm"))!];
    const others = [...map.values()]
      .filter((g) => !g.isOverlapPool)
      .sort((a, b) => a.slotKey.localeCompare(b.slotKey) || a.label.localeCompare(b.label));
    // Non-overlap slots first (zones/RR/AUX), then AM / PM pool cards.
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
    // Pool creates always write to canonical overlap_*_0 (never scatter to _1…_5).
    const slotKey = g.isOverlapPool
      ? canonicalizeDefaultSlotKey(g.slotKey)
      : g.slotKey;
    await createDefault.mutateAsync({
      title,
      slotKey,
      slotType: g.slotType,
      rrSide: g.rrSide,
    });
    setDraft("");
    setAddingTo(null);
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
          feed <span className="font-medium text-[var(--ios-label-secondary)]">Apply Overlap Tasks</span>{" "}
          — standing tasks for <em>staffed</em> overlap seats only. They are not fixed per-card night
          seeds and are not auto-painted onto empty OL cards on night create.
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
                  {OVERLAP_POOL_BLURB}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-1.5">
                {g.items.map((d) => (
                  <span
                    key={d.id}
                    className="inline-flex items-center gap-1 rounded-md border border-[var(--sb-settings-border-paper)] bg-[var(--ios-background-secondary)] px-2 py-1 text-[11px] text-[var(--ios-label)]"
                    title={
                      g.isOverlapPool && d.slotKey && d.slotKey !== g.slotKey
                        ? `Stored on ${d.slotKey} (union read)`
                        : undefined
                    }
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
