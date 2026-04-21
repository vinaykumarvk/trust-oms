/**
 * Exception Workbench -- TrustFees Pro Phase 8
 *
 * Full UI page for managing exception items:
 *   - KPI summary cards (SLA Adherence %, open, in-progress, escalated)
 *   - Filter bar with severity toggles, type/status dropdowns, SLA state, search
 *   - Data table with SLA countdown, severity and status badges
 *   - Detail drawer with action buttons (Assign, Resolve, Escalate, Won't Fix)
 *   - Bulk actions toolbar (Bulk Reassign, Bulk Resolve)
 *   - 15-second auto-refresh, dark mode support
 */
import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@ui/lib/queryClient";
import { apiUrl } from "@ui/lib/api-url";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/ui/card";
import { Badge } from "@ui/components/ui/badge";
import { Button } from "@ui/components/ui/button";
import { Input } from "@ui/components/ui/input";
import { Label } from "@ui/components/ui/label";
import { Separator } from "@ui/components/ui/separator";
import { Skeleton } from "@ui/components/ui/skeleton";
import { Textarea } from "@ui/components/ui/textarea";
import { Checkbox } from "@ui/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@ui/components/ui/dialog";
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@ui/components/ui/sheet";
import {
  AlertTriangle,
  Clock,
  CheckCircle,
  ArrowUpCircle,
  XOctagon,
  RefreshCw,
  User,
  Activity,
  Target,
  BarChart3,
  Timer,
  Users,
} from "lucide-react";

/* ---------- Constants ---------- */

const SEVERITY_COLORS: Record<string, string> = {
  P1: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  P2: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  P3: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
};

const STATUS_COLORS: Record<string, string> = {
  OPEN: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  IN_PROGRESS: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  ESCALATED: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  RESOLVED: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  WONT_FIX: "bg-gray-100 text-gray-800 dark:bg-gray-900/40 dark:text-gray-300",
};

const TYPE_OPTIONS = [
  "ALL",
  "MISSING_FX",
  "ACCRUAL_MISMATCH",
  "INVOICE_PDF_FAILURE",
  "PAYMENT_AMBIGUITY",
  "DISPUTE_OPEN",
  "REVERSAL_CANDIDATE",
  "OTHER",
];

const STATUS_OPTIONS = ["ALL", "OPEN", "IN_PROGRESS", "ESCALATED", "RESOLVED", "WONT_FIX"];
const SLA_OPTIONS = ["ALL", "on-time", "breached"];

/* ---------- Helpers ---------- */

const fmtDate = (d: string | null) => {
  if (!d) return "--";
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
};

/**
 * Compute SLA countdown from sla_due_at.
 * Returns { text, color } where color indicates urgency.
 */
function getSlaCountdown(slaDueAt: string | null, status: string): { text: string; color: string } {
  if (!slaDueAt) return { text: "--", color: "text-muted-foreground" };
  if (status === "RESOLVED" || status === "WONT_FIX") {
    return { text: "N/A", color: "text-muted-foreground" };
  }

  const now = Date.now();
  const due = new Date(slaDueAt).getTime();
  const diff = due - now;

  if (diff <= 0) {
    const hoursOverdue = Math.abs(diff) / (1000 * 60 * 60);
    return {
      text: `BREACHED (${hoursOverdue.toFixed(1)}h overdue)`,
      color: "text-red-600 dark:text-red-400 font-bold",
    };
  }

  const totalMinutes = diff / (1000 * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.floor(totalMinutes % 60);

  // Calculate % remaining for color coding
  // Estimate total SLA window from severity (use generic 24h as fallback)
  const slaCreated = due - 24 * 60 * 60 * 1000; // approximate
  const totalWindow = due - slaCreated;
  const pctRemaining = totalWindow > 0 ? diff / totalWindow : 1;

  let color: string;
  if (pctRemaining > 0.5) {
    color = "text-green-600 dark:text-green-400";
  } else if (pctRemaining > 0.25) {
    color = "text-amber-600 dark:text-amber-400";
  } else {
    color = "text-red-600 dark:text-red-400 font-semibold";
  }

  return {
    text: `${hours}h ${minutes}m`,
    color,
  };
}

/* ---------- Component ---------- */

export default function ExceptionWorkbench() {
  const queryClient = useQueryClient();

  // Filters
  const [severityFilter, setSeverityFilter] = useState<string[]>([]);
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [slaFilter, setSlaFilter] = useState("ALL");
  const [search, setSearch] = useState("");

  // Detail drawer
  const [selectedExc, setSelectedExc] = useState<any>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Action dialogs
  const [assignDialog, setAssignDialog] = useState<any>(null);
  const [resolveDialog, setResolveDialog] = useState<any>(null);
  const [escalateDialog, setEscalateDialog] = useState<any>(null);
  const [wontFixDialog, setWontFixDialog] = useState<any>(null);

  // Action form state
  const [assignUserId, setAssignUserId] = useState("");
  const [resolveNotes, setResolveNotes] = useState("");
  const [escalateReason, setEscalateReason] = useState("");
  const [wontFixReason, setWontFixReason] = useState("");

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkReassignDialog, setBulkReassignDialog] = useState(false);
  const [bulkResolveDialog, setBulkResolveDialog] = useState(false);
  const [bulkUserId, setBulkUserId] = useState("");
  const [bulkResolveNotes, setBulkResolveNotes] = useState("");

  // Force re-render for countdown timer
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(interval);
  }, []);

  // Build query params
  const params = new URLSearchParams();
  if (severityFilter.length === 1) params.set("severity", severityFilter[0]);
  if (typeFilter !== "ALL") params.set("exception_type", typeFilter);
  if (statusFilter !== "ALL") params.set("exception_status", statusFilter);
  if (slaFilter !== "ALL") params.set("sla_state", slaFilter);
  if (search) params.set("search", search);
  params.set("pageSize", "100");

  // Fetch exceptions
  const { data: exceptionsData, isLoading } = useQuery({
    queryKey: ["exceptions", severityFilter, typeFilter, statusFilter, slaFilter, search],
    queryFn: () =>
      apiRequest("GET", apiUrl(`/api/v1/exceptions?${params.toString()}`)),
    refetchInterval: 15_000,
  });

  // Fetch KPI dashboard
  const { data: kpiData } = useQuery({
    queryKey: ["exceptions-kpi"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/exceptions/kpi")),
    refetchInterval: 15_000,
  });

  const exceptions = exceptionsData?.data ?? [];
  const kpi = kpiData?.data ?? {};

  // Filter by severity locally if multiple selected
  const filteredExceptions = useMemo(() => {
    if (severityFilter.length <= 1) return exceptions;
    return exceptions.filter((e: any) => severityFilter.includes(e.severity));
  }, [exceptions, severityFilter]);

  // Toggle severity filter
  const toggleSeverity = (sev: string) => {
    setSeverityFilter((prev) => {
      if (prev.includes(sev)) {
        return prev.filter((s) => s !== sev);
      }
      return [...prev, sev];
    });
  };

  // Selection helpers
  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredExceptions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredExceptions.map((e: any) => e.id)));
    }
  };

  // Mutations
  const assignMutation = useMutation({
    mutationFn: (data: { id: number; user_id: string }) =>
      apiRequest("POST", apiUrl(`/api/v1/exceptions/${data.id}/assign`), {
        user_id: data.user_id,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exceptions"] });
      queryClient.invalidateQueries({ queryKey: ["exceptions-kpi"] });
      setAssignDialog(null);
      setAssignUserId("");
    },
  });

  const resolveMutation = useMutation({
    mutationFn: (data: { id: number; resolution_notes: string }) =>
      apiRequest("POST", apiUrl(`/api/v1/exceptions/${data.id}/resolve`), {
        resolution_notes: data.resolution_notes,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exceptions"] });
      queryClient.invalidateQueries({ queryKey: ["exceptions-kpi"] });
      setResolveDialog(null);
      setResolveNotes("");
      setDrawerOpen(false);
    },
  });

  const escalateMutation = useMutation({
    mutationFn: (data: { id: number; reason?: string }) =>
      apiRequest("POST", apiUrl(`/api/v1/exceptions/${data.id}/escalate`), {
        reason: data.reason,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exceptions"] });
      queryClient.invalidateQueries({ queryKey: ["exceptions-kpi"] });
      setEscalateDialog(null);
      setEscalateReason("");
    },
  });

  const wontFixMutation = useMutation({
    mutationFn: (data: { id: number; reason: string }) =>
      apiRequest("POST", apiUrl(`/api/v1/exceptions/${data.id}/wont-fix`), {
        reason: data.reason,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exceptions"] });
      queryClient.invalidateQueries({ queryKey: ["exceptions-kpi"] });
      setWontFixDialog(null);
      setWontFixReason("");
      setDrawerOpen(false);
    },
  });

  const bulkReassignMutation = useMutation({
    mutationFn: (data: { exception_ids: number[]; user_id: string }) =>
      apiRequest("POST", apiUrl("/api/v1/exceptions/bulk-reassign"), data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exceptions"] });
      queryClient.invalidateQueries({ queryKey: ["exceptions-kpi"] });
      setBulkReassignDialog(false);
      setBulkUserId("");
      setSelectedIds(new Set());
    },
  });

  const bulkResolveMutation = useMutation({
    mutationFn: (data: { exception_ids: number[]; resolution_notes: string }) =>
      apiRequest("POST", apiUrl("/api/v1/exceptions/bulk-resolve"), data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exceptions"] });
      queryClient.invalidateQueries({ queryKey: ["exceptions-kpi"] });
      setBulkResolveDialog(false);
      setBulkResolveNotes("");
      setSelectedIds(new Set());
    },
  });

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Exception Workbench
          </h1>
          <p className="text-sm text-muted-foreground">
            TrustFees Pro -- monitor and resolve exceptions with SLA tracking
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            queryClient.invalidateQueries({ queryKey: ["exceptions"] });
            queryClient.invalidateQueries({ queryKey: ["exceptions-kpi"] });
          }}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">SLA Adherence</CardTitle>
            <Target className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {kpi.sla_adherence_pct !== undefined
                ? `${kpi.sla_adherence_pct}%`
                : "--"}
            </div>
            <p className="text-xs text-muted-foreground">
              Resolved within SLA target
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Open</CardTitle>
            <Clock className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpi.total_open ?? 0}</div>
            <p className="text-xs text-muted-foreground">
              Awaiting assignment / triage
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">In Progress</CardTitle>
            <Activity className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpi.total_in_progress ?? 0}</div>
            <p className="text-xs text-muted-foreground">
              Being investigated
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Escalated</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpi.total_escalated ?? 0}</div>
            <div className="mt-1 flex gap-2">
              {kpi.backlog_by_severity && (
                <>
                  <Badge className={`text-[10px] ${SEVERITY_COLORS.P1}`}>
                    P1: {kpi.backlog_by_severity.P1 ?? 0}
                  </Badge>
                  <Badge className={`text-[10px] ${SEVERITY_COLORS.P2}`}>
                    P2: {kpi.backlog_by_severity.P2 ?? 0}
                  </Badge>
                  <Badge className={`text-[10px] ${SEVERITY_COLORS.P3}`}>
                    P3: {kpi.backlog_by_severity.P3 ?? 0}
                  </Badge>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-end gap-4">
        {/* Severity toggles */}
        <div className="space-y-1">
          <Label className="text-xs">Severity</Label>
          <div className="flex gap-1">
            {(["P1", "P2", "P3"] as const).map((sev) => (
              <Button
                key={sev}
                size="sm"
                variant={severityFilter.includes(sev) ? "default" : "outline"}
                className={`h-8 text-xs ${
                  severityFilter.includes(sev) ? "" : ""
                }`}
                onClick={() => toggleSeverity(sev)}
              >
                <span
                  className={`mr-1 inline-block h-2 w-2 rounded-full ${
                    sev === "P1"
                      ? "bg-red-500"
                      : sev === "P2"
                      ? "bg-amber-500"
                      : "bg-blue-500"
                  }`}
                />
                {sev}
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Type</Label>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TYPE_OPTIONS.map((t) => (
                <SelectItem key={t} value={t}>
                  {t === "ALL" ? "All Types" : t.replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Status</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {s === "ALL" ? "All Statuses" : s.replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">SLA State</Label>
          <Select value={slaFilter} onValueChange={setSlaFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SLA_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {s === "ALL" ? "All" : s === "on-time" ? "On-time" : "Breached"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Search</Label>
          <Input
            placeholder="Title, source ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-[200px]"
          />
        </div>
      </div>

      {/* Bulk Actions Toolbar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 rounded-md border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20">
          <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
            {selectedIds.size} selected
          </span>
          <Separator orientation="vertical" className="h-5" />
          <Button
            size="sm"
            variant="outline"
            onClick={() => setBulkReassignDialog(true)}
          >
            <Users className="mr-1 h-3 w-3" />
            Bulk Reassign
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setBulkResolveDialog(true)}
          >
            <CheckCircle className="mr-1 h-3 w-3" />
            Bulk Resolve
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSelectedIds(new Set())}
          >
            Clear
          </Button>
        </div>
      )}

      <Separator />

      {/* Data Table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <div className="rounded-md border dark:border-gray-700 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="dark:border-gray-700">
                <TableHead className="w-10">
                  <Checkbox
                    checked={
                      filteredExceptions.length > 0 &&
                      selectedIds.size === filteredExceptions.length
                    }
                    onCheckedChange={toggleSelectAll}
                  />
                </TableHead>
                <TableHead>ID</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Assigned To</TableHead>
                <TableHead>SLA Countdown</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredExceptions.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="text-center text-muted-foreground py-8"
                  >
                    No exceptions found
                  </TableCell>
                </TableRow>
              ) : (
                filteredExceptions.map((exc: any) => {
                  const sla = getSlaCountdown(exc.sla_due_at, exc.exception_status);
                  return (
                    <TableRow
                      key={exc.id}
                      className="dark:border-gray-700 cursor-pointer hover:bg-muted/50"
                      onClick={(e) => {
                        // Don't open drawer when clicking checkbox
                        if ((e.target as HTMLElement).closest('[role="checkbox"]')) return;
                        setSelectedExc(exc);
                        setDrawerOpen(true);
                      }}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.has(exc.id)}
                          onCheckedChange={() => toggleSelect(exc.id)}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        EXC-{String(exc.id).padStart(4, "0")}
                      </TableCell>
                      <TableCell className="text-xs">
                        {exc.exception_type?.replace(/_/g, " ")}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={`text-xs ${
                            SEVERITY_COLORS[exc.severity] ?? ""
                          }`}
                        >
                          {exc.severity}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm max-w-[200px] truncate">
                        {exc.title}
                      </TableCell>
                      <TableCell className="text-xs">
                        {exc.customer_id ?? "--"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {exc.assigned_to_user ?? "--"}
                      </TableCell>
                      <TableCell>
                        <span className={`text-xs font-mono ${sla.color}`}>
                          {sla.text}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={`text-xs ${
                            STATUS_COLORS[exc.exception_status] ?? ""
                          }`}
                        >
                          {exc.exception_status?.replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Total count */}
      <div className="text-xs text-muted-foreground">
        Showing {filteredExceptions.length} of {exceptionsData?.total ?? 0}{" "}
        exceptions | Avg resolution: {kpi.avg_resolution_hours ?? "--"}h |
        Auto-refresh every 15 seconds
      </div>

      {/* Detail Drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="w-[450px] sm:w-[500px] overflow-y-auto">
          {selectedExc && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <span>
                    EXC-{String(selectedExc.id).padStart(4, "0")}
                  </span>
                  <Badge
                    className={`text-xs ${
                      SEVERITY_COLORS[selectedExc.severity] ?? ""
                    }`}
                  >
                    {selectedExc.severity}
                  </Badge>
                  <Badge
                    className={`text-xs ${
                      STATUS_COLORS[selectedExc.exception_status] ?? ""
                    }`}
                  >
                    {selectedExc.exception_status?.replace(/_/g, " ")}
                  </Badge>
                </SheetTitle>
                <SheetDescription>{selectedExc.title}</SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-4">
                <div className="rounded-md bg-muted/50 p-4 space-y-2 text-sm dark:bg-muted/20">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Type:</span>
                    <span>{selectedExc.exception_type?.replace(/_/g, " ")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Customer:</span>
                    <span>{selectedExc.customer_id ?? "--"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Source:</span>
                    <span className="font-mono text-xs">
                      {selectedExc.source_aggregate_type} /{" "}
                      {selectedExc.source_aggregate_id}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Assigned To:</span>
                    <span>{selectedExc.assigned_to_user ?? "--"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Team:</span>
                    <span>{selectedExc.assigned_to_team}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">SLA Due:</span>
                    <span className="font-mono text-xs">
                      {fmtDate(selectedExc.sla_due_at)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">SLA Countdown:</span>
                    <span
                      className={`font-mono text-xs ${
                        getSlaCountdown(
                          selectedExc.sla_due_at,
                          selectedExc.exception_status,
                        ).color
                      }`}
                    >
                      {
                        getSlaCountdown(
                          selectedExc.sla_due_at,
                          selectedExc.exception_status,
                        ).text
                      }
                    </span>
                  </div>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Created:</span>
                    <span className="text-xs">
                      {fmtDate(selectedExc.created_at)}
                    </span>
                  </div>
                  {selectedExc.escalated_at && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Escalated:</span>
                      <span className="text-xs">
                        {fmtDate(selectedExc.escalated_at)}
                      </span>
                    </div>
                  )}
                  {selectedExc.resolved_at && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Resolved:</span>
                      <span className="text-xs">
                        {fmtDate(selectedExc.resolved_at)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Details / Description */}
                {selectedExc.details && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      Details
                    </Label>
                    <div className="rounded-md border p-3 text-sm dark:border-gray-700">
                      {typeof selectedExc.details === "object"
                        ? JSON.stringify(selectedExc.details, null, 2)
                        : selectedExc.details}
                    </div>
                  </div>
                )}

                {selectedExc.resolution_notes && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      Resolution Notes
                    </Label>
                    <div className="rounded-md border p-3 text-sm whitespace-pre-wrap dark:border-gray-700">
                      {selectedExc.resolution_notes}
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                {selectedExc.exception_status !== "RESOLVED" &&
                  selectedExc.exception_status !== "WONT_FIX" && (
                    <div className="flex flex-wrap gap-2 pt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setAssignDialog(selectedExc)}
                      >
                        <User className="mr-1 h-3 w-3" />
                        Assign
                      </Button>
                      {(selectedExc.exception_status === "IN_PROGRESS" ||
                        selectedExc.exception_status === "ESCALATED") && (
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => setResolveDialog(selectedExc)}
                        >
                          <CheckCircle className="mr-1 h-3 w-3" />
                          Resolve
                        </Button>
                      )}
                      {(selectedExc.exception_status === "OPEN" ||
                        selectedExc.exception_status === "IN_PROGRESS") && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-amber-600 border-amber-300 dark:text-amber-400 dark:border-amber-700"
                          onClick={() => setEscalateDialog(selectedExc)}
                        >
                          <ArrowUpCircle className="mr-1 h-3 w-3" />
                          Escalate
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-gray-600 border-gray-300 dark:text-gray-400 dark:border-gray-600"
                        onClick={() => setWontFixDialog(selectedExc)}
                      >
                        <XOctagon className="mr-1 h-3 w-3" />
                        Won't Fix
                      </Button>
                    </div>
                  )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Assign Dialog */}
      <Dialog
        open={!!assignDialog}
        onOpenChange={(open) => {
          if (!open) {
            setAssignDialog(null);
            setAssignUserId("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Exception</DialogTitle>
            <DialogDescription>
              Assign EXC-{String(assignDialog?.id ?? 0).padStart(4, "0")} to a
              team member.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>User ID</Label>
              <Input
                placeholder="Enter user ID..."
                value={assignUserId}
                onChange={(e) => setAssignUserId(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setAssignDialog(null);
                setAssignUserId("");
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={!assignUserId || assignMutation.isPending}
              onClick={() => {
                if (assignDialog) {
                  assignMutation.mutate({
                    id: assignDialog.id,
                    user_id: assignUserId,
                  });
                }
              }}
            >
              {assignMutation.isPending ? "Assigning..." : "Assign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Resolve Dialog */}
      <Dialog
        open={!!resolveDialog}
        onOpenChange={(open) => {
          if (!open) {
            setResolveDialog(null);
            setResolveNotes("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve Exception</DialogTitle>
            <DialogDescription>
              Mark EXC-{String(resolveDialog?.id ?? 0).padStart(4, "0")} as
              resolved.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Resolution Notes</Label>
              <Textarea
                placeholder="Describe how the exception was resolved..."
                value={resolveNotes}
                onChange={(e) => setResolveNotes(e.target.value)}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setResolveDialog(null);
                setResolveNotes("");
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={!resolveNotes || resolveMutation.isPending}
              onClick={() => {
                if (resolveDialog) {
                  resolveMutation.mutate({
                    id: resolveDialog.id,
                    resolution_notes: resolveNotes,
                  });
                }
              }}
            >
              {resolveMutation.isPending ? "Resolving..." : "Resolve"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Escalate Dialog */}
      <Dialog
        open={!!escalateDialog}
        onOpenChange={(open) => {
          if (!open) {
            setEscalateDialog(null);
            setEscalateReason("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Escalate Exception</DialogTitle>
            <DialogDescription>
              Escalate EXC-{String(escalateDialog?.id ?? 0).padStart(4, "0")}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>
                Reason <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Textarea
                placeholder="Escalation reason..."
                value={escalateReason}
                onChange={(e) => setEscalateReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEscalateDialog(null);
                setEscalateReason("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={escalateMutation.isPending}
              onClick={() => {
                if (escalateDialog) {
                  escalateMutation.mutate({
                    id: escalateDialog.id,
                    reason: escalateReason || undefined,
                  });
                }
              }}
            >
              {escalateMutation.isPending ? "Escalating..." : "Escalate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Won't Fix Dialog */}
      <Dialog
        open={!!wontFixDialog}
        onOpenChange={(open) => {
          if (!open) {
            setWontFixDialog(null);
            setWontFixReason("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark as Won't Fix</DialogTitle>
            <DialogDescription>
              Close EXC-{String(wontFixDialog?.id ?? 0).padStart(4, "0")} as
              won't fix.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Reason</Label>
              <Textarea
                placeholder="Explain why this exception won't be fixed..."
                value={wontFixReason}
                onChange={(e) => setWontFixReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setWontFixDialog(null);
                setWontFixReason("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="secondary"
              disabled={!wontFixReason || wontFixMutation.isPending}
              onClick={() => {
                if (wontFixDialog) {
                  wontFixMutation.mutate({
                    id: wontFixDialog.id,
                    reason: wontFixReason,
                  });
                }
              }}
            >
              {wontFixMutation.isPending ? "Closing..." : "Won't Fix"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Reassign Dialog */}
      <Dialog
        open={bulkReassignDialog}
        onOpenChange={(open) => {
          if (!open) {
            setBulkReassignDialog(false);
            setBulkUserId("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bulk Reassign</DialogTitle>
            <DialogDescription>
              Reassign {selectedIds.size} exception(s) to a new team member.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>New Assignee User ID</Label>
              <Input
                placeholder="Enter user ID..."
                value={bulkUserId}
                onChange={(e) => setBulkUserId(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setBulkReassignDialog(false);
                setBulkUserId("");
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={!bulkUserId || bulkReassignMutation.isPending}
              onClick={() => {
                bulkReassignMutation.mutate({
                  exception_ids: Array.from(selectedIds),
                  user_id: bulkUserId,
                });
              }}
            >
              {bulkReassignMutation.isPending
                ? "Reassigning..."
                : `Reassign ${selectedIds.size}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Resolve Dialog */}
      <Dialog
        open={bulkResolveDialog}
        onOpenChange={(open) => {
          if (!open) {
            setBulkResolveDialog(false);
            setBulkResolveNotes("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bulk Resolve</DialogTitle>
            <DialogDescription>
              Resolve {selectedIds.size} exception(s) with a shared resolution
              note.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Resolution Notes</Label>
              <Textarea
                placeholder="Shared resolution notes for all selected exceptions..."
                value={bulkResolveNotes}
                onChange={(e) => setBulkResolveNotes(e.target.value)}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setBulkResolveDialog(false);
                setBulkResolveNotes("");
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={!bulkResolveNotes || bulkResolveMutation.isPending}
              onClick={() => {
                bulkResolveMutation.mutate({
                  exception_ids: Array.from(selectedIds),
                  resolution_notes: bulkResolveNotes,
                });
              }}
            >
              {bulkResolveMutation.isPending
                ? "Resolving..."
                : `Resolve ${selectedIds.size}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
