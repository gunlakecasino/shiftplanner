export type DeploymentChangeAction =
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
  | "task_color";

/** @deprecated Use DeploymentChangeAction */
export type TodayChangeAction = DeploymentChangeAction;

export type DeploymentChangeInput = {
  nightId: string;
  nightDate: string;
  operatorName: string;
  action: DeploymentChangeAction;
  slotKey?: string;
  slotType?: string | null;
  rrSide?: string | null;
  previousTmId?: string | null;
  previousTmName?: string | null;
  newTmId?: string | null;
  newTmName?: string | null;
  payload?: Record<string, unknown>;
};

/** @deprecated Use DeploymentChangeInput */
export type TodayAssignmentChangeInput = DeploymentChangeInput;

const META_SLOT_KEY = "__meta__";

/** Fire-and-forget audit log for /today and Shift Builder edits. Never blocks the UI. */
export function logDeploymentChange(input: DeploymentChangeInput): void {
  const slotKey = input.slotKey?.trim() || META_SLOT_KEY;
  void fetch("/api/today/log-change", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ ...input, slotKey }),
  }).catch((e) => {
    console.warn("[deployment] change log failed (non-fatal)", e);
  });
}

/** @deprecated Use logDeploymentChange */
export const logTodayAssignmentChange = logDeploymentChange;

export const TODAY_OPERATOR_NAME_KEY = "today_operator_name";

export function readTodayOperatorName(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = sessionStorage.getItem(TODAY_OPERATOR_NAME_KEY);
    return v?.trim() || null;
  } catch {
    return null;
  }
}

export function writeTodayOperatorName(name: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(TODAY_OPERATOR_NAME_KEY, name.trim());
  } catch {}
}

export function clearTodayOperatorName(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(TODAY_OPERATOR_NAME_KEY);
  } catch {}
}