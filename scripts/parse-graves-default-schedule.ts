/**
 * Parser for "Graves Initial TM Schedule.csv"
 *
 * This script turns the user's provided static weekly schedule into a clean,
 * importable structure for the new TM Default Weekly Schedule system.
 *
 * Run with: npx tsx scripts/parse-graves-default-schedule.ts
 */

import fs from "fs";
import path from "path";

export interface WeeklyShift {
  dayIndex: number;           // 0-6 (order from the CSV)
  rawValue: string;
  isOff: boolean;
  startTime?: string;         // "21:00"
  endTime?: string;           // "07:00"
  durationHours?: number;
  label: string;              // Human friendly: "Full Grave 9p-7a", "PM Overlap 11p-7a", "OFF"
}

export interface ParsedTM {
  firstName: string;
  lastName: string;
  fullName: string;
  weeklyPattern: WeeklyShift[];   // Always 7 entries
  weeklyHours: number;
  rawRow: string[];
}

/**
 * The columns that actually contain schedule data in this particular CSV export.
 * Confirmed via multiple inspections.
 */
const SCHEDULE_COLS = [5, 7, 8, 9, 10, 11, 12];

function normalizeTime(raw: string): { startTime?: string; endTime?: string; durationHours?: number; label: string; isOff?: boolean } {
  const trimmed = raw.trim().toUpperCase();

  if (!trimmed || trimmed === 'OFF' || trimmed === '') {
    return { isOff: true, label: 'OFF' };
  }

  // Match patterns like "9:00P - 7:00A" or "11:00P - 6:45A"
  const match = trimmed.match(/(\d{1,2}):(\d{2})([AP])\s*-\s*(\d{1,2}):(\d{2})([AP])/);
  if (!match) {
    return { label: raw };
  }

  let [, sh, sm, sMer, eh, em, eMer] = match;

  let startH = parseInt(sh, 10);
  let endH = parseInt(eh, 10);

  if (sMer === 'P' && startH !== 12) startH += 12;
  if (sMer === 'A' && startH === 12) startH = 0;
  if (eMer === 'P' && endH !== 12) endH += 12;
  if (eMer === 'A' && endH === 12) endH = 0;

  const startTime = `${startH.toString().padStart(2, '0')}:${sm}`;
  const endTime = `${endH.toString().padStart(2, '0')}:${em}`;

  // Simple overnight duration calculation
  let duration = endH + (endH < startH ? 24 : 0) - startH;
  if (duration <= 0) duration += 24;

  let label = 'Grave';
  if (startH >= 23 || startH < 2) label = 'PM Overlap / Late Grave';
  else if (startH >= 20) label = 'Full Grave';

  return {
    startTime,
    endTime,
    durationHours: Math.round(duration * 100) / 100,
    label,
  };
}

export function parseGravesDefaultSchedule(
  filePath?: string,
): ParsedTM[] {
  const resolved =
    filePath ||
    process.env.GRAVES_CSV_PATH ||
    path.join(__dirname, "../data/graves-initial-tm-schedule.csv");
  const content = fs.readFileSync(resolved, "utf8");
  const lines = content.trim().split(/\r?\n/);

  const results: ParsedTM[] = [];

  for (let i = 2; i < lines.length; i++) { // skip header rows
    const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));

    const first = cols[2];
    const last = cols[3];
    if (!first || !last) continue;

    const scheduleValues = SCHEDULE_COLS.map(idx => cols[idx] || 'OFF');

    const weeklyPattern: WeeklyShift[] = scheduleValues.map((val, dayIndex) => {
      const norm = normalizeTime(val);
      return {
        dayIndex,
        rawValue: val,
        isOff: norm.label === 'OFF',
        startTime: norm.startTime,
        endTime: norm.endTime,
        durationHours: norm.durationHours,
        label: norm.label,
      };
    });

    const hours = parseFloat(cols[13] || '0');

    results.push({
      firstName: first,
      lastName: last,
      fullName: `${first} ${last}`,
      weeklyPattern,
      weeklyHours: hours,
      rawRow: cols,
    });
  }

  return results;
}

// If run directly, pretty-print a summary
if (require.main === module) {
  const tms = parseGravesDefaultSchedule();
  console.log(`Parsed ${tms.length} Grave Team Members\n`);

  console.log("=== Sample (first 4) ===");
  tms.slice(0, 4).forEach(tm => {
    console.log(`\n${tm.fullName} (${tm.weeklyHours} hrs/wk)`);
    tm.weeklyPattern.forEach(p => {
      const time = p.isOff ? 'OFF' : `${p.startTime}-${p.endTime}`;
      console.log(`  Day ${p.dayIndex}: ${time.padEnd(13)} (${p.label})`);
    });
  });

  console.log("\n\nFull data also available via import.");
}