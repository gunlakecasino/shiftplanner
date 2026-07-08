import { formatLocalDateISO, currentShiftDate } from "./dateUtils";
import {
  logDeploymentChange,
  type DeploymentChangeAction,
} from "./deploymentChangeLog";

export type OpsAuditAction = DeploymentChangeAction;

export type OpsAuditInput = {
  action: OpsAuditAction;
  operatorName: string;
  opsUserId?: string;
  nightId?: string | null;
  nightDate?: string;
  slotKey?: string;
  previousTmId?: string | null;
  previousTmName?: string | null;
  newTmId?: string | null;
  newTmName?: string | null;
  payload?: Record<string, unknown>;
};

// Kept in sync with the same fix in opsAuditLog.server.ts — this table's
// night_id column is a NOT NULL uuid, so the sentinel must be a real uuid
// (the nil UUID), not an arbitrary string, or every settings-scoped write
// fails silently with a 500 from /api/shiftbuilder/log-change.
const SETTINGS_NIGHT_ID = "00000000-0000-0000-0000-000000000000";

/** Resolve audit night context — settings mutations use a synthetic night row. */
export function resolveAuditNightContext(
  nightId?: string | null,
  nightDate?: string,
): { nightId: string; nightDate: string } {
  return {
    nightId: nightId?.trim() || SETTINGS_NIGHT_ID,
    nightDate: nightDate?.trim() || formatLocalDateISO(currentShiftDate()),
  };
}

/** Fire-and-forget audit log for any ops action (board, settings, session). */
export function logOpsAudit(input: OpsAuditInput, onFailure?: (msg: string) => void): void {
  const ctx = resolveAuditNightContext(input.nightId, input.nightDate);
  logDeploymentChange(
    {
      nightId: ctx.nightId,
      nightDate: ctx.nightDate,
      operatorName: input.operatorName,
      opsUserId: input.opsUserId,
      action: input.action,
      slotKey: input.slotKey,
      previousTmId: input.previousTmId,
      previousTmName: input.previousTmName,
      newTmId: input.newTmId,
      newTmName: input.newTmName,
      payload: input.payload,
    },
    onFailure ? { onFailure } : undefined,
  );
}

export function operatorDisplayName(user: {
  full_name?: string | null;
  username?: string | null;
} | null | undefined): string {
  return user?.full_name?.trim() || user?.username?.trim() || "Operator";
}

/** Settings-area mutations — always tagged with source + tab. */
export function logSettingsAudit(params: {
  tab: string;
  action: OpsAuditAction;
  operator: { id?: string; full_name?: string | null; username?: string | null } | null;
  nightId?: string | null;
  nightDate?: string;
  slotKey?: string;
  details?: Record<string, unknown>;
}): void {
  logOpsAudit({
    action: params.action,
    operatorName: operatorDisplayName(params.operator),
    opsUserId: params.operator?.id,
    nightId: params.nightId,
    nightDate: params.nightDate,
    slotKey: params.slotKey,
    payload: {
      source: "settings",
      tab: params.tab,
      ...params.details,
    },
  });
}