"use client";

/**
 * TasksTab — the central hub for GRAVE task / responsibility management.
 *
 * Lives inside SudoWindow (type "sudo" in Command Palette).
 * Responsibilities:
 *   - Curate the global slot_task_catalog (add, edit, drag-reorder, delete)
 *   - Provide operator customization options for task UX (drag between cards,
 *     density, default colors, handle visibility)
 *   - (Future) quick view + reassign of the current night's task selections
 *
 * Style: exact match to other sudo tabs (dark zinc, red accents, Atkinson,
 * lucide icons, dense power-user rows, local toasts, onDataChanged).
 *
 * Prefs are stored in localStorage under "shiftbuilder:taskUxPrefs" for v1
 * (zero schema risk). Easy to promote later.
 */

import React from "react";
import {
  ListTodo,
  Plus,
  GripVertical,
  Pencil,
  Trash2,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getSlotTaskCatalog,
  updateCatalogTask,
  deleteCatalogTask,
  getCatalogTaskUsageCount,
  updateCatalogSortOrders,
  seedDefaultTasksForNight,
  type CatalogTask,
} from "@/lib/shiftbuilder/data";

export interface TasksTabProps {
  onDataChanged?: () => void;
  currentNightId?: string | null;   // optional — enables "Apply defaults to this night" button
}

type TaskType = "zone" | "rr" | "aux" | "overlap";

interface TaskUxPrefs {
  dragEnabled: boolean;
  showHandlesAlways: boolean;
  compact: boolean;
  defaultColor?: string | null;
}

const DEFAULT_PREFS: TaskUxPrefs = {
  dragEnabled: true,
  showHandlesAlways: false,
  compact: false,
  defaultColor: null,
};

const TYPE_LABELS: Record<TaskType, string> = {
  zone: "Zones",
  rr: "Restrooms",
  overlap: "Overlaps (PM/AM)",
  aux: "AUX / Support",
};

const TYPE_COLORS: Record<TaskType, string> = {
  zone: "bg-emerald-500/10 text-emerald-400",
  rr: "bg-amber-500/10 text-amber-400",
  overlap: "bg-violet-500/10 text-violet-400",
  aux: "bg-sky-500/10 text-sky-400",
};

export function TasksTab({ onDataChanged, currentNightId }: TasksTabProps) {
  const [catalog, setCatalog] = React.useState<CatalogTask[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [activeType, setActiveType] = React.useState<"all" | TaskType>("all");

  const [prefs, setPrefs] = React.useState<TaskUxPrefs>(DEFAULT_PREFS);
  const [showAdd, setShowAdd] = React.useState(false);
  const [newTask, setNewTask] = React.useState({
    slotType: "zone" as TaskType,
    slotKey: "",
    label: "",
  });

  // Load prefs from localStorage (v1 — zero risk)
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem("shiftbuilder:taskUxPrefs");
      if (raw) setPrefs({ ...DEFAULT_PREFS, ...JSON.parse(raw) });
    } catch {}
  }, []);

  const savePrefs = (next: Partial<TaskUxPrefs>) => {
    const merged = { ...prefs, ...next };
    setPrefs(merged);
    try {
      localStorage.setItem("shiftbuilder:taskUxPrefs", JSON.stringify(merged));
    } catch {}
    // Notify main canvas (it reads the same key)
    window.dispatchEvent(new CustomEvent("task-ux-prefs-changed", { detail: merged }));
  };

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await getSlotTaskCatalog();
      setCatalog(rows);
    } catch (e: any) {
      setError(e?.message || "Failed to load task catalog");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  // Grouped + filtered view
  const grouped = React.useMemo(() => {
    const q = query.toLowerCase().trim();
    const filtered = catalog.filter((t) => {
      const matchesQ = !q || t.label.toLowerCase().includes(q) || t.slotKey.toLowerCase().includes(q);
      const matchesType = activeType === "all" || t.slotType === activeType;
      return matchesQ && matchesType;
    });

    const groups: Record<string, CatalogTask[]> = {};
    for (const t of filtered) {
      const key = `${t.slotType}:${t.slotKey}`;
      (groups[key] ??= []).push(t);
    }
    // Sort inside each group by sortOrder then label
    Object.keys(groups).forEach((k) => {
      groups[k].sort((a, b) => (a.sortOrder - b.sortOrder) || a.label.localeCompare(b.label));
    });
    return groups;
  }, [catalog, query, activeType]);

  const showToast = (msg: string, kind: "ok" | "err" = "ok") => {
    if (kind === "ok") setSuccess(msg);
    else setError(msg);
    setTimeout(() => {
      setSuccess(null);
      setError(null);
    }, 3200);
  };

  // Simple add (future: richer form with slot picker)
  const handleAdd = async () => {
    const label = newTask.label.trim();
    if (!label || !newTask.slotKey) {
      showToast("Slot key and label are required", "err");
      return;
    }
    try {
      // Reuse the existing add function (it already handles the unique constraint)
      const { addSlotCatalogTask } = await import("@/lib/shiftbuilder/data");
      await addSlotCatalogTask({
        slotKey: newTask.slotKey,
        slotType: newTask.slotType,
        label,
        sortOrder: 100,
      });
      showToast("Task added to catalog");
      setNewTask({ slotType: "zone", slotKey: "", label: "" });
      setShowAdd(false);
      await refresh();
      onDataChanged?.();
    } catch (e: any) {
      showToast(e?.message || "Failed to add task", "err");
    }
  };

  // Inline label edit
  const handleEditLabel = async (t: CatalogTask, newLabel: string) => {
    const trimmed = newLabel.trim();
    if (!trimmed || trimmed === t.label) return;
    try {
      await updateCatalogTask({ id: t.id, label: trimmed });
      await refresh();
      onDataChanged?.();
      showToast("Label updated");
    } catch (e: any) {
      showToast(e?.message || "Update failed", "err");
    }
  };

  // Delete with usage guard
  const handleDelete = async (t: CatalogTask) => {
    const usage = await getCatalogTaskUsageCount(t.id);
    const msg = usage > 0
      ? `Delete "${t.label}"? It is currently used on ${usage} night(s). Historical sheets will keep the label.`
      : `Delete "${t.label}" from the catalog?`;
    if (!confirm(msg)) return;

    try {
      await deleteCatalogTask(t.id);
      await refresh();
      onDataChanged?.();
      showToast("Task removed from catalog");
    } catch (e: any) {
      showToast(e?.message || "Delete failed", "err");
    }
  };

  // Very lightweight drag-reorder (buttons for v1, full dnd-kit in next pass)
  // TODO: replace with proper @dnd-kit/sortable vertical list once the tab is stable
  const toggleDefault = async (t: CatalogTask) => {
    try {
      await updateCatalogTask({
        id: t.id,
        isDefaultOnNewNight: !t.isDefaultOnNewNight,
      } as any);
      await refresh();
      onDataChanged?.();
      showToast(t.isDefaultOnNewNight ? "Removed from daily defaults" : "Now seeds on new nights");
    } catch (e: any) {
      showToast(e?.message || "Failed to update default flag", "err");
    }
  };

  const handleSeedDefaults = async () => {
    if (!currentNightId) {
      showToast("No active night selected on the main board yet", "err");
      return;
    }
    try {
      const count = await seedDefaultTasksForNight(currentNightId);
      showToast(`Seeded ${count} default tasks to the current night`);
      onDataChanged?.();
    } catch (e: any) {
      showToast(e?.message || "Seeding failed", "err");
    }
  };

  const moveInGroup = async (groupKey: string, index: number, dir: -1 | 1) => {
    const items = grouped[groupKey];
    if (!items || index + dir < 0 || index + dir >= items.length) return;

    const a = items[index];
    const b = items[index + dir];

    // Swap their sortOrder values
    const updates = [
      { id: a.id, sortOrder: b.sortOrder },
      { id: b.id, sortOrder: a.sortOrder },
    ];
    try {
      await updateCatalogSortOrders(updates);
      await refresh();
      onDataChanged?.();
    } catch (e: any) {
      showToast(e?.message || "Reorder failed", "err");
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-zinc-400">
        <RefreshCw className="h-4 w-4 animate-spin mr-2" />
        Loading task catalog…
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-6 text-zinc-200" style={{ fontFamily: "var(--font-atkinson), var(--font-geist-sans)" }}>
      <div className="max-w-5xl">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-500/10 text-red-400">
            <ListTodo className="h-4.5 w-4.5" />
          </div>
          <div>
            <div className="font-semibold text-lg tracking-tight">Tasks &amp; Responsibilities</div>
            <div className="text-[12px] text-zinc-500">
              Master catalog for every zone, RR, overlap and AUX card. Drag to reorder. Changes appear instantly in the palette and on cards.
            </div>
          </div>
        </div>

        {/* Toasts */}
        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="mb-4 rounded-lg border border-emerald-900/60 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-200 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" /> {success}
          </div>
        )}

        {/* Customization Options (user request #5) */}
        <div className="mb-6 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
          <div className="text-[11px] uppercase tracking-[0.5px] text-zinc-500 font-semibold mb-3">Customization &amp; UX Options</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={prefs.dragEnabled}
                onChange={(e) => savePrefs({ dragEnabled: e.target.checked })}
                className="accent-red-500"
              />
              <span>Enable dragging tasks between cards on the main sheet</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={prefs.showHandlesAlways}
                onChange={(e) => savePrefs({ showHandlesAlways: e.target.checked })}
                className="accent-red-500"
              />
              <span>Always show drag handles on task rows (instead of hover)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={prefs.compact}
                onChange={(e) => savePrefs({ compact: e.target.checked })}
                className="accent-red-500"
              />
              <span>Compact task rows on the artboard</span>
            </label>
            <div className="text-[12px] text-zinc-500">
              These preferences are live for this browser. Global sync for the whole team will land in a follow-up.
            </div>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tasks or slot keys…"
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-9 pr-3 py-2 text-sm placeholder:text-zinc-500 focus:outline-none focus:border-red-500/50"
            />
          </div>

          <div className="flex items-center gap-1 text-xs">
            {(["all", "zone", "rr", "overlap", "aux"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setActiveType(t)}
                className={cn(
                  "px-3 py-1 rounded-full border transition-colors",
                  activeType === t
                    ? "bg-red-500/15 border-red-500/30 text-red-200"
                    : "border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
                )}
              >
                {t === "all" ? "All" : TYPE_LABELS[t as TaskType]}
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowAdd((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-300 px-3 py-1.5 text-sm font-medium transition-colors"
          >
            <Plus className="h-4 w-4" /> Add Task
          </button>

          <button
            onClick={refresh}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-800 hover:bg-zinc-900 px-3 py-1.5 text-sm"
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>

          {currentNightId && (
            <button
              onClick={handleSeedDefaults}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 px-3 py-1.5 text-sm font-medium"
              title="Insert every task marked as 'default on new night' into the current board"
            >
              <ListTodo className="h-4 w-4" /> Apply daily defaults
            </button>
          )}
        </div>

        {/* Add form */}
        {showAdd && (
          <div className="mb-4 rounded-lg border border-zinc-800 bg-zinc-950 p-4 flex flex-wrap gap-3 items-end">
            <div>
              <div className="text-[10px] text-zinc-500 mb-1">Type</div>
              <select
                value={newTask.slotType}
                onChange={(e) => setNewTask({ ...newTask, slotType: e.target.value as TaskType })}
                className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-sm"
              >
                <option value="zone">Zone</option>
                <option value="rr">Restroom</option>
                <option value="overlap">Overlap</option>
                <option value="aux">AUX</option>
              </select>
            </div>
            <div className="flex-1 min-w-[140px]">
              <div className="text-[10px] text-zinc-500 mb-1">Slot Key (e.g. zone_3, rr_6, overlap_pm_2)</div>
              <input
                value={newTask.slotKey}
                onChange={(e) => setNewTask({ ...newTask, slotKey: e.target.value })}
                className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-sm font-mono"
                placeholder="zone_1"
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <div className="text-[10px] text-zinc-500 mb-1">Task Label</div>
              <input
                value={newTask.label}
                onChange={(e) => setNewTask({ ...newTask, label: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-sm"
                placeholder="Main Entry – North Door"
              />
            </div>
            <button onClick={handleAdd} className="rounded bg-red-500/80 hover:bg-red-500 text-white px-4 py-1.5 text-sm font-medium">Add to Catalog</button>
            <button onClick={() => setShowAdd(false)} className="text-zinc-400 hover:text-zinc-200 px-2">Cancel</button>
          </div>
        )}

        {/* Catalog list */}
        {Object.keys(grouped).length === 0 ? (
          <div className="text-center py-12 text-zinc-500">
            No tasks match your filters.
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(grouped).map(([groupKey, items]) => {
              const first = items[0];
              const type = first.slotType as TaskType;
              return (
                <div key={groupKey} className="rounded-xl border border-zinc-800 bg-zinc-950/40 overflow-hidden">
                  <div className="px-4 py-2 bg-zinc-950/80 flex items-center gap-2 text-xs uppercase tracking-wider text-zinc-500 border-b border-zinc-800">
                    <span className={cn("px-2 py-0.5 rounded", TYPE_COLORS[type])}>{TYPE_LABELS[type]}</span>
                    <span className="font-mono text-zinc-400">{first.slotKey}</span>
                    <span className="ml-auto text-[10px]">{items.length} tasks</span>
                  </div>

                  <ul className="divide-y divide-zinc-800">
                    {items.map((t, idx) => (
                      <li key={t.id} className="group flex items-center gap-3 px-4 py-2 hover:bg-zinc-900/60 text-sm">
                        <div className="flex items-center gap-1 text-zinc-500">
                          <button onClick={() => moveInGroup(groupKey, idx, -1)} title="Move up" className="hover:text-zinc-300">↑</button>
                          <button onClick={() => moveInGroup(groupKey, idx, 1)} title="Move down" className="hover:text-zinc-300">↓</button>
                          <GripVertical className="h-3.5 w-3.5 opacity-40 group-hover:opacity-70" />
                        </div>

                        <div className="flex-1 font-medium text-zinc-100 truncate" title={t.label}>
                          {t.label}
                        </div>

                        <div className="flex items-center gap-2 text-xs text-zinc-500">
                          <span className="font-mono">#{t.sortOrder}</span>

                          {/* Default on new night toggle */}
                          <button
                            onClick={() => toggleDefault(t)}
                            className={cn(
                              "px-2 py-0.5 rounded-full border text-[10px] transition-colors",
                              t.isDefaultOnNewNight
                                ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400"
                                : "border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700"
                            )}
                            title={t.isDefaultOnNewNight
                              ? "This task will be auto-seeded on new nights. Click to remove."
                              : "Click to make this a daily default (auto-seeded on fresh nights)"}
                          >
                            {t.isDefaultOnNewNight ? "✓ Default" : "Default?"}
                          </button>

                          <button
                            onClick={() => {
                              const val = prompt("New label for this task?", t.label);
                              if (val) handleEditLabel(t, val);
                            }}
                            className="text-zinc-400 hover:text-red-400 p-1"
                            title="Edit label"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(t)}
                            className="text-red-400/70 hover:text-red-400 p-1"
                            title="Delete from catalog"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-8 text-[11px] text-zinc-500">
          Catalog changes are global and immediately available to the Command Palette “Tasks” action and every card popover. Historical nights keep the labels they were built with.
        </div>
      </div>
    </div>
  );
}
