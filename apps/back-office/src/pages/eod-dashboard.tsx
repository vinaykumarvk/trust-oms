/**
 * EOD Dashboard — End-of-Day Processing & Job Chain Monitor
 *
 * Visual job chain with real-time progress tracking.
 * Displays DAG of EOD jobs, allows trigger/retry/skip, and shows run history.
 */

import { useState, useMemo } from "react";
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
import { Progress } from "@ui/components/ui/progress";
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
import { Separator } from "@ui/components/ui/separator";
import {
  Play,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  RotateCcw,
  SkipForward,
  ChevronDown,
  ChevronRight,
  CalendarDays,
  Activity,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type JobStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "SKIPPED";
type RunStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";

interface EodJob {
  id: string;
  job_key: string;
  display_name: string;
  status: JobStatus;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  records_processed: number | null;
  error_message: string | null;
  depends_on: string[];
}

interface EodRun {
  id: string;
  run_date: string;
  status: RunStatus;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  total_jobs: number;
  completed_jobs: number;
  failed_jobs: number;
  jobs?: EodJob[];
}

interface EodHistory {
  runs: EodRun[];
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

const JOB_STATUS_CONFIG: Record<
  JobStatus,
  { label: string; color: string; borderColor: string }
> = {
  PENDING: {
    label: "Pending",
    color: "bg-gray-100 text-gray-700",
    borderColor: "border-gray-300",
  },
  RUNNING: {
    label: "Running",
    color: "bg-yellow-100 text-yellow-800",
    borderColor: "border-yellow-400",
  },
  COMPLETED: {
    label: "Completed",
    color: "bg-green-100 text-green-800",
    borderColor: "border-green-400",
  },
  FAILED: {
    label: "Failed",
    color: "bg-red-100 text-red-800",
    borderColor: "border-red-400",
  },
  SKIPPED: {
    label: "Skipped",
    color: "bg-gray-100 text-gray-500",
    borderColor: "border-gray-300",
  },
};

const RUN_STATUS_CONFIG: Record<RunStatus, { label: string; color: string }> = {
  PENDING: { label: "Pending", color: "bg-gray-100 text-gray-700" },
  RUNNING: { label: "Running", color: "bg-yellow-100 text-yellow-800" },
  COMPLETED: { label: "Completed", color: "bg-green-100 text-green-800" },
  FAILED: { label: "Failed", color: "bg-red-100 text-red-800" },
};

// ---------------------------------------------------------------------------
// Run Status Indicator
// ---------------------------------------------------------------------------

function RunStatusIndicator({ status }: { status: RunStatus | undefined }) {
  if (!status) return null;
  const cfg = RUN_STATUS_CONFIG[status] ?? RUN_STATUS_CONFIG.PENDING;
  return (
    <Badge className={cfg.color}>
      {status === "RUNNING" && (
        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
      )}
      {status === "COMPLETED" && <CheckCircle className="mr-1 h-3 w-3" />}
      {status === "FAILED" && <XCircle className="mr-1 h-3 w-3" />}
      {cfg.label}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Job Card
// ---------------------------------------------------------------------------

interface JobCardProps {
  job: EodJob;
  onRetry: (jobId: string) => void;
  onSkip: (jobId: string) => void;
  retrying: boolean;
  skipping: boolean;
}

function JobCard({ job, onRetry, onSkip, retrying, skipping }: JobCardProps) {
  const cfg = JOB_STATUS_CONFIG[job.status] ?? JOB_STATUS_CONFIG.PENDING;

  return (
    <Card className={`border-2 ${cfg.borderColor}`}>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center justify-between">
          <span
            className={`font-semibold text-sm ${job.status === "SKIPPED" ? "line-through text-muted-foreground" : ""}`}
          >
            {job.display_name}
          </span>
          <Badge className={cfg.color}>
            {job.status === "RUNNING" && (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            )}
            {cfg.label}
          </Badge>
        </div>

        {job.status === "COMPLETED" && (
          <div className="flex gap-4 text-xs text-muted-foreground">
            {job.duration_ms !== null && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatDuration(job.duration_ms)}
              </span>
            )}
            {job.records_processed !== null && (
              <span>{job.records_processed.toLocaleString()} records</span>
            )}
          </div>
        )}

        {job.status === "FAILED" && job.error_message && (
          <p className="text-xs text-red-600 bg-red-50 p-2 rounded">
            {job.error_message}
          </p>
        )}

        <div className="flex gap-2 pt-1">
          {job.status === "FAILED" && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => onRetry(job.id)}
              disabled={retrying}
            >
              {retrying ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <RotateCcw className="mr-1 h-3 w-3" />
              )}
              Retry
            </Button>
          )}
          {(job.status === "RUNNING" || job.status === "PENDING") && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => onSkip(job.id)}
              disabled={skipping}
            >
              {skipping ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <SkipForward className="mr-1 h-3 w-3" />
              )}
              Skip
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Trigger Dialog
// ---------------------------------------------------------------------------

interface TriggerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (date: string) => void;
  triggering: boolean;
}

function TriggerDialog({
  open,
  onOpenChange,
  onConfirm,
  triggering,
}: TriggerDialogProps) {
  const today = new Date().toISOString().split("T")[0];
  const [date, setDate] = useState(today);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Trigger EOD Processing</DialogTitle>
          <DialogDescription>
            Select a date to run end-of-day processing. This will execute all
            EOD jobs in sequence.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <label className="text-sm font-medium">Processing Date</label>
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
            disabled={triggering}
          >
            Cancel
          </Button>
          <Button
            onClick={() => onConfirm(date)}
            disabled={!date || triggering}
          >
            {triggering && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirm & Run
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// History Table
// ---------------------------------------------------------------------------

function HistorySection() {
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  const historyQuery = useQuery<EodHistory>({
    queryKey: ["eod-history"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/eod/history")),
  });

  const runs = historyQuery.data?.runs ?? [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Run History</CardTitle>
        <CardDescription>Past EOD processing runs</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="rounded-md border-t">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Run Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Completed</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Jobs</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {historyQuery.isLoading ? (
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
                    No EOD runs found
                  </TableCell>
                </TableRow>
              ) : (
                runs.map((run) => {
                  const isExpanded = expandedRunId === run.id;
                  const statusCfg =
                    RUN_STATUS_CONFIG[run.status] ?? RUN_STATUS_CONFIG.PENDING;
                  return (
                    <TableRow
                      key={run.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() =>
                        setExpandedRunId(isExpanded ? null : run.id)
                      }
                    >
                      <TableCell>
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </TableCell>
                      <TableCell className="font-medium">
                        {run.run_date}
                      </TableCell>
                      <TableCell>
                        <Badge className={statusCfg.color}>
                          {statusCfg.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDateTime(run.started_at)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDateTime(run.completed_at)}
                      </TableCell>
                      <TableCell>{formatDuration(run.duration_ms)}</TableCell>
                      <TableCell>
                        {run.completed_jobs}/{run.total_jobs}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function EodDashboard() {
  const qc = useQueryClient();
  const [triggerOpen, setTriggerOpen] = useState(false);
  const [actioningJobId, setActioningJobId] = useState<string | null>(null);

  // Fetch current EOD status
  const statusQuery = useQuery<EodRun>({
    queryKey: ["eod-status"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/eod/status")),
    refetchInterval: (query) => {
      const data = query.state.data as EodRun | undefined;
      return data?.status === "RUNNING" ? 5000 : false;
    },
  });

  const currentRun = statusQuery.data;
  const jobs = currentRun?.jobs ?? [];

  // Compute progress
  const totalJobs = currentRun?.total_jobs ?? jobs.length;
  const completedJobs =
    currentRun?.completed_jobs ??
    jobs.filter((j) => j.status === "COMPLETED" || j.status === "SKIPPED")
      .length;
  const hasFailed = jobs.some((j) => j.status === "FAILED");
  const progressPct = totalJobs > 0 ? (completedJobs / totalJobs) * 100 : 0;

  // Trigger EOD
  const triggerMutation = useMutation({
    mutationFn: (date: string) =>
      apiRequest("POST", apiUrl("/api/v1/eod/trigger"), {
        run_date: date,
      }),
    onSuccess: () => {
      setTriggerOpen(false);
      qc.invalidateQueries({ queryKey: ["eod-status"] });
      qc.invalidateQueries({ queryKey: ["eod-history"] });
    },
  });

  // Retry job
  const retryMutation = useMutation({
    mutationFn: (jobId: string) =>
      apiRequest("POST", apiUrl(`/api/v1/eod/jobs/${jobId}/retry`)),
    onSuccess: () => {
      setActioningJobId(null);
      qc.invalidateQueries({ queryKey: ["eod-status"] });
    },
    onSettled: () => setActioningJobId(null),
  });

  // Skip job
  const skipMutation = useMutation({
    mutationFn: (jobId: string) =>
      apiRequest("POST", apiUrl(`/api/v1/eod/jobs/${jobId}/skip`)),
    onSuccess: () => {
      setActioningJobId(null);
      qc.invalidateQueries({ queryKey: ["eod-status"] });
    },
    onSettled: () => setActioningJobId(null),
  });

  const handleRetry = (jobId: string) => {
    setActioningJobId(jobId);
    retryMutation.mutate(jobId);
  };

  const handleSkip = (jobId: string) => {
    setActioningJobId(jobId);
    skipMutation.mutate(jobId);
  };

  // Arrange jobs into rows for a visual DAG (3-column grid)
  // Jobs are displayed in dependency order; parallel jobs share a row
  const jobRows = useMemo(() => {
    if (jobs.length === 0) return [];
    const rows: EodJob[][] = [];
    const placed = new Set<string>();

    // Simple topological grouping: a job can be placed once all dependencies are placed
    let remaining = [...jobs];
    let safetyCounter = 0;
    while (remaining.length > 0 && safetyCounter < 20) {
      safetyCounter++;
      const row: EodJob[] = [];
      const nextRemaining: EodJob[] = [];
      for (const job of remaining) {
        const depsReady = (job.depends_on ?? []).every((dep) =>
          placed.has(dep),
        );
        if (depsReady) {
          row.push(job);
        } else {
          nextRemaining.push(job);
        }
      }
      if (row.length === 0) {
        // Break cycle: push all remaining in one row
        rows.push(nextRemaining);
        break;
      }
      rows.push(row);
      for (const j of row) placed.add(j.job_key);
      remaining = nextRemaining;
    }
    return rows;
  }, [jobs]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <CalendarDays className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              EOD Processing
            </h1>
            <p className="text-sm text-muted-foreground">
              End-of-day job chain monitor
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {currentRun && <RunStatusIndicator status={currentRun.status} />}
          <Button onClick={() => setTriggerOpen(true)}>
            <Play className="mr-2 h-4 w-4" />
            Trigger EOD
          </Button>
        </div>
      </div>

      {/* Progress Bar */}
      {currentRun && totalJobs > 0 && (
        <Card>
          <CardContent className="pt-6 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Overall Progress: {completedJobs} / {totalJobs} jobs
              </span>
              <span className="font-medium">{Math.round(progressPct)}%</span>
            </div>
            <Progress
              value={progressPct}
              className={
                hasFailed
                  ? "[&>div]:bg-red-500"
                  : currentRun.status === "RUNNING"
                    ? "[&>div]:bg-yellow-500"
                    : "[&>div]:bg-green-500"
              }
            />
          </CardContent>
        </Card>
      )}

      {/* Job Chain DAG */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Job Chain</CardTitle>
          <CardDescription>
            EOD jobs in dependency order. Parallel jobs appear side-by-side.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {statusQuery.isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="grid grid-cols-3 gap-4">
                  <Skeleton className="h-24" />
                  {i === 2 && <Skeleton className="h-24" />}
                </div>
              ))}
            </div>
          ) : jobs.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-muted-foreground">
              <Activity className="h-10 w-10 mb-3" />
              <p>No active EOD run. Click "Trigger EOD" to start.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {jobRows.map((row, rowIdx) => (
                <div key={rowIdx}>
                  {rowIdx > 0 && (
                    <div className="flex justify-center py-1">
                      <div className="w-px h-4 bg-border" />
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {row.map((job) => (
                      <JobCard
                        key={job.id}
                        job={job}
                        onRetry={handleRetry}
                        onSkip={handleSkip}
                        retrying={
                          actioningJobId === job.id && retryMutation.isPending
                        }
                        skipping={
                          actioningJobId === job.id && skipMutation.isPending
                        }
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Separator />

      {/* History */}
      <HistorySection />

      {/* Trigger Dialog */}
      <TriggerDialog
        open={triggerOpen}
        onOpenChange={setTriggerOpen}
        onConfirm={(date) => triggerMutation.mutate(date)}
        triggering={triggerMutation.isPending}
      />
    </div>
  );
}
