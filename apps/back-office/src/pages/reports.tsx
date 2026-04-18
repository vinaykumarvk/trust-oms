/**
 * Reports Hub Page — BRD Screen #9
 *
 * Features:
 *   - Left sidebar with report catalogue organized by regulator sections
 *   - Right panel with report configuration (date range, filters)
 *   - Summary cards + data table for generated report results
 *   - Export buttons: CSV, PDF (stubs that download JSON for now)
 */

import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@ui/lib/queryClient";
import { apiUrl } from "@ui/lib/api-url";
import { useToast } from "@ui/components/ui/toast";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@ui/components/ui/card";
import { Badge } from "@ui/components/ui/badge";
import { Button } from "@ui/components/ui/button";
import { Input } from "@ui/components/ui/input";
import { Skeleton } from "@ui/components/ui/skeleton";
import { Separator } from "@ui/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ui/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ui/components/ui/table";
import { ScrollArea } from "@ui/components/ui/scroll-area";
import {
  FileText,
  Building2,
  Landmark,
  Shield,
  Scale,
  BarChart3,
  FileSpreadsheet,
  FileDown,
  Play,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Search,
  Calendar,
  Filter,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReportDefinition {
  id: string;
  name: string;
  description: string;
  regulator: string;
  frequency: string;
  fields: string[];
}

interface ReportCatalogue {
  reports: ReportDefinition[];
}

interface ReportSummaryCard {
  label: string;
  value: string | number;
}

interface ReportRow {
  [key: string]: string | number | boolean | null;
}

interface GenerateReportResponse {
  report_id: string;
  report_name: string;
  generated_at: string;
  parameters: Record<string, string>;
  summary: ReportSummaryCard[];
  columns: string[];
  rows: ReportRow[];
  total_rows: number;
}

// ---------------------------------------------------------------------------
// Report Catalogue (Static fallback)
// ---------------------------------------------------------------------------

interface RegulatorSection {
  id: string;
  name: string;
  icon: React.ElementType;
  color: string;
  reports: Array<{
    id: string;
    name: string;
    description: string;
    frequency: string;
  }>;
}

const REGULATOR_SECTIONS: RegulatorSection[] = [
  {
    id: "bsp",
    name: "BSP Reports",
    icon: Landmark,
    color: "text-blue-600",
    reports: [
      {
        id: "bsp-ctf",
        name: "CTF - Currency Transaction Report",
        description:
          "Covered and suspicious currency transactions exceeding PHP 500,000 threshold for BSP reporting.",
        frequency: "Daily",
      },
      {
        id: "bsp-car",
        name: "CAR - Capital Adequacy Report",
        description:
          "Capital adequacy ratio computation covering risk-weighted assets and qualifying capital.",
        frequency: "Quarterly",
      },
      {
        id: "bsp-trust-fund",
        name: "Trust Fund Activity Report",
        description:
          "Summary of all trust fund activities including contributions, withdrawals, and investment movements.",
        frequency: "Monthly",
      },
    ],
  },
  {
    id: "bir",
    name: "BIR Reports",
    icon: Building2,
    color: "text-green-600",
    reports: [
      {
        id: "bir-2307",
        name: "BIR Form 2307 - Certificate of Creditable Tax Withheld",
        description:
          "Quarterly certificate of creditable tax withheld at source for income payments.",
        frequency: "Quarterly",
      },
      {
        id: "bir-1601e",
        name: "BIR Form 1601-E - Withholding Tax Remittance",
        description:
          "Monthly remittance return of creditable income taxes withheld (expanded).",
        frequency: "Monthly",
      },
    ],
  },
  {
    id: "amlc",
    name: "AMLC Reports",
    icon: Shield,
    color: "text-red-600",
    reports: [
      {
        id: "amlc-str",
        name: "STR - Suspicious Transaction Report",
        description:
          "Suspicious transaction reports filed with AMLC for transactions displaying red flags.",
        frequency: "As needed",
      },
      {
        id: "amlc-ctr",
        name: "CTR - Covered Transaction Report",
        description:
          "Covered transaction reports for transactions exceeding PHP 500,000 or equivalent.",
        frequency: "Within 5 days",
      },
    ],
  },
  {
    id: "sec",
    name: "SEC Reports",
    icon: Scale,
    color: "text-purple-600",
    reports: [
      {
        id: "sec-17a",
        name: "SEC Form 17-A - Annual Report",
        description:
          "Annual report on trust operations, financial statements, and compliance disclosures.",
        frequency: "Annual",
      },
      {
        id: "sec-nav",
        name: "SEC NAV Report",
        description:
          "Net asset value computation report for UITF and other pooled trust funds.",
        frequency: "Daily",
      },
    ],
  },
  {
    id: "internal",
    name: "Internal Reports",
    icon: BarChart3,
    color: "text-amber-600",
    reports: [
      {
        id: "int-portfolio-summary",
        name: "Portfolio Summary Report",
        description:
          "Comprehensive portfolio summary including holdings, valuations, and performance attribution.",
        frequency: "Daily",
      },
      {
        id: "int-fee-billing",
        name: "Fee & Billing Summary",
        description:
          "Breakdown of management fees, performance fees, custodian fees, and other billable items.",
        frequency: "Monthly",
      },
      {
        id: "int-transaction-journal",
        name: "Transaction Journal",
        description:
          "Complete journal of all trade transactions with settlement status and counterparty details.",
        frequency: "Daily",
      },
      {
        id: "int-compliance-breach",
        name: "Compliance Breach Report",
        description:
          "Summary of compliance limit breaches, resolution status, and escalation history.",
        frequency: "Weekly",
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return "-";
  try {
    return new Date(dateStr).toLocaleString("en-PH", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

function formatCellValue(val: string | number | boolean | null): string {
  if (val === null || val === undefined) return "-";
  if (typeof val === "boolean") return val ? "Yes" : "No";
  if (typeof val === "number") {
    return val.toLocaleString("en-PH", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 4,
    });
  }
  return String(val);
}

function downloadJson(data: unknown, filename: string) {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function downloadCsv(columns: string[], rows: ReportRow[], filename: string) {
  const header = columns.join(",");
  const csvRows = rows.map((row) =>
    columns
      .map((col) => {
        const val = row[col];
        if (val === null || val === undefined) return "";
        const str = String(val);
        return str.includes(",") || str.includes('"')
          ? `"${str.replace(/"/g, '""')}"`
          : str;
      })
      .join(",")
  );
  const csv = [header, ...csvRows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function getDefaultDateRange(): { from: string; to: string } {
  const today = new Date();
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(today.getDate() - 30);
  return {
    from: thirtyDaysAgo.toISOString().split("T")[0],
    to: today.toISOString().split("T")[0],
  };
}

const QUARTER_OPTIONS = [
  { value: "", label: "All Quarters" },
  { value: "Q1", label: "Q1 (Jan - Mar)" },
  { value: "Q2", label: "Q2 (Apr - Jun)" },
  { value: "Q3", label: "Q3 (Jul - Sep)" },
  { value: "Q4", label: "Q4 (Oct - Dec)" },
];

// ---------------------------------------------------------------------------
// Sidebar Report Item
// ---------------------------------------------------------------------------

interface ReportItemProps {
  report: {
    id: string;
    name: string;
    frequency: string;
  };
  isSelected: boolean;
  onClick: () => void;
}

function ReportItem({ report, isSelected, onClick }: ReportItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left px-3 py-2 rounded-md transition-colors text-sm ${
        isSelected
          ? "bg-primary text-primary-foreground"
          : "hover:bg-muted text-foreground"
      }`}
    >
      <div className="flex items-center gap-2">
        <FileText className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate font-medium">{report.name}</span>
      </div>
      <div
        className={`ml-5 text-xs mt-0.5 ${
          isSelected ? "text-primary-foreground/70" : "text-muted-foreground"
        }`}
      >
        {report.frequency}
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Report Sidebar
// ---------------------------------------------------------------------------

interface ReportSidebarProps {
  selectedReportId: string | null;
  onSelectReport: (reportId: string) => void;
  searchTerm: string;
  onSearchChange: (val: string) => void;
}

function ReportSidebar({
  selectedReportId,
  onSelectReport,
  searchTerm,
  onSearchChange,
}: ReportSidebarProps) {
  const filteredSections = useMemo(() => {
    if (!searchTerm.trim()) return REGULATOR_SECTIONS;
    const lower = searchTerm.toLowerCase();
    return REGULATOR_SECTIONS.map((section) => ({
      ...section,
      reports: section.reports.filter(
        (r) =>
          r.name.toLowerCase().includes(lower) ||
          r.id.toLowerCase().includes(lower)
      ),
    })).filter((section) => section.reports.length > 0);
  }, [searchTerm]);

  return (
    <div className="w-[280px] shrink-0 border-r bg-muted/30 flex flex-col h-full">
      {/* Search */}
      <div className="p-3 border-b">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search reports..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
      </div>

      {/* Report sections */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-4">
          {filteredSections.map((section) => (
            <div key={section.id}>
              <div className="flex items-center gap-2 px-3 py-1.5">
                <section.icon className={`h-4 w-4 ${section.color}`} />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {section.name}
                </span>
                <Badge variant="secondary" className="ml-auto text-xs px-1.5 py-0">
                  {section.reports.length}
                </Badge>
              </div>
              <div className="space-y-0.5">
                {section.reports.map((report) => (
                  <ReportItem
                    key={report.id}
                    report={report}
                    isSelected={selectedReportId === report.id}
                    onClick={() => onSelectReport(report.id)}
                  />
                ))}
              </div>
            </div>
          ))}
          {filteredSections.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              No reports matching &ldquo;{searchTerm}&rdquo;
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Summary Cards Row
// ---------------------------------------------------------------------------

interface SummaryCardsProps {
  cards: ReportSummaryCard[];
}

function SummaryCards({ cards }: SummaryCardsProps) {
  if (cards.length === 0) return null;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.label}>
          <CardContent className="pt-6">
            <p className="text-sm font-medium text-muted-foreground">
              {card.label}
            </p>
            <p className="mt-1 text-2xl font-bold text-foreground">
              {typeof card.value === "number"
                ? card.value.toLocaleString("en-PH")
                : card.value}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Report Results Table
// ---------------------------------------------------------------------------

interface ReportResultsTableProps {
  columns: string[];
  rows: ReportRow[];
  totalRows: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

function ReportResultsTable({
  columns,
  rows,
  totalRows,
  page,
  pageSize,
  onPageChange,
}: ReportResultsTableProps) {
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Showing {rows.length} of {totalRows.toLocaleString()} rows
        </p>
      </div>

      <div className="rounded-md border overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead key={col} className="whitespace-nowrap">
                  {col
                    .replace(/_/g, " ")
                    .replace(/\b\w/g, (c) => c.toUpperCase())}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="text-center text-muted-foreground py-8"
                >
                  No data available
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row, idx) => (
                <TableRow key={idx}>
                  {columns.map((col) => (
                    <TableCell key={col} className="whitespace-nowrap">
                      {formatCellValue(row[col])}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function ReportsHubPage() {
  const { toast } = useToast();

  // Sidebar state
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);

  // Filter state
  const defaultRange = getDefaultDateRange();
  const [dateFrom, setDateFrom] = useState(defaultRange.from);
  const [dateTo, setDateTo] = useState(defaultRange.to);
  const [portfolioId, setPortfolioId] = useState("");
  const [quarter, setQuarter] = useState("");

  // Results state
  const [resultPage, setResultPage] = useState(1);
  const PAGE_SIZE = 50;

  // Resolve selected report definition from static catalogue
  const selectedReport = useMemo(() => {
    if (!selectedReportId) return null;
    for (const section of REGULATOR_SECTIONS) {
      const found = section.reports.find((r) => r.id === selectedReportId);
      if (found)
        return {
          ...found,
          regulator: section.name,
          regulatorColor: section.color,
        };
    }
    return null;
  }, [selectedReportId]);

  // Fetch catalogue from API (supplement static data)
  const catalogueQuery = useQuery<ReportCatalogue>({
    queryKey: ["reports", "catalogue"],
    queryFn: () =>
      apiRequest("GET", apiUrl("/api/v1/reports/catalogue")),
    staleTime: 5 * 60 * 1000,
  });

  // Generate report mutation
  const generateMutation = useMutation<GenerateReportResponse>({
    mutationFn: () =>
      apiRequest("POST", apiUrl("/api/v1/reports/generate"), {
        report_id: selectedReportId,
        date_from: dateFrom,
        date_to: dateTo,
        portfolio_id: portfolioId || undefined,
        quarter: quarter || undefined,
        page: resultPage,
        page_size: PAGE_SIZE,
      }),
    onSuccess: () => {
      toast({
        title: "Report generated",
        description: `${selectedReport?.name ?? "Report"} generated successfully.`,
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Report generation failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const result = generateMutation.data;

  // Handlers
  const handleSelectReport = useCallback(
    (id: string) => {
      setSelectedReportId(id);
      setResultPage(1);
      // Reset mutation state when switching reports
      generateMutation.reset();
    },
    [generateMutation]
  );

  const handleGenerate = useCallback(() => {
    if (!selectedReportId) return;
    setResultPage(1);
    generateMutation.mutate();
  }, [selectedReportId, generateMutation]);

  const handleExportCsv = useCallback(() => {
    if (!result) return;
    downloadCsv(
      result.columns,
      result.rows,
      `${result.report_name ?? "report"}_${dateTo}.csv`
    );
    toast({
      title: "CSV exported",
      description: `Exported ${result.rows.length} rows.`,
    });
  }, [result, dateTo, toast]);

  const handleExportPdf = useCallback(() => {
    if (!result) return;
    // Stub: download JSON as PDF placeholder
    downloadJson(
      {
        report_name: result.report_name,
        generated_at: result.generated_at,
        parameters: result.parameters,
        summary: result.summary,
        total_rows: result.total_rows,
        rows: result.rows,
      },
      `${result.report_name ?? "report"}_${dateTo}.json`
    );
    toast({
      title: "PDF export (stub)",
      description: "Downloaded as JSON. PDF rendering coming soon.",
    });
  }, [result, dateTo, toast]);

  const handlePageChange = useCallback(
    (page: number) => {
      setResultPage(page);
      generateMutation.mutate();
    },
    [generateMutation]
  );

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Left Sidebar */}
      <ReportSidebar
        selectedReportId={selectedReportId}
        onSelectReport={handleSelectReport}
        searchTerm={sidebarSearch}
        onSearchChange={setSidebarSearch}
      />

      {/* Right Panel */}
      <div className="flex-1 overflow-auto">
        <div className="p-6 space-y-6">
          {/* Header */}
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Reports Hub
            </h1>
            <p className="text-sm text-muted-foreground">
              Generate regulatory and internal reports from the report catalogue.
            </p>
          </div>

          {!selectedReport ? (
            /* No report selected — empty state */
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-20">
                <FileSpreadsheet className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-semibold text-foreground">
                  Select a Report
                </h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-md text-center">
                  Choose a report from the catalogue on the left to configure
                  parameters and generate results.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Report Info */}
              <Card>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">
                        {selectedReport.name}
                      </CardTitle>
                      <CardDescription className="mt-1">
                        {selectedReport.description}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">
                        {selectedReport.regulator}
                      </Badge>
                      <Badge variant="secondary">
                        {selectedReport.frequency}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
              </Card>

              {/* Configuration */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Filter className="h-4 w-4" />
                    Report Parameters
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {/* Date From */}
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">From Date</label>
                      <div className="relative">
                        <Calendar className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                          type="date"
                          value={dateFrom}
                          onChange={(e) => setDateFrom(e.target.value)}
                          className="pl-9"
                        />
                      </div>
                    </div>

                    {/* Date To */}
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">To Date</label>
                      <div className="relative">
                        <Calendar className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                          type="date"
                          value={dateTo}
                          onChange={(e) => setDateTo(e.target.value)}
                          className="pl-9"
                        />
                      </div>
                    </div>

                    {/* Portfolio ID */}
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">
                        Portfolio ID{" "}
                        <span className="text-muted-foreground font-normal">
                          (optional)
                        </span>
                      </label>
                      <Input
                        placeholder="e.g. PF-00123"
                        value={portfolioId}
                        onChange={(e) => setPortfolioId(e.target.value)}
                      />
                    </div>

                    {/* Quarter */}
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">
                        Quarter{" "}
                        <span className="text-muted-foreground font-normal">
                          (optional)
                        </span>
                      </label>
                      <Select value={quarter} onValueChange={setQuarter}>
                        <SelectTrigger>
                          <SelectValue placeholder="All Quarters" />
                        </SelectTrigger>
                        <SelectContent>
                          {QUARTER_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value || "all"} value={opt.value || "__all__"}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <Separator className="my-4" />

                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      Report will be generated with the parameters above.
                      Large reports may take several seconds.
                    </p>
                    <Button
                      onClick={handleGenerate}
                      disabled={generateMutation.isPending || !dateFrom || !dateTo}
                    >
                      {generateMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Play className="mr-2 h-4 w-4" />
                      )}
                      Generate Report
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Loading state */}
              {generateMutation.isPending && (
                <Card>
                  <CardContent className="py-12">
                    <div className="flex flex-col items-center gap-3">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      <p className="text-sm text-muted-foreground">
                        Generating report...
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Error state */}
              {generateMutation.isError && (
                <Card className="border-destructive">
                  <CardContent className="py-6">
                    <div className="text-center">
                      <p className="text-sm font-medium text-destructive">
                        Report generation failed
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {generateMutation.error?.message ?? "Unknown error"}
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-3"
                        onClick={handleGenerate}
                      >
                        Retry
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Results */}
              {result && !generateMutation.isPending && (
                <>
                  {/* Generated metadata */}
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-semibold text-foreground">
                        {result.report_name}
                      </h2>
                      <p className="text-xs text-muted-foreground">
                        Generated {formatDateTime(result.generated_at)}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleExportCsv}
                      >
                        <FileSpreadsheet className="mr-2 h-4 w-4" />
                        Export CSV
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleExportPdf}
                      >
                        <FileDown className="mr-2 h-4 w-4" />
                        Export PDF
                      </Button>
                    </div>
                  </div>

                  {/* Summary cards */}
                  <SummaryCards cards={result.summary ?? []} />

                  {/* Data table */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Report Data</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ReportResultsTable
                        columns={result.columns ?? []}
                        rows={result.rows ?? []}
                        totalRows={result.total_rows ?? 0}
                        page={resultPage}
                        pageSize={PAGE_SIZE}
                        onPageChange={handlePageChange}
                      />
                    </CardContent>
                  </Card>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
