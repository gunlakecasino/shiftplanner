import { ZONE_VISUAL_ORDER } from "@/lib/shiftbuilder/constants";

export type TutorialSlotKey =
  | "Z1" | "Z2" | "Z3" | "Z4" | "Z5" | "Z6" | "Z7" | "Z8" | "Z9" | "Z10";

export type TutorialTask = {
  id: string;
  taskLabel: string;
  color?: string;
  isCoverage?: boolean;
  coverageTarget?: TutorialSlotKey;
};

export type TutorialAssignment = {
  tmId: string;
  tmName: string;
  breakGroup?: number;
};

export type TutorialBoard = Record<TutorialSlotKey, TutorialAssignment | null>;

export type TutorialTasks = Record<TutorialSlotKey, TutorialTask[]>;

export const TUTORIAL_ZONE_ORDER = ZONE_VISUAL_ORDER as TutorialSlotKey[];

export const INITIAL_BOARD: TutorialBoard = {
  Z1: { tmId: "tm-1", tmName: "Williams", breakGroup: 1 },
  Z2: { tmId: "tm-2", tmName: "Garcia", breakGroup: 0 },
  Z3: { tmId: "tm-3", tmName: "Lee", breakGroup: 2 },
  Z4: { tmId: "tm-martinez", tmName: "Martinez", breakGroup: 2 },
  Z5: { tmId: "tm-5", tmName: "Patel", breakGroup: 1 },
  Z6: { tmId: "tm-6", tmName: "Nguyen", breakGroup: 0 },
  Z7: { tmId: "tm-7", tmName: "Johnson", breakGroup: 0 },
  Z8: { tmId: "tm-chen", tmName: "Chen", breakGroup: 1 },
  Z9: { tmId: "tm-9", tmName: "Brown", breakGroup: 2 },
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
  | "add-coverage"
  | "add-task"
  | "complete";

export type GuideStep = {
  id: GuideStepId;
  title: string;
  body: string;
  hint?: string;
};

export const GUIDE_STEPS: GuideStep[] = [
  {
    id: "intro",
    title: "Covering grave tonight",
    body: "Martinez called off from Z4. On most nights there is no bench — you reshuffle people already on the board. This practice board uses the same zone grid, roster, placement pad, coverage picker, and task rows as live ShiftBuilder.",
    hint: "Click Start when ready.",
  },
  {
    id: "confirm-night",
    title: "Confirm the grave night",
    body: "Check the floating nav day strip. The selected night shows the short month + date number (e.g. JUN 23). Unselected days show the weekday letter only.",
    hint: "Click the highlighted selected day pill.",
  },
  {
    id: "dblclick-z4",
    title: "Open Z4 placement pad",
    body: "Martinez is still on Z4. Double-click the upper name area on the card — same as the live board.",
    hint: "Double-click Martinez on Z4.",
  },
  {
    id: "mark-unavailable",
    title: "Mark unavailable for the whole night",
    body: "In the placement pad, use Mark unavailable (yellow button under the TM header). This clears Martinez from every slot and moves them to Called Off — not Clear, which only removes one slot.",
    hint: "Click Mark unavailable.",
  },
  {
    id: "review-called-off",
    title: "Check the Grave Roster",
    body: "The roster sits on the left like production — the board shifts beside it. Martinez should appear under Called Off. On Sheet — Not Placed is often empty on grave.",
    hint: "Click Continue after you see Called Off.",
  },
  {
    id: "dblclick-empty-z4",
    title: "Fill the Z4 hole",
    body: "Z4 is empty with ASSIGN TM in the lower invite area. Double-click the upper name area to open the placement pad.",
    hint: "Double-click empty Z4.",
  },
  {
    id: "tap-assign",
    title: "Assign team member",
    body: "Empty slots show Assign team member at the top of the pad. On filled slots you would use Swap in the footer instead.",
    hint: "Click Assign team member.",
  },
  {
    id: "pick-chen",
    title: "Pull Chen from Z8",
    body: "Pick Chen — listed as on board · Z8. Z4 gets coverage; Z8 goes thin. That is normal on grave.",
    hint: "Select Chen in the picker.",
  },
  {
    id: "add-coverage",
    title: "Add coverage on the card",
    body: "With Chen on Z4, open the pad again and tap Coverage in the footer. Pick Z8 so the floor sees Chen is also covering the thin zone — a gold coverage bar appears on the card, same as live ShiftBuilder.",
    hint: "Coverage → Z8.",
  },
  {
    id: "add-task",
    title: "Add a task line",
    body: "Double-click the lower task area on Z4 (below the name). Add a short task so the next supervisor sees the plan — e.g. Monitor Z8.",
    hint: "Double-click tasks on Z4, then add the task.",
  },
  {
    id: "complete",
    title: "You are set",
    body: "Chen is on Z4 with coverage + a task noting Z8 is thin. Sign out from the account menu when you leave the ops station.",
  },
];

export function stepIndex(id: GuideStepId): number {
  return GUIDE_STEPS.findIndex((s) => s.id === id);
}

export function collectPlacedTms(board: TutorialBoard): TutorialAssignment[] {
  return Object.values(board).filter((a): a is TutorialAssignment => a != null);
}

export function countFilledZones(board: TutorialBoard): number {
  return collectPlacedTms(board).length;
}