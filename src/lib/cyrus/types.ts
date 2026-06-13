/**
 * Shared Cyrus + Mail types.
 * These live outside any "actions.ts" so they are freely importable from both
 * server action modules and client components without "use server" restrictions
 * or Turbopack client-bundling issues.
 */

export type CyrusCluster =
  | "todays_priority"
  | "gun_lake_ops"
  | "staffing_hr"
  | "vendors_contracts"
  | "marketing_events"
  | "unassigned_review";

export type CyrusStatus = "needs_action" | "waiting" | "fyi" | "done";

export interface CyrusSuggestion {
  cluster: CyrusCluster;
  status: CyrusStatus;
  priority: number; // 1 (highest) - 5
  linked_person_id: string | null; // exact entity id from context or null
  suggested_tasks: Array<{
    title: string;
    due_date?: string;
    priority?: number;
  }>;
  suggested_project: { title?: string; phase?: string } | null;
  action_items: string[];
  summary: string;
  tone: string;
  confidence: number; // 0.0 - 1.0
  // Optional fields seen in runtime data
  linked_task_id?: string | null;
  linked_project_id?: string | null;
}

export interface EnrichResult {
  success: boolean;
  suggestion?: CyrusSuggestion;
  emailId: string;
  usage?: any;
  error?: string;
}

// ---------------------------------------------------------------------------
// Mail surface types (used by mail page + Cyrus integration)
// ---------------------------------------------------------------------------

export interface MailEmail {
  message_id: string;
  subject: string | null;
  sender_name: string | null;
  sender_email: string | null;
  received_at: string | null;
  content_excerpt: string | null;
  has_attachments: boolean | null;
  is_read: boolean | null;
}

export interface MailEmailDetail {
  email: MailEmail;
  enrichment: CyrusSuggestion | null;
  organization: any | null; // raw email_organization row if present
  linkedPerson: { id: string; name: string } | null;
}

export interface MailListItem extends MailEmail {
  cluster?: string | null;
  status?: string | null;
  priority?: number | null;
  cyrusConfidence?: number | null;
  cyrus_enriched?: boolean;
  has_pending_suggestions?: boolean;
  cyrus_suggested_at?: string | null;
}
