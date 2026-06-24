import { ZONE_VISUAL_ORDER } from "@/lib/shiftbuilder/constants";

export type TutorialSlotKey =
  | "Z1" | "Z2" | "Z3" | "Z4" | "Z5" | "Z6" | "Z7" | "Z8" | "Z9" | "Z10";

export type TutorialTask = {
  id: string;
  taskLabel: string;
  color?: string;
  isCoverage?: boolean;
  coverageTarget?: TutorialSlotKey;
  coverageSide?: "A" | "B";
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
    body: "Martinez called off from Z4. On most nights there is no bench — you reshuffle people already on the board. This practice board mirrors live ShiftBuilder: Grave Roster on the left, Placement Pad on the card, coverage bars at the card bottom (not in the task list), and the Tasks Pad for regular task lines.",
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
    title: "Open Z4 Placement Pad",
    body: "Martinez is still on Z4. On desktop, double-click the upper name area. On iPad, a single tap opens the same Placement Pad flyout.",
    hint: "Open the pad on Z4 (double-click on desktop).",
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
    body: "Z4 is empty — Unassigned in the name area and ASSIGN TM below. Open the Placement Pad from the upper name area (or tap ASSIGN TM).",
    hint: "Open the pad on empty Z4.",
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
    title: "Add coverage (bottom bar)",
    body: "With Chen on Z4, open the Placement Pad again and tap Coverage in the footer. Pick Z8 in the Add coverage grid. Live ShiftBuilder adds an And Zone 8 bar at the very bottom of Z4 — not in the task list. Z8 will show Covered by Chen.",
    hint: "Footer → Coverage → Z8.",
  },
  {
    id: "add-task",
    title: "Add a regular task (separate from coverage)",
    body: "Coverage bars and tasks are different. Double-click (or tap on iPad) the lower task area on Z4 to open the Tasks Pad. Add a short reminder — e.g. Monitor Z8 — thin. This appears in the middle task rows, not in the coverage bar.",
    hint: "Open Tasks Pad on Z4, then add the task.",
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