"use client";

import React from "react";
import {
  AlertTriangle,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  Printer,
  RefreshCw,
  Search,
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

const RANGE_OPTIONS: Array<{ value: ReportWindow; label: string }> = [
  { value: "wtd", label: "Week to date" },
  { value: "mtd", label: "Month to date" },
  { value: "qtd", label: "Quarter to date" },
  { value: "week-ending", label: "Week ending" },
  { value: "date-range", label: "Custom range" },
];

const STATUS_OPTIONS: Array<{ value: ReportsStatusFilter; label: string }> = [
  { value: "history", label: "Historical nights" },
  { value: "published", label: "Published only" },
  { value: "built", label: "Built only" },
  { value: "all", label: "All statuses" },
];

const EXPORT_FORMATS = ["PDF", "Excel", "CSV", "Print"] as const;

type ExportFormat = (typeof EXPORT_FORMATS)[number];

function csvEscape(value: string | number): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function packageHeaders(pkg: ReportPackageSnapshot): string[] {
  return pkg.rows[0] ? Object.keys(pkg.rows[0]) : ["Report", "Summary"];
}

function packageRows(pkg: ReportPackageSnapshot): Array<Record<string, string | number>> {
  return pkg.rows.length ? pkg.rows : [{ Report: pkg.title, Summary: pkg.summary }];
}

function safeFilename(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function downloadBlob(content: string, filename: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function exportPackageCsv(pkg: ReportPackageSnapshot, snapshot: OpsReportsSnapshot): void {
  const rows = packageRows(pkg);
  const headers = packageHeaders(pkg);
  const csv = [
    [`${pkg.title} (${snapshot.dateRange.from} to ${snapshot.dateRange.to})`].map(csvEscape).join(","),
    headers.map(csvEscape).join(","),
    ...rows.map((row) => headers.map((h) => csvEscape(row[h] ?? "")).join(",")),
  ].join("\n");

  downloadBlob(
    csv,
    `${safeFilename(pkg.title)}-${snapshot.dateRange.from}-to-${snapshot.dateRange.to}.csv`,
    "text/csv;charset=utf-8",
  );
}

function exportPackageExcel(pkg: ReportPackageSnapshot, snapshot: OpsReportsSnapshot): void {
  const rows = packageRows(pkg);
  const headers = packageHeaders(pkg);
  const html = `<!doctype html><html><head><meta charset="utf-8" /></head><body>
    <table>
      <tr><th colspan="${headers.length}">${escapeHtml(pkg.title)} (${escapeHtml(snapshot.dateRange.from)} to ${escapeHtml(snapshot.dateRange.to)})</th></tr>
      <tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr>
      ${rows
        .map((row) => `<tr>${headers.map((h) => `<td>${escapeHtml(String(row[h] ?? ""))}</td>`).join("")}</tr>`)
        .join("")}
    </table>
  </body></html>`;

  downloadBlob(
    html,
    `${safeFilename(pkg.title)}-${snapshot.dateRange.from}-to-${snapshot.dateRange.to}.xls`,
    "application/vnd.ms-excel;charset=utf-8",
  );
}

async function exportPackagePdf(pkg: ReportPackageSnapshot, snapshot: OpsReportsSnapshot): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 30;
  const headers = packageHeaders(pkg);
  const rows = packageRows(pkg);
  const colWidth = (pageWidth - margin * 2) / headers.length;
  let y = 88;
  let page = 1;

  function drawHeader() {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(pkg.title, margin, 34);
    doc.text("Graves Operations Reporting", pageWidth - margin, 34, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(`Date Range: ${snapshot.dateRange.from} to ${snapshot.dateRange.to}`, margin, 52);
    doc.text(`Generated: ${new Date(snapshot.generatedAt).toLocaleString()}`, margin, 66);
    doc.setDrawColor(38);
    doc.line(margin, 76, pageWidth - margin, 76);
    y = 96;
    doc.setFillColor(238, 239, 241);
    doc.rect(margin, y - 13, pageWidth - margin * 2, 18, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.6);
    headers.forEach((h, index) => doc.text(h, margin + index * colWidth + 3, y, { maxWidth: colWidth - 6 }));
    y += 14;
  }

  function drawFooter() {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(`Page ${page}`, pageWidth - margin, pageHeight - 24, { align: "right" });
  }

  drawHeader();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.6);
  rows.forEach((row, rowIndex) => {
    if (y > pageHeight - 42) {
      drawFooter();
      doc.addPage("letter", "landscape");
      page += 1;
      drawHeader();
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.6);
    }
    if (rowIndex % 2 === 1) {
      doc.setFillColor(248, 248, 249);
      doc.rect(margin, y - 9, pageWidth - margin * 2, 14, "F");
    }
    headers.forEach((h, index) => {
      doc.text(String(row[h] ?? ""), margin + index * colWidth + 3, y, { maxWidth: colWidth - 6 });
    });
    y += 14;
  });
  drawFooter();
  doc.save(`${safeFilename(pkg.title)}-${snapshot.dateRange.from}-to-${snapshot.dateRange.to}.pdf`);
}

function formatDateForInput(value: string | undefined, fallback: string): string {
  return value || fallback;
}

function formatRunTime(value: string | null): string {
  if (!value) return "Not run";
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatPageCount(rowCount: number): number {
  return Math.max(1, Math.ceil(rowCount / 12));
}

function filteredRows(pkg: ReportPackageSnapshot, query: string): Array<Record<string, string | number>> {
  const rows = packageRows(pkg);
  const needle = query.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter((row) =>
    Object.values(row).some((value) => String(value ?? "").toLowerCase().includes(needle)),
  );
}

function ReportPrintSheet({
  snapshot,
  pkg,
}: {
  snapshot: OpsReportsSnapshot;
  pkg: ReportPackageSnapshot;
}) {
  const rows = packageRows(pkg);
  const headers = packageHeaders(pkg);

  return (
    <section className="sb-report-print-sheet">
      <header>
        <div>
          <p>Graves Operations Reporting</p>
          <h1>{pkg.title}</h1>
        </div>
        <aside>
          <span>Operations Analytics</span>
          <span>{snapshot.dateRange.from} to {snapshot.dateRange.to}</span>
          <span>Generated {new Date(snapshot.generatedAt).toLocaleString()}</span>
        </aside>
      </header>

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

      <footer>
        <span>{rows.length} rows · live matrix source</span>
        <span>Page 1</span>
      </footer>
    </section>
  );
}

type ReportsDashboardProps = {
  embedded?: boolean;
  initialReportId?: ReportDefinitionId;
  className?: string;
};

export function ReportsDashboard({
  embedded = false,
  initialReportId = "matrix-report",
  className,
}: ReportsDashboardProps) {
  const {
    snapshot,
    reportWindow,
    setReportWindow,
    matrixParams,
    setMatrixParams,
    statusFilter,
    setStatusFilter,
    loading,
    error,
    refresh,
  } = useOpsReportsSnapshot("wtd", "history");
  const [selectedReportId, setSelectedReportId] = React.useState<ReportDefinitionId>(initialReportId);
  const [query, setQuery] = React.useState("");
  const [exportFormat, setExportFormat] = React.useState<ExportFormat>("PDF");
  const [printPackage, setPrintPackage] = React.useState<ReportPackageSnapshot | null>(null);
  const [parametersHidden, setParametersHidden] = React.useState(false);

  const selectedPackage = snapshot?.packages[selectedReportId] ?? null;
  const rows = selectedPackage ? filteredRows(selectedPackage, query) : [];
  const headers = selectedPackage ? packageHeaders(selectedPackage) : [];
  const pageCount = selectedPackage ? formatPageCount(rows.length) : 0;
  const poolValue = matrixParams.tmPool ?? snapshot?.matrixReport.params.tmPool ?? "all";
  const includeInactive = Boolean(matrixParams.includeInactive ?? snapshot?.matrixReport.params.includeInactive);
  const reportRunLabel = formatRunTime(snapshot?.generatedAt ?? null);

  React.useEffect(() => {
    if (!printPackage) return;
    const timer = window.setTimeout(() => {
      window.print();
      setPrintPackage(null);
    }, 80);
    return () => window.clearTimeout(timer);
  }, [printPackage]);

  function handleReset() {
    setReportWindow("wtd");
    setStatusFilter("history");
    setMatrixParams({ includeInactive: false, tmPool: "all" });
    setQuery("");
    setExportFormat("PDF");
  }

  function handleExport(format: ExportFormat = exportFormat) {
    if (!snapshot || !selectedPackage) return;
    if (format === "Excel") exportPackageExcel(selectedPackage, snapshot);
    if (format === "CSV") exportPackageCsv(selectedPackage, snapshot);
    if (format === "PDF") void exportPackagePdf(selectedPackage, snapshot);
    if (format === "Print") setPrintPackage(selectedPackage);
  }

  if (error) {
    return (
      <div className="sb-report-viewer-empty is-error">
        <AlertTriangle size={22} />
        <span>{error}</span>
      </div>
    );
  }

  if (loading && !snapshot) {
    return (
      <div className="sb-report-viewer-loading">
        <SudoTabLoading>Loading reporting services</SudoTabLoading>
      </div>
    );
  }

  return (
    <div className={cn("sb-report-viewer", embedded && "is-embedded", className)}>
      <nav className="sb-report-breadcrumb" aria-label="Report breadcrumb">
        <span>Home</span>
        <i>›</i>
        <span>Operations</span>
        <i>›</i>
        <span>Reports</span>
        <i>›</i>
        <strong>{selectedPackage?.title ?? "Matrix Report"}</strong>
      </nav>

      <section className={cn("sb-report-parameters", parametersHidden && "is-hidden")}>
        <header>
          <h2>Report Parameters</h2>
          <button type="button" onClick={() => setParametersHidden((prev) => !prev)}>
            {parametersHidden ? "Show parameters" : "Hide parameters"}
          </button>
        </header>

        {!parametersHidden ? (
          <>
            <div className="sb-report-parameter-grid">
              <label className="sb-report-field is-wide">
                <span>Report</span>
                <select
                  value={selectedReportId}
                  onChange={(event) => setSelectedReportId(event.target.value as ReportDefinitionId)}
                  disabled={!snapshot}
                >
                  {snapshot?.definitions.map((definition) => (
                    <option key={definition.id} value={definition.id}>
                      {definition.title}
                    </option>
                  )) ?? <option value="matrix-report">Matrix Report</option>}
                </select>
              </label>

              <label className="sb-report-field">
                <span>Period</span>
                <select
                  value={String(reportWindow)}
                  onChange={(event) => setReportWindow(event.target.value as ReportWindow)}
                >
                  {RANGE_OPTIONS.map((option) => (
                    <option key={String(option.value)} value={String(option.value)}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="sb-report-field">
                <span>Start date</span>
                <input
                  type="date"
                  value={formatDateForInput(matrixParams.from, snapshot?.dateRange.from ?? "")}
                  onChange={(event) => setMatrixParams((prev) => ({ ...prev, from: event.target.value }))}
                  disabled={reportWindow !== "date-range"}
                />
              </label>

              <label className="sb-report-field">
                <span>End date</span>
                <input
                  type="date"
                  value={formatDateForInput(
                    reportWindow === "week-ending" ? matrixParams.weekEnding : matrixParams.to,
                    snapshot?.dateRange.to ?? "",
                  )}
                  onChange={(event) =>
                    setMatrixParams((prev) =>
                      reportWindow === "week-ending"
                        ? { ...prev, weekEnding: event.target.value }
                        : { ...prev, to: event.target.value },
                    )
                  }
                  disabled={reportWindow !== "date-range" && reportWindow !== "week-ending"}
                />
              </label>

              <label className="sb-report-field">
                <span>TM Pool</span>
                <select
                  value={poolValue}
                  onChange={(event) => setMatrixParams((prev) => ({ ...prev, tmPool: event.target.value }))}
                  disabled={!snapshot}
                >
                  <option value="all">All pools</option>
                  {snapshot?.matrixReport.poolOptions.map((pool) => (
                    <option key={pool} value={pool}>{pool}</option>
                  ))}
                </select>
              </label>

              <label className="sb-report-field">
                <span>Team member</span>
                <select disabled>
                  <option>All team members</option>
                </select>
              </label>

              <label className="sb-report-field">
                <span>Night status</span>
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as ReportsStatusFilter)}
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="sb-report-field">
                <span>Export format</span>
                <select value={exportFormat} onChange={(event) => setExportFormat(event.target.value as ExportFormat)}>
                  {EXPORT_FORMATS.map((format) => (
                    <option key={format} value={format}>{format}</option>
                  ))}
                </select>
              </label>

              <label className="sb-report-check">
                <input
                  type="checkbox"
                  checked={includeInactive}
                  onChange={(event) => setMatrixParams((prev) => ({ ...prev, includeInactive: event.target.checked }))}
                />
                <span>Include inactive TMs</span>
              </label>
            </div>

            <footer>
              <span>
                {snapshot
                  ? `Last run: ${reportRunLabel} · data current as of ${
                      snapshot.matrixReport.matrixAsOfDate ?? snapshot.operationalDate
                    }`
                  : "Report has not been run in this session."}
              </span>
              <div>
                <button type="button" className="sb-report-secondary" onClick={handleReset}>Reset</button>
                <button type="button" className="sb-report-primary" onClick={() => void refresh()} disabled={loading}>
                  {loading ? <Loader2 size={14} className="animate-spin" /> : null}
                  View Report
                </button>
              </div>
            </footer>
          </>
        ) : null}
      </section>

      <section className="sb-report-document">
        <div className="sb-report-document-toolbar">
          <div className="sb-report-paging">
            <button type="button" disabled>‹</button>
            <button type="button" disabled>›</button>
            <span>Page 1 of {pageCount}</span>
          </div>

          <select aria-label="Zoom level" defaultValue="100">
            <option value="75">75%</option>
            <option value="100">100%</option>
            <option value="125">125%</option>
          </select>

          <label className="sb-report-find">
            <Search size={13} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find in report"
              aria-label="Find in report"
            />
          </label>

          <div className="sb-report-toolbar-spacer" />
          <span>{loading ? "Running…" : snapshot ? `Run ${new Date(snapshot.generatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Not run"}</span>
          <button type="button" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw size={13} />
            Refresh
          </button>
          <button type="button" onClick={() => selectedPackage && setPrintPackage(selectedPackage)} disabled={!selectedPackage}>
            <Printer size={13} />
            Print
          </button>
          <button type="button" disabled>Subscribe</button>
          <button type="button" onClick={() => handleExport(exportFormat)} disabled={!selectedPackage}>
            <Download size={13} />
            Export
          </button>
        </div>

        <div className="sb-report-canvas">
          {selectedPackage && snapshot ? (
            <article className="sb-report-page-sheet">
              <header>
                <div>
                  <h1>{selectedPackage.title}</h1>
                  <p>
                    Graves · {snapshot.dateRange.from} – {snapshot.dateRange.to}
                    {poolValue !== "all" ? ` · ${poolValue}` : ""}
                    {!includeInactive ? " · Active TMs" : " · Active + inactive TMs"}
                  </p>
                </div>
                <aside>
                  <span>Rows 1–{Math.min(rows.length, 12)} of {rows.length}</span>
                  <span>{snapshot.matrixReport.generatedLabel}</span>
                </aside>
              </header>

              <div className="sb-report-table-scroll">
                <table className="sb-report-output-table">
                  <thead>
                    <tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr>
                  </thead>
                  <tbody>
                    {rows.map((row, rowIndex) => (
                      <tr key={rowIndex}>
                        {headers.map((header) => <td key={header}>{row[header]}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <footer>
                <strong>Subtotal — page 1</strong>
                <span>{rows.length} team members</span>
              </footer>
            </article>
          ) : (
            <div className="sb-report-empty-card">
              <FileText size={26} />
              <strong>No report rendered</strong>
              <span>Set parameters above, then choose View Report to run Matrix Report against live data.</span>
              <button type="button" className="sb-report-primary" onClick={() => void refresh()} disabled={loading}>
                View Report
              </button>
            </div>
          )}
        </div>

        <footer className="sb-report-document-footer">
          <span>{rows.length} rows · {pageCount} pages · rendered from live matrix data</span>
          <div>
            <button type="button" disabled>First</button>
            <button type="button" disabled>Prev</button>
            <button type="button">Next</button>
            <button type="button">Last</button>
          </div>
        </footer>
      </section>

      <div className="sb-report-export-strip" aria-label="Quick export actions">
        <button type="button" onClick={() => selectedPackage && snapshot && exportPackageExcel(selectedPackage, snapshot)} disabled={!selectedPackage}>
          <FileSpreadsheet size={14} />
          Excel
        </button>
        <button type="button" onClick={() => handleExport("PDF")} disabled={!selectedPackage}>
          <Download size={14} />
          PDF
        </button>
        <button type="button" onClick={() => handleExport("CSV")} disabled={!selectedPackage}>
          <Download size={14} />
          CSV
        </button>
      </div>

      {printPackage && snapshot ? <ReportPrintSheet snapshot={snapshot} pkg={printPackage} /> : null}
    </div>
  );
}
