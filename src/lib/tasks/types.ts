// Portable core types for the ops_work_items-backed task/project system.
// No imports from src/lib/shiftbuilder/** — see src/lib/shiftbuilder/tasksAdapter.ts
// for the ShiftBuilder-specific glue (grave-night resolution, department default).

export type WorkItemType = "task" | "project" | "recurring";

export type WorkItemStatus =
  | "not_started"
  | "in_progress"
  | "blocked"
  | "on_hold"
  | "complete"
  | "cancelled";

export type WorkItemPriority = "low" | "normal" | "high" | "urgent";

export type WorkItemDepartment = "graves" | "days" | "swings" | "utilities";

export type WorkItemDueShift = "graves" | "days" | "swings" | "any";

export type WorkItemCategory =
  | "maintenance"
  | "cleaning"
  | "admin"
  | "compliance"
  | "training"
  | "guest_experience"
  | "other";

export type WorkItemAssigneeType = "tm" | "staff";

export type RecurrenceType = "daily" | "weekly" | "biweekly" | "monthly" | "custom";

export type DistributionMode = "random" | "round_robin" | "manual";

export interface TaskPool {
  id: string;
  name: string;
  description: string | null;
  distributionMode: DistributionMode;
  active: boolean;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkItem {
  id: string;
  workType: WorkItemType;
  title: string;
  description: string | null;
  department: WorkItemDepartment;
  isOverlap: boolean;
  priority: WorkItemPriority;
  status: WorkItemStatus;
  statusReason: string | null;
  category: WorkItemCategory | null;
  /** Direct parent Project (a WorkItem with workType 'project'). Nullable — a task need not belong to a project. */
  projectId: string | null;
  /** Pool this task belongs to, if any (ops_task_pools). Distribution assigns pooled tasks across the roster. */
  poolId: string | null;
  assigneeType: WorkItemAssigneeType | null;
  /** Set when assigneeType === 'tm'. FKs to tm_profiles.tm_id. */
  assigneeTmId: string | null;
  /** Calendar date (YYYY-MM-DD), not a timestamp — pairs with dueShift. */
  dueDate: string | null;
  dueShift: WorkItemDueShift | null;
  blockerNote: string | null;
  holdNote: string | null;
  cancelReason: string | null;
  completedAt: string | null;
  notes: string | null;
  recurrenceType: RecurrenceType | null;
  /** Weekly/biweekly: weekday numbers 0(Sun)-6(Sat). Monthly: day-of-month numbers. Unused for daily/custom. */
  recurrenceDays: number[] | null;
  advanceDays: number;
  nextDueDate: string | null;
  active: boolean;
  /** Set on instances generated from a recurring template (self-FK to another WorkItem). */
  parentTemplateId: string | null;
  createdByName: string | null;
  updatedByName: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  /** Slot-default chip template (successor to slot_default_tasks). Excluded from tracker views; consumed by the night materializer. */
  isSlotDefault: boolean;
  slotKey: string | null;
  slotType: string | null;
  rrSide: string | null;
  taskColor: string | null;
  isCoverage: boolean;
}

export interface ChecklistItem {
  id: string;
  workItemId: string;
  label: string;
  isDone: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface WorkItemComment {
  id: string;
  workItemId: string;
  authorName: string | null;
  body: string;
  createdAt: string;
}

export interface StatusHistoryEntry {
  id: string;
  workItemId: string;
  fromStatus: WorkItemStatus | null;
  toStatus: WorkItemStatus;
  changedByName: string | null;
  note: string | null;
  changedAt: string;
}

export interface WorkItemDetail extends WorkItem {
  checklist: ChecklistItem[];
  comments: WorkItemComment[];
  activity: StatusHistoryEntry[];
}

export const WORK_ITEM_STATUSES: WorkItemStatus[] = [
  "not_started",
  "in_progress",
  "blocked",
  "on_hold",
  "complete",
  "cancelled",
];

export const WORK_ITEM_PRIORITIES: WorkItemPriority[] = ["low", "normal", "high", "urgent"];

export const WORK_ITEM_CATEGORIES: WorkItemCategory[] = [
  "maintenance",
  "cleaning",
  "admin",
  "compliance",
  "training",
  "guest_experience",
  "other",
];

/** Statuses that require a reason (status_reason) when transitioning into them. */
export const STATUS_REQUIRES_REASON = new Set<WorkItemStatus>(["blocked", "cancelled"]);

export function isOpenStatus(status: WorkItemStatus): boolean {
  return status !== "complete" && status !== "cancelled";
}
