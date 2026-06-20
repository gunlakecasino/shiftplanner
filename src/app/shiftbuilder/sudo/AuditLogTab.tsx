"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { SudoTabLoading } from "./SudoGlass";
import { sudoIosClasses } from "./sudoIosTheme";
import {
  ALL_DEPLOYMENT_LOG_ACTIONS,
  DEPLOYMENT_LOG_ACTION_LABELS,
  type DeploymentLogEntry,
  type DeploymentLogsResponse,
} from "@/lib/shiftbuilder/deploymentLogTypes";
import { formatLocalDateISO, currentShiftDate } from "@/lib/shiftbuilder/dateUtils";
import { slotKeyToLabel } from "@/lib/shiftbuilder/slot-keys";

const META_SLOT_KEY = "__meta__";

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function describeEntry(entry: DeploymentLogEntry): string {
  const actionLabel = DEPLOYMENT_LOG_ACTION_LABELS[entry.action] ?? entry.action;
  if (entry.slotKey === META_SLOT_KEY) {
    const tab = typeof entry.payload.tab === "string" ? entry.payload.tab : null;
    const source = typeof entry.payload.source === "string" ? entry.payload.source : null;
    if (tab) return `${actionLabel} — ${tab}`;
    if (source) return `${actionLabel} (${source})`;
    return actionLabel;
  }
  const slot = slotKeyToLabel(entry.slotKey);
  if (entry.newTmName) return `${actionLabel} — ${slot} → ${entry.newTmName}`;
  if (entry.previousTmName) return `${actionLabel} — ${slot} (${entry.previousTmName})`;
  return `${actionLabel} — ${slot}`;
}

export function AuditLogTab({ isDark = false }: { isDark?: boolean }) {
  const ios = sudoIosClasses(isDark);
  const [nightDate, setNightDate] = React.useState(() => formatLocalDateISO(currentShiftDate()));
  const [operator, setOperator] = React.useState("");
  const [action, setAction] = React.useState("");
  const [slotKey, setSlotKey] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [data, setData] = React.useState<DeploymentLogsResponse | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ nightDate, limit: "300" });
      if (operator.trim()) params.set("operator", operator.trim());
      if (action) params.set("action", action);
      if (slotKey.trim()) params.set("slotKey", slotKey.trim());
      const res = await fetch(`/api/logs/changes?${params.toString()}`, {
        credentials: "same-origin",
      });
      const json = (await res.json()) as DeploymentLogsResponse & { error?: string };
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setData(json);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to load audit log";
      setError(msg);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [nightDate, operator, action, slotKey]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const entries = data?.entries ?? [];
  const operators = data?.operators ?? [];

  return (
    <div className="space-y-4" data-theme={isDark ? "dark" : "light"}>
      <div className={ios.actionBar}>
        <div className="sb-settings-bleed-inner flex flex-wrap items-end gap-3">
          <FilterField label="Night date" isDark={isDark}>
            <input
              type="date"
              value={nightDate}
              onChange={(e) => setNightDate(e.target.value)}
              className={cn(ios.input, "px-2 py-1.5 text-[12px]")}
            />
          </FilterField>
          <FilterField label="Operator" isDark={isDark}>
            <select
              value={operator}
              onChange={(e) => setOperator(e.target.value)}
              className={cn(ios.input, "min-w-[140px] px-2 py-1.5 text-[12px]")}
            >
              <option value="">All operators</option>
              {operators.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Action" isDark={isDark}>
            <select
              value={action}
              onChange={(e) => setAction(e.target.value)}
              className={cn(ios.input, "min-w-[160px] px-2 py-1.5 text-[12px]")}
            >
              <option value="">All actions</option>
              {ALL_DEPLOYMENT_LOG_ACTIONS.map((a) => (
                <option key={a} value={a}>
                  {DEPLOYMENT_LOG_ACTION_LABELS[a]}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Slot key" isDark={isDark}>
            <input
              type="text"
              value={slotKey}
              onChange={(e) => setSlotKey(e.target.value)}
              placeholder="Z1, __meta__, …"
              className={cn(ios.input, "w-[120px] px-2 py-1.5 text-[12px]")}
            />
          </FilterField>
          <button
            type="button"
            onClick={() => void load()}
            className={cn(
              ios.ghostBtn,
              "rounded-lg border px-3 py-1.5",
              isDark ? "border-zinc-700" : "border-[var(--ios-gray-4)]",
            )}
          >
            Refresh
          </button>
          <div className={cn("ml-auto text-[11px] font-mono", ios.legend)}>
            {entries.length} entries
          </div>
        </div>
      </div>

      {loading ? (
        <SudoTabLoading>Loading audit log…</SudoTabLoading>
      ) : error ? (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-[13px] text-red-300">
          {error}
        </div>
      ) : entries.length === 0 ? (
        <div className="py-16 text-center text-[13px] text-[var(--ios-label-tertiary)]">
          No audit entries for this filter set.
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <div key={entry.id} className={ios.row}>
              <div className="min-w-[108px] shrink-0 font-mono text-[10px] text-[var(--ios-label-tertiary)]">
                {formatTimestamp(entry.createdAt)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium text-[var(--ios-label)]">
                  {describeEntry(entry)}
                </div>
                <div className="mt-0.5 text-[11px] text-[var(--ios-label-tertiary)]">
                  {entry.operatorName}
                  {entry.slotKey !== META_SLOT_KEY ? ` · ${entry.slotKey}` : ""}
                </div>
                {Object.keys(entry.payload).length > 0 && (
                  <pre className="mt-1 max-h-24 overflow-auto rounded bg-black/5 p-2 font-mono text-[10px] text-[var(--ios-label-secondary)]">
                    {JSON.stringify(entry.payload, null, 2)}
                  </pre>
                )}
              </div>
              <span className={ios.chip}>{DEPLOYMENT_LOG_ACTION_LABELS[entry.action]}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterField({
  label,
  isDark,
  children,
}: {
  label: string;
  isDark: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span
        className={cn(
          "text-[10px] font-semibold uppercase tracking-widest",
          isDark ? "text-zinc-500" : "text-[var(--ios-label-tertiary)]",
        )}
      >
        {label}
      </span>
      {children}
    </label>
  );
}