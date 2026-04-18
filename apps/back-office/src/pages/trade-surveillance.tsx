/**
 * Trade Surveillance — Phase 4B (BRD Screen #22)
 *
 * Scored alerts table with disposition workflow for trade surveillance
 * patterns (layering, spoofing, wash trading, front running).
 * Includes RM anomaly scoring section.
 * Auto-refreshes every 15 seconds.
 */
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@ui/lib/queryClient";
import { apiUrl } from "@ui/lib/api-url";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/ui/card";
import { Badge } from "@ui/components/ui/badge";
import { Button } from "@ui/components/ui/button";
import { Input } from "@ui/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@ui/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@ui/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@ui/components/ui/select";
import { Textarea } from "@ui/components/ui/textarea";
import { Skeleton } from "@ui/components/ui/skeleton";
import { Separator } from "@ui/components/ui/separator";
import {
  ShieldAlert, Eye, Search as SearchIcon, AlertTriangle,
  RefreshCw, ArrowUpDown, FileWarning, UserSearch,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface SurveillanceAlert {
  id: string;
  pattern: "LAYERING" | "SPOOFING" | "WASH_TRADING" | "FRONT_RUNNING";
  score: number;
  order_ids: string[];
  disposition: string | null;
  analyst: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface AlertsResponse {
  data: SurveillanceAlert[];
  total: number;
  page: number;
  pageSize: number;
}

interface AnomalyScoreResult {
  rm_id: string;
  anomaly_score: number;
  peer_avg: number;
  std_dev: number;
  flags: string[];
  computed_at: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const PATTERN_COLORS: Record<string, string> = {
  LAYERING: "bg-red-100 text-red-800 border-red-200",
  SPOOFING: "bg-orange-100 text-orange-800 border-orange-200",
  WASH_TRADING: "bg-red-100 text-red-800 border-red-200",
  FRONT_RUNNING: "bg-purple-100 text-purple-800 border-purple-200",
};

const PATTERN_OPTIONS = [
  { value: "all", label: "All Patterns" },
  { value: "LAYERING", label: "Layering" },
  { value: "SPOOFING", label: "Spoofing" },
  { value: "WASH_TRADING", label: "Wash Trading" },
  { value: "FRONT_RUNNING", label: "Front Running" },
] as const;

const DISPOSITION_FILTER_OPTIONS = [
  { value: "all", label: "All Status" },
  { value: "pending", label: "Pending Review" },
  { value: "reviewed", label: "Reviewed" },
] as const;

const DISPOSITION_OPTIONS = [
  { value: "FALSE_POSITIVE", label: "False Positive" },
  { value: "INVESTIGATE", label: "Investigate" },
  { value: "ESCALATE", label: "Escalate" },
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatDate(d: string | null): string {
  if (!d) return "-";
  try {
    return new Date(d).toLocaleDateString("en-PH", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return d;
  }
}

function scoreColor(score: number): string {
  if (score >= 80) return "text-red-700 bg-red-50 border-red-200";
  if (score >= 60) return "text-orange-700 bg-orange-50 border-orange-200";
  if (score >= 40) return "text-yellow-700 bg-yellow-50 border-yellow-200";
  return "text-green-700 bg-green-50 border-green-200";
}

function dispositionBadge(disposition: string | null): { label: string; className: string } {
  if (!disposition) return { label: "PENDING", className: "bg-muted text-foreground border-border" };
  switch (disposition) {
    case "FALSE_POSITIVE":
      return { label: "FALSE POSITIVE", className: "bg-green-100 text-green-700 border-green-200" };
    case "INVESTIGATE":
      return { label: "INVESTIGATE", className: "bg-yellow-100 text-yellow-700 border-yellow-200" };
    case "ESCALATE":
      return { label: "ESCALATED", className: "bg-red-100 text-red-700 border-red-200" };
    default:
      return { label: disposition, className: "bg-muted text-foreground border-border" };
  }
}

// ---------------------------------------------------------------------------
// Reusable sub-components
// ---------------------------------------------------------------------------
function SummaryCard({
  title,
  value,
  icon: Icon,
  accent,
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  accent: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="mt-1 text-2xl font-bold">{value}</p>
          </div>
          <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${accent}`}>
            <Icon className="h-5 w-5 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SkeletonRows({ cols, rows = 5 }: { cols: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <TableRow key={i}>
          {Array.from({ length: cols }).map((_, j) => (
            <TableCell key={j}><Skeleton className="h-4 w-16" /></TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

function EmptyRow({ cols, msg }: { cols: number; msg: string }) {
  return (
    <TableRow>
      <TableCell colSpan={cols} className="py-8 text-center text-muted-foreground">
        {msg}
      </TableCell>
    </TableRow>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------
export default function TradeSurveillance() {
  const qc = useQueryClient();

  // Filter state
  const [patternFilter, setPatternFilter] = useState("all");
  const [dispositionFilter, setDispositionFilter] = useState("all");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  // Disposition dialog state
  const [dispositionOpen, setDispositionOpen] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState<SurveillanceAlert | null>(null);
  const [dispositionForm, setDispositionForm] = useState({
    decision: "" as string,
    analyst: "",
    notes: "",
  });

  // Anomaly scoring state
  const [rmId, setRmId] = useState("");
  const [anomalyResult, setAnomalyResult] = useState<AnomalyScoreResult | null>(null);

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------
  const alertsQ = useQuery<AlertsResponse>({
    queryKey: ["surveillance-alerts", patternFilter, dispositionFilter, page],
    queryFn: () => {
      const p = new URLSearchParams();
      p.set("page", String(page));
      p.set("pageSize", String(pageSize));
      if (patternFilter !== "all") p.set("pattern", patternFilter);
      if (dispositionFilter !== "all") p.set("disposition", dispositionFilter);
      p.set("sort", "score");
      p.set("order", "desc");
      return apiRequest("GET", apiUrl(`/api/v1/surveillance/alerts?${p.toString()}`));
    },
    refetchInterval: 15_000,
  });

  const alerts = alertsQ.data?.data ?? [];
  const alertsTotal = alertsQ.data?.total ?? 0;
  const totalPages = Math.ceil(alertsTotal / pageSize);

  // Derive summary counts
  const summaryQ = useQuery<AlertsResponse>({
    queryKey: ["surveillance-alerts-summary"],
    queryFn: () =>
      apiRequest("GET", apiUrl("/api/v1/surveillance/alerts?pageSize=10000")),
    refetchInterval: 15_000,
  });

  const allAlerts = summaryQ.data?.data ?? [];

  const summaryStats = useMemo(() => {
    const total = allAlerts.length;
    const pending = allAlerts.filter((a) => !a.disposition).length;
    const investigating = allAlerts.filter((a) => a.disposition === "INVESTIGATE").length;
    const escalated = allAlerts.filter((a) => a.disposition === "ESCALATE").length;
    return { total, pending, investigating, escalated };
  }, [allAlerts]);

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------
  const dispositionMut = useMutation({
    mutationFn: (body: { alert_id: string; decision: string; analyst: string; notes: string }) =>
      apiRequest("POST", apiUrl(`/api/v1/surveillance/alerts/${body.alert_id}/disposition`), {
        decision: body.decision,
        analyst: body.analyst,
        notes: body.notes,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["surveillance-alerts"] });
      qc.invalidateQueries({ queryKey: ["surveillance-alerts-summary"] });
      setDispositionOpen(false);
      setSelectedAlert(null);
      setDispositionForm({ decision: "", analyst: "", notes: "" });
    },
  });

  const anomalyMut = useMutation({
    mutationFn: (rmIdValue: string) =>
      apiRequest("POST", apiUrl("/api/v1/surveillance/anomaly-score"), { rm_id: rmIdValue }),
    onSuccess: (data: AnomalyScoreResult) => {
      setAnomalyResult(data);
    },
  });

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------
  const openDisposition = (alert: SurveillanceAlert) => {
    setSelectedAlert(alert);
    setDispositionForm({
      decision: "",
      analyst: "",
      notes: "",
    });
    setDispositionOpen(true);
  };

  const submitDisposition = () => {
    if (!selectedAlert || !dispositionForm.decision) return;
    dispositionMut.mutate({
      alert_id: selectedAlert.id,
      decision: dispositionForm.decision,
      analyst: dispositionForm.analyst || "CURRENT_USER",
      notes: dispositionForm.notes,
    });
  };

  const runAnomalyScore = () => {
    if (!rmId.trim()) return;
    setAnomalyResult(null);
    anomalyMut.mutate(rmId.trim());
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <ShieldAlert className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Trade Surveillance</h1>
            <p className="text-sm text-muted-foreground">
              Pattern-based alert scoring and disposition workflow
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            alertsQ.refetch();
            summaryQ.refetch();
          }}
          disabled={alertsQ.isFetching}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${alertsQ.isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <SummaryCard
          title="Total Alerts"
          value={summaryStats.total}
          icon={ShieldAlert}
          accent="bg-blue-600"
        />
        <SummaryCard
          title="Pending Review"
          value={summaryStats.pending}
          icon={Eye}
          accent="bg-yellow-500"
        />
        <SummaryCard
          title="Under Investigation"
          value={summaryStats.investigating}
          icon={SearchIcon}
          accent="bg-orange-500"
        />
        <SummaryCard
          title="Escalated"
          value={summaryStats.escalated}
          icon={AlertTriangle}
          accent="bg-red-600"
        />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <Select
          value={patternFilter}
          onValueChange={(v) => {
            setPatternFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Patterns" />
          </SelectTrigger>
          <SelectContent>
            {PATTERN_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={dispositionFilter}
          onValueChange={(v) => {
            setDispositionFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            {DISPOSITION_FILTER_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto text-sm text-muted-foreground">
          Auto-refreshes every 15s
        </div>
      </div>

      {/* Alerts Table */}
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px]">ID</TableHead>
              <TableHead>Pattern</TableHead>
              <TableHead>
                <div className="flex items-center gap-1">
                  Score
                  <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                </div>
              </TableHead>
              <TableHead>Order IDs</TableHead>
              <TableHead>Disposition</TableHead>
              <TableHead>Analyst</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {alertsQ.isLoading ? (
              <SkeletonRows cols={8} />
            ) : alertsQ.isError ? (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <FileWarning className="h-8 w-8 text-red-400" />
                    <p className="text-sm text-red-600">
                      Failed to load alerts. Please try again.
                    </p>
                    <Button variant="outline" size="sm" onClick={() => alertsQ.refetch()}>
                      Retry
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : alerts.length === 0 ? (
              <EmptyRow cols={8} msg="No surveillance alerts found matching the current filters" />
            ) : (
              alerts.map((alert) => {
                const dBadge = dispositionBadge(alert.disposition);
                return (
                  <TableRow key={alert.id}>
                    <TableCell className="font-mono text-xs">
                      {alert.id.length > 8 ? `${alert.id.substring(0, 8)}...` : alert.id}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={PATTERN_COLORS[alert.pattern] ?? "bg-muted text-foreground"}
                      >
                        {alert.pattern.replace(/_/g, " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-sm font-bold ${scoreColor(alert.score)}`}
                      >
                        {alert.score}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1 max-w-[200px]">
                        {(alert.order_ids ?? []).slice(0, 3).map((oid, idx) => (
                          <span
                            key={idx}
                            className="inline-block rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground"
                          >
                            {oid.length > 8 ? `${oid.substring(0, 8)}...` : oid}
                          </span>
                        ))}
                        {(alert.order_ids ?? []).length > 3 && (
                          <span className="text-xs text-muted-foreground">
                            +{alert.order_ids.length - 3} more
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={dBadge.className}>
                        {dBadge.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {alert.analyst ?? "-"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDate(alert.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openDisposition(alert)}
                      >
                        Disposition
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, alertsTotal)} of{" "}
            {alertsTotal}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* RM Anomaly Scoring Section                                         */}
      {/* ================================================================== */}
      <Separator />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <UserSearch className="h-5 w-5" />
            RM Anomaly Scoring
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Enter RM ID..."
                value={rmId}
                onChange={(e) => setRmId(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") runAnomalyScore();
                }}
                className="pl-9"
              />
            </div>
            <Button
              onClick={runAnomalyScore}
              disabled={anomalyMut.isPending || !rmId.trim()}
            >
              {anomalyMut.isPending ? "Scoring..." : "Score"}
            </Button>
          </div>

          {anomalyMut.isError && (
            <div className="rounded-md border border-red-200 bg-red-50 p-4">
              <p className="text-sm text-red-700">
                Failed to compute anomaly score. Please verify the RM ID and try again.
              </p>
            </div>
          )}

          {anomalyResult && (
            <div className="grid gap-4 md:grid-cols-2">
              {/* Score Overview */}
              <Card>
                <CardContent className="pt-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-muted-foreground">RM ID</span>
                    <span className="font-mono text-sm font-bold">{anomalyResult.rm_id}</span>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-muted-foreground">Anomaly Score</span>
                    <span
                      className={`text-2xl font-bold ${
                        anomalyResult.anomaly_score >= 80
                          ? "text-red-600"
                          : anomalyResult.anomaly_score >= 50
                            ? "text-orange-600"
                            : "text-green-600"
                      }`}
                    >
                      {anomalyResult.anomaly_score.toFixed(1)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-muted-foreground">Peer Average</span>
                    <span className="text-lg font-semibold text-foreground">
                      {anomalyResult.peer_avg.toFixed(1)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-muted-foreground">Std Deviation</span>
                    <span className="text-lg font-semibold text-foreground">
                      {anomalyResult.std_dev.toFixed(2)}
                    </span>
                  </div>
                  {/* Visual bar comparing score vs peer avg */}
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Score vs Peer Average</p>
                    <div className="relative h-4 w-full rounded-full bg-muted">
                      <div
                        className="absolute h-4 rounded-full bg-blue-400 opacity-50"
                        style={{ width: `${Math.min(anomalyResult.peer_avg, 100)}%` }}
                      />
                      <div
                        className={`absolute h-4 rounded-full ${
                          anomalyResult.anomaly_score >= 80
                            ? "bg-red-500"
                            : anomalyResult.anomaly_score >= 50
                              ? "bg-orange-500"
                              : "bg-green-500"
                        }`}
                        style={{ width: `${Math.min(anomalyResult.anomaly_score, 100)}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>0</span>
                      <span>50</span>
                      <span>100</span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Computed at {formatDate(anomalyResult.computed_at)}
                  </p>
                </CardContent>
              </Card>

              {/* Flags */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Detected Flags</CardTitle>
                </CardHeader>
                <CardContent>
                  {anomalyResult.flags.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                      No anomaly flags detected
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {anomalyResult.flags.map((flag, idx) => (
                        <div
                          key={idx}
                          className="flex items-center gap-2 rounded-md border border-orange-200 bg-orange-50 px-3 py-2"
                        >
                          <AlertTriangle className="h-4 w-4 text-orange-600 shrink-0" />
                          <span className="text-sm text-orange-800">{flag}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ================================================================== */}
      {/* Disposition Dialog                                                  */}
      {/* ================================================================== */}
      <Dialog open={dispositionOpen} onOpenChange={setDispositionOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Alert Disposition</DialogTitle>
          </DialogHeader>

          {selectedAlert && (
            <div className="space-y-4 py-2">
              {/* Alert summary */}
              <div className="rounded-md border bg-muted/30 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Alert ID</span>
                  <span className="font-mono text-xs">{selectedAlert.id}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Pattern</span>
                  <Badge
                    variant="outline"
                    className={PATTERN_COLORS[selectedAlert.pattern] ?? "bg-muted text-foreground"}
                  >
                    {selectedAlert.pattern.replace(/_/g, " ")}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Score</span>
                  <span
                    className={`inline-flex items-center rounded-md border px-2 py-0.5 text-sm font-bold ${scoreColor(selectedAlert.score)}`}
                  >
                    {selectedAlert.score}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Order IDs</span>
                  <div className="flex flex-wrap gap-1 justify-end max-w-[250px]">
                    {(selectedAlert.order_ids ?? []).map((oid, idx) => (
                      <span
                        key={idx}
                        className="inline-block rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground"
                      >
                        {oid}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Decision */}
              <div className="space-y-1">
                <label className="text-xs font-medium">
                  Decision <span className="text-red-500">*</span>
                </label>
                <Select
                  value={dispositionForm.decision}
                  onValueChange={(v) =>
                    setDispositionForm((f) => ({ ...f, decision: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select decision..." />
                  </SelectTrigger>
                  <SelectContent>
                    {DISPOSITION_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Analyst ID */}
              <div className="space-y-1">
                <label className="text-xs font-medium">Analyst ID</label>
                <Input
                  placeholder="Defaults to current user"
                  value={dispositionForm.analyst}
                  onChange={(e) =>
                    setDispositionForm((f) => ({ ...f, analyst: e.target.value }))
                  }
                />
              </div>

              {/* Notes */}
              <div className="space-y-1">
                <label className="text-xs font-medium">Notes</label>
                <Textarea
                  placeholder="Add disposition notes..."
                  rows={4}
                  value={dispositionForm.notes}
                  onChange={(e) =>
                    setDispositionForm((f) => ({ ...f, notes: e.target.value }))
                  }
                />
              </div>

              {dispositionMut.isError && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3">
                  <p className="text-sm text-red-700">
                    Failed to submit disposition. Please try again.
                  </p>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDispositionOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={submitDisposition}
              disabled={dispositionMut.isPending || !dispositionForm.decision}
            >
              {dispositionMut.isPending ? "Submitting..." : "Submit Disposition"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
