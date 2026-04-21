/**
 * Dispute Management -- TrustFees Pro Phase 9
 *
 * Full UI page for managing invoice disputes:
 *   - Summary cards: Open Disputes, Investigating, Resolved This Month, Credit Notes Issued
 *   - Data table: dispute ID, invoice_number, customer_id, reason, dispute_status, raised_date
 *   - Status badges: OPEN=blue, INVESTIGATING=amber, RESOLVED=green, REJECTED=red
 *   - Row actions: Investigate (OPEN), Resolve (INVESTIGATING), Reject (INVESTIGATING)
 *   - Resolve dialog: refund amount input, reason textarea, credit note preview
 *   - Reject dialog: reason textarea
 *   - Detail drawer: invoice details, dispute history, linked credit notes
 *   - 30-second auto-refresh, dark mode support
 */
import { useState, useMemo } from "react";
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
  AlertTriangle,
  Search as SearchIcon,
  RefreshCw,
  FileText,
  CheckCircle,
  Clock,
  XCircle,
  Eye,
  Play,
  Ban,
  ChevronLeft,
  ChevronRight,
  Loader2,
  CreditCard,
  DollarSign,
  Scale,
} from "lucide-react";

/* ---------- Constants ---------- */

const STATUS_COLORS: Record<string, string> = {
  OPEN: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  INVESTIGATING: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  RESOLVED: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  REJECTED: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};

const STATUS_OPTIONS = ["ALL", "OPEN", "INVESTIGATING", "RESOLVED", "REJECTED"];

/* ---------- Helpers ---------- */

function formatTimestamp(ts: string | null): string {
  if (!ts) return "--";
  const d = new Date(ts);
  return d.toLocaleString("en-US", {
    month: "short", day: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "--";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short", day: "2-digit", year: "numeric",
  });
}

function truncate(str: string | null, maxLen: number): string {
  if (!str) return "--";
  return str.length > maxLen ? str.slice(0, maxLen) + "..." : str;
}

function formatAmount(amount: string | number | null, currency?: string): string {
  if (amount === null || amount === undefined) return "--";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  const formatted = num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency ? `${currency} ${formatted}` : formatted;
}

/* ---------- Component ---------- */

export default function DisputeManagement() {
  const queryClient = useQueryClient();

  // Filters
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  // Dialogs
  const [resolveDialog, setResolveDialog] = useState<any>(null);
  const [rejectDialog, setRejectDialog] = useState<any>(null);
  const [detailDrawer, setDetailDrawer] = useState<number | null>(null);

  // Resolve form
  const [refundAmount, setRefundAmount] = useState("");
  const [resolutionText, setResolutionText] = useState("");

  // Reject form
  const [rejectReason, setRejectReason] = useState("");

  // Raise dispute form
  const [raiseDialog, setRaiseDialog] = useState(false);
  const [raiseInvoiceId, setRaiseInvoiceId] = useState("");
  const [raiseReason, setRaiseReason] = useState("");

  // Build query params
  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (statusFilter !== "ALL") params.set("dispute_status", statusFilter);
    if (search) params.set("search", search);
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    return params.toString();
  }, [statusFilter, search, page]);

  // Fetch disputes
  const { data: disputesData, isLoading, refetch } = useQuery<any>({
    queryKey: ["/api/v1/disputes", queryParams],
    queryFn: () => apiRequest("GET", apiUrl(`/api/v1/disputes?${queryParams}`)),
    refetchInterval: 30_000,
  });

  const disputes = disputesData?.data ?? [];
  const total = disputesData?.total ?? 0;
  const summary = disputesData?.summary ?? {};
  const totalPages = Math.ceil(total / pageSize);

  // Fetch detail
  const { data: detailData, isLoading: detailLoading } = useQuery<any>({
    queryKey: ["/api/v1/disputes", detailDrawer],
    queryFn: () => apiRequest("GET", apiUrl(`/api/v1/disputes/${detailDrawer}`)),
    enabled: detailDrawer !== null,
  });
  const detail = detailData?.data ?? null;

  // Mutations
  const investigateMutation = useMutation<any, Error, number>({
    mutationFn: (id) => apiRequest("POST", apiUrl(`/api/v1/disputes/${id}/investigate`), {}),
    onSuccess: () => { refetch(); queryClient.invalidateQueries({ queryKey: ["/api/v1/disputes"] }); },
  });

  const resolveMutation = useMutation<any, Error, { id: number; resolution: string; refund_amount?: string }>({
    mutationFn: ({ id, resolution, refund_amount }) =>
      apiRequest("POST", apiUrl(`/api/v1/disputes/${id}/resolve`), { resolution, refund_amount }),
    onSuccess: () => {
      setResolveDialog(null);
      setRefundAmount("");
      setResolutionText("");
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/v1/disputes"] });
    },
  });

  const rejectMutation = useMutation<any, Error, { id: number; reason: string }>({
    mutationFn: ({ id, reason }) =>
      apiRequest("POST", apiUrl(`/api/v1/disputes/${id}/reject`), { reason }),
    onSuccess: () => {
      setRejectDialog(null);
      setRejectReason("");
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/v1/disputes"] });
    },
  });

  const raiseMutation = useMutation<any, Error, { invoice_id: number; reason: string }>({
    mutationFn: ({ invoice_id, reason }) =>
      apiRequest("POST", apiUrl("/api/v1/disputes"), { invoice_id, reason }),
    onSuccess: () => {
      setRaiseDialog(false);
      setRaiseInvoiceId("");
      setRaiseReason("");
      refetch();
    },
  });

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground dark:text-white">
            Dispute Management
          </h1>
          <p className="text-sm text-muted-foreground dark:text-gray-400">
            Manage invoice disputes, investigations, and credit note resolutions
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="default" size="sm" onClick={() => setRaiseDialog(true)}>
            <AlertTriangle className="mr-1 h-4 w-4" />
            Raise Dispute
          </Button>
          <Button variant="outline" size="icon" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <div className="rounded-lg bg-blue-100 p-2 dark:bg-blue-900/40">
              <AlertTriangle className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{summary.open ?? 0}</p>
              <p className="text-xs text-muted-foreground">Open Disputes</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <div className="rounded-lg bg-amber-100 p-2 dark:bg-amber-900/40">
              <SearchIcon className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{summary.investigating ?? 0}</p>
              <p className="text-xs text-muted-foreground">Investigating</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <div className="rounded-lg bg-green-100 p-2 dark:bg-green-900/40">
              <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{summary.resolved ?? 0}</p>
              <p className="text-xs text-muted-foreground">Resolved</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <div className="rounded-lg bg-purple-100 p-2 dark:bg-purple-900/40">
              <CreditCard className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{summary.credit_notes_this_month ?? 0}</p>
              <p className="text-xs text-muted-foreground">Credit Notes (Month)</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter Bar */}
      <Card>
        <CardContent className="py-3">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Label className="text-xs whitespace-nowrap">Status</Label>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                <SelectTrigger className="h-8 w-36 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <Input
                className="h-8 text-xs"
                placeholder="Search by invoice number or reason..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Data Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : disputes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Scale className="mb-2 h-8 w-8" />
              <p>No disputes found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">ID</TableHead>
                    <TableHead className="text-xs">Invoice</TableHead>
                    <TableHead className="text-xs">Customer</TableHead>
                    <TableHead className="text-xs">Reason</TableHead>
                    <TableHead className="text-xs">Amount</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">Raised</TableHead>
                    <TableHead className="text-xs">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {disputes.map((d: any) => (
                    <TableRow
                      key={d.id}
                      className="cursor-pointer hover:bg-muted/50 dark:hover:bg-gray-800/50"
                      onClick={() => setDetailDrawer(d.id)}
                    >
                      <TableCell className="text-xs font-mono">#{d.id}</TableCell>
                      <TableCell className="text-xs font-mono">{d.invoice_number ?? `INV-${d.invoice_id}`}</TableCell>
                      <TableCell className="text-xs">{d.customer_id ?? "--"}</TableCell>
                      <TableCell className="text-xs max-w-[200px]">{truncate(d.reason, 50)}</TableCell>
                      <TableCell className="text-xs font-mono">{formatAmount(d.grand_total, d.currency)}</TableCell>
                      <TableCell>
                        <Badge className={`text-xs ${STATUS_COLORS[d.dispute_status] ?? ""}`}>
                          {d.dispute_status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{formatDate(d.created_at)}</TableCell>
                      <TableCell>
                        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                          {d.dispute_status === "OPEN" && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => investigateMutation.mutate(d.id)}
                              disabled={investigateMutation.isPending}
                            >
                              <Play className="mr-1 h-3 w-3" />
                              Investigate
                            </Button>
                          )}
                          {d.dispute_status === "INVESTIGATING" && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => {
                                  setResolveDialog(d);
                                  setRefundAmount("");
                                  setResolutionText("");
                                }}
                              >
                                <CheckCircle className="mr-1 h-3 w-3" />
                                Resolve
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs text-red-600 dark:text-red-400"
                                onClick={() => {
                                  setRejectDialog(d);
                                  setRejectReason("");
                                }}
                              >
                                <Ban className="mr-1 h-3 w-3" />
                                Reject
                              </Button>
                            </>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => setDetailDrawer(d.id)}
                          >
                            <Eye className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination */}
          {total > 0 && (
            <div className="flex items-center justify-between border-t px-4 py-2">
              <span className="text-xs text-muted-foreground">
                {total} disputes -- Page {page} of {totalPages || 1}
              </span>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Raise Dispute Dialog */}
      <Dialog open={raiseDialog} onOpenChange={setRaiseDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Raise Dispute</DialogTitle>
            <DialogDescription>
              Create a new dispute against an invoice.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Invoice ID</Label>
              <Input
                type="number"
                placeholder="Enter invoice ID"
                value={raiseInvoiceId}
                onChange={(e) => setRaiseInvoiceId(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Reason</Label>
              <Textarea
                placeholder="Describe the reason for the dispute..."
                value={raiseReason}
                onChange={(e) => setRaiseReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRaiseDialog(false)}>Cancel</Button>
            <Button
              onClick={() => raiseMutation.mutate({
                invoice_id: parseInt(raiseInvoiceId, 10),
                reason: raiseReason,
              })}
              disabled={!raiseInvoiceId || !raiseReason || raiseMutation.isPending}
            >
              {raiseMutation.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Raise Dispute
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Resolve Dialog */}
      <Dialog open={!!resolveDialog} onOpenChange={() => setResolveDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve Dispute #{resolveDialog?.id}</DialogTitle>
            <DialogDescription>
              Resolve this dispute. Optionally issue a credit note for partial or full refund.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border p-3 bg-muted/50 dark:bg-gray-800/50">
              <div className="flex justify-between text-sm">
                <span>Invoice: {resolveDialog?.invoice_number}</span>
                <span className="font-mono">{formatAmount(resolveDialog?.grand_total, resolveDialog?.currency)}</span>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Refund Amount (optional)</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
              />
              {refundAmount && parseFloat(refundAmount) > 0 && (
                <div className="mt-1 rounded border border-green-200 bg-green-50 p-2 text-xs text-green-800 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300">
                  Credit note will be issued: {resolveDialog?.currency} {parseFloat(refundAmount).toFixed(2)}
                </div>
              )}
            </div>
            <div className="space-y-1">
              <Label>Resolution Notes</Label>
              <Textarea
                placeholder="Describe the resolution..."
                value={resolutionText}
                onChange={(e) => setResolutionText(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveDialog(null)}>Cancel</Button>
            <Button
              onClick={() => resolveMutation.mutate({
                id: resolveDialog.id,
                resolution: resolutionText,
                refund_amount: refundAmount || undefined,
              })}
              disabled={!resolutionText || resolveMutation.isPending}
            >
              {resolveMutation.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Resolve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={!!rejectDialog} onOpenChange={() => setRejectDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Dispute #{rejectDialog?.id}</DialogTitle>
            <DialogDescription>
              Reject this dispute. The invoice will be restored to its previous status.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Rejection Reason</Label>
              <Textarea
                placeholder="Provide the reason for rejection..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialog(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => rejectMutation.mutate({
                id: rejectDialog.id,
                reason: rejectReason,
              })}
              disabled={!rejectReason || rejectMutation.isPending}
            >
              {rejectMutation.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Reject Dispute
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Drawer */}
      <Sheet open={detailDrawer !== null} onOpenChange={() => setDetailDrawer(null)}>
        <SheetContent className="w-[500px] overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Dispute #{detailDrawer}</SheetTitle>
            <SheetDescription>Full dispute details with invoice and credit notes</SheetDescription>
          </SheetHeader>

          {detailLoading ? (
            <div className="space-y-3 mt-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-6 w-full" />
              ))}
            </div>
          ) : detail ? (
            <div className="mt-6 space-y-6">
              {/* Dispute Info */}
              <div>
                <h3 className="text-sm font-semibold mb-2">Dispute Details</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Status</span>
                    <Badge className={STATUS_COLORS[detail.dispute_status] ?? ""}>
                      {detail.dispute_status}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Raised By</span>
                    <span>{detail.raised_by}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Raised At</span>
                    <span>{formatTimestamp(detail.created_at)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Reason</span>
                    <p className="mt-1 text-sm">{detail.reason}</p>
                  </div>
                  {detail.resolution_notes && (
                    <div>
                      <span className="text-muted-foreground">Resolution</span>
                      <p className="mt-1 text-sm">{detail.resolution_notes}</p>
                    </div>
                  )}
                  {detail.resolved_at && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Resolved At</span>
                      <span>{formatTimestamp(detail.resolved_at)}</span>
                    </div>
                  )}
                </div>
              </div>

              <Separator />

              {/* Invoice Info */}
              {detail.invoice && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">Invoice</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Number</span>
                      <span className="font-mono">{detail.invoice.invoice_number}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Customer</span>
                      <span>{detail.invoice.customer_id}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Grand Total</span>
                      <span className="font-mono">{formatAmount(detail.invoice.grand_total, detail.invoice.currency)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Status</span>
                      <span>{detail.invoice.invoice_status}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Due Date</span>
                      <span>{formatDate(detail.invoice.due_date)}</span>
                    </div>
                  </div>

                  {/* Invoice Lines */}
                  {detail.invoice.lines?.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs font-medium text-muted-foreground mb-1">Lines</p>
                      <div className="space-y-1">
                        {detail.invoice.lines.map((line: any) => (
                          <div key={line.id} className="flex justify-between text-xs border-b py-1 dark:border-gray-700">
                            <span className="truncate max-w-[60%]">{line.description}</span>
                            <span className="font-mono">{formatAmount(line.line_amount)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <Separator />

              {/* Credit Notes */}
              <div>
                <h3 className="text-sm font-semibold mb-2">Credit Notes</h3>
                {detail.credit_notes?.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No credit notes linked</p>
                ) : (
                  <div className="space-y-2">
                    {detail.credit_notes?.map((cn: any) => (
                      <div key={cn.id} className="rounded border p-2 text-xs dark:border-gray-700">
                        <div className="flex justify-between">
                          <span className="font-mono">{cn.credit_note_number}</span>
                          <Badge className={cn.cn_status === "ISSUED" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}>
                            {cn.cn_status}
                          </Badge>
                        </div>
                        <div className="flex justify-between mt-1">
                          <span className="text-muted-foreground">{cn.reason_code}</span>
                          <span className="font-mono">{formatAmount(cn.amount, cn.currency)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p className="mt-6 text-sm text-muted-foreground">Dispute not found</p>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
