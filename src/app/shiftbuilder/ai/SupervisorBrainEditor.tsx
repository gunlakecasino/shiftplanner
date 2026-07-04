"use client";

/**
 * SupervisorBrainEditor — the /ai console for the Ops knowledge base.
 *
 * Where tribal knowledge becomes data the AI reasons with: rules-of-thumb
 * (policies), per-TM dossiers (capability by zone, accommodations, reliability,
 * training status, free-text notes), and the chemistry graph. Mixed capture:
 * structured fields for the safety-critical + free-text for the nuanced.
 * Loads/saves the single global knowledge row (opsKnowledge/data).
 */

import React from "react";
import { getGraveAvailableTeamMembers } from "@/lib/shiftbuilder/data";
import { ZONE_DEFS, RR_DEFS } from "@/lib/shiftbuilder/constants";
import { loadOpsKnowledge, saveOpsKnowledge } from "@/lib/shiftbuilder/opsKnowledge/data";
import { loadRecentFeedback, type AiFeedbackExample } from "@/lib/shiftbuilder/opsKnowledge/feedback";
import {
  emptyOpsKnowledge,
  type OpsKnowledge,
  type TmDossier,
  type Policy,
  type ChemistryLink,
} from "@/lib/shiftbuilder/opsKnowledge/types";

const GOLD = "#C5A26F";
const SLOT_OPTIONS = [
  ...ZONE_DEFS.map((z) => z.key),
  ...RR_DEFS.flatMap((d) => [`MRR${d.num}`, `WRR${d.num}`]),
  "ADM", "Z9SR",
];

type Tm = { id: string; name: string };

export default function SupervisorBrainEditor() {
  const [k, setK] = React.useState<OpsKnowledge>(emptyOpsKnowledge());
  const [tms, setTms] = React.useState<Tm[]>([]);
  const [selectedTm, setSelectedTm] = React.useState<string>("");
  const [status, setStatus] = React.useState<string>("");
  const [loading, setLoading] = React.useState(true);
  const [feedback, setFeedback] = React.useState<AiFeedbackExample[]>([]);

  React.useEffect(() => {
    (async () => {
      const [knowledge, roster, fb] = await Promise.all([
        loadOpsKnowledge(),
        // Grave-eligible only (active + in a grave pool) — the people this board places.
        getGraveAvailableTeamMembers(),
        loadRecentFeedback(30),
      ]);
      setK(knowledge);
      setFeedback(fb);
      // Full-grave only — exclude AM/PM overlap pools, which are just filled in
      // order into the overlap slots and need no per-TM dossier judgment.
      const list = roster
        .filter((p) => {
          const pool = String(p.gravePool ?? "").toUpperCase();
          return pool !== "AM" && pool !== "PM";
        })
        .map((p) => ({ id: p.id, name: p.name }));
      setTms(list);
      if (list[0]) setSelectedTm(list[0].id);
      setLoading(false);
    })();
  }, []);

  const nameOf = (id: string) => tms.find((t) => t.id === id)?.name ?? id;
  const dossier = (id: string): TmDossier =>
    k.dossiers[id] ?? { tmId: id, capabilities: [], accommodations: [] };

  const setDossier = (id: string, next: TmDossier) =>
    setK((prev) => ({ ...prev, dossiers: { ...prev.dossiers, [id]: next } }));

  const save = async () => {
    setStatus("Saving…");
    const res = await saveOpsKnowledge(k);
    setStatus(res.ok ? "Saved ✓" : `Error: ${res.error}`);
    setTimeout(() => setStatus(""), 2500);
  };

  if (loading) return <div style={{ color: "#8E8E93", padding: 16 }}>Loading Supervisor Brain…</div>;

  const hasData = (dd: TmDossier) =>
    !!(dd.capabilities.length || dd.accommodations.length || dd.notes || dd.reliability || dd.trainingStatus || dd.developmentGoals?.length);
  const documentedCount = Object.values(k.dossiers).filter(hasData).length;
  const d = dossier(selectedTm);

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: 3, fontWeight: 600, color: "#8E8E93" }}>SUPERVISOR BRAIN</div>
          <div style={{ fontSize: 13, color: "#A1A1AA", marginTop: 4 }}>
            The knowledge the AI reasons with. Structured for safety-critical, free-text for nuance.
          </div>
        </div>
        <button onClick={save} style={btn(GOLD, true)}>Save knowledge</button>
      </div>
      {status && <div style={{ fontSize: 12, color: status.startsWith("Error") ? "#ff6b6b" : GOLD }}>{status}</div>}

      {/* Summary stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
        {[
          { label: "Rules of thumb", value: k.policies.filter((p) => p.active).length },
          { label: "Documented TMs", value: documentedCount },
          { label: "Chemistry links", value: k.chemistry.length },
          { label: "Learned examples", value: feedback.length },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl" style={{ background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.06)", padding: "10px 12px" }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#F2F2F4", fontVariantNumeric: "tabular-nums" }}>{s.value}</div>
            <div style={{ fontSize: 10.5, color: "#8E8E93", marginTop: 1 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Policies ─────────────────────────────────────────── */}
      <Section title="Rules of thumb" hint="How you want people placed. HARD are enforced; soft guide the AI.">
        {k.policies.map((p, i) => (
          <div key={p.id} style={row}>
            <input
              value={p.text}
              onChange={(e) => updateArr(setK, "policies", i, { ...p, text: e.target.value })}
              placeholder="e.g. Z9 needs someone solid; trainees never alone in high-limit"
              style={inp(1)}
            />
            <select value={p.strength} onChange={(e) => updateArr(setK, "policies", i, { ...p, strength: e.target.value as any })} style={inp(0, 90)}>
              <option value="hard">hard</option><option value="soft">soft</option>
            </select>
            <label style={{ ...chip, cursor: "pointer" }}>
              <input type="checkbox" checked={p.active} onChange={(e) => updateArr(setK, "policies", i, { ...p, active: e.target.checked })} /> on
            </label>
            <button onClick={() => removeArr(setK, "policies", i)} style={btn("#ff6b6b")}>✕</button>
          </div>
        ))}
        <button onClick={() => addArr<Policy>(setK, "policies", { id: `p_${Date.now()}`, text: "", strength: "soft", active: true })} style={btn(GOLD)}>+ Add rule</button>
      </Section>

      {/* ── Per-TM dossier ───────────────────────────────────── */}
      <Section title="Team member dossiers" hint="Capability by zone, accommodations, reliability, notes.">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
          {tms.map((t) => {
            const has = hasData(dossier(t.id));
            const sel = t.id === selectedTm;
            return (
              <button
                key={t.id}
                onClick={() => setSelectedTm(t.id)}
                style={{
                  fontSize: 12, fontWeight: 600, padding: "5px 11px", borderRadius: 9, cursor: "pointer",
                  background: sel ? GOLD : has ? "rgba(197,162,111,0.12)" : "rgba(255,255,255,0.04)",
                  color: sel ? "#12121a" : has ? GOLD : "#A1A1AA",
                  border: `1px solid ${sel ? GOLD : has ? "rgba(197,162,111,0.3)" : "rgba(255,255,255,0.1)"}`,
                }}
              >
                {t.name}{has && !sel ? " •" : ""}
              </button>
            );
          })}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <Field label="Reliability (1–5)">
            <select value={d.reliability ?? ""} onChange={(e) => setDossier(selectedTm, { ...d, reliability: e.target.value ? (Number(e.target.value) as any) : undefined })} style={inp(0)}>
              <option value="">—</option>{[1,2,3,4,5].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </Field>
          <Field label="Training status">
            <select value={d.trainingStatus ?? ""} onChange={(e) => setDossier(selectedTm, { ...d, trainingStatus: (e.target.value || undefined) as any })} style={inp(0)}>
              <option value="">—</option><option value="trainee">trainee</option><option value="developing">developing</option><option value="seasoned">seasoned</option><option value="trainer">trainer</option>
            </select>
          </Field>
        </div>

        <Field label="Notes (free text — the AI reads this verbatim)">
          <textarea value={d.notes ?? ""} onChange={(e) => setDossier(selectedTm, { ...d, notes: e.target.value })} placeholder="Tribal knowledge: personality, quirks, what they're great at, what to watch…" style={{ ...inp(1), minHeight: 64, resize: "vertical" as const }} />
        </Field>

        <div style={{ fontSize: 11, color: "#8E8E93", margin: "12px 0 6px", fontWeight: 600 }}>ACCOMMODATIONS (hard = never placed there)</div>
        {d.accommodations.map((a, i) => (
          <div key={i} style={row}>
            <input value={a.label} onChange={(e) => setDossier(selectedTm, { ...d, accommodations: replace(d.accommodations, i, { ...a, label: e.target.value }) })} placeholder="e.g. No sweeper (back)" style={inp(1)} />
            <select value={a.severity} onChange={(e) => setDossier(selectedTm, { ...d, accommodations: replace(d.accommodations, i, { ...a, severity: e.target.value as any }) })} style={inp(0, 80)}>
              <option value="hard">hard</option><option value="soft">soft</option>
            </select>
            <input value={(a.blockedSlotKeys ?? []).join(",")} onChange={(e) => setDossier(selectedTm, { ...d, accommodations: replace(d.accommodations, i, { ...a, blockedSlotKeys: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) }) })} placeholder="blocked slots e.g. Z5,Z9" style={inp(1)} />
            <button onClick={() => setDossier(selectedTm, { ...d, accommodations: d.accommodations.filter((_, j) => j !== i) })} style={btn("#ff6b6b")}>✕</button>
          </div>
        ))}
        <button onClick={() => setDossier(selectedTm, { ...d, accommodations: [...d.accommodations, { kind: "other", label: "", severity: "hard", blockedSlotKeys: [] }] })} style={btn(GOLD)}>+ Add accommodation</button>

        <div style={{ fontSize: 11, color: "#8E8E93", margin: "12px 0 6px", fontWeight: 600 }}>CAPABILITY BY AREA (1 struggles · 5 excellent)</div>
        {d.capabilities.map((c, i) => (
          <div key={i} style={row}>
            <select value={c.area} onChange={(e) => setDossier(selectedTm, { ...d, capabilities: replace(d.capabilities, i, { ...c, area: e.target.value }) })} style={inp(0, 140)}>
              {SLOT_OPTIONS.concat(["restrooms", "highlimit"]).map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={c.level} onChange={(e) => setDossier(selectedTm, { ...d, capabilities: replace(d.capabilities, i, { ...c, level: Number(e.target.value) as any }) })} style={inp(0, 70)}>
              {[1,2,3,4,5].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <input value={c.note ?? ""} onChange={(e) => setDossier(selectedTm, { ...d, capabilities: replace(d.capabilities, i, { ...c, note: e.target.value }) })} placeholder="note (optional)" style={inp(1)} />
            <button onClick={() => setDossier(selectedTm, { ...d, capabilities: d.capabilities.filter((_, j) => j !== i) })} style={btn("#ff6b6b")}>✕</button>
          </div>
        ))}
        <button onClick={() => setDossier(selectedTm, { ...d, capabilities: [...d.capabilities, { area: SLOT_OPTIONS[0], level: 3 }] })} style={btn(GOLD)}>+ Add capability</button>
      </Section>

      {/* ── Chemistry ────────────────────────────────────────── */}
      <Section title="Chemistry" hint="Who to pair (trainer→trainee) and who to keep apart.">
        {k.chemistry.map((c, i) => (
          <div key={i} style={row}>
            <select value={c.aTmId} onChange={(e) => updateArr(setK, "chemistry", i, { ...c, aTmId: e.target.value })} style={inp(0, 150)}>
              <option value="">TM A…</option>{tms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <select value={c.kind} onChange={(e) => updateArr(setK, "chemistry", i, { ...c, kind: e.target.value as any })} style={inp(0, 130)}>
              <option value="keep_together">keep together</option><option value="keep_apart">keep apart</option>
            </select>
            <select value={c.bTmId} onChange={(e) => updateArr(setK, "chemistry", i, { ...c, bTmId: e.target.value })} style={inp(0, 150)}>
              <option value="">TM B…</option>{tms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <select value={c.strength} onChange={(e) => updateArr(setK, "chemistry", i, { ...c, strength: e.target.value as any })} style={inp(0, 80)}>
              <option value="hard">hard</option><option value="soft">soft</option>
            </select>
            <input value={c.reason ?? ""} onChange={(e) => updateArr(setK, "chemistry", i, { ...c, reason: e.target.value })} placeholder="reason" style={inp(1)} />
            <button onClick={() => removeArr(setK, "chemistry", i)} style={btn("#ff6b6b")}>✕</button>
          </div>
        ))}
        <button onClick={() => addArr<ChemistryLink>(setK, "chemistry", { aTmId: "", bTmId: "", kind: "keep_together", strength: "soft" })} style={btn(GOLD)}>+ Add pair</button>
      </Section>

      {/* ── Learned from you (the training loop) ─────────────── */}
      <Section title="Learned from you" hint="Your 👍/👎 on the engine's AI picks. These become few-shot examples that steer future runs.">
        {feedback.length === 0 ? (
          <div style={{ fontSize: 12, color: "#6B7280" }}>
            No feedback yet. Run the AI engine, then thumbs-up/down its picks in the Thought Process panel — each one teaches it your judgment.
          </div>
        ) : (
          <>
            <div style={{ fontSize: 12, color: "#A1A1AA", marginBottom: 8 }}>
              {feedback.filter((f) => f.verdict === "endorsed").length} endorsed · {feedback.filter((f) => f.verdict === "rejected").length} rejected · newest first
            </div>
            {feedback.slice(0, 12).map((f) => (
              <div key={f.id} style={{ ...row, fontSize: 12, padding: "3px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                <span style={{ color: f.verdict === "endorsed" ? "#0a84ff" : "#ff453a", fontWeight: 700, width: 16 }}>
                  {f.verdict === "endorsed" ? "✓" : "✗"}
                </span>
                <span style={{ ...chip, background: "rgba(255,255,255,0.08)", borderRadius: 5 }}>{f.slotKey}</span>
                <span style={{ color: "#F2F2F4" }}>{f.tmName}</span>
                <span style={{ flex: 1, minWidth: 120, color: "#8E8E93" }}>
                  {f.reason ? `— ${f.reason}` : f.aiRationale.slice(0, 80)}
                </span>
              </div>
            ))}
          </>
        )}
      </Section>
    </div>
  );
}

// ── helpers ──────────────────────────────────────────────────
function replace<T>(arr: T[], i: number, next: T): T[] {
  return arr.map((x, j) => (j === i ? next : x));
}
function addArr<T>(setK: React.Dispatch<React.SetStateAction<OpsKnowledge>>, key: "policies" | "chemistry", item: T) {
  setK((prev) => ({ ...prev, [key]: [...(prev as any)[key], item] }));
}
function updateArr(setK: React.Dispatch<React.SetStateAction<OpsKnowledge>>, key: "policies" | "chemistry", i: number, item: any) {
  setK((prev) => ({ ...prev, [key]: (prev as any)[key].map((x: any, j: number) => (j === i ? item : x)) }));
}
function removeArr(setK: React.Dispatch<React.SetStateAction<OpsKnowledge>>, key: "policies" | "chemistry", i: number) {
  setK((prev) => ({ ...prev, [key]: (prev as any)[key].filter((_: any, j: number) => j !== i) }));
}

function Section({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border p-5" style={{ borderColor: "rgba(255,255,255,0.07)", background: "rgba(16,23,34,0.6)" }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: "#F2F2F4" }}>{title}</div>
      <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2, marginBottom: 12 }}>{hint}</div>
      <div style={{ display: "grid", gap: 8 }}>{children}</div>
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "grid", gap: 4 }}>
      <span style={{ fontSize: 11, color: "#8E8E93" }}>{label}</span>
      {children}
    </label>
  );
}
const row: React.CSSProperties = { display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" };
const chip: React.CSSProperties = { fontSize: 11, color: "#A1A1AA", display: "inline-flex", gap: 4, alignItems: "center", padding: "0 6px" };
function inp(flex: number, width?: number): React.CSSProperties {
  return {
    flex: flex ? 1 : undefined, width, minWidth: flex ? 120 : undefined,
    background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8,
    color: "#F2F2F4", fontSize: 13, padding: "7px 9px",
  };
}
function btn(color: string, filled = false): React.CSSProperties {
  return {
    fontSize: 12, fontWeight: 600, padding: "7px 12px", borderRadius: 9, cursor: "pointer",
    color: filled ? "#12121a" : color, background: filled ? color : "transparent",
    border: `1px solid ${filled ? color : "rgba(255,255,255,0.14)"}`,
  };
}
