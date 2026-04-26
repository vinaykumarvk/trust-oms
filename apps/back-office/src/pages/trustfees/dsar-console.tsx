/**
 * DSAR Console -- TrustFees Pro Phase 5 (GAP-A15/B05/B06/B07)
 *
 * Data Subject Access Request management console:
 *   - Queue view with deadline countdown badges (RED <2 days, YELLOW <5 days)
 *   - Data table: requestor, request type, status, submitted, deadline, assigned
 *   - Detail dialog with PII inventory display
 *   - Actions: Process, Approve, Reject
 */
import { useState, useMemo, useEffect } from "react";
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@ui/components/ui/sheet";
import {
  UserSearch,
  RefreshCw,
  Clock,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Play,
  Eye,
  ShieldCheck,
  FileText,
  Users,
} from "lucide-react";

/* ---------- Constants ---------- */

const STATUS_COLORS: Record<string, string> = {
  NEW: "bg-blue-100 text-blue-800",
  IN_PROGRESS: "bg-amber-100 text-amber-800",
  PENDING_APPROVAL: "bg-purple-100 text-purple-800",
  APPROVED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
  COMPLETED: "bg-green-200 text-green-900",
};

const TYPE_COLORS: Record<string, string> = {
  ACCESS: "bg-blue-100 text-blue-800",
  ERASURE: "bg-red-100 text-red-800",
  RECTIFICATION: "bg-amber-100 text-amber-800",
  PORTABILITY: "bg-purple-100 text-purple-800",
  RESTRICTION: "bg-gray-100 text-gray-800",
};

const STATUS_OPTIONS = [
  "ALL",
  "NEW",
  "IN_PROGRESS",
  "PENDING_APPROVAL",
  "APPROVED",
  "REJECTED",
  "COMPLETED",
];

/* ---------- Helpers ---------- */

const fmtDate = (d: string | null | undefined) => {
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
 * Compute deadline countdown.
 * Returns { text, badgeClass } with RED if <2 days, YELLOW if <5 days.
 */
function getDeadlineBadge(
  deadline: string | null,
  status: string,
): { text: string; badgeClass: string } {
  if (!deadline)
    return { text: "--", badgeClass: "bg-muted text-muted-foreground" };

  if (status === "COMPLETED" || status === "APPROVED" || status === "REJECTED") {
    return { text: "N/A", badgeClass: "bg-muted text-muted-foreground" };
  }

  const now = Date.now();
  const due = new Date(deadline).getTime();
  const diffMs = due - now;
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffMs <= 0) {
    return {
      text: `OVERDUE (${Math.abs(Math.round(diffDays))}d)`,
      badgeClass: "bg-red-600 text-white",
    };
  }

  if (diffDays < 2) {
    return {
      text: `${Math.round(diffDays * 24)}h left`,
      badgeClass: "bg-red-100 text-red-800",
    };
  }

  if (diffDays < 5) {
    return {
      text: `${Math.round(diffDays)}d left`,
      badgeClass: "bg-yellow-100 text-yellow-800",
    };
  }

  return {
    text: `${Math.round(diffDays)}d left`,
    badgeClass: "bg-green-100 text-green-800",
  };
}

/* ---------- Component ---------- */

export default function DsarConsole() {
  const queryClient = useQueryClient();

  // Filters
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [search, setSearch] = useState("");

  // Detail drawer
  const [selectedReq, setSelectedReq] = useState<any>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Action dialogs
  const [processDialog, setProcessDialog] = useState<any>(null);
  const [approveDialog, setApproveDialog] = useState<any>(null);
  const [rejectDialog, setRejectDialog] = useState<any>(null);
  const [rejectReason, setRejectReason] = useState("");

  // Force re-render for countdown timer
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(interval);
  }, []);

  // Build query params
  const params = new URLSearchParams();
  if (statusFilter !== "ALL") params.set("status", statusFilter);
  if (search) params.set("search", search);
  params.set("pageSize", "100");

  // Fetch DSAR requests
  const { data: dsarData, isLoading } = useQuery({
    queryKey: ["dsar-requests", statusFilter, search],
    queryFn: () =>
      apiRequest("GET", apiUrl(`/api/v1/dsar?${params.toString()}`)),
    refetchInterval: 15_000,
  });

  const requests = dsarData?.data ?? [];

  // Summary
  const summary = useMemo(() => {
    const total = requests.length;
    const urgent = requests.filter((r: any) => {
      const dl = getDeadlineBadge(r.response_deadline, r.status);
      return (
        dl.badgeClass.includes("red") && r.status !== "COMPLETED" && r.status !== "REJECTED"
      );
    }).length;
    const pending = requests.filter(
      (r: any) => r.status === "NEW" || r.status === "IN_PROGRESS",
    ).length;
    return { total, urgent, pending };
  }, [requests]);

  // Mutations
  const processMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("POST", apiUrl(`/api/v1/dsar/${id}/process`), {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dsar-requests"] });
      setProcessDialog(null);
    },
  });

  const approveMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("POST", apiUrl(`/api/v1/dsar/${id}/approve`), {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dsar-requests"] });
      setApproveDialog(null);
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (data: { id: number; reason: string }) =>
      apiRequest("POST", apiUrl(`/api/v1/dsar/${data.id}/reject`), {
        reason: data.reason,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dsar-requests"] });
      setRejectDialog(null);
      setRejectReason("");
    },
  });

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">DSAR Console</h1>
          <p className="text-sm text-muted-foreground">
            TrustFees Pro -- manage Data Subject Access Requests with deadline tracking
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            queryClient.invalidateQueries({ queryKey: ["dsar-requests"] })
          }
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
            <UserSearch className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.total}</div>
            <p className="text-xs text-muted-foreground">All DSAR requests</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Urgent</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {summary.urgent}
            </div>
            <p className="text-xs text-muted-foreground">
              Deadline within 2 days or overdue
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.pending}</div>
            <p className="text-xs text-muted-foreground">
              New or in progress
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <Label className="text-xs">Status</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
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
          <Label className="text-xs">Search</Label>
          <Input
            placeholder="Requestor name, ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-[250px]"
          />
        </div>
      </div>

      <Separator />

      {/* Data Table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Requestor</TableHead>
                <TableHead>Request Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Deadline</TableHead>
                <TableHead>Assigned To</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center text-muted-foreground py-8"
                  >
                    No DSAR requests found
                  </TableCell>
                </TableRow>
              ) : (
                requests.map((req: any) => {
                  const dl = getDeadlineBadge(
                    req.response_deadline,
                    req.status,
                  );
                  return (
                    <TableRow
                      key={req.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => {
                        setSelectedReq(req);
                        setDrawerOpen(true);
                      }}
                    >
                      <TableCell className="font-medium text-sm">
                        {req.requestor_name}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={`text-xs ${
                            TYPE_COLORS[req.request_type] ?? "bg-muted text-foreground"
                          }`}
                        >
                          {req.request_type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={`text-xs ${
                            STATUS_COLORS[req.status] ?? "bg-muted text-foreground"
                          }`}
                        >
                          {req.status?.replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        {fmtDate(req.submitted_at)}
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-xs ${dl.badgeClass}`}>
                          {dl.text}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        {req.assigned_to ?? "--"}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          {req.status === "NEW" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() => setProcessDialog(req)}
                            >
                              <Play className="mr-1 h-3 w-3" />
                              Process
                            </Button>
                          )}
                          {req.status === "PENDING_APPROVAL" && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={() => setApproveDialog(req)}
                              >
                                <CheckCircle className="mr-1 h-3 w-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs text-red-600 border-red-300"
                                onClick={() => setRejectDialog(req)}
                              >
                                <XCircle className="mr-1 h-3 w-3" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        Showing {requests.length} request(s) | Auto-refresh every 15 seconds
      </div>

      {/* Detail Drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="w-[450px] sm:w-[500px] overflow-y-auto">
          {selectedReq && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <span>DSAR-{String(selectedReq.id).padStart(4, "0")}</span>
                  <Badge
                    className={`text-xs ${
                      STATUS_COLORS[selectedReq.status] ?? ""
                    }`}
                  >
                    {selectedReq.status?.replace(/_/g, " ")}
                  </Badge>
                </SheetTitle>
                <SheetDescription>
                  {selectedReq.request_type} request by{" "}
                  {selectedReq.requestor_name}
                </SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-4">
                {/* Request Details */}
                <div className="rounded-md bg-muted/50 p-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Requestor:</span>
                    <span>{selectedReq.requestor_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Type:</span>
                    <Badge
                      className={`text-xs ${
                        TYPE_COLORS[selectedReq.request_type] ?? ""
                      }`}
                    >
                      {selectedReq.request_type}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Submitted:</span>
                    <span className="text-xs">
                      {fmtDate(selectedReq.submitted_at)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Deadline:</span>
                    <Badge
                      className={`text-xs ${
                        getDeadlineBadge(
                          selectedReq.response_deadline,
                          selectedReq.status,
                        ).badgeClass
                      }`}
                    >
                      {fmtDate(selectedReq.response_deadline)}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Assigned To:</span>
                    <span>{selectedReq.assigned_to ?? "--"}</span>
                  </div>
                </div>

                {/* PII Inventory */}
                {selectedReq.pii_inventory && (
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1">
                      <ShieldCheck className="h-3 w-3" /> PII Inventory
                    </Label>
                    <div className="rounded-md border p-3 bg-muted/20">
                      {Array.isArray(selectedReq.pii_inventory) ? (
                        <div className="space-y-1">
                          {selectedReq.pii_inventory.map(
                            (item: any, i: number) => (
                              <div
                                key={i}
                                className="flex items-center justify-between text-sm"
                              >
                                <span className="text-muted-foreground">
                                  {item.field ?? item.category ?? `Item ${i + 1}`}
                                </span>
                                <Badge variant="outline" className="text-xs">
                                  {item.source ?? item.type ?? "PII"}
                                </Badge>
                              </div>
                            ),
                          )}
                        </div>
                      ) : (
                        <pre className="text-xs whitespace-pre-wrap">
                          {typeof selectedReq.pii_inventory === "object"
                            ? JSON.stringify(
                                selectedReq.pii_inventory,
                                null,
                                2,
                              )
                            : selectedReq.pii_inventory}
                        </pre>
                      )}
                    </div>
                  </div>
                )}

                {/* Notes */}
                {selectedReq.notes && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      Notes
                    </Label>
                    <div className="rounded-md border p-3 text-sm whitespace-pre-wrap">
                      {selectedReq.notes}
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                {selectedReq.status !== "COMPLETED" &&
                  selectedReq.status !== "REJECTED" && (
                    <div className="flex flex-wrap gap-2 pt-2">
                      {selectedReq.status === "NEW" && (
                        <Button
                          size="sm"
                          onClick={() => setProcessDialog(selectedReq)}
                        >
                          <Play className="mr-1 h-3 w-3" />
                          Process
                        </Button>
                      )}
                      {selectedReq.status === "PENDING_APPROVAL" && (
                        <>
                          <Button
                            size="sm"
                            onClick={() => setApproveDialog(selectedReq)}
                          >
                            <CheckCircle className="mr-1 h-3 w-3" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => setRejectDialog(selectedReq)}
                          >
                            <XCircle className="mr-1 h-3 w-3" />
                            Reject
                          </Button>
                        </>
                      )}
                    </div>
                  )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Process Dialog */}
      <Dialog
        open={!!processDialog}
        onOpenChange={(open) => {
          if (!open) setProcessDialog(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Process DSAR Request</DialogTitle>
            <DialogDescription>
              Start processing DSAR-
              {String(processDialog?.id ?? 0).padStart(4, "0")} from{" "}
              {processDialog?.requestor_name}. This will move it to IN_PROGRESS
              status.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProcessDialog(null)}>
              Cancel
            </Button>
            <Button
              disabled={processMutation.isPending}
              onClick={() => {
                if (processDialog) {
                  processMutation.mutate(processDialog.id);
                }
              }}
            >
              {processMutation.isPending ? "Processing..." : "Start Processing"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve Dialog */}
      <Dialog
        open={!!approveDialog}
        onOpenChange={(open) => {
          if (!open) setApproveDialog(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve DSAR Request</DialogTitle>
            <DialogDescription>
              Approve and complete DSAR-
              {String(approveDialog?.id ?? 0).padStart(4, "0")}. The data
              subject response will be finalized.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveDialog(null)}>
              Cancel
            </Button>
            <Button
              disabled={approveMutation.isPending}
              onClick={() => {
                if (approveDialog) {
                  approveMutation.mutate(approveDialog.id);
                }
              }}
            >
              {approveMutation.isPending ? "Approving..." : "Approve"}
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
            setRejectReason("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject DSAR Request</DialogTitle>
            <DialogDescription>
              Provide a reason for rejecting DSAR-
              {String(rejectDialog?.id ?? 0).padStart(4, "0")}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Rejection Reason</Label>
              <Textarea
                placeholder="Reason for rejection..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRejectDialog(null);
                setRejectReason("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!rejectReason.trim() || rejectMutation.isPending}
              onClick={() => {
                if (rejectDialog) {
                  rejectMutation.mutate({
                    id: rejectDialog.id,
                    reason: rejectReason,
                  });
                }
              }}
            >
              {rejectMutation.isPending ? "Rejecting..." : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
