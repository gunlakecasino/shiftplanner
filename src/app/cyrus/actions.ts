"use server";

/**
 * Cyrus Core Intelligence Layer — Email Enrichment
 *
 * Server action: enrichEmailWithCyrus(emailId)
 *
 * - Fetches gunlakecasino_emails + gunlakecasino_email_extractions
 * - Pulls lightweight live context (ops_work_items projects, entities/people)
 * - Calls xAI (Grok) using the project's AI SDK setup + structured outputs (generateObject + zod)
 * - Persists:
 *    • Core fields (cluster/status/priority/linked_person_id) + full suggestion blob into email_organization
 *    • Full suggestion record into ai_email_suggestions (for audit/history)
 * - High-confidence person linking: ensures entity exists (creates minimal gunlake-* stub from sender when appropriate)
 * - Idempotent and safe to re-run
 * - Strong logging + defensive error handling
 *
 * The 6 clusters match the Mail radial / organization system used across Cyrus surfaces.
 */

import { supabase } from "@/lib/supabase";
import { generateObject } from "ai";
import { createGrokModel } from "@/lib/shiftbuilder/grokClient";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
}

export interface EnrichResult {
  success: boolean;
  suggestion?: CyrusSuggestion;
  emailId: string;
  usage?: any;
  error?: string;
}

// ---------------------------------------------------------------------------
// Structured output schema (Zod). generateObject will enforce this.
// ---------------------------------------------------------------------------

const CyrusEnrichmentSchema = z.object({
  cluster: z.enum([
    "todays_priority",
    "gun_lake_ops",
    "staffing_hr",
    "vendors_contracts",
    "marketing_events",
    "unassigned_review",
  ]),
  status: z.enum(["needs_action", "waiting", "fyi", "done"]),
  priority: z.number().int().min(1).max(5),
  linked_person_id: z.string().nullable(),
  suggested_tasks: z.array(
    z.object({
      title: z.string().min(3),
      due_date: z.string().optional(), // ISO date when obvious
      priority: z.number().int().min(1).max(5).optional(),
    })
  ),
  suggested_project: z
    .object({
      title: z.string().optional(),
      phase: z.string().optional(),
    })
    .nullable(),
  action_items: z.array(z.string()),
  summary: z.string().min(1),
  tone: z.string().min(1),
  confidence: z.number().min(0).max(1),
});

// ---------------------------------------------------------------------------
// Main server action
// ---------------------------------------------------------------------------

export async function enrichEmailWithCyrus(emailId: string): Promise<EnrichResult> {
  const started = Date.now();
  console.log(`[cyrus] enrichEmailWithCyrus start`, { emailId });

  if (!emailId || typeof emailId !== "string") {
    throw new Error("enrichEmailWithCyrus: emailId (string) is required");
  }

  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    const msg = "XAI_API_KEY is not set in environment. Cyrus intelligence requires it.";
    console.error("[cyrus]", msg);
    return { success: false, emailId, error: msg };
  }

  try {
    // -----------------------------------------------------------------------
    // 1. Fetch the email + any existing extraction (lightweight, idempotent)
    // -----------------------------------------------------------------------
    const { data: email, error: emailErr } = await (supabase
      .from("gunlakecasino_emails") as any)
      .select("*")
      .or(`message_id.eq.${emailId},id.eq.${emailId}`)
      .maybeSingle();

    if (emailErr) {
      console.warn("[cyrus] gunlakecasino_emails fetch warning:", emailErr.message);
    }
    if (!email) {
      throw new Error(`Email not found in gunlakecasino_emails for identifier="${emailId}"`);
    }

    const { data: extraction } = await (supabase
      .from("gunlakecasino_email_extractions") as any)
      .select("*")
      .or(
        `email_id.eq.${emailId},message_id.eq.${emailId},email_id.eq.${email.message_id || emailId}`
      )
      .maybeSingle();

    // -----------------------------------------------------------------------
    // 2. Lightweight context pulls (recent projects + people)
    //    These are intentionally small and fast.
    // -----------------------------------------------------------------------
    let recentProjects: any[] = [];
    try {
      const res = await (supabase.from("ops_work_items") as any)
        .select("id, title, name, description, status, work_type, updated_at, metadata")
        .or("work_type.eq.project,status.eq.active,status.eq.in_progress")
        .order("updated_at", { ascending: false })
        .limit(12);
      recentProjects = res.data || [];
    } catch (ctxErr: any) {
      console.warn("[cyrus] ops_work_items context fetch failed (table may not exist yet or permissions):", ctxErr?.message);
    }

    let recentEntities: any[] = [];
    try {
      const res = await (supabase.from("entities") as any)
        .select("id, name, display_name, entity_type, metadata, updated_at")
        .order("updated_at", { ascending: false })
        .limit(35);
      recentEntities = res.data || [];
    } catch (ctxErr: any) {
      console.warn("[cyrus] entities context fetch failed:", ctxErr?.message);
    }

    // -----------------------------------------------------------------------
    // 3. Strong system prompt + data payload for the model
    // -----------------------------------------------------------------------
    const systemPrompt = `You are Cyrus — Brian's private, high-signal AI work companion and intelligence layer for Gun Lake Casino Resort operations.

BRIAN'S ROLE & PRIORITIES (always internalize this):
- Title: Operations Director, Gun Lake Casino Resort
- Primary theater: Graveyard shift + Internal Maintenance
- Core focus areas: Zone deployment & coverage, staffing/labor fairness & rotation health, vendor & contract performance, events & entertainment execution, facilities & preventive maintenance, risk reduction, clear ownership and follow-through.
- Values: Safety & compliance first. Full coverage before everything. Staff fairness. Vendor accountability. Cost awareness without sacrificing reliability. Proactive rather than reactive. Everything must have a named owner and a next action.

EMAIL CLUSTERING SYSTEM (exactly these 6 slugs — choose only one):
- "todays_priority": Time-critical items that require action today or on this shift. Deadlines, escalations, guest-impacting or coverage-breaking issues.
- "gun_lake_ops": Core internal Gun Lake operations — facilities, maintenance, zones/equipment, process/SOP work, cross-team coordination inside the resort.
- "staffing_hr": All people matters — TM issues, attendance, performance, scheduling/rotation, HR, training, morale, labor questions.
- "vendors_contracts": External suppliers, contractors, service providers, contracts, SLAs, invoices, deliveries, vendor performance or disputes.
- "marketing_events": Guest-facing, promotions, entertainment programming, casino events, marketing activations, floor experiences, partnerships that touch the guest.
- "unassigned_review": Ambiguous, low-signal, or items that do not clearly fit the above. Safe default when you are not highly confident. Human will re-cluster.

OUTPUT CONTRACT (STRICT):
Return ONLY one valid JSON object. Absolutely no surrounding text, no markdown, no \`\`\`json, no explanations.
The object must exactly match this shape (all keys required):

{
  "cluster": one of the 6 slugs above,
  "status": "needs_action" | "waiting" | "fyi" | "done",
  "priority": integer 1 (highest urgency) to 5 (lowest),
  "linked_person_id": exact id string from the provided recent people list, or null if no strong match,
  "suggested_tasks": [ { "title": short concrete title, "due_date"?: "YYYY-MM-DD", "priority"?: 1-5 } ],
  "suggested_project": { "title"?: string, "phase"?: string } | null,
  "action_items": [string, ...],
  "summary": "1-3 sentence operational summary from Brian's perspective",
  "tone": "short phrase describing communication tone (e.g. 'urgent request', 'collaborative update', 'escalation')",
  "confidence": number between 0.0 and 1.0 — your true certainty in the cluster + status + priority
}

Rules for fields:
- linked_person_id: Only return an id that appears verbatim in the "RECENT KNOWN PEOPLE / ENTITIES" list below. Choose the person who should own, be notified, or is central to the content of the email. The sender is often correct but not always (the email may be about someone else). Return null when there is no clear single person.
- suggested_tasks: Real, bite-sized, owner-implied next steps. Only include due_date when the email makes timing obvious.
- suggested_project: Only populate when the email is clearly advancing or initiating a named project/phase. Otherwise null.
- Be conservative with confidence. 0.9+ only for very clear signals.
- Use the existing extraction (if present) to avoid repeating work, but still form your own judgment.

You are precise, concise, and optimized for an ops leader who reads hundreds of these.`;

    const truncatedBody = (email.full_content || email.content_excerpt || "").slice(0, 5200);

    const userPayload = `
EMAIL DETAILS:
- message_id: ${email.message_id || emailId}
- sender: ${email.sender_name || "Unknown"} <${email.sender_email || "unknown"}>   (entity: ${email.sender_entity_id || "n/a"})
- received_at: ${email.received_at || "n/a"}
- subject: ${email.subject || "(no subject)"}

CONTENT (truncated if long):
${truncatedBody || "(no body available)"}

${extraction ? `EXISTING AI EXTRACTION (use to inform but do not blindly copy):
summary: ${extraction.summary || ""}
key_points: ${JSON.stringify(extraction.key_points || [])}
action_items (raw): ${JSON.stringify(extraction.action_items || [])}
urgency: ${extraction.urgency || ""}
categories: ${JSON.stringify(extraction.categories || [])}
` : "NO PRIOR EXTRACTION STORED YET."}

RECENT ACTIVE / RELEVANT PROJECTS (use for suggested_project — only reference real titles):
${recentProjects.length
      ? recentProjects
          .map(
            (p: any) =>
              `- id:${p.id} title:"${p.title || p.name || "Untitled"}" status:${p.status || p.work_type || "active"}`
          )
          .join("\n")
      : "(no recent projects loaded in context)"}

RECENT KNOWN PEOPLE / ENTITIES (ONLY these ids are valid for linked_person_id):
${recentEntities.length
      ? recentEntities
          .map(
            (e: any) =>
              `- id:"${e.id}" name:"${e.name || e.display_name || "Unnamed"}" type:${e.entity_type || "unknown"} email:${e.metadata?.email || ""}`
          )
          .join("\n")
      : "(no recent entities loaded in context)"}

Analyze the email in the context of Brian's role above and output the single JSON object now.`;

    // -----------------------------------------------------------------------
    // 4. Call xAI with structured outputs (production pattern used elsewhere in the app)
    // -----------------------------------------------------------------------
    const model = createGrokModel("grok-4.3");

    const { object: rawSuggestion, usage } = await generateObject({
      model,
      schema: CyrusEnrichmentSchema,
      system: systemPrompt,
      prompt: userPayload,
      temperature: 0.15,
      // We keep reasoning effort light for classification / extraction tasks unless the user later wants deeper analysis.
    });

    const suggestion = rawSuggestion as CyrusSuggestion;

    console.log(`[cyrus] Grok structured response received`, {
      emailId,
      cluster: suggestion.cluster,
      status: suggestion.status,
      priority: suggestion.priority,
      linked: suggestion.linked_person_id,
      confidence: suggestion.confidence,
      durationMs: Date.now() - started,
    });

    // -----------------------------------------------------------------------
    // 5. Persist results (idempotent upserts)
    // -----------------------------------------------------------------------
    const now = new Date().toISOString();

    // Primary durable organization record (used by Mail radial, clustering logic, People, Tasks, Projects)
    try {
      await (supabase.from("email_organization") as any).upsert(
        {
          // Support both common conventions seen in the gunlakecasino email tables
          message_id: email.message_id || emailId,
          email_id: email.message_id || emailId,
          cluster: suggestion.cluster,
          status: suggestion.status,
          priority: suggestion.priority,
          linked_person_id: suggestion.linked_person_id,
          // Full rich suggestion for future UI surfaces (Cyrus chat, detail panes, backfills)
          cyrus_suggestion: suggestion as any,
          cyrus_suggested_at: now,
          updated_at: now,
        },
        { onConflict: "message_id" }
      );
    } catch (orgErr: any) {
      console.error("[cyrus] email_organization upsert error (non-fatal for caller):", orgErr?.message);
    }

    // Separate audit / history table for the raw AI output (great for debugging, re-training signals, cost tracking)
    try {
      await (supabase.from("ai_email_suggestions") as any).insert({
        email_id: email.message_id || emailId,
        suggestion: suggestion as any,
        model: "grok-4.3",
        confidence: suggestion.confidence,
        usage: usage || null,
        created_at: now,
      });
    } catch (suggErr: any) {
      // Table may not exist yet — this is expected in early rollout. Do not fail the whole call.
      console.warn(
        "[cyrus] ai_email_suggestions insert skipped (table probably does not exist yet — create it when you are ready):",
        suggErr?.message
      );
    }

    // -----------------------------------------------------------------------
    // 6. High-confidence person auto-resolution / creation (best effort, never throws)
    // -----------------------------------------------------------------------
    if (suggestion.linked_person_id && suggestion.confidence >= 0.72) {
      try {
        const targetId = suggestion.linked_person_id;
        const { data: existing } = await (supabase.from("entities") as any)
          .select("id")
          .eq("id", targetId)
          .maybeSingle();

        if (!existing && email.sender_email) {
          // Only create if the id follows our established gunlake- naming convention
          // and we have enough sender data from this email to make a useful stub.
          if (targetId.startsWith("gunlake-")) {
            const isInternal = (email.sender_email || "").toLowerCase().includes("@gunlakecasino.com");
            await (supabase.from("entities") as any)
              .insert({
                id: targetId,
                name: email.sender_name || targetId.replace(/^gunlake-/, ""),
                display_name: email.sender_name || targetId.replace(/^gunlake-/, ""),
                entity_type: isInternal ? "person" : "vendor",
                metadata: {
                  email: email.sender_email,
                  source: "cyrus-enrich-auto",
                  linked_from_email: email.message_id || emailId,
                  created_by: "enrichEmailWithCyrus",
                },
              })
              .then(() => {
                console.log("[cyrus] auto-created entity for high-confidence link", { id: targetId, emailId });
              })
              .catch((insErr: any) =>
                console.warn("[cyrus] auto entity create skipped (possible conflict or permissions):", insErr?.message)
              );
          }
        }
      } catch (linkErr: any) {
        console.warn("[cyrus] high-conf person link/create warning (non-fatal):", linkErr?.message);
      }
    }

    return {
      success: true,
      suggestion,
      emailId,
      usage,
    };
  } catch (err: any) {
    const msg = err?.message || String(err);
    console.error("[cyrus] enrichEmailWithCyrus failed", { emailId, error: msg, stack: err?.stack });
    return {
      success: false,
      emailId,
      error: msg,
    };
  }
}

// ---------------------------------------------------------------------------
// Action layer: Turn Cyrus suggestions into real work items (ops_work_items)
// ---------------------------------------------------------------------------

/**
 * Safely load the current live Cyrus suggestion for an email.
 * Prefers the mutable copy in email_organization.cyrus_suggestion (current state),
 * falls back to the latest record in ai_email_suggestions (history).
 */
async function getLiveCyrusSuggestion(emailId: string): Promise<CyrusSuggestion | null> {
  // Prefer live state in organization (where accepts will mutate the suggestion blob)
  try {
    const { data: org } = await (supabase.from("email_organization") as any)
      .select("cyrus_suggestion, message_id, email_id, status")
      .or(`message_id.eq.${emailId},email_id.eq.${emailId}`)
      .maybeSingle();

    if (org?.cyrus_suggestion) {
      return org.cyrus_suggestion as CyrusSuggestion;
    }
  } catch (e) {
    // table may not exist
  }

  // Fallback to most recent AI suggestion record
  try {
    const { data: ai } = await (supabase.from("ai_email_suggestions") as any)
      .select("suggestion")
      .eq("email_id", emailId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (ai?.suggestion) {
      return ai.suggestion as CyrusSuggestion;
    }
  } catch (e) {
    // ignore
  }

  return null;
}

/**
 * Accept a specific suggested task by index from the stored Cyrus suggestion.
 * - Creates the item in ops_work_items (work_type='task')
 * - Links via email_organization (linked_task_id + updated status)
 * - Removes the accepted task from the live cyrus_suggestion so UI updates cleanly
 * - Attempts junction link via gunlakecasino_email_tasks for compatibility with other surfaces
 * - Returns clear result for UI feedback
 */
export async function acceptCyrusTaskSuggestion(
  emailId: string,
  suggestionIndex: number
): Promise<{
  success: boolean;
  taskId?: string;
  message?: string;
  error?: string;
  newStatus?: string;
}> {
  console.log(`[cyrus] acceptCyrusTaskSuggestion`, { emailId, suggestionIndex });

  if (!emailId || typeof suggestionIndex !== "number" || suggestionIndex < 0) {
    return { success: false, error: "Invalid emailId or suggestionIndex" };
  }

  const suggestion = await getLiveCyrusSuggestion(emailId);
  if (!suggestion || !Array.isArray(suggestion.suggested_tasks) || suggestionIndex >= suggestion.suggested_tasks.length) {
    return { success: false, error: "No matching Cyrus task suggestion found for this email" };
  }

  const taskSug = suggestion.suggested_tasks[suggestionIndex];
  if (!taskSug?.title) {
    return { success: false, error: "Suggested task is missing a title" };
  }

  const now = new Date().toISOString();
  const workItemId = `wi-task-cyrus-${emailId.slice(0, 8)}-${Date.now()}`;

  try {
    // 1. Create real work item in the unified ops table (as specified for Cyrus work items)
    const insertPayload: any = {
      id: workItemId,
      title: taskSug.title.slice(0, 200),
      description: `From Cyrus AI suggestion on email ${emailId}`,
      work_type: "task",
      status: "open",
      priority: taskSug.priority ?? 3,
      due_date: taskSug.due_date || null,
      metadata: {
        source: "cyrus-suggestion",
        email_id: emailId,
        suggestion_index: suggestionIndex,
        original_suggestion: taskSug,
      },
      created_at: now,
      updated_at: now,
    };

    const { error: insErr } = await (supabase.from("ops_work_items") as any).insert(insertPayload);
    if (insErr) {
      console.error("[cyrus] ops_work_items insert error:", insErr);
      // Fallback: still try "tasks" table for compatibility if ops_work_items not ready
      const { error: tasksErr } = await (supabase.from("tasks") as any).insert({
        id: workItemId,
        title: taskSug.title.slice(0, 140),
        description: insertPayload.description,
        source: "cyrus-email",
        owner: "brian",
        status: "open",
        priority: taskSug.priority && taskSug.priority <= 2 ? "high" : "normal",
        due_at: taskSug.due_date || null,
        created_at: now,
      });
      if (tasksErr) throw new Error(`Failed to create task: ${insErr.message || tasksErr.message}`);
    }

    // 2. Link back to the email via email_organization (core requirement)
    // Fetch current org state for status
    const { data: currentOrg } = await (supabase.from("email_organization") as any)
      .select("status, message_id, email_id")
      .or(`message_id.eq.${emailId},email_id.eq.${emailId}`)
      .maybeSingle();

    const currentStatus = currentOrg?.status || suggestion.status || "needs_action";
    const newStatus = currentStatus === "needs_action" ? "waiting" : currentStatus;

    const orgUpdate: any = {
      message_id: emailId,
      email_id: emailId,
      linked_task_id: workItemId,
      status: newStatus,
      updated_at: now,
      // also keep the cyrus suggestion but with this task removed
    };

    // 3. Mark the suggestion as accepted by removing the used item from the live blob
    const updatedSuggestion = JSON.parse(JSON.stringify(suggestion)); // deep clone
    if (Array.isArray(updatedSuggestion.suggested_tasks)) {
      updatedSuggestion.suggested_tasks.splice(suggestionIndex, 1);
      // If no more tasks and no project, we could consider "done", but leave to user / other accepts
    }
    orgUpdate.cyrus_suggestion = updatedSuggestion;

    await (supabase.from("email_organization") as any).upsert(orgUpdate, { onConflict: "message_id" });

    // 4. Best-effort junction link (used by People timelines and Python backend)
    try {
      await (supabase.from("gunlakecasino_email_tasks") as any).insert({
        email_id: emailId,
        task_id: workItemId,
      });
    } catch (juncErr) {
      // non-fatal (table may use different columns or not exist yet)
    }

    console.log(`[cyrus] Task created from suggestion`, { workItemId, emailId, newStatus });

    return {
      success: true,
      taskId: workItemId,
      message: "Task created and linked to this email",
      newStatus,
    };
  } catch (err: any) {
    console.error("[cyrus] acceptCyrusTaskSuggestion failed:", err);
    return { success: false, error: err?.message || "Failed to accept task suggestion" };
  }
}

/**
 * Accept the suggested project (singular) from the stored Cyrus suggestion.
 * Creates in ops_work_items with work_type = 'project'.
 * Links via email_organization (linked_project_id).
 * Clears the suggested_project from the live suggestion.
 */
export async function acceptCyrusProjectSuggestion(emailId: string): Promise<{
  success: boolean;
  projectId?: string;
  message?: string;
  error?: string;
  newStatus?: string;
}> {
  console.log(`[cyrus] acceptCyrusProjectSuggestion`, { emailId });

  const suggestion = await getLiveCyrusSuggestion(emailId);
  if (!suggestion || !suggestion.suggested_project || !suggestion.suggested_project.title) {
    return { success: false, error: "No Cyrus project suggestion found for this email" };
  }

  const projSug = suggestion.suggested_project!;
  const now = new Date().toISOString();
  const workItemId = `wi-project-cyrus-${emailId.slice(0, 8)}-${Date.now()}`;

  try {
    const insertPayload: any = {
      id: workItemId,
      title: (projSug.title || "Untitled Cyrus Project").slice(0, 200),
      description: `Project from Cyrus AI suggestion on email ${emailId}${projSug.phase ? ` (phase: ${projSug.phase})` : ""}`,
      work_type: "project",
      status: "active",
      metadata: {
        source: "cyrus-suggestion",
        email_id: emailId,
        phase: projSug.phase || null,
        original_suggestion: projSug,
      },
      created_at: now,
      updated_at: now,
    };

    const { error: insErr } = await (supabase.from("ops_work_items") as any).insert(insertPayload);
    if (insErr) {
      console.error("[cyrus] ops_work_items project insert error:", insErr);
      throw new Error(`Failed to create project: ${insErr.message}`);
    }

    // Link + update suggestion
    const { data: currentOrg } = await (supabase.from("email_organization") as any)
      .select("status")
      .or(`message_id.eq.${emailId},email_id.eq.${emailId}`)
      .maybeSingle();

    const currentStatus = currentOrg?.status || suggestion.status || "needs_action";
    const newStatus = currentStatus === "needs_action" ? "waiting" : currentStatus;

    const updatedSuggestion = JSON.parse(JSON.stringify(suggestion));
    updatedSuggestion.suggested_project = null; // mark as accepted / consumed

    await (supabase.from("email_organization") as any).upsert(
      {
        message_id: emailId,
        email_id: emailId,
        linked_project_id: workItemId,
        status: newStatus,
        cyrus_suggestion: updatedSuggestion,
        updated_at: now,
      },
      { onConflict: "message_id" }
    );

    // Optional junction (if table exists for projects)
    try {
      await (supabase.from("gunlakecasino_email_projects") as any).insert({
        email_id: emailId,
        project_id: workItemId,
        role: "created-from-cyrus",
      });
    } catch {}

    return {
      success: true,
      projectId: workItemId,
      message: "Project created and linked to this email",
      newStatus,
    };
  } catch (err: any) {
    console.error("[cyrus] acceptCyrusProjectSuggestion failed:", err);
    return { success: false, error: err?.message || "Failed to accept project suggestion" };
  }
}
