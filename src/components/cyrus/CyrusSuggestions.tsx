"use client";

import React from "react";
import { Sparkles, Check, X, Plus, Edit2, RefreshCw, UserCheck, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  acceptCyrusClusterStatus,
  acceptLinkedPerson,
  acceptCyrusTaskSuggestion,
  acceptCyrusProjectSuggestion,
  acceptAllHighConfidence,
  rejectCyrusSuggestion,
  enrichEmail,
  type CyrusSuggestion,
} from "@/app/mail/actions";

interface CyrusSuggestionsProps {
  emailId: string;
  suggestion: CyrusSuggestion | null;
  linkedPersonName?: string | null;
  organization?: any; // for showing current linked work items from email_organization
  onRefresh?: () => void | Promise<void>;
  className?: string;
}

const CLUSTER_LABELS: Record<string, string> = {
  todays_priority: "Today's Priority",
  gun_lake_ops: "Gun Lake Ops",
  staffing_hr: "Staffing & HR",
  vendors_contracts: "Vendors & Contracts",
  marketing_events: "Marketing & Events",
  unassigned_review: "Unassigned / Review",
};

const CLUSTER_STYLES: Record<string, string> = {
  todays_priority: "bg-red-500/10 text-red-700 border-red-500/20 dark:bg-red-500/15 dark:text-red-300",
  gun_lake_ops: "bg-sky-500/10 text-sky-700 border-sky-500/20 dark:bg-sky-500/15 dark:text-sky-300",
  staffing_hr: "bg-violet-500/10 text-violet-700 border-violet-500/20 dark:bg-violet-500/15 dark:text-violet-300",
  vendors_contracts: "bg-amber-500/10 text-amber-700 border-amber-500/20 dark:bg-amber-500/15 dark:text-amber-300",
  marketing_events: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:bg-emerald-500/15 dark:text-emerald-300",
  unassigned_review: "bg-zinc-500/10 text-zinc-600 border-zinc-500/20 dark:bg-zinc-500/15 dark:text-zinc-300",
};

const STATUS_STYLES: Record<string, string> = {
  needs_action: "bg-orange-500/10 text-orange-700 border-orange-500/20",
  waiting: "bg-blue-500/10 text-blue-700 border-blue-500/20",
  fyi: "bg-teal-500/10 text-teal-700 border-teal-500/20",
  done: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
};

export function CyrusSuggestions({
  emailId,
  suggestion,
  linkedPersonName,
  organization,
  onRefresh,
  className,
}: CyrusSuggestionsProps) {
  const [isEnriching, setIsEnriching] = React.useState(false);
  const [isActing, setIsActing] = React.useState<string | null>(null); // which action is in flight
  const [localMessage, setLocalMessage] = React.useState<string | null>(null);

  const showMessage = (msg: string) => {
    setLocalMessage(msg);
    setTimeout(() => setLocalMessage(null), 2200);
  };

  const refresh = async () => {
    if (onRefresh) await onRefresh();
  };

  // No suggestion yet → clean call-to-action
  if (!suggestion) {
    return (
      <div className={cn("rounded-3xl border border-black/10 dark:border-white/10 bg-white/80 dark:bg-white/5 p-5", className)}>
        <div className="flex items-center gap-2 text-sm font-medium text-[#6C6C72] dark:text-[#8A8A90]">
          <Sparkles className="h-4 w-4" />
          Cyrus Intelligence
        </div>
        <div className="mt-2 text-[13px] text-[#444] dark:text-[#A1A1A6]">
          No AI analysis yet for this email.
        </div>
        <button
          onClick={async () => {
            setIsEnriching(true);
            try {
              await enrichEmail(emailId);
              await refresh();
              showMessage("Cyrus enrichment complete.");
            } catch (e) {
              showMessage("Enrichment failed. Check XAI key and try again.");
            } finally {
              setIsEnriching(false);
            }
          }}
          disabled={isEnriching}
          className="mt-3 inline-flex items-center gap-2 rounded-2xl bg-[#B89708]/10 px-4 py-2 text-sm font-medium text-[#8B6910] dark:text-[#E9B948] border border-[#B89708]/30 hover:bg-[#B89708]/15 active:opacity-90 disabled:opacity-60 transition"
        >
          <Sparkles className="h-4 w-4" />
          {isEnriching ? "Analyzing with Cyrus..." : "Enrich with Cyrus"}
        </button>
        {localMessage && <div className="mt-2 text-xs text-[#6C6C72]">{localMessage}</div>}
      </div>
    );
  }

  const clusterStyle = CLUSTER_STYLES[suggestion.cluster] || CLUSTER_STYLES.unassigned_review;
  const statusStyle = STATUS_STYLES[suggestion.status] || STATUS_STYLES.fyi;
  const confPct = Math.round((suggestion.confidence || 0) * 100);
  const isHighConfidence = suggestion.confidence >= 0.75;

  const handleAcceptCluster = async () => {
    setIsActing("cluster");
    try {
      await acceptCyrusClusterStatus(emailId, suggestion.cluster, suggestion.status, suggestion.priority);
      await refresh();
      showMessage("Cluster, status & priority accepted.");
    } finally {
      setIsActing(null);
    }
  };

  const handleAcceptPerson = async () => {
    if (!suggestion.linked_person_id) return;
    setIsActing("person");
    try {
      await acceptLinkedPerson(emailId, suggestion.linked_person_id);
      await refresh();
      showMessage("Linked person confirmed.");
    } finally {
      setIsActing(null);
    }
  };

  const handleAcceptTask = async (idx: number) => {
    const key = `task-${idx}`;
    setIsActing(key);
    try {
      const result = await acceptCyrusTaskSuggestion(emailId, idx);
      await refresh();
      showMessage(result.message || "Task created and linked to this email");
    } finally {
      setIsActing(null);
    }
  };

  const handleAcceptProject = async () => {
    setIsActing("project");
    try {
      const result = await acceptCyrusProjectSuggestion(emailId);
      await refresh();
      showMessage(result.message || "Project created and linked to this email");
    } finally {
      setIsActing(null);
    }
  };

  const handleAcceptAll = async () => {
    setIsActing("all");
    try {
      await acceptAllHighConfidence(emailId, suggestion);
      await refresh();
      showMessage("Accepted all high-confidence suggestions (cluster + tasks).");
    } finally {
      setIsActing(null);
    }
  };

  const handleReject = async () => {
    setIsActing("reject");
    try {
      await rejectCyrusSuggestion(emailId);
      await refresh();
      showMessage("Suggestion rejected / cleared.");
    } finally {
      setIsActing(null);
    }
  };

  const handleReEnrich = async () => {
    setIsActing("reenrich");
    try {
      await enrichEmail(emailId);
      await refresh();
      showMessage("Re-enriched with latest context.");
    } finally {
      setIsActing(null);
    }
  };

  return (
    <div className={cn("rounded-3xl border border-black/10 dark:border-white/10 bg-white/85 dark:bg-white/5 overflow-hidden", className)}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-black/10 dark:border-white/10 px-4 py-3 bg-white/60 dark:bg-black/20">
        <div className="flex items-center gap-2">
          <div className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-[#B89708]/10 text-[#B89708]">
            <Sparkles className="h-3.5 w-3.5" />
          </div>
          <div className="font-semibold tracking-[-0.1px] text-[14px]">Cyrus Suggestions</div>
          <div className="text-[11px] px-1.5 py-px rounded bg-black/5 dark:bg-white/10 text-[#6C6C72] tabular-nums">
            {confPct}% confidence
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {isHighConfidence && (
            <button
              onClick={handleAcceptAll}
              disabled={!!isActing}
              className="inline-flex items-center gap-1 rounded-2xl bg-emerald-500/10 px-3 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 hover:bg-emerald-500/15 disabled:opacity-60"
            >
              <Check className="h-3 w-3" /> Accept All
            </button>
          )}
          <button
            onClick={handleReEnrich}
            disabled={!!isActing}
            className="inline-flex items-center gap-1 rounded-2xl border border-black/10 dark:border-white/15 px-2.5 py-1 text-[11px] hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-60"
          >
            <RefreshCw className={cn("h-3 w-3", isActing === "reenrich" && "animate-spin")} /> Re-enrich
          </button>
          <button
            onClick={handleReject}
            disabled={!!isActing}
            className="inline-flex items-center gap-1 rounded-2xl border border-black/10 dark:border-white/15 px-2.5 py-1 text-[11px] text-red-600/80 hover:bg-red-500/10 disabled:opacity-60"
          >
            <X className="h-3 w-3" /> Reject
          </button>
        </div>
      </div>

      {/* Current links from email_organization (visible "Linked to Task/Project" feedback) */}
      {organization && (organization.linked_task_id || organization.linked_project_id || organization.linked_person_id) && (
        <div className="px-4 pt-3 text-xs text-[#6C6C72] dark:text-[#8A8A90] flex flex-wrap gap-x-4 gap-y-1 border-b border-black/5 dark:border-white/5 pb-2">
          {organization.linked_task_id && (
            <span>Linked to Task: <span className="font-mono text-[#444] dark:text-[#C4C4C7]">{organization.linked_task_id}</span></span>
          )}
          {organization.linked_project_id && (
            <span>Linked to Project: <span className="font-mono text-[#444] dark:text-[#C4C4C7]">{organization.linked_project_id}</span></span>
          )}
        </div>
      )}

      <div className="p-4 space-y-4 text-sm">
        {/* Cluster / Status / Priority */}
        <div>
          <div className="text-[10px] uppercase tracking-widest text-[#6C6C72] dark:text-[#8A8A90] mb-1.5">Classification</div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("inline-flex items-center rounded-2xl border px-3 py-1 text-xs font-medium", clusterStyle)}>
              {CLUSTER_LABELS[suggestion.cluster] || suggestion.cluster}
            </span>
            <span className={cn("inline-flex items-center rounded-2xl border px-2.5 py-1 text-xs font-medium", statusStyle)}>
              {suggestion.status.replace("_", " ")}
            </span>
            <span className="inline-flex items-center gap-1 rounded-2xl border border-black/10 dark:border-white/15 px-2.5 py-1 text-xs font-medium tabular-nums">
              P{suggestion.priority}
            </span>

            <button
              onClick={handleAcceptCluster}
              disabled={!!isActing}
              className="ml-auto inline-flex items-center gap-1.5 rounded-2xl border border-black/10 dark:border-white/15 bg-white/70 dark:bg-white/5 px-3 py-1 text-xs font-medium hover:bg-white dark:hover:bg-white/10 disabled:opacity-60"
            >
              <Check className="h-3.5 w-3.5" />
              {isActing === "cluster" ? "Accepting..." : "Accept Cluster/Status"}
            </button>
          </div>
        </div>

        {/* Linked Person */}
        <div>
          <div className="text-[10px] uppercase tracking-widest text-[#6C6C72] dark:text-[#8A8A90] mb-1.5">Linked Person</div>
          <div className="flex items-center gap-2">
            <div className="flex-1 rounded-2xl border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/5 px-3 py-2 text-sm">
              {suggestion.linked_person_id ? (
                <>
                  <span className="font-medium">{linkedPersonName || suggestion.linked_person_id}</span>
                  <span className="ml-2 text-[10px] text-[#6C6C72] font-mono">{suggestion.linked_person_id}</span>
                </>
              ) : (
                <span className="text-[#6C6C72] italic">No person suggested</span>
              )}
            </div>
            {suggestion.linked_person_id && (
              <button
                onClick={handleAcceptPerson}
                disabled={!!isActing}
                className="inline-flex items-center gap-1.5 rounded-2xl border border-black/10 dark:border-white/15 px-3 py-1.5 text-xs font-medium hover:bg-white dark:hover:bg-white/10 disabled:opacity-60"
              >
                <UserCheck className="h-3.5 w-3.5" />
                {isActing === "person" ? "..." : "Confirm link"}
              </button>
            )}
          </div>
        </div>

        {/* Suggested Tasks */}
        {suggestion.suggested_tasks && suggestion.suggested_tasks.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-[10px] uppercase tracking-widest text-[#6C6C72] dark:text-[#8A8A90]">Suggested Tasks</div>
              <div className="text-[10px] text-[#6C6C72]">Accept individually or via Accept All</div>
            </div>
            <div className="space-y-2">
              {suggestion.suggested_tasks.map((t: { title: string; due_date?: string; priority?: number }, i: number) => (
                <div key={i} className="flex items-start justify-between gap-3 rounded-2xl border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/5 px-3 py-2">
                  <div className="min-w-0">
                    <div className="font-medium leading-tight">{t.title}</div>
                    <div className="mt-0.5 text-[11px] text-[#6C6C72] dark:text-[#8A8A90]">
                      {t.due_date ? `Due ${t.due_date} • ` : ""}P{t.priority ?? "?"}
                    </div>
                  </div>
                  <button
                    onClick={() => handleAcceptTask(i)}
                    disabled={!!isActing}
                    className="shrink-0 inline-flex items-center gap-1.5 rounded-2xl border border-emerald-600/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/15 disabled:opacity-60"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {isActing === `task-${i}` ? "Creating..." : "Accept & Create Task"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Suggested Project */}
        {suggestion.suggested_project && (suggestion.suggested_project.title || suggestion.suggested_project.phase) && (
          <div>
            <div className="text-[10px] uppercase tracking-widest text-[#6C6C72] dark:text-[#8A8A90] mb-1.5">Suggested Project</div>
            <div className="flex items-start justify-between gap-3 rounded-2xl border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/5 px-3 py-2">
              <div>
                {suggestion.suggested_project.title && <div className="font-medium">{suggestion.suggested_project.title}</div>}
                {suggestion.suggested_project.phase && <div className="text-xs text-[#6C6C72]">Phase: {suggestion.suggested_project.phase}</div>}
              </div>
              <button
                onClick={handleAcceptProject}
                disabled={!!isActing}
                className="shrink-0 inline-flex items-center gap-1.5 rounded-2xl border border-emerald-600/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/15 disabled:opacity-60"
              >
                <Plus className="h-3.5 w-3.5" />
                {isActing === "project" ? "Creating..." : "Accept & Create Project"}
              </button>
            </div>
          </div>
        )}

        {/* Action Items */}
        {suggestion.action_items && suggestion.action_items.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-widest text-[#6C6C72] dark:text-[#8A8A90] mb-1.5">Key Action Items</div>
            <ul className="space-y-1 pl-1 text-sm">
              {suggestion.action_items.slice(0, 6).map((item: string, i: number) => (
                <li key={i} className="flex gap-2 text-[#333] dark:text-[#C4C4C7]">
                  <span className="mt-1.5 block h-1 w-1 rounded-full bg-[#B89708]" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* AI Summary */}
        <div>
          <div className="text-[10px] uppercase tracking-widest text-[#6C6C72] dark:text-[#8A8A90] mb-1.5">AI Summary</div>
          <div className="rounded-2xl border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/5 p-3 text-[13.2px] leading-snug text-[#2C2C2E] dark:text-[#E5E5E7]">
            {suggestion.summary}
          </div>
        </div>

        {/* Tone */}
        {suggestion.tone && (
          <div className="text-xs text-[#6C6C72] dark:text-[#8A8A90]">
            Tone: <span className="font-medium text-[#444] dark:text-[#C4C4C7]">{suggestion.tone}</span>
          </div>
        )}

        {localMessage && (
          <div className="text-xs rounded-xl bg-black/5 dark:bg-white/10 px-3 py-1.5 text-[#6C6C72]">{localMessage}</div>
        )}
      </div>

      {/* Subtle footer note */}
      <div className="border-t border-black/10 dark:border-white/10 px-4 py-2 text-[10px] text-[#6C6C72] dark:text-[#8A8A90] bg-white/40 dark:bg-black/10">
        Suggestions are AI-generated. Use Accept buttons to persist decisions into your organization data.
      </div>
    </div>
  );
}
