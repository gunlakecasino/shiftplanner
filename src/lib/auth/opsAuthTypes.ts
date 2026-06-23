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
  canRunEngine: boolean;
  canManageTeam: boolean;
  /** Marker: floor viewer — edits limited to published nights (stored on legacy DB role). */
  canEditPublishedOnly: boolean;
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