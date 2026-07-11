export type TaskRowFilter = {
  nightId: string;
  slotKey: string;
  slotType?: string;
  rrSide?: string | null;
  taskLabel?: string;
  taskId?: string | null;
};

/** Prefer stable id; fall back to composite night×slot×label. */
export function preferTaskIdFilter(f: TaskRowFilter): {
  mode: "id" | "label";
  taskId?: string;
  taskLabel?: string;
} {
  const id = typeof f.taskId === "string" ? f.taskId.trim() : "";
  if (id) return { mode: "id", taskId: id };
  const label = typeof f.taskLabel === "string" ? f.taskLabel : "";
  if (!label) throw new Error("task mutation requires taskId or taskLabel");
  return { mode: "label", taskLabel: label };
}
