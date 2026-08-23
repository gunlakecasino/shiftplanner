/**
 * Operator-facing stakes copy for live writes. Apply / Publish / Unpublish
 * must name that TMs see (or stop seeing) the board. Do not soften these.
 */

export const APPLY_TO_LIVE_CONFIRM =
  "This writes to the live board — TMs will see it immediately.";

export const APPLY_TO_LIVE_POINT =
  "Changes become visible to all TMs immediately after Apply to Live";

export const APPLY_TO_LIVE_DISCARD_POINT =
  "To abandon these proposals without writing, use Discard Draft first";

export const APPLY_TO_LIVE_CONFIRM_LABEL = "Apply to Live";

export const APPLY_TO_LIVE_BUSY_LABEL = "Applying…";

/** Header / pill title — confirm is the real write gate. */
export const APPLY_TO_LIVE_OPEN_CONFIRM =
  "Opens confirm, then writes to the live board — TMs will see it immediately.";

export const PUBLISH_DAY_CONFIRM =
  "Publishing makes this night visible to TMs on the floor now.";

export const UNPUBLISH_DAY_CONFIRM =
  "Unpublishing hides this night from TMs. The board returns to draft.";

export const PUBLISH_DAY_CONFIRM_LABEL = "Publish Day";

export const UNPUBLISH_DAY_CONFIRM_LABEL = "Unpublish Day";

export const PUBLISH_WEEK_CONFIRM =
  "Publishing this week makes those nights visible to TMs on the floor now.";

export const UNPUBLISH_WEEK_CONFIRM =
  "Unpublishing this week hides those nights from TMs. Boards return to draft.";
