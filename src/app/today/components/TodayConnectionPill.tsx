"use client";

import { useEffect, useState } from "react";
import { formatLocalDateISO } from "@/lib/shiftbuilder/dateUtils";
import { liveAssignmentsStore } from "@/lib/shiftbuilder/liveCache";

type PillState = "live" | "syncing" | "offline";

function resolvePillState(dateKey: string): PillState {
  const conn = liveAssignmentsStore.getState().connectionStatus[dateKey];
  const global = (window as typeof window & { __realtimeState?: string }).__realtimeState;

  if (conn === "connected" || global === "LIVE") return "live";
  if (conn === "error" || conn === "disconnected" || global === "OFFLINE") return "offline";
  return "syncing";
}

const PILL_META: Record<PillState, { label: string; color: string }> = {
  live: { label: "Live", color: "#22c55e" },
  syncing: { label: "Syncing", color: "#eab308" },
  offline: { label: "Offline", color: "#ef4444" },
};

/** Compact realtime health indicator for the /today nav (Builder OpsStatusBar parity). */
export function TodayConnectionPill({ date }: { date: Date }) {
  const dateKey = formatLocalDateISO(date);
  const [state, setState] = useState<PillState>("syncing");

  useEffect(() => {
    const sync = () => setState(resolvePillState(dateKey));
    sync();
    const unsub = liveAssignmentsStore.subscribe(sync);
    const interval = window.setInterval(sync, 3000);
    return () => {
      unsub();
      window.clearInterval(interval);
    };
  }, [dateKey]);

  const meta = PILL_META[state];

  return (
    <span
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[#6C6C72]"
      title={`Realtime: ${meta.label}`}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: meta.color, boxShadow: `0 0 4px ${meta.color}` }}
        aria-hidden
      />
      <span className="hidden sm:inline">{meta.label}</span>
    </span>
  );
}