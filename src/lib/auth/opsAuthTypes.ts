export type OpsRole =
  | "viewer"
  | "sudo_admin"
  | "admin"
  | "ops_director"
  | "ops_manager"
  | "ops_super"
  | "graves_ops_super"
  | "days_ops_super"
  | "swings_ops_super"
  | "utility_ops_super";

export interface ShiftBuilderPermissions {
  canEditAssignments: boolean;
  canLockUnlock: boolean;
  canApplySchedules: boolean;
  canPublish: boolean;
  canSeeDraftData: boolean;
  canAccessSudo: boolean;
  /** Admin role — /shiftbuilder/reports placement analytics. */
  canAccessReports: boolean;
  canRunEngine: boolean;
  canManageTeam: boolean;
  /**
   * Floor viewer marker — when true (and canSeeDraftData is false), read and write
   * paths are gated to published nights only. Also used for legacy DB accounts
   * stored as utility_ops_super + this flag. Prefer isPublishedOnlyViewer() in app code.
   */
  canEditPublishedOnly: boolean;
  /** Reserved bit — Projects app retired. Standing OL tasks live in Card Defaults. */
  canAccessTasks: boolean;
  /** Create/edit/assign/delete any Ops Task or Project; complete tasks assigned to others. */
  canManageTasks: boolean;
  /** Mark tasks assigned to *you* complete without full canManageTasks. */
  canCompleteOwnTasks: boolean;
  /**
   * Submit task *requests* from the main board (owner-scoped intake).
   * A narrow door, independent of canAccessTasks: the requester can create and
   * manage only the items they themselves created; requests land pending a
   * manager's approval. The Projects app is retired.
   */
  canRequestTasks: boolean;
}

export interface OpsUser {
  id: string;
  email: string;
  full_name: string;
  username: string;
  role: OpsRole;
  permissions?: Partial<ShiftBuilderPermissions> | null;
  must_change_pin?: boolean;
}