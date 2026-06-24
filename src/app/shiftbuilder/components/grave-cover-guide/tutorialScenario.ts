export type TutorialSlotKey = "Z4" | "Z8" | "Z1" | "Z7" | "Z10";

export type TutorialAssignment = {
  tmId: string;
  tmName: string;
  breakGroup?: number;
};

export type TutorialBoard = Record<TutorialSlotKey, TutorialAssignment | null>;

export const TUTORIAL_FOCUS_ZONES: TutorialSlotKey[] = ["Z1", "Z4", "Z7", "Z8", "Z10"];

export const INITIAL_BOARD: TutorialBoard = {
  Z1: { tmId: "tm-1", tmName: "Williams", breakGroup: 1 },
  Z4: { tmId: "tm-martinez", tmName: "Martinez", breakGroup: 2 },
  Z7: { tmId: "tm-7", tmName: "Johnson", breakGroup: 0 },
  Z8: { tmId: "tm-chen", tmName: "Chen", breakGroup: 1 },
  Z10: { tmId: "tm-10", tmName: "Davis", breakGroup: 0 },
};

export type GuideStepId =
  | "intro"
  | "confirm-night"
  | "dblclick-z4"
  | "mark-unavailable"
  | "review-called-off"
  | "dblclick-empty-z4"
  | "tap-assign"
  | "pick-chen"
  | "complete";

export type GuideStep = {
  id: GuideStepId;
  title: string;
  body: string;
  hint?: string;
  target?: "nav-day" | "z4-card" | "pad-mark" | "roster-called-off" | "z4-empty" | "pad-assign" | "picker-chen";
};

export const GUIDE_STEPS: GuideStep[] = [
  {
    id: "intro",
    title: "Covering grave tonight",
    body: "Martinez called off from Z4. On most nights there is no bench — you reshuffle people already on the board. This walkthrough uses the same controls as the live ShiftBuilder.",
    hint: "Click Start when ready.",
  },
  {
    id: "confirm-night",
    title: "Confirm the grave night",
    body: "Use the day pills in the floating nav (same bar as the real app). Make sure you are on the night you are covering before moving anyone.",
    hint: "Click the highlighted day pill.",
    target: "nav-day",
  },
  {
    id: "dblclick-z4",
    title: "Open Z4 placement panel",
    body: "Martinez is still on Z4. Double-click the upper name area on the Z4 card — the same gesture that opens the placement pad on the live board.",
    hint: "Double-click Martinez on Z4.",
    target: "z4-card",
  },
  {
    id: "mark-unavailable",
    title: "Mark unavailable for the whole night",
    body: "In the placement pad, use Mark unavailable (yellow button under the TM header). This clears Martinez from every slot and moves them to Called Off in the roster — not Clear, which only removes one slot.",
    hint: "Click Mark unavailable in the pad.",
    target: "pad-mark",
  },
  {
    id: "review-called-off",
    title: "Check the roster",
    body: "Open the Grave Roster on the right. Martinez should appear under Called Off. On Sheet — Not Placed is often empty on grave — do not wait there for a replacement.",
    hint: "Click Continue after you see Called Off.",
    target: "roster-called-off",
  },
  {
    id: "dblclick-empty-z4",
    title: "Fill the Z4 hole",
    body: "Z4 is empty and shows ASSIGN TM. Double-click the upper name area again to open the placement pad for the empty slot.",
    hint: "Double-click the empty Z4 card.",
    target: "z4-empty",
  },
  {
    id: "tap-assign",
    title: "Assign team member",
    body: "Empty slots show the blue Assign team member button at the top of the pad (same as live ShiftBuilder). Swap in the footer also opens the picker when you need to replace someone on a filled slot.",
    hint: "Click Assign team member.",
    target: "pad-assign",
  },
  {
    id: "pick-chen",
    title: "Pull Chen from Z8",
    body: "Pick Chen — currently on Z8 (usually a lighter zone). This is the reshuffle: Z4 gets coverage, Z8 goes thin. That is normal on grave.",
    hint: "Select Chen in the picker list.",
    target: "picker-chen",
  },
  {
    id: "complete",
    title: "You are set",
    body: "Chen is on Z4. Z8 is open. Add a shift note on the real board if the floor needs to know Z8 is thin. Sign out from the account menu when you leave the ops station.",
  },
];

export function stepIndex(id: GuideStepId): number {
  return GUIDE_STEPS.findIndex((s) => s.id === id);
}

export function collectPlacedTms(board: TutorialBoard): TutorialAssignment[] {
  return Object.values(board).filter((a): a is TutorialAssignment => a != null);
}

export function calledOffFromBoard(
  board: TutorialBoard,
  calledOff: { tmId: string; tmName: string }[],
): TutorialAssignment[] {
  return calledOff;
}