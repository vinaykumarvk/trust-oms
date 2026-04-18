/**
 * Settlement Desk — Phase 3A (BRD Screen #5)
 *
 * Primary back-office settlement view with cut-off clocks,
 * summary cards, settlement table with actions, SWIFT traffic
 * panel, cash-ledger heat-map, and bulk-settle dialog.
 * Auto-refreshes every 15 seconds.
 */

import { useState, useEffect, useMemo, useCallback } from "react";
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
import { Separator } from "@ui/components/ui/separator";
import { Skeleton } from "@ui/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ui/components/ui/table";
import {
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  DollarSign,
  Send,
  RefreshCw,
  Landmark,
  ArrowUpCircle,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CutOff {
  market: string;
  time: string; // "HH:MM" in PHT
}

interface Settlement {
  id: string;
  trade_id: string;
  ssi: string;
  swift_type: string;
  currency: string;
  amount: number;
  value_date: string;
  status: string;
}

interface SettlementListResponse {
  data: Settlement[];
  total: number;
}

interface LiquidityRow {
  currency: string;
  t0_balance: number;
  t1_projected: number;
  t2_projected: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  MATCHED: "bg-blue-100 text-blue-800",
  SETTLED: "bg-green-100 text-green-800",
  FAILED: "bg-red-100 text-red-800",
};

function formatPHP(amount: number): string {
  return amount.toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  });
}

function formatDate(dateStr: string): string {
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

/** Default cut-offs used when API is unavailable */
const DEFAULT_CUTOFFS: CutOff[] = [
  { market: "Equities", time: "14:30" },
  { market: "Fixed Income", time: "15:00" },
  { market: "FX", time: "11:00" },
  { market: "General", time: "16:00" },
];

function getSecondsUntil(timeStr: string): number {
  const now = new Date();
  const [hours, minutes] = timeStr.split(":").map(Number);
  const target = new Date(now);
  target.setHours(hours, minutes, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  return Math.max(0, Math.floor((target.getTime() - now.getTime()) / 1000));
}

function formatCountdown(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function countdownColor(totalSeconds: number): string {
  if (totalSeconds > 3600) return "text-green-600";
  if (totalSeconds > 1800) return "text-yellow-600";
  return "text-red-600";
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CutOffClocks({ cutoffs }: { cutoffs: CutOff[] }) {
  const [seconds, setSeconds] = useState<Record<string, number>>({});

  useEffect(() => {
    const update = () => {
      const s: Record<string, number> = {};
      cutoffs.forEach((c) => {
        s[c.market] = getSecondsUntil(c.time);
      });
      setSeconds(s);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [cutoffs]);

  return (
    <div className="flex flex-wrap gap-4">
      {cutoffs.map((c) => {
        const secs = seconds[c.market] ?? 0;
        return (
          <div
            key={c.market}
            className="flex items-center gap-2 rounded-lg border px-4 py-2"
          >
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">{c.market}</span>
            <span className="text-xs text-muted-foreground">({c.time} PHT)</span>
            <span className={`font-mono text-sm font-bold ${countdownColor(secs)}`}>
              {formatCountdown(secs)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

interface SummaryCardProps {
  title: string;
  value: string | number;
  icon: React.ElementType;
  accent: string;
}

function SummaryCard({ title, value, icon: Icon, accent }: SummaryCardProps) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
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
// Main Component
// ---------------------------------------------------------------------------

export default function SettlementDesk() {
  const qc = useQueryClient();
  const [tab, setTab] = useState("pending");
  const [page, setPage] = useState(1);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkCurrency, setBulkCurrency] = useState("PHP");
  const [bulkDate, setBulkDate] = useState("");
  const pageSize = 25;

  // --- Data queries ---

  const cutoffsQuery = useQuery<CutOff[]>({
    queryKey: ["settlement-cutoffs"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/settlements/cut-offs")),
    refetchInterval: 60_000,
  });
  const cutoffs = cutoffsQuery.data ?? DEFAULT_CUTOFFS;

  const statusFilter = tab === "all" ? undefined : tab.toUpperCase();

  const settlementsQuery = useQuery<SettlementListResponse>({
    queryKey: ["settlements", { status: statusFilter, page }],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      if (statusFilter) params.set("status", statusFilter);
      return apiRequest("GET", apiUrl(`/api/v1/settlements?${params.toString()}`));
    },
    refetchInterval: 15_000,
  });

  const settlements = settlementsQuery.data?.data ?? [];
  const total = settlementsQuery.data?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize) || 1;

  const heatmapQuery = useQuery<LiquidityRow[]>({
    queryKey: ["liquidity-heatmap"],
    queryFn: () =>
      apiRequest("GET", apiUrl("/api/v1/settlements/cash-ledger/liquidity-heatmap")),
    refetchInterval: 15_000,
  });
  const heatmapData = heatmapQuery.data ?? [];

  // Summary counts
  const summaryPending = tab === "pending" ? total : 0;
  const summarySettled = tab === "settled" ? total : 0;
  const summaryFailed = tab === "failed" ? total : 0;

  const allQuery = useQuery<SettlementListResponse>({
    queryKey: ["settlements-summary"],
    queryFn: () =>
      apiRequest("GET", apiUrl("/api/v1/settlements?pageSize=1&page=1")),
    refetchInterval: 15_000,
  });

  const totalValue = useMemo(() => {
    return settlements.reduce((sum, s) => sum + (s.amount ?? 0), 0);
  }, [settlements]);

  // --- Mutations ---

  const settleMut = useMutation({
    mutationFn: (id: string) =>
      apiRequest("POST", apiUrl(`/api/v1/settlements/${id}/settle`)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settlements"] }),
  });

  const retryMut = useMutation({
    mutationFn: (id: string) =>
      apiRequest("POST", apiUrl(`/api/v1/settlements/${id}/retry`)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settlements"] }),
  });

  const bulkSettleMut = useMutation({
    mutationFn: (body: { currency: string; value_date?: string }) =>
      apiRequest("POST", apiUrl("/api/v1/settlements/bulk-settle"), body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settlements"] });
      setBulkOpen(false);
    },
  });

  const handleBulkSettle = useCallback(() => {
    bulkSettleMut.mutate({
      currency: bulkCurrency,
      ...(bulkDate ? { value_date: bulkDate } : {}),
    });
  }, [bulkCurrency, bulkDate, bulkSettleMut]);

  // --- SWIFT traffic stub ---
  const swiftCounts = { pending: 12, sent: 34, confirmed: 28, failed: 2 };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Landmark className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Settlement Desk</h1>
            <p className="text-sm text-muted-foreground">
              Real-time settlement monitoring and actions
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="default" size="sm" onClick={() => setBulkOpen(true)}>
            <ArrowUpCircle className="h-4 w-4 mr-2" />
            Bulk Settle
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => settlementsQuery.refetch()}
            disabled={settlementsQuery.isFetching}
          >
            <RefreshCw
              className={`h-4 w-4 ${settlementsQuery.isFetching ? "animate-spin" : ""}`}
            />
          </Button>
        </div>
      </div>

      {/* Cut-off Clocks */}
      <CutOffClocks cutoffs={cutoffs} />

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          title="Pending Settlements"
          value={summaryPending || allQuery.data?.total || 0}
          icon={Clock}
          accent="bg-yellow-500"
        />
        <SummaryCard
          title="Settled Today"
          value={summarySettled}
          icon={CheckCircle}
          accent="bg-green-600"
        />
        <SummaryCard
          title="Failed"
          value={summaryFailed}
          icon={XCircle}
          accent="bg-red-600"
        />
        <SummaryCard
          title="Total Value"
          value={formatPHP(totalValue)}
          icon={DollarSign}
          accent="bg-indigo-600"
        />
      </div>

      {/* SWIFT Traffic Panel */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">SWIFT Traffic</CardTitle>
          <CardDescription>Message status overview (stub)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-4">
            {(
              [
                { label: "Pending", count: swiftCounts.pending, color: "bg-yellow-100 text-yellow-800" },
                { label: "Sent", count: swiftCounts.sent, color: "bg-blue-100 text-blue-800" },
                { label: "Confirmed", count: swiftCounts.confirmed, color: "bg-green-100 text-green-800" },
                { label: "Failed", count: swiftCounts.failed, color: "bg-red-100 text-red-800" },
              ] as const
            ).map((s) => (
              <div key={s.label} className="flex items-center justify-between rounded-lg border p-3">
                <span className="text-sm font-medium">{s.label}</span>
                <Badge className={s.color}>{s.count}</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Settlement Table with Tabs */}
      <Tabs value={tab} onValueChange={(v) => { setTab(v); setPage(1); }}>
        <TabsList>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="failed">Failed</TabsTrigger>
          <TabsTrigger value="settled">Settled</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Trade ID</TableHead>
                  <TableHead>SSI</TableHead>
                  <TableHead>SWIFT Type</TableHead>
                  <TableHead>Currency</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Value Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {settlementsQuery.isLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 9 }).map((_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-16" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : settlements.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                      No settlements found
                    </TableCell>
                  </TableRow>
                ) : (
                  settlements.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono text-xs">{s.id}</TableCell>
                      <TableCell className="font-mono text-xs">{s.trade_id}</TableCell>
                      <TableCell className="text-xs">{s.ssi}</TableCell>
                      <TableCell>{s.swift_type}</TableCell>
                      <TableCell>{s.currency}</TableCell>
                      <TableCell className="text-right font-mono">
                        {formatPHP(s.amount)}
                      </TableCell>
                      <TableCell className="text-xs">{formatDate(s.value_date)}</TableCell>
                      <TableCell>
                        <Badge className={STATUS_COLORS[s.status] ?? "bg-gray-100 text-gray-800"}>
                          {s.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {s.status === "PENDING" && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => settleMut.mutate(s.id)}
                              disabled={settleMut.isPending}
                            >
                              Settle
                            </Button>
                          )}
                          {s.status === "FAILED" && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => retryMut.mutate(s.id)}
                                disabled={retryMut.isPending}
                              >
                                Retry
                              </Button>
                              <Button variant="destructive" size="sm">
                                Escalate
                              </Button>
                            </>
                          )}
                        </div>
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
                Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, total)} of {total}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {page} of {totalPages}
                </span>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Separator />

      {/* Cash Ledger Heat-map */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Cash Ledger Liquidity Heat-map</CardTitle>
          <CardDescription>Projected balances by currency and settlement date</CardDescription>
        </CardHeader>
        <CardContent>
          {heatmapQuery.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : heatmapData.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No liquidity data available
            </p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Currency</TableHead>
                    <TableHead className="text-right">T+0 Balance</TableHead>
                    <TableHead className="text-right">T+1 Projected</TableHead>
                    <TableHead className="text-right">T+2 Projected</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {heatmapData.map((row) => (
                    <TableRow key={row.currency}>
                      <TableCell className="font-medium">{row.currency}</TableCell>
                      {[row.t0_balance, row.t1_projected, row.t2_projected].map((val, idx) => (
                        <TableCell key={idx} className="text-right">
                          <div className="flex flex-col items-end gap-1">
                            <span className={`font-mono text-sm ${val >= 0 ? "text-green-700" : "text-red-700"}`}>
                              {val.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                            </span>
                            <div className="h-2 w-24 rounded-full bg-gray-100">
                              <div
                                className={`h-full rounded-full ${val >= 0 ? "bg-green-500" : "bg-red-500"}`}
                                style={{
                                  width: `${Math.min(100, Math.abs(val) / 1_000_000 * 10)}%`,
                                }}
                              />
                            </div>
                          </div>
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bulk Settle Dialog */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bulk Settle</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">Currency</label>
              <Select value={bulkCurrency} onValueChange={setBulkCurrency}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PHP">PHP</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Value Date</label>
              <Input
                type="date"
                value={bulkDate}
                onChange={(e) => setBulkDate(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleBulkSettle} disabled={bulkSettleMut.isPending}>
              {bulkSettleMut.isPending ? "Settling..." : "Confirm Bulk Settle"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
