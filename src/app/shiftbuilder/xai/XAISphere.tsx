"use client";

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { BuilderStatusDot } from "../components/builderPrimitives";

/**
 * XAISphere — The Master Ops AI Agent surface ("xAI Sphere")
 *
 * Phase 1 (this increment):
 *   - Beautiful collapsed affordance on the right, above the status pill.
 *   - Real Supabase wiring: on first open for a given week, we create or fetch
 *     a persistent `agent_threads` row (see migration 20260522).
 *   - Shows a live "Supabase" indicator once the thread is confirmed.
 *   - Still no Grok calls or messages — just durable thread presence.
 *
 * Future phases:
 *   - Message history persisted in agent_messages.
 *   - Rich operational context + the hardened grokClient.
 *   - Agent memory, proposals that feed Draft Mode, etc.
 */

interface XAISphereProps {
  /** Whether the sphere panel is currently expanded */
  open: boolean;
  /** Toggle the panel */
  onToggle: () => void;
  /** Current GRAVE week (Friday) — used to scope the persistent thread */
  weekStart?: Date;
}

export function XAISphere({ open, onToggle, weekStart }: XAISphereProps) {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [isPersisting, setIsPersisting] = useState(false);
  const [persistError, setPersistError] = useState<string | null>(null);

  // Ensure (or create) a persistent agent thread for this week when the panel opens.
  // This is the first real Supabase integration for the Master Ops Agent.
  useEffect(() => {
    if (!open) return;

    const ensureThread = async () => {
      setIsPersisting(true);
      setPersistError(null);

      try {
        const weekStr = weekStart
          ? weekStart.toISOString().slice(0, 10)
          : new Date().toISOString().slice(0, 10);

        // 1. Try to find an existing thread for this week
        const { data: existing, error: selectErr } = await supabase
          .from("agent_threads")
          .select("id, updated_at")
          .eq("week_start", weekStr)
          .order("last_message_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (selectErr) throw selectErr;

        if (existing?.id) {
          setThreadId(existing.id);
          return;
        }

        // 2. No thread yet — create one (user_id nullable in the dev migration)
        const { data: inserted, error: insertErr } = await supabase
          .from("agent_threads")
          .insert({
            week_start: weekStr,
            user_id: null, // dev sessions; will become real user_id later
            title: "GRAVE Ops Session",
          })
          .select("id")
          .single();

        if (insertErr) throw insertErr;

        if (inserted?.id) {
          setThreadId(inserted.id);
        }
      } catch (err: any) {
        console.warn("[XAISphere] Thread persistence issue (non-fatal in Phase 1):", err?.message || err);
        setPersistError(err?.message || "Could not reach Supabase");
      } finally {
        setIsPersisting(false);
      }
    };

    ensureThread();
  }, [open, weekStart]);
  return (
    <>
      {/* ============================================================
          COLLAPSED SPHERE — the always-visible "xAI" affordance
          Positioned on the right, comfortably above the status pill.
          Compact, elegant, and unmistakably AI without being loud.
          ============================================================ */}
      <button
        onClick={onToggle}
        aria-label={open ? "Close Master Ops Agent" : "Open Master Ops Agent"}
        title={
          open
            ? "Close the Master Operational AI"
            : "Open the Master Ops AI Agent — persistent operational co-pilot (Supabase-backed)"
        }
        className="sb-interactive sb-glass-pill fixed bottom-16 right-3 z-[55] flex items-center gap-2 h-9 pl-2.5 pr-3 rounded-full border border-white/60 shadow-lg shadow-black/10 text-[12px] font-medium text-[#1C1C1E] select-none"
        style={{
          background: "rgba(255,255,255,0.92)",
          backdropFilter: "blur(20px) saturate(160%)",
          WebkitBackdropFilter: "blur(20px) saturate(160%)",
        }}
      >
        {/* Subtle xAI / spark visual — keep it minimal and premium */}
        <div className="flex items-center justify-center w-5 h-5 rounded-full bg-gradient-to-br from-[var(--ios-blue)] via-[#5E5CE6] to-[#AF52DE] text-white shadow-inner">
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
        </div>

        <span className="tracking-[-0.1px]">xAI</span>

        {/* Tiny live indicator dot (will become meaningful in later phases) */}
        <BuilderStatusDot state={isPersisting ? "connecting" : threadId ? "live" : persistError ? "offline" : "syncing"} />
      </button>

      {/* ============================================================
          EXPANDED PANEL — the actual conversation surface
          For Phase 1 this is a beautiful empty shell.
          Real chat, history, and intelligence arrive in Phase 2.
          ============================================================ */}
      {open && (
        <div
          className="sb-pad-enter sb-glass-pill fixed bottom-[72px] right-3 z-[65] w-[320px] rounded-2xl border border-white/60 bg-white/95 shadow-2xl shadow-black/15 overflow-hidden flex flex-col"
          style={{
            backdropFilter: "blur(24px) saturate(180%)",
            WebkitBackdropFilter: "blur(24px) saturate(180%)",
            height: "min(420px, 65vh)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 h-12 border-b border-white/60 bg-white/60">
            <div className="flex items-center gap-2.5">
              <div className="flex items-center justify-center w-6 h-6 rounded-full bg-gradient-to-br from-[var(--ios-blue)] via-[#5E5CE6] to-[#AF52DE] text-white shadow-sm">
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                </svg>
              </div>
              <div>
                <div className="text-[13px] font-semibold tracking-[-0.2px] text-[#1C1C1E]">
                  Master Ops Agent
                </div>
                <div className="text-[10px] text-[#6C6C72] -mt-0.5 flex items-center gap-1.5">
                  Persistent • Supabase-native
                  {/* Live persistence indicator */}
                  {isPersisting && (
                    <span className="sb-loading-line !mt-0 inline-flex items-center text-[10px] text-[var(--ios-blue)]" aria-busy="true">
                      Connecting<span className="sb-loading-dots" aria-hidden="true" />
                    </span>
                  )}
                  {!isPersisting && threadId && (
                    <span className="inline-flex items-center gap-1 text-[var(--ios-green)] font-medium">
                      <span className="w-1 h-1 rounded-full bg-[var(--ios-green)]" /> thread live
                    </span>
                  )}
                  {persistError && (
                    <span className="text-[var(--ios-orange)] text-[9px]">local only</span>
                  )}
                </div>
              </div>
            </div>

            <button
              onClick={onToggle}
              className="sb-interactive w-7 h-7 rounded-full flex items-center justify-center text-[#6B7280] hover:text-[#1C1C1E] hover:bg-black/5 active:bg-black/10"
              aria-label="Close"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Body — Phase 1 placeholder (thread is now real) */}
          <div className="flex-1 overflow-y-auto p-4 text-[13px] text-[#3C3C43] space-y-3">
            <div className="text-[#6C6C72] text-[12px] leading-relaxed">
              This is the Master Operational AI for the GRAVE operation.
              It will remember who is where, notes, tasks, fairness patterns,
              and the full longitudinal context — all stored in Supabase.
            </div>

            {threadId && (
              <div className="text-[11px] text-[var(--ios-green)] font-medium">
                ✓ Thread persisted in Supabase for this GRAVE week.
              </div>
            )}
            {persistError && (
              <div className="text-[11px] text-[var(--ios-orange)]">
                Persistence temporarily unavailable — running locally for now.
              </div>
            )}

            <div className="pt-2 border-t border-white/60 text-[11.5px] text-[#8E8E93]">
              Phase 1 — durable thread shell complete. Messages + intelligence next.
            </div>

            {/* Fake conversation hint (visual only) */}
            <div className="mt-4 space-y-2 opacity-60">
              <div className="text-[11px] font-medium text-[#1C1C1E]">You</div>
              <div className="text-[12.5px] bg-white/70 border border-white/60 rounded-xl px-3 py-2">
                Who has been on RR the most this window?
              </div>

              <div className="text-[11px] font-medium text-[#1C1C1E] pt-1">Master Agent</div>
              <div className="text-[12.5px] bg-[var(--ios-background-secondary)] rounded-xl px-3 py-2">
                Based on the current assignments and the last 9 nights of data...
              </div>
            </div>
          </div>

          {/* Footer / input area (non-functional in Phase 1) */}
          <div className="border-t border-white/60 p-3 bg-white/50">
            <div className="flex items-center gap-2 rounded-xl border border-white/60 bg-white px-3 py-2 text-[12px] text-[#9CA3AF]">
              <span>Type a question…</span>
              <span className="ml-auto text-[10px] tracking-widest">COMING SOON</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default XAISphere;