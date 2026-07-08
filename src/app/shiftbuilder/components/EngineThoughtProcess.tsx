"use client";

/**
 * EngineThoughtProcess — the visible "showing its work" module for the unified
 * placement engine. When a unified run enters Draft Mode, the client stores a
 * structured reasoning object (adapters.nightResultToThoughtProcess) and this
 * floating panel renders it: the coverage/rotation headline, the planner →
 * optimizer → guard pipeline with per-stage timings and scores, every coverage
 * rescue it had to make (with the exact rule it relaxed), the rotation repeats
 * that were genuinely unavoidable, and who's left to float. Self-contained and
 * dismissible; renders nothing when there's no reasoning to show.
 */

import React from "react";
import { createPortal } from "react-dom";
import {
  useEngineThoughtProcess,
  useSetEngineThoughtProcess,
} from "../store/useShiftBuilderStore";
import { saveFeedback } from "@/lib/shiftbuilder/opsKnowledge/feedback";

interface ThoughtStage {
  name: string;
  ms: number;
  coverage: number;
  health: number;
}
interface ThoughtProcess {
  nightIso: string;
  summary: string;
  feasibility: string;
  coverage: number;
  healthTotal: number;
  totalMs: number;
  stages: ThoughtStage[];
  relaxations: string[];
  overflowFilled: string[];
  rescues: Array<{ slot: string; tmName: string; reason: string; relaxations: string[] }>;
  criticals: Array<{ slot: string; tmName: string }>;
  unplaced: { count: number; names: string[] };
  ai?: {
    provider: string;
    accepted: Array<{ slot: string; tmId: string; tmName: string; rationale: string }>;
    rejected: Array<{ slot: string; reason: string }>;
    notes?: string;
  };
}

const STAGE_LABELS: Record<string, string> = {
  planner: "Planner",
  optimizer: "Optimizer",
  guard: "Guard",
  ai: "AI",
  "rolling-solve": "Rolling",
  "cross-night-polish": "Polish",
};

export default function EngineThoughtProcess() {
  const tp = useEngineThoughtProcess() as ThoughtProcess | null;
  const setTp = useSetEngineThoughtProcess();
  const [collapsed, setCollapsed] = React.useState(false);
  const [taught, setTaught] = React.useState<Record<string, "endorsed" | "rejected">>({});

  const teach = React.useCallback(
    async (a: { slot: string; tmId: string; tmName: string; rationale: string }, verdict: "endorsed" | "rejected") => {
      let reason: string | undefined;
      if (verdict === "rejected" && typeof window !== "undefined") {
        reason = window.prompt("Why was this the wrong call? (this is how it learns)") ?? undefined;
      }
      setTaught((t) => ({ ...t, [a.slot]: verdict }));
      await saveFeedback({
        nightIso: tp?.nightIso ?? "",
        slotKey: a.slot,
        tmId: a.tmId,
        tmName: a.tmName,
        aiRationale: a.rationale,
        verdict,
        reason,
      });
    },
    [tp?.nightIso],
  );

  if (!tp || typeof document === "undefined") return null;

  // Portal to <body> at max z-index so no board overlay or stacking context can
  // hide it — the panel must be visible whenever a run publishes its reasoning.
  return createPortal(
    <div
      style={{
        position: "fixed",
        left: 16,
        bottom: 72,
        zIndex: 2147483000,
        width: collapsed ? 260 : 340,
        maxHeight: "72vh",
        overflowY: "auto",
        borderRadius: 18,
        background: "rgba(24,24,27,0.94)",
        border: "1px solid rgba(255,255,255,0.14)",
        boxShadow: "0 18px 48px -14px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.08)",
        backdropFilter: "blur(24px) saturate(1.4)",
        WebkitBackdropFilter: "blur(24px) saturate(1.4)",
        color: "#f2f2f7",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif",
        padding: 14,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: collapsed ? 0 : 10 }}>
        <span
          style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 22, height: 22, borderRadius: 7,
            background: "linear-gradient(135deg,#5e5ce6,#bf5af2)", fontSize: 12,
          }}
          aria-hidden
        >
          ✦
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.01em" }}>
            Engine Thought Process
          </div>
          <div style={{ fontSize: 9.5, opacity: 0.6 }}>
            {tp.totalMs}ms · unified pipeline
          </div>
        </div>
        <button
          onClick={() => setCollapsed((c) => !c)}
          style={iconBtn}
          aria-label={collapsed ? "Expand" : "Collapse"}
        >
          {collapsed ? "▸" : "▾"}
        </button>
        <button onClick={() => setTp(null)} style={iconBtn} aria-label="Dismiss">
          ✕
        </button>
      </div>

      {collapsed ? null : (
        <>
          {/* Headline */}
          <div
            style={{
              fontSize: 11.5, lineHeight: 1.4, marginBottom: 12,
              padding: "8px 10px", borderRadius: 12,
              background: "rgba(120,120,255,0.10)",
              border: "1px solid rgba(120,120,255,0.18)",
            }}
          >
            {tp.summary}
          </div>

          {/* Pipeline stages */}
          <SectionLabel>Pipeline</SectionLabel>
          <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
            {tp.stages.map((s, i) => (
              <React.Fragment key={s.name + i}>
                <div
                  style={{
                    flex: "1 1 0", minWidth: 64, padding: "6px 8px", borderRadius: 10,
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <div style={{ fontSize: 10, fontWeight: 700 }}>{STAGE_LABELS[s.name] ?? s.name}</div>
                  <div style={{ fontSize: 8.5, opacity: 0.55, fontFeatureSettings: "'tnum'" }}>{s.ms}ms</div>
                  <div style={{ fontSize: 8.5, opacity: 0.8, marginTop: 2 }}>
                    cov {s.coverage} · Σ{s.health}
                  </div>
                </div>
              </React.Fragment>
            ))}
          </div>

          {/* Feasibility */}
          {tp.feasibility ? (
            <div style={{ fontSize: 10, opacity: 0.72, marginBottom: 12, lineHeight: 1.35 }}>
              {tp.feasibility.replace(/^Feasibility:\s*/, "🧮 ")}
            </div>
          ) : null}

          {/* AI refinements */}
          {tp.ai && (tp.ai.accepted.length > 0 || tp.ai.rejected.length > 0 || tp.ai.notes) && (
            <>
              <SectionLabel>
                {tp.ai.provider} refinements
                {tp.ai.accepted.length > 0 && <Count n={tp.ai.accepted.length} tone="blue" />}
              </SectionLabel>
              <div style={{ marginBottom: 12 }}>
                {tp.ai.notes && (
                  <div style={{ fontSize: 10, opacity: 0.8, marginBottom: 6, lineHeight: 1.4, fontStyle: "italic" }}>
                    “{tp.ai.notes}”
                  </div>
                )}
                {tp.ai.accepted.slice(0, 6).map((a, i) => (
                  <div key={a.slot + i} style={{ padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                    <Row>
                      <SlotTag>{a.slot}</SlotTag>
                      <span style={{ flex: 1, minWidth: 0 }}>{a.tmName}</span>
                      {taught[a.slot] ? (
                        <Badge tone={taught[a.slot] === "endorsed" ? "blue" : "red"}>
                          {taught[a.slot] === "endorsed" ? "taught ✓" : "taught ✗"}
                        </Badge>
                      ) : (
                        <span style={{ display: "inline-flex", gap: 4 }}>
                          <button onClick={() => teach(a, "endorsed")} title="Good call — teach it to do more of this" style={teachBtn("#0a84ff")}>👍</button>
                          <button onClick={() => teach(a, "rejected")} title="Wrong call — teach it to avoid this" style={teachBtn("#ff453a")}>👎</button>
                        </span>
                      )}
                    </Row>
                    <div style={{ fontSize: 9.5, opacity: 0.62, lineHeight: 1.35, paddingLeft: 2, whiteSpace: "normal" }}>
                      {a.rationale}
                    </div>
                  </div>
                ))}
                {tp.ai.rejected.length > 0 && (
                  <div style={{ fontSize: 9.5, opacity: 0.5, marginTop: 6, lineHeight: 1.35 }}>
                    {tp.ai.rejected.length} proposal{tp.ai.rejected.length === 1 ? "" : "s"} rejected by the guard
                    (would break a rule or drop coverage).
                  </div>
                )}
                {tp.ai.accepted.length === 0 && !tp.ai.notes && (
                  <div style={{ fontSize: 10, opacity: 0.6, lineHeight: 1.35 }}>
                    {tp.ai.provider} reviewed the board and had no improving change to make.
                  </div>
                )}
              </div>
            </>
          )}

          {/* Coverage rescues */}
          {tp.rescues.length > 0 && (
            <>
              <SectionLabel>
                Coverage rescues <Count n={tp.rescues.length} tone="amber" />
              </SectionLabel>
              <div style={{ marginBottom: 12 }}>
                {tp.rescues.slice(0, 6).map((r, i) => (
                  <Row key={r.slot + i}>
                    <SlotTag>{r.slot}</SlotTag>
                    <span style={{ flex: 1, minWidth: 0 }}>{r.tmName}</span>
                    {r.relaxations.map((rx) => (
                      <Badge key={rx} tone="amber">{rx.replace("rotation-", "").replace("-", " ")}</Badge>
                    ))}
                  </Row>
                ))}
              </div>
            </>
          )}

          {/* Unavoidable criticals */}
          {tp.criticals.length > 0 && (
            <>
              <SectionLabel>
                Unavoidable repeats <Count n={tp.criticals.length} tone="red" />
              </SectionLabel>
              <div style={{ marginBottom: 12 }}>
                {tp.criticals.slice(0, 6).map((c, i) => (
                  <Row key={c.slot + i}>
                    <SlotTag>{c.slot}</SlotTag>
                    <span style={{ flex: 1, minWidth: 0 }}>{c.tmName}</span>
                    <Dot color="#ff453a" />
                  </Row>
                ))}
                <div style={{ fontSize: 9, opacity: 0.55, marginTop: 4, lineHeight: 1.35 }}>
                  These couldn't be swapped away without breaking a harder rule — the roster
                  forces them. Coverage beats rotation, so the engine filled and flagged them.
                </div>
              </div>
            </>
          )}

          {/* Overflow */}
          {tp.overflowFilled.length > 0 && (
            <div style={{ fontSize: 10, opacity: 0.75, marginBottom: 10 }}>
              ➕ Overflow deployed into {tp.overflowFilled.join(", ")} (Z2 before Z1).
            </div>
          )}

          {/* Available to float */}
          {tp.unplaced.count > 0 && (
            <>
              <SectionLabel>
                Available to float <Count n={tp.unplaced.count} tone="blue" />
              </SectionLabel>
              <div style={{ fontSize: 10, opacity: 0.75, lineHeight: 1.4 }}>
                {tp.unplaced.names.slice(0, 10).join(", ")}
                {tp.unplaced.count > 10 ? ` +${tp.unplaced.count - 10} more` : ""}
                <div style={{ opacity: 0.6, marginTop: 3 }}>
                  Every fixed slot is staffed — these are extra hands with no open position.
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>,
    document.body,
  );
}

const iconBtn: React.CSSProperties = {
  width: 22, height: 22, borderRadius: 6, border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.06)", color: "inherit", fontSize: 11, cursor: "pointer",
  display: "inline-flex", alignItems: "center", justifyContent: "center", lineHeight: 1,
};

function teachBtn(color: string): React.CSSProperties {
  return {
    width: 20, height: 18, borderRadius: 5, border: `1px solid ${color}55`,
    background: `${color}18`, cursor: "pointer", fontSize: 10, lineHeight: 1, padding: 0,
    display: "inline-flex", alignItems: "center", justifyContent: "center",
  };
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", opacity: 0.5, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
      {children}
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10.5, padding: "3px 0", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
      {children}
    </div>
  );
}

function SlotTag({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 5, background: "rgba(255,255,255,0.1)", fontFeatureSettings: "'tnum'" }}>
      {children}
    </span>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone: "amber" | "red" | "blue" }) {
  const c = tone === "amber" ? "#ff9f0a" : tone === "red" ? "#ff453a" : "#0a84ff";
  return (
    <span style={{ fontSize: 8.5, fontWeight: 700, padding: "1px 5px", borderRadius: 5, color: c, background: `${c}22`, border: `1px solid ${c}44` }}>
      {children}
    </span>
  );
}

function Count({ n, tone }: { n: number; tone: "amber" | "red" | "blue" }) {
  return <Badge tone={tone}>{n}</Badge>;
}

function Dot({ color }: { color: string }) {
  return <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0 }} />;
}
