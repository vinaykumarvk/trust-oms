/**
 * Reconciliation Report -- TrustFees Pro Phase 5 (GAP-A17)
 *
 * Fee reconciliation report generation page:
 *   - Date range filters (date_from, date_to) and customer_id filter
 *   - Generate button calling POST /api/v1/fee-reports/generate
 *   - Results table: customer_id, total_accrued, accrual_count, diff_category
 *   - Diff category badges: MATCH (green), ZERO_ACCRUAL (yellow), MISMATCH (red)
 *   - CSV export capability
 */
import { useState, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@ui/lib/queryClient";
import { apiUrl } from "@ui/lib/api-url";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/ui/card";
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
  FileSpreadsheet,
  Download,
  Play,
  CheckCircle,
  AlertTriangle,
  XCircle,
  BarChart3,
} from "lucide-react";

/* ---------- Constants ---------- */

const DIFF_COLORS: Record<string, string> = {
  MATCH: "bg-green-100 text-green-800",
  ZERO_ACCRUAL: "bg-yellow-100 text-yellow-800",
  MISMATCH: "bg-red-100 text-red-800",
};

const DIFF_ICONS: Record<string, React.ElementType> = {
  MATCH: CheckCircle,
  ZERO_ACCRUAL: AlertTriangle,
  MISMATCH: XCircle,
};

/* ---------- Helpers ---------- */

const fmtPHP = (n: number | string | null | undefined) => {
  if (n == null) return "--";
  const num = typeof n === "string" ? parseFloat(n) : n;
  if (isNaN(num)) return "--";
  return num.toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  });
};

/* ---------- Component ---------- */

export default function ReconciliationReport() {
  // Filter state
  const [dateFrom, setDateFrom] = useState(
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  );
  const [dateTo, setDateTo] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [customerId, setCustomerId] = useState("");

  // Results
  const [results, setResults] = useState<any[] | null>(null);
  const [reportMeta, setReportMeta] = useState<any>(null);

  // Generate mutation
  const generateMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiRequest("POST", apiUrl("/api/v1/fee-reports/generate"), body),
    onSuccess: (data: any) => {
      const reportData = data?.data ?? data;
      setResults(reportData?.rows ?? reportData?.results ?? []);
      setReportMeta(reportData?.meta ?? null);
    },
  });

  const handleGenerate = () => {
    generateMutation.mutate({
      report_type: "fee_reconciliation",
      date_from: dateFrom,
      date_to: dateTo,
      customer_id: customerId || undefined,
    });
  };

  // CSV export
  const handleExportCsv = useCallback(() => {
    if (!results || results.length === 0) return;

    const headers = [
      "customer_id",
      "total_accrued",
      "accrual_count",
      "diff_category",
    ];
    const csvRows = [headers.join(",")];

    for (const row of results) {
      csvRows.push(
        [
          row.customer_id ?? "",
          row.total_accrued ?? "0",
          row.accrual_count ?? "0",
          row.diff_category ?? "",
        ].join(","),
      );
    }

    const csv = csvRows.join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fee-reconciliation-${dateFrom}-to-${dateTo}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [results, dateFrom, dateTo]);

  // Summary counts from results
  const summary = results
    ? {
        total: results.length,
        match: results.filter((r: any) => r.diff_category === "MATCH").length,
        zeroAccrual: results.filter(
          (r: any) => r.diff_category === "ZERO_ACCRUAL",
        ).length,
        mismatch: results.filter(
          (r: any) => r.diff_category === "MISMATCH",
        ).length,
      }
    : null;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          Reconciliation Report
        </h1>
        <p className="text-sm text-muted-foreground">
          TrustFees Pro -- generate fee reconciliation reports with diff analysis
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4" /> Report Parameters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Date From</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-[180px]"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Date To</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-[180px]"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Customer ID (optional)</Label>
              <Input
                placeholder="Filter by customer..."
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="w-[200px]"
              />
            </div>

            <Button
              size="sm"
              onClick={handleGenerate}
              disabled={generateMutation.isPending || !dateFrom || !dateTo}
            >
              <Play className="mr-2 h-4 w-4" />
              {generateMutation.isPending ? "Generating..." : "Generate"}
            </Button>

            {results && results.length > 0 && (
              <Button size="sm" variant="outline" onClick={handleExportCsv}>
                <Download className="mr-2 h-4 w-4" />
                Export CSV
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Error */}
      {generateMutation.error && (
        <Card className="border-destructive">
          <CardContent className="pt-4">
            <p className="text-sm text-destructive">
              {(generateMutation.error as any)?.message ??
                "Failed to generate report"}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Summary Cards (show after generation) */}
      {summary && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total</CardTitle>
              <BarChart3 className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.total}</div>
              <p className="text-xs text-muted-foreground">Customers analyzed</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Match</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {summary.match}
              </div>
              <p className="text-xs text-muted-foreground">Fully reconciled</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Zero Accrual</CardTitle>
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">
                {summary.zeroAccrual}
              </div>
              <p className="text-xs text-muted-foreground">No accruals found</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Mismatch</CardTitle>
              <XCircle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {summary.mismatch}
              </div>
              <p className="text-xs text-muted-foreground">
                Requires investigation
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Results Table */}
      {results !== null && (
        <>
          <Separator />

          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer ID</TableHead>
                  <TableHead>Total Accrued</TableHead>
                  <TableHead>Accrual Count</TableHead>
                  <TableHead>Diff Category</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="text-center text-muted-foreground py-8"
                    >
                      No reconciliation data found for the selected period
                    </TableCell>
                  </TableRow>
                ) : (
                  results.map((row: any, i: number) => {
                    const DiffIcon =
                      DIFF_ICONS[row.diff_category] ?? AlertTriangle;
                    return (
                      <TableRow key={`${row.customer_id}-${i}`}>
                        <TableCell className="font-mono text-sm">
                          {row.customer_id}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {fmtPHP(row.total_accrued)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {row.accrual_count ?? 0}
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={`text-xs ${
                              DIFF_COLORS[row.diff_category] ??
                              "bg-muted text-foreground"
                            }`}
                          >
                            <DiffIcon className="mr-1 h-3 w-3" />
                            {row.diff_category?.replace(/_/g, " ")}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          <div className="text-xs text-muted-foreground">
            Report generated for {dateFrom} to {dateTo}
            {customerId ? ` | Customer: ${customerId}` : ""} |{" "}
            {results.length} row(s)
          </div>
        </>
      )}
    </div>
  );
}
