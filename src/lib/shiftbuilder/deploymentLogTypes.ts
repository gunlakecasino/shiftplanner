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

export const DEPLOYMENT_LOG_ACTION_LABELS: Record<DeploymentLogAction, string> = {
  assign: "Assign",
  unassign: "Unassign",
  lock: "Lock slot",
  unlock: "Unlock slot",
  publish: "Publish",
  unpublish: "Unpublish",
  night_lock: "Lock night",
  night_unlock: "Unlock night",
  task_add: "Add task",
  task_remove: "Remove task",
  coverage_add: "Add coverage",
  break_change: "Break change",
  task_color: "Task color",
  print: "Print",
  settings_update: "Settings update",
  team_update: "Team update",
  user_update: "User update",
  roster_update: "Roster update",
  schedule_apply: "Schedule apply",
  defaults_push: "Defaults push",
  engine_config: "Engine config",
  engine_run: "Engine run",
  task_catalog: "Task catalog",
  tm_defaults: "TM defaults",
  session_start: "Session start",
  session_end: "Session end",
  settings_nav: "Settings navigation",
};

export const ALL_DEPLOYMENT_LOG_ACTIONS = Object.keys(
  DEPLOYMENT_LOG_ACTION_LABELS,
) as DeploymentLogAction[];

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