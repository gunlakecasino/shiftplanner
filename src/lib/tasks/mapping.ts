// Row <-> type mapping for ops_work_items and its satellite tables. Portable —
// generic to the schema itself, not to any one consumer of it.

import type {
  ChecklistItem,
  StatusHistoryEntry,
  TaskPool,
  WorkItem,
  WorkItemComment,
} from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */

// A single un-concatenated literal — Supabase's typed select-string parser only
// narrows column types when it can see a literal type, not a `string`-widened
// value produced by `+` concatenation across multiple string literals.
export const WORK_ITEM_COLUMNS =
  "id, work_type, title, description, department, is_overlap, priority, status, status_reason, category, project_id, pool_id, assignee_type, assignee_tm_id, due_date, due_shift, blocker_note, hold_note, cancel_reason, completed_at, notes, recurrence_type, recurrence_days, advance_days, next_due_date, active, parent_template_id, created_by_name, updated_by_name, created_at, updated_at, archived_at";

export function rowToWorkItem(r: any): WorkItem {
  return {
    id: r.id,
    workType: r.work_type,
    title: r.title,
    description: r.description ?? null,
    department: r.department,
    isOverlap: r.is_overlap ?? false,
    priority: r.priority ?? "normal",
    status: r.status ?? "not_started",
    statusReason: r.status_reason ?? null,
    category: r.category ?? null,
    projectId: r.project_id ?? null,
    poolId: r.pool_id ?? null,
    assigneeType: r.assignee_type ?? null,
    assigneeTmId: r.assignee_tm_id ?? null,
    dueDate: r.due_date ?? null,
    dueShift: r.due_shift ?? null,
    blockerNote: r.blocker_note ?? null,
    holdNote: r.hold_note ?? null,
    cancelReason: r.cancel_reason ?? null,
    completedAt: r.completed_at ?? null,
    notes: r.notes ?? null,
    recurrenceType: r.recurrence_type ?? null,
    recurrenceDays: r.recurrence_days ?? null,
    advanceDays: r.advance_days ?? 1,
    nextDueDate: r.next_due_date ?? null,
    active: r.active ?? true,
    parentTemplateId: r.parent_template_id ?? null,
    createdByName: r.created_by_name ?? null,
    updatedByName: r.updated_by_name ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    archivedAt: r.archived_at ?? null,
  };
}

export function rowToChecklistItem(r: any): ChecklistItem {
  return {
    id: r.id,
    workItemId: r.work_item_id,
    label: r.label,
    isDone: r.is_done ?? false,
    sortOrder: r.sort_order ?? 0,
    createdAt: r.created_at,
  };
}

export function rowToComment(r: any): WorkItemComment {
  return {
    id: r.id,
    workItemId: r.work_item_id,
    authorName: r.author_name ?? null,
    body: r.body,
    createdAt: r.created_at,
  };
}

export function rowToPool(r: any): TaskPool {
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? null,
    distributionMode: r.distribution_mode ?? "round_robin",
    active: r.active ?? true,
    createdByName: r.created_by_name ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function rowToActivityEntry(r: any): StatusHistoryEntry {
  return {
    id: r.id,
    workItemId: r.work_item_id,
    fromStatus: r.from_status ?? null,
    toStatus: r.to_status,
    changedByName: r.changed_by_name ?? null,
    note: r.note ?? null,
    changedAt: r.changed_at,
  };
}
