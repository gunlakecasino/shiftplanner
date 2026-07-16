"use client";

import React, { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Repeat, Plus, Trash2, CalendarPlus } from "lucide-react";
import type { WorkItem } from "@/lib/tasks/types";
import { WORK_ITEM_CATEGORIES } from "@/lib/tasks/types";
import { useRecurringTemplates, useRoster, type ProjectWithCounts } from "../hooks/useProjectsData";
import {
  useArchiveTask,
  useCreateTask,
  useGenerateNextOccurrence,
} from "../hooks/useTaskMutations";
import { EmptyState } from "./EmptyState";
import { SlotSelect, type SlotSelection } from "./SlotSelect";
import { useConfirm } from "../../components/ConfirmDialog";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
type Frequency = "daily" | "weekly" | "biweekly" | "monthly";

/** Human summary of a template's cadence, e.g. "Weekly · Mon, Thu" or "Every 3 days". */
export function describeRecurrence(t: WorkItem): string {
  const days = t.recurrenceDays ?? [];
  switch (t.recurrenceType) {
    case "daily":
      return t.advanceDays > 1 ? `Every ${t.advanceDays} days` : "Daily";
    case "weekly":
      return `Weekly · ${days.map((d) => WEEKDAYS[d]).join(", ") || "—"}`;
    case "biweekly":
      return `Every 2 weeks · ${days.map((d) => WEEKDAYS[d]).join(", ") || "—"}`;
    case "monthly":
      return `Monthly · day ${days.join(", ") || "—"}`;
    case "custom":
      return `Every ${t.advanceDays} days`;
    default:
      return "Recurring";
  }
}

export function RecurringView({
  selectedProjectId,
  projects,
  canManage,
}: {
  selectedProjectId: string | null;
  projects: ProjectWithCounts[];
  canManage: boolean;
}) {
  const { data: templates = [], isLoading } = useRecurringTemplates(selectedProjectId);
  const { data: roster = [] } = useRoster();
  const generateNext = useGenerateNextOccurrence();
  const archiveTask = useArchiveTask();
  const confirm = useConfirm();
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="space-y-3">
      {canManage && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-semibold"
            style={{ background: "var(--sb-projects-accent)", color: "white" }}
          >
            <Plus size={14} strokeWidth={2.4} />
            {showForm ? "Close" : "New recurring task"}
          </button>
        </div>
      )}

      <AnimatePresence initial={false}>
        {showForm && canManage && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            style={{ overflow: "hidden" }}
          >
            <NewRecurringForm
              projects={projects}
              roster={roster}
              defaultProjectId={selectedProjectId}
              onDone={() => setShowForm(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {isLoading ? (
        <div className="space-y-1.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-[var(--ios-gray-6)]" />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <EmptyState
          title="No recurring tasks"
          subtitle="Standing work like weekly inspections or monthly filter changes lives here. Create one above."
        />
      ) : (
        <div className="space-y-2">
          {templates.map((t) => {
            const assignee = roster.find((r) => r.tmId === t.assigneeTmId);
            return (
              <div key={t.id} className="sb-projects-card flex items-center gap-3 px-3 py-2.5">
                <Repeat size={15} className="shrink-0 text-[var(--sb-projects-accent)]" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium text-[var(--ios-label)]">{t.title}</div>
                  <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-[var(--ios-label-tertiary)]">
                    <span>{describeRecurrence(t)}</span>
                    {t.nextDueDate && <span>· next {t.nextDueDate}</span>}
                    {assignee && <span>· {assignee.name}</span>}
                    {!t.active && <span className="text-[var(--sb-projects-overdue)]">· paused</span>}
                  </div>
                </div>
                {canManage && (
                  <>
                    <button
                      type="button"
                      onClick={() => generateNext.mutate(t.id)}
                      disabled={generateNext.isPending || !t.active}
                      title="Create the next occurrence now"
                      className="flex shrink-0 items-center gap-1 rounded-md border border-[var(--sb-projects-accent-border)] px-2 py-1 text-[10.5px] font-medium text-[var(--sb-projects-accent)] disabled:opacity-40"
                    >
                      <CalendarPlus size={12} />
                      Generate
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const accepted = await confirm("Future occurrences will stop generating. Existing tasks are unchanged.", {
                          title: "Archive recurring template?",
                          confirmLabel: "Archive",
                          tone: "danger",
                        });
                        if (accepted) await archiveTask.mutateAsync(t.id);
                      }}
                      title="Archive template"
                      className="shrink-0 text-[var(--ios-label-quaternary)] hover:text-[var(--sb-projects-overdue)]"
                    >
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function NewRecurringForm({
  projects,
  roster,
  defaultProjectId,
  onDone,
}: {
  projects: ProjectWithCounts[];
  roster: { tmId: string; name: string }[];
  defaultProjectId: string | null;
  onDone: () => void;
}) {
  const createTask = useCreateTask();
  const [title, setTitle] = useState("");
  const [frequency, setFrequency] = useState<Frequency>("weekly");
  const [weekdays, setWeekdays] = useState<number[]>([1]); // Monday default
  const [monthDays, setMonthDays] = useState("1");
  const [everyNDays, setEveryNDays] = useState(1);
  const [assigneeTmId, setAssigneeTmId] = useState("");
  const [projectId, setProjectId] = useState(defaultProjectId ?? "");
  const [category, setCategory] = useState("");
  const [slot, setSlot] = useState<SlotSelection>({ slotKey: null, slotType: null, rrSide: null });

  const toggleWeekday = (d: number) =>
    setWeekdays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));

  const canSubmit =
    title.trim().length > 0 &&
    (frequency === "daily"
      ? everyNDays >= 1
      : frequency === "monthly"
        ? parseMonthDays(monthDays).length > 0
        : weekdays.length > 0);

  const submit = async () => {
    if (!canSubmit) return;
    const recurrenceDays =
      frequency === "monthly" ? parseMonthDays(monthDays) : frequency === "daily" ? [] : weekdays;
    await createTask.mutateAsync({
      title: title.trim(),
      workType: "recurring",
      recurrenceType: frequency,
      recurrenceDays,
      advanceDays: frequency === "daily" ? everyNDays : 1,
      assigneeTmId: assigneeTmId || null,
      projectId: projectId || null,
      category: category || null,
      slotKey: slot.slotKey,
      slotType: slot.slotType,
      rrSide: slot.rrSide,
    });
    onDone();
  };

  return (
    <div className="sb-projects-card space-y-3 p-3">
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Recurring task title…"
        className="w-full rounded-md border border-[var(--sb-settings-border-paper)] bg-[var(--ios-background-secondary)] px-2.5 py-2 text-[13px] font-medium outline-none focus:border-[var(--sb-projects-accent)]"
      />

      <div className="flex flex-wrap items-center gap-1.5">
        {(["daily", "weekly", "biweekly", "monthly"] as Frequency[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFrequency(f)}
            className="rounded-full px-2.5 py-1 text-[11px] font-medium capitalize transition-colors"
            style={{
              background: frequency === f ? "var(--sb-projects-accent)" : "var(--ios-gray-6)",
              color: frequency === f ? "white" : "var(--ios-label-secondary)",
            }}
          >
            {f}
          </button>
        ))}
      </div>

      {(frequency === "weekly" || frequency === "biweekly") && (
        <div className="flex flex-wrap gap-1">
          {WEEKDAYS.map((label, d) => (
            <button
              key={d}
              type="button"
              onClick={() => toggleWeekday(d)}
              className="rounded-md px-2 py-1 text-[11px] font-medium transition-colors"
              style={{
                background: weekdays.includes(d) ? "var(--sb-projects-accent-tint)" : "var(--ios-gray-6)",
                color: weekdays.includes(d) ? "var(--sb-projects-accent)" : "var(--ios-label-tertiary)",
                border: weekdays.includes(d)
                  ? "1px solid var(--sb-projects-accent-border)"
                  : "1px solid transparent",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {frequency === "monthly" && (
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.05em] text-[var(--ios-label-tertiary)]">
            Days of month
          </label>
          <input
            value={monthDays}
            onChange={(e) => setMonthDays(e.target.value)}
            placeholder="e.g. 1, 15"
            className="w-full rounded-md border border-[var(--sb-settings-border-paper)] bg-[var(--ios-background-secondary)] px-2 py-1.5 text-[12.5px] outline-none focus:border-[var(--sb-projects-accent)]"
          />
        </div>
      )}

      {frequency === "daily" && (
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-[var(--ios-label-secondary)]">Every</span>
          <input
            type="number"
            min={1}
            value={everyNDays}
            onChange={(e) => setEveryNDays(Math.max(1, Number(e.target.value) || 1))}
            className="w-16 rounded-md border border-[var(--sb-settings-border-paper)] bg-[var(--ios-background-secondary)] px-2 py-1.5 text-[12.5px] outline-none focus:border-[var(--sb-projects-accent)]"
          />
          <span className="text-[12px] text-[var(--ios-label-secondary)]">day(s)</span>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="rounded-md border border-[var(--sb-settings-border-paper)] bg-[var(--ios-background-secondary)] px-2 py-1.5 text-[11.5px] outline-none"
        >
          <option value="">No project</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
        <select
          value={assigneeTmId}
          onChange={(e) => setAssigneeTmId(e.target.value)}
          className="rounded-md border border-[var(--sb-settings-border-paper)] bg-[var(--ios-background-secondary)] px-2 py-1.5 text-[11.5px] outline-none"
        >
          <option value="">Unassigned</option>
          {roster.map((tm) => (
            <option key={tm.tmId} value={tm.tmId}>
              {tm.name}
            </option>
          ))}
        </select>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-md border border-[var(--sb-settings-border-paper)] bg-[var(--ios-background-secondary)] px-2 py-1.5 text-[11.5px] outline-none"
        >
          <option value="">Category…</option>
          {WORK_ITEM_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c.replace("_", " ")}
            </option>
          ))}
        </select>
      </div>

      <SlotSelect
        slotKey={slot.slotKey}
        rrSide={slot.rrSide}
        onChange={setSlot}
        className="w-full rounded-md border border-[var(--sb-settings-border-paper)] bg-[var(--ios-background-secondary)] px-2 py-1.5 text-[11.5px] outline-none"
        placeholder="No location"
      />

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onDone}
          className="rounded-md px-3 py-1.5 text-[12px] text-[var(--ios-label-secondary)]"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!canSubmit || createTask.isPending}
          className="rounded-md px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40"
          style={{ background: "var(--sb-projects-accent)" }}
        >
          {createTask.isPending ? "Creating…" : "Create"}
        </button>
      </div>
    </div>
  );
}

function parseMonthDays(raw: string): number[] {
  return raw
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 31);
}
