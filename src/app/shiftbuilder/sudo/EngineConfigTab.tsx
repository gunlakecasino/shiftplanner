"use client";

import React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { BuilderBusyLabel } from "../components/builderPrimitives";
import { SudoTabLoading } from "./SudoGlass";
import { sudoIosClasses } from "./sudoIosTheme";
import {
  getActiveEngineConfig,
  type EngineConfig,
  type PlacementMethod,
  type GrokReasoningEffort,
  type SignalOverride,
  type EligibilityRule,
  type FullyResolvedEngineConfig,
} from "@/lib/shiftbuilder/engineConfig";
import { getFullyResolvedEngineConfig } from "@/lib/shiftbuilder/engineOverrides";
// Server action imported at call time so SudoWindow does not pull placement → data.ts via sudoActions batch block.

interface EngineConfigTabProps {
  onDataChanged?: () => void;
  isDark?: boolean;
}

const PLACEMENT_OPTIONS: Array<{
  value: PlacementMethod;
  label: string;
  desc: string;
}> = [
  {
    value: "weighted",
    label: "Weighted (Default)",
    desc: "Deterministic scoring with tunable weights. Fast and fully predictable.",
  },
  {
    value: "grok-hybrid",
    label: "Grok-Hybrid",
    desc: "Deterministic Top-K + Grok 4.3 judgment layer. Best quality when context (notes, history, affinities) matters.",
  },
  {
    value: "greedy",
    label: "Greedy",
    desc: "Simple highest-score-first. Good for testing or very small crews.",
  },
];

const REASONING_OPTIONS: Array<{
  value: GrokReasoningEffort;
  label: string;
  desc: string;
  badge: string;
}> = [
  {
    value: "low",
    label: "Low",
    desc: "Minimal reasoning. Fastest responses, lowest token cost.",
    badge: "Fast",
  },
  {
    value: "medium",
    label: "Medium",
    desc: "Recommended. Strong judgment with good speed/quality balance.",
    badge: "Balanced",
  },
  {
    value: "high",
    label: "High",
    desc: "Maximum chain-of-thought. Highest quality overrides, higher latency & cost.",
    badge: "Deep",
  },
  {
    value: "none",
    label: "None",
    desc: "Disable reasoning entirely. Pure model output with no extra thinking tokens.",
    badge: "Raw",
  },
];

export function EngineConfigTab({ onDataChanged, isDark = false }: EngineConfigTabProps) {
  const ios = sudoIosClasses(isDark);
  const [config, setConfig] = React.useState<EngineConfig | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  // Local editing state
  const [placementMethod, setPlacementMethod] = React.useState<PlacementMethod>("weighted");
  const [grokReasoningEffort, setGrokReasoningEffort] =
    React.useState<GrokReasoningEffort>("medium");

  const loadConfig = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const active = await getActiveEngineConfig();
      setConfig(active);
      setPlacementMethod(active.placementMethod);
      setGrokReasoningEffort(active.grokReasoningEffort);
    } catch (e: any) {
      setError(e?.message || "Failed to load engine config");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const isGrokHybrid = placementMethod === "grok-hybrid";

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const { updateActiveEngineConfig } = await import("@/lib/shiftbuilder/sudoActions");
      await updateActiveEngineConfig({
        placementMethod,
        grokReasoningEffort: isGrokHybrid ? grokReasoningEffort : undefined,
      });

      setSuccess("Engine config updated. Changes will apply on the next engine run.");

      // Refresh the authoritative config from DB
      await loadConfig();

      // Notify parent (ShiftBuilderClient) so it can re-fetch engineConfig state
      onDataChanged?.();

      // Clear success after a moment
      setTimeout(() => setSuccess(null), 4000);
    } catch (e: any) {
      setError(e?.message || "Failed to save engine config");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <SudoTabLoading>Loading engine config</SudoTabLoading>
      </div>
    );
  }

  return (
    <div className={cn("h-full overflow-auto p-6", ios.page)} style={{ fontFamily: "var(--font-atkinson), var(--font-geist-sans)" }}>
      <div className="max-w-3xl">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-500/10 text-red-400">
            <span className="ms" style={{ fontSize: 18 }}>tune</span>
          </div>
          <div>
            <div className="font-semibold text-lg tracking-tight">Engine Configuration</div>
            <div className="text-[12px] text-zinc-500">
              Controls the placement algorithm and Grok 4.3 reasoning depth (when using Grok-Hybrid)
            </div>
          </div>
          <Link
            href="/shiftbuilder/ai"
            className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#C5A26F]/40 bg-[#C5A26F]/10 px-3 py-1 text-[11px] font-medium text-[#C5A26F] hover:bg-[#C5A26F]/15"
          >
            Engine AI Lab ↗
          </Link>
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-200">
            <span className="ms mt-0.5 shrink-0 text-red-400" style={{ fontSize: 16 }}>warning</span>
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="mb-4 rounded-lg border border-emerald-900/60 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-200">
            {success}
          </div>
        )}

        {/* Current row info */}
        {config && (
          <div className="mb-6 text-[11px] font-mono text-zinc-500">
            Active row: <span className="text-zinc-400">{config.id}</span> · created{" "}
            {new Date(config.createdAt).toLocaleDateString()}
            {config.notes && <span className="ml-2 text-zinc-600">· {config.notes}</span>}
          </div>
        )}

        {/* Placement Method */}
        <div className="mb-8">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.5px] text-zinc-400">
            Placement Method
          </div>

          <div className="grid gap-3">
            {PLACEMENT_OPTIONS.map((opt) => {
              const active = placementMethod === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => setPlacementMethod(opt.value)}
                  className={cn(
                    "sb-select-card sb-interactive text-left rounded-xl border px-4 py-3",
                    active
                      ? "border-red-500/50 bg-red-500/10 text-red-100"
                      : "border-zinc-800 bg-zinc-950 hover:border-zinc-700 hover:bg-zinc-900"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-[14px]">{opt.label}</div>
                    {active && <div className="text-[10px] text-red-400 font-mono">ACTIVE</div>}
                  </div>
                  <div className="mt-1 text-[12.5px] leading-snug text-zinc-400">{opt.desc}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* =====================================================================
            Phase 1 (2026-05-28) — Granular Engine UI
            Version selector (new version_name + is_preset + parent_id from migration),
            live Signal Override editor (writes to engine_signal_overrides),
            Eligibility Rules list, and TM Zone Matrix preview (from tm_zone_matrix).
            All changes are versioned and safe behind Draft Mode when applied.
            ===================================================================== */}
        <div className="mb-8 border-t border-zinc-800 pt-6">
          <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.5px] text-amber-400">
            <span className="ms" style={{ fontSize: 14 }}>tune</span>
            <span>Granular Overrides &amp; Versioning (Phase 1)</span>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-[13px]">
            <div className="mb-3 text-amber-300">Version History (parent_id chain + presets)</div>
            <div className="text-zinc-400 text-[12px]">
              Select or fork a version. New overrides create a child config. Presets are marked <span className="font-mono text-amber-400">is_preset</span>.
              (Full UI + write path to engine_config + engine_signal_overrides coming in next Sudo pass — currently shows the new types from getFullyResolvedEngineConfig.)
            </div>

            {/* Placeholder for version selector + override editor that will use the new normalized tables */}
            <div className="mt-4 text-[11px] text-zinc-500">
              • Active resolved version will appear here via <span className="font-mono">getFullyResolvedEngineConfig()</span><br />
              • Per-signal multipliers / disables (engine_signal_overrides)<br />
              • Custom eligibility rules (engine_eligibility_rules)<br />
              • Live TM Zone Matrix preview (tm_zone_matrix — 4w/8w counts per zone for fairness)
            </div>
          </div>
        </div>

        {/* Grok Reasoning Effort — only relevant for grok-hybrid */}
        <div className={cn("mb-8 transition-opacity", !isGrokHybrid && "opacity-50 pointer-events-none")}>
          <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.5px] text-zinc-400">
            <span className="ms" style={{ fontSize: 14 }}>psychology</span>
            <span>Grok 4.3 Reasoning Effort</span>
            {!isGrokHybrid && <span className="normal-case text-[10px] text-zinc-600">(only applies when Grok-Hybrid is selected)</span>}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {REASONING_OPTIONS.map((opt) => {
              const active = grokReasoningEffort === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => isGrokHybrid && setGrokReasoningEffort(opt.value)}
                  disabled={!isGrokHybrid}
                  className={cn(
                    "sb-select-card sb-interactive text-left rounded-xl border px-4 py-3",
                    active
                      ? "border-amber-500/60 bg-amber-500/10 text-amber-100"
                      : "border-zinc-800 bg-zinc-950 hover:border-zinc-700 hover:bg-zinc-900 disabled:opacity-60"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-[14px]">{opt.label}</div>
                    <div className="rounded bg-zinc-800 px-1.5 py-px text-[9px] font-mono tracking-wider text-amber-400">
                      {opt.badge}
                    </div>
                  </div>
                  <div className="mt-1 text-[12.5px] leading-snug text-zinc-400">{opt.desc}</div>
                </button>
              );
            })}
          </div>

          <div className="mt-3 text-[11px] text-zinc-500">
            Higher effort gives Grok more time to consider operator notes, call-offs, recent history, and pair dynamics before overriding the deterministic ranking.
          </div>
        </div>

        {/* Save */}
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className={cn(
              "sb-interactive inline-flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-black",
              saving && "opacity-70 cursor-wait"
            )}
          >
            {!saving && <span className="ms" style={{ fontSize: 16 }}>save</span>}
            {saving ? (
              <BuilderBusyLabel>Saving</BuilderBusyLabel>
            ) : (
              "Update Active Engine Config"
            )}
          </button>

          <button
            onClick={loadConfig}
            className="sb-interactive inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 px-4 py-2.5 text-sm text-zinc-300 hover:bg-zinc-900"
          >
            <span className="ms" style={{ fontSize: 16 }}>refresh</span> Reload
          </button>
        </div>

        <div className="mt-6 text-[11px] text-zinc-500 leading-relaxed">
          Changes take effect the next time you run the placement engine (or switch to Grok-Hybrid mode).
          The live sheet does not auto-recompute when you save — click “Run Engine” again to see the new behavior.
        </div>

        {config?.placementMethod === "grok-hybrid" && (
          <div className="mt-4 rounded-md border border-amber-900/40 bg-amber-950/20 p-3 text-[11px] text-amber-300">
            Grok-Hybrid is currently active. The reasoning effort above will be used on the next engine run.
          </div>
        )}
      </div>
    </div>
  );
}
