/**
 * One-time / periodic backfill of tm_placement_history + tm_zone_matrix
 * from live zone_assignments × nights (authoritative board history).
 *
 * Usage (service role required):
 *   npx tsx scripts/backfill-tm-zone-matrix.ts --dry-run
 *   npx tsx scripts/backfill-tm-zone-matrix.ts --lookback-weeks=12
 *   npx tsx scripts/backfill-tm-zone-matrix.ts --matrix-only
 *   npx tsx scripts/backfill-tm-zone-matrix.ts --history-only
 *
 * Default: rewrite history for nights in lookback, then rebuild matrix for all TMs seen.
 *
 * Safety:
 *   - Requires SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_… variant)
 *   - --dry-run prints counts without writes
 *   - History rewrite is scoped to nights in the lookback window only
 *   - Overlap slots are skipped (same as getTmPlacementHistory)
 */

import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { dbToUi } from "../src/lib/shiftbuilder/slot-keys";
import {
  aggregateZoneMatrixFromHistory,
  placedAtFromNightDate,
} from "../src/lib/shiftbuilder/rotation/matrixRebuild";

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq);
    const value = trimmed
      .slice(eq + 1)
      .replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvLocal();

function parseArgs(argv: string[]) {
  const dryRun = argv.includes("--dry-run");
  const matrixOnly = argv.includes("--matrix-only");
  const historyOnly = argv.includes("--history-only");
  let lookbackWeeks = 12;
  for (const a of argv) {
    const m = a.match(/^--lookback-weeks=(\d+)$/);
    if (m) lookbackWeeks = Math.max(1, parseInt(m[1], 10));
  }
  if (matrixOnly && historyOnly) {
    console.error("Use only one of --matrix-only or --history-only");
    process.exit(1);
  }
  return { dryRun, matrixOnly, historyOnly, lookbackWeeks };
}

function isoDateDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const { dryRun, matrixOnly, historyOnly, lookbackWeeks } = parseArgs(process.argv.slice(2));

  const url =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error(
      "Missing Supabase credentials (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)",
    );
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const fromDate = isoDateDaysAgo(lookbackWeeks * 7);
  console.log(
    `[backfill] lookback=${lookbackWeeks}w from=${fromDate} dryRun=${dryRun} matrixOnly=${matrixOnly} historyOnly=${historyOnly}`,
  );

  const { data: nights, error: nightErr } = await supabase
    .from("nights")
    .select("id, night_date")
    .gte("night_date", fromDate)
    .order("night_date", { ascending: true });

  if (nightErr) throw nightErr;
  if (!nights?.length) {
    console.log("[backfill] no nights in window — nothing to do");
    return;
  }

  const nightIdToDate = new Map<string, string>();
  for (const n of nights as Array<{ id: string; night_date: string }>) {
    nightIdToDate.set(n.id, String(n.night_date).slice(0, 10));
  }
  const nightIds = [...nightIdToDate.keys()];
  console.log(`[backfill] nights in window: ${nightIds.length}`);

  // Paginate zone_assignments (can be large)
  type ZaRow = {
    night_id: string;
    slot_key: string;
    slot_type: string;
    rr_side: string | null;
    tm_id: string;
  };
  const assignments: ZaRow[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("zone_assignments")
      .select("night_id, slot_key, slot_type, rr_side, tm_id")
      .in("night_id", nightIds)
      .not("tm_id", "is", null)
      .not("slot_type", "eq", "overlap")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const batch = (data as ZaRow[]) ?? [];
    assignments.push(...batch);
    if (batch.length < pageSize) break;
  }
  console.log(`[backfill] zone_assignments rows: ${assignments.length}`);

  type HistRow = {
    tm_id: string;
    night_id: string;
    slot_key: string;
    slot_type: string;
    rr_side: string | null;
    placed_at: string;
    is_committed: true;
  };

  const historyRows: HistRow[] = [];
  let skippedUnk = 0;
  for (const row of assignments) {
    if (!row.tm_id || !row.night_id) continue;
    const nightDate = nightIdToDate.get(row.night_id);
    if (!nightDate) continue;
    let ui: string;
    try {
      ui = dbToUi(row.slot_key, row.slot_type ?? "zone", row.rr_side ?? null);
    } catch {
      skippedUnk += 1;
      continue;
    }
    if (ui.startsWith("UNK:")) {
      skippedUnk += 1;
      continue;
    }
    historyRows.push({
      tm_id: row.tm_id,
      night_id: row.night_id,
      slot_key: ui,
      slot_type: row.slot_type ?? "zone",
      rr_side: row.rr_side ?? null,
      placed_at: placedAtFromNightDate(nightDate),
      is_committed: true,
    });
  }
  console.log(
    `[backfill] history candidates: ${historyRows.length} (skipped UNK: ${skippedUnk})`,
  );

  const tmIds = [...new Set(historyRows.map((r) => r.tm_id))];
  console.log(`[backfill] distinct TMs: ${tmIds.length}`);

  // ── History rewrite for nights in window ─────────────────────────────
  if (!matrixOnly) {
    if (dryRun) {
      console.log(
        `[dry-run] would DELETE tm_placement_history for ${nightIds.length} nights, then INSERT ${historyRows.length} rows`,
      );
    } else {
      // Delete existing history for these nights (full rewrite of window)
      for (let i = 0; i < nightIds.length; i += 50) {
        const chunk = nightIds.slice(i, i + 50);
        const { error: delErr } = await supabase
          .from("tm_placement_history")
          .delete()
          .in("night_id", chunk);
        if (delErr) throw delErr;
      }
      console.log(`[backfill] cleared history for ${nightIds.length} nights`);

      // Insert in batches
      for (let i = 0; i < historyRows.length; i += 500) {
        const chunk = historyRows.slice(i, i + 500);
        const { error: insErr } = await supabase
          .from("tm_placement_history")
          .insert(chunk);
        if (insErr) throw insErr;
      }
      console.log(`[backfill] inserted ${historyRows.length} history rows`);
    }
  }

  // ── Matrix rebuild ───────────────────────────────────────────────────
  if (!historyOnly) {
    const now = new Date();
    // Prefer reading history from DB after write; for dry-run/matrix-only use synthesized or DB
    let rowsByTm = new Map<string, Array<{ slot_key: string; placed_at: string }>>();

    if (matrixOnly && !dryRun) {
      // Read existing history in lookback
      const cutoffIso = new Date(
        now.getTime() - lookbackWeeks * 7 * 86400 * 1000,
      ).toISOString();
      const { data: hist, error: hErr } = await supabase
        .from("tm_placement_history")
        .select("tm_id, slot_key, placed_at")
        .gte("placed_at", cutoffIso);
      if (hErr) throw hErr;
      for (const h of (hist ?? []) as Array<{
        tm_id: string;
        slot_key: string;
        placed_at: string;
      }>) {
        if (!rowsByTm.has(h.tm_id)) rowsByTm.set(h.tm_id, []);
        rowsByTm.get(h.tm_id)!.push({
          slot_key: h.slot_key,
          placed_at: h.placed_at,
        });
      }
    } else {
      for (const r of historyRows) {
        if (!rowsByTm.has(r.tm_id)) rowsByTm.set(r.tm_id, []);
        rowsByTm.get(r.tm_id)!.push({
          slot_key: r.slot_key,
          placed_at: r.placed_at,
        });
      }
    }

    // Also refresh TMs that may only exist in matrix (stale) when doing full rebuild from assignments
    const allTmIds = new Set(rowsByTm.keys());
    if (!dryRun && !matrixOnly) {
      // include TMs that had matrix rows but no longer appear — zero them
      const { data: matrixTms } = await supabase
        .from("tm_zone_matrix")
        .select("tm_id");
      for (const r of (matrixTms ?? []) as Array<{ tm_id: string }>) {
        if (r.tm_id) allTmIds.add(r.tm_id);
      }
    }

    let upserted = 0;
    let cleared = 0;

    for (const tmId of allTmIds) {
      const rows = rowsByTm.get(tmId) ?? [];
      const zoneCounts = aggregateZoneMatrixFromHistory(rows, now);

      if (dryRun) {
        if (zoneCounts.size === 0) cleared += 1;
        else upserted += zoneCounts.size;
        continue;
      }

      if (zoneCounts.size === 0) {
        const { error } = await supabase
          .from("tm_zone_matrix")
          .delete()
          .eq("tm_id", tmId);
        if (error) throw error;
        cleared += 1;
        continue;
      }

      const upserts = Array.from(zoneCounts.entries()).map(([zoneKey, rec]) => ({
        tm_id: tmId,
        zone_key: zoneKey,
        last_placed_at: rec.last,
        count_4w: rec.c4,
        count_8w: rec.c8,
        count_lifetime: rec.life,
        updated_at: now.toISOString(),
      }));

      const { error: upErr } = await supabase
        .from("tm_zone_matrix")
        .upsert(upserts, { onConflict: "tm_id,zone_key" });
      if (upErr) throw upErr;
      upserted += upserts.length;

      const { data: existing } = await supabase
        .from("tm_zone_matrix")
        .select("zone_key")
        .eq("tm_id", tmId);
      const keep = new Set(zoneCounts.keys());
      const orphans = (existing ?? [])
        .map((r: { zone_key?: string }) => r.zone_key)
        .filter(
          (k): k is string => typeof k === "string" && !!k && !keep.has(k),
        );
      if (orphans.length > 0) {
        const { error: oErr } = await supabase
          .from("tm_zone_matrix")
          .delete()
          .eq("tm_id", tmId)
          .in("zone_key", orphans);
        if (oErr) throw oErr;
      }
    }

    console.log(
      `[backfill] matrix ${dryRun ? "(dry-run) " : ""}upsert cells≈${upserted} TMs cleared/zeroed=${cleared} TMs processed=${allTmIds.size}`,
    );
  }

  console.log("[backfill] done");
}

main().catch((err) => {
  console.error("[backfill] failed", err);
  process.exit(1);
});
