"use client";

import React from "react";

interface AnalysisCardProps {
  analysis: any;
  gold: string;
  onApply: (analysisId: string, suggestion: any) => void;
  onFeedbackSubmit?: (analysis: any, text: string) => void;
}

export function AnalysisCard({ analysis, gold, onApply, onFeedbackSubmit }: AnalysisCardProps) {
  const [localFeedback, setLocalFeedback] = React.useState("");

  return (
    <div
      className="rounded-3xl border p-6"
      style={{ borderColor: "rgba(255,255,255,0.08)", background: "#101722" }}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-semibold text-[17px] tracking-[-0.2px]">{analysis.dayName}</div>
          <div className="text-xs text-[#8E8E93] mt-0.5">
            {new Date(analysis.timestamp).toLocaleString()} • {analysis.mode} • {(analysis.tokens || 0).toLocaleString()} tokens
          </div>
        </div>
        <div className="text-right text-sm tabular-nums" style={{ color: (analysis.unfilled || 0) > 0 ? "#f87171" : "#4ade80" }}>
          {analysis.unfilled || 0} unfilled
        </div>
      </div>

      {analysis.grokRationale && (
        <div className="mt-4 text-[13px] leading-snug text-[#D1D5DB] border-l-2 pl-3" style={{ borderColor: gold + "55" }}>
          {analysis.grokRationale}
        </div>
      )}

      {analysis.suggestions?.length > 0 && (
        <div className="mt-5 space-y-2">
          {analysis.suggestions.map((sug: any, sIdx: number) => (
            <div
              key={sIdx}
              className="flex items-center justify-between gap-4 rounded-2xl border px-4 py-3 text-sm"
              style={{ borderColor: "rgba(255,255,255,0.07)", background: "rgba(0,0,0,0.2)" }}
            >
              <div className="min-w-0">
                <span className="font-medium text-[#F2F2F4]">{sug.type}</span>
                {sug.key && <span className="ml-2 text-[#8E8E93]">• {sug.key}</span>}
                <div className="text-[#A1A1AA] mt-0.5 text-[12px] break-words">{sug.rationale}</div>
              </div>
              <button
                onClick={() => onApply(analysis.id, sug)}
                className="sb-interactive shrink-0 rounded-xl px-5 py-2 text-xs font-semibold whitespace-nowrap"
                style={{ background: gold, color: "#111" }}
              >
                APPLY
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Per-analysis feedback capture (core training loop) */}
      {onFeedbackSubmit && (
        <div className="mt-5 pt-4 border-t border-white/10">
          <textarea
            value={localFeedback}
            onChange={(e) => setLocalFeedback(e.target.value)}
            placeholder="What would you have done differently and why?"
            className="w-full min-h-[64px] rounded-2xl border bg-[#0A0C12] p-3 text-[12px] placeholder:text-[#6B7280]"
            style={{ borderColor: "rgba(255,255,255,0.1)" }}
          />
          <button
            onClick={() => {
              if (localFeedback.trim()) {
                onFeedbackSubmit(analysis, localFeedback.trim());
                setLocalFeedback("");
              }
            }}
            disabled={!localFeedback.trim()}
            className="sb-interactive mt-2 text-xs px-4 py-1.5 rounded-xl border disabled:opacity-40"
            style={{ borderColor: gold + "40", color: gold }}
          >
            Record Correction for this Analysis
          </button>
        </div>
      )}
    </div>
  );
}
