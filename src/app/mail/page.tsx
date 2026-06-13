"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, Search, RefreshCw, Sparkles, X, Clock, User } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getRecentEmails,
  getEmailDetail,
  enrichEmail,
  getUnprocessedEmailIds,
  type MailListItem,
  type MailEmailDetail,
} from "./actions";
import { CyrusSuggestions } from "@/components/cyrus/CyrusSuggestions";

const CLUSTER_LABELS: Record<string, string> = {
  todays_priority: "Today's Priority",
  gun_lake_ops: "Gun Lake Ops",
  staffing_hr: "Staffing & HR",
  vendors_contracts: "Vendors & Contracts",
  marketing_events: "Marketing & Events",
  unassigned_review: "Unassigned",
};

export default function MailPage() {
  const [emails, setEmails] = React.useState<MailListItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [activeCluster, setActiveCluster] = React.useState<string | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);

  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<MailEmailDetail | null>(null);
  const [detailLoading, setDetailLoading] = React.useState(false);

  // For per-row and bulk enriching (non-blocking)
  const [enrichingIds, setEnrichingIds] = React.useState<Set<string>>(new Set());
  const [bulkProgress, setBulkProgress] = React.useState<{ total: number; done: number; running: boolean } | null>(null);

  const load = React.useCallback(async (q?: string) => {
    setLoading(true);
    try {
      const rows = await getRecentEmails(60, q);
      setEmails(rows);
    } catch (e) {
      console.error(e);
      setEmails([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const filtered = React.useMemo(() => {
    let list = emails;
    if (activeCluster) {
      list = list.filter((e) => e.cluster === activeCluster);
    }
    return list;
  }, [emails, activeCluster]);

  // Compute cluster counts for the visual "radial" / cluster bar
  const clusterCounts = React.useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of emails) {
      if (e.cluster) counts[e.cluster] = (counts[e.cluster] || 0) + 1;
    }
    return counts;
  }, [emails]);

  const clusters = Object.keys(CLUSTER_LABELS);

  async function onRefresh() {
    setRefreshing(true);
    await load(search);
    if (selectedId) {
      await openDetail(selectedId);
    }
    setRefreshing(false);
  }

  async function onSearchChange(v: string) {
    setSearch(v);
    await load(v);
  }

  // Single row "Enrich" quick action
  async function handleEnrichOne(id: string) {
    setEnrichingIds(prev => new Set(prev).add(id));
    try {
      await enrichEmail(id);
      await load(search); // refresh list for indicators
      if (selectedId === id) {
        await openDetail(id);
      }
    } catch (e) {
      console.warn("Enrich one failed", e);
    } finally {
      setEnrichingIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  // Bulk: Enrich All Unprocessed (finds via server, processes with progress + rate limiting)
  async function handleEnrichAllUnprocessed() {
    setBulkProgress({ total: 0, done: 0, running: true });
    try {
      const ids = await getUnprocessedEmailIds(100);
      if (ids.length === 0) {
        setBulkProgress(null);
        return;
      }
      setBulkProgress({ total: ids.length, done: 0, running: true });

      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        try {
          await enrichEmail(id);
        } catch (e) {
          console.warn("Bulk enrich item failed", id, e);
        }
        setBulkProgress(p => p ? { ...p, done: i + 1 } : null);
        // rate limit to keep UI/DB responsive
        if ((i + 1) % 3 === 0) {
          await load(search); // incremental UI update
        }
        await new Promise(r => setTimeout(r, 220));
      }
      await onRefresh();
    } finally {
      setBulkProgress(null);
    }
  }

  // "Refresh intelligence" for radial / current view (re-processes visible, even if already enriched)
  async function handleRefreshIntelligence() {
    const ids = filtered.map(e => e.message_id);
    if (ids.length === 0) return;
    setBulkProgress({ total: ids.length, done: 0, running: true });
    try {
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        try {
          await enrichEmail(id);
        } catch (e) {
          console.warn(e);
        }
        setBulkProgress(p => p ? { ...p, done: i + 1 } : null);
        await new Promise(r => setTimeout(r, 180));
      }
      await onRefresh();
    } finally {
      setBulkProgress(null);
    }
  }

  async function openDetail(id: string) {
    setSelectedId(id);
    setDetailLoading(true);
    setDetail(null);
    try {
      const d = await getEmailDetail(id);
      setDetail(d);
    } catch (e) {
      // fallback minimal
      const found = emails.find((e) => e.message_id === id);
      if (found) {
        setDetail({
          email: found,
          enrichment: null,
          organization: null,
          linkedPerson: null,
        } as any);
      }
    } finally {
      setDetailLoading(false);
    }
  }

  function closeDetail() {
    setSelectedId(null);
    setDetail(null);
  }

  const selectedEmail = detail?.email || emails.find((e) => e.message_id === selectedId);

  return (
    <div className="min-h-screen bg-[#F8F8F9] dark:bg-[#0a0a0c] text-[#1C1C1E] dark:text-[#F2F2F4]">
      <div className="max-w-[1280px] mx-auto px-6 pt-8 pb-16">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-3">
              <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-black/5 dark:bg-white/10">
                <Mail className="h-4.5 w-4.5" />
              </div>
              <div>
                <div className="text-[11px] tracking-[1.5px] font-medium text-[#6C6C72] dark:text-[#8A8A90] uppercase">CYRUS • GUN LAKE</div>
                <h1 className="text-3xl font-semibold tracking-[-0.3px]">Mail</h1>
              </div>
            </div>
            <p className="mt-1.5 max-w-2xl text-[13.5px] text-[#555] dark:text-[#A1A1A6]">
              Radial clusters + classic list. Cyrus AI suggestions appear automatically in the detail pane.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleEnrichAllUnprocessed}
              disabled={!!bulkProgress?.running}
              className="inline-flex items-center gap-2 rounded-2xl border border-[#B89708]/30 bg-[#B89708]/10 px-3.5 py-2 text-sm font-medium text-[#8B6910] dark:text-[#E9B948] hover:bg-[#B89708]/15 disabled:opacity-60"
            >
              <Sparkles className="h-4 w-4" />
              {bulkProgress?.running
                ? `Enrich All Unprocessed (${bulkProgress.done}/${bulkProgress.total})`
                : "Enrich All Unprocessed"}
            </button>
            <button
              onClick={onRefresh}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-2xl border border-black/10 dark:border-white/15 bg-white/70 dark:bg-white/5 px-3.5 py-2 text-sm hover:bg-white dark:hover:bg-white/10 disabled:opacity-60"
            >
              <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
              Refresh
            </button>
          </div>
        </div>

        {/* Search + Cluster visual (Radial-style summary) */}
        <div className="mb-4 flex flex-col gap-3">
          <div className="relative max-w-md">
            <Search className="absolute left-3.5 top-3 h-4 w-4 text-[#8A8A90]" />
            <input
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search subject, sender, email…"
              className="w-full rounded-2xl border border-black/10 dark:border-white/15 bg-white dark:bg-[#111113] pl-10 pr-4 py-2.5 text-[14px] placeholder:text-[#8A8A90] focus:outline-none focus:ring-1 focus:ring-black/20 dark:focus:ring-white/30"
            />
          </div>

          {/* Cluster "Radial" bar + central Cyrus orb for intelligence control */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-xs uppercase tracking-widest text-[#6C6C72] mr-1">Cyrus Clusters</div>

            {/* Central Cyrus orb / "radial" control point */}
            <button
              onClick={handleRefreshIntelligence}
              disabled={!!bulkProgress?.running}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#B89708]/40 bg-[#B89708]/10 px-2.5 py-1 text-xs font-medium text-[#8B6910] dark:text-[#E9B948] hover:bg-[#B89708]/20 disabled:opacity-60 transition"
              title="Refresh intelligence for current view (re-process visible emails)"
            >
              <Sparkles className="h-3 w-3" /> Cyrus
              <RefreshCw className={cn("h-3 w-3", bulkProgress?.running && "animate-spin")} />
            </button>

            {clusters.map((c) => {
              const count = clusterCounts[c] || 0;
              const active = activeCluster === c;
              return (
                <button
                  key={c}
                  onClick={() => setActiveCluster(active ? null : c)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-2xl border px-3 py-1 text-xs font-medium transition",
                    active
                      ? "bg-[#B89708]/15 text-[#8B6910] dark:text-[#E9B948] border-[#B89708]/40"
                      : "border-black/10 dark:border-white/15 bg-white/70 dark:bg-white/5 hover:bg-white dark:hover:bg-white/10"
                  )}
                >
                  {CLUSTER_LABELS[c]}
                  <span className="tabular-nums rounded-full bg-black/5 dark:bg-white/10 px-1.5 py-px text-[10px]">{count}</span>
                </button>
              );
            })}
            {activeCluster && (
              <button onClick={() => setActiveCluster(null)} className="text-xs text-[#6C6C72] underline">
                clear filter
              </button>
            )}
          </div>
        </div>

        {/* Email list (works for both "radial" filtered clusters and classic list) */}
        {loading && emails.length === 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-28 rounded-3xl border border-black/5 dark:border-white/10 bg-white/60 dark:bg-white/5 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-3xl border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/5 p-10 text-center">
            No emails found. Run the gunlakecasino email backend to populate data.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((e) => {
              const isEnrichingThis = enrichingIds.has(e.message_id);
              return (
                <button
                  key={e.message_id}
                  onClick={() => openDetail(e.message_id)}
                  className="group text-left rounded-3xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#111113] p-4 hover:border-black/20 dark:hover:border-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B89708]/40 transition relative"
                >
                  {/* Quick "Enrich" action (works for both list and radial-style card previews) */}
                  <button
                    onClick={(ev) => {
                      ev.stopPropagation();
                      handleEnrichOne(e.message_id);
                    }}
                    disabled={isEnrichingThis}
                    className="absolute top-2 right-2 z-10 rounded-lg border border-black/10 dark:border-white/15 bg-white/90 dark:bg-[#111113]/90 p-1 text-[#B89708] hover:bg-white dark:hover:bg-white/10 disabled:opacity-50"
                    title="Enrich with Cyrus"
                  >
                    {isEnrichingThis ? (
                      <RefreshCw className="h-3 w-3 animate-spin" />
                    ) : (
                      <Sparkles className="h-3 w-3" />
                    )}
                  </button>

                  <div className="flex items-start justify-between gap-2 pr-6">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-[14.5px] leading-tight line-clamp-2 pr-1">{e.subject || "(no subject)"}</div>
                      <div className="mt-1 text-xs text-[#6C6C72] dark:text-[#8A8A90] truncate">
                        {e.sender_name || e.sender_email} • {e.received_at ? new Date(e.received_at).toLocaleDateString() : ""}
                      </div>
                    </div>
                  </div>

                  {e.cluster && (
                    <div className="mt-3 flex items-center gap-2 text-xs">
                      <span className="rounded-xl bg-black/5 dark:bg-white/10 px-2 py-0.5 font-medium">{CLUSTER_LABELS[e.cluster] || e.cluster}</span>
                      {e.priority && <span className="text-[#6C6C72]">P{e.priority}</span>}
                      {e.cyrusConfidence != null && (
                        <span className="ml-auto tabular-nums text-[#6C6C72]">{Math.round(e.cyrusConfidence * 100)}%</span>
                      )}
                    </div>
                  )}

                  {/* Cyrus enrichment indicators (visible in both radial previews and classic list) */}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]">
                    {e.cyrus_enriched ? (
                      <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                        enriched by Cyrus
                      </span>
                    ) : (
                      <span className="rounded bg-zinc-500/10 px-1.5 py-0.5 text-zinc-600 dark:text-zinc-400">not enriched</span>
                    )}
                    {e.has_pending_suggestions && (
                      <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-amber-700 dark:text-amber-400 border border-amber-500/20">
                        has suggestions
                      </span>
                    )}
                    {e.status && (
                      <span className="rounded bg-black/5 dark:bg-white/10 px-1.5 py-0.5 text-[#6C6C72]">{e.status}</span>
                    )}
                  </div>

                  {e.content_excerpt && (
                    <div className="mt-2 line-clamp-2 text-xs text-[#555] dark:text-[#A1A1A6]">{e.content_excerpt}</div>
                  )}
                </button>
              );
            })}
          </div>
        )}

        <div className="mt-6 text-[11px] text-[#6C6C72] dark:text-[#8A8A90]">
          Data from <span className="font-mono">gunlakecasino_emails</span>. Cyrus suggestions are stored in <span className="font-mono">ai_email_suggestions</span> + <span className="font-mono">email_organization</span>.
        </div>
      </div>

      {/* Shared Detail Pane (serves as the expanded view for both radial-style clusters and classic list) */}
      <AnimatePresence>
        {selectedId && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeDetail}
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px]"
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 26, stiffness: 240 }}
              className="fixed right-0 top-0 z-50 h-full w-full max-w-[560px] overflow-y-auto border-l border-black/10 dark:border-white/10 bg-[#F8F8F9] dark:bg-[#0a0a0c] shadow-2xl"
            >
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-black/10 dark:border-white/10 bg-[#F8F8F9]/95 dark:bg-[#0a0a0c]/95 px-5 py-3 backdrop-blur">
                <div className="font-semibold tracking-[-0.1px] pr-3 truncate flex items-center gap-2">
                  <Mail className="h-4 w-4" /> Email Detail
                </div>
                <button onClick={closeDetail} className="rounded-full p-2 hover:bg-black/5 dark:hover:bg-white/10">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="p-5 space-y-5">
                {/* Email header (spacious, calm) */}
                {selectedEmail && (
                  <div className="rounded-3xl border border-black/10 dark:border-white/10 bg-white/80 dark:bg-white/5 p-4">
                    <div className="text-[11px] text-[#6C6C72] dark:text-[#8A8A90] flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5" />
                      {selectedEmail.received_at ? new Date(selectedEmail.received_at).toLocaleString() : "Unknown date"}
                      {selectedEmail.has_attachments && <span className="ml-2">📎</span>}
                    </div>
                    <div className="mt-1 font-semibold text-xl tracking-[-0.2px] leading-tight">
                      {selectedEmail.subject || "(no subject)"}
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-sm text-[#6C6C72] dark:text-[#8A8A90]">
                      <User className="h-4 w-4" />
                      {selectedEmail.sender_name || "Unknown"} &lt;{selectedEmail.sender_email || "unknown"}&gt;
                    </div>
                    {selectedEmail.content_excerpt && (
                      <div className="mt-3 text-[13.5px] leading-snug text-[#333] dark:text-[#C4C4C7] whitespace-pre-wrap">
                        {selectedEmail.content_excerpt}
                      </div>
                    )}
                  </div>
                )}

                {/* The star of the show: Cyrus Suggestions (beautiful Light Glass section) */}
                {selectedId && (
                  <CyrusSuggestions
                    emailId={selectedId}
                    suggestion={detail?.enrichment || null}
                    linkedPersonName={detail?.linkedPerson?.name || null}
                    organization={detail?.organization}
                    onRefresh={async () => {
                      const d = await getEmailDetail(selectedId);
                      setDetail(d);
                      await load(search); // keep list in sync
                    }}
                  />
                )}

                {detailLoading && !detail && (
                  <div className="text-sm text-[#6C6C72]">Loading Cyrus context…</div>
                )}
              </div>

              <div className="h-8" />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
