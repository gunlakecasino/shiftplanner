import React from "react";
import type { PrintPlanningCardModel } from "./printPreviewTypes";

const BREAK_LABEL: Record<number, string> = { 0: "–", 1: "1", 2: "2", 3: "3" };

export type PrintPlanningCardProps = {
  model: PrintPlanningCardModel;
};

export function PrintPlanningCard({ model }: PrintPlanningCardProps) {
  const {
    kind,
    headerLabel,
    headerIcon,
    accentColor,
    tmName,
    locationLines,
    tasks,
    coverageLabel,
    coverageColor,
    breakGroup = 0,
    empty,
    blankAux,
    sideLabel,
    minHeightPx,
  } = model;

  const isEmpty = empty || !tmName?.trim();
  const unassignedText = blankAux && !headerLabel.trim() ? "+ SET ROLE" : "— Unassigned —";
  const regularTasks = tasks.filter((t) => !t.isCoverage);
  const hasCoverage = Boolean(coverageLabel?.trim());

  const kindClass =
    kind === "aux" ? "ppc-aux" : kind === "overlap" ? "ppc-overlap" : kind === "rr-side" ? "ppc-rr-side" : "";

  return (
    <div
      className={`ppc-card print-artboard-card ${kindClass} ${isEmpty ? "ppc-empty" : ""} ${hasCoverage ? "ppc-has-coverage" : ""}`}
      style={{
        ["--ppc-accent" as string]: accentColor,
        ["--ppc-min-h" as string]: minHeightPx ? `${minHeightPx}px` : undefined,
        ["--ppc-coverage-bg" as string]: coverageColor || "#6b7280",
      }}
    >
      <div className="ppc-stripe" />

      <div className="ppc-header">
        <div className="ppc-header-left">
          {headerIcon ? <span className="ppc-header-icon">{headerIcon}</span> : null}
          <span className="ppc-header-label">
            {sideLabel ? `${sideLabel} · ${headerLabel}` : headerLabel}
          </span>
        </div>
        {kind !== "overlap" && breakGroup > 0 ? (
          <span className="ppc-break-pill">{BREAK_LABEL[breakGroup] ?? breakGroup}</span>
        ) : null}
      </div>

      <div className="ppc-body">
        {isEmpty ? (
          <div className="ppc-unassigned-wrap">
            <span className="ppc-unassigned-text">{unassignedText}</span>
          </div>
        ) : (
          <>
            <div className="ppc-name">{tmName}</div>
            {locationLines.map((line, i) => (
              <div key={`loc-${i}`} className="ppc-location">
                {line}
              </div>
            ))}
            {regularTasks.map((t) => (
              <div
                key={t.id}
                className="ppc-task"
                style={{ ["--ppc-task-color" as string]: t.color || "transparent" }}
              >
                {t.label}
              </div>
            ))}
          </>
        )}
      </div>

      {hasCoverage ? (
        <div className="ppc-coverage-strip">
          <span>{coverageLabel}</span>
        </div>
      ) : null}
    </div>
  );
}

export default PrintPlanningCard;