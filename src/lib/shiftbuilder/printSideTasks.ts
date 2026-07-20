export type PrintSideTask = {
  id: string;
  title: string;
  assigneeName: string | null;
  completed: boolean;
  completedByName: string | null;
  completedAt: string | null;
};

export type PrintSideTaskRow = {
  id: string;
  title: string;
  status: string;
  priority?: string | null;
  assignee_tm_id?: string | null;
  completed_at?: string | null;
  updated_by_name?: string | null;
  created_at?: string | null;
};

const PRIORITY_RANK: Record<string, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

/**
 * Produce the stable, floor-facing task order used by both print pages.
 * Open work leads completed work; within each group urgency and age win.
 */
export function mapPrintSideTasks(
  rows: PrintSideTaskRow[],
  tmNamesById: Map<string, string> | Record<string, string> = {},
): PrintSideTask[] {
  const nameFor = (tmId: string | null | undefined): string | null => {
    if (!tmId) return null;
    if (tmNamesById instanceof Map) return tmNamesById.get(tmId) ?? tmId;
    return tmNamesById[tmId] ?? tmId;
  };

  return [...rows]
    .sort((a, b) => {
      const aDone = a.status === "complete" ? 1 : 0;
      const bDone = b.status === "complete" ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;
      const aPriority = PRIORITY_RANK[a.priority ?? "normal"] ?? PRIORITY_RANK.normal;
      const bPriority = PRIORITY_RANK[b.priority ?? "normal"] ?? PRIORITY_RANK.normal;
      if (aPriority !== bPriority) return aPriority - bPriority;
      return String(a.created_at ?? "").localeCompare(String(b.created_at ?? ""));
    })
    .map((row) => {
      const completed = row.status === "complete";
      return {
        id: row.id,
        title: row.title,
        assigneeName: nameFor(row.assignee_tm_id),
        completed,
        completedByName: completed ? row.updated_by_name?.trim() || null : null,
        completedAt: completed ? row.completed_at ?? null : null,
      };
    });
}
