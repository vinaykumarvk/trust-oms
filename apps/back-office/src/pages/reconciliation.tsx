/**
 * Transaction Reconciliation — Back-Office Operations
 *
 * Displays reconciliation runs, break details with aging,
 * and an upload stub for external records.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@ui/lib/queryClient";
import { apiUrl } from "@ui/lib/api-url";
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@ui/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@ui/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ui/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ui/components/ui/select";
import { Textarea } from "@ui/components/ui/textarea";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  GitCompareArrows,
  Play,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  Loader2,
  Upload,
  FileUp,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReconSummary {
  total_runs: number;
  last_run_status: string | null;
  open_breaks: number;
  resolved_today: number;
}

interface ReconRun {
  id: string;
  run_date: string;
  type: string;
  status: string;
  total_records: number;
  matched: number;
  breaks_found: number;
  duration_ms: number | null;
  created_at: string;
}

type BreakStatus = "OPEN" | "INVESTIGATING" | "RESOLVED" | "ESCALATED";

interface ReconBreak {
  id: string;
  trade_id: string;
  break_type: string;
  internal_value: number | string;
  external_value: number | string;
  difference: number | string;
  age_days: number;
  status: BreakStatus;
  created_at: string;
}

interface BreakAging {
  label: string;
  count: number;
  color: string;
}

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

function formatDuration(ms: number | null): string {
  if (ms === null || ms === undefined) return "-";
  if (ms < 1000) return `${ms}ms`;
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remSecs = secs % 60;
  return `${mins}m ${remSecs}s`;
}

function formatNumber(val: number | string | null): string {
  if (val === null || val === undefined) return "-";
  const num = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(num)) return "-";
  return num.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

const BREAK_STATUS_CONFIG: Record<BreakStatus, { label: string; color: string }> = {
  OPEN: { label: "Open", color: "bg-yellow-100 text-yellow-800" },
  INVESTIGATING: { label: "Investigating", color: "bg-blue-100 text-blue-800" },
  RESOLVED: { label: "Resolved", color: "bg-green-100 text-green-800" },
  ESCALATED: { label: "Escalated", color: "bg-red-100 text-red-800" },
};

const RUN_STATUS_COLORS: Record<string, string> = {
  COMPLETED: "bg-green-100 text-green-800",
  RUNNING: "bg-yellow-100 text-yellow-800",
  FAILED: "bg-red-100 text-red-800",
  PENDING: "bg-muted text-foreground",
};

const AGING_COLORS = ["#22c55e", "#eab308", "#f97316", "#ef4444"];

// ---------------------------------------------------------------------------
// Summary Card
// ---------------------------------------------------------------------------

interface SummaryCardProps {
  title: string;
  value: number | string;
  icon: React.ElementType;
  accent: string;
}

function SummaryCard({ title, value, icon: Icon, accent }: SummaryCardProps) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="mt-1 text-3xl font-bold text-foreground">{value}</p>
          </div>
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-lg ${accent}`}
          >
            <Icon className="h-5 w-5 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Run Transaction Recon Dialog
// ---------------------------------------------------------------------------

interface RunReconDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (date: string) => void;
  running: boolean;
}

function RunReconDialog({
  open,
  onOpenChange,
  onConfirm,
  running,
}: RunReconDialogProps) {
  const today = new Date().toISOString().split("T")[0];
  const [date, setDate] = useState(today);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Run Transaction Reconciliation</DialogTitle>
          <DialogDescription>
            Select a date to reconcile internal transactions against external
            records.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <label className="text-sm font-medium">Reconciliation Date</label>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={running}
          >
            Cancel
          </Button>
          <Button onClick={() => onConfirm(date)} disabled={!date || running}>
            {running && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Run Reconciliation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Resolve Break Dialog
// ---------------------------------------------------------------------------

interface ResolveDialogProps {
  open: boolean;
  breakId: string | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (notes: string) => void;
  resolving: boolean;
}

function ResolveDialog({
  open,
  breakId,
  onOpenChange,
  onConfirm,
  resolving,
}: ResolveDialogProps) {
  const [notes, setNotes] = useState("");

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setNotes("");
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Resolve Break</DialogTitle>
          <DialogDescription>
            Break ID: {breakId ?? "-"}. Provide resolution notes below.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <label className="text-sm font-medium">Resolution Notes</label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Describe how this break was resolved..."
            rows={4}
          />
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={resolving}
          >
            Cancel
          </Button>
          <Button
            onClick={() => onConfirm(notes)}
            disabled={!notes.trim() || resolving}
          >
            {resolving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Resolve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Runs Tab
// ---------------------------------------------------------------------------

function RunsTab() {
  const qc = useQueryClient();
  const [reconDialogOpen, setReconDialogOpen] = useState(false);

  const runsQuery = useQuery<ReconRun[]>({
    queryKey: ["recon-runs"],
    queryFn: () =>
      apiRequest("GET", apiUrl("/api/v1/reconciliation/runs")),
  });

  const triggerMutation = useMutation({
    mutationFn: (date: string) =>
      apiRequest("POST", apiUrl("/api/v1/reconciliation/runs/transaction"), {
        run_date: date,
      }),
    onSuccess: () => {
      setReconDialogOpen(false);
      qc.invalidateQueries({ queryKey: ["recon-runs"] });
      qc.invalidateQueries({ queryKey: ["recon-summary"] });
    },
  });

  const runs = runsQuery.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setReconDialogOpen(true)}>
          <Play className="mr-2 h-4 w-4" />
          Run Transaction Recon
        </Button>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Total Records</TableHead>
              <TableHead>Matched</TableHead>
              <TableHead>Breaks Found</TableHead>
              <TableHead>Duration</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {runsQuery.isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-16" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : runs.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center text-muted-foreground py-8"
                >
                  No reconciliation runs found
                </TableCell>
              </TableRow>
            ) : (
              runs.map((run) => {
                const statusColor =
                  RUN_STATUS_COLORS[run.status] ?? "bg-muted text-foreground";
                return (
                  <TableRow key={run.id}>
                    <TableCell className="font-medium">
                      {run.run_date}
                    </TableCell>
                    <TableCell>{run.type}</TableCell>
                    <TableCell>
                      <Badge className={statusColor}>
                        {run.status?.replace(/_/g, " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {run.total_records.toLocaleString()}
                    </TableCell>
                    <TableCell>{run.matched.toLocaleString()}</TableCell>
                    <TableCell>{run.breaks_found.toLocaleString()}</TableCell>
                    <TableCell>{formatDuration(run.duration_ms)}</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <RunReconDialog
        open={reconDialogOpen}
        onOpenChange={setReconDialogOpen}
        onConfirm={(date) => triggerMutation.mutate(date)}
        running={triggerMutation.isPending}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Breaks Tab
// ---------------------------------------------------------------------------

function BreaksTab() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [resolveTarget, setResolveTarget] = useState<string | null>(null);

  // Aging data
  const agingQuery = useQuery<BreakAging[]>({
    queryKey: ["recon-breaks-aging"],
    queryFn: () =>
      apiRequest("GET", apiUrl("/api/v1/reconciliation/breaks/aging")),
  });

  // Breaks list
  const breaksQuery = useQuery<ReconBreak[]>({
    queryKey: ["recon-breaks", statusFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      const qs = params.toString();
      return apiRequest(
        "GET",
        apiUrl(`/api/v1/reconciliation/breaks${qs ? `?${qs}` : ""}`),
      );
    },
  });

  const resolveMutation = useMutation({
    mutationFn: ({ breakId, notes }: { breakId: string; notes: string }) =>
      apiRequest(
        "POST",
        apiUrl(`/api/v1/reconciliation/breaks/${breakId}/resolve`),
        { notes },
      ),
    onSuccess: () => {
      setResolveTarget(null);
      qc.invalidateQueries({ queryKey: ["recon-breaks"] });
      qc.invalidateQueries({ queryKey: ["recon-breaks-aging"] });
      qc.invalidateQueries({ queryKey: ["recon-summary"] });
    },
  });

  const agingData = agingQuery.data ?? [
    { label: "0-1d", count: 0, color: AGING_COLORS[0] },
    { label: "2-3d", count: 0, color: AGING_COLORS[1] },
    { label: "4-7d", count: 0, color: AGING_COLORS[2] },
    { label: "7+d", count: 0, color: AGING_COLORS[3] },
  ];

  const breaks = breaksQuery.data ?? [];

  return (
    <div className="space-y-6">
      {/* Break Aging Chart */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Break Aging</CardTitle>
          <CardDescription>
            Distribution of open breaks by age
          </CardDescription>
        </CardHeader>
        <CardContent>
          {agingQuery.isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={agingData}>
                <XAxis dataKey="label" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {agingData.map((entry, idx) => (
                    <Cell
                      key={idx}
                      fill={entry.color || AGING_COLORS[idx] || "#6b7280"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Filter + Table */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">
          Break Details
        </h3>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Statuses</SelectItem>
            <SelectItem value="OPEN">Open</SelectItem>
            <SelectItem value="INVESTIGATING">Investigating</SelectItem>
            <SelectItem value="RESOLVED">Resolved</SelectItem>
            <SelectItem value="ESCALATED">Escalated</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Break ID</TableHead>
              <TableHead>Trade ID</TableHead>
              <TableHead>Break Type</TableHead>
              <TableHead className="text-right">Internal Value</TableHead>
              <TableHead className="text-right">External Value</TableHead>
              <TableHead className="text-right">Difference</TableHead>
              <TableHead>Age</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {breaksQuery.isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 9 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-16" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : breaks.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="text-center text-muted-foreground py-8"
                >
                  No breaks found
                </TableCell>
              </TableRow>
            ) : (
              breaks.map((brk) => {
                const statusCfg =
                  BREAK_STATUS_CONFIG[brk.status] ?? BREAK_STATUS_CONFIG.OPEN;
                return (
                  <TableRow key={brk.id}>
                    <TableCell className="font-mono text-xs">
                      {brk.id}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {brk.trade_id}
                    </TableCell>
                    <TableCell>{brk.break_type}</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatNumber(brk.internal_value)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatNumber(brk.external_value)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatNumber(brk.difference)}
                    </TableCell>
                    <TableCell>{brk.age_days}d</TableCell>
                    <TableCell>
                      <Badge className={statusCfg.color}>
                        {statusCfg.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {brk.status !== "RESOLVED" && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => setResolveTarget(brk.id)}
                        >
                          Resolve
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Resolve Dialog */}
      <ResolveDialog
        open={resolveTarget !== null}
        breakId={resolveTarget}
        onOpenChange={(o) => {
          if (!o) setResolveTarget(null);
        }}
        onConfirm={(notes) => {
          if (resolveTarget) {
            resolveMutation.mutate({ breakId: resolveTarget, notes });
          }
        }}
        resolving={resolveMutation.isPending}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Upload Tab (Stub)
// ---------------------------------------------------------------------------

function UploadTab() {
  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed rounded-lg text-muted-foreground">
            <FileUp className="h-12 w-12 mb-4" />
            <h3 className="text-lg font-medium mb-2">
              Upload External Records
            </h3>
            <p className="text-sm mb-6 text-center max-w-md">
              Upload external settlement or custodian records for reconciliation
              matching. Supported formats: CSV, XLSX.
            </p>
            <Button disabled>
              <Upload className="mr-2 h-4 w-4" />
              Upload External Records
            </Button>
            <p className="text-xs mt-3 text-muted-foreground">
              Coming soon in a future release
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function Reconciliation() {
  const summaryQuery = useQuery<ReconSummary>({
    queryKey: ["recon-summary"],
    queryFn: () =>
      apiRequest("GET", apiUrl("/api/v1/reconciliation/summary")),
  });

  const summary = summaryQuery.data;

  const lastStatusBadge = summary?.last_run_status ? (
    <Badge
      className={
        RUN_STATUS_COLORS[summary.last_run_status] ?? "bg-muted text-foreground"
      }
    >
      {summary.last_run_status.replace(/_/g, " ")}
    </Badge>
  ) : (
    <span className="text-muted-foreground text-sm">-</span>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <GitCompareArrows className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Transaction Reconciliation
          </h1>
          <p className="text-sm text-muted-foreground">
            Match internal transactions against external records
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          title="Total Runs"
          value={summary?.total_runs ?? 0}
          icon={Clock}
          accent="bg-indigo-600"
        />
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Last Run Status
                </p>
                <div className="mt-2">{lastStatusBadge}</div>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600">
                <CheckCircle className="h-5 w-5 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
        <SummaryCard
          title="Open Breaks"
          value={summary?.open_breaks ?? 0}
          icon={AlertTriangle}
          accent="bg-yellow-600"
        />
        <SummaryCard
          title="Resolved Today"
          value={summary?.resolved_today ?? 0}
          icon={XCircle}
          accent="bg-green-600"
        />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="runs">
        <TabsList>
          <TabsTrigger value="runs">Runs</TabsTrigger>
          <TabsTrigger value="breaks">Breaks</TabsTrigger>
          <TabsTrigger value="upload">Upload</TabsTrigger>
        </TabsList>
        <TabsContent value="runs">
          <RunsTab />
        </TabsContent>
        <TabsContent value="breaks">
          <BreaksTab />
        </TabsContent>
        <TabsContent value="upload">
          <UploadTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
