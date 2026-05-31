/**
 * Import script: Graves Initial TM Schedule → tm_default_schedules
 *
 * This is the bridge from the user's provided static roster file
 * into the new static, repeating default weekly schedule system.
 *
 * Philosophy (per user request):
 * - Every active Grave TM gets a repeating 7-day default pattern.
 * - The pattern repeats every week forever (unless changed).
 * - Exceptions (PTO, LOA, MDL, etc.) continue to live in night_tm_status.
 *
 * Usage (once the table exists):
 *   npx tsx scripts/import-graves-default-schedules.ts --dry-run
 *   npx tsx scripts/import-graves-default-schedules.ts
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing Supabase credentials in environment");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

interface WeeklyShift {
  startTime: string | null;   // "21:00" or null for OFF
  endTime: string | null;
  label?: string;             // "Full Grave 9p-7a", "PM Overlap 11p-7a", "OFF"
}

type WeeklyPattern = WeeklyShift[]; // length 7

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  console.log("=== Graves Default Schedule Importer ===\n");
  console.log(dryRun ? "DRY RUN MODE - no writes will occur\n" : "LIVE MODE\n");

  // 1. Parse the CSV (reuse logic or call the parser)
  const csvPath = '/Users/briankillian/Downloads/Graves Initial TM Schedule.csv';
  const rawTMs = parseGravesCSV(csvPath);

  console.log(`Parsed ${rawTMs.length} TMs from CSV`);

  // 2. Get current active grave TMs from DB for matching (schema-aware)
  const { data: tmProfiles, error } = await supabase
    .from('tm_profiles')
    .select('id, full_name, display_name, employee_name, grave_pool, active')
    .eq('active', true)
    .not('grave_pool', 'is', null);

  if (error) throw error;

  console.log(`Found ${tmProfiles.length} active grave-eligible TMs in DB`);

  // 3. Match by name (case-insensitive, fuzzy on last name + first initial)
  const matched: Array<{ tm: any; csv: any; pattern: WeeklyPattern }> = [];
  const unmatched: any[] = [];

  // Helper: normalize a DB name row into first/last for fuzzy matching
  function getDbNameParts(dbTm: any): { first: string; last: string; full: string } {
    const full = (dbTm.full_name || dbTm.employee_name || dbTm.display_name || '').trim();
    const parts = full.split(/\s+/);
    const last = parts.length > 1 ? parts.pop()! : parts[0] || '';
    const first = parts.join(' ');
    return { first: first.toLowerCase(), last: last.toLowerCase(), full: full.toLowerCase() };
  }

  for (const csvTm of rawTMs) {
    const csvFirst = csvTm.firstName.toLowerCase();
    const csvLast = csvTm.lastName.toLowerCase();
    const csvFull = csvTm.fullName.toLowerCase();

    const match = tmProfiles.find(dbTm => {
      const p = getDbNameParts(dbTm);
      // Exact first+last
      if (p.first === csvFirst && p.last === csvLast) return true;
      // Full name contains both parts
      if (p.full.includes(csvFirst) && p.full.includes(csvLast)) return true;
      // Last name + first initial
      if (p.last === csvLast && p.first.startsWith(csvFirst[0])) return true;
      return false;
    });

    if (match) {
      const pattern = convertCSVScheduleToPattern(csvTm.schedule);
      matched.push({ tm: match, csv: csvTm, pattern });
    } else {
      unmatched.push(csvTm);
    }
  }

  console.log(`\nMatched: ${matched.length}`);
  console.log(`Unmatched from CSV: ${unmatched.length}`);
  if (unmatched.length > 0) {
    console.log("Unmatched names:", unmatched.map(u => u.fullName));
  }

  // 4. For each match, upsert into tm_default_schedules
  let created = 0;
  let updated = 0;

  for (const m of matched) {
    const payload = {
      tm_id: m.tm.id,
      effective_from: '2024-01-01', // or current date, or let user set
      weekly_pattern: m.pattern,
      source: 'graves-initial-import',
      notes: `Imported from "Graves Initial TM Schedule.csv" - ${m.csv.weeklyHours} hrs/week`,
    };

    if (dryRun) {
      const display = m.tm.full_name || m.tm.employee_name || m.tm.display_name || `${m.tm.first_name || ''} ${m.tm.last_name || ''}`.trim();
      console.log(`[DRY] Would set default for ${display}`);
      continue;
    }

    const { error: upsertErr } = await supabase
      .from('tm_default_schedules')
      .upsert(payload, { onConflict: 'tm_id,effective_from' });

    if (upsertErr) {
      console.error(`Failed for ${m.tm.first_name} ${m.tm.last_name}:`, upsertErr.message);
    } else {
      created++;
    }
  }

  console.log(`\nDone. ${created} defaults created/updated.`);
}

function parseGravesCSV(filePath: string) {
  // Simplified version of the parser script
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.trim().split(/\r?\n/);
  const results: any[] = [];

  for (let i = 2; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
    const first = cols[2];
    const last = cols[3];
    if (!first || !last) continue;

    const scheduleCols = [5,7,8,9,10,11,12].map(i => cols[i] || 'OFF');

    results.push({
      firstName: first,
      lastName: last,
      fullName: `${first} ${last}`,
      schedule: scheduleCols,
      weeklyHours: parseFloat(cols[13] || '0'),
    });
  }
  return results;
}

function convertCSVScheduleToPattern(schedule: string[]): WeeklyPattern {
  return schedule.map((raw, dayIndex) => {
    const trimmed = raw.trim().toUpperCase();
    if (!trimmed || trimmed === 'OFF') {
      return { startTime: null, endTime: null, label: 'OFF' };
    }

    // Parse "9:00P - 7:00A" etc.
    const match = trimmed.match(/(\d{1,2}):(\d{2})([AP])\s*-\s*(\d{1,2}):(\d{2})([AP])/);
    if (!match) {
      return { startTime: null, endTime: null, label: raw };
    }

    let [_, sh, sm, sMer, eh, em, eMer] = match;
    let startH = parseInt(sh);
    let endH = parseInt(eh);

    if (sMer === 'P' && startH !== 12) startH += 12;
    if (sMer === 'A' && startH === 12) startH = 0;
    if (eMer === 'P' && endH !== 12) endH += 12;
    if (eMer === 'A' && endH === 12) endH = 0;

    const startTime = `${startH.toString().padStart(2,'0')}:${sm}`;
    const endTime = `${endH.toString().padStart(2,'0')}:${em}`;

    let label = 'Grave';
    if (startH >= 23 || startH <= 1) label = 'PM Overlap / Late Grave';
    else if (startH >= 20) label = 'Full Grave';

    return { startTime, endTime, label };
  });
}

main().catch(console.error);