import type { DeploymentLogEntry } from "./types";

const ACTION_LABEL: Record<DeploymentLogEntry["action"], string> = {
  assign: "Assigned",
  unassign: "Cleared",
  lock: "Locked",
  unlock: "Unlocked",
  publish: "Published",
  unpublish: "Unpublished",
  night_lock: "Day locked",
  night_unlock: "Day unlocked",
  task_add: "Task added",
  task_remove: "Task removed",
  coverage_add: "Coverage",
  break_change: "Break group",
  task_color: "Task color",
};

const ACTION_COLOR: Record<DeploymentLogEntry["action"], string> = {
  assign: "#16a34a",
  unassign: "#d97706",
  lock: "#6b7280",
  unlock: "#2563eb",
  publish: "#7c3aed",
  unpublish: "#9333ea",
  night_lock: "#475569",
  night_unlock: "#0ea5e9",
  task_add: "#059669",
  task_remove: "#b45309",
  coverage_add: "#db2777",
  break_change: "#0891b2",
  task_color: "#a855f7",
};

export function logActionLabel(action: DeploymentLogEntry["action"]): string {
  return ACTION_LABEL[action];
}

export function logActionColor(action: DeploymentLogEntry["action"]): string {
  return ACTION_COLOR[action];
}

export function describeLogEntry(entry: DeploymentLogEntry): string {
  const slot = entry.slotKey;
  const source =
    entry.payload?.source === "shiftbuilder"
      ? "Shift Builder"
      : entry.payload?.source === "today_marker_pad"
        ? "Zone Deployment Board"
        : null;

  switch (entry.action) {
    case "assign":
      return `${entry.newTmName ?? entry.newTmId ?? "TM"} → ${slot}`;
    case "unassign":
      return entry.previousTmName
        ? `${slot} (was ${entry.previousTmName})`
        : slot;
    case "lock":
    case "unlock":
      return slot;
    case "publish":
      return source ? `Schedule published (${source})` : "Schedule published for /today";
    case "unpublish":
      return source ? `Schedule unpublished (${source})` : "Schedule unpublished";
    case "night_lock":
      return "Day locked — assignments frozen";
    case "night_unlock":
      return "Day unlocked — editing enabled";
    case "task_add": {
      const label = String(entry.payload?.taskLabel ?? "task");
      return `${label} → ${slot}`;
    }
    case "task_remove": {
      const label = String(entry.payload?.taskLabel ?? "task");
      return `${label} removed from ${slot}`;
    }
    case "coverage_add": {
      const label = String(entry.payload?.taskLabel ?? `And ${entry.payload?.targetLabel ?? "slot"}`);
      const target = entry.payload?.targetKey ? ` (→ ${entry.payload.targetKey})` : "";
      return `${label} on ${slot}${target}`;
    }
    case "break_change": {
      const group = entry.payload?.breakGroup;
      return group !== undefined ? `Break group ${group} on ${slot}` : `Break group changed on ${slot}`;
    }
    case "task_color": {
      const label = String(entry.payload?.taskLabel ?? "task");
      const color = entry.payload?.color ? ` → ${entry.payload.color}` : "";
      return `${label} on ${slot}${color}`;
    }
    default:
      return slot;
  }
}

export function formatLogTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}