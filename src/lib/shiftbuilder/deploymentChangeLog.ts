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
  | "task_color"
  | "task_style"
  | "print"
  | "settings_update"
  | "team_update"
  | "user_update"
  | "roster_update"
  | "schedule_apply"
  | "defaults_push"
  | "engine_config"
  | "engine_run"
  | "task_catalog"
  | "tm_defaults"
  | "session_start"
  | "session_end"
  | "settings_nav";

export type DeploymentChangeInput = {
  nightId: string;
  nightDate: string;
  operatorName: string;
  /** Ops user id when PIN-authenticated in ShiftBuilder */
  opsUserId?: string;
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

const META_SLOT_KEY = "__meta__";

export type LogDeploymentChangeOptions = {
  /** Non-blocking feedback when the audit POST fails (network or non-2xx). */
  onFailure?: (message: string) => void;
};

async function postDeploymentChangeLog(
  body: string,
  attempt = 0,
): Promise<Response> {
  const res = await fetch("/api/shiftbuilder/log-change", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body,
  });
  if (res.ok || attempt >= 1) return res;
  if (res.status === 429 || res.status >= 500) {
    await new Promise((r) => setTimeout(r, 450));
    return postDeploymentChangeLog(body, attempt + 1);
  }
  return res;
}

/** Fire-and-forget audit log for deployment edits. Never blocks the UI. */
export function logDeploymentChange(
  input: DeploymentChangeInput,
  options?: LogDeploymentChangeOptions,
): void {
  const slotKey = input.slotKey?.trim() || META_SLOT_KEY;
  const body = JSON.stringify({ ...input, slotKey });
  void postDeploymentChangeLog(body)
    .then(async (res) => {
      if (res.ok) return;
      let detail = "";
      try {
        const parsed = (await res.json()) as { error?: string };
        detail = parsed.error?.trim() ?? "";
      } catch {
        /* ignore */
      }
      const msg = detail
        ? `Change saved but audit log failed: ${detail}`
        : "Change saved but audit log could not be recorded";
      console.warn("[deployment] change log rejected", res.status, detail);
      options?.onFailure?.(msg);
    })
    .catch((e) => {
      console.warn("[deployment] change log failed (non-fatal)", e);
      options?.onFailure?.("Change saved but audit log couldn't be recorded");
    });
}

export const DEPLOYMENT_OPERATOR_NAME_KEY = "shiftbuilder_operator_name";

export function readDeploymentOperatorName(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = sessionStorage.getItem(DEPLOYMENT_OPERATOR_NAME_KEY);
    return v?.trim() || null;
  } catch {
    return null;
  }
}

export function writeDeploymentOperatorName(name: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(DEPLOYMENT_OPERATOR_NAME_KEY, name.trim());
  } catch {}
}

export function clearDeploymentOperatorName(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(DEPLOYMENT_OPERATOR_NAME_KEY);
  } catch {}
}

