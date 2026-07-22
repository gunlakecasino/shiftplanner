"use client";

import React from "react";
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Download,
  FileText,
  Layers3,
  Loader2,
  MapPin,
  Printer,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  OpsReportsSnapshot,
  ReportAreaIntel,
  ReportDefinitionId,
  ReportFinding,
  ReportNightIntel,
  ReportPackageSnapshot,
  ReportWindow,
  ReportsStatusFilter,
} from "@/lib/shiftbuilder/opsReportsTypes";
import { SudoTabLoading } from "../../sudo/SudoGlass";
import { useOpsReportsSnapshot } from "../hooks/useOpsReportsSnapshot";

type ExploreView = "nights" | "team" | "areas" | "findings";

type WorkbenchSelection = {
  nightDate: string | null;
  tmId: string | null;
  areaKey: string | null;
  findingId: string | null;
};

const WINDOW_OPTIONS: Array<{ value: ReportWindow; label: string }> = [
  { value: 14, label: "14d" },
  { value: 30, label: "30d" },
  { value: 60, label: "60d" },
  { value: "this-week", label: "Week" },
  { value: "last-4-weeks", label: "4w" },
];

const STATUS_OPTIONS: Array<{ value: ReportsStatusFilter; label: string }> = [
  { value: "history", label: "History" },
  { value: "published", label: "Published" },
  { value: "built", label: "Built" },
  { value: "all", label: "All" },
];

const VIEW_OPTIONS: Array<{ id: ExploreView; label: string; icon: React.ElementType }> = [
  { id: "nights", label: "Nights", icon: BarChart3 },
  { id: "team", label: "TMs", icon: Users },
  { id: "areas", label: "Areas", icon: Layers3 },
  { id: "findings", label: "Flags", icon: Sparkles },
];

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  const [year, month, day] = iso.split("-");
  return `${month}/${day}/${year?.slice(-2)}`;
}

function flagActionLabel(severity: ReportFinding["severity"]): string {
  if (severity === "critical") return "Fix";
  if (severity === "warning") return "Check";
  return "Note";
}

function csvEscape(value: string | number): string {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function exportPackageCsv(pkg: ReportPackageSnapshot, snapshot: OpsReportsSnapshot): void {
  const rows = pkg.rows;
  const headers = rows[0] ? Object.keys(rows[0]) : ["Report", "Summary"];
  const body = rows.length
    ? rows.map((row) => headers.map((h) => csvEscape(row[h] ?? "")).join(","))
    : [[pkg.title, pkg.summary].map(csvEscape).join(",")];
  const csv = [
    [`${pkg.title} (${snapshot.dateRange.from} to ${snapshot.dateRange.to})`].map(csvEscape).join(","),
    headers.map(csvEscape).join(","),
    ...body,
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${pkg.id}-${snapshot.dateRange.from}-to-${snapshot.dateRange.to}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function KpiStrip({ snapshot }: { snapshot: OpsReportsSnapshot }) {
  const kpis = [
    { label: "Nights", value: snapshot.totals.nights, detail: `${snapshot.dateRange.from} to ${snapshot.dateRange.to}` },
    { label: "Covered zones", value: snapshot.totals.coveredZoneNights, detail: "direct + carried" },
    { label: "Deployed TMs", value: snapshot.totals.deployedTms, detail: "assigned in window" },
    { label: "Report flags", value: snapshot.findings.length, detail: `${snapshot.totals.repeatRisks} repeat flags` },
  ];

  return (
    <div className="sb-reports-kpis" aria-label="Report run metrics">
      {kpis.map((kpi) => (
        <div key={kpi.label} className="sb-reports-kpi">
          <span>{kpi.label}</span>
          <strong>{kpi.value}</strong>
          <small>{kpi.detail}</small>
        </div>
      ))}
    </div>
  );
}

function ReportPrintSheet({
  snapshot,
  pkg,
}: {
  snapshot: OpsReportsSnapshot;
  pkg: ReportPackageSnapshot;
}) {
  const rows = pkg.rows.slice(0, 34);
  const headers = rows[0] ? Object.keys(rows[0]) : [];

  return (
    <section className="sb-report-print-sheet" aria-hidden="true">
      <header>
        <div>
          <p>GLCR Grave Reports</p>
          <h1>{pkg.title}</h1>
        </div>
        <aside>
          <span>{snapshot.dateRange.from} to {snapshot.dateRange.to}</span>
          <span>Run {snapshot.runId}</span>
          <span>{snapshot.rolloverLabel}</span>
        </aside>
      </header>

      <div className="sb-report-print-summary">
        <p>{pkg.summary}</p>
        {pkg.kpis.map((kpi) => (
          <div key={kpi.label}>
            <strong>{kpi.value}</strong>
            <span>{kpi.label}</span>
          </div>
        ))}
      </div>

      {headers.length ? (
        <table>
          <thead>
            <tr>{headers.map((h) => <th key={h}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                {headers.map((h) => <td key={h}>{row[h]}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      <footer>
        <span>Counts reflect assignment records and visible coverage. Call-offs are recorded events only.</span>
        <span>Page 1</span>
      </footer>
    </section>
  );
}

function ReportCatalog({
  snapshot,
  selectedId,
  onSelect,
}: {
  snapshot: OpsReportsSnapshot;
  selectedId: ReportDefinitionId;
  onSelect: (id: ReportDefinitionId) => void;
}) {
  return (
    <aside className="sb-reports-catalog" aria-label="Report catalog">
      <div className="sb-reports-panel-label">
        <FileText size={14} />
        <span>Catalog</span>
      </div>
      <div className="sb-reports-catalog-list">
        {snapshot.definitions.map((definition) => {
          const active = definition.id === selectedId;
          return (
            <button
              key={definition.id}
              type="button"
              className={cn("sb-reports-catalog-card", active && "is-active")}
              onClick={() => onSelect(definition.id)}
              aria-pressed={active}
            >
              <span className="sb-reports-catalog-title">{definition.title}</span>
              <span className="sb-reports-catalog-meta">
                {definition.estimatedPages} pages · {definition.category}
              </span>
              <span className="sb-reports-catalog-desc">{definition.description}</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function nightZoneShortfall(night: ReportNightIntel): number {
  return Math.max(0, 10 - night.coveredZones);
}

function nightBannerMismatch(night: ReportNightIntel): number {
  return Math.abs(night.assignmentCoveragePairs - night.coverageBannerRows);
}

function nightIntegrityFlags(night: ReportNightIntel): number {
  return night.invalidLocks + night.historyConflicts;
}

function nightFlagCount(night: ReportNightIntel): number {
  return (
    nightZoneShortfall(night) +
    nightBannerMismatch(night) +
    night.repeatRisks +
    nightIntegrityFlags(night)
  );
}

function pct(value: number, max: number): string {
  if (max <= 0) return "0%";
  return `${Math.max(4, Math.min(100, Math.round((value / max) * 100)))}%`;
}

function WorkbenchMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <div className="sb-reports-workbench-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function NightWorkbench({
  snapshot,
  selectedNightDate,
  onSelectNight,
}: {
  snapshot: OpsReportsSnapshot;
  selectedNightDate: string | null;
  onSelectNight: (nightDate: string) => void;
}) {
  const selectedNight =
    snapshot.nights.find((night) => night.nightDate === selectedNightDate) ??
    snapshot.nights.find((night) => nightFlagCount(night) > 0) ??
    snapshot.nights[0] ??
    null;
  const highestFlagCount = Math.max(1, ...snapshot.nights.map(nightFlagCount));
  const exceptionNights = snapshot.nights
    .filter((night) => nightFlagCount(night) > 0)
    .sort((a, b) => nightFlagCount(b) - nightFlagCount(a))
    .slice(0, 4);

  if (!selectedNight) {
    return (
      <div className="sb-reports-empty">
        <CalendarDays size={20} />
        <span>No nights in this report window.</span>
      </div>
    );
  }

  return (
    <div className="sb-reports-workbench">
      <section className="sb-reports-focus-card">
        <header>
          <div>
            <p>Night Focus</p>
            <h3>{formatDate(selectedNight.nightDate)}</h3>
          </div>
          <span className="sb-reports-status-chip">{selectedNight.status ?? "unknown"}</span>
        </header>
        <div className="sb-reports-focus-metrics">
          <WorkbenchMetric label="Zones" value={`${selectedNight.coveredZones}/10`} detail={`${selectedNight.directZones} direct`} />
          <WorkbenchMetric label="Banner Match" value={`${selectedNight.assignmentCoveragePairs}/${selectedNight.coverageBannerRows}`} detail="assigned coverage / print banners" />
          <WorkbenchMetric label="Board Changes" value={selectedNight.boardChanges} detail={`${selectedNight.callOffs} call-offs`} />
          <WorkbenchMetric label="Open Flags" value={nightFlagCount(selectedNight)} detail="coverage, banner, repeat, integrity" />
        </div>
      </section>

      <section className="sb-reports-night-timeline" aria-label="Night timeline">
        {snapshot.nights.map((night) => {
          const selected = night.nightDate === selectedNight.nightDate;
          const flags = nightFlagCount(night);
          return (
            <button
              key={night.nightDate}
              type="button"
              className={cn("sb-reports-night-card", selected && "is-active", flags > 0 && "has-issues")}
              onClick={() => onSelectNight(night.nightDate)}
            >
              <span>{formatDate(night.nightDate)}</span>
              <strong>{night.coveredZones}/10</strong>
              <div className="sb-reports-mini-bar">
                <i style={{ width: pct(night.coveredZones, 10) }} />
              </div>
              <small>{flags ? `${flags} flags` : "no flags"}</small>
            </button>
          );
        })}
      </section>

      <section className="sb-reports-center-grid">
        <div className="sb-reports-signal-card">
          <header>
            <AlertTriangle size={15} />
            <strong>Exception Queue</strong>
          </header>
          {exceptionNights.length ? (
            exceptionNights.map((night) => (
              <button key={night.nightDate} type="button" onClick={() => onSelectNight(night.nightDate)}>
                <span>{formatDate(night.nightDate)}</span>
                <div className="sb-reports-mini-bar">
                  <i style={{ width: pct(nightFlagCount(night), highestFlagCount) }} />
                </div>
                <strong>{nightFlagCount(night)}</strong>
              </button>
            ))
          ) : (
            <p>No night exceptions in this run.</p>
          )}
        </div>

        <div className="sb-reports-signal-card">
          <header>
            <ShieldCheck size={15} />
            <strong>Zone Coverage</strong>
          </header>
          <div className="sb-reports-zone-dots" aria-label="Zone coverage dots">
            {Array.from({ length: 10 }, (_, index) => {
              const zoneNumber = index + 1;
              return (
                <span
                  key={zoneNumber}
                  className={cn(zoneNumber <= selectedNight.coveredZones && "is-filled")}
                >
                  Z{zoneNumber}
                </span>
              );
            })}
          </div>
          <p>
            Direct zone rows and assignment-carried coverage are separated from
            printable banner rows so drift stays visible.
          </p>
          <div className="sb-reports-chip-row">
            <span>Shortfall {nightZoneShortfall(selectedNight)}</span>
            <span>Banner mismatch {nightBannerMismatch(selectedNight)}</span>
            <span>Integrity {nightIntegrityFlags(selectedNight)}</span>
          </div>
        </div>
      </section>
    </div>
  );
}

function TeamWorkbench({
  snapshot,
  query,
  selectedTmId,
  onSelectTm,
}: {
  snapshot: OpsReportsSnapshot;
  query: string;
  selectedTmId: string | null;
  onSelectTm: (tmId: string) => void;
}) {
  const q = query.trim().toLowerCase();
  const rows = snapshot.teamMembers.filter((tm) => !q || tm.tmName.toLowerCase().includes(q));
  const selectedTm =
    rows.find((tm) => tm.tmId === selectedTmId) ??
    rows.find((tm) => tm.repeatRisks > 0 || tm.compositeDutyNights > 0) ??
    rows[0] ??
    null;
  const maxAssigned = Math.max(1, ...rows.map((tm) => tm.assignedNights));
  const maxComposite = Math.max(1, ...rows.map((tm) => tm.compositeDutyNights));

  if (!selectedTm) {
    return (
      <div className="sb-reports-empty">
        <Users size={20} />
        <span>No matching TMs in this report window.</span>
      </div>
    );
  }

  return (
    <div className="sb-reports-workbench">
      <section className="sb-reports-focus-card">
        <header>
          <div>
            <p>TM Focus</p>
            <h3>{selectedTm.tmName}</h3>
          </div>
          <span className="sb-reports-status-chip">{selectedTm.gravePool ?? "pool unknown"}</span>
        </header>
        <div className="sb-reports-focus-metrics">
          <WorkbenchMetric label="Assigned" value={selectedTm.assignedNights} detail="distinct nights" />
          <WorkbenchMetric label="Zones" value={selectedTm.zoneNights} detail={`${selectedTm.zoneGaps} zone gaps`} />
          <WorkbenchMetric label="Doubled RR" value={selectedTm.compositeDutyNights} detail="composite restroom nights" />
          <WorkbenchMetric label="Repeat Flags" value={selectedTm.repeatRisks} detail={`last worked ${formatDate(selectedTm.lastWorkedNight)}`} />
        </div>
        <div className="sb-reports-chip-row">
          {selectedTm.topAreas.map((area) => (
            <span key={area.areaKey}>{area.areaKey} · {area.count}</span>
          ))}
        </div>
      </section>

      <section className="sb-reports-heat-list" aria-label="TM placement heat">
        {rows.slice(0, 28).map((tm) => (
          <button
            key={tm.tmId}
            type="button"
            className={cn("sb-reports-heat-row", tm.tmId === selectedTm.tmId && "is-active")}
            onClick={() => onSelectTm(tm.tmId)}
          >
            <span>{tm.tmName}</span>
            <div className="sb-reports-heat-bars">
              <i style={{ width: pct(tm.assignedNights, maxAssigned) }} />
              <b style={{ width: pct(tm.compositeDutyNights, maxComposite) }} />
            </div>
            <small>{tm.repeatRisks ? `${tm.repeatRisks} repeat flags` : `${tm.uniquePhysicalAreas} areas`}</small>
          </button>
        ))}
      </section>
    </div>
  );
}

function AreaWorkbench({
  snapshot,
  selectedAreaKey,
  onSelectArea,
}: {
  snapshot: OpsReportsSnapshot;
  selectedAreaKey: string | null;
  onSelectArea: (areaKey: string) => void;
}) {
  const selectedArea =
    snapshot.areas.find((area) => area.areaKey === selectedAreaKey) ??
    snapshot.areas.find((area) => area.repeatRisks > 0) ??
    snapshot.areas[0] ??
    null;
  const maxExposure = Math.max(1, ...snapshot.areas.map((area) => area.totalExposureNights));
  const groups: Array<{ label: string; areas: ReportAreaIntel[] }> = [
    { label: "Zones", areas: snapshot.areas.filter((area) => area.areaType === "zone") },
    { label: "Restrooms", areas: snapshot.areas.filter((area) => area.areaType === "restroom") },
    { label: "Other", areas: snapshot.areas.filter((area) => !["zone", "restroom"].includes(area.areaType)) },
  ];

  if (!selectedArea) {
    return (
      <div className="sb-reports-empty">
        <MapPin size={20} />
        <span>No area coverage in this report window.</span>
      </div>
    );
  }

  return (
    <div className="sb-reports-workbench">
      <section className="sb-reports-focus-card">
        <header>
          <div>
            <p>Area Focus</p>
            <h3>{selectedArea.areaLabel}</h3>
          </div>
          <span className="sb-reports-status-chip">{selectedArea.areaType}</span>
        </header>
        <div className="sb-reports-focus-metrics">
          <WorkbenchMetric label="Exposure" value={selectedArea.totalExposureNights} detail={`${selectedArea.coverageRatePct}% of nights`} />
          <WorkbenchMetric label="Direct" value={selectedArea.directNights} detail="primary ownership" />
          <WorkbenchMetric label="Carried" value={selectedArea.coverageNights} detail="fallback/additional" />
          <WorkbenchMetric label="Carriers" value={selectedArea.carrierCount} detail={`last ${formatDate(selectedArea.lastCoveredNight)}`} />
        </div>
        <div className="sb-reports-chip-row">
          {selectedArea.topTms.map((tm) => (
            <span key={tm.tmId}>{tm.tmName} · {tm.count}</span>
          ))}
        </div>
      </section>

      <section className="sb-reports-area-board" aria-label="Area coverage board">
        {groups.map((group) => (
          <div key={group.label} className="sb-reports-area-group">
            <h4>{group.label}</h4>
            <div>
              {group.areas.map((area) => (
                <button
                  key={area.areaKey}
                  type="button"
                  className={cn("sb-reports-area-tile", area.areaKey === selectedArea.areaKey && "is-active")}
                  onClick={() => onSelectArea(area.areaKey)}
                >
                  <span>{area.areaLabel}</span>
                  <strong>{area.coverageRatePct}%</strong>
                  <div className="sb-reports-mini-bar">
                    <i style={{ width: pct(area.totalExposureNights, maxExposure) }} />
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

function FindingsWorkbench({
  snapshot,
  selectedFindingId,
  onSelectFinding,
}: {
  snapshot: OpsReportsSnapshot;
  selectedFindingId: string | null;
  onSelectFinding: (findingId: string) => void;
}) {
  const selectedFinding =
    snapshot.findings.find((finding) => finding.id === selectedFindingId) ??
    snapshot.findings[0] ??
    null;

  if (!selectedFinding) {
    return (
      <div className="sb-reports-empty">
        <CheckCircle2 size={20} />
        <span>No report flags in this run.</span>
      </div>
    );
  }

  return (
    <div className="sb-reports-workbench">
      <section className={cn("sb-reports-focus-card", `is-${selectedFinding.severity}`)}>
        <header>
          <div>
            <p>Flag Detail</p>
            <h3>{selectedFinding.title}</h3>
          </div>
          <span className="sb-reports-status-chip">{flagActionLabel(selectedFinding.severity)}</span>
        </header>
        <p className="sb-reports-focus-copy">{selectedFinding.detail}</p>
        <div className="sb-reports-evidence">
          {selectedFinding.evidence.map((line) => <span key={line}>{line}</span>)}
        </div>
        <small>{selectedFinding.action}</small>
      </section>

      <section className="sb-reports-triage-stack" aria-label="Finding triage">
        {snapshot.findings.map((finding: ReportFinding) => (
          <button
            key={finding.id}
            type="button"
            className={cn("sb-reports-triage-card", `is-${finding.severity}`, finding.id === selectedFinding.id && "is-active")}
            onClick={() => onSelectFinding(finding.id)}
          >
            <span>{flagActionLabel(finding.severity)}</span>
            <strong>{finding.title}</strong>
            <small>{finding.evidence.length} evidence lines</small>
          </button>
        ))}
      </section>
    </div>
  );
}

function Workbench({
  snapshot,
  activeView,
  query,
  selection,
  onSelectionChange,
}: {
  snapshot: OpsReportsSnapshot;
  activeView: ExploreView;
  query: string;
  selection: WorkbenchSelection;
  onSelectionChange: (next: WorkbenchSelection) => void;
}) {
  if (activeView === "team") {
    return (
      <TeamWorkbench
        snapshot={snapshot}
        query={query}
        selectedTmId={selection.tmId}
        onSelectTm={(tmId) => onSelectionChange({ ...selection, tmId })}
      />
    );
  }
  if (activeView === "areas") {
    return (
      <AreaWorkbench
        snapshot={snapshot}
        selectedAreaKey={selection.areaKey}
        onSelectArea={(areaKey) => onSelectionChange({ ...selection, areaKey })}
      />
    );
  }
  if (activeView === "findings") {
    return (
      <FindingsWorkbench
        snapshot={snapshot}
        selectedFindingId={selection.findingId}
        onSelectFinding={(findingId) => onSelectionChange({ ...selection, findingId })}
      />
    );
  }
  return (
    <NightWorkbench
      snapshot={snapshot}
      selectedNightDate={selection.nightDate}
      onSelectNight={(nightDate) => onSelectionChange({ ...selection, nightDate })}
    />
  );
}

function Inspector({
  snapshot,
  selectedPackage,
  onPrint,
  onExport,
  loading,
  onRefresh,
}: {
  snapshot: OpsReportsSnapshot;
  selectedPackage: ReportPackageSnapshot;
  onPrint: () => void;
  onExport: () => void;
  loading: boolean;
  onRefresh: () => void;
}) {
  const coverageShortfallNights = snapshot.nights.filter((night) => nightZoneShortfall(night) > 0 && !night.isFuture).length;
  const bannerMismatchNights = snapshot.nights.filter((night) => nightBannerMismatch(night) > 0).length;
  const repeatFlagTms = snapshot.teamMembers.filter((tm) => tm.repeatRisks > 0).length;
  const doubledRestroomTms = snapshot.teamMembers.filter((tm) => tm.compositeDutyNights > 0).length;
  const integrityNights = snapshot.nights.filter((night) => nightIntegrityFlags(night) > 0).length;
  const packetItems = [
    { label: "Coverage gaps", value: coverageShortfallNights, detail: "nights below 10 covered zones" },
    { label: "Print check", value: bannerMismatchNights, detail: "nights where coverage banners do not match" },
    { label: "Repeat flags", value: repeatFlagTms, detail: "TMs with same-area repeat flags" },
    { label: "Doubled RR", value: doubledRestroomTms, detail: "TMs with composite restroom nights" },
    { label: "Lock/history", value: integrityNights, detail: "nights with integrity flags" },
  ].filter((item) => item.value > 0);
  const openFlagTotal = packetItems.reduce((sum, item) => sum + item.value, 0);

  return (
    <aside className="sb-reports-inspector" aria-label="Report command center">
      <div className="sb-reports-panel-label">
        <ShieldCheck size={14} />
        <span>Report Packet</span>
      </div>

      <section className="sb-reports-command-card">
        <p>{snapshot.dateRange.from} to {snapshot.dateRange.to}</p>
        <h3>{selectedPackage.title}</h3>
        <div className="sb-reports-packet-facts">
          <div>
            <strong>{snapshot.totals.nights}</strong>
            <span>nights</span>
          </div>
          <div>
            <strong>{selectedPackage.pageEstimate}</strong>
            <span>pages</span>
          </div>
          <div>
            <strong>{openFlagTotal}</strong>
            <span>flags</span>
          </div>
        </div>
        <div className="sb-reports-command-actions">
          <button type="button" onClick={onRefresh} disabled={loading} title="Run report">
            {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
            Run
          </button>
          <button type="button" onClick={onPrint} title="Print report">
            <Printer size={15} />
            Print
          </button>
          <button type="button" onClick={onExport} title="Export CSV">
            <Download size={15} />
            CSV
          </button>
        </div>
      </section>

      <section className="sb-reports-inspector-section">
        <h4>Pull For</h4>
        {packetItems.length ? (
          packetItems.map((item) => (
            <div key={item.label} className="sb-reports-packet-row">
              <div>
                <strong>{item.label}</strong>
                <span>{item.detail}</span>
              </div>
              <em>{item.value}</em>
            </div>
          ))
        ) : (
          <p className="sb-reports-muted">No open flags in this packet.</p>
        )}
      </section>

      <section className="sb-reports-inspector-section">
        <h4>Included</h4>
        <div className="sb-reports-section-list">
          {selectedPackage.sections.map((section) => (
            <span key={section}>{section}</span>
          ))}
        </div>
      </section>

      <section className="sb-reports-inspector-section">
        <h4>Print Note</h4>
        <p>Counts are assignment records and visible coverage. Call-offs are recorded events only.</p>
      </section>
    </aside>
  );
}

export type ReportsDashboardProps = {
  embedded?: boolean;
  initialView?: ExploreView;
  className?: string;
};

export function ReportsDashboard({
  embedded = false,
  initialView = "nights",
  className,
}: ReportsDashboardProps) {
  const {
    snapshot,
    reportWindow,
    setReportWindow,
    statusFilter,
    setStatusFilter,
    loading,
    error,
    refresh,
  } = useOpsReportsSnapshot(30, "history");
  const [activeView, setActiveView] = React.useState<ExploreView>(initialView);
  const [selectedReportId, setSelectedReportId] =
    React.useState<ReportDefinitionId>("weekly-placement-review");
  const [query, setQuery] = React.useState("");
  const [printPackage, setPrintPackage] = React.useState<ReportPackageSnapshot | null>(null);
  const [selection, setSelection] = React.useState<WorkbenchSelection>({
    nightDate: null,
    tmId: null,
    areaKey: null,
    findingId: null,
  });

  const selectedPackage = snapshot?.packages[selectedReportId] ?? null;

  React.useEffect(() => {
    if (!printPackage) return;
    const t = window.setTimeout(() => {
      window.print();
      setPrintPackage(null);
    }, 80);
    return () => window.clearTimeout(t);
  }, [printPackage]);

  if (error) {
    return (
      <div className="sb-reports-empty is-error">
        <AlertTriangle size={22} />
        <span>{error}</span>
      </div>
    );
  }

  if (loading && !snapshot) {
    return (
      <div className="flex min-h-[520px] items-center justify-center p-12">
        <SudoTabLoading>Loading reports workspace</SudoTabLoading>
      </div>
    );
  }

  if (!snapshot || !selectedPackage) {
    return (
      <div className="sb-reports-empty">
        <FileText size={22} />
        <span>No report snapshot available.</span>
      </div>
    );
  }

  return (
    <div className={cn("sb-reports-workspace", embedded && "is-embedded", className)}>
      <div className="sb-reports-toolbar">
        <div className="sb-reports-segment" aria-label="Report window">
          {WINDOW_OPTIONS.map((option) => (
            <button
              key={String(option.value)}
              type="button"
              className={cn(option.value === reportWindow && "is-active")}
              onClick={() => setReportWindow(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="sb-reports-segment" aria-label="Night status">
          {STATUS_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={cn(option.value === statusFilter && "is-active")}
              onClick={() => setStatusFilter(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="sb-reports-search">
          <Search size={14} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find TM"
            aria-label="Find team member"
          />
        </div>
        <button className="sb-reports-refresh" type="button" onClick={refresh} disabled={loading}>
          {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
        </button>
      </div>

      <KpiStrip snapshot={snapshot} />

      <div className="sb-reports-layout">
        <ReportCatalog
          snapshot={snapshot}
          selectedId={selectedReportId}
          onSelect={setSelectedReportId}
        />

        <main className="sb-reports-main" aria-label="Reports workbench">
          <div className="sb-reports-view-tabs">
            {VIEW_OPTIONS.map((view) => {
              const Icon = view.icon;
              return (
                <button
                  key={view.id}
                  type="button"
                  className={cn(activeView === view.id && "is-active")}
                  onClick={() => setActiveView(view.id)}
                >
                  <Icon size={15} />
                  {view.label}
                </button>
              );
            })}
          </div>
          <Workbench
            snapshot={snapshot}
            activeView={activeView}
            query={query}
            selection={selection}
            onSelectionChange={setSelection}
          />
        </main>

        <Inspector
          snapshot={snapshot}
          selectedPackage={selectedPackage}
          loading={loading}
          onRefresh={refresh}
          onPrint={() => setPrintPackage(selectedPackage)}
          onExport={() => exportPackageCsv(selectedPackage, snapshot)}
        />
      </div>

      {printPackage ? <ReportPrintSheet snapshot={snapshot} pkg={printPackage} /> : null}
    </div>
  );
}
