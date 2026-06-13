"use server";

import { supabase } from "@/lib/supabase";
import { callGrok } from "@/lib/xai";

/**
 * People page — Relationship & Colleague Manager
 *
 * Strictly sourced from gunlakecasino_sender_profiles (people you receive email from
 * or communicate with). This is the living view of your email-derived relationships.
 * Complements (does not replace) tm_profiles Team roster used for scheduling.
 */

export type SenderProfile = {
  entity_id: string;
  email_count: number | null;
  first_seen: string | null;
  last_seen: string | null;
  common_topics: string[] | null;
  profile_notes: string | null;
  metadata: Record<string, any> | null;
  relationships?: Record<string, any> | null;
  interaction_history?: Record<string, any> | null;
  updated_at?: string | null;
};

export type Entity = {
  id: string;
  name: string | null;
  display_name: string | null;
  entity_type: string | null; // 'person' | 'vendor' | ...
  metadata: Record<string, any> | null;
};

export type Person = {
  entity_id: string;
  name: string;
  display_name: string | null;
  email: string | null;
  entity_type: string;
  is_colleague: boolean;
  email_count: number;
  first_seen: string | null;
  last_seen: string | null;
  common_topics: string[];
  profile_notes: string | null;
  strength: number; // 0-100 computed signal (volume + recency)
  metadata: Record<string, any>;
  tone?: string | null;
};

export type EmailRow = {
  message_id: string;
  subject: string | null;
  sender_name: string | null;
  sender_email: string | null;
  received_at: string | null;
  content_excerpt: string | null;
  is_read: boolean | null;
  has_attachments: boolean | null;
  urgency?: string | null;
};

export type LinkedTask = {
  id: string;
  title: string | null;
  status: string | null;
  priority: string | null;
  created_at?: string | null;
};

export type TimelineItem =
  | { kind: "email"; at: string; email: EmailRow }
  | { kind: "task"; at: string; task: LinkedTask }
  | { kind: "note"; at: string; text: string };

export type PersonDetail = {
  person: Person;
  recentEmails: EmailRow[];
  linkedTasks: LinkedTask[];
  timeline: TimelineItem[];
  aiSummary: string | null;
};

function computeStrength(p: SenderProfile): number {
  const count = p.email_count || 0;
  const last = p.last_seen ? new Date(p.last_seen).getTime() : 0;
  const daysSince = last ? (Date.now() - last) / (1000 * 3600 * 24) : 999;
  // Volume base + recency boost (decay)
  let s = Math.min(100, Math.round((count / 30) * 70)); // 30+ emails = strong volume
  if (daysSince < 7) s = Math.min(100, s + 22);
  else if (daysSince < 21) s = Math.min(100, s + 10);
  else if (daysSince > 90) s = Math.max(5, s - 15);
  return Math.max(5, Math.min(100, s));
}

function extractTone(meta: Record<string, any> | null): string | null {
  if (!meta) return null;
  if (meta.tone) return String(meta.tone);
  if (meta.last_tone) return String(meta.last_tone);
  // Sometimes backend or extractions put it under last_email or other
  return null;
}

function extractEmail(meta: Record<string, any> | null, fallbackEntity?: Entity | null): string | null {
  if (meta?.last_email) return String(meta.last_email);
  if (meta?.email) return String(meta.email);
  const em = fallbackEntity?.metadata?.email;
  if (em) return String(em);
  return null;
}

export async function getPeople(opts: { onlyColleagues?: boolean; q?: string } = {}): Promise<Person[]> {
  const { onlyColleagues = false, q } = opts;

  // Strictly from email communication activity
  const { data: profiles, error: pErr } = await (supabase
    .from("gunlakecasino_sender_profiles") as any)
    .select("*")
    .order("last_seen", { ascending: false })
    .limit(500);

  if (pErr) {
    console.error("[people] getPeople profiles error:", pErr);
    throw new Error(`Failed to load sender profiles: ${pErr.message}`);
  }

  if (!profiles || profiles.length === 0) return [];

  // Fetch matching entities for names + type (to classify colleague vs external)
  const entityIds = Array.from(new Set(profiles.map((p: any) => p.entity_id).filter(Boolean)));
  let entitiesById = new Map<string, Entity>();

  if (entityIds.length > 0) {
    const { data: ents, error: eErr } = await (supabase.from("entities") as any)
      .select("id, name, display_name, entity_type, metadata")
      .in("id", entityIds);

    if (!eErr && ents) {
      for (const e of ents) entitiesById.set(e.id, e as Entity);
    }
  }

  let people: Person[] = profiles.map((p: any) => {
    const ent = entitiesById.get(p.entity_id) || null;
    const name = ent?.name || ent?.display_name || p.entity_id?.replace(/^gunlake-/, "") || "Unknown";
    const entity_type = ent?.entity_type || (p.metadata?.source?.includes("gunlake") ? "person" : "vendor");
    const is_colleague = entity_type === "person" || /@gunlakecasino\.com$/i.test(extractEmail(p.metadata, ent) || "");

    const person: Person = {
      entity_id: p.entity_id,
      name: String(name),
      display_name: ent?.display_name || null,
      email: extractEmail(p.metadata, ent),
      entity_type,
      is_colleague,
      email_count: Number(p.email_count || 0),
      first_seen: p.first_seen || null,
      last_seen: p.last_seen || null,
      common_topics: Array.isArray(p.common_topics) ? p.common_topics : [],
      profile_notes: p.profile_notes || null,
      strength: computeStrength(p as SenderProfile),
      metadata: (p.metadata as any) || {},
      tone: extractTone(p.metadata),
    };
    return person;
  });

  // Apply filters (client-side here for flexibility; could push down)
  if (onlyColleagues) {
    people = people.filter((p) => p.is_colleague);
  }
  if (q && q.trim()) {
    const qq = q.toLowerCase().trim();
    people = people.filter((p) =>
      p.name.toLowerCase().includes(qq) ||
      (p.email && p.email.toLowerCase().includes(qq)) ||
      (p.common_topics || []).some((t) => t.toLowerCase().includes(qq)) ||
      (p.profile_notes && p.profile_notes.toLowerCase().includes(qq))
    );
  }

  // Sort: strongest / most recent first
  people.sort((a, b) => {
    const recA = a.last_seen ? new Date(a.last_seen).getTime() : 0;
    const recB = b.last_seen ? new Date(b.last_seen).getTime() : 0;
    if (recB !== recA) return recB - recA;
    return (b.email_count || 0) - (a.email_count || 0);
  });

  return people;
}

export async function getPersonDetail(entity_id: string): Promise<PersonDetail> {
  // Profile + entity
  const { data: profRows } = await (supabase
    .from("gunlakecasino_sender_profiles") as any)
    .select("*")
    .eq("entity_id", entity_id)
    .limit(1);

  const profile: SenderProfile | null = (profRows && profRows[0]) || null;

  const { data: entRows } = await (supabase.from("entities") as any)
    .select("id, name, display_name, entity_type, metadata")
    .eq("id", entity_id)
    .limit(1);

  const ent: Entity | null = (entRows && entRows[0]) || null;

  const basePerson = (await getPeople({})).find((p) => p.entity_id === entity_id) || {
    entity_id,
    name: ent?.name || ent?.display_name || entity_id,
    display_name: ent?.display_name || null,
    email: extractEmail(profile?.metadata || null, ent),
    entity_type: ent?.entity_type || "person",
    is_colleague: (ent?.entity_type || "person") === "person",
    email_count: profile?.email_count || 0,
    first_seen: profile?.first_seen || null,
    last_seen: profile?.last_seen || null,
    common_topics: profile?.common_topics || [],
    profile_notes: profile?.profile_notes || null,
    strength: profile ? computeStrength(profile) : 30,
    metadata: profile?.metadata || {},
    tone: extractTone(profile?.metadata || null),
  } as Person;

  // Recent emails for this sender (via entity or direct email match)
  let emails: EmailRow[] = [];
  try {
    const emailQ = (supabase.from("gunlakecasino_emails") as any)
      .select("message_id, subject, sender_name, sender_email, received_at, content_excerpt, is_read, has_attachments")
      .eq("sender_entity_id", entity_id)
      .order("received_at", { ascending: false })
      .limit(25);

    const { data: ems } = await emailQ;
    if (ems) {
      emails = ems as EmailRow[];
    }
  } catch (e) {
    // table/column variance is common early — fall back to sender_email if needed
    const emailAddr = basePerson.email;
    if (emailAddr) {
      const { data: ems2 } = await (supabase.from("gunlakecasino_emails") as any)
        .select("message_id, subject, sender_name, sender_email, received_at, content_excerpt, is_read, has_attachments")
        .eq("sender_email", emailAddr)
        .order("received_at", { ascending: false })
        .limit(25);
      emails = (ems2 as EmailRow[]) || [];
    }
  }

  // Try to enrich with extraction urgency for display (best effort)
  // (We keep it light; full extractions can be joined in a follow-up if needed.)

  // Linked tasks via gunlakecasino_email_tasks + tasks (or direct related_entity_id)
  let linkedTasks: LinkedTask[] = [];
  try {
    const { data: linkRows } = await (supabase.from("gunlakecasino_email_tasks") as any)
      .select("task_id")
      .limit(50);

    if (linkRows && linkRows.length) {
      const taskIds = linkRows.map((r: any) => r.task_id).filter(Boolean);
      if (taskIds.length) {
        const { data: tks } = await (supabase.from("tasks") as any)
          .select("id, title, status, priority, created_at")
          .in("id", taskIds)
          .order("created_at", { ascending: false })
          .limit(20);
        linkedTasks = (tks as LinkedTask[]) || [];
      }
    }
  } catch {}

  // Also catch tasks that used related_entity_id directly (from the py sync)
  try {
    const { data: direct } = await (supabase.from("tasks") as any)
      .select("id, title, status, priority, created_at")
      .eq("related_entity_id", entity_id)
      .order("created_at", { ascending: false })
      .limit(10);
    if (direct) {
      const existing = new Set(linkedTasks.map((t) => t.id));
      for (const d of direct as any[]) {
        if (!existing.has(d.id)) linkedTasks.push(d as LinkedTask);
      }
    }
  } catch {}

  // Build mixed timeline (emails + tasks + notes from profile_notes)
  const timeline: TimelineItem[] = [];

  for (const e of emails) {
    if (e.received_at) {
      timeline.push({ kind: "email", at: e.received_at, email: e });
    }
  }
  for (const t of linkedTasks) {
    const at = t.created_at || basePerson.last_seen || new Date().toISOString();
    timeline.push({ kind: "task", at, task: t });
  }

  // Parse simple notes out of profile_notes (lines starting with — or [date] User:)
  const notesText = basePerson.profile_notes || "";
  const noteLines = notesText
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => /^[-—\[]/.test(l) || /user[:：]/i.test(l));
  for (const line of noteLines.slice(0, 8)) {
    timeline.push({ kind: "note", at: basePerson.last_seen || new Date().toISOString(), text: line });
  }

  timeline.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  // AI summary: prefer cached in metadata, otherwise null (generate on demand)
  const aiSummary =
    (basePerson.metadata?.relationship_summary as string) ||
    (basePerson.metadata?.ai_summary as string) ||
    null;

  return {
    person: basePerson,
    recentEmails: emails,
    linkedTasks,
    timeline: timeline.slice(0, 60),
    aiSummary,
  };
}

export async function updatePerson(
  entity_id: string,
  patch: { profile_notes?: string | null; metadata?: Record<string, any> }
): Promise<void> {
  const payload: any = { updated_at: new Date().toISOString() };
  if (patch.profile_notes !== undefined) payload.profile_notes = patch.profile_notes;
  if (patch.metadata) {
    // Merge into existing metadata
    const { data: current } = await (supabase.from("gunlakecasino_sender_profiles") as any)
      .select("metadata")
      .eq("entity_id", entity_id)
      .maybeSingle();
    const merged = { ...(current?.metadata || {}), ...patch.metadata };
    payload.metadata = merged;
  }

  const { error } = await (supabase.from("gunlakecasino_sender_profiles") as any)
    .update(payload)
    .eq("entity_id", entity_id);

  if (error) throw new Error(`updatePerson failed: ${error.message}`);
}

export async function addNoteForPerson(entity_id: string, note: string): Promise<void> {
  if (!note || !note.trim()) return;
  const text = note.trim();
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");

  const { data: row } = await (supabase.from("gunlakecasino_sender_profiles") as any)
    .select("profile_notes")
    .eq("entity_id", entity_id)
    .maybeSingle();

  const existing = (row?.profile_notes as string) || "";
  const appended = existing
    ? `${existing}\n— ${stamp} • ${text}`
    : `— ${stamp} • ${text}`;

  await updatePerson(entity_id, { profile_notes: appended });
}

export async function generateRelationshipSummary(entity_id: string): Promise<string> {
  const detail = await getPersonDetail(entity_id);
  const p = detail.person;

  const recent = detail.recentEmails
    .slice(0, 6)
    .map(
      (e) =>
        `${e.received_at?.slice(0, 10)}: ${e.subject || "(no subject)"} — ${(e.content_excerpt || "").slice(0, 160)}`
    )
    .join("\n");

  const topics = (p.common_topics || []).join(", ");
  const notes = p.profile_notes ? `\nExisting notes:\n${p.profile_notes.slice(0, 800)}` : "";

  const prompt = `You are an elite executive assistant and relationship analyst for the Director of Operations at Gun Lake Casino Resort.

Person: ${p.name} (${p.email || "no email"}) — ${p.is_colleague ? "Internal colleague" : "External relationship / vendor"}
Email volume: ${p.email_count} messages. First contact: ${p.first_seen?.slice(0, 10) || "unknown"}. Last contact: ${p.last_seen?.slice(0, 10) || "unknown"}.
Key topics seen: ${topics || "none extracted yet"}.${notes}

Recent communications (most recent first):
${recent || "(no recent body available)"}

Write a crisp, actionable 4–6 sentence relationship summary. Include:
- Overall strength and cadence of the relationship
- Observed tone / communication style (direct, collaborative, escalatory, etc.)
- What this person cares about / recurring themes
- One concrete recommended next step or approach for the ops leader

Keep it professional, specific, and free of corporate fluff. Output only the summary paragraph(s).`;

  const { content } = await callGrok(
    [
      { role: "system", content: "You are a precise, high-signal ops analyst. Be direct and useful." },
      { role: "user", content: prompt },
    ],
    { temperature: 0.4, maxTokens: 700, reasoningEffort: "low" }
  );

  const summary = (content || "").trim();

  if (summary) {
    // Persist into metadata so it lives with the profile
    const { data: current } = await (supabase.from("gunlakecasino_sender_profiles") as any)
      .select("metadata")
      .eq("entity_id", entity_id)
      .maybeSingle();

    const meta = { ...(current?.metadata || {}), relationship_summary: summary, ai_summary_updated_at: new Date().toISOString() };
    await updatePerson(entity_id, { metadata: meta });
  }

  return summary;
}

export async function createTaskForPerson(entity_id: string, title: string, description?: string): Promise<string> {
  const p = (await getPeople({})).find((x) => x.entity_id === entity_id);
  const taskId = `task-person-${entity_id}-${Date.now()}`;

  const { error } = await (supabase.from("tasks") as any).insert({
    id: taskId,
    title: title.slice(0, 140),
    description: description || `Follow-up with ${p?.name || entity_id} (from People relationship manager)`,
    source: "people-relationship",
    owner: "brian",
    status: "open",
    priority: "normal",
    related_entity_id: entity_id,
    created_at: new Date().toISOString(),
  });

  if (error) throw new Error(`createTaskForPerson: ${error.message}`);

  // Best-effort link (no email id here, but the junction is optional)
  try {
    await (supabase.from("gunlakecasino_email_tasks") as any).insert({
      email_id: null,
      task_id: taskId,
    });
  } catch {}

  return taskId;
}
