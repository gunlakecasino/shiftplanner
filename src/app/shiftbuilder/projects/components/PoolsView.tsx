"use client";

import React, { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Layers, Plus, Trash2, Shuffle } from "lucide-react";
import type { DistributionMode } from "@/lib/tasks/types";
import { usePools } from "../hooks/useProjectsData";
import { useCreatePool, useDeletePool, useDistributePool } from "../hooks/useTaskMutations";
import { EmptyState } from "./EmptyState";

const MODE_LABEL: Record<DistributionMode, string> = {
  round_robin: "Round-robin",
  random: "Random",
  manual: "Manual",
};

export function PoolsView({ canManage }: { canManage: boolean }) {
  const { data: pools = [], isLoading } = usePools();
  const distribute = useDistributePool();
  const deletePool = useDeletePool();
  const [showForm, setShowForm] = useState(false);
  const [flash, setFlash] = useState<{ poolId: string; text: string } | null>(null);

  const runDistribute = async (poolId: string) => {
    const res = await distribute.mutateAsync(poolId);
    setFlash({ poolId, text: res.message ?? `Distributed ${res.distributed} task${res.distributed === 1 ? "" : "s"}` });
    setTimeout(() => setFlash(null), 4000);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[11.5px] text-[var(--ios-label-tertiary)]">
          Group tasks into a pool, then spread them across the roster in one action.
        </p>
        {canManage && (
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-semibold"
            style={{ background: "var(--sb-projects-accent)", color: "white" }}
          >
            <Plus size={14} strokeWidth={2.4} />
            {showForm ? "Close" : "New pool"}
          </button>
        )}
      </div>

      <AnimatePresence initial={false}>
        {showForm && canManage && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            style={{ overflow: "hidden" }}
          >
            <NewPoolForm onDone={() => setShowForm(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      {isLoading ? (
        <div className="space-y-1.5">
          {[0, 1].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-[var(--ios-gray-6)]" />
          ))}
        </div>
      ) : pools.length === 0 ? (
        <EmptyState
          title="No pools yet"
          subtitle="A pool is a set of tasks distributed across people — like the AM overlap rotation. Create one above."
        />
      ) : (
        <div className="space-y-2">
          {pools.map((p) => (
            <div key={p.id} className="sb-projects-card flex items-center gap-3 px-3 py-2.5">
              <Layers size={15} className="shrink-0 text-[var(--sb-projects-accent)]" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium text-[var(--ios-label)]">{p.name}</div>
                <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-[var(--ios-label-tertiary)]">
                  <span>{MODE_LABEL[p.distributionMode]}</span>
                  <span>· {p.taskCounts.open} open / {p.taskCounts.total} tasks</span>
                  {flash?.poolId === p.id && (
                    <span className="text-[var(--sb-projects-done)]">· {flash.text}</span>
                  )}
                </div>
              </div>
              {canManage && (
                <>
                  <button
                    type="button"
                    onClick={() => void runDistribute(p.id)}
                    disabled={distribute.isPending || p.distributionMode === "manual" || p.taskCounts.open === 0}
                    title={
                      p.distributionMode === "manual"
                        ? "Manual pools are assigned by hand"
                        : "Spread this pool's open tasks across the roster"
                    }
                    className="flex shrink-0 items-center gap-1 rounded-md border border-[var(--sb-projects-accent-border)] px-2 py-1 text-[10.5px] font-medium text-[var(--sb-projects-accent)] disabled:opacity-40"
                  >
                    <Shuffle size={12} />
                    Distribute
                  </button>
                  <button
                    type="button"
                    onClick={() => deletePool.mutate(p.id)}
                    title="Delete pool (tasks are kept, just unpooled)"
                    className="shrink-0 text-[var(--ios-label-quaternary)] hover:text-[var(--sb-projects-overdue)]"
                  >
                    <Trash2 size={14} />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NewPoolForm({ onDone }: { onDone: () => void }) {
  const createPool = useCreatePool();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [mode, setMode] = useState<DistributionMode>("round_robin");

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    await createPool.mutateAsync({ name: trimmed, description: description.trim() || undefined, distributionMode: mode });
    onDone();
  };

  return (
    <div className="sb-projects-card space-y-3 p-3">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Pool name (e.g. AM Overlap Rotation)…"
        className="w-full rounded-md border border-[var(--sb-settings-border-paper)] bg-[var(--ios-background-secondary)] px-2.5 py-2 text-[13px] font-medium outline-none focus:border-[var(--sb-projects-accent)]"
      />
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)…"
        className="w-full rounded-md border border-[var(--sb-settings-border-paper)] bg-[var(--ios-background-secondary)] px-2.5 py-1.5 text-[12px] outline-none focus:border-[var(--sb-projects-accent)]"
      />
      <div className="flex flex-wrap items-center gap-1.5">
        {(["round_robin", "random", "manual"] as DistributionMode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className="rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors"
            style={{
              background: mode === m ? "var(--sb-projects-accent)" : "var(--ios-gray-6)",
              color: mode === m ? "white" : "var(--ios-label-secondary)",
            }}
          >
            {MODE_LABEL[m]}
          </button>
        ))}
      </div>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onDone}
          className="rounded-md px-3 py-1.5 text-[12px] text-[var(--ios-label-secondary)]"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!name.trim() || createPool.isPending}
          className="rounded-md px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40"
          style={{ background: "var(--sb-projects-accent)" }}
        >
          {createPool.isPending ? "Creating…" : "Create pool"}
        </button>
      </div>
    </div>
  );
}
