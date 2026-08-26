/** US Letter portrait — 8.5×11" @ 96 dpi. Do not reuse for Golden landscape. */
export const PORTRAIT_WIDTH_PX = 816;
export const PORTRAIT_HEIGHT_PX = 1056;

/** Portrait letter in PDF points (72 pt/in). */
export const LETTER_PORTRAIT_PT = { width: 612, height: 792 } as const;

/**
 * Quiet roster column. A full night (grave + PM/AM overlaps) must stay on
 * one Letter portrait sheet — helpers may still pack, but print never
 * paginates a live roster onto page 2.
 */
export const PLANNER_ROSTER_PER_PAGE = 40;

/** Newest-first placement codes printed under planner names. Golden still shows 3. */
export const PLANNER_TRAIL_COUNT = 5;

/**
 * Preferred ruled huddle-notes band when the TM rail is short.
 * Yields toward PLANNER_NOTES_FLOOR_PX as the roster grows.
 */
export const PLANNER_NOTES_PREF_PX = 168;
export const PLANNER_NOTES_MIN_PX = PLANNER_NOTES_PREF_PX;

/** Smallest notes band that still reads as a ruled huddle box. */
export const PLANNER_NOTES_FLOOR_PX = 56;
