/**
 * Fund Accounting Console (BRD Screen #6)
 *
 * Primary mid-office view for NAV computation, validation, and publication.
 * Features a cut-off countdown timer, NAV run dashboard with action buttons,
 * summary cards, pricing-level distribution, and optional NAV history chart.
 *
 * Auto-refreshes every 30 seconds.
 */

import { useState, useEffect, useCallback } from "react";
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
import { Skeleton } from "@ui/components/ui/skeleton";
import { Separator } from "@ui/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ui/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@ui/components/ui/dialog";
import {
  Calculator,
  Clock,
  CheckCircle,
  AlertTriangle,
  XCircle,
  RefreshCw,
  TrendingUp,
  BarChart3,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NavStatus {
  id?: string;
  portfolio_id: string;
  portfolio_type: string;
  nav_status: "NOT_STARTED" | "DRAFT" | "VALIDATED" | "PUBLISHED";
  nav_per_unit: number | string | null;
  last_computed: string | null;
}

interface NavHistoryPoint {
  date: string;
  nav_per_unit: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; variant: "default" | "secondary" | "outline" | "destructive" }
> = {
  NOT_STARTED: { label: "Not Started", color: "bg-muted text-foreground", variant: "secondary" },
  DRAFT: { label: "Draft", color: "bg-yellow-100 text-yellow-800", variant: "outline" },
  VALIDATED: { label: "Validated", color: "bg-blue-100 text-blue-800", variant: "outline" },
  PUBLISHED: { label: "Published", color: "bg-green-100 text-green-800", variant: "default" },
};

function formatNavpu(value: number | string | null): string {
  if (value === null || value === undefined) return "-";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "-";
  return num.toLocaleString("en-PH", { minimumFractionDigits: 4, maximumFractionDigits: 6 });
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return "-";
  try {
    return new Date(dateStr).toLocaleString("en-PH", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

// ---------------------------------------------------------------------------
// Cut-off Countdown Hook
// ---------------------------------------------------------------------------

function useCountdown() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const getTargetToday = (hours: number, minutes: number) => {
    const target = new Date(now);
    // PHT is UTC+8
    const utcHours = hours - 8;
    target.setUTCHours(utcHours, minutes, 0, 0);
    return target;
  };

  const cutoff1130 = getTargetToday(11, 30);
  const cutoff1200 = getTargetToday(12, 0);

  const diffMs1130 = cutoff1130.getTime() - now.getTime();
  const diffMs1200 = cutoff1200.getTime() - now.getTime();

  const formatDiff = (ms: number): string => {
    if (ms <= 0) return "00:00:00";
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const getColor = (ms: number): string => {
    if (ms <= 0) return "text-red-600";
    if (ms < 30 * 60 * 1000) return "text-red-600";
    if (ms < 60 * 60 * 1000) return "text-yellow-600";
    return "text-green-600";
  };

  return {
    countdown1130: formatDiff(diffMs1130),
    countdown1200: formatDiff(diffMs1200),
    color1130: getColor(diffMs1130),
    color1200: getColor(diffMs1200),
    isPast1130: diffMs1130 <= 0,
    isPast1200: diffMs1200 <= 0,
  };
}

// ---------------------------------------------------------------------------
// Summary Card Component
// ---------------------------------------------------------------------------

interface SummaryCardProps {
  title: string;
  value: number;
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
            <p className="mt-1 text-3xl font-bold text-foreground">{value}</p>
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

export default function FundAccounting() {
  const queryClient = useQueryClient();
  const countdown = useCountdown();
  const [selectedFund, setSelectedFund] = useState<string | null>(null);

  // ---- Fetch NAV status ----
  const navQuery = useQuery<{ data: NavStatus[]; total: number }>({
    queryKey: ["nav-status"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/nav/status")),
    refetchInterval: 30_000,
  });

  const funds = navQuery.data?.data ?? [];

  // ---- Summary counts ----
  const totalFunds = funds.length;
  const publishedCount = funds.filter((f) => f.nav_status === "PUBLISHED").length;
  const pendingCount = funds.filter((f) => f.nav_status === "DRAFT" || f.nav_status === "VALIDATED").length;
  const notStartedCount = funds.filter((f) => f.nav_status === "NOT_STARTED").length;

  // ---- Pricing source distribution (simulated from fund types) ----
  const level1Count = funds.filter((f) => f.portfolio_type === "EQUITY" || f.portfolio_type === "INDEX").length || Math.ceil(totalFunds * 0.5);
  const level2Count = funds.filter((f) => f.portfolio_type === "BOND" || f.portfolio_type === "FIXED_INCOME").length || Math.ceil(totalFunds * 0.3);
  const level3Count = Math.max(0, totalFunds - level1Count - level2Count);

  // ---- NAV History query (when a fund is selected) ----
  const historyQuery = useQuery<{ data: NavHistoryPoint[] }>({
    queryKey: ["nav-history", selectedFund],
    queryFn: () => apiRequest("GET", apiUrl(`/api/v1/nav/history/${selectedFund}?days=30`)),
    enabled: !!selectedFund,
  });

  // ---- Mutations ----
  const invalidateNav = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["nav-status"] });
  }, [queryClient]);

  const computeMutation = useMutation({
    mutationFn: (portfolioId: string) =>
      apiRequest("POST", apiUrl(`/api/v1/nav/compute/${portfolioId}`), {
        nav_date: new Date().toISOString().split("T")[0],
      }),
    onSuccess: invalidateNav,
  });

  const validateMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", apiUrl(`/api/v1/nav/${id}/validate`)),
    onSuccess: invalidateNav,
  });

  const publishMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", apiUrl(`/api/v1/nav/${id}/publish`)),
    onSuccess: invalidateNav,
  });

  // ---- Render ----
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Calculator className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Fund Accounting Console</h1>
            <p className="text-sm text-muted-foreground">NAV computation, validation & publication</p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => navQuery.refetch()}
          disabled={navQuery.isFetching}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${navQuery.isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Cut-off Countdown */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-6">
            <Clock className="h-6 w-6 text-muted-foreground" />
            <div className="flex gap-8">
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  {countdown.isPast1130 ? "11:30 PHT Cut-off Passed" : "Until 11:30 PHT Cut-off"}
                </p>
                <p className={`text-2xl font-mono font-bold ${countdown.color1130}`}>
                  {countdown.countdown1130}
                </p>
              </div>
              <Separator orientation="vertical" className="h-12" />
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  {countdown.isPast1200 ? "12:00 PHT Deadline Passed" : "Until 12:00 PHT Deadline"}
                </p>
                <p className={`text-2xl font-mono font-bold ${countdown.color1200}`}>
                  {countdown.countdown1200}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard title="Total Funds" value={totalFunds} icon={BarChart3} accent="bg-indigo-600" />
        <SummaryCard title="Published Today" value={publishedCount} icon={CheckCircle} accent="bg-green-600" />
        <SummaryCard title="Pending Validation" value={pendingCount} icon={AlertTriangle} accent="bg-yellow-600" />
        <SummaryCard title="Not Started" value={notStartedCount} icon={XCircle} accent="bg-red-600" />
      </div>

      {/* Pricing Source Distribution */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Pricing Source Distribution</CardTitle>
          <CardDescription>Positions by pricing level</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Badge className="bg-green-100 text-green-800">Level 1: {level1Count}</Badge>
            <Badge className="bg-blue-100 text-blue-800">Level 2: {level2Count}</Badge>
            <Badge className="bg-orange-100 text-orange-800">Level 3: {level3Count}</Badge>
          </div>
          {totalFunds > 0 && (
            <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="bg-green-500 transition-all"
                style={{ width: `${(level1Count / totalFunds) * 100}%` }}
              />
              <div
                className="bg-blue-500 transition-all"
                style={{ width: `${(level2Count / totalFunds) * 100}%` }}
              />
              <div
                className="bg-orange-500 transition-all"
                style={{ width: `${(level3Count / totalFunds) * 100}%` }}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* NAV Run Dashboard Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">NAV Run Dashboard</CardTitle>
          <CardDescription>UITF funds - click a fund to view NAV history</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto rounded-md border-t">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fund Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">NAVpu</TableHead>
                  <TableHead>Last Computed</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {navQuery.isLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 6 }).map((_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-20" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : funds.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No funds found. Check API connectivity.
                    </TableCell>
                  </TableRow>
                ) : (
                  funds.map((fund) => {
                    const cfg = STATUS_CONFIG[fund.nav_status] ?? STATUS_CONFIG.NOT_STARTED;
                    return (
                      <TableRow
                        key={fund.portfolio_id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => setSelectedFund(fund.portfolio_id)}
                      >
                        <TableCell className="font-medium">{fund.portfolio_id}</TableCell>
                        <TableCell>{fund.portfolio_type}</TableCell>
                        <TableCell>
                          <Badge className={cfg.color}>{cfg.label}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatNavpu(fund.nav_per_unit)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDateTime(fund.last_computed)}
                        </TableCell>
                        <TableCell className="text-right">
                          {fund.nav_status === "NOT_STARTED" && (
                            <Button
                              size="sm"
                              variant="default"
                              disabled={computeMutation.isPending}
                              onClick={(e) => {
                                e.stopPropagation();
                                computeMutation.mutate(fund.portfolio_id);
                              }}
                            >
                              Compute
                            </Button>
                          )}
                          {fund.nav_status === "DRAFT" && fund.id && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-blue-300 text-blue-700 hover:bg-blue-50"
                              disabled={validateMutation.isPending}
                              onClick={(e) => {
                                e.stopPropagation();
                                validateMutation.mutate(fund.id!);
                              }}
                            >
                              Validate
                            </Button>
                          )}
                          {fund.nav_status === "VALIDATED" && fund.id && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-green-300 text-green-700 hover:bg-green-50"
                              disabled={publishMutation.isPending}
                              onClick={(e) => {
                                e.stopPropagation();
                                publishMutation.mutate(fund.id!);
                              }}
                            >
                              Publish
                            </Button>
                          )}
                          {fund.nav_status === "PUBLISHED" && (
                            <span className="text-xs text-green-600 font-medium">Done</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* NAV History Dialog */}
      <Dialog open={!!selectedFund} onOpenChange={(open) => !open && setSelectedFund(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              NAV History - {selectedFund}
            </DialogTitle>
          </DialogHeader>
          <div className="h-64">
            {historyQuery.isLoading ? (
              <div className="flex h-full items-center justify-center">
                <Skeleton className="h-48 w-full" />
              </div>
            ) : historyQuery.isError ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Unable to load NAV history for this fund.
              </div>
            ) : (historyQuery.data?.data ?? []).length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                No historical NAV data available for this fund.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={historyQuery.data?.data ?? []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} domain={["auto", "auto"]} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="nav_per_unit"
                    stroke="#6366f1"
                    strokeWidth={2}
                    dot={{ r: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
