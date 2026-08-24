/** US Letter portrait — 8.5×11" @ 96 dpi. Do not reuse for Golden landscape. */
export const PORTRAIT_WIDTH_PX = 816;
export const PORTRAIT_HEIGHT_PX = 1056;

/** Portrait letter in PDF points (72 pt/in). */
export const LETTER_PORTRAIT_PT = { width: 612, height: 792 } as const;

/**
 * Quiet roster column: prefer one page; overflow continues on a second sheet.
 * Count is names only (section heads + write-in hairlines sit outside it).
 * Sized for name + last-5 trail so the huddle-notes band stays reserved.
 */
export const PLANNER_ROSTER_PER_PAGE = 28;

/** Newest-first placement codes printed under planner names. Golden still shows 3. */
export const PLANNER_TRAIL_COUNT = 5;

/**
 * Ruled huddle-notes band on Letter portrait. Absorbs leftover artboard
 * height after packed RR / zone / aux / overlap grids. Print-useful;
 * never filled with invented copy.
 */
export const PLANNER_NOTES_MIN_PX = 168;
