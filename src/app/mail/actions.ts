"use server";

/**
 * Mail + Cyrus integration actions.
 * Provides data for the Mail surfaces (list / radial) and wires the Cyrus AI suggestions
 * into email_organization and the task system.
 *
 * Reuses enrichEmailWithCyrus from the core intelligence layer.
 */

import { supabase } from "@/lib/supabase";
import {
  enrichEmailWithCyrus,
  acceptCyrusTaskSuggestion,
  acceptCyrusProjectSuggestion,
} from "../cyrus/actions";

// Shared types live in a plain module (safe for client + server, avoids "use server" export restrictions).
import type {
  CyrusSuggestion,
  EnrichResult,
  MailEmail,
  MailEmailDetail,
  MailListItem,
} from "@/lib/cyrus/types";

// NOTE: We intentionally do NOT re-export the cyrus accept* functions here.
// Re-exporting non-async (or any) values from a "use server" file is forbidden by Next/Turbopack.
// Consumers that need the cyrus-specific accepts import them directly from @/app/cyrus/actions.

// Re-export the Mail surface types from the shared module so existing client imports
// (mail/page.tsx etc.) that pull types from "./actions" continue to work without changes.
export type { MailEmail, MailEmailDetail, MailListItem };

// ---------------------------------------------------------------------------
// List fetching (for Classic list and as base for radial)
// ---------------------------------------------------------------------------

export async function getRecentEmails(limit = 60, search?: string): Promise<MailListItem[]> {
  let query = (supabase.from("gunlakecasino_emails") as any)
    .select("message_id, subject, sender_name, sender_email, received_at, content_excerpt, has_attachments, is_read")
    .order("received_at", { ascending: false })
    .limit(limit);

  if (search && search.trim()) {
    const q = `%${search.trim()}%`;
    query = query.or(`subject.ilike.${q},sender_name.ilike.${q},sender_email.ilike.${q}`);
  }

  const { data: emails, error } = await query;
  if (error) {
    console.error("[mail] getRecentEmails error:", error);
    return [];
  }

  if (!emails || emails.length === 0) return [];

  // Fetch org rows for these emails to attach cluster/status/priority/conf (from jsonb or separate)
  const ids = emails.map((e: any) => e.message_id).filter(Boolean);
  let orgById = new Map<string, any>();

  try {
    const { data: orgs } = await (supabase.from("email_organization") as any)
      .select("message_id, email_id, cluster, status, priority, cyrus_suggestion, cyrus_suggested_at, linked_person_id")
      .in("message_id", ids);

    if (orgs) {
      for (const o of orgs) {
        const key = o.message_id || o.email_id;
        if (key) orgById.set(key, o);
      }
    }
  } catch (e) {
    // org table may not exist yet
  }

  // Also pull latest ai suggestion confidence for display badge
  let confById = new Map<string, number>();
  try {
    const { data: suggs } = await (supabase.from("ai_email_suggestions") as any)
      .select("email_id, confidence, created_at")
      .in("email_id", ids)
      .order("created_at", { ascending: false });

    if (suggs) {
      for (const s of suggs) {
        if (!confById.has(s.email_id)) {
          confById.set(s.email_id, s.confidence);
        }
      }
    }
  } catch {}

  return emails.map((e: any): MailListItem => {
    const key = e.message_id;
    const org = orgById.get(key);
    const suggestion = org?.cyrus_suggestion as CyrusSuggestion | undefined;

    const enriched = !!(org?.cyrus_suggested_at || org?.cyrus_suggestion || confById.has(key));
    const hasPending = !!(suggestion && (
      (Array.isArray(suggestion.suggested_tasks) && suggestion.suggested_tasks.length > 0) ||
      (Array.isArray(suggestion.action_items) && suggestion.action_items.length > 0) ||
      suggestion.suggested_project
    ));

    return {
      ...e,
      cluster: org?.cluster || suggestion?.cluster || null,
      status: org?.status || suggestion?.status || null,
      priority: org?.priority || suggestion?.priority || null,
      cyrusConfidence: confById.get(key) ?? suggestion?.confidence ?? null,
      cyrus_enriched: enriched,
      has_pending_suggestions: hasPending,
      cyrus_suggested_at: org?.cyrus_suggested_at || null,
    };
  });
}

// ---------------------------------------------------------------------------
// Detail + Cyrus enrichment lookup (checks both ai_email_suggestions and org jsonb)
// ---------------------------------------------------------------------------

export async function getEmailDetail(emailId: string): Promise<MailEmailDetail | null> {
  const { data: email } = await (supabase.from("gunlakecasino_emails") as any)
    .select("message_id, subject, sender_name, sender_email, received_at, content_excerpt, has_attachments, is_read, full_content")
    .or(`message_id.eq.${emailId},id.eq.${emailId}`)
    .maybeSingle();

  if (!email) return null;

  const key = email.message_id || emailId;

  // Try ai_email_suggestions first (full historical record)
  let enrichment: CyrusSuggestion | null = null;
  try {
    const { data: sugg } = await (supabase.from("ai_email_suggestions") as any)
      .select("suggestion, confidence, created_at")
      .eq("email_id", key)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sugg?.suggestion) {
      enrichment = sugg.suggestion as CyrusSuggestion;
    }
  } catch {}

  // Fallback to jsonb on organization
  let organization: any = null;
  if (!enrichment) {
    try {
      const { data: org } = await (supabase.from("email_organization") as any)
        .select("*")
        .or(`message_id.eq.${key},email_id.eq.${key}`)
        .maybeSingle();
      organization = org || null;
      if (org?.cyrus_suggestion) {
        enrichment = org.cyrus_suggestion as CyrusSuggestion;
      }
    } catch {}
  } else {
    // still fetch org if we want linked_person_id etc.
    try {
      const { data: org } = await (supabase.from("email_organization") as any)
        .select("*")
        .or(`message_id.eq.${key},email_id.eq.${key}`)
        .maybeSingle();
      organization = org || null;
    } catch {}
  }

  // Resolve linked person name for display
  let linkedPerson: { id: string; name: string } | null = null;
  const personId = enrichment?.linked_person_id || organization?.linked_person_id;
  if (personId) {
    try {
      const { data: ent } = await (supabase.from("entities") as any)
        .select("id, name, display_name")
        .eq("id", personId)
        .maybeSingle();
      if (ent) {
        linkedPerson = { id: ent.id, name: ent.name || ent.display_name || ent.id };
      }
    } catch {}
  }

  return {
    email: {
      message_id: key,
      subject: email.subject,
      sender_name: email.sender_name,
      sender_email: email.sender_email,
      received_at: email.received_at,
      content_excerpt: email.content_excerpt || (email.full_content ? email.full_content.slice(0, 800) : null),
      has_attachments: email.has_attachments,
      is_read: email.is_read,
    },
    enrichment,
    organization,
    linkedPerson,
  };
}

// ---------------------------------------------------------------------------
// Enrich wrapper (calls core intelligence + returns fresh detail)
// ---------------------------------------------------------------------------

export async function enrichEmail(emailId: string): Promise<EnrichResult & { detail?: MailEmailDetail | null }> {
  const result = await enrichEmailWithCyrus(emailId);
  const detail = await getEmailDetail(emailId);
  return { ...result, detail };
}

// ---------------------------------------------------------------------------
// Accept / mutate actions for the suggestion UI
// ---------------------------------------------------------------------------

export async function acceptCyrusClusterStatus(
  emailId: string,
  cluster: string,
  status: string,
  priority: number
): Promise<void> {
  const now = new Date().toISOString();
  await (supabase.from("email_organization") as any).upsert(
    {
      message_id: emailId,
      email_id: emailId,
      cluster,
      status,
      priority,
      user_decision_at: now,
      updated_at: now,
    },
    { onConflict: "message_id" }
  );
}

export async function acceptLinkedPerson(emailId: string, personId: string | null): Promise<void> {
  const now = new Date().toISOString();
  await (supabase.from("email_organization") as any).upsert(
    {
      message_id: emailId,
      email_id: emailId,
      linked_person_id: personId,
      user_decision_at: now,
      updated_at: now,
    },
    { onConflict: "message_id" }
  );
}

export async function createTaskFromCyrusSuggestion(
  emailId: string,
  task: { title: string; due_date?: string; priority?: number }
): Promise<string> {
  const taskId = `task-cyrus-${emailId.slice(0, 8)}-${Date.now()}`;

  const priorityStr = task.priority && task.priority <= 2 ? "high" : "normal";

  await (supabase.from("tasks") as any).insert({
    id: taskId,
    title: task.title.slice(0, 140),
    description: `Cyrus suggestion from email ${emailId}`,
    source: "cyrus-email",
    owner: "brian",
    status: "open",
    priority: priorityStr,
    related_entity_id: null,
    due_at: task.due_date || null,
    created_at: new Date().toISOString(),
  });

  // Best-effort link for email <-> task (matches gunlakecasino_email_backend + people patterns)
  try {
    await (supabase.from("gunlakecasino_email_tasks") as any).insert({
      email_id: emailId,
      task_id: taskId,
    });
  } catch (e) {
    // junction may not exist or have different shape yet — non-fatal
  }

  // Mark in organization that a task was created from Cyrus
  try {
    const now = new Date().toISOString();
    await (supabase.from("email_organization") as any).upsert(
      {
        message_id: emailId,
        email_id: emailId,
        linked_task_id: taskId,
        updated_at: now,
      },
      { onConflict: "message_id" }
    );
  } catch {}

  return taskId;
}

export async function acceptAllHighConfidence(emailId: string, suggestion: CyrusSuggestion): Promise<void> {
  const now = new Date().toISOString();

  await (supabase.from("email_organization") as any).upsert(
    {
      message_id: emailId,
      email_id: emailId,
      cluster: suggestion.cluster,
      status: suggestion.status,
      priority: suggestion.priority,
      linked_person_id: suggestion.linked_person_id,
      user_decision_at: now,
      updated_at: now,
    },
    { onConflict: "message_id" }
  );

  // Create tasks for the suggested ones (fire sequentially, best effort)
  for (const t of suggestion.suggested_tasks || []) {
    try {
      await createTaskFromCyrusSuggestion(emailId, t);
    } catch (e) {
      console.warn("[mail] failed to create one suggested task during Accept All", e);
    }
  }
}

// Simple reject / clear for the AI suggestion (keeps the email, removes AI fields)
export async function rejectCyrusSuggestion(emailId: string): Promise<void> {
  const now = new Date().toISOString();
  await (supabase.from("email_organization") as any).upsert(
    {
      message_id: emailId,
      email_id: emailId,
      cluster: "unassigned_review",
      cyrus_suggestion: null,
      user_decision_at: now,
      updated_at: now,
    },
    { onConflict: "message_id" }
  );
}

/**
 * Returns IDs of emails that have not yet been processed by Cyrus intelligence.
 * Used for "Enrich All Unprocessed" bulk action. Scans recent emails.
 */
export async function getUnprocessedEmailIds(limit = 100): Promise<string[]> {
  let emailQuery = (supabase.from("gunlakecasino_emails") as any)
    .select("message_id")
    .order("received_at", { ascending: false })
    .limit(limit);

  const { data: emails } = await emailQuery;
  if (!emails?.length) return [];

  const ids = emails.map((e: any) => e.message_id).filter(Boolean);
  if (ids.length === 0) return [];

  const processed = new Set<string>();

  // Check email_organization for cyrus metadata (cyrus_suggested_at or cyrus_suggestion)
  try {
    const { data: orgs } = await (supabase.from("email_organization") as any)
      .select("message_id, email_id, cyrus_suggested_at, cyrus_suggestion")
      .in("message_id", ids);

    if (orgs) {
      for (const o of orgs) {
        const k = o.message_id || o.email_id;
        if (k && (o.cyrus_suggested_at || o.cyrus_suggestion)) {
          processed.add(k);
        }
      }
    }
  } catch (e) {
    // table may not exist; treat all as unprocessed
  }

  // Also check ai_email_suggestions table (historical record of enrichment)
  try {
    const { data: suggs } = await (supabase.from("ai_email_suggestions") as any)
      .select("email_id")
      .in("email_id", ids);

    if (suggs) {
      for (const s of suggs) {
        if (s.email_id) processed.add(s.email_id);
      }
    }
  } catch (e) {
    // ignore
  }

  return ids.filter((id: string) => !processed.has(id));
}
