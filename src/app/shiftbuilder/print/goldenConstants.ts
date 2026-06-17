/** Sacred Golden artboard — US Letter landscape @ 96 dpi (11" × 8.5"). */
export const GOLDEN_WIDTH_PX = 1056;
export const GOLDEN_HEIGHT_PX = 816;

/** Off-screen left offset for export raster staging (invisible, still paintable). */
export const GOLDEN_RASTER_STAGING_LEFT_PX = -(GOLDEN_WIDTH_PX + 240);

/** Landscape letter in PDF points (72 pt/in). */
export const LETTER_LANDSCAPE_PT = { width: 792, height: 612 } as const;