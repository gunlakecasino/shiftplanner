"use client";

import React from "react";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Download,
  FileText,
  Layers3,
  Loader2,
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
  ReportDefinitionId,
  ReportPackageSnapshot,
  ReportWindow,
  ReportsStatusFilter,
} from "@/lib/shiftbuilder/opsReportsTypes";
import { SudoTabLoading } from "../../sudo/SudoGlass";
import { useOpsReportsSnapshot } from "../hooks/useOpsReportsSnapshot";

type ExploreView = "nights" | "team" | "areas" | "findings";

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
  { id: "findings", label: "Intel", icon: Sparkles },
];

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  const [year, month, day] = iso.split("-");
  return `${month}/${day}/${year?.slice(-2)}`;
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
    { label: "Findings", value: snapshot.findings.length, detail: `${snapshot.totals.repeatRisks} repeat risks` },
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
        <span>{snapshot.method.denominator}</span>
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

function NightTable({ snapshot }: { snapshot: OpsReportsSnapshot }) {
  return (
    <div className="sb-reports-table-wrap">
      <table className="sb-reports-table">
        <thead>
          <tr>
            <th>Night</th>
            <th>Status</th>
            <th>Zones</th>
            <th>RR</th>
            <th>AUX</th>
            <th>Coverage</th>
            <th>Calls</th>
            <th>Changes</th>
            <th>Risks</th>
          </tr>
        </thead>
        <tbody>
          {snapshot.nights.map((night) => (
            <tr key={night.nightDate}>
              <td>{formatDate(night.nightDate)}</td>
              <td><span className="sb-reports-status-chip">{night.status ?? "unknown"}</span></td>
              <td>{night.coveredZones}/10</td>
              <td>{night.restroomAssignments}</td>
              <td>{night.auxAssignments}</td>
              <td>{night.assignmentCoveragePairs}/{night.coverageBannerRows}</td>
              <td>{night.callOffs}</td>
              <td>{night.boardChanges}</td>
              <td>{night.repeatRisks + night.invalidLocks + night.historyConflicts}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TeamTable({ snapshot, query }: { snapshot: OpsReportsSnapshot; query: string }) {
  const q = query.trim().toLowerCase();
  const rows = snapshot.teamMembers.filter((tm) => !q || tm.tmName.toLowerCase().includes(q));
  return (
    <div className="sb-reports-table-wrap">
      <table className="sb-reports-table">
        <thead>
          <tr>
            <th>TM</th>
            <th>Pool</th>
            <th>Nights</th>
            <th>Zones</th>
            <th>RR</th>
            <th>Composite</th>
            <th>Gaps</th>
            <th>Risks</th>
            <th>Last</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((tm) => (
            <tr key={tm.tmId}>
              <td>{tm.tmName}</td>
              <td>{tm.gravePool ?? "-"}</td>
              <td>{tm.assignedNights}</td>
              <td>{tm.zoneNights}</td>
              <td>{tm.restroomNights}</td>
              <td>{tm.compositeDutyNights}</td>
              <td>{tm.zoneGaps}</td>
              <td>{tm.repeatRisks}</td>
              <td>{formatDate(tm.lastWorkedNight)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AreaTable({ snapshot }: { snapshot: OpsReportsSnapshot }) {
  return (
    <div className="sb-reports-table-wrap">
      <table className="sb-reports-table">
        <thead>
          <tr>
            <th>Area</th>
            <th>Type</th>
            <th>Direct</th>
            <th>Carried</th>
            <th>Rate</th>
            <th>Carriers</th>
            <th>Top TM</th>
            <th>Last</th>
          </tr>
        </thead>
        <tbody>
          {snapshot.areas.map((area) => (
            <tr key={area.areaKey}>
              <td>{area.areaLabel}</td>
              <td>{area.areaType}</td>
              <td>{area.directNights}</td>
              <td>{area.coverageNights}</td>
              <td>{area.coverageRatePct}%</td>
              <td>{area.carrierCount}</td>
              <td>{area.topTms[0]?.tmName ?? "-"}</td>
              <td>{formatDate(area.lastCoveredNight)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FindingsPanel({ snapshot }: { snapshot: OpsReportsSnapshot }) {
  return (
    <div className="sb-reports-findings">
      {snapshot.findings.length === 0 ? (
        <div className="sb-reports-empty">
          <CheckCircle2 size={20} />
          <span>No deterministic findings in this run.</span>
        </div>
      ) : (
        snapshot.findings.map((finding) => (
          <article key={finding.id} className={cn("sb-reports-finding", `is-${finding.severity}`)}>
            <header>
              {finding.severity === "critical" ? <AlertTriangle size={16} /> : <Sparkles size={16} />}
              <strong>{finding.title}</strong>
              <span>{finding.confidence}</span>
            </header>
            <p>{finding.detail}</p>
            <div className="sb-reports-evidence">
              {finding.evidence.map((line) => <span key={line}>{line}</span>)}
            </div>
            <small>{finding.action}</small>
          </article>
        ))
      )}
    </div>
  );
}

function Workbench({
  snapshot,
  activeView,
  query,
}: {
  snapshot: OpsReportsSnapshot;
  activeView: ExploreView;
  query: string;
}) {
  if (activeView === "team") return <TeamTable snapshot={snapshot} query={query} />;
  if (activeView === "areas") return <AreaTable snapshot={snapshot} />;
  if (activeView === "findings") return <FindingsPanel snapshot={snapshot} />;
  return <NightTable snapshot={snapshot} />;
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
  return (
    <aside className="sb-reports-inspector" aria-label="Report command center">
      <div className="sb-reports-panel-label">
        <ShieldCheck size={14} />
        <span>Command Center</span>
      </div>

      <section className="sb-reports-command-card">
        <p>{selectedPackage.title}</p>
        <h3>{selectedPackage.summary}</h3>
        <div className="sb-reports-section-list">
          {selectedPackage.sections.map((section) => (
            <span key={section}>{section}</span>
          ))}
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
        <h4>Intel</h4>
        {snapshot.findings.slice(0, 3).map((finding) => (
          <div key={finding.id} className="sb-reports-mini-finding">
            <span>{finding.severity}</span>
            <p>{finding.title}</p>
          </div>
        ))}
        {snapshot.findings.length === 0 ? <p className="sb-reports-muted">Clean run.</p> : null}
      </section>

      <section className="sb-reports-inspector-section">
        <h4>Method</h4>
        <p>{snapshot.method.denominator}</p>
        <div className="sb-reports-confidence-list">
          {snapshot.confidence.map((flag) => (
            <div key={flag.id}>
              <strong>{flag.label}</strong>
              <span>{flag.detail}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="sb-reports-inspector-section">
        <h4>Sources</h4>
        {snapshot.sourceCounts.map((source) => (
          <div key={source.label} className="sb-reports-source-row">
            <span>{source.label}</span>
            <strong>{source.rows}</strong>
          </div>
        ))}
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
          <Workbench snapshot={snapshot} activeView={activeView} query={query} />
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
