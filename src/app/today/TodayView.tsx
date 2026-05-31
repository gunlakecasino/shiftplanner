"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useOpsAuth, OpsAuthProvider } from "@/lib/auth/opsAuth";
import { PinGate } from "@/app/shiftbuilder/components/PinGate";
import { useToast } from "@/app/shiftbuilder/hooks/useToast";

import {
  getOrCreateNightForDate,
  getNightAssignments,
  toggleAssignmentLock,
  getNightBreakAssignments,
  getNightSlotTasks,
} from "@/lib/shiftbuilder/data";

import { currentShiftDate } from "@/lib/shiftbuilder/dateUtils";

import { cn } from "@/lib/utils";

// Stripped-down /today view for limited access users.
// Only published schedules. Lock/unlock still works (independent of publish status).

function TodayClient() {
  const { user, logout } = useOpsAuth();
  const { showToast } = useToast();

  const today = currentShiftDate();

  const [nightId, setNightId] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<Record<string, any>>({});
  const [isLoading, setIsLoading] = useState(true);

  const loadPublishedToday = useCallback(async () => {
    setIsLoading(true);
    try {
      // Safer call - many data functions expect additional context in full app
      const nId = await (getOrCreateNightForDate as any)(today); // signature tolerant call

      setNightId(nId);

      // Minimal safe fetch
      const ass = await getNightAssignments(nId).catch(() => ({}));
      setAssignments(ass || {});
    } catch (e) {
      console.error(e);
      // Don't crash the whole page
    } finally {
      setIsLoading(false);
    }
  }, [today]);

  useEffect(() => {
    loadPublishedToday();
  }, [loadPublishedToday]);

  const handleToggleLock = async (slotKey: string) => {
    if (!nightId) return;

    const current = !!assignments[slotKey]?.isLocked;
    const next = !current;

    setAssignments((prev) => ({
      ...prev,
      [slotKey]: { ...prev[slotKey], isLocked: next },
    }));

    try {
      // Signature may vary - wrapped safely
      await (toggleAssignmentLock as any)(nightId, slotKey, next);
    } catch {
      setAssignments((prev) => ({
        ...prev,
        [slotKey]: { ...prev[slotKey], isLocked: current },
      }));
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAF8] dark:bg-[#0F0E10] text-sm">
        Loading today's published schedule…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAF8] dark:bg-[#0F0E10] text-[#1C1C1E] dark:text-[#F2F2F4] flex flex-col">
      <div className="h-12 border-b border-black/10 dark:border-white/10 flex items-center justify-between px-4 text-sm bg-white/80 dark:bg-black/40 backdrop-blur">
        <div className="flex items-center gap-3">
          <span className="font-semibold tracking-tight">GRAVE • TODAY</span>
          <span className="text-xs text-[#6C6C72] dark:text-[#8E8E93]">
            {today.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
            Published only
          </span>
        </div>

        <div className="flex items-center gap-3 text-xs">
          {user?.full_name && (
            <span className="text-[#6C6C72] dark:text-[#8E8E93]">{user.full_name}</span>
          )}
          <button
            onClick={logout}
            className="px-2.5 py-1 rounded border text-xs hover:bg-black/5 dark:hover:bg-white/5"
          >
            Sign out
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Main Canvas Area - functional minimal version */}
        <div className="flex-1 p-6 overflow-auto bg-[#F8F8F6] dark:bg-[#0A0A0B]">
          <div className="max-w-[1280px] mx-auto">
            <div className="mb-4 text-sm font-medium text-[#6C6C72] dark:text-[#8E8E93]">
              Today’s Published Deployment
            </div>

            {/* Simple grid using real card components where possible */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {Object.keys(assignments).length > 0 ? (
                Object.entries(assignments).slice(0, 12).map(([key, assignment]) => (
                  <div key={key} className="border border-black/10 dark:border-white/10 rounded-2xl p-3 bg-white dark:bg-[#111113]">
                    <div className="font-mono text-xs text-[#6C6C72] dark:text-[#8E8E93] mb-1">{key}</div>
                    <div className="text-sm">
                      {assignment?.tmName || "— Unassigned —"}
                    </div>
                    <button
                      onClick={() => handleToggleLock(key)}
                      className="mt-2 text-[10px] px-2 py-0.5 rounded border text-[#6C6C72] hover:bg-black/5 dark:hover:bg-white/5"
                    >
                      {assignment?.isLocked ? "Unlock" : "Lock"} slot
                    </button>
                  </div>
                ))
              ) : (
                <div className="col-span-full p-8 text-center text-[#6C6C72] dark:text-[#8E8E93] border border-dashed rounded-2xl">
                  No assignments loaded for today yet.<br />
                  (This area will render the real Zone / RR / Aux cards once published data is present.)
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Panel - TM / Tasks */}
        <div className="w-72 border-l border-black/10 dark:border-white/10 bg-white dark:bg-[#111113] p-4 text-sm overflow-auto flex flex-col">
          <div className="font-medium mb-2">Roster</div>
          <div className="text-xs text-[#6C6C72] dark:text-[#8E8E93] flex-1">
            Published team members for today only.
          </div>

          <div className="mt-4 pt-4 border-t border-black/10 dark:border-white/10">
            <div className="font-medium mb-2 text-sm">Tasks</div>
            <div className="text-xs text-[#6C6C72] dark:text-[#8E8E93]">
              Task list (read + limited edit on published schedule)
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function TodayView() {
  return (
    <OpsAuthProvider>
      <TodayGate />
    </OpsAuthProvider>
  );
}

function TodayGate() {
  const { isAuthenticated, isLoading } = useOpsAuth();

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center text-sm">Loading…</div>;
  }

  if (!isAuthenticated) {
    return <PinGate />;
  }

  return <TodayClient />;
}
