/**
 * @deprecated — This entire file is legacy ADP/Kronos Excel parsing from the old system.
 * The weekly roster is now 100% driven by tm_default_schedules + tm_on_call_schedules + tm_group_members.
 * Do not use or extend. Safe to delete when all call sites are gone.
 *
 * ADP schedule XLSX parser. (old)
 *
 * Takes an ADP / Kronos "Shifts and Pay Code Edits" export and produces a
 * structured (tmId, nightDate, shiftCode) result the sudo Schedules tab can
 * preview and apply to `night_tm_status`.
 *
 * Why this is fiddly: ADP exports vary in shape. Different pay periods may
 * lay out their week differently; some have explicit dates in headers, some
 * just weekday names. The parser:
 *   1. Loads the workbook
 *   2. Finds the data sheet (first non-empty sheet)
 *   3. Auto-detects the header row + the date columns
 *   4. Maps TM names to tm_ids by fuzzy match against the active roster
 *   5. Returns matched rows + unmatched-rows-as-warnings so the operator
 *      can confirm before applying
 *
 * The operator confirms the parsed grid in the SchedulesTab UI before any
 * DB writes happen.
 */

// @deprecated — ADP XLSX parsing is no longer used. The weekly roster is now driven by
// tm_default_schedules + tm_on_call_schedules + tm_group_members.
// This import is kept only for historical reference and can be removed.
import * as XLSX from "xlsx"; // LEGACY - safe to delete once all callers are gone
import type { TeamMember } from "./data";

// =====================================================================
// Types
// =====================================================================

export type ShiftStatus = "scheduled" | "off" | "unknown";

export interface ParsedScheduleCell {
  /** Original cell value as a string ("G11", "OFF", "8.5", etc.) */
  rawValue: string;
  /** Our interpretation of whether this TM is working that day */
  status: ShiftStatus;
}

/** Which shift bucket this sheet feeds into. */
export type SheetKind = "days" | "swings" | "graves" | "unknown";

export interface ParsedScheduleRow {
  /** The name string from the XLSX, raw */
  rawName: string;
  /** Resolved tm_id if we matched, else null */
  tmId: string | null;
  /** How we matched: 'exact' (display_name), 'full' (full_name), 'fuzzy' (close prefix), 'unmatched' */
  matchKind: "exact" | "full" | "fuzzy" | "unmatched" | "ignored";
  /** Per-date cells, keyed by ISO yyyy-mm-dd */
  cells: Record<string, ParsedScheduleCell>;
  /** Source sheet name (when aggregated from multiple sheets) */
  sourceSheet?: string;
  /** Classification of the source sheet — used by the apply filter */
  sourceSheetKind?: SheetKind;
}

export interface ParsedSchedule {
  /** Workbook name / source file (passed through from caller) */
  sourceFile: string;
  /** All sheet names available in the workbook (Day / Swings / Graves etc.) */
  availableSheets: string[];
  /** The sheet we actually parsed */
  selectedSheet: string;
  /** The header row index detected (0-based) */
  headerRowIndex: number;
  /** Column index → ISO date the parser inferred from headers */
  dateColumns: Array<{ colIndex: number; iso: string; rawHeader: string }>;
  /** Parsed TM rows */
  rows: ParsedScheduleRow[];
  /** Things the operator should know but aren't fatal */
  warnings: string[];
  /** Counts for the preview summary */
  stats: {
    totalRows: number;
    matchedRows: number;
    unmatchedRows: number;
    scheduledCells: number;
    dateRange: { first: string; last: string } | null;
  };
}

// =====================================================================
// Public API
// =====================================================================

/**
 * Parse an XLSX File (from a drag-drop) into a structured schedule.
 * Caller passes the active roster so we can fuzzy-match TM names to ids.
 */
export async function parseADPScheduleFile(
  file: File,
  roster: TeamMember[],
  sheetName?: string
): Promise<ParsedSchedule> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  return parseWorkbook(workbook, file.name, roster, sheetName);
}

/**
 * Classify a sheet name as one of the known shift buckets. ADP exports
 * for Brian's department lay out as Day / Swings / Graves — these names
 * may be slightly different across files ("Day Shift", "Swing", etc.),
 * so we match permissively.
 */
export function classifySheet(name: string): SheetKind {
  const n = name.toLowerCase();
  if (/grav/.test(n)) return "graves";
  if (/swing/.test(n)) return "swings";
  if (/day|am/.test(n)) return "days";
  return "unknown";
}

/**
 * Parse every relevant sheet (Days, Swings, Graves) and return one merged
 * ParsedSchedule. Each row carries its `sourceSheet` and `sourceSheetKind`
 * so the apply step can filter by (sheet, tm.gravePool) correlation:
 *   Days  → only TMs with gravePool='AM' (AM overlaps live in this sheet)
 *   Swings → only TMs with gravePool='PM' (PM overlaps live here)
 *   Graves → any TM with a gravePool value (the full grave roster)
 */
export function parseWorkbookAggregate(
  workbook: any, // populated after lazy XLSX load in caller
  sourceFile: string,
  roster: TeamMember[]
): ParsedSchedule {
  const sheetNames = workbook.SheetNames;
  // Build a name → kind lookup. First try semantic classification by name
  // (/grav/, /swing/, /day|am/). If NO sheet matches, fall back to
  // positional classification — Brian's ADP exports often have generic
  // names ("Sheet1", "Sheet2", "Sheet3") and the canonical layout is
  // Sheet1=Day, Sheet2=Swings, Sheet3=Graves.
  const kindByName = new Map<string, SheetKind>();
  sheetNames.forEach((n: string) => kindByName.set(n, classifySheet(n)));
  const anyRecognized = Array.from(kindByName.values()).some((k) => k !== "unknown");
  if (!anyRecognized) {
    // Positional fallback. Map by position to the canonical layout.
    const positional: SheetKind[] = ["days", "swings", "graves"];
    sheetNames.forEach((n: string, i: number) => {
      if (i < positional.length) {
        kindByName.set(n, positional[i]);
      } else {
        // Extra sheets after position 3 — treat as graves (operator can
        // always Unapply and re-upload if this is wrong).
        kindByName.set(n, "graves");
      }
    });
  }

  // Parse each sheet that we can classify and tag the rows.
  const perSheet: ParsedSchedule[] = [];
  const warnings: string[] = [];
  let combinedDateColumns: ParsedSchedule["dateColumns"] = [];

  for (const name of sheetNames) {
    const kind = kindByName.get(name) ?? "unknown";
    if (kind === "unknown") continue;
    const single = parseWorkbook(workbook, sourceFile, roster, name);
    if (single.headerRowIndex < 0) {
      warnings.push(`Skipped sheet "${name}" — no header row found`);
      continue;
    }
    // Tag rows with source.
    single.rows.forEach((r) => {
      r.sourceSheet = name;
      r.sourceSheetKind = kind;
    });
    perSheet.push(single);

    // Merge date columns across sheets (use the union; preferring earliest
    // discovery order — sheets typically share the same week).
    single.dateColumns.forEach((c) => {
      if (!combinedDateColumns.find((existing) => existing.iso === c.iso)) {
        combinedDateColumns.push(c);
      }
    });
  }
  combinedDateColumns.sort((a, b) => a.iso.localeCompare(b.iso));

  if (perSheet.length === 0) {
    return emptyResult(sourceFile, sheetNames, "No recognized sheets (Days / Swings / Graves)");
  }

  // Concat rows; row.tmId may repeat (same TM listed in multiple sheets),
  // which is fine — the upsert dedupe at apply time handles that.
  const allRows = perSheet.flatMap((p) => p.rows);
  perSheet.forEach((p) => warnings.push(...p.warnings));

  // Re-compute stats across all sheets
  let scheduledCells = 0;
  let firstIso: string | null = null;
  let lastIso: string | null = null;
  allRows.forEach((r) => {
    Object.entries(r.cells).forEach(([iso, cell]) => {
      if (cell.status === "scheduled") scheduledCells++;
      if (!firstIso || iso < firstIso) firstIso = iso;
      if (!lastIso || iso > lastIso) lastIso = iso;
    });
  });
  const matchedRows = allRows.filter((r) => r.tmId !== null).length;
  const unmatchedRows = allRows.length - matchedRows;

  return {
    sourceFile,
    availableSheets: sheetNames,
    // For the aggregate parse, selectedSheet is "all" — not a single sheet
    selectedSheet: perSheet.map((p) => p.selectedSheet).join(" + "),
    headerRowIndex: -1, // not meaningful for aggregate
    dateColumns: combinedDateColumns,
    rows: allRows,
    warnings,
    stats: {
      totalRows: allRows.length,
      matchedRows,
      unmatchedRows,
      scheduledCells,
      dateRange: firstIso && lastIso ? { first: firstIso, last: lastIso } : null,
    },
  };
}

/**
 * Default sheet selection: prefer a sheet whose name matches /grav/i (so
 * "Graves" / "Grave Shift" / "graves" all win). Fall back to the LAST
 * sheet — Brian's ADP files lay out as Sheet1=Day, Sheet2=Swings,
 * Sheet3=Graves, so the last one is the right grave roster. Final fallback:
 * the first non-empty sheet.
 */
function pickDefaultSheet(workbook: XLSX.WorkBook): string | undefined {
  const names = workbook.SheetNames;
  const graveMatch = names.find((n) => /grav/i.test(n));
  if (graveMatch) return graveMatch;
  // Last sheet — works for the Day/Swings/Graves layout.
  if (names.length >= 2) return names[names.length - 1];
  // First non-empty
  return names.find((n) => {
    const sheet = workbook.Sheets[n];
    return sheet && Object.keys(sheet).some((k) => !k.startsWith("!"));
  });
}

/**
 * Pure version that operates on an already-loaded workbook (handy for tests).
 */
export function parseWorkbook(
  workbook: any, // populated after lazy XLSX load in caller
  sourceFile: string,
  roster: TeamMember[],
  sheetName?: string
): ParsedSchedule {
  const warnings: string[] = [];

  // Caller may explicitly pick a sheet; otherwise infer (graves > last > first).
  const chosenSheetName = sheetName ?? pickDefaultSheet(workbook);
  if (!chosenSheetName || !workbook.Sheets[chosenSheetName]) {
    return emptyResult(
      sourceFile,
      workbook.SheetNames,
      "No non-empty sheet found in workbook"
    );
  }
  const sheet = workbook.Sheets[chosenSheetName];

  // Materialize as a 2D array (rows of cells).
  const aoa = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
    raw: false,
  }) as unknown as any[][];

  if (aoa.length === 0) {
    return emptyResult(sourceFile, workbook.SheetNames, "Sheet was empty");
  }

  // Find the header row — the row with the most date-shaped cells.
  const headerScan = findHeaderRow(aoa);
  if (!headerScan) {
    return emptyResult(
      sourceFile,
      workbook.SheetNames,
      "Couldn't find a header row with date columns. Expected at least 3 weekday-shaped headers."
    );
  }
  const { headerRowIndex, dateColumns, nameColumnIndex } = headerScan;

  if (dateColumns.length === 0) {
    return emptyResult(sourceFile, workbook.SheetNames, "No date columns detected in header row");
  }

  // Build the data rows.
  const rows: ParsedScheduleRow[] = [];
  let scheduledCells = 0;
  let firstIso: string | null = null;
  let lastIso: string | null = null;

  for (let r = headerRowIndex + 1; r < aoa.length; r++) {
    const row = aoa[r];
    const firstName = String(row[nameColumnIndex] ?? "").trim();
    if (!firstName) continue;
    // Combine First Name + Last Name columns. The Last Name sits immediately
    // after the name column — but only if that next column isn't a date column.
    const nextColIdx = nameColumnIndex + 1;
    const nextIsDate = dateColumns.some((dc) => dc.colIndex === nextColIdx);
    const lastName =
      !nextIsDate && row[nextColIdx] ? String(row[nextColIdx]).trim() : "";
    const rawName = lastName ? `${firstName} ${lastName}` : firstName;

    // Skip non-person summary rows (Grave/Day/Swing Shift Headcount, etc.)
    if (isNonPersonADPRow(rawName)) continue;

    const match = matchTM(rawName, roster);
    const cells: Record<string, ParsedScheduleCell> = {};
    for (const col of dateColumns) {
      const raw = String(row[col.colIndex] ?? "").trim();
      const status = classifyShiftCell(raw);
      cells[col.iso] = { rawValue: raw, status };
      if (status === "scheduled") scheduledCells++;
      if (!firstIso || col.iso < firstIso) firstIso = col.iso;
      if (!lastIso || col.iso > lastIso) lastIso = col.iso;
    }

    rows.push({
      rawName,
      tmId: match.tmId,
      matchKind: match.kind,
      cells,
    });
  }

  const matchedRows = rows.filter((r) => r.tmId !== null).length;
  const unmatchedRows = rows.length - matchedRows;

  if (unmatchedRows > 0) {
    warnings.push(
      `${unmatchedRows} row${unmatchedRows === 1 ? "" : "s"} couldn't be matched to a TM — confirm or correct before applying`
    );
  }

  return {
    sourceFile,
    availableSheets: workbook.SheetNames,
    selectedSheet: chosenSheetName,
    headerRowIndex,
    dateColumns,
    rows,
    warnings,
    stats: {
      totalRows: rows.length,
      matchedRows,
      unmatchedRows,
      scheduledCells,
      dateRange:
        firstIso && lastIso ? { first: firstIso, last: lastIso } : null,
    },
  };
}

// =====================================================================
// Header / date detection
// =====================================================================

interface HeaderScan {
  headerRowIndex: number;
  dateColumns: Array<{ colIndex: number; iso: string; rawHeader: string }>;
  nameColumnIndex: number;
}

/**
 * Scan the top ~15 rows; for each row, count how many cells parse as a date
 * and pick the row with the most. Also locate a "name"-shaped column (first
 * column that contains a string that doesn't parse as a date).
 */
function findHeaderRow(aoa: any[][]): HeaderScan | null {
  const limit = Math.min(15, aoa.length);
  let best: HeaderScan | null = null;
  for (let r = 0; r < limit; r++) {
    const row = aoa[r];
    const dateCols: HeaderScan["dateColumns"] = [];
    let firstNonDateCol: number | null = null;
    for (let c = 0; c < row.length; c++) {
      const raw = String(row[c] ?? "").trim();
      if (!raw) continue;
      const iso = parseHeaderToIso(raw);
      if (iso) {
        dateCols.push({ colIndex: c, iso, rawHeader: raw });
      } else if (firstNonDateCol === null) {
        firstNonDateCol = c;
      }
    }
    if (dateCols.length >= 3) {
      if (!best || dateCols.length > best.dateColumns.length) {
        best = {
          headerRowIndex: r,
          dateColumns: dateCols,
          nameColumnIndex: firstNonDateCol ?? 0,
        };
      }
    }
  }
  return best;
}

/**
 * Try to interpret a header cell as a date. Handles:
 *   - "Fri 5/16" / "Friday 5/16"
 *   - "5/16/2026"
 *   - "2026-05-16"
 *   - "Sat 5/17" with current-year inferred
 *
 * Returns ISO yyyy-mm-dd or null.
 */
function parseHeaderToIso(raw: string): string | null {
  const cleaned = raw.replace(/^[A-Za-z]+\s+/, "").trim(); // strip leading weekday name
  // yyyy-mm-dd
  const iso = cleaned.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    return `${iso[1]}-${pad(iso[2])}-${pad(iso[3])}`;
  }
  // m/d/yyyy or m/d/yy
  const mdy = cleaned.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (mdy) {
    const month = Number(mdy[1]);
    const day = Number(mdy[2]);
    let year = mdy[3] ? Number(mdy[3]) : new Date().getFullYear();
    if (year < 100) year += 2000;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${pad(month)}-${pad(day)}`;
    }
  }
  return null;
}

function pad(n: number | string): string {
  return String(n).padStart(2, "0");
}

// =====================================================================
// Cell classification
// =====================================================================

/**
 * Interpret a shift cell:
 *   - empty / "OFF" / "x" / "-" → off
 *   - "G11" / "GR" / "Grave" / "11p-7a" / "7" (hours) → scheduled
 *   - everything else → unknown
 */
function classifyShiftCell(raw: string): ShiftStatus {
  if (!raw) return "off";
  const lower = raw.toLowerCase().trim();
  if (
    lower === "off" ||
    lower === "x" ||
    lower === "-" ||
    lower === "—" ||
    lower === "n/a" ||
    lower === "na" ||
    lower === "0"
  ) {
    return "off";
  }
  // Hours-like (number, possibly fractional)
  if (/^\d+(\.\d+)?$/.test(lower) && parseFloat(lower) > 0) {
    return "scheduled";
  }
  // PTO / leave codes — TM is NOT physically on shift; treat as off.
  // Must come before the catch-all letter check below.
  if (
    lower.includes("pto") ||
    lower.includes("bereavement") ||
    lower === "lwop" ||
    lower === "fmla" ||
    lower === "loa"
  ) {
    return "off";
  }
  // Shift code patterns — "G11", "GR", "G", "11-7", "11p-7a", etc.
  if (/^(g|gr|grave|night|11)/i.test(lower)) return "scheduled";
  if (/\d+\s*[ap]?\s*-\s*\d+\s*[ap]?/.test(lower)) return "scheduled";
  // Anything else with letters is likely a shift code we should accept
  if (/[a-z]/.test(lower)) return "scheduled";
  return "unknown";
}

// =====================================================================
// TM name matching
// =====================================================================

/**
 * Static alias table: maps a lowercase ADP export name → tm_id.
 *
 * Add an entry here whenever ADP uses a name that doesn't resolve to the right
 * TM through the normal display_name / full_name / fuzzy matching chain. Common
 * reasons:
 *   - ADP uses a full legal name while the TM's display_name is a nickname
 *     ("JT" vs "Jeremy H" in ADP)
 *   - A placeholder profile with the same display_name exists but has no
 *     grave_pool (e.g. "Nicole U" → tm_nikki, not the orphan tm_f54acb515ae2)
 *   - ADP's format doesn't match any variant we can fuzzy-detect automatically
 *
 * These overrides fire BEFORE any fuzzy logic, so they are always authoritative.
 */
const ADP_NAME_ALIASES: Record<string, string> = {
  // Jeremy Laker (display "JT") appears in ADP Graves sheet as "Jeremy H"
  "jeremy h": "tm_jt",
  // Nikki (Nicole Cederholm) appears in ADP as "Nicole U" — same string as an
  // orphan profile (tm_f54acb515ae2) that is NOT graves-eligible
  "nicole u": "tm_nikki",
  // Scott Walsh (display "Scott") — ADP full name; insurance against the
  // full_name match failing due to whitespace / encoding edge cases
  "scott walsh": "tm_scott",
};

/**
 * Returns true for rows that are not actual team members.
 * ADP exports often include summary rows like:
 *   "Grave Shift Headcount:", "Day Shift Headcount:", "Swing Shift Headcount:"
 * These must never be treated as people or offered as "unmatched TMs".
 */
export function isNonPersonADPRow(raw: string): boolean {
  const s = raw.toLowerCase().trim();
  if (!s) return true;
  if (s.includes("headcount")) return true;
  // Add more junk patterns here as they appear in real ADP files
  return false;
}

interface TMMatch {
  tmId: string | null;
  kind: ParsedScheduleRow["matchKind"];
}

function matchTM(rawName: string, roster: TeamMember[]): TMMatch {
  if (isNonPersonADPRow(rawName)) {
    return { tmId: null, kind: "ignored" };
  }

  const cleaned = rawName.trim().toLowerCase();
  if (!cleaned) return { tmId: null, kind: "unmatched" };

  // Static alias table — checked before any fuzzy logic so it's always
  // authoritative. Covers cases where ADP uses a name that doesn't match the
  // correct TM's display_name or full_name (e.g. "Jeremy H" → tm_jt).
  const aliasedId = ADP_NAME_ALIASES[cleaned];
  if (aliasedId) return { tmId: aliasedId, kind: "exact" };

  // Exact display_name match
  const exact = roster.find((tm) => (tm.name ?? "").toLowerCase() === cleaned);
  if (exact) return { tmId: exact.id, kind: "exact" };

  // Exact full_name match
  const full = roster.find((tm) => (tm.fullName ?? "").toLowerCase() === cleaned);
  if (full) return { tmId: full.id, kind: "full" };

  // ADP sometimes formats as "Lastname, Firstname"
  if (cleaned.includes(",")) {
    const [last, first] = cleaned.split(",").map((s) => s.trim());
    const reversed = `${first} ${last}`;
    const flip = roster.find(
      (tm) =>
        (tm.fullName ?? "").toLowerCase() === reversed ||
        (tm.name ?? "").toLowerCase() === reversed
    );
    if (flip) return { tmId: flip.id, kind: "full" };
  }

  // Fuzzy: first-word prefix match against display_name and full_name
  const firstWord = cleaned.split(/\s+/)[0];
  if (firstWord.length >= 3) {
    const fuzzy = roster.find(
      (tm) =>
        (tm.name ?? "").toLowerCase().startsWith(firstWord) ||
        (tm.fullName ?? "").toLowerCase().startsWith(firstWord)
    );
    if (fuzzy) return { tmId: fuzzy.id, kind: "fuzzy" };
  }

  return { tmId: null, kind: "unmatched" };
}

// =====================================================================
// Helpers
// =====================================================================

function emptyResult(
  sourceFile: string,
  availableSheets: string[],
  warning: string
): ParsedSchedule {
  return {
    sourceFile,
    availableSheets,
    selectedSheet: "",
    headerRowIndex: -1,
    dateColumns: [],
    rows: [],
    warnings: [warning],
    stats: {
      totalRows: 0,
      matchedRows: 0,
      unmatchedRows: 0,
      scheduledCells: 0,
      dateRange: null,
    },
  };
}

/**
 * Convert a parsed schedule into the rows we'd write to `night_tm_status`.
 * Caller resolves night_ids by querying `nights` for the parsed date range.
 */
export interface NightStatusUpsert {
  tmId: string;
  nightDate: string;
  tmName: string;
  rawShiftCode: string;
  status: "present" | "off";
  /** Which sheet this came from — used by the apply filter */
  sourceSheetKind?: SheetKind;
}

/**
 * Decide whether a (sheet, gravePool) pair should produce a night_tm_status
 * row. The mapping codifies Brian's ADP file layout:
 *   Days   → AM overlaps only (gravePool='AM')
 *   Swings → PM overlaps only (gravePool='PM')
 *   Graves → any grave-pool TM
 *   unknown → never
 */
export function shouldIncludeRow(
  sheetKind: SheetKind | undefined,
  gravePool: string | null | undefined
): boolean {
  const pool = String(gravePool ?? "").toUpperCase();
  if (sheetKind === "graves") return !!pool;
  if (sheetKind === "days") return pool === "AM";
  if (sheetKind === "swings") return pool === "PM";
  return false;
}

/**
 * Resolve a tm_id to the display name we use everywhere in the app.
 * Preference: roster.name (Display Name) → roster.fullName → rawName fallback.
 * This is the single source of truth for the Full Name → Display Name layer
 * Brian wired up so night_tm_status never stores raw ADP cells.
 */
export function resolveDisplayName(
  tmId: string,
  rawName: string,
  displayNameById?: Map<string, string | null | undefined>,
  fullNameById?: Map<string, string | null | undefined>
): string {
  const display = displayNameById?.get(tmId);
  if (display && String(display).trim()) return String(display).trim();
  const full = fullNameById?.get(tmId);
  if (full && String(full).trim()) return String(full).trim();
  return rawName;
}

/**
 * Caller passes lookups so we can:
 *   - apply the (sheet, gravePool) filter
 *   - normalize Full Name → Display Name before writing to night_tm_status
 * Without the lookups we fall back to the old behavior (write everyone
 * matched, using whatever name ADP wrote).
 */
export function buildNightStatusUpserts(
  parsed: ParsedSchedule,
  gravePoolById?: Map<string, string | null | undefined>,
  displayNameById?: Map<string, string | null | undefined>,
  fullNameById?: Map<string, string | null | undefined>
): NightStatusUpsert[] {
  const out: NightStatusUpsert[] = [];
  for (const row of parsed.rows) {
    if (!row.tmId) continue;

    // Apply the (sheet, gravePool) filter when the lookup is provided AND
    // the row has a sheet tag (only true for aggregate parses).
    if (gravePoolById && row.sourceSheetKind) {
      const pool = gravePoolById.get(row.tmId);
      if (!shouldIncludeRow(row.sourceSheetKind, pool)) continue;
    }

    // Resolve Display Name once per row (constant across that row's cells).
    const resolvedName = resolveDisplayName(
      row.tmId,
      row.rawName,
      displayNameById,
      fullNameById
    );

    for (const [iso, cell] of Object.entries(row.cells)) {
      if (cell.status === "off") continue;
      out.push({
        tmId: row.tmId,
        nightDate: iso,
        tmName: resolvedName,
        rawShiftCode: cell.rawValue,
        status: cell.status === "scheduled" ? "present" : "off",
        sourceSheetKind: row.sourceSheetKind,
      });
    }
  }
  return out;
}
