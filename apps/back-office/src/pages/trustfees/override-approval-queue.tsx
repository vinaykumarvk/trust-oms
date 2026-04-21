/**
 * Override Approval Queue -- TrustFees Pro Phase 8
 *
 * Full UI page for managing fee override requests:
 *   - Summary cards (pending, auto-approved today, rejected today, avg delta %)
 *   - Data table with override records and status badges
 *   - Approve/Reject actions with SoD confirmation dialogs
 *   - Filters: stage, status, date range
 *   - Threshold visualization per row
 *   - 30-second auto-refresh, dark mode support
 */
import { useState, useEffect } from "react";
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
  ShieldCheck,
  Clock,
  XCircle,
  TrendingUp,
  CheckCircle,
  X,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";

/* ---------- Constants ---------- */

const STATUS_COLORS: Record<string, string> = {
  AUTO_APPROVED: "bg-green-100 text-green-800",
  PENDING: "bg-amber-100 text-amber-800",
  APPROVED: "bg-blue-100 text-blue-800",
  REJECTED: "bg-red-100 text-red-800",
};

const STAGE_OPTIONS = ["ALL", "ORDER_CAPTURE", "ACCRUAL", "INVOICE", "PAYMENT"];
const STATUS_OPTIONS = ["ALL", "PENDING", "AUTO_APPROVED", "APPROVED", "REJECTED"];

/* ---------- Helpers ---------- */

const fmtCurrency = (amt: string | number | null, currency = "PHP") => {
  if (amt === null || amt === undefined) return "--";
  const n = typeof amt === "string" ? parseFloat(amt) : amt;
  if (isNaN(n)) return "--";
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(n);
};

const fmtPct = (pct: string | number | null) => {
  if (pct === null || pct === undefined) return "--";
  const n = typeof pct === "string" ? parseFloat(pct) : pct;
  if (isNaN(n)) return "--";
  return `${n.toFixed(2)}%`;
};

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

/* ---------- Component ---------- */

export default function OverrideApprovalQueue() {
  const queryClient = useQueryClient();

  // Filters
  const [stageFilter, setStageFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");

  // Dialogs
  const [approveDialog, setApproveDialog] = useState<any>(null);
  const [rejectDialog, setRejectDialog] = useState<any>(null);
  const [rejectComment, setRejectComment] = useState("");
  const [approverId, setApproverId] = useState("");

  // Build query params
  const params = new URLSearchParams();
  if (stageFilter !== "ALL") params.set("override_stage", stageFilter);
  if (statusFilter !== "ALL") params.set("override_status", statusFilter);
  if (dateFrom) params.set("date_from", dateFrom);
  if (dateTo) params.set("date_to", dateTo);
  if (search) params.set("search", search);

  // Fetch overrides
  const { data: overridesData, isLoading } = useQuery({
    queryKey: ["fee-overrides", stageFilter, statusFilter, dateFrom, dateTo, search],
    queryFn: () =>
      apiRequest("GET", apiUrl(`/api/v1/fee-overrides?${params.toString()}`)),
    refetchInterval: 30_000,
  });

  // Fetch pending count for summary
  const { data: pendingData } = useQuery({
    queryKey: ["fee-overrides-pending"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/fee-overrides/pending")),
    refetchInterval: 30_000,
  });

  const overrides = overridesData?.data ?? [];
  const pendingCount = pendingData?.total ?? 0;

  // Compute summary stats
  const today = new Date().toISOString().split("T")[0];
  const todayOverrides = overrides.filter(
    (o: any) => o.created_at?.startsWith(today),
  );
  const autoApprovedToday = todayOverrides.filter(
    (o: any) => o.override_status === "AUTO_APPROVED",
  ).length;
  const rejectedToday = todayOverrides.filter(
    (o: any) => o.override_status === "REJECTED",
  ).length;
  const avgDelta =
    overrides.length > 0
      ? overrides.reduce(
          (sum: number, o: any) => sum + parseFloat(o.delta_pct ?? "0"),
          0,
        ) / overrides.length
      : 0;

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: (data: { id: number; approverId: string }) =>
      apiRequest("POST", apiUrl(`/api/v1/fee-overrides/${data.id}/approve`), {
        approverId: data.approverId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fee-overrides"] });
      queryClient.invalidateQueries({ queryKey: ["fee-overrides-pending"] });
      setApproveDialog(null);
      setApproverId("");
    },
  });

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: (data: { id: number; approverId: string; comment: string }) =>
      apiRequest("POST", apiUrl(`/api/v1/fee-overrides/${data.id}/reject`), {
        approverId: data.approverId,
        comment: data.comment,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fee-overrides"] });
      queryClient.invalidateQueries({ queryKey: ["fee-overrides-pending"] });
      setRejectDialog(null);
      setRejectComment("");
      setApproverId("");
    },
  });

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Override Approval Queue
          </h1>
          <p className="text-sm text-muted-foreground">
            TrustFees Pro -- review and approve fee override requests
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            queryClient.invalidateQueries({ queryKey: ["fee-overrides"] });
            queryClient.invalidateQueries({ queryKey: ["fee-overrides-pending"] });
          }}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Overrides</CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingCount}</div>
            <p className="text-xs text-muted-foreground">Awaiting approval</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Auto-approved Today</CardTitle>
            <ShieldCheck className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{autoApprovedToday}</div>
            <p className="text-xs text-muted-foreground">Within threshold range</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Rejected Today</CardTitle>
            <XCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{rejectedToday}</div>
            <p className="text-xs text-muted-foreground">Original amounts retained</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average Delta %</CardTitle>
            <TrendingUp className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmtPct(avgDelta)}</div>
            <p className="text-xs text-muted-foreground">Across visible overrides</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <Label className="text-xs">Stage</Label>
          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STAGE_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {s === "ALL" ? "All Stages" : s.replace(/_/g, " ")}
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
          <Label className="text-xs">From Date</Label>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-[160px]"
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs">To Date</Label>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-[160px]"
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Search</Label>
          <Input
            placeholder="Reason, user..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-[200px]"
          />
        </div>
      </div>

      <Separator />

      {/* Data Table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="">
                <TableHead>ID</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Customer / Accrual</TableHead>
                <TableHead className="text-right">Original</TableHead>
                <TableHead className="text-right">Overridden</TableHead>
                <TableHead className="text-right">Delta %</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Requested By</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {overrides.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                    No overrides found
                  </TableCell>
                </TableRow>
              ) : (
                overrides.map((o: any) => {
                  const deltaPct = parseFloat(o.delta_pct ?? "0");
                  const isWithinThreshold = deltaPct <= 0.4; // rough default; real threshold per plan
                  return (
                    <TableRow key={o.id} className="">
                      <TableCell className="font-mono text-xs">
                        OVR-{String(o.id).padStart(4, "0")}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {o.stage?.replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        {o.accrual_id
                          ? `Accrual #${o.accrual_id}`
                          : o.invoice_id
                          ? `Invoice #${o.invoice_id}`
                          : "--"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {fmtCurrency(o.original_amount)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {fmtCurrency(o.overridden_amount)}
                      </TableCell>
                      <TableCell className="text-right">
                        <span
                          className={`font-mono text-sm font-medium ${
                            isWithinThreshold
                              ? "text-green-600"
                              : "text-red-600"
                          }`}
                        >
                          {fmtPct(deltaPct)}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs max-w-[120px] truncate">
                        {o.reason_code}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={`text-xs ${
                            STATUS_COLORS[o.override_status] ?? ""
                          }`}
                        >
                          {o.override_status?.replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{o.requested_by ?? "--"}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {fmtDate(o.created_at)}
                      </TableCell>
                      <TableCell>
                        {o.override_status === "PENDING" && (
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="default"
                              className="h-7 text-xs"
                              onClick={() => setApproveDialog(o)}
                            >
                              <CheckCircle className="mr-1 h-3 w-3" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              className="h-7 text-xs"
                              onClick={() => setRejectDialog(o)}
                            >
                              <X className="mr-1 h-3 w-3" />
                              Reject
                            </Button>
                          </div>
                        )}
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
        Showing {overrides.length} of {overridesData?.total ?? 0} overrides
        {" "}|{" "}Auto-refresh every 30 seconds
      </div>

      {/* Approve Dialog */}
      <Dialog
        open={!!approveDialog}
        onOpenChange={(open) => {
          if (!open) {
            setApproveDialog(null);
            setApproverId("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Override</DialogTitle>
            <DialogDescription>
              Confirm approval of override OVR-
              {String(approveDialog?.id ?? 0).padStart(4, "0")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md bg-muted/50 p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Original Amount:</span>
                <span className="font-mono">
                  {fmtCurrency(approveDialog?.original_amount)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Overridden Amount:</span>
                <span className="font-mono font-medium">
                  {fmtCurrency(approveDialog?.overridden_amount)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Delta:</span>
                <span className="font-mono">
                  {fmtPct(approveDialog?.delta_pct)}
                </span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Reason:</span>
                <span>{approveDialog?.reason_code}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                {approveDialog?.reason_notes}
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <span className="text-amber-700">
                SoD Check: Approver must differ from requester (
                {approveDialog?.requested_by})
              </span>
            </div>

            <div className="space-y-1">
              <Label>Approver ID</Label>
              <Input
                placeholder="Enter your user ID..."
                value={approverId}
                onChange={(e) => setApproverId(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setApproveDialog(null);
                setApproverId("");
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={
                !approverId ||
                approveMutation.isPending ||
                approverId === approveDialog?.requested_by
              }
              onClick={() => {
                if (approveDialog) {
                  approveMutation.mutate({
                    id: approveDialog.id,
                    approverId,
                  });
                }
              }}
            >
              {approveMutation.isPending ? "Approving..." : "Confirm Approve"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog
        open={!!rejectDialog}
        onOpenChange={(open) => {
          if (!open) {
            setRejectDialog(null);
            setRejectComment("");
            setApproverId("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Override</DialogTitle>
            <DialogDescription>
              Reject override OVR-
              {String(rejectDialog?.id ?? 0).padStart(4, "0")} -- original
              amount will be retained.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md bg-muted/50 p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Original Amount:</span>
                <span className="font-mono">
                  {fmtCurrency(rejectDialog?.original_amount)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Requested Override:</span>
                <span className="font-mono line-through text-red-500">
                  {fmtCurrency(rejectDialog?.overridden_amount)}
                </span>
              </div>
            </div>

            <div className="space-y-1">
              <Label>Approver ID</Label>
              <Input
                placeholder="Enter your user ID..."
                value={approverId}
                onChange={(e) => setApproverId(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label>Rejection Reason</Label>
              <Textarea
                placeholder="Explain why this override is rejected..."
                value={rejectComment}
                onChange={(e) => setRejectComment(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRejectDialog(null);
                setRejectComment("");
                setApproverId("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={
                !approverId ||
                !rejectComment ||
                rejectMutation.isPending
              }
              onClick={() => {
                if (rejectDialog) {
                  rejectMutation.mutate({
                    id: rejectDialog.id,
                    approverId,
                    comment: rejectComment,
                  });
                }
              }}
            >
              {rejectMutation.isPending ? "Rejecting..." : "Confirm Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
