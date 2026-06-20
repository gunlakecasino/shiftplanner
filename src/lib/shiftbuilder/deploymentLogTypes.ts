export type DeploymentLogAction =
  | "assign"
  | "unassign"
  | "lock"
  | "unlock"
  | "publish"
  | "unpublish"
  | "night_lock"
  | "night_unlock"
  | "task_add"
  | "task_remove"
  | "coverage_add"
  | "break_change"
  | "task_color"
  | "print";

export type DeploymentLogEntry = {
  id: string;
  nightId: string;
  nightDate: string;
  operatorName: string;
  action: DeploymentLogAction;
  slotKey: string;
  slotType: string | null;
  rrSide: string | null;
  previousTmId: string | null;
  previousTmName: string | null;
  newTmId: string | null;
  newTmName: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type DeploymentLogsResponse = {
  entries: DeploymentLogEntry[];
  operators: string[];
  nightDate: string;
};