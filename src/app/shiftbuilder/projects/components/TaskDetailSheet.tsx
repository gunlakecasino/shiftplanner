"use client";

import React from "react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { TaskDetailContent } from "./TaskDetailContent";
import type { ProjectWithCounts } from "../hooks/useProjectsData";

/**
 * A single detail surface for every viewport (foundation-slice simplification —
 * the plan's desktop-pad / tablet-sheet split collapses to one shadcn Sheet,
 * which already renders at a constrained width on desktop via sm:max-w-md and
 * full-bleed on mobile). Same content component either way.
 */
export function TaskDetailSheet({
  taskId,
  projects,
  canManage,
  canComplete,
  onClose,
}: {
  taskId: string | null;
  projects: ProjectWithCounts[];
  canManage: boolean;
  canComplete: boolean;
  onClose: () => void;
}) {
  return (
    <Sheet open={!!taskId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full p-0 sm:max-w-[420px]">
        <SheetTitle className="sr-only">Task detail</SheetTitle>
        {taskId && (
          <TaskDetailContent
            taskId={taskId}
            projects={projects}
            canManage={canManage}
            canComplete={canComplete}
            onClose={onClose}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
