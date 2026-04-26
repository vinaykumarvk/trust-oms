/**
 * Risk Profiling Completion Report (FR-033 — G-056)
 *
 * Displays per-RM risk profiling completion statistics:
 *   - Total clients, profiled, pending, expired counts
 *   - Completion percentage per RM
 *   - Entity/branch/RM filters and date range
 *   - Client-side CSV export
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/ui/card";
import { Button } from "@ui/components/ui/button";
import { Input } from "@ui/components/ui/input";
import { Badge } from "@ui/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@ui/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@ui/components/ui/select";
import { Download, RefreshCw, BarChart3, Users, CheckCircle, Clock, AlertTriangle } from "lucide-react";

/* ---------- Constants ---------- */
const API = "/api/v1/risk-profiling";

/* ---------- Types ---------- */
interface RmCompletionRow {
  rm_id: number;
  rm_name: string | null;
  branch_id: number | null;
  total_clients: number;
  profiled: number;
  pending: number;
  expired: number;
  completion_pct: number;
}

interface CompletionReport {
  entity_id: string;
  generated_at: string;
  report: RmCompletionRow[];
  total_rms: number;
  summary: {
    total_clients: number;
    total_profiled: number;
    total_pending: number;
    total_expired: number;
  };
}

/* ---------- Helpers ---------- */
async function apiFetch<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || json.message || "Request failed");
  return json;
}

function pctColor(pct: number): string {
  if (pct >= 80) return "text-green-600 dark:text-green-400";
  if (pct >= 50) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function exportCsv(rows: RmCompletionRow[]) {
  const headers = ["RM ID", "RM Name", "Branch ID", "Total Clients", "Profiled", "Pending", "Expired", "Completion %"];
  const lines = [
    headers.join(","),
    ...rows.map((r) =>
      [
        r.rm_id,
        `"${r.rm_name ?? ""}"`,
        r.branch_id ?? "",
        r.total_clients,
        r.profiled,
        r.pending,
        r.expired,
        r.completion_pct,
      ].join(","),
    ),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `risk-profiling-completion-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ---------- Component ---------- */
export default function RiskProfilingCompletionReport() {
  const today = new Date().toISOString().split("T")[0];
  const monthAgo = (() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split("T")[0];
  })();

  const [entityId] = useState("default");
  const [dateFrom, setDateFrom] = useState(monthAgo);
  const [dateTo, setDateTo] = useState(today);
  const [rmSearch, setRmSearch] = useState("");
  const [drillDownRm, setDrillDownRm] = useState<RmCompletionRow | null>(null);

  const queryKey = ["rp-completion-report", entityId, dateFrom, dateTo];

  const { data, isLoading, isError, refetch, isFetching } = useQuery<CompletionReport>({
    queryKey,
    queryFn: () =>
      apiFetch(
        `${API}/reports/completion?entity_id=${entityId}&date_from=${dateFrom}&date_to=${dateTo}`,
      ),
  });

  const rows = (data?.report ?? []).filter((r) =>
    rmSearch ? (r.rm_name ?? "").toLowerCase().includes(rmSearch.toLowerCase()) : true,
  );

  const summary = data?.summary;

  return (
    <div className="space-y-4 sm:space-y-6 p-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground dark:text-white flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-teal-600" />
            Risk Profiling Completion Report
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            RM-level risk profiling completion statistics
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => rows.length > 0 && exportCsv(rows)}
            disabled={rows.length === 0}
          >
            <Download className="h-4 w-4 mr-1" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="border-border dark:border-gray-700 dark:bg-gray-800">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">From</p>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-1.5 text-sm h-9"
              />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">To</p>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-1.5 text-sm h-9"
              />
            </div>
            <div className="flex-1 min-w-[160px]">
              <p className="text-xs text-muted-foreground mb-1">Search RM</p>
              <Input
                placeholder="RM name..."
                value={rmSearch}
                onChange={(e) => setRmSearch(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary KPIs */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="border-border dark:border-gray-700 dark:bg-gray-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Total Clients</span>
              </div>
              <p className="text-2xl font-bold">{summary.total_clients}</p>
            </CardContent>
          </Card>
          <Card className="border-border dark:border-gray-700 dark:bg-gray-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="text-xs text-muted-foreground">Profiled</span>
              </div>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">{summary.total_profiled}</p>
            </CardContent>
          </Card>
          <Card className="border-border dark:border-gray-700 dark:bg-gray-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="h-4 w-4 text-amber-500" />
                <span className="text-xs text-muted-foreground">Pending</span>
              </div>
              <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{summary.total_pending}</p>
            </CardContent>
          </Card>
          <Card className="border-border dark:border-gray-700 dark:bg-gray-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                <span className="text-xs text-muted-foreground">Expired</span>
              </div>
              <p className="text-2xl font-bold text-red-600 dark:text-red-400">{summary.total_expired}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main Table */}
      <Card className="border-border dark:border-gray-700 dark:bg-gray-800">
        <CardHeader className="pb-3 px-4">
          <CardTitle className="text-sm sm:text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            RM Completion Breakdown
            {data && (
              <Badge variant="outline" className="ml-auto text-xs font-normal">
                {rows.length} RM{rows.length !== 1 ? "s" : ""}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-6 w-6 animate-spin rounded-full border-4 border-teal-600 border-t-transparent" />
            </div>
          ) : isError ? (
            <div className="rounded-md border border-red-200 bg-red-50 dark:bg-red-900/20 p-4 text-sm text-red-700 dark:text-red-400">
              Failed to load completion report. Please try refreshing.
            </div>
          ) : rows.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No data available for the selected filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 dark:bg-gray-700/50">
                    <TableHead className="text-xs font-semibold">RM Name</TableHead>
                    <TableHead className="text-xs font-semibold">RM ID</TableHead>
                    <TableHead className="text-xs font-semibold text-right">Total</TableHead>
                    <TableHead className="text-xs font-semibold text-right text-green-600">Profiled</TableHead>
                    <TableHead className="text-xs font-semibold text-right text-amber-600">Pending</TableHead>
                    <TableHead className="text-xs font-semibold text-right text-red-600">Expired</TableHead>
                    <TableHead className="text-xs font-semibold text-right">Completion %</TableHead>
                    <TableHead className="text-xs font-semibold text-center">Progress</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow
                      key={row.rm_id}
                      className="cursor-pointer hover:bg-muted/30 dark:hover:bg-gray-700/30"
                      onClick={() => setDrillDownRm(drillDownRm?.rm_id === row.rm_id ? null : row)}
                    >
                      <TableCell className="font-medium text-sm">{row.rm_name ?? `RM-${row.rm_id}`}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{row.rm_id}</TableCell>
                      <TableCell className="text-right text-sm">{row.total_clients}</TableCell>
                      <TableCell className="text-right text-sm text-green-600 dark:text-green-400">{row.profiled}</TableCell>
                      <TableCell className="text-right text-sm text-amber-600 dark:text-amber-400">{row.pending}</TableCell>
                      <TableCell className="text-right text-sm text-red-600 dark:text-red-400">{row.expired}</TableCell>
                      <TableCell className={`text-right text-sm font-semibold ${pctColor(row.completion_pct)}`}>
                        {row.completion_pct}%
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="relative h-2 w-24 rounded-full bg-gray-200 dark:bg-gray-600 mx-auto">
                          <div
                            className={`absolute left-0 top-0 h-2 rounded-full transition-all ${
                              row.completion_pct >= 80 ? "bg-green-500" :
                              row.completion_pct >= 50 ? "bg-amber-500" : "bg-red-500"
                            }`}
                            style={{ width: `${Math.min(row.completion_pct, 100)}%` }}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Drill-down panel */}
      {drillDownRm && (
        <Card className="border-teal-200 dark:border-teal-800 bg-teal-50/30 dark:bg-teal-900/10">
          <CardHeader className="pb-2 px-4">
            <CardTitle className="text-sm">
              Drill-down: {drillDownRm.rm_name ?? `RM-${drillDownRm.rm_id}`}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div>
                <p className="text-lg font-bold">{drillDownRm.total_clients}</p>
                <p className="text-xs text-muted-foreground">Total Clients</p>
              </div>
              <div>
                <p className="text-lg font-bold text-green-600">{drillDownRm.profiled}</p>
                <p className="text-xs text-muted-foreground">Profiled</p>
              </div>
              <div>
                <p className="text-lg font-bold text-amber-600">{drillDownRm.pending}</p>
                <p className="text-xs text-muted-foreground">Pending</p>
              </div>
              <div>
                <p className="text-lg font-bold text-red-600">{drillDownRm.expired}</p>
                <p className="text-xs text-muted-foreground">Expired</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-3 text-center">
              Click the row again to collapse, or select another RM for comparison.
            </p>
          </CardContent>
        </Card>
      )}

      {data?.generated_at && (
        <p className="text-xs text-muted-foreground text-right">
          Generated: {new Date(data.generated_at).toLocaleString("en-PH")}
        </p>
      )}
    </div>
  );
}
