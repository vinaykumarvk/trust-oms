/**
 * Kill-Switch Console — Phase 4B (BRD Screen #15)
 *
 * Emergency trading halt console with invoke, resume (dual-approval),
 * active halt monitoring, and event history. Prominent red/green status
 * banners for immediate situational awareness.
 */
import { useState, useEffect, useCallback } from "react";
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
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@ui/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@ui/components/ui/select";
import { Textarea } from "@ui/components/ui/textarea";
import { Checkbox } from "@ui/components/ui/checkbox";
import { Skeleton } from "@ui/components/ui/skeleton";
import { Separator } from "@ui/components/ui/separator";
import {
  ShieldOff, ShieldCheck, OctagonX, Play, Clock, AlertTriangle,
  RefreshCw, History, Zap, UserCheck, CheckCircle2,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface KillSwitchEvent {
  id: string;
  scope_type: "MARKET" | "ASSET_CLASS" | "PORTFOLIO" | "DESK";
  scope_value: string;
  reason: string;
  invoked_by: string;
  invoked_at: string;
  resumed_at: string | null;
  resumed_by: string | null;
  approver_1: string | null;
  approver_2: string | null;
  is_active: boolean;
}

interface ActiveHaltsResponse {
  data: KillSwitchEvent[];
}

interface HistoryResponse {
  data: KillSwitchEvent[];
  total: number;
  page: number;
  pageSize: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const SCOPE_TYPES = [
  { value: "MARKET", label: "Market", placeholder: "e.g., PSE, NYSE" },
  { value: "ASSET_CLASS", label: "Asset Class", placeholder: "e.g., EQUITY, FIXED_INCOME" },
  { value: "PORTFOLIO", label: "Portfolio", placeholder: "Portfolio ID" },
  { value: "DESK", label: "Desk", placeholder: "Desk name" },
] as const;

const SCOPE_BADGE_COLORS: Record<string, string> = {
  MARKET: "bg-red-100 text-red-800 border-red-200",
  ASSET_CLASS: "bg-orange-100 text-orange-800 border-orange-200",
  PORTFOLIO: "bg-purple-100 text-purple-800 border-purple-200",
  DESK: "bg-blue-100 text-blue-800 border-blue-200",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatDateTime(d: string | null): string {
  if (!d) return "-";
  try {
    return new Date(d).toLocaleString("en-PH", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return d;
  }
}

function formatDuration(startStr: string, endStr?: string | null): string {
  const start = new Date(startStr).getTime();
  const end = endStr ? new Date(endStr).getTime() : Date.now();
  const diff = Math.max(0, end - start);

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

// ---------------------------------------------------------------------------
// Live Timer Component
// ---------------------------------------------------------------------------
function LiveTimer({ since }: { since: string }) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <span className="font-mono text-sm font-bold tabular-nums text-red-700">
      {formatDuration(since)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Reusable sub-components
// ---------------------------------------------------------------------------
function SkeletonRows({ cols, rows = 3 }: { cols: number; rows?: number }) {
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
export default function KillSwitchConsole() {
  const qc = useQueryClient();

  // Invoke form state
  const [invokeForm, setInvokeForm] = useState({
    scope_type: "" as string,
    scope_value: "",
    reason: "",
    mfa_verified: false,
  });
  const [confirmInvokeOpen, setConfirmInvokeOpen] = useState(false);

  // Resume dialog state
  const [resumeDialogOpen, setResumeDialogOpen] = useState(false);
  const [resumeTarget, setResumeTarget] = useState<KillSwitchEvent | null>(null);
  const [resumeForm, setResumeForm] = useState({
    approver_1: "",
    approver_2: "",
  });
  const [resumeValidationError, setResumeValidationError] = useState("");

  // History pagination
  const [historyPage, setHistoryPage] = useState(1);
  const historyPageSize = 20;

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------
  const activeQ = useQuery<ActiveHaltsResponse>({
    queryKey: ["kill-switch-active"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/kill-switch/active")),
    refetchInterval: 5_000,
  });

  const activeHalts = activeQ.data?.data ?? [];

  const historyQ = useQuery<HistoryResponse>({
    queryKey: ["kill-switch-history", historyPage],
    queryFn: () => {
      const p = new URLSearchParams();
      p.set("page", String(historyPage));
      p.set("pageSize", String(historyPageSize));
      return apiRequest("GET", apiUrl(`/api/v1/kill-switch/history?${p.toString()}`));
    },
    refetchInterval: 15_000,
  });

  const historyEvents = historyQ.data?.data ?? [];
  const historyTotal = historyQ.data?.total ?? 0;
  const historyTotalPages = Math.ceil(historyTotal / historyPageSize);

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------
  const invokeMut = useMutation({
    mutationFn: (body: { scope_type: string; scope_value: string; reason: string }) =>
      apiRequest("POST", apiUrl("/api/v1/kill-switch"), body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["kill-switch-active"] });
      qc.invalidateQueries({ queryKey: ["kill-switch-history"] });
      setInvokeForm({ scope_type: "", scope_value: "", reason: "", mfa_verified: false });
      setConfirmInvokeOpen(false);
    },
  });

  const resumeMut = useMutation({
    mutationFn: (body: { id: string; approver_1: string; approver_2: string }) =>
      apiRequest("POST", apiUrl(`/api/v1/kill-switch/${body.id}/resume`), {
        approver_1: body.approver_1,
        approver_2: body.approver_2,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["kill-switch-active"] });
      qc.invalidateQueries({ queryKey: ["kill-switch-history"] });
      setResumeDialogOpen(false);
      setResumeTarget(null);
      setResumeForm({ approver_1: "", approver_2: "" });
      setResumeValidationError("");
    },
  });

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------
  const handleInvokeClick = () => {
    setConfirmInvokeOpen(true);
  };

  const confirmInvoke = () => {
    invokeMut.mutate({
      scope_type: invokeForm.scope_type,
      scope_value: invokeForm.scope_value,
      reason: invokeForm.reason,
    });
  };

  const openResume = (halt: KillSwitchEvent) => {
    setResumeTarget(halt);
    setResumeForm({ approver_1: "", approver_2: "" });
    setResumeValidationError("");
    setResumeDialogOpen(true);
  };

  const submitResume = useCallback(() => {
    if (!resumeTarget) return;

    const a1 = resumeForm.approver_1.trim();
    const a2 = resumeForm.approver_2.trim();

    if (!a1 || !a2) {
      setResumeValidationError("Both approver IDs are required.");
      return;
    }
    if (a1 === a2) {
      setResumeValidationError("Approver IDs must be different (dual-approval requirement).");
      return;
    }

    setResumeValidationError("");
    resumeMut.mutate({
      id: resumeTarget.id,
      approver_1: a1,
      approver_2: a2,
    });
  }, [resumeTarget, resumeForm, resumeMut]);

  const scopePlaceholder = SCOPE_TYPES.find((s) => s.value === invokeForm.scope_type)?.placeholder ?? "Select scope type first";

  const invokeDisabled =
    !invokeForm.scope_type ||
    !invokeForm.scope_value.trim() ||
    !invokeForm.reason.trim() ||
    !invokeForm.mfa_verified ||
    invokeMut.isPending;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100">
            <OctagonX className="h-5 w-5 text-red-700" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Kill-Switch Console</h1>
            <p className="text-sm text-muted-foreground">
              Emergency trading halt management
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            activeQ.refetch();
            historyQ.refetch();
          }}
          disabled={activeQ.isFetching}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${activeQ.isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* ================================================================== */}
      {/* Active Halts Section                                                */}
      {/* ================================================================== */}
      {activeQ.isLoading ? (
        <Card>
          <CardContent className="pt-6">
            <Skeleton className="h-16 w-full" />
          </CardContent>
        </Card>
      ) : activeQ.isError ? (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <p className="text-sm font-medium text-red-800">
              Failed to load active halts. Please refresh.
            </p>
          </div>
        </div>
      ) : activeHalts.length === 0 ? (
        /* All Clear Banner */
        <div className="rounded-lg border-2 border-green-300 bg-green-50 p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-200">
              <ShieldCheck className="h-6 w-6 text-green-700" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-green-800">
                All Clear -- No Active Trading Halts
              </h2>
              <p className="text-sm text-green-700">
                All trading scopes are operating normally.
              </p>
            </div>
          </div>
        </div>
      ) : (
        /* Active Halts Display */
        <div className="space-y-3">
          {activeHalts.map((halt) => (
            <div
              key={halt.id}
              className="rounded-lg border-2 border-red-400 bg-red-50 p-4 animate-in fade-in"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-full bg-red-200 animate-pulse">
                    <ShieldOff className="h-5 w-5 text-red-700" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-bold text-red-800">TRADING HALTED</h3>
                      <Badge variant="outline" className={SCOPE_BADGE_COLORS[halt.scope_type] ?? "bg-muted text-foreground"}>
                        {halt.scope_type}
                      </Badge>
                    </div>
                    <p className="text-sm text-red-700">
                      <span className="font-medium">Scope:</span>{" "}
                      <span className="font-mono">{halt.scope_value}</span>
                    </p>
                    <p className="text-sm text-red-700">
                      <span className="font-medium">Reason:</span> {halt.reason}
                    </p>
                    <p className="text-sm text-red-700">
                      <span className="font-medium">Invoked by:</span>{" "}
                      <span className="font-mono">{halt.invoked_by}</span>
                    </p>
                    <div className="flex items-center gap-2 text-sm text-red-700">
                      <Clock className="h-4 w-4" />
                      <span className="font-medium">Duration:</span>
                      <LiveTimer since={halt.invoked_at} />
                      <span className="text-xs text-red-500">
                        (since {formatDateTime(halt.invoked_at)})
                      </span>
                    </div>
                  </div>
                </div>
                <Button
                  variant="outline"
                  className="border-red-300 text-red-700 hover:bg-red-100"
                  onClick={() => openResume(halt)}
                >
                  <Play className="h-4 w-4 mr-2" />
                  Resume Trading
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ================================================================== */}
      {/* Invoke Kill-Switch Section                                          */}
      {/* ================================================================== */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Zap className="h-5 w-5 text-red-600" />
            Invoke Kill-Switch
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Scope Type */}
            <div className="space-y-1">
              <label className="text-xs font-medium">
                Scope Type <span className="text-red-500">*</span>
              </label>
              <Select
                value={invokeForm.scope_type}
                onValueChange={(v) =>
                  setInvokeForm((f) => ({ ...f, scope_type: v, scope_value: "" }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select scope type..." />
                </SelectTrigger>
                <SelectContent>
                  {SCOPE_TYPES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Scope Value */}
            <div className="space-y-1">
              <label className="text-xs font-medium">
                Scope Value <span className="text-red-500">*</span>
              </label>
              <Input
                placeholder={scopePlaceholder}
                value={invokeForm.scope_value}
                onChange={(e) =>
                  setInvokeForm((f) => ({ ...f, scope_value: e.target.value }))
                }
                disabled={!invokeForm.scope_type}
              />
            </div>
          </div>

          {/* Reason */}
          <div className="space-y-1">
            <label className="text-xs font-medium">
              Reason <span className="text-red-500">*</span>
            </label>
            <Textarea
              placeholder="Describe the reason for invoking the kill-switch..."
              rows={3}
              value={invokeForm.reason}
              onChange={(e) =>
                setInvokeForm((f) => ({ ...f, reason: e.target.value }))
              }
            />
          </div>

          {/* MFA Verification */}
          <div className="flex items-center gap-3 rounded-md border border-yellow-200 bg-yellow-50 p-3">
            <Checkbox
              id="mfa-verify"
              checked={invokeForm.mfa_verified}
              onCheckedChange={(checked) =>
                setInvokeForm((f) => ({
                  ...f,
                  mfa_verified: checked === true,
                }))
              }
            />
            <label
              htmlFor="mfa-verify"
              className="text-sm font-medium text-yellow-800 cursor-pointer select-none"
            >
              I confirm MFA verification has been completed for this action
            </label>
          </div>

          {invokeMut.isError && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3">
              <p className="text-sm text-red-700">
                Failed to invoke kill-switch. Please try again or contact support.
              </p>
            </div>
          )}

          {invokeMut.isSuccess && (
            <div className="rounded-md border border-green-200 bg-green-50 p-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <p className="text-sm text-green-700">
                  Kill-switch invoked successfully. Trading has been halted for the selected scope.
                </p>
              </div>
            </div>
          )}

          {/* Big Red Button */}
          <Button
            className="w-full h-12 bg-red-600 hover:bg-red-700 text-white text-base font-bold tracking-wide"
            disabled={invokeDisabled}
            onClick={handleInvokeClick}
          >
            <OctagonX className="h-5 w-5 mr-2" />
            {invokeMut.isPending ? "INVOKING..." : "INVOKE KILL SWITCH"}
          </Button>
        </CardContent>
      </Card>

      {/* ================================================================== */}
      {/* Kill-Switch Confirmation AlertDialog                                */}
      {/* ================================================================== */}
      <AlertDialog open={confirmInvokeOpen} onOpenChange={setConfirmInvokeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-700">
              <OctagonX className="h-5 w-5" />
              Confirm Kill-Switch Invocation
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p className="font-medium text-red-700">
                This will halt all trading for the selected scope. Are you sure?
              </p>
              <div className="rounded-md border bg-muted/50 p-3 space-y-1 text-sm text-foreground">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Scope Type:</span>
                  <span className="font-mono font-medium">{invokeForm.scope_type}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Scope Value:</span>
                  <span className="font-mono font-medium">{invokeForm.scope_value}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Reason:</span>
                  <span className="font-medium max-w-[250px] text-right">{invokeForm.reason}</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                This action is logged and auditable. Resuming will require dual approval.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={confirmInvoke}
              disabled={invokeMut.isPending}
            >
              {invokeMut.isPending ? "Invoking..." : "Yes, Halt Trading"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ================================================================== */}
      {/* Resume Trading Dialog (Dual Approval)                               */}
      {/* ================================================================== */}
      <Dialog open={resumeDialogOpen} onOpenChange={setResumeDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Play className="h-5 w-5 text-green-600" />
              Resume Trading
            </DialogTitle>
          </DialogHeader>

          {resumeTarget && (
            <div className="space-y-4 py-2">
              {/* Halt summary */}
              <div className="rounded-md border bg-muted/30 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Halt ID</span>
                  <span className="font-mono text-xs">{resumeTarget.id}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Scope</span>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={SCOPE_BADGE_COLORS[resumeTarget.scope_type] ?? "bg-muted text-foreground"}>
                      {resumeTarget.scope_type}
                    </Badge>
                    <span className="font-mono text-xs">{resumeTarget.scope_value}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Active Since</span>
                  <span className="text-xs">{formatDateTime(resumeTarget.invoked_at)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Duration</span>
                  <LiveTimer since={resumeTarget.invoked_at} />
                </div>
              </div>

              {/* Dual Approval Notice */}
              <div className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 p-3">
                <UserCheck className="h-5 w-5 text-blue-600 shrink-0" />
                <p className="text-sm text-blue-800">
                  Resuming trading requires dual approval. Two different authorized approver IDs must be provided.
                </p>
              </div>

              {/* Approver 1 */}
              <div className="space-y-1">
                <label className="text-xs font-medium">
                  Approver 1 ID <span className="text-red-500">*</span>
                </label>
                <Input
                  placeholder="Enter first approver ID..."
                  value={resumeForm.approver_1}
                  onChange={(e) =>
                    setResumeForm((f) => ({ ...f, approver_1: e.target.value }))
                  }
                />
              </div>

              {/* Approver 2 */}
              <div className="space-y-1">
                <label className="text-xs font-medium">
                  Approver 2 ID <span className="text-red-500">*</span>
                </label>
                <Input
                  placeholder="Enter second approver ID..."
                  value={resumeForm.approver_2}
                  onChange={(e) =>
                    setResumeForm((f) => ({ ...f, approver_2: e.target.value }))
                  }
                />
              </div>

              {/* Validation Error */}
              {resumeValidationError && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3">
                  <p className="text-sm text-red-700">{resumeValidationError}</p>
                </div>
              )}

              {/* Mutation Error */}
              {resumeMut.isError && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3">
                  <p className="text-sm text-red-700">
                    Failed to resume trading. Please verify approver IDs and try again.
                  </p>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setResumeDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={submitResume}
              disabled={
                resumeMut.isPending ||
                !resumeForm.approver_1.trim() ||
                !resumeForm.approver_2.trim()
              }
            >
              {resumeMut.isPending ? "Resuming..." : "Resume Trading"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ================================================================== */}
      {/* History Section                                                     */}
      {/* ================================================================== */}
      <Separator />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <History className="h-5 w-5" />
            Kill-Switch Event History
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">ID</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Invoked By</TableHead>
                  <TableHead>Active Since</TableHead>
                  <TableHead>Resumed At</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {historyQ.isLoading ? (
                  <SkeletonRows cols={8} rows={5} />
                ) : historyQ.isError ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <AlertTriangle className="h-8 w-8 text-red-400" />
                        <p className="text-sm text-red-600">
                          Failed to load history. Please try again.
                        </p>
                        <Button variant="outline" size="sm" onClick={() => historyQ.refetch()}>
                          Retry
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : historyEvents.length === 0 ? (
                  <EmptyRow cols={8} msg="No kill-switch events recorded" />
                ) : (
                  historyEvents.map((evt) => (
                    <TableRow key={evt.id}>
                      <TableCell className="font-mono text-xs">
                        {evt.id.length > 8 ? `${evt.id.substring(0, 8)}...` : evt.id}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Badge
                            variant="outline"
                            className={SCOPE_BADGE_COLORS[evt.scope_type] ?? "bg-muted text-foreground"}
                          >
                            {evt.scope_type}
                          </Badge>
                          <span className="font-mono text-xs text-muted-foreground">
                            {evt.scope_value}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm max-w-[200px] truncate">
                        {evt.reason}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {evt.invoked_by}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDateTime(evt.invoked_at)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {evt.resumed_at ? formatDateTime(evt.resumed_at) : "-"}
                      </TableCell>
                      <TableCell>
                        {evt.is_active ? (
                          <LiveTimer since={evt.invoked_at} />
                        ) : (
                          <span className="font-mono text-xs text-muted-foreground">
                            {formatDuration(evt.invoked_at, evt.resumed_at)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {evt.is_active ? (
                          <Badge className="bg-red-100 text-red-800 border-red-200">
                            ACTIVE
                          </Badge>
                        ) : (
                          <Badge className="bg-green-100 text-green-800 border-green-200">
                            RESUMED
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* History Pagination */}
          {historyTotalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {(historyPage - 1) * historyPageSize + 1}-
                {Math.min(historyPage * historyPageSize, historyTotal)} of {historyTotal}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={historyPage <= 1}
                  onClick={() => setHistoryPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {historyPage} of {historyTotalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={historyPage >= historyTotalPages}
                  onClick={() => setHistoryPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
