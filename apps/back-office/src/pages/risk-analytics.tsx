/**
 * Risk Analytics Dashboard — Phase 3J (VAR, Duration, IREP, Back-Testing)
 *
 * Four-tab interface covering Value-at-Risk computation, duration analysis,
 * IREP price-movement monitoring with dispositions, and VAR back-testing.
 * Summary cards at the top surface key risk metrics at a glance.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@ui/lib/queryClient";
import { apiUrl } from "@ui/lib/api-url";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/ui/card";
import { Badge } from "@ui/components/ui/badge";
import { Button } from "@ui/components/ui/button";
import { Input } from "@ui/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@ui/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@ui/components/ui/select";
import { Skeleton } from "@ui/components/ui/skeleton";
import { Separator } from "@ui/components/ui/separator";
import {
  TrendingDown, Clock, AlertTriangle, FileText,
  RefreshCw, Play, Search, ArrowRight, CheckCircle, XCircle,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface VarResult {
  var_amount: number;
  var_pct: number;
  portfolio_value: number;
  method: string;
  computed_at: string;
}

interface DurationResult {
  macaulay_duration: number | null;
  modified_duration: number | null;
  positions: DurationPosition[];
}

interface DurationPosition {
  security_id: string;
  ticker: string;
  duration: number;
  weight_pct: number;
}

interface BenchmarkDuration {
  benchmark_id: string;
  duration: number;
  as_of: string;
}

interface IrepDashboard {
  flagged_count: number;
  total_monitored: number;
  recent_dispositions: IrepDisposition[];
}

interface IrepDisposition {
  id: string;
  client_id: string;
  security_id: string;
  price_movement_pct: number;
  disposition: string;
  recorded_at: string;
}

interface PriceMovement {
  security_id: string;
  current_price: number;
  previous_price: number;
  change_pct: number;
  breached: boolean;
}

interface BacktestRow {
  date: string;
  predicted_var: number;
  actual_pnl: number;
  breached: boolean;
}

interface BacktestResult {
  rows: BacktestRow[];
  breach_count: number;
  breach_pct: number;
  total_days: number;
}

interface BacktestIncomeResult {
  expected_income: number;
  actual_income: number;
  variance: number;
  variance_pct: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatNumber(n: number): string {
  return n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPct(n: number): string {
  return (n * 100).toFixed(2) + "%";
}

function formatDate(d: string): string {
  try {
    return new Date(d).toLocaleDateString("en-PH", {
      month: "short", day: "numeric", year: "numeric",
    });
  } catch {
    return d;
  }
}

function formatDateTime(d: string): string {
  try {
    return new Date(d).toLocaleString("en-PH", {
      month: "short", day: "numeric", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return d;
  }
}

// ---------------------------------------------------------------------------
// Reusable sub-components
// ---------------------------------------------------------------------------
function SummaryCard({
  title, value, icon: Icon, accent,
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
            <TableCell key={j}><Skeleton className="h-4 w-16" /></TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

function EmptyRow({ cols, msg }: { cols: number; msg: string }) {
  return (
    <TableRow>
      <TableCell colSpan={cols} className="py-8 text-center text-muted-foreground">{msg}</TableCell>
    </TableRow>
  );
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <p className="mt-1 text-3xl font-bold tracking-tight">{value}</p>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------
export default function RiskAnalytics() {
  const qc = useQueryClient();
  const [tab, setTab] = useState("var");

  // ---- VAR Engine state ----
  const [varPortfolioId, setVarPortfolioId] = useState("");
  const [varMethod, setVarMethod] = useState("historical");
  const [varConfidence, setVarConfidence] = useState("0.95");
  const [varHorizon, setVarHorizon] = useState("1");
  const [varHistory, setVarHistory] = useState<VarResult[]>([]);

  // ---- Duration state ----
  const [durPortfolioId, setDurPortfolioId] = useState("");
  const [durResult, setDurResult] = useState<DurationResult | null>(null);
  const [benchmarkId, setBenchmarkId] = useState("");
  const [benchmarkResult, setBenchmarkResult] = useState<BenchmarkDuration | null>(null);

  // ---- IREP state ----
  const [irepSecurityId, setIrepSecurityId] = useState("");
  const [irepThreshold, setIrepThreshold] = useState("5");
  const [priceMovement, setPriceMovement] = useState<PriceMovement | null>(null);
  const [dispClientId, setDispClientId] = useState("");
  const [dispMovementPct, setDispMovementPct] = useState("");
  const [dispDisposition, setDispDisposition] = useState("HOLD");

  // ---- Back-Testing state ----
  const [btPortfolioId, setBtPortfolioId] = useState("");
  const [btPeriod, setBtPeriod] = useState("252");
  const [btResult, setBtResult] = useState<BacktestResult | null>(null);
  const [btIncomeResult, setBtIncomeResult] = useState<BacktestIncomeResult | null>(null);

  // ---- Summary Queries ----
  const irepDashboardQ = useQuery<IrepDashboard>({
    queryKey: ["irep-dashboard"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/risk-analytics/irep/dashboard")),
    refetchInterval: 60_000,
  });
  const irepDashboard = irepDashboardQ.data;

  // ---- VAR Mutation ----
  const computeVarMut = useMutation({
    mutationFn: (body: {
      portfolioId: string;
      method: string;
      confidenceLevel: number;
      horizon: number;
    }) => apiRequest("POST", apiUrl("/api/v1/risk-analytics/var/compute"), body),
    onSuccess: (data: VarResult) => {
      setVarHistory((prev) => [data, ...prev]);
      qc.invalidateQueries({ queryKey: ["var-result"] });
    },
  });

  // ---- Duration Mutations ----
  const macaulayMut = useMutation({
    mutationFn: (portfolioId: string) =>
      apiRequest("GET", apiUrl(`/api/v1/risk-analytics/duration/macaulay/${portfolioId}`)),
    onSuccess: (data: DurationResult) => {
      setDurResult((prev) => ({
        macaulay_duration: data.macaulay_duration,
        modified_duration: prev?.modified_duration ?? null,
        positions: data.positions ?? prev?.positions ?? [],
      }));
      qc.invalidateQueries({ queryKey: ["duration-result"] });
    },
  });

  const modifiedMut = useMutation({
    mutationFn: (portfolioId: string) =>
      apiRequest("GET", apiUrl(`/api/v1/risk-analytics/duration/modified/${portfolioId}`)),
    onSuccess: (data: DurationResult) => {
      setDurResult((prev) => ({
        macaulay_duration: prev?.macaulay_duration ?? null,
        modified_duration: data.modified_duration,
        positions: data.positions ?? prev?.positions ?? [],
      }));
      qc.invalidateQueries({ queryKey: ["duration-result"] });
    },
  });

  const benchmarkMut = useMutation({
    mutationFn: (bId: string) =>
      apiRequest("GET", apiUrl(`/api/v1/risk-analytics/duration/benchmark/${bId}`)),
    onSuccess: (data: BenchmarkDuration) => {
      setBenchmarkResult(data);
    },
  });

  // ---- IREP Mutations ----
  const priceMovementMut = useMutation({
    mutationFn: (securityId: string) =>
      apiRequest("GET", apiUrl(`/api/v1/risk-analytics/irep/price-movement/${securityId}`)),
    onSuccess: (data: PriceMovement) => {
      setPriceMovement(data);
    },
  });

  const dispositionMut = useMutation({
    mutationFn: (body: {
      clientId: string;
      priceMovementPct: number;
      disposition: string;
    }) => apiRequest("POST", apiUrl("/api/v1/risk-analytics/irep/disposition"), body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["irep-dashboard"] });
      setDispClientId("");
      setDispMovementPct("");
      setDispDisposition("HOLD");
    },
  });

  // ---- Back-Test Mutations ----
  const backtestMut = useMutation({
    mutationFn: (body: { portfolioId: string; period: number }) =>
      apiRequest("POST", apiUrl("/api/v1/risk-analytics/var/backtest"), body),
    onSuccess: (data: BacktestResult) => {
      setBtResult(data);
      qc.invalidateQueries({ queryKey: ["backtest-result"] });
    },
  });

  const backtestIncomeMut = useMutation({
    mutationFn: (body: { portfolioId: string; period: number }) =>
      apiRequest("POST", apiUrl("/api/v1/risk-analytics/var/backtest-income"), body),
    onSuccess: (data: BacktestIncomeResult) => {
      setBtIncomeResult(data);
    },
  });

  // ---- Handlers ----
  const handleComputeVar = () => {
    if (!varPortfolioId.trim()) return;
    computeVarMut.mutate({
      portfolioId: varPortfolioId.trim(),
      method: varMethod,
      confidenceLevel: parseFloat(varConfidence),
      horizon: parseInt(varHorizon, 10),
    });
  };

  const handleMacaulay = () => {
    if (!durPortfolioId.trim()) return;
    macaulayMut.mutate(durPortfolioId.trim());
  };

  const handleModified = () => {
    if (!durPortfolioId.trim()) return;
    modifiedMut.mutate(durPortfolioId.trim());
  };

  const handleBenchmark = () => {
    if (!benchmarkId.trim()) return;
    benchmarkMut.mutate(benchmarkId.trim());
  };

  const handlePriceCheck = () => {
    if (!irepSecurityId.trim()) return;
    priceMovementMut.mutate(irepSecurityId.trim());
  };

  const handleDisposition = () => {
    if (!dispClientId.trim() || !dispMovementPct) return;
    dispositionMut.mutate({
      clientId: dispClientId.trim(),
      priceMovementPct: parseFloat(dispMovementPct),
      disposition: dispDisposition,
    });
  };

  const handleBacktest = () => {
    if (!btPortfolioId.trim()) return;
    setBtResult(null);
    setBtIncomeResult(null);
    backtestMut.mutate({
      portfolioId: btPortfolioId.trim(),
      period: parseInt(btPeriod, 10),
    });
  };

  const handleBacktestIncome = () => {
    if (!btPortfolioId.trim()) return;
    backtestIncomeMut.mutate({
      portfolioId: btPortfolioId.trim(),
      period: parseInt(btPeriod, 10),
    });
  };

  // ---- Derived summary values ----
  const latestVar = varHistory.length > 0 ? varHistory[0] : null;
  const summaryVarPct = latestVar ? formatPct(latestVar.var_pct) : "--";
  const summaryModDuration = durResult?.modified_duration != null
    ? durResult.modified_duration.toFixed(2) : "--";
  const summaryPriceAlerts = irepDashboard?.flagged_count ?? 0;
  const summaryDispositions = irepDashboard?.recent_dispositions?.length ?? 0;

  // ---- Render ----
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <TrendingDown className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Risk Analytics</h1>
            <p className="text-sm text-muted-foreground">VAR computation, duration analysis, IREP monitoring, and back-testing</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            irepDashboardQ.refetch();
          }}
          disabled={irepDashboardQ.isFetching}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${irepDashboardQ.isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <SummaryCard title="Portfolio VAR (95%)" value={summaryVarPct} icon={TrendingDown} accent="bg-red-600" />
        <SummaryCard title="Duration (Modified)" value={summaryModDuration} icon={Clock} accent="bg-blue-600" />
        <SummaryCard title="Price Alerts" value={summaryPriceAlerts} icon={AlertTriangle} accent="bg-yellow-500" />
        <SummaryCard title="IREP Dispositions" value={summaryDispositions} icon={FileText} accent="bg-green-600" />
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="var">VAR Engine</TabsTrigger>
          <TabsTrigger value="duration">Duration</TabsTrigger>
          <TabsTrigger value="irep">IREP</TabsTrigger>
          <TabsTrigger value="backtest">Back-Testing</TabsTrigger>
        </TabsList>

        {/* ==================== VAR ENGINE TAB ==================== */}
        <TabsContent value="var" className="space-y-4">
          <Card>
            <CardContent className="pt-6">
              <div className="grid gap-4 md:grid-cols-5 items-end">
                <div className="space-y-1">
                  <label className="text-xs font-medium">Portfolio ID</label>
                  <Input
                    placeholder="e.g., PF-001"
                    value={varPortfolioId}
                    onChange={(e) => setVarPortfolioId(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Method</label>
                  <Select value={varMethod} onValueChange={setVarMethod}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="historical">Historical</SelectItem>
                      <SelectItem value="parametric">Parametric</SelectItem>
                      <SelectItem value="monte_carlo">Monte Carlo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Confidence Level</label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max="0.99"
                    value={varConfidence}
                    onChange={(e) => setVarConfidence(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Horizon (days)</label>
                  <Input
                    type="number"
                    min="1"
                    value={varHorizon}
                    onChange={(e) => setVarHorizon(e.target.value)}
                  />
                </div>
                <Button
                  onClick={handleComputeVar}
                  disabled={computeVarMut.isPending || !varPortfolioId.trim()}
                >
                  <Play className="h-4 w-4 mr-2" />
                  {computeVarMut.isPending ? "Computing..." : "Compute VAR"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {computeVarMut.isError && (
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-red-600">VAR computation failed. Check the portfolio ID and try again.</p>
              </CardContent>
            </Card>
          )}

          {latestVar && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Latest VAR Result</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-5">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">VAR Amount</p>
                    <p className="text-lg font-bold text-red-600">{formatNumber(latestVar.var_amount)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">VAR %</p>
                    <p className="text-lg font-bold">{formatPct(latestVar.var_pct)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Portfolio Value</p>
                    <p className="text-lg font-bold">{formatNumber(latestVar.portfolio_value)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Method</p>
                    <p className="text-lg font-bold capitalize">{latestVar.method.replace("_", " ")}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Computed At</p>
                    <p className="text-sm font-medium">{formatDateTime(latestVar.computed_at)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {varHistory.length > 1 && (
            <>
              <Separator />
              <h3 className="text-sm font-semibold">Computation History</h3>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Method</TableHead>
                      <TableHead className="text-right">VAR Amount</TableHead>
                      <TableHead className="text-right">VAR %</TableHead>
                      <TableHead className="text-right">Portfolio Value</TableHead>
                      <TableHead>Computed At</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {varHistory.map((v, idx) => (
                      <TableRow key={idx}>
                        <TableCell>
                          <Badge className="bg-blue-100 text-blue-800 capitalize">
                            {v.method.replace("_", " ")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-red-600">
                          {formatNumber(v.var_amount)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatPct(v.var_pct)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatNumber(v.portfolio_value)}
                        </TableCell>
                        <TableCell className="text-xs">{formatDateTime(v.computed_at)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </TabsContent>

        {/* ==================== DURATION TAB ==================== */}
        <TabsContent value="duration" className="space-y-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-end gap-3">
                <div className="space-y-1 flex-1 max-w-sm">
                  <label className="text-xs font-medium">Portfolio ID</label>
                  <Input
                    placeholder="e.g., PF-001"
                    value={durPortfolioId}
                    onChange={(e) => setDurPortfolioId(e.target.value)}
                  />
                </div>
                <Button
                  onClick={handleMacaulay}
                  disabled={macaulayMut.isPending || !durPortfolioId.trim()}
                  variant="outline"
                >
                  {macaulayMut.isPending ? "Loading..." : "Compute Macaulay"}
                </Button>
                <Button
                  onClick={handleModified}
                  disabled={modifiedMut.isPending || !durPortfolioId.trim()}
                  variant="outline"
                >
                  {modifiedMut.isPending ? "Loading..." : "Compute Modified"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {(macaulayMut.isError || modifiedMut.isError) && (
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-red-600">Duration computation failed. Check the portfolio ID and try again.</p>
              </CardContent>
            </Card>
          )}

          {durResult && (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <MetricCard
                  label="Macaulay Duration"
                  value={durResult.macaulay_duration != null ? durResult.macaulay_duration.toFixed(4) : "--"}
                />
                <MetricCard
                  label="Modified Duration"
                  value={durResult.modified_duration != null ? durResult.modified_duration.toFixed(4) : "--"}
                />
              </div>

              {durResult.positions.length > 0 && (
                <>
                  <Separator />
                  <h3 className="text-sm font-semibold">Weighted Positions Breakdown</h3>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Security</TableHead>
                          <TableHead>Ticker</TableHead>
                          <TableHead className="text-right">Duration</TableHead>
                          <TableHead className="text-right">Weight %</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {durResult.positions.map((pos, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-mono text-xs">{pos.security_id}</TableCell>
                            <TableCell className="text-sm font-medium">{pos.ticker}</TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {pos.duration.toFixed(4)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {pos.weight_pct.toFixed(2)}%
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </>
          )}

          <Separator />

          {/* Benchmark Comparison */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Benchmark Comparison</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-3">
                <div className="space-y-1 flex-1 max-w-sm">
                  <label className="text-xs font-medium">Benchmark ID</label>
                  <Input
                    placeholder="e.g., BM-GOVT-5Y"
                    value={benchmarkId}
                    onChange={(e) => setBenchmarkId(e.target.value)}
                  />
                </div>
                <Button
                  onClick={handleBenchmark}
                  disabled={benchmarkMut.isPending || !benchmarkId.trim()}
                >
                  <ArrowRight className="h-4 w-4 mr-2" />
                  {benchmarkMut.isPending ? "Loading..." : "Compare"}
                </Button>
              </div>

              {benchmarkMut.isError && (
                <p className="mt-3 text-sm text-red-600">Failed to load benchmark duration.</p>
              )}

              {benchmarkResult && durResult?.modified_duration != null && (
                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <div className="rounded-lg border p-4">
                    <p className="text-xs font-medium text-muted-foreground">Portfolio Duration</p>
                    <p className="mt-1 text-2xl font-bold">{durResult.modified_duration.toFixed(4)}</p>
                  </div>
                  <div className="rounded-lg border p-4">
                    <p className="text-xs font-medium text-muted-foreground">Benchmark Duration</p>
                    <p className="mt-1 text-2xl font-bold">{benchmarkResult.duration.toFixed(4)}</p>
                  </div>
                  <div className="rounded-lg border p-4">
                    <p className="text-xs font-medium text-muted-foreground">Difference</p>
                    <p className={`mt-1 text-2xl font-bold ${
                      durResult.modified_duration - benchmarkResult.duration > 0 ? "text-red-600" : "text-green-600"
                    }`}>
                      {(durResult.modified_duration - benchmarkResult.duration).toFixed(4)}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ==================== IREP TAB ==================== */}
        <TabsContent value="irep" className="space-y-4">
          {/* IREP Dashboard Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">IREP Dashboard</CardTitle>
            </CardHeader>
            <CardContent>
              {irepDashboardQ.isLoading ? (
                <div className="grid gap-4 md:grid-cols-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              ) : irepDashboard ? (
                <>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="rounded-lg border p-4">
                      <p className="text-xs font-medium text-muted-foreground">Flagged Securities</p>
                      <p className="mt-1 text-2xl font-bold text-red-600">{irepDashboard.flagged_count}</p>
                    </div>
                    <div className="rounded-lg border p-4">
                      <p className="text-xs font-medium text-muted-foreground">Total Monitored</p>
                      <p className="mt-1 text-2xl font-bold">{irepDashboard.total_monitored}</p>
                    </div>
                    <div className="rounded-lg border p-4">
                      <p className="text-xs font-medium text-muted-foreground">Recent Dispositions</p>
                      <p className="mt-1 text-2xl font-bold">{irepDashboard.recent_dispositions.length}</p>
                    </div>
                  </div>

                  {irepDashboard.recent_dispositions.length > 0 && (
                    <div className="mt-4 rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Client</TableHead>
                            <TableHead>Security</TableHead>
                            <TableHead className="text-right">Movement %</TableHead>
                            <TableHead>Disposition</TableHead>
                            <TableHead>Recorded</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {irepDashboard.recent_dispositions.map((d) => (
                            <TableRow key={d.id}>
                              <TableCell className="font-mono text-xs">{d.client_id}</TableCell>
                              <TableCell className="font-mono text-xs">{d.security_id}</TableCell>
                              <TableCell className="text-right font-mono text-sm">
                                {d.price_movement_pct.toFixed(2)}%
                              </TableCell>
                              <TableCell>
                                <Badge className={
                                  d.disposition === "SELL" ? "bg-red-100 text-red-800" :
                                  d.disposition === "BUY_MORE" ? "bg-green-100 text-green-800" :
                                  "bg-gray-100 text-gray-800"
                                }>
                                  {d.disposition}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs">{formatDateTime(d.recorded_at)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No IREP data available.</p>
              )}
            </CardContent>
          </Card>

          <Separator />

          {/* Price Movement Checker */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Price Movement Checker</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-3">
                <div className="space-y-1 flex-1 max-w-xs">
                  <label className="text-xs font-medium">Security ID</label>
                  <Input
                    placeholder="e.g., SEC-001"
                    value={irepSecurityId}
                    onChange={(e) => setIrepSecurityId(e.target.value)}
                  />
                </div>
                <div className="space-y-1 w-32">
                  <label className="text-xs font-medium">Threshold %</label>
                  <Input
                    type="number"
                    step="0.5"
                    value={irepThreshold}
                    onChange={(e) => setIrepThreshold(e.target.value)}
                  />
                </div>
                <Button
                  onClick={handlePriceCheck}
                  disabled={priceMovementMut.isPending || !irepSecurityId.trim()}
                >
                  <Search className="h-4 w-4 mr-2" />
                  {priceMovementMut.isPending ? "Checking..." : "Check"}
                </Button>
              </div>

              {priceMovementMut.isError && (
                <p className="mt-3 text-sm text-red-600">Failed to check price movement.</p>
              )}

              {priceMovement && (
                <div className="mt-4 grid gap-4 md:grid-cols-4">
                  <div className="rounded-lg border p-4">
                    <p className="text-xs font-medium text-muted-foreground">Current Price</p>
                    <p className="mt-1 text-xl font-bold">{formatNumber(priceMovement.current_price)}</p>
                  </div>
                  <div className="rounded-lg border p-4">
                    <p className="text-xs font-medium text-muted-foreground">Previous Price</p>
                    <p className="mt-1 text-xl font-bold">{formatNumber(priceMovement.previous_price)}</p>
                  </div>
                  <div className="rounded-lg border p-4">
                    <p className="text-xs font-medium text-muted-foreground">Change %</p>
                    <p className={`mt-1 text-xl font-bold ${
                      priceMovement.change_pct >= 0 ? "text-green-600" : "text-red-600"
                    }`}>
                      {priceMovement.change_pct.toFixed(2)}%
                    </p>
                  </div>
                  <div className="rounded-lg border p-4">
                    <p className="text-xs font-medium text-muted-foreground">Breached</p>
                    <div className="mt-1">
                      {priceMovement.breached ? (
                        <Badge className="bg-red-100 text-red-800">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          BREACHED
                        </Badge>
                      ) : (
                        <Badge className="bg-green-100 text-green-800">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          WITHIN LIMIT
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Separator />

          {/* Capture Disposition */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Capture Disposition</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-4 items-end">
                <div className="space-y-1">
                  <label className="text-xs font-medium">Client ID</label>
                  <Input
                    placeholder="e.g., CL-001"
                    value={dispClientId}
                    onChange={(e) => setDispClientId(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Price Movement %</label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="e.g., 7.5"
                    value={dispMovementPct}
                    onChange={(e) => setDispMovementPct(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Disposition</label>
                  <Select value={dispDisposition} onValueChange={setDispDisposition}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="HOLD">HOLD</SelectItem>
                      <SelectItem value="SELL">SELL</SelectItem>
                      <SelectItem value="BUY_MORE">BUY MORE</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={handleDisposition}
                  disabled={dispositionMut.isPending || !dispClientId.trim() || !dispMovementPct}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  {dispositionMut.isPending ? "Recording..." : "Record"}
                </Button>
              </div>

              {dispositionMut.isError && (
                <p className="mt-3 text-sm text-red-600">Failed to record disposition.</p>
              )}

              {dispositionMut.isSuccess && (
                <p className="mt-3 text-sm text-green-600">Disposition recorded successfully.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ==================== BACK-TESTING TAB ==================== */}
        <TabsContent value="backtest" className="space-y-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-end gap-3">
                <div className="space-y-1 flex-1 max-w-sm">
                  <label className="text-xs font-medium">Portfolio ID</label>
                  <Input
                    placeholder="e.g., PF-001"
                    value={btPortfolioId}
                    onChange={(e) => setBtPortfolioId(e.target.value)}
                  />
                </div>
                <div className="space-y-1 w-36">
                  <label className="text-xs font-medium">Period (days)</label>
                  <Input
                    type="number"
                    min="1"
                    value={btPeriod}
                    onChange={(e) => setBtPeriod(e.target.value)}
                  />
                </div>
                <Button
                  onClick={handleBacktest}
                  disabled={backtestMut.isPending || !btPortfolioId.trim()}
                >
                  <Play className="h-4 w-4 mr-2" />
                  {backtestMut.isPending ? "Running..." : "Run Back-Test"}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleBacktestIncome}
                  disabled={backtestIncomeMut.isPending || !btPortfolioId.trim()}
                >
                  {backtestIncomeMut.isPending ? "Loading..." : "Back-Test vs Income"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {backtestMut.isError && (
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-red-600">Back-test failed. Check the portfolio ID and try again.</p>
              </CardContent>
            </Card>
          )}

          {btResult && (
            <>
              {/* Summary */}
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-lg border p-4">
                  <p className="text-xs font-medium text-muted-foreground">Breach Count</p>
                  <p className="mt-1 text-2xl font-bold text-red-600">{btResult.breach_count} / {btResult.total_days}</p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-xs font-medium text-muted-foreground">Breach %</p>
                  <p className="mt-1 text-2xl font-bold">{btResult.breach_pct.toFixed(2)}%</p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-xs font-medium text-muted-foreground">Result</p>
                  <div className="mt-1">
                    {btResult.breach_pct > 5 ? (
                      <Badge className="bg-red-100 text-red-800 text-base px-3 py-1">
                        <XCircle className="h-4 w-4 mr-1" />
                        FAIL
                      </Badge>
                    ) : (
                      <Badge className="bg-green-100 text-green-800 text-base px-3 py-1">
                        <CheckCircle className="h-4 w-4 mr-1" />
                        PASS
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              {/* Back-test results table */}
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Predicted VAR</TableHead>
                      <TableHead className="text-right">Actual P&L</TableHead>
                      <TableHead>Breached</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {btResult.rows.length === 0 ? (
                      <EmptyRow cols={4} msg="No back-test data returned" />
                    ) : (
                      btResult.rows.map((row, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="text-sm">{formatDate(row.date)}</TableCell>
                          <TableCell className="text-right font-mono text-sm text-red-600">
                            {formatNumber(row.predicted_var)}
                          </TableCell>
                          <TableCell className={`text-right font-mono text-sm ${
                            row.actual_pnl < 0 ? "text-red-600" : "text-green-600"
                          }`}>
                            {formatNumber(row.actual_pnl)}
                          </TableCell>
                          <TableCell>
                            {row.breached ? (
                              <Badge className="bg-red-100 text-red-800">
                                <XCircle className="h-3 w-3 mr-1" />
                                Breached
                              </Badge>
                            ) : (
                              <Badge className="bg-green-100 text-green-800">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                OK
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </>
          )}

          {/* Back-Test vs Income */}
          {backtestIncomeMut.isError && (
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-red-600">Income back-test failed. Check the portfolio ID and try again.</p>
              </CardContent>
            </Card>
          )}

          {btIncomeResult && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Expected vs Actual Income</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-4">
                  <div className="rounded-lg border p-4">
                    <p className="text-xs font-medium text-muted-foreground">Expected Income</p>
                    <p className="mt-1 text-xl font-bold">{formatNumber(btIncomeResult.expected_income)}</p>
                  </div>
                  <div className="rounded-lg border p-4">
                    <p className="text-xs font-medium text-muted-foreground">Actual Income</p>
                    <p className="mt-1 text-xl font-bold">{formatNumber(btIncomeResult.actual_income)}</p>
                  </div>
                  <div className="rounded-lg border p-4">
                    <p className="text-xs font-medium text-muted-foreground">Variance</p>
                    <p className={`mt-1 text-xl font-bold ${
                      btIncomeResult.variance < 0 ? "text-red-600" : "text-green-600"
                    }`}>
                      {formatNumber(btIncomeResult.variance)}
                    </p>
                  </div>
                  <div className="rounded-lg border p-4">
                    <p className="text-xs font-medium text-muted-foreground">Variance %</p>
                    <p className={`mt-1 text-xl font-bold ${
                      btIncomeResult.variance_pct < 0 ? "text-red-600" : "text-green-600"
                    }`}>
                      {btIncomeResult.variance_pct.toFixed(2)}%
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
