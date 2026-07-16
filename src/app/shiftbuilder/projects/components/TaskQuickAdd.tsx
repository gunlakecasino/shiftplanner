"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { Plus, User, FolderKanban, MapPin } from "lucide-react";
import { SlotSelect, type SlotSelection } from "./SlotSelect";
import { premiumTap } from "@/lib/premiumSpring";
import { useCreateTask } from "../hooks/useTaskMutations";
import { useRoster, type ProjectWithCounts } from "../hooks/useProjectsData";
import { tonightDateISO } from "@/lib/shiftbuilder/tasksAdapter";

/**
 * Single-line quick add — the 80% path (plan sec 5.3). Type a title, Enter
 * creates it due tonight; the assignee/project chips are optional refinements,
 * not a modal gate.
 */
export function TaskQuickAdd({
  projectId,
  projects,
  canManage,
}: {
  projectId: string | null;
  projects: ProjectWithCounts[];
  canManage: boolean;
}) {
  const [title, setTitle] = useState("");
  const [assigneeTmId, setAssigneeTmId] = useState<string>("");
  const [assigneeName, setAssigneeName] = useState("");
  const [targetProjectId, setTargetProjectId] = useState<string>(projectId ?? "");
  const [syncedProjectId, setSyncedProjectId] = useState<string | null>(projectId);
  const [slot, setSlot] = useState<SlotSelection>({ slotKey: null, slotType: null, rrSide: null });
  const createTask = useCreateTask();
  const { data: roster } = useRoster();
  const titleRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.matches("input, textarea, select, [contenteditable='true']");
      if (isTyping || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "/" || event.key.toLocaleLowerCase() === "n") {
        event.preventDefault();
        titleRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Adopt the sidebar's selected project as the default target whenever it
  // changes, without overriding an in-progress manual pick — adjusted during
  // render (see TaskDetailContent.tsx for the same pattern), not in an effect.
  if (projectId !== syncedProjectId) {
    setSyncedProjectId(projectId);
    setTargetProjectId(projectId ?? "");
  }

  if (!canManage) return null;

  const submit = async () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    await createTask.mutateAsync({
      title: trimmed,
      projectId: targetProjectId || null,
      assigneeTmId: assigneeTmId || null,
      dueDate: tonightDateISO(),
      slotKey: slot.slotKey,
      slotType: slot.slotType,
      rrSide: slot.rrSide,
    });
    setTitle("");
    setSlot({ slotKey: null, slotType: null, rrSide: null });
  };

  return (
    <div className="sb-projects-card flex items-center gap-2 px-3 py-2">
      <Plus size={16} strokeWidth={2.4} className="shrink-0 text-[var(--sb-projects-accent)]" />
      <input
        ref={titleRef}
        aria-label="Task title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void submit();
        }}
        placeholder="Add a task — due tonight by default…"
        className="h-8 min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-[var(--ios-label-quaternary)]"
      />

      <div className="hidden items-center gap-1.5 sm:flex">
        <div className="flex items-center gap-1 rounded-md border border-[var(--sb-settings-border-paper)] px-1.5 py-1">
          <FolderKanban size={12} className="text-[var(--ios-label-tertiary)]" />
          <select
            aria-label="Task project"
            value={targetProjectId}
            onChange={(e) => setTargetProjectId(e.target.value)}
            className="bg-transparent text-[11px] outline-none"
          >
            <option value="">No project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1 rounded-md border border-[var(--sb-settings-border-paper)] px-1.5 py-1">
          <User size={12} className="text-[var(--ios-label-tertiary)]" />
          <input
            aria-label="Task assignee"
            list="task-quick-add-roster"
            value={assigneeName}
            onChange={(event) => {
              const name = event.target.value;
              setAssigneeName(name);
              const match = (roster ?? []).find(
                (tm) => tm.name.toLocaleLowerCase() === name.trim().toLocaleLowerCase(),
              );
              setAssigneeTmId(match?.tmId ?? "");
            }}
            placeholder="Find assignee"
            className="w-[118px] bg-transparent text-[11px] outline-none placeholder:text-[var(--ios-label-quaternary)]"
          />
          <datalist id="task-quick-add-roster">
            {(roster ?? []).map((tm) => (
              <option key={tm.tmId} value={tm.name} />
            ))}
          </datalist>
        </div>

        <div className="flex items-center gap-1 rounded-md border border-[var(--sb-settings-border-paper)] px-1.5 py-1">
          <MapPin size={12} className="text-[var(--ios-label-tertiary)]" />
          <SlotSelect
            aria-label="Task location"
            slotKey={slot.slotKey}
            rrSide={slot.rrSide}
            onChange={setSlot}
            className="bg-transparent text-[11px] outline-none"
            placeholder="No location"
          />
        </div>
      </div>

      <motion.button
        type="button"
        onClick={() => void submit()}
        disabled={!title.trim() || createTask.isPending}
        whileTap={title.trim() ? premiumTap.whileTap : {}}
        className="shrink-0 rounded-md px-2.5 py-1 text-[12px] font-semibold disabled:opacity-40"
        style={{
          background: title.trim() ? "var(--sb-projects-accent)" : "var(--ios-gray-5)",
          color: title.trim() ? "white" : "var(--ios-label-tertiary)",
        }}
      >
        Add
      </motion.button>
    </div>
  );
}
