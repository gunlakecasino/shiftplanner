/**
 * Seed graves_default_schedule from Graves Initial TM Schedule.csv
 *
 *   npx tsx scripts/seed-graves-default-schedule.ts --dry-run
 *   npx tsx scripts/seed-graves-default-schedule.ts
 */

import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { parseGravesDefaultSchedule } from "./parse-graves-default-schedule";
import {
  EMPTY_GRAVES_DAYS,
  patternToDaysMap,
  type GravesBand,
} from "../src/lib/shiftbuilder/gravesDefaultSchedule";

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;

  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
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

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

function getDbNameParts(dbTm: {
  full_name?: string | null;
  employee_name?: string | null;
  display_name?: string | null;
}): { first: string; last: string; full: string } {
  const full = (dbTm.full_name || dbTm.employee_name || dbTm.display_name || "").trim();
  const parts = full.split(/\s+/);
  const last = parts.length > 1 ? parts.pop()! : parts[0] || "";
  const first = parts.join(" ");
  return { first: first.toLowerCase(), last: last.toLowerCase(), full: full.toLowerCase() };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("Missing Supabase credentials");
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const csvTms = parseGravesDefaultSchedule();
  console.log(`Parsed ${csvTms.length} TMs from CSV\n`);

  const { data: tmProfiles, error } = await supabase
    .from("tm_profiles")
    .select("id, full_name, display_name, employee_name, grave_pool, active")
    .eq("active", true)
    .not("grave_pool", "is", null);

  if (error) throw error;

  const matched: Array<{ tmId: string; name: string; days: ReturnType<typeof patternToDaysMap> }> = [];
  const unmatched: string[] = [];

  for (const csvTm of csvTms) {
    const csvFirst = csvTm.firstName.toLowerCase();
    const csvLast = csvTm.lastName.toLowerCase();

    const match = (tmProfiles || []).find((dbTm) => {
      const p = getDbNameParts(dbTm);
      if (p.first === csvFirst && p.last === csvLast) return true;
      if (p.full.includes(csvFirst) && p.full.includes(csvLast)) return true;
      if (p.last === csvLast && p.first.startsWith(csvFirst[0])) return true;
      return false;
    });

    if (match) {
      matched.push({
        tmId: match.id,
        name: match.display_name || match.full_name || csvTm.fullName,
        days: patternToDaysMap(csvTm.weeklyPattern),
      });
    } else {
      unmatched.push(csvTm.fullName);
    }
  }

  console.log(`Matched: ${matched.length}`);
  if (unmatched.length) {
    console.log("Unmatched:", unmatched.join(", "));
  }

  if (!dryRun) {
    for (const m of matched) {
      const { error: upErr } = await supabase.from("graves_default_schedule").upsert(
        { tm_id: m.tmId, band: "grave" as GravesBand, days: m.days },
        { onConflict: "tm_id,band" },
      );
      if (upErr) console.error(`Failed ${m.name}:`, upErr.message);
    }
  } else {
    matched.slice(0, 3).forEach((m) => console.log("[DRY]", m.name, m.days));
  }

  const { data: groups } = await supabase
    .from("tm_groups")
    .select("name, tm_group_members (tm_id)");

  const bandForGroup = (name: string): GravesBand | null => {
    const n = name.toLowerCase();
    if (n.includes("am overlap")) return "am_overlap";
    if (n.includes("pm overlap")) return "pm_overlap";
    return null;
  };

  const overlapUpserts: Array<{ tm_id: string; band: GravesBand; days: typeof EMPTY_GRAVES_DAYS }> = [];
  for (const g of groups || []) {
    const band = bandForGroup(g.name || "");
    if (!band) continue;
    for (const mem of g.tm_group_members || []) {
      overlapUpserts.push({
        tm_id: mem.tm_id,
        band,
        days: { ...EMPTY_GRAVES_DAYS },
      });
    }
  }

  if (!dryRun && overlapUpserts.length) {
    const { error: ovErr } = await supabase
      .from("graves_default_schedule")
      .upsert(overlapUpserts, { onConflict: "tm_id,band" });
    if (ovErr) console.error("Overlap seed error:", ovErr.message);
    else console.log(`Seeded ${overlapUpserts.length} overlap rows (all off).`);
  } else if (dryRun) {
    console.log(`[DRY] Would seed ${overlapUpserts.length} overlap rows (all off).`);
  }

  console.log(dryRun ? "\nDry run complete." : "\nSeed complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});