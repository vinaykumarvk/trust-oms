/**
 * Handover Authorization Queue -- Checker Authorization Page
 *
 * Manages the Checker authorization workflow for the Handover & Assignment
 * Management (HAM) module. Supports single and batch authorize/reject
 * operations with optimistic-concurrency version checks, detail drill-down,
 * scrutiny checklist, and AUM impact analysis.
 */

import { useState, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@ui/components/ui/card";
import { Button } from "@ui/components/ui/button";
import { Input } from "@ui/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ui/components/ui/table";
import { Badge } from "@ui/components/ui/badge";
import { Checkbox } from "@ui/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ui/components/ui/select";
import { Textarea } from "@ui/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@ui/components/ui/dialog";
import { toast } from "sonner";
import { SkeletonRows } from '@/components/ui/skeleton-rows';

/* ---------- Auth helpers ---------- */

function getToken(): string {
  try {
    const stored = localStorage.getItem('trustoms-user');
    if (stored) {
      const parsed = JSON.parse(stored);
      return parsed.token || '';
    }
  } catch { /* ignored */ }
  return '';
}

/* ---------- API base ---------- */

const API_BASE = "/api/v1/ham";

/* ---------- Types ---------- */

interface HandoverItem {
  id: number;
  entity_type: string;
  entity_id: string;
  entity_name: string;
  aum: number;
  currency: string;
}

interface ScrutinyCheck {
  id: string;
  label: string;
  passed: boolean;
  details: string | null;
}

interface HandoverRequest {
  id: number;
  handover_number: string;
  entity_type: string;
  item_count: number;
  from_rm_id: string;
  from_rm_name: string;
  to_rm_id: string;
  to_rm_name: string;
  requested_date: string;
  status: string;
  version: number;
  reason: string | null;
  notes: string | null;
  items: HandoverItem[];
  scrutiny_checklist: ScrutinyCheck[];
  total_aum_impact: number;
  aum_currency: string;
}

interface PendingListResponse {
  data: HandoverRequest[];
  total: number;
  page: number;
  pageSize: number;
}

interface RequestDetailResponse extends HandoverRequest {}

interface BatchResult {
  succeeded: number;
  failed: number;
  errors: Array<{ id: number; error: string }>;
}

/* ---------- Constants ---------- */

const ENTITY_TYPE_OPTIONS = [
  { value: "ALL", label: "All Types" },
  { value: "Lead", label: "Lead" },
  { value: "Prospect", label: "Prospect" },
  { value: "Client", label: "Client" },
] as const;

const STATUS_COLORS: Record<string, string> = {
  PENDING_AUTHORIZATION:
    "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  AUTHORIZED:
    "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  REJECTED: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  PENDING:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
};

/* ---------- Helpers ---------- */

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  try {
    return new Date(dateStr).toLocaleDateString("en-PH", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function formatCurrency(amount: number | null | undefined, currency = "PHP"): string {
  if (amount === null || amount === undefined) return "-";
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${getToken()}`,
    "Content-Type": "application/json",
  };
  const res = await fetch(url, { headers, ...options });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error ||
        `Request failed with status ${res.status}`
    );
  }
  return res.json() as Promise<T>;
}

/* ---------- Component ---------- */

export default function HandoverAuthorizationPage() {
  const queryClient = useQueryClient();

  // Filter state
  const [entityTypeFilter, setEntityTypeFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Pagination state
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Detail dialog state
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState<number | null>(
    null
  );

  // Reject reason state (within detail dialog)
  const [showRejectOverlay, setShowRejectOverlay] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  // Batch confirmation dialog state
  const [batchAuthorizeDialogOpen, setBatchAuthorizeDialogOpen] =
    useState(false);
  const [batchRejectDialogOpen, setBatchRejectDialogOpen] = useState(false);
  const [batchConfirmInput, setBatchConfirmInput] = useState("");
  const [batchRejectReason, setBatchRejectReason] = useState("");

  // ---- Queries ----

  const pendingQuery = useQuery<PendingListResponse>({
    queryKey: [
      "ham-pending",
      page,
      pageSize,
      entityTypeFilter,
      searchQuery,
    ],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (entityTypeFilter !== "ALL") {
        params.set("entity_type", entityTypeFilter);
      }
      if (searchQuery.trim()) {
        params.set("search", searchQuery.trim());
      }
      return apiFetch<PendingListResponse>(
        `${API_BASE}/pending?${params.toString()}`
      );
    },
    refetchInterval: 30_000,
  });

  const detailQuery = useQuery<RequestDetailResponse>({
    queryKey: ["ham-request-detail", selectedRequestId],
    queryFn: () =>
      apiFetch<RequestDetailResponse>(
        `${API_BASE}/request/${selectedRequestId}`
      ),
    enabled: selectedRequestId !== null && detailDialogOpen,
  });

  // ---- Derived data ----

  const pendingList = pendingQuery.data?.data ?? [];
  const totalRecords = pendingQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
  const requestDetail = detailQuery.data ?? null;

  // Track versions for selected items (used for batch operations)
  const selectedVersions = useMemo(() => {
    const map: Record<number, number> = {};
    for (const item of pendingList) {
      if (selectedIds.has(item.id)) {
        map[item.id] = item.version;
      }
    }
    return map;
  }, [pendingList, selectedIds]);

  // ---- Invalidation helper ----

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["ham-pending"] });
    queryClient.invalidateQueries({ queryKey: ["ham-request-detail"] });
  }, [queryClient]);

  // ---- Mutations ----

  const authorizeMutation = useMutation({
    mutationFn: ({
      id,
      version,
    }: {
      id: number;
      version: number;
    }) =>
      apiFetch<{ success: boolean }>(
        `${API_BASE}/authorize/${id}`,
        {
          method: "POST",
          body: JSON.stringify({ version }),
        }
      ),
    onSuccess: () => {
      toast.success("Request authorized successfully");
      invalidateAll();
      setDetailDialogOpen(false);
      setSelectedRequestId(null);
    },
    onError: (err: Error) => {
      toast.error(`Authorization failed: ${err.message}`);
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({
      id,
      version,
      reason,
    }: {
      id: number;
      version: number;
      reason: string;
    }) =>
      apiFetch<{ success: boolean }>(
        `${API_BASE}/reject/${id}`,
        {
          method: "POST",
          body: JSON.stringify({ version, reason }),
        }
      ),
    onSuccess: () => {
      toast.success("Request rejected");
      invalidateAll();
      setDetailDialogOpen(false);
      setSelectedRequestId(null);
      setShowRejectOverlay(false);
      setRejectReason("");
    },
    onError: (err: Error) => {
      toast.error(`Rejection failed: ${err.message}`);
    },
  });

  const batchAuthorizeMutation = useMutation({
    mutationFn: (payload: {
      request_ids: number[];
      versions: Record<number, number>;
    }) =>
      apiFetch<BatchResult>(`${API_BASE}/batch-authorize`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: (data) => {
      toast.success(
        `Batch authorize complete: ${data.succeeded} succeeded, ${data.failed} failed`
      );
      if (data.errors.length > 0) {
        toast.error(
          `Failed IDs: ${data.errors.map((e) => e.id).join(", ")}`
        );
      }
      invalidateAll();
      setSelectedIds(new Set());
      setBatchAuthorizeDialogOpen(false);
      setBatchConfirmInput("");
    },
    onError: (err: Error) => {
      toast.error(`Batch authorize failed: ${err.message}`);
    },
  });

  const batchRejectMutation = useMutation({
    mutationFn: (payload: {
      request_ids: number[];
      versions: Record<number, number>;
      reason: string;
    }) =>
      apiFetch<BatchResult>(`${API_BASE}/batch-reject`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: (data) => {
      toast.success(
        `Batch reject complete: ${data.succeeded} succeeded, ${data.failed} failed`
      );
      if (data.errors.length > 0) {
        toast.error(
          `Failed IDs: ${data.errors.map((e) => e.id).join(", ")}`
        );
      }
      invalidateAll();
      setSelectedIds(new Set());
      setBatchRejectDialogOpen(false);
      setBatchConfirmInput("");
      setBatchRejectReason("");
    },
    onError: (err: Error) => {
      toast.error(`Batch reject failed: ${err.message}`);
    },
  });

  const isMutating =
    authorizeMutation.isPending ||
    rejectMutation.isPending ||
    batchAuthorizeMutation.isPending ||
    batchRejectMutation.isPending;

  // ---- Selection handlers ----

  const handleToggleRow = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleToggleAll = useCallback(() => {
    if (selectedIds.size === pendingList.length && pendingList.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pendingList.map((r) => r.id)));
    }
  }, [pendingList, selectedIds.size]);

  // ---- Row click handler ----

  const handleRowClick = useCallback((id: number) => {
    setSelectedRequestId(id);
    setDetailDialogOpen(true);
    setShowRejectOverlay(false);
    setRejectReason("");
  }, []);

  // ---- Authorize / Reject handlers (single) ----

  const handleAuthorize = useCallback(() => {
    if (!requestDetail) return;
    authorizeMutation.mutate({
      id: requestDetail.id,
      version: requestDetail.version,
    });
  }, [requestDetail, authorizeMutation]);

  const handleReject = useCallback(() => {
    if (!requestDetail || !rejectReason.trim()) return;
    rejectMutation.mutate({
      id: requestDetail.id,
      version: requestDetail.version,
      reason: rejectReason.trim(),
    });
  }, [requestDetail, rejectReason, rejectMutation]);

  // ---- Batch handlers ----

  const handleBatchAuthorize = useCallback(() => {
    const ids = Array.from(selectedIds);
    batchAuthorizeMutation.mutate({
      request_ids: ids,
      versions: selectedVersions,
    });
  }, [selectedIds, selectedVersions, batchAuthorizeMutation]);

  const handleBatchReject = useCallback(() => {
    if (!batchRejectReason.trim()) return;
    const ids = Array.from(selectedIds);
    batchRejectMutation.mutate({
      request_ids: ids,
      versions: selectedVersions,
      reason: batchRejectReason.trim(),
    });
  }, [
    selectedIds,
    selectedVersions,
    batchRejectReason,
    batchRejectMutation,
  ]);

  // ---- Pagination handlers ----

  const handlePrevPage = useCallback(() => {
    setPage((p) => Math.max(1, p - 1));
    setSelectedIds(new Set());
  }, []);

  const handleNextPage = useCallback(() => {
    setPage((p) => Math.min(totalPages, p + 1));
    setSelectedIds(new Set());
  }, [totalPages]);

  // ---- Render ----

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Handover Authorization Queue
        </h1>
        <p className="text-sm text-muted-foreground">
          Review and authorize pending handover and assignment requests
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Pending
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pendingQuery.isLoading ? (
              <div className="h-8 w-16 animate-pulse rounded bg-muted" />
            ) : (
              <p className="text-2xl font-bold">{totalRecords}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Selected
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{selectedIds.size}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Page
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {page} / {totalPages}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Filter
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {entityTypeFilter === "ALL" ? "All" : entityTypeFilter}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            Entity Type
          </label>
          <Select
            value={entityTypeFilter}
            onValueChange={(v: string) => {
              setEntityTypeFilter(v);
              setPage(1);
              setSelectedIds(new Set());
            }}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              {ENTITY_TYPE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            Search
          </label>
          <Input
            placeholder="Handover #, RM name..."
            value={searchQuery}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              setSearchQuery(e.target.value);
              setPage(1);
              setSelectedIds(new Set());
            }}
            className="w-[240px]"
          />
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            invalidateAll();
            toast.info("Refreshed");
          }}
        >
          Refresh
        </Button>
      </div>

      {/* Batch Action Bar */}
      {selectedIds.size >= 2 && (
        <div className="flex items-center gap-3 rounded-md border bg-muted/50 px-4 py-3">
          <span className="text-sm font-medium">
            {selectedIds.size} request{selectedIds.size !== 1 ? "s" : ""}{" "}
            selected
          </span>
          <Button
            size="sm"
            onClick={() => {
              setBatchConfirmInput("");
              setBatchAuthorizeDialogOpen(true);
            }}
            disabled={isMutating}
          >
            Batch Authorize
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => {
              setBatchConfirmInput("");
              setBatchRejectReason("");
              setBatchRejectDialogOpen(true);
            }}
            disabled={isMutating}
          >
            Batch Reject
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSelectedIds(new Set())}
          >
            Clear Selection
          </Button>
        </div>
      )}

      {/* Pending Requests Table */}
      {pendingQuery.isError ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-destructive">
            <p className="font-medium">Failed to load pending requests</p>
            <p className="text-sm text-muted-foreground mt-1">
              {(pendingQuery.error as Error)?.message ?? "Unknown error"}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => pendingQuery.refetch()}
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={
                      pendingList.length > 0 &&
                      selectedIds.size === pendingList.length
                    }
                    onCheckedChange={handleToggleAll}
                  />
                </TableHead>
                <TableHead>Handover #</TableHead>
                <TableHead>Entity Type</TableHead>
                <TableHead className="text-right">Items</TableHead>
                <TableHead>From RM</TableHead>
                <TableHead>To RM</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pendingQuery.isLoading ? (
                <SkeletonRows cols={8} rows={5} />
              ) : pendingList.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="text-center text-muted-foreground py-12"
                  >
                    No pending handover requests found
                  </TableCell>
                </TableRow>
              ) : (
                pendingList.map((req) => (
                  <TableRow
                    key={req.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleRowClick(req.id)}
                  >
                    <TableCell
                      onClick={(e: React.MouseEvent) => e.stopPropagation()}
                    >
                      <Checkbox
                        checked={selectedIds.has(req.id)}
                        onCheckedChange={() => handleToggleRow(req.id)}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-sm font-medium">
                      {req.handover_number}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{req.entity_type}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {req.item_count}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <p className="font-medium">{req.from_rm_name}</p>
                        <p className="text-muted-foreground text-xs">
                          {req.from_rm_id}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <p className="font-medium">{req.to_rm_name}</p>
                        <p className="text-muted-foreground text-xs">
                          {req.to_rm_id}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      {formatDate(req.requested_date)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={STATUS_COLORS[req.status] ?? ""}
                        variant="secondary"
                      >
                        {req.status.replace(/_/g, " ")}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {(page - 1) * pageSize + 1}
            {" - "}
            {Math.min(page * pageSize, totalRecords)} of {totalRecords}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={handlePrevPage}
            >
              Previous
            </Button>
            <span className="text-sm">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={handleNextPage}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog
        open={detailDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDetailDialogOpen(false);
            setSelectedRequestId(null);
            setShowRejectOverlay(false);
            setRejectReason("");
          }
        }}
      >
        <DialogContent className="sm:max-w-[700px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Handover Request Detail
              {requestDetail
                ? ` -- ${requestDetail.handover_number}`
                : ""}
            </DialogTitle>
          </DialogHeader>

          {detailQuery.isLoading ? (
            <div className="space-y-4 py-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="h-5 w-full animate-pulse rounded bg-muted"
                />
              ))}
            </div>
          ) : detailQuery.isError ? (
            <div className="py-8 text-center text-destructive">
              <p className="font-medium">Failed to load request details</p>
              <p className="text-sm text-muted-foreground mt-1">
                {(detailQuery.error as Error)?.message ?? "Unknown error"}
              </p>
            </div>
          ) : requestDetail ? (
            <div className="space-y-6 py-2">
              {/* Request Overview */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Handover #</span>
                  <p className="font-mono font-medium">
                    {requestDetail.handover_number}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Entity Type</span>
                  <p className="font-medium">{requestDetail.entity_type}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">From RM</span>
                  <p className="font-medium">
                    {requestDetail.from_rm_name}{" "}
                    <span className="text-muted-foreground">
                      ({requestDetail.from_rm_id})
                    </span>
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">To RM</span>
                  <p className="font-medium">
                    {requestDetail.to_rm_name}{" "}
                    <span className="text-muted-foreground">
                      ({requestDetail.to_rm_id})
                    </span>
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Requested Date</span>
                  <p className="font-medium">
                    {formatDate(requestDetail.requested_date)}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Status</span>
                  <p>
                    <Badge
                      className={STATUS_COLORS[requestDetail.status] ?? ""}
                      variant="secondary"
                    >
                      {requestDetail.status.replace(/_/g, " ")}
                    </Badge>
                  </p>
                </div>
                {requestDetail.reason && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Reason</span>
                    <p className="font-medium">{requestDetail.reason}</p>
                  </div>
                )}
                {requestDetail.notes && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Notes</span>
                    <p className="text-sm">{requestDetail.notes}</p>
                  </div>
                )}
              </div>

              {/* AUM Impact */}
              <div className="rounded-md bg-muted/50 p-4">
                <h4 className="text-sm font-semibold mb-2">AUM Impact</h4>
                <p className="text-lg font-bold">
                  {formatCurrency(
                    requestDetail.total_aum_impact,
                    requestDetail.aum_currency
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  Total assets under management being transferred (
                  {requestDetail.item_count} item
                  {requestDetail.item_count !== 1 ? "s" : ""})
                </p>
              </div>

              {/* Scrutiny Checklist */}
              {requestDetail.scrutiny_checklist &&
                requestDetail.scrutiny_checklist.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold mb-2">
                      Scrutiny Checklist
                    </h4>
                    <div className="space-y-2">
                      {requestDetail.scrutiny_checklist.map((check) => (
                        <div
                          key={check.id}
                          className="flex items-start gap-3 rounded-md border p-3 text-sm"
                        >
                          <Badge
                            variant={check.passed ? "default" : "destructive"}
                            className="mt-0.5 shrink-0"
                          >
                            {check.passed ? "PASS" : "FAIL"}
                          </Badge>
                          <div>
                            <p className="font-medium">{check.label}</p>
                            {check.details && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {check.details}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              {/* Items List */}
              {requestDetail.items && requestDetail.items.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">
                    Items ({requestDetail.items.length})
                  </h4>
                  <div className="rounded-md border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Entity</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead className="text-right">AUM</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {requestDetail.items.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="font-mono text-xs">
                              {item.entity_id}
                            </TableCell>
                            <TableCell className="text-sm">
                              {item.entity_name}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {formatCurrency(item.aum, item.currency)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {/* Reject Reason Overlay */}
              {showRejectOverlay && (
                <div className="space-y-3 rounded-md border border-destructive/30 bg-destructive/5 p-4">
                  <h4 className="text-sm font-semibold text-destructive">
                    Reject Reason
                  </h4>
                  <Textarea
                    placeholder="Provide a reason for rejecting this request..."
                    value={rejectReason}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                      setRejectReason(e.target.value)
                    }
                    rows={3}
                  />
                  <div className="flex gap-2">
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={
                        !rejectReason.trim() || rejectMutation.isPending
                      }
                      onClick={handleReject}
                    >
                      {rejectMutation.isPending
                        ? "Rejecting..."
                        : "Confirm Reject"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setShowRejectOverlay(false);
                        setRejectReason("");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {/* Dialog Footer with Authorize / Reject */}
          {requestDetail && !detailQuery.isLoading && !detailQuery.isError && (
            <DialogFooter>
              {!showRejectOverlay && (
                <>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setDetailDialogOpen(false);
                      setSelectedRequestId(null);
                    }}
                  >
                    Close
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => setShowRejectOverlay(true)}
                    disabled={isMutating}
                  >
                    Reject
                  </Button>
                  <Button
                    onClick={handleAuthorize}
                    disabled={isMutating}
                  >
                    {authorizeMutation.isPending
                      ? "Authorizing..."
                      : "Authorize"}
                  </Button>
                </>
              )}
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* Batch Authorize Confirmation Dialog */}
      <Dialog
        open={batchAuthorizeDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setBatchAuthorizeDialogOpen(false);
            setBatchConfirmInput("");
          }
        }}
      >
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>
              Batch Authorize {selectedIds.size} Request
              {selectedIds.size !== 1 ? "s" : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              You are about to authorize{" "}
              <span className="font-bold text-foreground">
                {selectedIds.size}
              </span>{" "}
              handover request{selectedIds.size !== 1 ? "s" : ""}. This action
              cannot be undone.
            </p>
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Type <span className="font-mono font-bold">CONFIRM</span> to
                proceed
              </label>
              <Input
                placeholder='Type "CONFIRM"'
                value={batchConfirmInput}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setBatchConfirmInput(e.target.value)
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setBatchAuthorizeDialogOpen(false);
                setBatchConfirmInput("");
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={
                batchConfirmInput !== "CONFIRM" ||
                batchAuthorizeMutation.isPending
              }
              onClick={handleBatchAuthorize}
            >
              {batchAuthorizeMutation.isPending
                ? "Authorizing..."
                : "Authorize All"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Batch Reject Confirmation Dialog */}
      <Dialog
        open={batchRejectDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setBatchRejectDialogOpen(false);
            setBatchConfirmInput("");
            setBatchRejectReason("");
          }
        }}
      >
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>
              Batch Reject {selectedIds.size} Request
              {selectedIds.size !== 1 ? "s" : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              You are about to reject{" "}
              <span className="font-bold text-foreground">
                {selectedIds.size}
              </span>{" "}
              handover request{selectedIds.size !== 1 ? "s" : ""}. This action
              cannot be undone.
            </p>
            <div className="space-y-2">
              <label className="text-sm font-medium">Rejection Reason</label>
              <Textarea
                placeholder="Provide a reason for rejecting these requests..."
                value={batchRejectReason}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  setBatchRejectReason(e.target.value)
                }
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Type <span className="font-mono font-bold">CONFIRM</span> to
                proceed
              </label>
              <Input
                placeholder='Type "CONFIRM"'
                value={batchConfirmInput}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setBatchConfirmInput(e.target.value)
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setBatchRejectDialogOpen(false);
                setBatchConfirmInput("");
                setBatchRejectReason("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={
                batchConfirmInput !== "CONFIRM" ||
                !batchRejectReason.trim() ||
                batchRejectMutation.isPending
              }
              onClick={handleBatchReject}
            >
              {batchRejectMutation.isPending
                ? "Rejecting..."
                : "Reject All"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
