/** US Letter portrait — 8.5×11" @ 96 dpi. Do not reuse for Golden landscape. */
export const PORTRAIT_WIDTH_PX = 816;
export const PORTRAIT_HEIGHT_PX = 1056;

/** Portrait letter in PDF points (72 pt/in). */
export const LETTER_PORTRAIT_PT = { width: 612, height: 792 } as const;

/** Quiet roster column: prefer one page; overflow continues on a second sheet. */
export const PLANNER_ROSTER_PER_PAGE = 36;

/**
 * Ruled huddle-notes band on Letter portrait. Absorbs leftover artboard
 * height after packed RR / zone / aux / overlap grids. Print-useful;
 * never filled with invented copy.
 */
export const PLANNER_NOTES_MIN_PX = 168;
