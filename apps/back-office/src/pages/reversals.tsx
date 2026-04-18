/**
 * Reversal Management — Phase 3E (Back-Office Operations)
 *
 * Full reversal lifecycle: request, compliance review, execution.
 * Three-tab interface (Pending | Approved | All History) with summary
 * cards, status-filtered queue, and action dialogs. Auto-refreshes
 * every 15 seconds.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@ui/lib/queryClient";
import { apiUrl } from "@ui/lib/api-url";
import { Card, CardContent } from "@ui/components/ui/card";
import { Badge } from "@ui/components/ui/badge";
import { Button } from "@ui/components/ui/button";
import { Input } from "@ui/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@ui/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@ui/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ui/components/ui/select";
import { Skeleton } from "@ui/components/ui/skeleton";
import { Separator } from "@ui/components/ui/separator";
import { Textarea } from "@ui/components/ui/textarea";
import {
  RotateCcw, Clock, CheckCircle, XCircle, ShieldCheck,
  Loader2, Play, RefreshCw, Search, AlertTriangle,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface ReversalCase {
  id: number;
  original_transaction_id: string | null;
  type: string | null;
  reason: string | null;
  evidence_url: string | null;
  requested_by: number | null;
  requested_by_name: string | null;
  approved_by: number | null;
  reversal_status: string | null;
  reversing_entries: unknown;
  created_at: string;
  updated_at: string;
}

interface ReversalQueueResponse {
  data: ReversalCase[];
  total: number;
  page: number;
  pageSize: number;
}

type ReversalStatus = "REQUESTED" | "COMPLIANCE_APPROVED" | "EXECUTED" | "REJECTED";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return "-";
  try {
    return new Date(dateStr).toLocaleString("en-PH", {
      month: "short", day: "numeric", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return dateStr; }
}

const STATUS_CONFIG: Record<ReversalStatus, { label: string; color: string }> = {
  REQUESTED: { label: "Requested", color: "bg-yellow-100 text-yellow-800" },
  COMPLIANCE_APPROVED: { label: "Compliance Approved", color: "bg-blue-100 text-blue-800" },
  EXECUTED: { label: "Executed", color: "bg-green-100 text-green-800" },
  REJECTED: { label: "Rejected", color: "bg-red-100 text-red-800" },
};

function getStatusBadge(status: string | null) {
  const cfg = STATUS_CONFIG[status as ReversalStatus] ?? { label: status ?? "Unknown", color: "bg-gray-100 text-gray-700" };
  return <Badge className={cfg.color}>{cfg.label}</Badge>;
}

function tabToStatusParam(tab: string): string | undefined {
  if (tab === "pending") return "REQUESTED";
  if (tab === "approved") return "COMPLIANCE_APPROVED";
  return undefined;
}

function isToday(dateStr: string): boolean {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  } catch { return false; }
}

// ---------------------------------------------------------------------------
// Summary Card
// ---------------------------------------------------------------------------
function SummaryCard({ title, value, icon: Icon, accent, loading }: {
  title: string; value: number | string; icon: React.ElementType; accent: string; loading?: boolean;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            {loading ? <Skeleton className="mt-1 h-8 w-14" /> : (
              <p className="mt-1 text-3xl font-bold text-foreground">{value}</p>
            )}
          </div>
          <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${accent}`}>
            <Icon className="h-5 w-5 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Request Reversal Dialog
// ---------------------------------------------------------------------------
function RequestReversalDialog({ open, onOpenChange, onConfirm, pending }: {
  open: boolean; onOpenChange: (o: boolean) => void;
  onConfirm: (d: { transactionId: string; reason: string; evidence?: string }) => void;
  pending: boolean;
}) {
  const [txId, setTxId] = useState("");
  const [reason, setReason] = useState("");
  const [evidence, setEvidence] = useState("");
  const reset = () => { setTxId(""); setReason(""); setEvidence(""); };
  const handleSubmit = () => { onConfirm({ transactionId: txId, reason, evidence: evidence || undefined }); reset(); };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request Reversal</DialogTitle>
          <DialogDescription>Submit a reversal request. It will go through compliance review before execution.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium">Transaction ID</label>
            <Input value={txId} onChange={(e) => setTxId(e.target.value)} placeholder="e.g. TXN-2024-001" />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Reason</label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Describe why this reversal is needed..." rows={3} />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Evidence URL (optional)</label>
            <Input value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="https://..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!txId.trim() || !reason.trim() || pending}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Submit Request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Approve / Reject Dialog (with compliance gate warning)
// ---------------------------------------------------------------------------
function ApproveRejectDialog({ open, caseData, onOpenChange, onApprove, onReject, approvePending, rejectPending }: {
  open: boolean; caseData: ReversalCase | null; onOpenChange: (o: boolean) => void;
  onApprove: () => void; onReject: (reason: string) => void;
  approvePending: boolean; rejectPending: boolean;
}) {
  const [mode, setMode] = useState<"review" | "reject">("review");
  const [rejectReason, setRejectReason] = useState("");
  const handleClose = (o: boolean) => { if (!o) { setMode("review"); setRejectReason(""); } onOpenChange(o); };
  if (!caseData) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === "review" ? "Compliance Review" : "Reject Reversal"}</DialogTitle>
          <DialogDescription>Case #{caseData.id} — Transaction {caseData.original_transaction_id ?? "-"}</DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-3 rounded-md border border-yellow-200 bg-yellow-50 p-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-yellow-600" />
          <div className="text-sm">
            <p className="font-medium text-yellow-800">Compliance Gate</p>
            <p className="mt-0.5 text-yellow-700">
              Approving this reversal will allow the operations team to execute reversing journal entries.
              Ensure the reason and evidence have been validated per BSP Circular guidelines.
            </p>
          </div>
        </div>

        <Separator />

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-muted-foreground">Reason</span>
            <p className="mt-0.5 font-medium">{caseData.reason ?? "-"}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Requested By</span>
            <p className="mt-0.5 font-medium">{caseData.requested_by_name ?? `User #${caseData.requested_by ?? "-"}`}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Date Requested</span>
            <p className="mt-0.5 font-medium">{formatDateTime(caseData.created_at)}</p>
          </div>
          {caseData.evidence_url && (
            <div>
              <span className="text-muted-foreground">Evidence</span>
              <p className="mt-0.5 font-medium truncate">{caseData.evidence_url}</p>
            </div>
          )}
        </div>

        {mode === "reject" && (
          <>
            <Separator />
            <div className="space-y-2">
              <label className="text-sm font-medium">Rejection Reason</label>
              <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Provide the reason for rejecting this reversal request..." rows={3} />
            </div>
          </>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {mode === "review" ? (
            <>
              <Button variant="outline" onClick={() => handleClose(false)}>Cancel</Button>
              <Button variant="destructive" onClick={() => setMode("reject")}>Reject</Button>
              <Button onClick={onApprove} disabled={approvePending}>
                {approvePending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <ShieldCheck className="mr-2 h-4 w-4" />Approve
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setMode("review")}>Back</Button>
              <Button variant="destructive" onClick={() => onReject(rejectReason)} disabled={!rejectReason.trim() || rejectPending}>
                {rejectPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirm Rejection
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Reversal Queue Table
// ---------------------------------------------------------------------------
function ReversalTable({ data, loading, onReview, onExecute, executePending, showActions }: {
  data: ReversalCase[]; loading: boolean; onReview: (c: ReversalCase) => void;
  onExecute: (id: number) => void; executePending: boolean; showActions: boolean;
}) {
  const colCount = showActions ? 7 : 6;

  if (loading) {
    return (
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {Array.from({ length: colCount }).map((_, j) => (
                <TableHead key={j}><Skeleton className="h-4 w-16" /></TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: colCount }).map((_, j) => (
                  <TableCell key={j}><Skeleton className="h-4 w-16" /></TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-md border py-16 text-muted-foreground">
        <RotateCcw className="mb-3 h-10 w-10" />
        <p className="text-sm">No reversal cases found</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Case ID</TableHead>
            <TableHead>Transaction Ref</TableHead>
            <TableHead>Reason</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Requested By</TableHead>
            <TableHead>Date</TableHead>
            {showActions && <TableHead>Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((rc) => {
            const status = rc.reversal_status as ReversalStatus;
            return (
              <TableRow key={rc.id}>
                <TableCell className="font-mono text-xs">REV-{rc.id}</TableCell>
                <TableCell className="font-mono text-xs">{rc.original_transaction_id ?? "-"}</TableCell>
                <TableCell className="max-w-[220px] truncate text-xs">{rc.reason ?? "-"}</TableCell>
                <TableCell>{getStatusBadge(rc.reversal_status)}</TableCell>
                <TableCell className="text-sm">{rc.requested_by_name ?? `User #${rc.requested_by ?? "-"}`}</TableCell>
                <TableCell className="text-xs whitespace-nowrap">{formatDateTime(rc.created_at)}</TableCell>
                {showActions && (
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {status === "REQUESTED" && (
                        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onReview(rc)}>
                          <ShieldCheck className="mr-1 h-3 w-3" />Review
                        </Button>
                      )}
                      {status === "COMPLIANCE_APPROVED" && (
                        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onExecute(rc.id)} disabled={executePending}>
                          <Play className="mr-1 h-3 w-3" />Execute
                        </Button>
                      )}
                    </div>
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------
export default function ReversalManagement() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("pending");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [requestDialogOpen, setRequestDialogOpen] = useState(false);
  const [reviewTarget, setReviewTarget] = useState<ReversalCase | null>(null);
  const pageSize = 25;

  // --- Queries ---------------------------------------------------------------
  const statusParam = tabToStatusParam(activeTab);

  const queueQuery = useQuery<ReversalQueueResponse>({
    queryKey: ["reversals", activeTab, page, search],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusParam) params.set("status", statusParam);
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      if (search.trim()) params.set("search", search.trim());
      return apiRequest("GET", apiUrl("/api/v1/reversals?" + params.toString()));
    },
    refetchInterval: 15_000,
  });

  const cases = queueQuery.data?.data ?? [];
  const total = queueQuery.data?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize) || 1;

  // Summary query — fetches all statuses for card counts
  const summaryQuery = useQuery<ReversalQueueResponse>({
    queryKey: ["reversals", "summary"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/reversals?pageSize=9999")),
    refetchInterval: 15_000,
  });

  const allCases = summaryQuery.data?.data ?? [];
  const pendingCount = allCases.filter((c) => c.reversal_status === "REQUESTED").length;
  const approvedCount = allCases.filter((c) => c.reversal_status === "COMPLIANCE_APPROVED").length;
  const executedTodayCount = allCases.filter((c) => c.reversal_status === "EXECUTED" && isToday(c.updated_at)).length;
  const rejectedCount = allCases.filter((c) => c.reversal_status === "REJECTED").length;

  // --- Mutations -------------------------------------------------------------
  const requestMut = useMutation({
    mutationFn: (data: { transactionId: string; reason: string; evidence?: string }) =>
      apiRequest("POST", apiUrl("/api/v1/reversals"), { ...data, requestedBy: 1 }),
    onSuccess: () => { setRequestDialogOpen(false); qc.invalidateQueries({ queryKey: ["reversals"] }); },
  });

  const approveMut = useMutation({
    mutationFn: (caseId: number) =>
      apiRequest("POST", apiUrl("/api/v1/reversals/" + caseId + "/approve"), { approvedBy: 2 }),
    onSuccess: () => { setReviewTarget(null); qc.invalidateQueries({ queryKey: ["reversals"] }); },
  });

  const rejectMut = useMutation({
    mutationFn: ({ caseId, reason }: { caseId: number; reason: string }) =>
      apiRequest("POST", apiUrl("/api/v1/reversals/" + caseId + "/reject"), { reason, rejectedBy: 2 }),
    onSuccess: () => { setReviewTarget(null); qc.invalidateQueries({ queryKey: ["reversals"] }); },
  });

  const executeMut = useMutation({
    mutationFn: (caseId: number) =>
      apiRequest("POST", apiUrl("/api/v1/reversals/" + caseId + "/execute")),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reversals"] }),
  });

  // Detail pre-fetch for compliance review dialog
  useQuery({
    queryKey: ["reversal-detail", reviewTarget?.id],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/reversals/" + reviewTarget!.id)),
    enabled: reviewTarget !== null,
  });

  const handleTabChange = (tab: string) => { setActiveTab(tab); setPage(1); };

  // --- Render ----------------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <RotateCcw className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Reversal Management</h1>
            <p className="text-sm text-muted-foreground">Manage reversal requests, compliance approvals, and execution</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => queueQuery.refetch()} disabled={queueQuery.isFetching}>
            <RefreshCw className={`h-4 w-4 ${queueQuery.isFetching ? "animate-spin" : ""}`} />
          </Button>
          <Button onClick={() => setRequestDialogOpen(true)}>
            <RotateCcw className="mr-2 h-4 w-4" />Request Reversal
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard title="Pending Requests" value={pendingCount} icon={Clock} accent="bg-yellow-500" loading={summaryQuery.isLoading} />
        <SummaryCard title="Approved (Awaiting Execute)" value={approvedCount} icon={ShieldCheck} accent="bg-blue-600" loading={summaryQuery.isLoading} />
        <SummaryCard title="Executed Today" value={executedTodayCount} icon={CheckCircle} accent="bg-green-600" loading={summaryQuery.isLoading} />
        <SummaryCard title="Rejected" value={rejectedCount} icon={XCircle} accent="bg-red-600" loading={summaryQuery.isLoading} />
      </div>

      {/* Tabs + Search */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <TabsList>
            <TabsTrigger value="pending">Pending</TabsTrigger>
            <TabsTrigger value="approved">Approved</TabsTrigger>
            <TabsTrigger value="history">All History</TabsTrigger>
          </TabsList>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search cases..." value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="h-9 w-56 pl-8" />
          </div>
        </div>

        <div className="mt-4 mb-2">
          <p className="text-sm font-medium text-muted-foreground">
            {activeTab === "pending" && "Pending Compliance Review"}
            {activeTab === "approved" && "Approved — Awaiting Execution"}
            {activeTab === "history" && "All Reversal Cases"}
            {" "}({total} total)
          </p>
        </div>

        <TabsContent value="pending" className="mt-0">
          <ReversalTable data={cases} loading={queueQuery.isLoading} onReview={setReviewTarget}
            onExecute={(id) => executeMut.mutate(id)} executePending={executeMut.isPending} showActions={true} />
        </TabsContent>
        <TabsContent value="approved" className="mt-0">
          <ReversalTable data={cases} loading={queueQuery.isLoading} onReview={setReviewTarget}
            onExecute={(id) => executeMut.mutate(id)} executePending={executeMut.isPending} showActions={true} />
        </TabsContent>
        <TabsContent value="history" className="mt-0">
          <ReversalTable data={cases} loading={queueQuery.isLoading} onReview={setReviewTarget}
            onExecute={(id) => executeMut.mutate(id)} executePending={executeMut.isPending} showActions={false} />
        </TabsContent>
      </Tabs>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, total)} of {total}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      )}

      {/* Dialogs */}
      <RequestReversalDialog open={requestDialogOpen} onOpenChange={setRequestDialogOpen}
        onConfirm={(data) => requestMut.mutate(data)} pending={requestMut.isPending} />
      <ApproveRejectDialog open={reviewTarget !== null} caseData={reviewTarget}
        onOpenChange={(o) => { if (!o) setReviewTarget(null); }}
        onApprove={() => { if (reviewTarget) approveMut.mutate(reviewTarget.id); }}
        onReject={(reason) => { if (reviewTarget) rejectMut.mutate({ caseId: reviewTarget.id, reason }); }}
        approvePending={approveMut.isPending} rejectPending={rejectMut.isPending} />
    </div>
  );
}
