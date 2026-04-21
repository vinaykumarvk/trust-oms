/**
 * Fee Plan List -- TrustFees Pro Phase 5
 *
 * Manages fee plan listing with summary cards, filterable data table,
 * status badges, and row-level lifecycle actions.
 */
import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@ui/components/ui/dropdown-menu";
import { Textarea } from "@ui/components/ui/textarea";
import {
  FileText,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Plus,
  RefreshCw,
  MoreHorizontal,
  Pencil,
  SendHorizontal,
  Eye,
  Pause,
  ArrowRightLeft,
  XCircle,
  ShieldCheck,
} from "lucide-react";

/* ---------- Constants ---------- */
const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200",
  PENDING_APPROVAL: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  ACTIVE: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  EXPIRED: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  SUSPENDED: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  SUPERSEDED: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
};

const STATUS_OPTIONS = ["ALL", "DRAFT", "PENDING_APPROVAL", "ACTIVE", "EXPIRED", "SUSPENDED", "SUPERSEDED"];

const FEE_TYPE_OPTIONS = [
  "ALL", "CUSTODY", "MANAGEMENT", "PERFORMANCE", "SUBSCRIPTION", "REDEMPTION",
  "COMMISSION", "TAX", "TRUST", "ESCROW", "ADMIN", "OTHER",
];

/* ---------- Helpers ---------- */
const fmtDate = (d: string | null) => {
  if (!d) return "--";
  try {
    return new Date(d).toLocaleDateString("en-PH", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return d;
  }
};

const bc = (key: string) => STATUS_COLORS[key] ?? "bg-muted text-foreground";

/* ---------- Sub-components ---------- */
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
            <TableCell key={j}>
              <Skeleton className="h-4 w-16" />
            </TableCell>
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

/* ---------- Types ---------- */
interface FeePlan {
  id: number;
  fee_plan_code: string;
  fee_plan_name: string;
  fee_type: string;
  charge_basis: string;
  jurisdiction_id: number | null;
  plan_status: string;
  effective_date: string;
  expiry_date: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

interface ListResponse {
  data: FeePlan[];
  total: number;
  page: number;
  pageSize: number;
}

/* ========== Main Component ========== */
export default function FeePlanList() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [statusFilter, setStatusFilter] = useState("ALL");
  const [feeTypeFilter, setFeeTypeFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  // Approve/Reject dialog
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [rejectComment, setRejectComment] = useState("");

  // --- Query ---
  const listQ = useQuery<ListResponse>({
    queryKey: ["fee-plans", statusFilter, feeTypeFilter, search, page],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter !== "ALL") params.set("plan_status", statusFilter);
      if (feeTypeFilter !== "ALL") params.set("fee_type", feeTypeFilter);
      if (search.trim()) params.set("search", search.trim());
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      return apiRequest("GET", apiUrl(`/api/v1/fee-plans?${params.toString()}`));
    },
    refetchInterval: 30_000,
  });

  const plans = listQ.data?.data ?? [];
  const total = listQ.data?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  // --- Summary ---
  const summary = useMemo(() => {
    return {
      total,
      active: plans.filter((p) => p.plan_status === "ACTIVE").length,
      pending: plans.filter((p) => p.plan_status === "PENDING_APPROVAL").length,
      suspended: plans.filter((p) => p.plan_status === "SUSPENDED").length,
    };
  }, [plans, total]);

  // --- Mutations ---
  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["fee-plans"] });
  };

  const submitMut = useMutation({
    mutationFn: (id: number) =>
      apiRequest("POST", apiUrl(`/api/v1/fee-plans/${id}/submit`)),
    onSuccess: invalidateAll,
  });

  const approveMut = useMutation({
    mutationFn: (id: number) =>
      apiRequest("POST", apiUrl(`/api/v1/fee-plans/${id}/approve`), {
        approverId: "system-approver",
      }),
    onSuccess: () => {
      invalidateAll();
      setApproveDialogOpen(false);
    },
  });

  const rejectMut = useMutation({
    mutationFn: ({ id, comment }: { id: number; comment: string }) =>
      apiRequest("POST", apiUrl(`/api/v1/fee-plans/${id}/reject`), {
        approverId: "system-approver",
        comment,
      }),
    onSuccess: () => {
      invalidateAll();
      setRejectDialogOpen(false);
      setRejectComment("");
    },
  });

  const suspendMut = useMutation({
    mutationFn: (id: number) =>
      apiRequest("POST", apiUrl(`/api/v1/fee-plans/${id}/suspend`)),
    onSuccess: invalidateAll,
  });

  const supersedeMut = useMutation({
    mutationFn: (id: number) =>
      apiRequest("POST", apiUrl(`/api/v1/fee-plans/${id}/supersede`)),
    onSuccess: invalidateAll,
  });

  const openApproveDialog = (id: number) => {
    setSelectedPlanId(id);
    setApproveDialogOpen(true);
  };

  const openRejectDialog = (id: number) => {
    setSelectedPlanId(id);
    setRejectComment("");
    setRejectDialogOpen(true);
  };

  const jurisdictionLabel = (id: number | null) => {
    if (!id) return "--";
    const map: Record<number, string> = { 1: "PH", 2: "SG", 3: "ID" };
    return map[id] ?? `JUR-${id}`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Fee Plans</h1>
            <p className="text-sm text-muted-foreground">
              Manage fee plan configurations -- pricing, eligibility, schedules, and lifecycle
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => listQ.refetch()}
            disabled={listQ.isFetching}
          >
            <RefreshCw className={`h-4 w-4 ${listQ.isFetching ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" onClick={() => navigate("/operations/fee-plans/new")}>
            <Plus className="mr-1 h-3 w-3" /> New Fee Plan
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard title="Total Plans" value={summary.total} icon={FileText} accent="bg-blue-600" />
        <SummaryCard title="Active" value={summary.active} icon={CheckCircle2} accent="bg-green-600" />
        <SummaryCard title="Pending Approval" value={summary.pending} icon={Clock} accent="bg-amber-500" />
        <SummaryCard title="Suspended" value={summary.suspended} icon={AlertTriangle} accent="bg-orange-500" />
      </div>

      <Separator />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Status</Label>
          <Select
            value={statusFilter}
            onValueChange={(v) => {
              setStatusFilter(v);
              setPage(1);
            }}
          >
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
          <Label className="text-xs text-muted-foreground">Fee Type</Label>
          <Select
            value={feeTypeFilter}
            onValueChange={(v) => {
              setFeeTypeFilter(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FEE_TYPE_OPTIONS.map((ft) => (
                <SelectItem key={ft} value={ft}>
                  {ft === "ALL" ? "All Types" : ft}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Search</Label>
          <Input
            placeholder="Search code or name..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-[220px]"
          />
        </div>
      </div>

      {/* Data Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Fee Plans</CardTitle>
            <span className="text-sm text-muted-foreground">
              {total} record{total !== 1 ? "s" : ""}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Fee Type</TableHead>
                  <TableHead>Charge Basis</TableHead>
                  <TableHead>Jurisdiction</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Effective Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listQ.isLoading ? (
                  <SkeletonRows cols={8} />
                ) : plans.length === 0 ? (
                  <EmptyRow cols={8} msg="No fee plans found" />
                ) : (
                  plans.map((plan) => (
                    <TableRow
                      key={plan.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/operations/fee-plans/${plan.id}`)}
                    >
                      <TableCell className="font-mono text-sm font-medium">
                        {plan.fee_plan_code}
                      </TableCell>
                      <TableCell>{plan.fee_plan_name}</TableCell>
                      <TableCell className="text-sm">{plan.fee_type}</TableCell>
                      <TableCell className="text-sm">{plan.charge_basis}</TableCell>
                      <TableCell className="text-sm">{jurisdictionLabel(plan.jurisdiction_id)}</TableCell>
                      <TableCell>
                        <Badge className={bc(plan.plan_status)}>
                          {plan.plan_status.replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {fmtDate(plan.effective_date)}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                            <DropdownMenuItem onClick={() => navigate(`/operations/fee-plans/${plan.id}`)}>
                              <Eye className="mr-2 h-4 w-4" /> View
                            </DropdownMenuItem>

                            {plan.plan_status === "DRAFT" && (
                              <>
                                <DropdownMenuItem onClick={() => navigate(`/operations/fee-plans/${plan.id}/edit`)}>
                                  <Pencil className="mr-2 h-4 w-4" /> Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => submitMut.mutate(plan.id)}
                                  disabled={submitMut.isPending}
                                >
                                  <SendHorizontal className="mr-2 h-4 w-4" /> Submit for Approval
                                </DropdownMenuItem>
                              </>
                            )}

                            {plan.plan_status === "PENDING_APPROVAL" && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => openApproveDialog(plan.id)}>
                                  <ShieldCheck className="mr-2 h-4 w-4" /> Approve
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => openRejectDialog(plan.id)}
                                  className="text-destructive focus:text-destructive"
                                >
                                  <XCircle className="mr-2 h-4 w-4" /> Reject
                                </DropdownMenuItem>
                              </>
                            )}

                            {plan.plan_status === "ACTIVE" && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => suspendMut.mutate(plan.id)}
                                  disabled={suspendMut.isPending}
                                >
                                  <Pause className="mr-2 h-4 w-4" /> Suspend
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => supersedeMut.mutate(plan.id)}
                                  disabled={supersedeMut.isPending}
                                >
                                  <ArrowRightLeft className="mr-2 h-4 w-4" /> Supersede
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Mutation error display */}
      {(submitMut.error || suspendMut.error || supersedeMut.error) && (
        <Card className="border-destructive">
          <CardContent className="pt-4">
            <p className="text-sm text-destructive">
              {(submitMut.error as any)?.message ||
                (suspendMut.error as any)?.message ||
                (supersedeMut.error as any)?.message}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Approve Dialog */}
      <Dialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Fee Plan</DialogTitle>
            <DialogDescription>
              Are you sure you want to approve this fee plan? This will transition it to ACTIVE status.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => selectedPlanId && approveMut.mutate(selectedPlanId)}
              disabled={approveMut.isPending}
            >
              {approveMut.isPending ? "Approving..." : "Approve"}
            </Button>
          </DialogFooter>
          {approveMut.error && (
            <div className="rounded-md border border-destructive p-3 mt-2">
              <p className="text-sm text-destructive">
                {(approveMut.error as any)?.message ?? "Approval failed"}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Fee Plan</DialogTitle>
            <DialogDescription>
              Provide a reason for rejecting this fee plan. It will be returned to DRAFT status.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Rejection Comment *</Label>
            <Textarea
              value={rejectComment}
              onChange={(e) => setRejectComment(e.target.value)}
              placeholder="Reason for rejection..."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                selectedPlanId &&
                rejectMut.mutate({ id: selectedPlanId, comment: rejectComment })
              }
              disabled={rejectMut.isPending || !rejectComment.trim()}
            >
              {rejectMut.isPending ? "Rejecting..." : "Reject"}
            </Button>
          </DialogFooter>
          {rejectMut.error && (
            <div className="rounded-md border border-destructive p-3 mt-2">
              <p className="text-sm text-destructive">
                {(rejectMut.error as any)?.message ?? "Rejection failed"}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
