"use client";

import type { DeploymentLogEntry } from "../lib/types";
import {
  describeLogEntry,
  formatLogTimestamp,
  logActionColor,
  logActionLabel,
} from "../lib/formatLogEntry";

type LogsTimelineProps = {
  entries: DeploymentLogEntry[];
  loading?: boolean;
  nightLabel: string;
  operatorFilter: string | null;
};

export function LogsTimeline({
  entries,
  loading = false,
  nightLabel,
  operatorFilter,
}: LogsTimelineProps) {
  if (loading) {
    return (
      <div className="mx-auto w-full max-w-2xl space-y-3 px-4 py-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-16 animate-pulse rounded-2xl border border-black/6 bg-white/60"
          />
        ))}
      </div>
    );
  }

  if (!entries.length) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-16 text-center">
        <div className="max-w-sm rounded-2xl border border-black/8 bg-white/80 px-6 py-8 shadow-sm backdrop-blur-md">
          <p className="text-sm font-semibold text-[#1C1C1E]">No changes recorded</p>
          <p className="mt-2 text-xs leading-relaxed text-[#6C6C72]">
            {operatorFilter
              ? `${operatorFilter} has no logged edits for ${nightLabel}.`
              : `No placement or schedule edits were logged for ${nightLabel} on Shift Builder or the Zone Deployment Board.`}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-4 pb-8">
      <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.3px] text-[#6C6C72]">
        {entries.length} change{entries.length === 1 ? "" : "s"}
        {operatorFilter ? ` · ${operatorFilter}` : ""}
      </p>
      <ul className="space-y-2">
        {entries.map((entry) => (
          <li
            key={entry.id}
            className="rounded-2xl border border-black/8 bg-white/85 px-4 py-3 shadow-sm backdrop-blur-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.35px] text-white"
                    style={{ background: logActionColor(entry.action) }}
                  >
                    {logActionLabel(entry.action)}
                  </span>
                  <span className="truncate text-sm font-semibold text-[#1C1C1E]">
                    {entry.operatorName}
                  </span>
                </div>
                <p className="mt-1 text-sm text-[#3C3C43]">{describeLogEntry(entry)}</p>
                {entry.slotKey !== "__meta__" ? (
                  <p className="mt-0.5 font-mono text-[11px] text-[#8E8E93]">{entry.slotKey}</p>
                ) : null}
              </div>
              <time
                className="shrink-0 text-[11px] tabular-nums text-[#8E8E93]"
                dateTime={entry.createdAt}
              >
                {formatLogTimestamp(entry.createdAt)}
              </time>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}