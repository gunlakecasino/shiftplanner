/**
 * engineConfig.server.ts — admin/service-role resolver for Apply hard-gate paths.
 *
 * KD-5: never use browser `@/lib/supabase` (anon) loaders here. Anon cannot read
 * engine_eligibility_rules reliably; fail-soft FALLBACK_CONFIG would silently
 * treat "rules unavailable" as "no rules."
 *
 * Fail closed on: missing admin client, query error, or no usable active config.
 * Empty eligibilityRules after a successful admin read is OK.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClientSafe } from "@/app/api/admin/_lib/createAdminClient";
import type {
  EligibilityRule,
  EngineConfig,
  FullyResolvedEngineConfig,
  GrokReasoningEffort,
  PlacementMethod,
  SignalOverride,
} from "./engineConfig";
import { DEFAULT_GROK_REASONING_EFFORT, resolvedWeights } from "./engineConfig";

export class EngineConfigLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EngineConfigLoadError";
  }
}

function requireAdmin(): SupabaseClient {
  const client = createAdminClientSafe();
  if (!client) {
    throw new EngineConfigLoadError("Eligibility service unavailable");
  }
  return client;
}

function mapRowToEngineConfig(row: Record<string, unknown>): EngineConfig {
  const method = String(row.placement_method ?? "weighted");
  const reasoning = String(row.grok_reasoning_effort ?? DEFAULT_GROK_REASONING_EFFORT);
  const validReasoning: GrokReasoningEffort = (
    ["none", "low", "medium", "high"].includes(reasoning)
      ? reasoning
      : DEFAULT_GROK_REASONING_EFFORT
  ) as GrokReasoningEffort;

  return {
    id: String(row.id),
    isActive: !!row.is_active,
    versionName: (row.version_name as string | null) ?? null,
    description: (row.description as string | null) ?? null,
    parentId: (row.parent_id as string | null) ?? null,
    isPreset: !!row.is_preset,
    weights: (row.weights as EngineConfig["weights"]) ?? {},
    thresholds: (row.thresholds as EngineConfig["thresholds"]) ?? {},
    slotPriority: (row.slot_priority as Record<string, number>) ?? {},
    placementMethod: (
      ["greedy", "weighted", "grok-hybrid"].includes(method) ? method : "weighted"
    ) as PlacementMethod,
    grokReasoningEffort: validReasoning,
    notes: (row.notes as string | null) ?? null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: row.updated_at != null ? String(row.updated_at) : undefined,
    createdBy: (row.created_by as string | null) ?? null,
  };
}

function mapRowToSignalOverride(row: Record<string, unknown>): SignalOverride {
  return {
    id: String(row.id),
    configId: String(row.config_id),
    signalName: String(row.signal_name),
    overrideType: row.override_type as SignalOverride["overrideType"],
    value: (row.value as number | null) ?? null,
    priority: Number(row.priority ?? 0),
    isActive: !!row.is_active,
    notes: (row.notes as string | null) ?? null,
  };
}

function mapRowToEligibilityRule(row: Record<string, unknown>): EligibilityRule {
  return {
    id: String(row.id),
    configId: String(row.config_id),
    ruleName: String(row.rule_name),
    ruleType: String(row.rule_type),
    description: (row.description as string | null) ?? null,
    condition: (row.condition as Record<string, unknown>) ?? {},
    priority: Number(row.priority ?? 0),
    isActive: !!row.is_active,
  };
}

/** Pure — same semantics as engineOverrides.applyOverridesToWeights. */
function applyOverridesToWeightsLocal(
  baseWeights: EngineConfig["weights"],
  overrides: SignalOverride[],
): ReturnType<typeof resolvedWeights> {
  const result = {
    ...resolvedWeights({ weights: baseWeights } as EngineConfig),
  } as ReturnType<typeof resolvedWeights>;

  const sorted = [...overrides]
    .filter((o) => o.isActive)
    .sort((a, b) => a.priority - b.priority);

  for (const ov of sorted) {
    const key = ov.signalName as keyof typeof result;
    if (!(key in result)) continue;
    if (ov.overrideType === "disabled") {
      (result as Record<string, number>)[key] = 0.01;
      continue;
    }
    if (ov.overrideType === "absolute" && typeof ov.value === "number") {
      (result as Record<string, number>)[key] = ov.value;
    } else if (ov.overrideType === "multiplier" && typeof ov.value === "number") {
      (result as Record<string, number>)[key] =
        ((result as Record<string, number>)[key] ?? 1) * ov.value;
    }
  }
  return result;
}

async function loadBaseConfig(
  client: SupabaseClient,
  configId?: string,
): Promise<EngineConfig> {
  const selectCols =
    "id, is_active, version_name, description, parent_id, is_preset, " +
    "weights, thresholds, slot_priority, placement_method, grok_reasoning_effort, " +
    "notes, created_at, updated_at, created_by";

  if (configId) {
    const { data, error } = await client
      .from("engine_config")
      .select(selectCols)
      .eq("id", configId)
      .maybeSingle();
    if (error) {
      throw new EngineConfigLoadError(`Eligibility config unavailable: ${error.message}`);
    }
    if (!data) {
      throw new EngineConfigLoadError("Eligibility config unavailable: config not found");
    }
    return mapRowToEngineConfig(data as unknown as Record<string, unknown>);
  }

  const { data, error } = await client
    .from("engine_config")
    .select(selectCols)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    throw new EngineConfigLoadError(`Eligibility config unavailable: ${error.message}`);
  }
  if (!data || data.length === 0) {
    throw new EngineConfigLoadError("Eligibility config unavailable: no active config");
  }
  return mapRowToEngineConfig(data[0] as unknown as Record<string, unknown>);
}

async function fetchSignalOverrides(
  client: SupabaseClient,
  configId: string,
): Promise<SignalOverride[]> {
  const { data, error } = await client
    .from("engine_signal_overrides")
    .select("*")
    .eq("config_id", configId)
    .eq("is_active", true)
    .order("priority", { ascending: true });

  if (error) {
    throw new EngineConfigLoadError(
      `Eligibility config unavailable: signal overrides load failed (${error.message})`,
    );
  }
  return (data || []).map((r) => mapRowToSignalOverride(r as Record<string, unknown>));
}

async function fetchEligibilityRules(
  client: SupabaseClient,
  configId: string,
): Promise<EligibilityRule[]> {
  const { data, error } = await client
    .from("engine_eligibility_rules")
    .select("*")
    .eq("config_id", configId)
    .eq("is_active", true)
    .order("priority", { ascending: true });

  if (error) {
    throw new EngineConfigLoadError(
      `Eligibility config unavailable: rules load failed (${error.message})`,
    );
  }
  return (data || []).map((r) => mapRowToEligibilityRule(r as Record<string, unknown>));
}

/**
 * Fully resolved engine config via service-role client only.
 * Throws EngineConfigLoadError on admin missing / query failure / no usable row.
 * Does NOT return FALLBACK_CONFIG.
 */
export async function getFullyResolvedEngineConfigServer(
  configId?: string,
): Promise<FullyResolvedEngineConfig> {
  const client = requireAdmin();
  const base = await loadBaseConfig(client, configId);
  const [signalOverrides, eligibilityRules] = await Promise.all([
    fetchSignalOverrides(client, base.id),
    fetchEligibilityRules(client, base.id),
  ]);
  const finalWeights = applyOverridesToWeightsLocal(base.weights, signalOverrides);

  return {
    ...base,
    weights: finalWeights,
    signalOverrides,
    eligibilityRules,
    isPreset: base.isPreset,
  };
}
