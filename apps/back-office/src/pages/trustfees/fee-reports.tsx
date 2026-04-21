/**
 * Fee Reports -- TrustFees Pro Phase 10
 *
 * Report generation hub with:
 *   - Report catalog (9 report types)
 *   - Date range inputs and optional filters
 *   - Report viewer with data table
 *   - Print and CSV export
 *   - Dark mode support
 */
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@ui/lib/queryClient";
import { apiUrl } from "@ui/lib/api-url";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@ui/components/ui/card";
import { Badge } from "@ui/components/ui/badge";
import { Button } from "@ui/components/ui/button";
import { Input } from "@ui/components/ui/input";
import { Label } from "@ui/components/ui/label";
import { Separator } from "@ui/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ui/components/ui/table";
import {
  FileBarChart,
  Printer,
  Download,
  X,
  Play,
  FileText,
  Calculator,
  Receipt,
  Clock,
  ShieldCheck,
  RotateCcw,
  DollarSign,
  AlertTriangle,
  PlusCircle,
} from "lucide-react";

/* ---------- Report Catalog ---------- */
interface ReportDef {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  accent: string;
  hasDateRange: boolean;
  hasCustomerFilter?: boolean;
  hasFeeTypeFilter?: boolean;
  hasJurisdictionFilter?: boolean;
}

const REPORT_CATALOG: ReportDef[] = [
  {
    id: "fee_plan_register",
    title: "Fee Plan Register",
    description: "All fee plans with status, type, jurisdiction, and effective dates",
    icon: FileText,
    accent: "bg-blue-600",
    hasDateRange: false,
    hasJurisdictionFilter: true,
  },
  {
    id: "daily_accrual_summary",
    title: "Daily Accrual Summary",
    description: "Aggregate accruals by date and fee type",
    icon: Calculator,
    accent: "bg-green-600",
    hasDateRange: true,
    hasFeeTypeFilter: true,
  },
  {
    id: "invoice_register",
    title: "Invoice Register",
    description: "All invoices with line counts and payment status",
    icon: Receipt,
    accent: "bg-purple-600",
    hasDateRange: true,
    hasCustomerFilter: true,
  },
  {
    id: "overdue_ageing",
    title: "Overdue Ageing",
    description: "Overdue invoices with ageing buckets (current, 1-30, 31-60, 61-90, 90+ days)",
    icon: Clock,
    accent: "bg-red-600",
    hasDateRange: false,
    hasCustomerFilter: true,
  },
  {
    id: "override_register",
    title: "Override Register",
    description: "All fee overrides with delta percentage and approval status",
    icon: ShieldCheck,
    accent: "bg-amber-600",
    hasDateRange: true,
  },
  {
    id: "reversal_log",
    title: "Reversal Log",
    description: "Reversed accruals and cancelled invoices",
    icon: RotateCcw,
    accent: "bg-orange-600",
    hasDateRange: true,
  },
  {
    id: "tax_summary",
    title: "Tax Summary",
    description: "Tax amounts aggregated by tax code and period",
    icon: DollarSign,
    accent: "bg-teal-600",
    hasDateRange: true,
    hasJurisdictionFilter: true,
  },
  {
    id: "exception_kpi",
    title: "Exception KPI",
    description: "Exception metrics with SLA adherence calculation",
    icon: AlertTriangle,
    accent: "bg-rose-600",
    hasDateRange: true,
  },
  {
    id: "adhoc_fee_register",
    title: "Ad-hoc Fee Register",
    description: "All ad-hoc fees captured outside regular accrual cycles",
    icon: PlusCircle,
    accent: "bg-indigo-600",
    hasDateRange: true,
    hasCustomerFilter: true,
  },
];

/* ---------- Helpers ---------- */
function downloadCSV(columns: string[], rows: (string | number | null)[][], filename: string) {
  const escapeCell = (val: string | number | null) => {
    if (val === null || val === undefined) return "";
    const str = String(val);
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const header = columns.map(escapeCell).join(",");
  const body = rows.map((row) => row.map(escapeCell).join(",")).join("\n");
  const csv = `${header}\n${body}`;

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}-${new Date().toISOString().split("T")[0]}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

/* ---------- Types ---------- */
interface ReportResult {
  report_type: string;
  generated_at: string;
  params: Record<string, string>;
  columns: string[];
  rows: (string | number | null)[][];
}

/* ========== Main Component ========== */
export default function FeeReports() {
  const [selectedReport, setSelectedReport] = useState<ReportDef | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [feeType, setFeeType] = useState("");
  const [jurisdictionId, setJurisdictionId] = useState("");
  const [reportData, setReportData] = useState<ReportResult | null>(null);

  const generateMut = useMutation({
    mutationFn: (body: { report_type: string; params: Record<string, string> }) =>
      apiRequest("POST", apiUrl("/api/v1/fee-reports/generate"), body) as Promise<{ data: ReportResult }>,
    onSuccess: (resp) => {
      setReportData(resp.data);
    },
  });

  const handleGenerate = (report: ReportDef) => {
    const params: Record<string, string> = {};
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    if (customerId.trim()) params.customer_id = customerId.trim();
    if (feeType.trim()) params.fee_type = feeType.trim();
    if (jurisdictionId.trim()) params.jurisdiction_id = jurisdictionId.trim();

    generateMut.mutate({ report_type: report.id, params });
  };

  const handleSelectReport = (report: ReportDef) => {
    setSelectedReport(report);
    setReportData(null);
    setDateFrom("");
    setDateTo("");
    setCustomerId("");
    setFeeType("");
    setJurisdictionId("");
    generateMut.reset();
  };

  const handleClose = () => {
    setSelectedReport(null);
    setReportData(null);
    generateMut.reset();
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExportCSV = () => {
    if (!reportData) return;
    downloadCSV(
      reportData.columns,
      reportData.rows,
      reportData.report_type
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <FileBarChart className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Fee Reports</h1>
          <p className="text-sm text-muted-foreground">
            TrustFees Pro report generation hub -- generate, view, and export fee reports
          </p>
        </div>
      </div>

      {/* Report Viewer (shown when a report is selected) */}
      {selectedReport && (
        <Card className="border-primary/20">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${selectedReport.accent}`}>
                  <selectedReport.icon className="h-4 w-4 text-white" />
                </div>
                <div>
                  <CardTitle className="text-base">{selectedReport.title}</CardTitle>
                  <CardDescription className="text-xs">{selectedReport.description}</CardDescription>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={handleClose}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {/* Filters */}
            <div className="flex flex-wrap items-end gap-3 mb-4">
              {selectedReport.hasDateRange && (
                <>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Date From</Label>
                    <Input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="w-[160px]"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Date To</Label>
                    <Input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      className="w-[160px]"
                    />
                  </div>
                </>
              )}
              {selectedReport.hasCustomerFilter && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Customer ID</Label>
                  <Input
                    placeholder="e.g., CUST-001"
                    value={customerId}
                    onChange={(e) => setCustomerId(e.target.value)}
                    className="w-[160px]"
                  />
                </div>
              )}
              {selectedReport.hasFeeTypeFilter && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Fee Type</Label>
                  <Input
                    placeholder="e.g., MANAGEMENT"
                    value={feeType}
                    onChange={(e) => setFeeType(e.target.value)}
                    className="w-[160px]"
                  />
                </div>
              )}
              {selectedReport.hasJurisdictionFilter && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Jurisdiction ID</Label>
                  <Input
                    placeholder="e.g., 1"
                    value={jurisdictionId}
                    onChange={(e) => setJurisdictionId(e.target.value)}
                    className="w-[120px]"
                  />
                </div>
              )}
              <Button
                size="sm"
                onClick={() => handleGenerate(selectedReport)}
                disabled={generateMut.isPending}
              >
                <Play className="mr-1 h-3 w-3" />
                {generateMut.isPending ? "Generating..." : "Generate"}
              </Button>
            </div>

            {/* Error */}
            {generateMut.error && (
              <div className="rounded-md border border-destructive p-3 mb-4">
                <p className="text-sm text-destructive">
                  {(generateMut.error as Error)?.message ?? "Report generation failed"}
                </p>
              </div>
            )}

            {/* Report Data Table */}
            {reportData && (
              <div className="print-area">
                {/* Toolbar */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {reportData.rows.length} row{reportData.rows.length !== 1 ? "s" : ""}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      Generated: {new Date(reportData.generated_at).toLocaleString("en-PH")}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={handlePrint}>
                      <Printer className="mr-1 h-3 w-3" /> Print
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleExportCSV}>
                      <Download className="mr-1 h-3 w-3" /> Export CSV
                    </Button>
                  </div>
                </div>

                {/* Data Table */}
                <div className="overflow-x-auto rounded-md border max-h-[600px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {reportData.columns.map((col) => (
                          <TableHead key={col} className="text-xs whitespace-nowrap">
                            {col.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reportData.rows.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={reportData.columns.length}
                            className="py-8 text-center text-muted-foreground"
                          >
                            No data found for the selected criteria
                          </TableCell>
                        </TableRow>
                      ) : (
                        reportData.rows.map((row, idx) => (
                          <TableRow key={idx}>
                            {row.map((cell, cidx) => (
                              <TableCell key={cidx} className="text-xs whitespace-nowrap">
                                {cell !== null && cell !== undefined ? String(cell) : "--"}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Report Catalog */}
      {!selectedReport && (
        <>
          <Separator />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {REPORT_CATALOG.map((report) => (
              <Card
                key={report.id}
                className="cursor-pointer transition-colors hover:bg-muted/50"
                onClick={() => handleSelectReport(report)}
              >
                <CardContent className="pt-6">
                  <div className="flex items-start gap-3">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${report.accent}`}>
                      <report.icon className="h-5 w-5 text-white" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{report.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {report.description}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {report.hasDateRange && (
                          <Badge variant="secondary" className="text-[10px]">
                            Date Range
                          </Badge>
                        )}
                        {report.hasCustomerFilter && (
                          <Badge variant="secondary" className="text-[10px]">
                            Customer
                          </Badge>
                        )}
                        {report.hasFeeTypeFilter && (
                          <Badge variant="secondary" className="text-[10px]">
                            Fee Type
                          </Badge>
                        )}
                        {report.hasJurisdictionFilter && (
                          <Badge variant="secondary" className="text-[10px]">
                            Jurisdiction
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
