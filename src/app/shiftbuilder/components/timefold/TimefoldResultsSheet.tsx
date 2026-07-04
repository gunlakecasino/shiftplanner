"use client";

import * as React from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  CheckCircle2,
  AlertTriangle,
  Download,
  FileText,
  Link2,
  ChevronDown,
  Loader2,
  Check,
  Wand2,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  PlusCircle,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { TimefoldProposalCard } from "./TimefoldProposalCard";
import { TimefoldDiffPreview } from "./TimefoldDiffPreview";
import type {
  TimefoldProposal,
  TimefoldRunResult,
  TimefoldSlotDiff,
} from "@/lib/shiftbuilder/timefold/timefoldTypes";

export interface TimefoldResultsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result: TimefoldRunResult | null;
  importing: boolean;
  imported: boolean;
  /** `diffs` is the operator's triage selection — a subset of proposal.diffs. */
  onImport: (proposal: TimefoldProposal, diffs?: TimefoldSlotDiff[]) => void;
  showToast?: (msg: string, kind?: "success" | "error" | "info") => void;
}

/** Section label in the placement-pad voice: tiny gray-400 uppercase, wide tracking. */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-gray-400">
      {children}
    </p>
  );
}

const PILL_MONO = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";

/** Compact count tile for the "changes at a glance" summary. */
function GlanceStat({
  icon,
  n,
  label,
  accent,
}: {
  icon: React.ReactNode;
  n: number;
  label: string;
  accent: string;
}) {
  const on = n > 0;
  return (
    <div className="flex flex-col items-center gap-0.5 text-center">
      <span
        className="flex items-center gap-1 text-[18px] font-bold tabular-nums leading-none"
        style={{ color: on ? accent : "var(--muted-foreground)", fontFamily: PILL_MONO, opacity: on ? 1 : 0.55 }}
      >
        <span style={{ opacity: on ? 1 : 0.6 }}>{icon}</span>
        {n}
      </span>
      <span className="text-[9px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

/** The placement-pad card shadow — soft, layered, crisp on white. */
const BOARD_CARD_SHADOW = "0 1px 3px rgba(0,0,0,0.05), 0 4px 16px -6px rgba(0,0,0,0.08)";

/**
 * Board-grade stat card: white elevated surface with a colored top accent
 * stripe (exactly like a deployment card), big mono "after" number in the
 * accent ink, struck "before", and a delta chip. The elevation + stripe is
 * what makes the board feel expensive — the sheet inherits it here.
 */
function HeroLiftCard({
  label,
  before,
  after,
  betterDirection,
}: {
  label: string;
  before: number;
  after: number;
  betterDirection: "up" | "down";
}) {
  const delta = after - before;
  const improved = betterDirection === "up" ? delta > 0 : delta < 0;
  const flat = delta === 0;
  const clean = betterDirection === "down" && after === 0;
  // A "lower is better" metric still sitting above zero is a standing warning,
  // even if this proposal didn't change it (e.g. 6 required slots still open).
  const standingWarn = betterDirection === "down" && after > 0 && flat;

  const GREEN = "#1f9d4d";
  const RED = "#c22d24";
  const AMBER = "#b45309";
  const GOLD = "var(--sb-gold-ink)";
  // Accent stripe + number ink: green when a "lower is better" metric hits zero,
  // gold when improved, red when it regressed, amber when still-open, else neutral.
  const accent = clean ? GREEN : improved ? GOLD : !flat ? RED : standingWarn ? AMBER : "var(--sb-glass-border)";
  const numberInk = clean ? GREEN : improved ? GOLD : !flat ? RED : standingWarn ? AMBER : "var(--foreground)";

  return (
    <div
      className="relative flex flex-col gap-1 overflow-hidden rounded-2xl px-3 pb-2.5 pt-3"
      style={{
        background: "var(--ios-background-secondary)",
        border: "1px solid #f0f0f0",
        boxShadow: BOARD_CARD_SHADOW,
      }}
    >
      {/* Top accent stripe — same identity as CardAccentStripe on the board. */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-[3px]"
        style={{ background: accent }}
      />
      <div
        className="text-[9px] font-bold uppercase text-muted-foreground"
        style={{ fontFamily: "var(--font-atkinson), var(--font-geist-sans)", letterSpacing: "1px" }}
      >
        {label}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span
          className="text-[26px] font-bold leading-none tabular-nums tracking-[-0.02em]"
          style={{ color: numberInk, fontFamily: PILL_MONO }}
        >
          {after}
        </span>
        {!flat && (
          <span className="text-[11px] tabular-nums text-muted-foreground line-through decoration-muted-foreground/40">
            {before}
          </span>
        )}
      </div>
      <span
        className="flex w-fit items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold tabular-nums"
        style={
          flat
            ? { background: "var(--sb-glass-lowlight)", color: "var(--muted-foreground)" }
            : improved
              ? { background: "rgba(52,199,89,0.16)", color: GREEN, border: "1px solid rgba(52,199,89,0.35)" }
              : { background: "rgba(255,59,48,0.14)", color: RED, border: "1px solid rgba(255,59,48,0.3)" }
        }
        aria-label={flat ? "unchanged" : `${improved ? "improves" : "worsens"} by ${Math.abs(delta)}`}
      >
        {flat ? (
          clean ? "clean" : "—"
        ) : delta > 0 ? (
          <>
            <TrendingUp size={9} aria-hidden /> +{delta}
          </>
        ) : (
          <>
            <TrendingDown size={9} aria-hidden /> {delta}
          </>
        )}
      </span>
    </div>
  );
}

/**
 * Right-side results sheet for Optimize Tonight.
 * Velvet glass shell (matches RotationHealthFloater drawer + MarkerPad language):
 * gold wand orb header, segmented tabs, glass stat cards, triaged diffs, and
 * a gold capsule import action. Tabs: Overview | Health | Diffs | Export.
 * Proposal selection is local to this sheet; Import acts on the triage
 * selection of whichever proposal is currently viewed.
 */
export function TimefoldResultsSheet({
  open,
  onOpenChange,
  result,
  importing,
  imported,
  onImport,
  showToast,
}: TimefoldResultsSheetProps) {
  const proposals = result?.proposals ?? [];
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (proposals.length > 0 && !proposals.some((p) => p.id === selectedId)) {
      setSelectedId(proposals[0].id);
    }
  }, [proposals, selectedId]);

  const selected = proposals.find((p) => p.id === selectedId) ?? proposals[0] ?? null;

  // Triage selection — which diffs of the selected proposal get imported.
  // Defaults to all; resets whenever the proposal (or run) changes.
  const [selectedDiffKeys, setSelectedDiffKeys] = React.useState<Set<string>>(new Set());
  React.useEffect(() => {
    setSelectedDiffKeys(new Set((selected?.diffs ?? []).map((d) => d.slotKey)));
  }, [selected?.id, result]);

  const toggleDiffKey = React.useCallback((slotKey: string) => {
    setSelectedDiffKeys((prev) => {
      const next = new Set(prev);
      if (next.has(slotKey)) next.delete(slotKey);
      else next.add(slotKey);
      return next;
    });
  }, []);

  const toggleDiffKeys = React.useCallback((slotKeys: string[], on: boolean) => {
    setSelectedDiffKeys((prev) => {
      const next = new Set(prev);
      for (const k of slotKeys) {
        if (on) next.add(k);
        else next.delete(k);
      }
      return next;
    });
  }, []);

  const selectedDiffs = (selected?.diffs ?? []).filter((d) => selectedDiffKeys.has(d.slotKey));

  // Controlled tabs so the Overview's "review changes" CTA can jump to Diffs.
  const [tab, setTab] = React.useState("overview");
  React.useEffect(() => {
    if (result) setTab("overview");
  }, [result]);

  // Consequence buckets for the Overview "changes at a glance" summary.
  const changeGroups = React.useMemo(() => {
    const diffs = selected?.diffs ?? [];
    const fills = diffs.filter((d) => !d.previousTmId && d.proposedTmId).length;
    const rotation = diffs.filter((d) => d.previousTmId && d.improvesRotationHealth).length;
    const enabling = diffs.length - fills - rotation;
    return { fills, rotation, enabling, total: diffs.length };
  }, [selected?.diffs]);

  const handleExport = (label: string) => {
    showToast?.(`${label} — coming soon once the export pipeline lands`, "info");
  };

  // Tabs in the placement-pad's bottom-action-bar language: white pills,
  // gray-900 selected with a soft lift — crisp, not glassy.
  const segmentClass =
    "rounded-xl px-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-400 data-selected:bg-white data-selected:text-gray-900 data-selected:shadow-[0_1px_3px_rgba(0,0,0,0.1)]";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="no-print w-full gap-3 rounded-l-3xl border-l-0 bg-transparent sm:max-w-lg"
        style={{
          // Solid white, crisp — the placement-pad / board-card surface, not glass.
          background: "#ffffff",
          borderLeft: "1px solid #f0f0f0",
          boxShadow: "-8px 0 32px rgba(0,0,0,0.09), -1px 0 3px rgba(0,0,0,0.05)",
          // Match the ShiftBuilder builder-canvas typeface (Helvetica Neue). The sheet
          // is portaled to <body>, outside .sb-canvas-builder's font remap, so we mirror
          // that remap here — every child var(--font-*) resolves to the builder font,
          // exactly like the board and the placement pad.
          ["--font-atkinson" as string]: "var(--font-builder)",
          ["--font-bricolage" as string]: "var(--font-builder)",
          ["--font-inter-tight" as string]: "var(--font-builder)",
          ["--font-ui" as string]: "var(--font-builder)",
          ["--font-geist-sans" as string]: "var(--font-builder)",
          fontFamily: "var(--font-builder, 'Helvetica Neue', Helvetica, Arial, sans-serif)",
        }}
      >
        <SheetHeader className="pb-1">
          <div className="flex items-center gap-3">
            <div
              aria-hidden
              className="flex size-10 shrink-0 items-center justify-center rounded-full"
              style={{
                // Pad avatar pattern: solid accent circle, white glyph.
                background: "var(--sb-gold-ink)",
                boxShadow: "0 2px 8px -2px color-mix(in srgb, var(--sb-gold-ink) 55%, transparent)",
              }}
            >
              <Wand2 size={18} color="#fff" strokeWidth={2.25} />
            </div>
            <div className="min-w-0 flex-1">
              <p
                className="mb-px text-[9px] font-bold uppercase tracking-[0.14em]"
                style={{ color: "var(--sb-gold-ink)" }}
              >
                Deep Optimize
              </p>
              <SheetTitle className="text-[17px] font-bold leading-tight tracking-[-0.01em] text-gray-900">
                Optimize Tonight
              </SheetTitle>
              <SheetDescription className="truncate text-[11px] tabular-nums text-gray-400">
                {result
                  ? `${result.dateLabel} · ${result.durationSeconds}s · ${proposals.length} proposal${proposals.length === 1 ? "" : "s"}`
                  : "No run yet."}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        {!result || !selected ? (
          <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
            Run Optimize Tonight from the rotation health orb or More menu.
          </div>
        ) : (
          <Tabs
            value={tab}
            onValueChange={(v) => setTab(v as string)}
            className="flex flex-1 flex-col overflow-hidden px-4"
          >
            <TabsList
              className="h-9 w-full rounded-2xl p-1"
              style={{ background: "#f4f4f5", border: "1px solid #ececed" }}
            >
              <TabsTrigger value="overview" className={segmentClass}>
                Overview
              </TabsTrigger>
              <TabsTrigger value="health" className={segmentClass}>
                Health
              </TabsTrigger>
              <TabsTrigger value="diffs" className={segmentClass}>
                Diffs
              </TabsTrigger>
              <TabsTrigger value="export" className={segmentClass}>
                Export
              </TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-y-auto py-3">
              <TabsContent value="overview" className="flex flex-col gap-4">
                <div className="grid grid-cols-3 gap-2">
                  {selected.healthLifts.map((lift) => (
                    <HeroLiftCard key={lift.label} {...lift} />
                  ))}
                </div>

                <div className="flex flex-col gap-2">
                  <SectionLabel>Proposals</SectionLabel>
                  {proposals.map((p) => (
                    <TimefoldProposalCard
                      key={p.id}
                      proposal={p}
                      selected={p.id === selected.id}
                      onSelect={() => setSelectedId(p.id)}
                    />
                  ))}
                </div>

                {selected.diffs.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <SectionLabel>Changes at a glance</SectionLabel>
                    <div
                      className="flex flex-col gap-3 rounded-2xl p-3.5"
                      style={{
                        background: "var(--ios-background-secondary)",
                        border: "1px solid #f0f0f0",
                        boxShadow: BOARD_CARD_SHADOW,
                      }}
                    >
                      <div className="grid grid-cols-3 gap-2">
                        <GlanceStat
                          icon={<PlusCircle size={13} />}
                          n={changeGroups.fills}
                          label="Fills"
                          accent="var(--sb-gold-ink)"
                        />
                        <GlanceStat
                          icon={<ShieldCheck size={13} />}
                          n={changeGroups.rotation}
                          label="Rotation fixes"
                          accent="#1f9d4d"
                        />
                        <GlanceStat
                          icon={<Sparkles size={13} />}
                          n={changeGroups.enabling}
                          label="Enabling"
                          accent="var(--muted-foreground)"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setTab("diffs")}
                        className="flex items-center justify-center gap-1.5 rounded-2xl py-2.5 text-[12px] font-semibold transition-opacity hover:opacity-85"
                        style={{
                          background: "var(--sb-gold-surface)",
                          color: "var(--sb-gold-ink)",
                          border: "1px solid var(--sb-gold-border)",
                        }}
                      >
                        Review &amp; pick changes <ArrowRight size={13} />
                      </button>
                    </div>
                    <p className="px-1 text-center text-[10px] leading-relaxed text-muted-foreground/80">
                      Optimized for{" "}
                      <span className="font-semibold text-muted-foreground">
                        coverage → rotation → preferences → skill
                      </span>
                      . Nothing changes until you import to Draft.
                    </p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="health" className="flex flex-col gap-4">
                <div className="grid grid-cols-3 gap-2">
                  {selected.healthLifts.map((lift) => (
                    <HeroLiftCard key={lift.label} {...lift} />
                  ))}
                </div>
                <div className="flex flex-col gap-2">
                  <SectionLabel>Constraints</SectionLabel>
                  {selected.constraints.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[12px]"
                      style={{
                        background: "var(--ios-background-secondary)",
                        border: "1px solid #f0f0f0",
                        boxShadow: "0 1px 2px rgba(0,0,0,0.04), 0 6px 18px -10px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.9)",
                      }}
                    >
                      {c.status === "satisfied" ? (
                        <CheckCircle2 size={14} className="shrink-0 text-emerald-500" />
                      ) : (
                        <AlertTriangle size={14} className="shrink-0 text-amber-500" />
                      )}
                      <span className="min-w-0 flex-1 truncate font-medium text-foreground/85">
                        {c.label}
                      </span>
                      {c.detail && (
                        <span className="shrink-0 text-[11px] text-muted-foreground">{c.detail}</span>
                      )}
                    </div>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="diffs">
                <TimefoldDiffPreview
                  diffs={selected.diffs}
                  selectedKeys={selectedDiffKeys}
                  onToggleKey={toggleDiffKey}
                  onToggleKeys={toggleDiffKeys}
                />
              </TabsContent>

              <TabsContent value="export" className="flex flex-col gap-3">
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                  Export options are stubbed until the export pipeline lands — these won&apos;t
                  produce a file yet.
                </p>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <button
                        type="button"
                        className="flex w-fit items-center gap-1.5 rounded-2xl border border-gray-200 bg-white px-3.5 py-2 text-[12px] font-semibold text-gray-800 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-colors hover:bg-gray-50"
                      >
                        Export as… <ChevronDown size={13} />
                      </button>
                    }
                  />
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem onClick={() => handleExport("PDF export")}>
                      <FileText size={14} /> PDF summary
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleExport("Download proposal")}>
                      <Download size={14} /> Download proposal (.json)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleExport("Share link")}>
                      <Link2 size={14} /> Copy share link
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TabsContent>
            </div>
          </Tabs>
        )}

        {result && selected && (
          <SheetFooter
            className="gap-2 pt-2"
            style={{ borderTop: "1px solid #f0f0f0" }}
          >
            <button
              type="button"
              className="flex h-12 w-full items-center justify-center gap-1.5 rounded-2xl text-[13px] font-bold tracking-[0.01em] transition-[transform,opacity] active:scale-[0.985] disabled:opacity-45"
              style={{
                background: "linear-gradient(180deg, var(--sb-gold), var(--sb-gold-ink))",
                color: "#231d00",
                boxShadow:
                  "inset 0 1px 0 rgba(255,255,255,0.55), 0 8px 20px -8px color-mix(in srgb, var(--sb-gold-ink) 55%, transparent)",
              }}
              disabled={importing || imported || selectedDiffs.length === 0}
              onClick={() => onImport(selected, selectedDiffs)}
            >
              {imported ? (
                <>
                  <Check size={15} strokeWidth={2.5} /> Imported to Draft
                </>
              ) : importing ? (
                <>
                  <Loader2 size={15} className="animate-spin motion-reduce:animate-none" /> Importing…
                </>
              ) : selectedDiffs.length === selected.diffs.length ? (
                `Import all ${selected.diffs.length} changes to Draft`
              ) : (
                `Import ${selectedDiffs.length} of ${selected.diffs.length} changes to Draft`
              )}
            </button>
            <button
              type="button"
              className="h-9 w-full rounded-full text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => onOpenChange(false)}
            >
              Close — keep board as is
            </button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
