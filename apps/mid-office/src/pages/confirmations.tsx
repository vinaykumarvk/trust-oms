/**
 * Confirmation Queue Page
 *
 * Main dealing desk view for trade matching and confirmation.
 * Shows summary cards, tabbed queue with UNMATCHED/MATCHED/EXCEPTION/CONFIRMED/ALL,
 * and action dialogs for matching, confirming, and resolving trades.
 * Auto-refreshes every 15 seconds.
 */

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@ui/lib/queryClient";
import { apiUrl } from "@ui/lib/api-url";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ui/components/ui/table";
import { Badge } from "@ui/components/ui/badge";
import { Button } from "@ui/components/ui/button";
import { Input } from "@ui/components/ui/input";
import { Checkbox } from "@ui/components/ui/checkbox";
import { Skeleton } from "@ui/components/ui/skeleton";
import { Separator } from "@ui/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/components/ui/tabs";
import { Textarea } from "@ui/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@ui/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ui/components/ui/select";
import {
  CheckCircle2,
  AlertTriangle,
  Clock,
  BarChart3,
  RefreshCw,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ConfirmationSummary {
  unmatched: number;
  matched: number;
  exception: number;
  confirmed: number;
  total: number;
}

interface Confirmation {
  id: number;
  trade_id: string;
  order_id: string;
  block_id: string;
  broker: string;
  execution_price: number;
  execution_qty: number;
  match_status: "UNMATCHED" | "MATCHED" | "EXCEPTION" | "CONFIRMED";
  counterparty_ref: string | null;
  deviation_pct: number | null;
  cp_price: number | null;
  cp_qty: number | null;
  settlement_date: string | null;
  created_at: string;
}

interface PaginatedConfirmations {
  data: Confirmation[];
  total: number;
  page: number;
  pageSize: number;
}

type MatchStatus = "UNMATCHED" | "MATCHED" | "EXCEPTION" | "CONFIRMED" | "ALL";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, string> = {
  UNMATCHED: "bg-yellow-500/15 text-yellow-700 border-yellow-300",
  MATCHED: "bg-blue-500/15 text-blue-700 border-blue-300",
  EXCEPTION: "bg-red-500/15 text-red-700 border-red-300",
  CONFIRMED: "bg-green-500/15 text-green-700 border-green-300",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={STATUS_COLORS[status] ?? ""}>
      {status}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Summary Cards
// ---------------------------------------------------------------------------

interface SummaryCardProps {
  title: string;
  value: number | string;
  icon: React.ElementType;
  accent: string;
}

function SummaryCard({ title, value, icon: Icon, accent }: SummaryCardProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// Match Dialog (UNMATCHED -> provide counterparty data)
// ---------------------------------------------------------------------------

function MatchDialog({
  open,
  onOpenChange,
  trade,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  trade: Confirmation | null;
  onSubmit: (data: {
    counterparty_ref: string;
    execution_price: number;
    execution_qty: number;
    settlement_date: string;
  }) => void;
  isPending: boolean;
}) {
  const [cpRef, setCpRef] = useState("");
  const [cpPrice, setCpPrice] = useState("");
  const [cpQty, setCpQty] = useState("");
  const [settlementDate, setSettlementDate] = useState("");

  const handleSubmit = () => {
    onSubmit({
      counterparty_ref: cpRef,
      execution_price: parseFloat(cpPrice),
      execution_qty: parseInt(cpQty, 10),
      settlement_date: settlementDate,
    });
  };

  const resetForm = useCallback(() => {
    setCpRef("");
    setCpPrice("");
    setCpQty("");
    setSettlementDate("");
  }, []);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) resetForm();
        onOpenChange(v);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Match Trade {trade?.trade_id}</DialogTitle>
          <DialogDescription>
            Enter counterparty confirmation data to match this trade.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <label className="text-sm font-medium">Counterparty Reference</label>
            <Input
              placeholder="e.g. CP-2024-0001"
              value={cpRef}
              onChange={(e) => setCpRef(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Execution Price</label>
              <Input
                type="number"
                step="0.0001"
                placeholder="0.0000"
                value={cpPrice}
                onChange={(e) => setCpPrice(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Execution Qty</label>
              <Input
                type="number"
                placeholder="0"
                value={cpQty}
                onChange={(e) => setCpQty(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium">Settlement Date</label>
            <Input
              type="date"
              value={settlementDate}
              onChange={(e) => setSettlementDate(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending || !cpRef || !cpPrice || !cpQty || !settlementDate}
          >
            {isPending ? "Matching..." : "Submit Match"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Resolve Dialog (EXCEPTION -> CONFIRM/REJECT/REMATCH)
// ---------------------------------------------------------------------------

function ResolveDialog({
  open,
  onOpenChange,
  trade,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  trade: Confirmation | null;
  onSubmit: (data: { action: string; notes: string }) => void;
  isPending: boolean;
}) {
  const [action, setAction] = useState<string>("");
  const [notes, setNotes] = useState("");

  const resetForm = useCallback(() => {
    setAction("");
    setNotes("");
  }, []);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) resetForm();
        onOpenChange(v);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Resolve Exception — {trade?.trade_id}</DialogTitle>
          <DialogDescription>
            Choose a resolution action for this trade exception.
          </DialogDescription>
        </DialogHeader>

        {/* Side-by-side comparison for exception items */}
        {trade && trade.match_status === "EXCEPTION" && (
          <div className="rounded-md border p-4">
            <p className="mb-3 text-sm font-semibold">
              Internal vs Counterparty Comparison
            </p>
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div className="font-medium text-muted-foreground">Field</div>
              <div className="font-medium text-muted-foreground">Internal</div>
              <div className="font-medium text-muted-foreground">Counterparty</div>

              <div>Price</div>
              <div>{trade.execution_price?.toFixed(4) ?? "—"}</div>
              <div>{trade.cp_price?.toFixed(4) ?? "—"}</div>

              <div>Quantity</div>
              <div>{trade.execution_qty?.toLocaleString() ?? "—"}</div>
              <div>{trade.cp_qty?.toLocaleString() ?? "—"}</div>

              <div>Deviation %</div>
              <div
                className={`col-span-2 ${
                  (trade.deviation_pct ?? 0) > 1
                    ? "text-red-600 font-semibold"
                    : ""
                }`}
              >
                {trade.deviation_pct != null
                  ? `${trade.deviation_pct.toFixed(2)}%`
                  : "—"}
              </div>
            </div>
          </div>
        )}

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <label className="text-sm font-medium">Action</label>
            <Select value={action} onValueChange={setAction}>
              <SelectTrigger>
                <SelectValue placeholder="Select action..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CONFIRM">Confirm</SelectItem>
                <SelectItem value="REJECT">Reject</SelectItem>
                <SelectItem value="REMATCH">Rematch</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium">Notes</label>
            <Textarea
              placeholder="Reason for resolution..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => onSubmit({ action, notes })}
            disabled={isPending || !action}
          >
            {isPending ? "Submitting..." : "Submit Resolution"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function Confirmations() {
  const queryClient = useQueryClient();

  // State
  const [activeTab, setActiveTab] = useState<MatchStatus>("UNMATCHED");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [matchDialogOpen, setMatchDialogOpen] = useState(false);
  const [resolveDialogOpen, setResolveDialogOpen] = useState(false);
  const [selectedTrade, setSelectedTrade] = useState<Confirmation | null>(null);
  const [expandedExceptionId, setExpandedExceptionId] = useState<number | null>(
    null
  );

  const pageSize = 25;

  // Build query URL
  const statusParam = activeTab === "ALL" ? "" : `&status=${activeTab}`;
  const queueUrl = `/api/v1/confirmations?page=${page}&pageSize=${pageSize}${statusParam}`;

  // Queries
  const summaryQuery = useQuery<ConfirmationSummary>({
    queryKey: ["/api/v1/confirmations/summary"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/confirmations/summary")),
    refetchInterval: 15_000,
  });

  const queueQuery = useQuery<PaginatedConfirmations>({
    queryKey: ["/api/v1/confirmations", activeTab, page],
    queryFn: () => apiRequest("GET", apiUrl(queueUrl)),
    refetchInterval: 15_000,
  });

  // Mutations
  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/v1/confirmations"] });
    queryClient.invalidateQueries({
      queryKey: ["/api/v1/confirmations/summary"],
    });
  };

  const matchMutation = useMutation({
    mutationFn: (payload: {
      tradeId: string;
      data: {
        counterparty_ref: string;
        execution_price: number;
        execution_qty: number;
        settlement_date: string;
      };
    }) =>
      apiRequest(
        "POST",
        apiUrl(`/api/v1/confirmations/${payload.tradeId}/match`),
        payload.data
      ),
    onSuccess: () => {
      setMatchDialogOpen(false);
      setSelectedTrade(null);
      invalidateAll();
    },
  });

  const resolveMutation = useMutation({
    mutationFn: (payload: {
      id: number;
      data: { action: string; notes: string };
    }) =>
      apiRequest(
        "POST",
        apiUrl(`/api/v1/confirmations/${payload.id}/resolve`),
        payload.data
      ),
    onSuccess: () => {
      setResolveDialogOpen(false);
      setSelectedTrade(null);
      invalidateAll();
    },
  });

  const confirmSingleMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("POST", apiUrl(`/api/v1/confirmations/${id}/resolve`), {
        action: "CONFIRM",
      }),
    onSuccess: () => {
      invalidateAll();
    },
  });

  const bulkConfirmMutation = useMutation({
    mutationFn: (ids: number[]) =>
      apiRequest("POST", apiUrl("/api/v1/confirmations/bulk-confirm"), { ids }),
    onSuccess: () => {
      setSelectedIds(new Set());
      invalidateAll();
    },
  });

  // Handlers
  const handleMatchOpen = (trade: Confirmation) => {
    setSelectedTrade(trade);
    setMatchDialogOpen(true);
  };

  const handleResolveOpen = (trade: Confirmation) => {
    setSelectedTrade(trade);
    setResolveDialogOpen(true);
  };

  const toggleSelectId = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = (rows: Confirmation[]) => {
    const allSelected = rows.every((r) => selectedIds.has(r.id));
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(rows.map((r) => r.id)));
    }
  };

  const handleTabChange = (value: string) => {
    setActiveTab(value as MatchStatus);
    setPage(1);
    setSelectedIds(new Set());
    setExpandedExceptionId(null);
  };

  const summary = summaryQuery.data;
  const rows = queueQuery.data?.data ?? [];
  const totalRows = queueQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Confirmation Queue
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Trade matching and confirmation management
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => invalidateAll()}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      {summaryQuery.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard
            title="Total Trades"
            value={summary?.total ?? 0}
            icon={BarChart3}
            accent="bg-slate-600"
          />
          <SummaryCard
            title="Matched"
            value={summary?.matched ?? 0}
            icon={CheckCircle2}
            accent="bg-green-600"
          />
          <SummaryCard
            title="Exceptions"
            value={summary?.exception ?? 0}
            icon={AlertTriangle}
            accent="bg-red-600"
          />
          <SummaryCard
            title="Unmatched"
            value={summary?.unmatched ?? 0}
            icon={Clock}
            accent="bg-yellow-600"
          />
        </div>
      )}

      {/* Tabs + Queue Table */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="UNMATCHED">Unmatched</TabsTrigger>
            <TabsTrigger value="MATCHED">Matched</TabsTrigger>
            <TabsTrigger value="EXCEPTION">Exception</TabsTrigger>
            <TabsTrigger value="CONFIRMED">Confirmed</TabsTrigger>
            <TabsTrigger value="ALL">All</TabsTrigger>
          </TabsList>

          {/* Bulk confirm when on MATCHED tab */}
          {activeTab === "MATCHED" && selectedIds.size > 0 && (
            <Button
              size="sm"
              onClick={() => bulkConfirmMutation.mutate([...selectedIds])}
              disabled={bulkConfirmMutation.isPending}
            >
              {bulkConfirmMutation.isPending
                ? "Confirming..."
                : `Confirm Selected (${selectedIds.size})`}
            </Button>
          )}
        </div>

        {/* All tab contents share the same table — we re-render per tab */}
        {(
          ["UNMATCHED", "MATCHED", "EXCEPTION", "CONFIRMED", "ALL"] as const
        ).map((tab) => (
          <TabsContent key={tab} value={tab}>
            {queueQuery.isLoading ? (
              <Skeleton className="h-96 w-full" />
            ) : rows.length === 0 ? (
              <div className="flex h-48 items-center justify-center rounded-lg border border-dashed text-muted-foreground">
                No {tab === "ALL" ? "" : tab.toLowerCase()} trades found.
              </div>
            ) : (
              <>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {activeTab === "MATCHED" && (
                          <TableHead className="w-10">
                            <Checkbox
                              checked={
                                rows.length > 0 &&
                                rows.every((r) => selectedIds.has(r.id))
                              }
                              onCheckedChange={() => toggleSelectAll(rows)}
                            />
                          </TableHead>
                        )}
                        <TableHead>Trade ID</TableHead>
                        <TableHead>Order ID</TableHead>
                        <TableHead>Block ID</TableHead>
                        <TableHead>Broker</TableHead>
                        <TableHead className="text-right">Exec Price</TableHead>
                        <TableHead className="text-right">Exec Qty</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>CP Ref</TableHead>
                        <TableHead className="text-right">Dev %</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((row) => (
                        <TableRow
                          key={row.id}
                          className={
                            row.match_status === "EXCEPTION"
                              ? "cursor-pointer"
                              : ""
                          }
                          onClick={() => {
                            if (row.match_status === "EXCEPTION") {
                              setExpandedExceptionId(
                                expandedExceptionId === row.id ? null : row.id
                              );
                            }
                          }}
                        >
                          {activeTab === "MATCHED" && (
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                checked={selectedIds.has(row.id)}
                                onCheckedChange={() => toggleSelectId(row.id)}
                              />
                            </TableCell>
                          )}
                          <TableCell className="font-medium">
                            {row.trade_id}
                          </TableCell>
                          <TableCell>{row.order_id}</TableCell>
                          <TableCell>{row.block_id}</TableCell>
                          <TableCell>{row.broker}</TableCell>
                          <TableCell className="text-right font-mono">
                            {row.execution_price?.toFixed(4)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {row.execution_qty?.toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={row.match_status} />
                          </TableCell>
                          <TableCell>{row.counterparty_ref ?? "—"}</TableCell>
                          <TableCell className="text-right font-mono">
                            {row.deviation_pct != null
                              ? `${row.deviation_pct.toFixed(2)}%`
                              : "—"}
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <div className="flex gap-2">
                              {row.match_status === "UNMATCHED" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleMatchOpen(row)}
                                >
                                  Match
                                </Button>
                              )}
                              {row.match_status === "MATCHED" && (
                                <Button
                                  size="sm"
                                  onClick={() =>
                                    confirmSingleMutation.mutate(row.id)
                                  }
                                  disabled={confirmSingleMutation.isPending}
                                >
                                  Confirm
                                </Button>
                              )}
                              {row.match_status === "EXCEPTION" && (
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => handleResolveOpen(row)}
                                >
                                  Resolve
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Expanded exception comparison */}
                {expandedExceptionId != null && (
                  <>
                    {(() => {
                      const exRow = rows.find(
                        (r) => r.id === expandedExceptionId
                      );
                      if (!exRow || exRow.match_status !== "EXCEPTION")
                        return null;
                      return (
                        <div className="mt-4 rounded-lg border bg-muted/30 p-4">
                          <p className="mb-3 text-sm font-semibold">
                            Exception Detail — {exRow.trade_id}
                          </p>
                          <Separator className="mb-3" />
                          <div className="grid grid-cols-2 gap-6">
                            <div>
                              <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                                Internal
                              </p>
                              <div className="space-y-1 text-sm">
                                <p>
                                  Price:{" "}
                                  <span className="font-mono">
                                    {exRow.execution_price?.toFixed(4)}
                                  </span>
                                </p>
                                <p>
                                  Qty:{" "}
                                  <span className="font-mono">
                                    {exRow.execution_qty?.toLocaleString()}
                                  </span>
                                </p>
                              </div>
                            </div>
                            <div>
                              <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                                Counterparty
                              </p>
                              <div className="space-y-1 text-sm">
                                <p>
                                  Price:{" "}
                                  <span className="font-mono">
                                    {exRow.cp_price?.toFixed(4) ?? "—"}
                                  </span>
                                </p>
                                <p>
                                  Qty:{" "}
                                  <span className="font-mono">
                                    {exRow.cp_qty?.toLocaleString() ?? "—"}
                                  </span>
                                </p>
                              </div>
                            </div>
                          </div>
                          <p className="mt-3 text-sm">
                            Deviation:{" "}
                            <span
                              className={`font-mono font-semibold ${
                                (exRow.deviation_pct ?? 0) > 1
                                  ? "text-red-600"
                                  : "text-foreground"
                              }`}
                            >
                              {exRow.deviation_pct != null
                                ? `${exRow.deviation_pct.toFixed(2)}%`
                                : "—"}
                            </span>
                          </p>
                        </div>
                      );
                    })()}
                  </>
                )}

                {/* Pagination */}
                <div className="mt-4 flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Showing {(page - 1) * pageSize + 1}–
                    {Math.min(page * pageSize, totalRows)} of {totalRows}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </>
            )}
          </TabsContent>
        ))}
      </Tabs>

      {/* Match Dialog */}
      <MatchDialog
        open={matchDialogOpen}
        onOpenChange={setMatchDialogOpen}
        trade={selectedTrade}
        isPending={matchMutation.isPending}
        onSubmit={(data) => {
          if (!selectedTrade) return;
          matchMutation.mutate({ tradeId: selectedTrade.trade_id, data });
        }}
      />

      {/* Resolve Dialog */}
      <ResolveDialog
        open={resolveDialogOpen}
        onOpenChange={setResolveDialogOpen}
        trade={selectedTrade}
        isPending={resolveMutation.isPending}
        onSubmit={(data) => {
          if (!selectedTrade) return;
          resolveMutation.mutate({ id: selectedTrade.id, data });
        }}
      />
    </div>
  );
}
