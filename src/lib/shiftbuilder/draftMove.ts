/**
 * Draft-layer TM move/swap — identity only.
 * Coverage banners live on the committed seat row and must never be copied
 * into draftAssignments.
 */

export type DraftSlotPatch = {
  proposedTmId?: string;
  proposedTmName?: string;
  previousTmId?: string;
  previousTmName?: string;
  proposedClear?: boolean;
};

export type DraftCommittedSeat = {
  tmId?: string | null;
  tmName?: string | null;
};

export function applyDraftMoveOrSwapToMap(
  draft: Record<string, DraftSlotPatch>,
  committed: Record<string, DraftCommittedSeat | undefined>,
  fromKey: string,
  toKey: string,
  moving: { tmId: string; tmName: string } | null,
  displaced: { tmId: string; tmName: string } | null,
): Record<string, DraftSlotPatch> {
  const next: Record<string, DraftSlotPatch> = { ...draft };

  const patchSlot = (key: string, tmId: string | null, tmName: string | null) => {
    const existingDraft = next[key];
    const baseline = committed[key];
    const previousTmId = existingDraft?.previousTmId ?? baseline?.tmId ?? undefined;
    const previousTmName = existingDraft?.previousTmName ?? baseline?.tmName ?? undefined;

    if (!tmId) {
      if (!baseline?.tmId && !(existingDraft?.proposedTmId && !existingDraft?.proposedClear)) {
        delete next[key];
      } else {
        next[key] = {
          proposedTmId: "",
          proposedTmName: "",
          previousTmId,
          previousTmName,
          proposedClear: true,
        };
      }
    } else if (tmId === baseline?.tmId) {
      delete next[key];
    } else {
      next[key] = {
        proposedTmId: tmId,
        proposedTmName: tmName || tmId,
        previousTmId,
        previousTmName,
      };
    }
  };

  if (moving) patchSlot(toKey, moving.tmId, moving.tmName);
  if (displaced) patchSlot(fromKey, displaced.tmId, displaced.tmName);
  else if (moving) patchSlot(fromKey, null, null);

  return next;
}
