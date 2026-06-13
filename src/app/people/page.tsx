"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, RefreshCw, UserPlus, Plus, Sparkles, X, Clock, Mail, CheckSquare, Edit2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getPeople,
  getPersonDetail,
  updatePerson,
  addNoteForPerson,
  generateRelationshipSummary,
  createTaskForPerson,
  type Person,
  type PersonDetail,
  type TimelineItem,
} from "./actions";

function formatDate(d?: string | null) {
  if (!d) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(d));
  } catch {
    return d.slice(0, 10);
  }
}

function formatRelative(d?: string | null) {
  if (!d) return "";
  try {
    const dt = new Date(d);
    const diff = (Date.now() - dt.getTime()) / (1000 * 3600 * 24);
    if (diff < 1) return "today";
    if (diff < 7) return `${Math.floor(diff)}d ago`;
    if (diff < 30) return `${Math.floor(diff / 7)}w ago`;
    return formatDate(d);
  } catch {
    return "";
  }
}

function strengthLabel(s: number) {
  if (s >= 75) return { label: "Strong", tone: "emerald" };
  if (s >= 45) return { label: "Active", tone: "sky" };
  if (s >= 25) return { label: "Occasional", tone: "amber" };
  return { label: "Light", tone: "zinc" };
}

export default function PeoplePage() {
  const [people, setPeople] = React.useState<Person[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [onlyColleagues, setOnlyColleagues] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);

  const [selected, setSelected] = React.useState<Person | null>(null);
  const [detail, setDetail] = React.useState<PersonDetail | null>(null);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [aiLoading, setAiLoading] = React.useState(false);
  const [noteDraft, setNoteDraft] = React.useState("");
  const [savingNote, setSavingNote] = React.useState(false);
  const [taskDraft, setTaskDraft] = React.useState("");
  const [savingTask, setSavingTask] = React.useState(false);

  const load = React.useCallback(async (opts?: { q?: string; onlyColleagues?: boolean }) => {
    setLoading(true);
    setError(null);
    try {
      const rows = await getPeople({ q: opts?.q ?? query, onlyColleagues: opts?.onlyColleagues ?? onlyColleagues });
      setPeople(rows);
    } catch (e: any) {
      setError(e?.message || "Failed to load people");
      setPeople([]);
    } finally {
      setLoading(false);
    }
  }, [query, onlyColleagues]);

  React.useEffect(() => {
    load();
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    if (selected) {
      // refresh detail too
      await openDetail(selected);
    }
    setRefreshing(false);
  }

  async function openDetail(p: Person) {
    setSelected(p);
    setDetailLoading(true);
    setDetail(null);
    setNoteDraft("");
    setTaskDraft("");
    try {
      const d = await getPersonDetail(p.entity_id);
      setDetail(d);
    } catch (e: any) {
      setDetail({ person: p, recentEmails: [], linkedTasks: [], timeline: [], aiSummary: null } as PersonDetail);
    } finally {
      setDetailLoading(false);
    }
  }

  function closeDetail() {
    setSelected(null);
    setDetail(null);
    setNoteDraft("");
    setTaskDraft("");
  }

  async function handleGenerateSummary() {
    if (!selected) return;
    setAiLoading(true);
    try {
      const summary = await generateRelationshipSummary(selected.entity_id);
      // reload detail to pick up persisted summary
      const d = await getPersonDetail(selected.entity_id);
      setDetail(d);
    } catch (e) {
      // surface lightly
      alert("Could not generate summary right now. Check xAI key / network.");
    } finally {
      setAiLoading(false);
    }
  }

  async function handleSaveNote() {
    if (!selected || !noteDraft.trim()) return;
    setSavingNote(true);
    try {
      await addNoteForPerson(selected.entity_id, noteDraft.trim());
      setNoteDraft("");
      const d = await getPersonDetail(selected.entity_id);
      setDetail(d);
      // also refresh list (notes affect search)
      await load();
    } catch (e: any) {
      alert(e?.message || "Failed to save note");
    } finally {
      setSavingNote(false);
    }
  }

  async function handleCreateTask() {
    if (!selected || !taskDraft.trim()) return;
    setSavingTask(true);
    try {
      await createTaskForPerson(selected.entity_id, taskDraft.trim());
      setTaskDraft("");
      const d = await getPersonDetail(selected.entity_id);
      setDetail(d);
      await load();
    } catch (e: any) {
      alert(e?.message || "Failed to create task");
    } finally {
      setSavingTask(false);
    }
  }

  async function handleNotesBlur() {
    if (!selected || !detail) return;
    const current = detail.person.profile_notes || "";
    // no-op if unchanged; simple save of whole notes on blur of the textarea
    // (we keep a separate quick-note flow above, this allows direct editing of the full block)
  }

  async function saveFullNotes(newNotes: string) {
    if (!selected) return;
    try {
      await updatePerson(selected.entity_id, { profile_notes: newNotes });
      const d = await getPersonDetail(selected.entity_id);
      setDetail(d);
      await load();
    } catch (e: any) {
      // ignore silent for blur saves
    }
  }

  const filteredCount = people.length;

  return (
    <div className="min-h-screen bg-[#F8F8F9] dark:bg-[#0a0a0c] text-[#1C1C1E] dark:text-[#F2F2F4]">
      <div className="max-w-[1280px] mx-auto px-6 pt-8 pb-16">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-3">
              <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-black/5 dark:bg-white/10">
                <Users className="h-4.5 w-4.5" />
              </div>
              <div>
                <div className="text-[11px] tracking-[1.5px] font-medium text-[#6C6C72] dark:text-[#8A8A90] uppercase">GUN LAKE OPS</div>
                <h1 className="text-3xl font-semibold tracking-[-0.3px]">People</h1>
              </div>
            </div>
            <p className="mt-1.5 max-w-2xl text-[13.5px] text-[#555] dark:text-[#A1A1A6]">
              Strictly the people you receive email from or communicate with. Your living relationship and colleague manager.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onRefresh}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-xl border border-black/10 dark:border-white/15 bg-white/70 dark:bg-white/5 px-3.5 py-2 text-sm hover:bg-white dark:hover:bg-white/10 active:opacity-80 disabled:opacity-60"
            >
              <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
              Refresh
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[260px] max-w-md">
            <Search className="absolute left-3.5 top-3 h-4 w-4 text-[#8A8A90]" />
            <input
              value={query}
              onChange={(e) => {
                const v = e.target.value;
                setQuery(v);
                // live filter
                load({ q: v, onlyColleagues });
              }}
              placeholder="Search name, email, topic, or notes…"
              className="w-full rounded-2xl border border-black/10 dark:border-white/15 bg-white dark:bg-[#111113] pl-10 pr-4 py-2.5 text-[14px] placeholder:text-[#8A8A90] focus:outline-none focus:ring-1 focus:ring-black/20 dark:focus:ring-white/30"
            />
          </div>

          <button
            onClick={() => {
              const next = !onlyColleagues;
              setOnlyColleagues(next);
              load({ q: query, onlyColleagues: next });
            }}
            className={cn(
              "inline-flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm transition",
              onlyColleagues
                ? "bg-[#B89708]/10 text-[#8B6910] border-[#B89708]/30 dark:bg-[#B89708]/15 dark:text-[#E9B948] dark:border-[#B89708]/40"
                : "border-black/10 dark:border-white/15 bg-white/70 dark:bg-white/5 hover:bg-white dark:hover:bg-white/10"
            )}
          >
            <Users className="h-4 w-4" />
            Only colleagues (internal)
          </button>

          <div className="ml-auto text-xs text-[#6C6C72] dark:text-[#8A8A90] tabular-nums">
            {loading ? "Loading…" : `${filteredCount} people from email activity`}
          </div>
        </div>

        {/* Content */}
        {error && (
          <div className="mb-4 rounded-2xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        {loading && people.length === 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-[148px] rounded-3xl border border-black/5 dark:border-white/10 bg-white/60 dark:bg-white/5 animate-pulse" />
            ))}
          </div>
        ) : people.length === 0 ? (
          <div className="rounded-3xl border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/5 p-10 text-center">
            <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-black/5 dark:bg-white/10">
              <Mail className="h-5 w-5" />
            </div>
            <div className="font-medium">No people yet</div>
            <p className="mt-1 text-sm text-[#6C6C72] dark:text-[#8A8A90]">
              Run the gunlakecasino email backend sync to populate sender profiles from your inbox.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            <AnimatePresence>
              {people.map((p) => {
                const sl = strengthLabel(p.strength);
                return (
                  <motion.button
                    key={p.entity_id}
                    whileHover={{ y: -1 }}
                    whileTap={{ scale: 0.995 }}
                    onClick={() => openDetail(p)}
                    className="group text-left rounded-3xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#111113] p-4 hover:border-black/20 dark:hover:border-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B89708]/40"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold tracking-[-0.1px] text-[15px] truncate pr-1">{p.name}</div>
                        <div className="text-[12px] text-[#6C6C72] dark:text-[#8A8A90] truncate">{p.email || p.entity_id}</div>
                      </div>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2 py-px text-[10px] font-medium border",
                          p.is_colleague
                            ? "bg-emerald-500/10 text-emerald-700 border-emerald-600/20 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-400/30"
                            : "bg-amber-500/10 text-amber-800 border-amber-600/20 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-400/30"
                        )}
                      >
                        {p.is_colleague ? "Colleague" : "External"}
                      </span>
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                      <div className={cn("text-[11px] font-medium", sl.tone === "emerald" ? "text-emerald-600 dark:text-emerald-400" : sl.tone === "sky" ? "text-sky-600 dark:text-sky-400" : sl.tone === "amber" ? "text-amber-600 dark:text-amber-400" : "text-[#6C6C72] dark:text-[#8A8A90]")}>
                        {sl.label}
                      </div>
                      <div className="h-px flex-1 bg-black/10 dark:bg-white/10" />
                      <div className="tabular-nums text-[11px] text-[#6C6C72] dark:text-[#8A8A90]">{p.email_count} emails</div>
                    </div>

                    <div className="mt-1 text-[11.5px] text-[#6C6C72] dark:text-[#8A8A90]">
                      Last contact: <span className="tabular-nums">{formatRelative(p.last_seen)}</span>
                    </div>

                    {p.common_topics && p.common_topics.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {p.common_topics.slice(0, 3).map((t, i) => (
                          <span key={i} className="rounded-md bg-black/5 dark:bg-white/10 px-1.5 py-px text-[10px] text-[#444] dark:text-[#ccc]">
                            {t}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="mt-3 flex items-center gap-1.5 opacity-70 group-hover:opacity-100 transition">
                      <span className="text-[10px] inline-flex items-center gap-1 rounded-lg border border-black/10 dark:border-white/15 px-2 py-0.5">
                        <Edit2 className="h-3 w-3" /> Note
                      </span>
                      <span className="text-[10px] inline-flex items-center gap-1 rounded-lg border border-black/10 dark:border-white/15 px-2 py-0.5">
                        <Plus className="h-3 w-3" /> Task
                      </span>
                      <span className="ml-auto text-[10px] text-[#B89708] dark:text-[#E9B948]">View profile →</span>
                    </div>
                  </motion.button>
                );
              })}
            </AnimatePresence>
          </div>
        )}

        <div className="mt-8 text-[11px] text-[#6C6C72] dark:text-[#8A8A90]">
          Data is sourced exclusively from <span className="font-mono">gunlakecasino_sender_profiles</span> (populated by the email backend sync). Internal colleagues are derived from entity type + @gunlakecasino.com addresses.
        </div>
      </div>

      {/* Detail Drawer */}
      <AnimatePresence>
        {selected && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeDetail}
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px]"
            />
            {/* Panel */}
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 26, stiffness: 240 }}
              className="fixed right-0 top-0 z-50 h-full w-full max-w-[520px] overflow-y-auto border-l border-black/10 dark:border-white/10 bg-[#F8F8F9] dark:bg-[#0a0a0c] shadow-2xl"
            >
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-black/10 dark:border-white/10 bg-[#F8F8F9]/95 dark:bg-[#0a0a0c]/95 px-5 py-3 backdrop-blur">
                <div className="font-semibold tracking-[-0.1px] pr-3 truncate">{selected.name}</div>
                <button onClick={closeDetail} className="rounded-full p-2 hover:bg-black/5 dark:hover:bg-white/10">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="p-5 space-y-6">
                {/* Meta header */}
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-px text-xs font-medium border",
                        selected.is_colleague
                          ? "bg-emerald-500/10 text-emerald-700 border-emerald-600/20 dark:bg-emerald-500/15 dark:text-emerald-300"
                          : "bg-amber-500/10 text-amber-800 border-amber-600/20 dark:bg-amber-500/15 dark:text-amber-300"
                      )}
                    >
                      {selected.is_colleague ? "Colleague" : "External Relationship"}
                    </span>
                    <span className="text-xs text-[#6C6C72] dark:text-[#8A8A90]">{selected.email || "no email on file"}</span>
                  </div>
                  <div className="mt-1 text-sm text-[#6C6C72] dark:text-[#8A8A90]">
                    {selected.email_count} emails • first {formatDate(selected.first_seen)} • last {formatRelative(selected.last_seen)}
                  </div>
                </div>

                {/* Strength + topics */}
                <div className="rounded-2xl border border-black/10 dark:border-white/10 p-4 bg-white/70 dark:bg-white/5">
                  <div className="flex items-center justify-between text-sm">
                    <div>Relationship strength</div>
                    <div className="font-medium tabular-nums">{selected.strength}</div>
                  </div>
                  <div className="mt-2 h-1.5 w-full rounded bg-black/10 dark:bg-white/10 overflow-hidden">
                    <div className="h-1.5 bg-[#B89708]" style={{ width: `${selected.strength}%` }} />
                  </div>
                  {selected.common_topics && selected.common_topics.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {selected.common_topics.map((t, i) => (
                        <span key={i} className="text-[11px] rounded-md bg-black/5 dark:bg-white/10 px-2 py-0.5">{t}</span>
                      ))}
                    </div>
                  )}
                </div>

                {/* AI Summary */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Sparkles className="h-4 w-4 text-[#B89708]" /> AI Relationship Summary
                    </div>
                    <button
                      onClick={handleGenerateSummary}
                      disabled={aiLoading}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-[#B89708]/30 bg-[#B89708]/10 px-3 py-1 text-xs font-medium text-[#8B6910] dark:text-[#E9B948] hover:bg-[#B89708]/15 disabled:opacity-60"
                    >
                      {aiLoading ? "Generating…" : detail?.aiSummary ? "Regenerate" : "Generate with Grok"}
                    </button>
                  </div>
                  <div className="rounded-2xl border border-black/10 dark:border-white/10 bg-white/70 dark:bg-white/5 p-4 text-[13.2px] leading-snug min-h-[76px] whitespace-pre-wrap">
                    {detailLoading ? (
                      <div className="animate-pulse text-[#6C6C72]">Loading profile…</div>
                    ) : detail?.aiSummary ? (
                      detail.aiSummary
                    ) : (
                      <span className="text-[#6C6C72] dark:text-[#8A8A90]">No summary yet. Click generate to create a living analysis from recent emails and notes.</span>
                    )}
                  </div>
                </div>

                {/* Notes (editable) */}
                <div>
                  <div className="mb-1.5 flex items-center justify-between text-sm font-medium">
                    <div>Notes &amp; context</div>
                    <span className="text-[10px] text-[#6C6C72]">saved to profile</span>
                  </div>
                  <textarea
                    value={detail?.person.profile_notes || ""}
                    onChange={(e) => {
                      if (!detail) return;
                      const v = e.target.value;
                      setDetail({ ...detail, person: { ...detail.person, profile_notes: v } });
                    }}
                    onBlur={(e) => saveFullNotes(e.target.value)}
                    placeholder="Add private context, commitments, preferences, history…"
                    className="min-h-[108px] w-full resize-y rounded-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#111113] p-3 text-[13px] font-mono leading-snug focus:outline-none focus:ring-1 focus:ring-black/10"
                  />
                </div>

                {/* Quick add note */}
                <div>
                  <div className="text-sm font-medium mb-1.5">Quick note</div>
                  <div className="flex gap-2">
                    <input
                      value={noteDraft}
                      onChange={(e) => setNoteDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !savingNote) handleSaveNote(); }}
                      placeholder="Spoke about the terrazzo schedule…"
                      className="flex-1 rounded-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#111113] px-3 py-2 text-sm focus:outline-none"
                    />
                    <button
                      onClick={handleSaveNote}
                      disabled={savingNote || !noteDraft.trim()}
                      className="rounded-2xl border border-black/10 dark:border-white/15 px-3.5 text-sm disabled:opacity-50"
                    >
                      {savingNote ? "…" : "Add"}
                    </button>
                  </div>
                </div>

                {/* Quick task */}
                <div>
                  <div className="text-sm font-medium mb-1.5">Create task</div>
                  <div className="flex gap-2">
                    <input
                      value={taskDraft}
                      onChange={(e) => setTaskDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !savingTask) handleCreateTask(); }}
                      placeholder="Follow up on CBK vendor pricing"
                      className="flex-1 rounded-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#111113] px-3 py-2 text-sm focus:outline-none"
                    />
                    <button
                      onClick={handleCreateTask}
                      disabled={savingTask || !taskDraft.trim()}
                      className="inline-flex items-center gap-1.5 rounded-2xl border border-black/10 dark:border-white/15 px-3.5 text-sm disabled:opacity-50"
                    >
                      <CheckSquare className="h-3.5 w-3.5" /> {savingTask ? "…" : "Create"}
                    </button>
                  </div>
                </div>

                {/* Timeline */}
                <div>
                  <div className="mb-2 text-sm font-medium flex items-center gap-2">
                    <Clock className="h-4 w-4" /> Mixed timeline
                  </div>
                  {detailLoading ? (
                    <div className="text-xs text-[#6C6C72]">Loading…</div>
                  ) : (detail?.timeline?.length || 0) === 0 ? (
                    <div className="text-xs text-[#6C6C72] dark:text-[#8A8A90]">No timeline events recorded yet.</div>
                  ) : (
                    <div className="space-y-2 text-sm">
                      {(detail?.timeline || []).slice(0, 18).map((item, idx) => {
                        if (item.kind === "email") {
                          const e = item.email;
                          return (
                            <div key={idx} className="rounded-xl border border-black/8 dark:border-white/10 bg-white/70 dark:bg-white/5 px-3 py-2">
                              <div className="flex items-center gap-2 text-[11px] text-[#6C6C72] dark:text-[#8A8A90]">
                                <Mail className="h-3.5 w-3.5" /> {formatDate(e.received_at)} {e.has_attachments ? "• 📎" : ""}
                              </div>
                              <div className="font-medium leading-tight mt-0.5 line-clamp-2">{e.subject || "(no subject)"}</div>
                              {e.content_excerpt && <div className="text-xs text-[#6C6C72] dark:text-[#8A8A90] line-clamp-2 mt-0.5">{e.content_excerpt}</div>}
                            </div>
                          );
                        }
                        if (item.kind === "task") {
                          const t = item.task;
                          return (
                            <div key={idx} className="rounded-xl border border-black/8 dark:border-white/10 bg-white/70 dark:bg-white/5 px-3 py-2 text-xs flex gap-2">
                              <CheckSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#B89708]" />
                              <div>
                                <span className="font-medium">{t.title || t.id}</span>
                                <span className="text-[#6C6C72] dark:text-[#8A8A90]"> • {t.status || "open"}</span>
                              </div>
                            </div>
                          );
                        }
                        return (
                          <div key={idx} className="rounded-xl border border-black/8 dark:border-white/10 bg-white/70 dark:bg-white/5 px-3 py-2 text-xs italic text-[#6C6C72]">
                            {item.text}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Recent emails list (compact) */}
                {detail && detail.recentEmails.length > 0 && (
                  <div>
                    <div className="mb-1.5 text-xs uppercase tracking-widest text-[#6C6C72]">Recent emails</div>
                    <div className="max-h-48 overflow-auto rounded-2xl border border-black/10 dark:border-white/10 divide-y divide-black/5 dark:divide-white/10 bg-white/60 dark:bg-white/5 text-sm">
                      {detail.recentEmails.slice(0, 8).map((e) => (
                        <div key={e.message_id} className="px-3 py-2">
                          <div className="text-[11px] text-[#6C6C72]">{formatDate(e.received_at)}</div>
                          <div className="font-medium line-clamp-1">{e.subject || "(no subject)"}</div>
                        </div>
                      ))}
                    </div>
                  </div>
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
