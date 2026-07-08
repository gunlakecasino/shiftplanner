"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { FolderKanban, Plus, Inbox } from "lucide-react";
import { premiumStagger, premiumTap } from "@/lib/premiumSpring";
import { useCreateProject } from "../hooks/useTaskMutations";
import type { ProjectWithCounts } from "../hooks/useProjectsData";

export function ProjectSidebar({
  projects,
  loading,
  selectedProjectId,
  onSelectProject,
  canManage,
}: {
  projects: ProjectWithCounts[];
  loading: boolean;
  selectedProjectId: string | null;
  onSelectProject: (id: string | null) => void;
  canManage: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const createProject = useCreateProject();

  const submit = async () => {
    const trimmed = title.trim();
    if (!trimmed) {
      setAdding(false);
      return;
    }
    await createProject.mutateAsync({ title: trimmed });
    setTitle("");
    setAdding(false);
  };

  return (
    <div className="flex h-full w-full flex-col gap-1 overflow-y-auto pr-1">
      <button
        type="button"
        onClick={() => onSelectProject(null)}
        className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium transition-colors"
        style={{
          background: selectedProjectId === null ? "var(--sb-projects-accent-tint)" : "transparent",
          color: selectedProjectId === null ? "var(--sb-projects-accent)" : "var(--ios-label)",
        }}
      >
        <Inbox size={15} strokeWidth={2.2} />
        All Tasks
      </button>

      <div className="mt-3 mb-1 flex items-center justify-between px-2.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--ios-label-tertiary)]">
          Projects
        </span>
        {canManage && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="text-[var(--ios-label-tertiary)] hover:text-[var(--sb-projects-accent)]"
            title="New project"
          >
            <Plus size={14} strokeWidth={2.4} />
          </button>
        )}
      </div>

      {loading ? (
        <div className="space-y-1.5 px-2.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-8 animate-pulse rounded-lg bg-[var(--ios-gray-6)]" />
          ))}
        </div>
      ) : (
        projects.map((p, i) => (
          <motion.button
            key={p.id}
            type="button"
            onClick={() => onSelectProject(p.id)}
            {...premiumStagger(i)}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            whileTap={premiumTap.whileTap}
            className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium transition-colors"
            style={{
              background: selectedProjectId === p.id ? "var(--sb-projects-accent-tint)" : "transparent",
              color: selectedProjectId === p.id ? "var(--sb-projects-accent)" : "var(--ios-label)",
            }}
          >
            <span className="flex min-w-0 items-center gap-2">
              <FolderKanban size={15} strokeWidth={2.2} className="shrink-0" />
              <span className="truncate">{p.title}</span>
            </span>
            {p.taskCounts.open > 0 && (
              <span className="shrink-0 rounded-full bg-[var(--ios-gray-5)] px-1.5 text-[10px] tabular-nums text-[var(--ios-label-secondary)]">
                {p.taskCounts.open}
              </span>
            )}
          </motion.button>
        ))
      )}

      {adding && (
        <div className="mt-1 flex items-center gap-1 px-2">
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
              if (e.key === "Escape") {
                setAdding(false);
                setTitle("");
              }
            }}
            onBlur={submit}
            placeholder="Project name…"
            className="h-8 flex-1 rounded-md border border-[var(--sb-settings-border-paper)] bg-[var(--ios-background-secondary)] px-2 text-[12.5px] outline-none focus:border-[var(--sb-projects-accent)]"
          />
        </div>
      )}

      {!loading && projects.length === 0 && !adding && (
        <p className="px-2.5 py-4 text-[11.5px] leading-snug text-[var(--ios-label-tertiary)]">
          No projects yet. Tasks can also stand alone — a project is optional grouping.
        </p>
      )}
    </div>
  );
}
