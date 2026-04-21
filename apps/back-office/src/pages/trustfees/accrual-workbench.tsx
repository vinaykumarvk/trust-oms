/**
 * Accrual Workbench -- TrustFees Pro Phase 6
 *
 * Full UI page for managing daily fee accruals:
 *   - Summary cards (today's accruals, MTD, exceptions, pending overrides)
 *   - Date picker for viewing specific business date
 *   - Data table with accrual records and status badges
 *   - "Run Daily Accrual" button with dialog
 *   - Expandable row for computation breakdown
 *   - 30-second auto-refresh
 *   - Dark mode support
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
  Calculator,
  TrendingUp,
  AlertTriangle,
  Clock,
  Play,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  DollarSign,
} from "lucide-react";

/* ---------- Constants ---------- */

const STATUS_COLORS: Record<string, string> = {
  OPEN: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  ACCOUNTED: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  INVOICED: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  REVERSED: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};

const STATUS_OPTIONS = ["ALL", "OPEN", "ACCOUNTED", "INVOICED", "REVERSED"];

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

const fmtNumber = (n: number | string | null) => {
  if (n === null || n === undefined) return "--";
  const num = typeof n === "string" ? parseFloat(n) : n;
  if (isNaN(num)) return "--";
  return new Intl.NumberFormat("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(num);
};

const bc = (key: string) => STATUS_COLORS[key] ?? "bg-muted text-foreground";

const todayStr = () => new Date().toISOString().split("T")[0];

/* ---------- Sub-components ---------- */

function SummaryCard({
  title,
  value,
  subtitle,
  icon: Icon,
  accent,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
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
            {subtitle && (
              <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
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

interface Accrual {
  id: number;
  fee_plan_id: number;
  customer_id: string;
  portfolio_id: string | null;
  security_id: string | null;
  base_amount: string;
  computed_fee: string;
  applied_fee: string;
  currency: string;
  accrual_date: string;
  accrual_status: string;
  idempotency_key: string;
  created_at: string;
  fee_plan_code: string | null;
  fee_plan_name: string | null;
  fee_type: string | null;
}

interface ListResponse {
  data: Accrual[];
  total: number;
  page: number;
  pageSize: number;
}

interface SummaryData {
  date: string;
  day: { count: number; total: number };
  mtd: { count: number; total: number };
  exceptions: number;
  pendingOverrides: number;
  breakdown: Array<{ fee_type: string; count: number; total: number }>;
}

interface RunResult {
  businessDate: string;
  processed: number;
  created: number;
  skipped: number;
  exceptions: number;
}

/* ========== Main Component ========== */
export default function AccrualWorkbench() {
  const qc = useQueryClient();

  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  // Run dialog
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [runDate, setRunDate] = useState(todayStr());
  const [runResult, setRunResult] = useState<RunResult | null>(null);

  // Expanded row
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // --- Queries ---
  const summaryQ = useQuery<{ data: SummaryData }>({
    queryKey: ["tfp-accruals-summary", selectedDate],
    queryFn: () =>
      apiRequest("GET", apiUrl(`/api/v1/tfp-accruals/summary?date=${selectedDate}`)),
    refetchInterval: 30_000,
  });

  const listQ = useQuery<ListResponse>({
    queryKey: ["tfp-accruals", selectedDate, statusFilter, page],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("accrual_date", selectedDate);
      if (statusFilter !== "ALL") params.set("accrual_status", statusFilter);
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      return apiRequest("GET", apiUrl(`/api/v1/tfp-accruals?${params.toString()}`));
    },
    refetchInterval: 30_000,
  });

  const accruals = listQ.data?.data ?? [];
  const total = listQ.data?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);
  const summary = summaryQ.data?.data;

  // --- Run Accrual Mutation ---
  const runMut = useMutation({
    mutationFn: (date: string) =>
      apiRequest("POST", apiUrl("/api/v1/tfp-accruals/run"), { date }),
    onSuccess: (data: { data: RunResult }) => {
      setRunResult(data.data);
      qc.invalidateQueries({ queryKey: ["tfp-accruals"] });
      qc.invalidateQueries({ queryKey: ["tfp-accruals-summary"] });
    },
  });

  const toggleRow = (id: number) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Calculator className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Accrual Workbench</h1>
            <p className="text-sm text-muted-foreground">
              TrustFees Pro daily fee accrual engine -- compute, review, and manage accruals
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              listQ.refetch();
              summaryQ.refetch();
            }}
            disabled={listQ.isFetching}
          >
            <RefreshCw className={`h-4 w-4 ${listQ.isFetching ? "animate-spin" : ""}`} />
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setRunDate(todayStr());
              setRunResult(null);
              setRunDialogOpen(true);
            }}
          >
            <Play className="mr-1 h-3 w-3" /> Run Daily Accrual
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          title="Today's Accruals"
          value={summary?.day.count ?? 0}
          subtitle={summary ? fmtCurrency(summary.day.total) : undefined}
          icon={Calculator}
          accent="bg-blue-600"
        />
        <SummaryCard
          title="MTD Accruals"
          value={summary?.mtd.count ?? 0}
          subtitle={summary ? fmtCurrency(summary.mtd.total) : undefined}
          icon={TrendingUp}
          accent="bg-green-600"
        />
        <SummaryCard
          title="Open Exceptions"
          value={summary?.exceptions ?? 0}
          icon={AlertTriangle}
          accent="bg-amber-500"
        />
        <SummaryCard
          title="Pending Overrides"
          value={summary?.pendingOverrides ?? 0}
          icon={Clock}
          accent="bg-orange-500"
        />
      </div>

      {/* Fee Type Breakdown */}
      {summary?.breakdown && summary.breakdown.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Breakdown by Fee Type ({fmtDate(selectedDate)})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              {summary.breakdown.map((b) => (
                <div
                  key={b.fee_type}
                  className="flex items-center gap-2 rounded-lg border px-3 py-2 dark:border-gray-700"
                >
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">{b.fee_type}</p>
                    <p className="text-sm font-semibold">
                      {b.count} accruals - {fmtCurrency(b.total)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Separator />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Business Date</Label>
          <Input
            type="date"
            value={selectedDate}
            onChange={(e) => {
              setSelectedDate(e.target.value);
              setPage(1);
            }}
            className="w-[180px]"
          />
        </div>
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
                  {s === "ALL" ? "All Statuses" : s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Data Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Accrual Records</CardTitle>
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
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Portfolio</TableHead>
                  <TableHead>Fee Plan</TableHead>
                  <TableHead>Fee Type</TableHead>
                  <TableHead className="text-right">Base Amount</TableHead>
                  <TableHead className="text-right">Computed Fee</TableHead>
                  <TableHead className="text-right">Applied Fee</TableHead>
                  <TableHead>Currency</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listQ.isLoading ? (
                  <SkeletonRows cols={10} />
                ) : accruals.length === 0 ? (
                  <EmptyRow cols={10} msg="No accrual records found for this date" />
                ) : (
                  accruals.map((acc) => (
                    <>
                      <TableRow
                        key={acc.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => toggleRow(acc.id)}
                      >
                        <TableCell className="w-8">
                          {expandedId === acc.id ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {fmtDate(acc.accrual_date)}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {acc.portfolio_id ?? "--"}
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-mono text-sm font-medium">
                              {acc.fee_plan_code ?? `Plan #${acc.fee_plan_id}`}
                            </p>
                            {acc.fee_plan_name && (
                              <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                                {acc.fee_plan_name}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {acc.fee_type ?? "--"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {fmtNumber(acc.base_amount)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {fmtNumber(acc.computed_fee)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm font-medium">
                          {fmtNumber(acc.applied_fee)}
                        </TableCell>
                        <TableCell className="text-sm">{acc.currency}</TableCell>
                        <TableCell>
                          <Badge className={bc(acc.accrual_status)}>
                            {acc.accrual_status}
                          </Badge>
                        </TableCell>
                      </TableRow>

                      {/* Expanded detail row */}
                      {expandedId === acc.id && (
                        <TableRow key={`${acc.id}-detail`}>
                          <TableCell colSpan={10}>
                            <div className="rounded-md border bg-muted/30 p-4 dark:bg-gray-800/50">
                              <h4 className="mb-2 text-sm font-semibold">Computation Details</h4>
                              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                                <div>
                                  <p className="text-xs text-muted-foreground">Accrual ID</p>
                                  <p className="font-mono text-sm">{acc.id}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground">Customer</p>
                                  <p className="text-sm">{acc.customer_id}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground">Idempotency Key</p>
                                  <p className="font-mono text-xs break-all">
                                    {acc.idempotency_key}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground">Created At</p>
                                  <p className="text-sm">
                                    {acc.created_at
                                      ? new Date(acc.created_at).toLocaleString("en-PH")
                                      : "--"}
                                  </p>
                                </div>
                              </div>

                              <div className="mt-3 grid grid-cols-3 gap-4">
                                <div className="rounded border p-2 dark:border-gray-700">
                                  <p className="text-xs text-muted-foreground">Base Amount</p>
                                  <p className="font-mono text-lg font-bold">
                                    {fmtCurrency(acc.base_amount, acc.currency)}
                                  </p>
                                </div>
                                <div className="rounded border p-2 dark:border-gray-700">
                                  <p className="text-xs text-muted-foreground">Computed Fee</p>
                                  <p className="font-mono text-lg font-bold">
                                    {fmtCurrency(acc.computed_fee, acc.currency)}
                                  </p>
                                </div>
                                <div className="rounded border p-2 dark:border-gray-700">
                                  <p className="text-xs text-muted-foreground">Applied Fee</p>
                                  <p className="font-mono text-lg font-bold text-primary">
                                    {fmtCurrency(acc.applied_fee, acc.currency)}
                                  </p>
                                </div>
                              </div>

                              {acc.security_id && (
                                <div className="mt-2">
                                  <p className="text-xs text-muted-foreground">Security</p>
                                  <p className="font-mono text-sm">{acc.security_id}</p>
                                </div>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
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

      {/* Run Daily Accrual Dialog */}
      <Dialog open={runDialogOpen} onOpenChange={setRunDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Run Daily Accrual</DialogTitle>
            <DialogDescription>
              Trigger the TrustFees Pro accrual engine for a specific business date.
              This will compute daily accruals for all ACTIVE fee plans with PERIOD
              charge basis.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3">
            <div className="space-y-2">
              <Label>Business Date</Label>
              <Input
                type="date"
                value={runDate}
                onChange={(e) => {
                  setRunDate(e.target.value);
                  setRunResult(null);
                }}
              />
            </div>

            {/* Result summary */}
            {runResult && (
              <div className="rounded-md border bg-muted/30 p-4 dark:bg-gray-800/50">
                <h4 className="mb-2 text-sm font-semibold text-green-700 dark:text-green-400">
                  Accrual Run Complete
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Plans Processed</p>
                    <p className="text-lg font-bold">{runResult.processed}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Accruals Created</p>
                    <p className="text-lg font-bold text-green-600 dark:text-green-400">
                      {runResult.created}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Skipped (Idempotent)</p>
                    <p className="text-lg font-bold text-muted-foreground">{runResult.skipped}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Exceptions Raised</p>
                    <p className={`text-lg font-bold ${runResult.exceptions > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>
                      {runResult.exceptions}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRunDialogOpen(false)}>
              {runResult ? "Close" : "Cancel"}
            </Button>
            {!runResult && (
              <Button
                onClick={() => runMut.mutate(runDate)}
                disabled={runMut.isPending || !runDate}
              >
                {runMut.isPending ? "Running..." : "Run Accrual"}
              </Button>
            )}
            {runResult && (
              <Button
                onClick={() => {
                  setSelectedDate(runDate);
                  setRunDialogOpen(false);
                }}
              >
                View Results
              </Button>
            )}
          </DialogFooter>

          {runMut.error && (
            <div className="rounded-md border border-destructive p-3 mt-2">
              <p className="text-sm text-destructive">
                {(runMut.error as any)?.message ?? "Accrual run failed"}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
