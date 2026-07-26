"use client";

import React from "react";
import {
  type BoardProjectPill,
  useBoardTasksStore,
  useSlotProjects,
  useTmProjects,
} from "../hooks/useBoardTaskSummary";

export function combinedProjects(
  tmProjects: BoardProjectPill[],
  slotProjects: BoardProjectPill[],
): BoardProjectPill[] {
  const byId = new Map<string, BoardProjectPill>();
  [...tmProjects, ...slotProjects].forEach((project) => {
    if (!byId.has(project.projectId)) byId.set(project.projectId, project);
  });
  return [...byId.values()];
}

export function CardProjectPills({
  tmId,
  slotKey,
  className = "",
}: {
  tmId: string | null | undefined;
  /** DB slot composite, such as zone_7 or rr_7|womens. */
  slotKey?: string | null;
  className?: string;
}) {
  const hidden = useBoardTasksStore((state) => state.hidden);
  const tmProjects = useTmProjects(tmId);
  const slotProjects = useSlotProjects(slotKey);
  const projects = combinedProjects(tmProjects, slotProjects);

  if (hidden || projects.length === 0) return null;

  return (
    <div
      className={`sb-card-project-pills no-print flex flex-wrap items-center gap-1 min-w-0 ${className}`.trim()}
      aria-label={`Projects: ${projects.map((project) => project.title).join(", ")}`}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {projects.map((project) => (
        <span
          key={project.projectId}
          className="sb-card-project-pill inline-flex h-[15px] max-w-[170px] items-center rounded-full px-2.5 text-[8px] font-extrabold uppercase leading-none tracking-[-0.01em] text-white"
          style={{ backgroundColor: project.color }}
          title={project.title}
        >
          <span className="truncate">{project.title}</span>
        </span>
      ))}
    </div>
  );
}
