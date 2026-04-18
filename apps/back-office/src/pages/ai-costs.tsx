/**
 * AI & Routing Analytics Dashboard (Phase 6C)
 *
 * Intelligent order routing analytics covering broker leaderboard,
 * execution quality metrics, routing decision log, and the broker
 * recommendation engine. Designed for Philippine equities market
 * (PSE-connected brokers).
 *
 * Tabs:
 *   1. Leaderboard  — Ranked brokers by composite score
 *   2. Execution Quality — Per-broker quality metrics with monthly trend
 *   3. Decision Log — Filterable routing decision history
 *   4. Recommend    — Run broker recommendation for a trade
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@ui/lib/queryClient";
import { apiUrl } from "@ui/lib/api-url";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/ui/card";
import { Badge } from "@ui/components/ui/badge";
import { Button } from "@ui/components/ui/button";
import { Input } from "@ui/components/ui/input";
import { Label } from "@ui/components/ui/label";
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
  Trophy, BarChart3, Route, Zap,
  RefreshCw, Search, ChevronLeft, ChevronRight,
  TrendingUp, TrendingDown, ArrowUpDown,
  Building2, Activity, Clock, AlertTriangle,
  CheckCircle, XCircle, Minus,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BrokerLeaderboardEntry {
  rank: number;
  brokerId: string;
  brokerName: string;
  compositeScore: number;
  fillRate: number;
  avgSlippage: number;
  commission: number;
  avgLatencyMs: number;
  volumeHandled: number;
  specializations: string[];
}

interface ExecutionQuality {
  brokerId: string;
  brokerName: string;
  fillRate: number;
  avgSlippage: number;
  avgLatencyMs: number;
  volumeHandled: number;
  rejectionRate: number;
  monthlyTrend: { month: string; fillRate: number; slippage: number }[];
}

interface RoutingDecision {
  decisionId: string;
  securityId: number;
  securityName: string;
  quantity: number;
  side: string;
  selectedBrokerId: string;
  selectedBrokerName: string;
  score: number;
  alternativeCount: number;
  reasoning: string;
  outcome: string;
  createdAt: string;
}

interface BrokerRecommendation {
  brokerId: string;
  brokerName: string;
  score: number;
  fillRate: number;
  avgSlippage: number;
  commission: number;
  avgLatencyMs: number;
  specializations: string[];
}

interface RecommendationResult {
  recommendations: BrokerRecommendation[];
  bestPick: string;
  reasoning: string;
}

interface BrokerOption {
  brokerId: string;
  brokerName: string;
  active: boolean;
  specializations: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OUTCOME_STYLES: Record<string, { label: string; className: string }> = {
  PENDING: { label: "Pending", className: "bg-muted text-foreground border-border" },
  FILLED: { label: "Filled", className: "bg-green-100 text-green-700 border-green-200" },
  PARTIAL: { label: "Partial", className: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  REJECTED: { label: "Rejected", className: "bg-red-100 text-red-700 border-red-200" },
};

const SIDE_STYLES: Record<string, string> = {
  BUY: "bg-emerald-100 text-emerald-800 border-emerald-200",
  SELL: "bg-red-100 text-red-800 border-red-200",
};

const RANK_COLORS = ["text-yellow-600", "text-muted-foreground", "text-orange-700"];

const PERIOD_OPTIONS = [
  { value: "1M", label: "1 Month" },
  { value: "3M", label: "3 Months" },
  { value: "6M", label: "6 Months" },
  { value: "ALL", label: "All Time" },
];

const SECURITIES = [
  { id: 1, name: "SM Investments (SM)" },
  { id: 2, name: "Ayala Corporation (AC)" },
  { id: 3, name: "BDO Unibank (BDO)" },
  { id: 4, name: "JG Summit (JGS)" },
  { id: 5, name: "PLDT Inc (TEL)" },
  { id: 6, name: "Aboitiz Equity (AEV)" },
  { id: 7, name: "Metro Pacific (MPI)" },
  { id: 8, name: "Universal Robina (URC)" },
  { id: 9, name: "BPI (BPI)" },
  { id: 10, name: "Globe Telecom (GLO)" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(d: string | null): string {
  if (!d) return "-";
  try {
    return new Date(d).toLocaleDateString("en-PH", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return d ?? "-";
  }
}

function formatPct(n: number, decimals = 2): string {
  return `${(n * 100).toFixed(decimals)}%`;
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-PH").format(n);
}

function formatVolume(n: number): string {
  if (n >= 1_000_000_000) return `PHP ${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `PHP ${(n / 1_000_000).toFixed(1)}M`;
  return `PHP ${formatNumber(n)}`;
}

// ---------------------------------------------------------------------------
// Reusable sub-components
// ---------------------------------------------------------------------------

function MetricCard({
  title,
  value,
  icon: Icon,
  accent,
  subtitle,
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  accent: string;
  subtitle?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="mt-1 text-2xl font-bold">{value}</p>
            {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
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
      {Array.from({ length: rows }).map((_: any, i: number) => (
        <TableRow key={i}>
          {Array.from({ length: cols }).map((_: any, j: number) => (
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
      <TableCell colSpan={cols} className="text-center py-8 text-muted-foreground">
        {msg}
      </TableCell>
    </TableRow>
  );
}

/** Simple bar chart row for monthly trend visualization */
function TrendBarChart({
  data,
  valueKey,
  maxValue,
  color,
  label,
}: {
  data: { month: string; [key: string]: any }[];
  valueKey: string;
  maxValue: number;
  color: string;
  label: string;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      <div className="space-y-1.5">
        {data.map((d: any, i: number) => {
          const val = d[valueKey] as number;
          const pct = maxValue > 0 ? (val / maxValue) * 100 : 0;
          return (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className="w-20 text-muted-foreground shrink-0">{d.month}</span>
              <div className="flex-1 h-5 bg-muted rounded overflow-hidden relative">
                <div
                  className={`h-full ${color} rounded transition-all`}
                  style={{ width: `${Math.min(100, pct)}%` }}
                />
                <span className="absolute inset-0 flex items-center justify-center text-[10px] font-medium">
                  {valueKey === "fillRate" ? formatPct(val) : formatPct(val, 3)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function AiCostsPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("leaderboard");

  // Execution Quality state
  const [selectedBrokerId, setSelectedBrokerId] = useState<string>("");
  const [selectedPeriod, setSelectedPeriod] = useState("ALL");

  // Decision Log state
  const [decisionPage, setDecisionPage] = useState(1);
  const [decisionBrokerFilter, setDecisionBrokerFilter] = useState("");
  const [decisionSideFilter, setDecisionSideFilter] = useState("all");
  const [decisionOutcomeFilter, setDecisionOutcomeFilter] = useState("all");

  // Recommend form state
  const [recommendForm, setRecommendForm] = useState({
    securityId: "1",
    quantity: "10000",
    side: "BUY",
  });
  const [recommendResult, setRecommendResult] = useState<RecommendationResult | null>(null);

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  const leaderboardQuery = useQuery<{ data: BrokerLeaderboardEntry[]; total: number }>({
    queryKey: ["/api/v1/ai/routing/leaderboard"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/ai/routing/leaderboard")).then((r: any) => r.json()),
  });

  const brokersQuery = useQuery<{ data: BrokerOption[]; total: number }>({
    queryKey: ["/api/v1/ai/routing/brokers"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/ai/routing/brokers")).then((r: any) => r.json()),
  });

  const qualityQuery = useQuery<ExecutionQuality>({
    queryKey: ["/api/v1/ai/routing/quality", selectedBrokerId, selectedPeriod],
    queryFn: () =>
      apiRequest("GET", apiUrl(`/api/v1/ai/routing/quality/${selectedBrokerId}?period=${selectedPeriod}`))
        .then((r: any) => r.json()),
    enabled: !!selectedBrokerId,
  });

  const decisionsQuery = useQuery<{
    data: RoutingDecision[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }>({
    queryKey: [
      "/api/v1/ai/routing/decisions",
      decisionPage,
      decisionBrokerFilter,
      decisionSideFilter,
      decisionOutcomeFilter,
    ],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(decisionPage), pageSize: "15" });
      if (decisionBrokerFilter) params.set("brokerId", decisionBrokerFilter);
      if (decisionSideFilter !== "all") params.set("side", decisionSideFilter);
      if (decisionOutcomeFilter !== "all") params.set("outcome", decisionOutcomeFilter);
      return apiRequest("GET", apiUrl(`/api/v1/ai/routing/decisions?${params}`)).then((r: any) => r.json());
    },
  });

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------

  const recommendMutation = useMutation({
    mutationFn: (body: Record<string, any>) =>
      apiRequest("POST", apiUrl("/api/v1/ai/routing/recommend"), body).then((r: any) => r.json()),
    onSuccess: (data: any) => {
      setRecommendResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/v1/ai/routing/decisions"] });
    },
  });

  // ---------------------------------------------------------------------------
  // Derived
  // ---------------------------------------------------------------------------

  const leaderboard = leaderboardQuery.data?.data ?? [];
  const brokers = brokersQuery.data?.data ?? [];
  const quality = qualityQuery.data;
  const decisions = decisionsQuery.data;

  // Summary metrics from leaderboard
  const topBroker = leaderboard[0];
  const avgFillRate = leaderboard.length > 0
    ? leaderboard.reduce((sum: number, b: any) => sum + b.fillRate, 0) / leaderboard.length
    : 0;
  const avgSlippage = leaderboard.length > 0
    ? leaderboard.reduce((sum: number, b: any) => sum + b.avgSlippage, 0) / leaderboard.length
    : 0;
  const totalVolume = leaderboard.reduce((sum: number, b: any) => sum + b.volumeHandled, 0);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  function handleRecommend() {
    recommendMutation.mutate({
      securityId: Number(recommendForm.securityId),
      quantity: Number(recommendForm.quantity),
      side: recommendForm.side,
    });
  }

  function handleRefreshAll() {
    queryClient.invalidateQueries({ queryKey: ["/api/v1/ai/routing/leaderboard"] });
    queryClient.invalidateQueries({ queryKey: ["/api/v1/ai/routing/decisions"] });
    queryClient.invalidateQueries({ queryKey: ["/api/v1/ai/routing/quality"] });
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Route className="h-7 w-7 text-teal-600" />
            AI & Routing Analytics
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Intelligent order routing engine for Philippine equities. Scores brokers by fill rate,
            slippage, commission, and latency to optimize trade execution quality.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefreshAll}>
          <RefreshCw className="h-4 w-4 mr-1" /> Refresh
        </Button>
      </div>

      <Separator />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Top Broker"
          value={topBroker?.brokerName ?? "-"}
          icon={Trophy}
          accent="bg-yellow-600"
          subtitle={topBroker ? `Score: ${topBroker.compositeScore}` : undefined}
        />
        <MetricCard
          title="Avg Fill Rate"
          value={avgFillRate > 0 ? formatPct(avgFillRate) : "-"}
          icon={CheckCircle}
          accent="bg-emerald-600"
          subtitle="Across all brokers"
        />
        <MetricCard
          title="Avg Slippage"
          value={avgSlippage > 0 ? formatPct(avgSlippage, 3) : "-"}
          icon={TrendingDown}
          accent="bg-orange-600"
          subtitle="Lower is better"
        />
        <MetricCard
          title="Total Volume Routed"
          value={totalVolume > 0 ? formatVolume(totalVolume) : "-"}
          icon={BarChart3}
          accent="bg-sky-600"
        />
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
          <TabsTrigger value="quality">Execution Quality</TabsTrigger>
          <TabsTrigger value="decisions">Decision Log</TabsTrigger>
          <TabsTrigger value="recommend">Recommend</TabsTrigger>
        </TabsList>

        {/* ---------------------------------------------------------------
            Tab 1: Broker Leaderboard
        --------------------------------------------------------------- */}
        <TabsContent value="leaderboard" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Trophy className="h-4 w-4 text-yellow-600" />
                Broker Leaderboard — Composite Score Ranking
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">Rank</TableHead>
                      <TableHead>Broker</TableHead>
                      <TableHead className="text-right">Score</TableHead>
                      <TableHead className="text-right">Fill Rate</TableHead>
                      <TableHead className="text-right">Avg Slippage</TableHead>
                      <TableHead className="text-right">Commission</TableHead>
                      <TableHead className="text-right">Latency (ms)</TableHead>
                      <TableHead className="text-right">Volume</TableHead>
                      <TableHead>Specializations</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leaderboardQuery.isLoading && <SkeletonRows cols={9} rows={7} />}
                    {!leaderboardQuery.isLoading && leaderboard.length === 0 && (
                      <EmptyRow cols={9} msg="No broker data available." />
                    )}
                    {leaderboard.map((b: any) => (
                      <TableRow
                        key={b.brokerId}
                        className="hover:bg-muted/50 cursor-pointer"
                        onClick={() => {
                          setSelectedBrokerId(b.brokerId);
                          setActiveTab("quality");
                        }}
                      >
                        <TableCell>
                          <span className={`font-bold text-lg ${RANK_COLORS[b.rank - 1] ?? "text-muted-foreground"}`}>
                            #{b.rank}
                          </span>
                        </TableCell>
                        <TableCell className="font-semibold">
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                            {b.brokerName}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={`font-bold ${b.compositeScore >= 90 ? "text-green-700" : b.compositeScore >= 80 ? "text-blue-700" : "text-muted-foreground"}`}>
                            {b.compositeScore}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatPct(b.fillRate)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatPct(b.avgSlippage, 3)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatPct(b.commission, 3)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {b.avgLatencyMs}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {formatVolume(b.volumeHandled)}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {b.specializations.slice(0, 3).map((s: any, i: number) => (
                              <Badge key={i} variant="outline" className="text-[10px] px-1.5 py-0">
                                {s}
                              </Badge>
                            ))}
                            {b.specializations.length > 3 && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-muted">
                                +{b.specializations.length - 3}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Score methodology card */}
          <Card className="border-dashed">
            <CardContent className="pt-6">
              <p className="text-sm font-semibold mb-2">Scoring Methodology</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div className="border rounded p-2 text-center">
                  <p className="text-muted-foreground text-xs">Fill Rate</p>
                  <p className="font-bold text-lg">35%</p>
                </div>
                <div className="border rounded p-2 text-center">
                  <p className="text-muted-foreground text-xs">Slippage</p>
                  <p className="font-bold text-lg">25%</p>
                </div>
                <div className="border rounded p-2 text-center">
                  <p className="text-muted-foreground text-xs">Commission</p>
                  <p className="font-bold text-lg">20%</p>
                </div>
                <div className="border rounded p-2 text-center">
                  <p className="text-muted-foreground text-xs">Latency</p>
                  <p className="font-bold text-lg">20%</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Bonuses applied for institutional specialization on large orders and high fill rate on sell-side execution.
                Penalties for high rejection rates.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------------------------------------------------------
            Tab 2: Execution Quality
        --------------------------------------------------------------- */}
        <TabsContent value="quality" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-4">
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  Execution Quality Analysis
                </CardTitle>
                <div className="flex items-center gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Broker</Label>
                    <Select value={selectedBrokerId} onValueChange={(v: any) => setSelectedBrokerId(v)}>
                      <SelectTrigger className="w-56"><SelectValue placeholder="Select broker" /></SelectTrigger>
                      <SelectContent>
                        {brokers.map((b: any) => (
                          <SelectItem key={b.brokerId} value={b.brokerId}>{b.brokerName}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Period</Label>
                    <Select value={selectedPeriod} onValueChange={(v: any) => setSelectedPeriod(v)}>
                      <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PERIOD_OPTIONS.map((p: any) => (
                          <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {!selectedBrokerId && (
                <div className="text-center py-12">
                  <Building2 className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
                  <p className="text-muted-foreground">Select a broker from the dropdown above or click a broker on the Leaderboard tab.</p>
                </div>
              )}

              {selectedBrokerId && qualityQuery.isLoading && (
                <div className="space-y-3">
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-40 w-full" />
                </div>
              )}

              {quality && (
                <div className="space-y-6">
                  {/* Quality metrics cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    <div className="border rounded-lg p-3 text-center">
                      <p className="text-xs text-muted-foreground">Fill Rate</p>
                      <p className="text-xl font-bold text-green-700">{formatPct(quality.fillRate)}</p>
                    </div>
                    <div className="border rounded-lg p-3 text-center">
                      <p className="text-xs text-muted-foreground">Avg Slippage</p>
                      <p className="text-xl font-bold text-orange-700">{formatPct(quality.avgSlippage, 3)}</p>
                    </div>
                    <div className="border rounded-lg p-3 text-center">
                      <p className="text-xs text-muted-foreground">Avg Latency</p>
                      <p className="text-xl font-bold">{quality.avgLatencyMs}ms</p>
                    </div>
                    <div className="border rounded-lg p-3 text-center">
                      <p className="text-xs text-muted-foreground">Volume Handled</p>
                      <p className="text-xl font-bold text-sky-700">{formatVolume(quality.volumeHandled)}</p>
                    </div>
                    <div className="border rounded-lg p-3 text-center">
                      <p className="text-xs text-muted-foreground">Rejection Rate</p>
                      <p className="text-xl font-bold text-red-700">{formatPct(quality.rejectionRate)}</p>
                    </div>
                  </div>

                  <Separator />

                  {/* Monthly Trend Charts */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <TrendBarChart
                      data={quality.monthlyTrend}
                      valueKey="fillRate"
                      maxValue={1}
                      color="bg-emerald-500"
                      label="Fill Rate Trend"
                    />
                    <TrendBarChart
                      data={quality.monthlyTrend}
                      valueKey="slippage"
                      maxValue={0.003}
                      color="bg-orange-500"
                      label="Slippage Trend"
                    />
                  </div>

                  {/* Trend data table */}
                  <div>
                    <p className="text-sm font-semibold mb-2">Monthly Data</p>
                    <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Month</TableHead>
                          <TableHead className="text-right">Fill Rate</TableHead>
                          <TableHead className="text-right">Slippage</TableHead>
                          <TableHead className="text-right">Fill Rate Change</TableHead>
                          <TableHead className="text-right">Slippage Change</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {quality.monthlyTrend.map((m: any, i: number) => {
                          const prev = i > 0 ? quality.monthlyTrend[i - 1] : null;
                          const fillChange = prev ? m.fillRate - prev.fillRate : 0;
                          const slipChange = prev ? m.slippage - prev.slippage : 0;
                          return (
                            <TableRow key={m.month}>
                              <TableCell className="font-mono text-sm">{m.month}</TableCell>
                              <TableCell className="text-right font-mono">{formatPct(m.fillRate)}</TableCell>
                              <TableCell className="text-right font-mono">{formatPct(m.slippage, 3)}</TableCell>
                              <TableCell className="text-right">
                                {i === 0 ? (
                                  <Minus className="h-3 w-3 text-muted-foreground inline" />
                                ) : fillChange >= 0 ? (
                                  <span className="text-green-700 text-xs flex items-center justify-end gap-0.5">
                                    <TrendingUp className="h-3 w-3" /> +{formatPct(fillChange, 2)}
                                  </span>
                                ) : (
                                  <span className="text-red-700 text-xs flex items-center justify-end gap-0.5">
                                    <TrendingDown className="h-3 w-3" /> {formatPct(fillChange, 2)}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                {i === 0 ? (
                                  <Minus className="h-3 w-3 text-muted-foreground inline" />
                                ) : slipChange <= 0 ? (
                                  <span className="text-green-700 text-xs flex items-center justify-end gap-0.5">
                                    <TrendingDown className="h-3 w-3" /> {formatPct(slipChange, 3)}
                                  </span>
                                ) : (
                                  <span className="text-red-700 text-xs flex items-center justify-end gap-0.5">
                                    <TrendingUp className="h-3 w-3" /> +{formatPct(slipChange, 3)}
                                  </span>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------------------------------------------------------
            Tab 3: Routing Decision Log
        --------------------------------------------------------------- */}
        <TabsContent value="decisions" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-4">
                <CardTitle className="text-base flex items-center gap-2">
                  <ArrowUpDown className="h-4 w-4" />
                  Routing Decision Log
                </CardTitle>
                <div className="flex items-center gap-2 flex-wrap">
                  <Select
                    value={decisionSideFilter}
                    onValueChange={(v: any) => { setDecisionSideFilter(v); setDecisionPage(1); }}
                  >
                    <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Sides</SelectItem>
                      <SelectItem value="BUY">Buy</SelectItem>
                      <SelectItem value="SELL">Sell</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    value={decisionOutcomeFilter}
                    onValueChange={(v: any) => { setDecisionOutcomeFilter(v); setDecisionPage(1); }}
                  >
                    <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Outcomes</SelectItem>
                      <SelectItem value="FILLED">Filled</SelectItem>
                      <SelectItem value="PARTIAL">Partial</SelectItem>
                      <SelectItem value="REJECTED">Rejected</SelectItem>
                      <SelectItem value="PENDING">Pending</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-28">Decision ID</TableHead>
                      <TableHead>Security</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead>Side</TableHead>
                      <TableHead>Selected Broker</TableHead>
                      <TableHead className="text-right">Score</TableHead>
                      <TableHead>Outcome</TableHead>
                      <TableHead className="w-36">Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {decisionsQuery.isLoading && <SkeletonRows cols={8} />}
                    {!decisionsQuery.isLoading && (decisions?.data ?? []).length === 0 && (
                      <EmptyRow cols={8} msg="No routing decisions found." />
                    )}
                    {(decisions?.data ?? []).map((d: any) => {
                      const outcome = OUTCOME_STYLES[d.outcome] ?? OUTCOME_STYLES.PENDING;
                      return (
                        <TableRow key={d.decisionId} className="hover:bg-muted/50">
                          <TableCell className="font-mono text-xs">
                            {d.decisionId.slice(0, 8)}...
                          </TableCell>
                          <TableCell className="text-sm font-medium">{d.securityName}</TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {formatNumber(d.quantity)}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={SIDE_STYLES[d.side] ?? "bg-muted"}>
                              {d.side}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">{d.selectedBrokerName}</TableCell>
                          <TableCell className="text-right font-bold">
                            {d.score}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={outcome.className}>
                              {outcome.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs">{formatDate(d.createdAt)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {decisions && decisions.totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-muted-foreground">
                    Page {decisions.page} of {decisions.totalPages}
                    {" "}({decisions.total} total)
                  </p>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={decisionPage <= 1}
                      onClick={() => setDecisionPage((p: number) => p - 1)}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={decisionPage >= (decisions?.totalPages ?? 1)}
                      onClick={() => setDecisionPage((p: number) => p + 1)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------------------------------------------------------
            Tab 4: Broker Recommendation
        --------------------------------------------------------------- */}
        <TabsContent value="recommend" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Form */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Zap className="h-4 w-4 text-teal-600" />
                  Broker Recommendation Engine
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Security</Label>
                  <Select
                    value={recommendForm.securityId}
                    onValueChange={(v: any) => setRecommendForm({ ...recommendForm, securityId: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SECURITIES.map((s: any) => (
                        <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="rec-qty">Quantity (shares)</Label>
                  <Input
                    id="rec-qty"
                    type="number"
                    value={recommendForm.quantity}
                    onChange={(e: any) => setRecommendForm({ ...recommendForm, quantity: e.target.value })}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Side</Label>
                  <Select
                    value={recommendForm.side}
                    onValueChange={(v: any) => setRecommendForm({ ...recommendForm, side: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="BUY">Buy</SelectItem>
                      <SelectItem value="SELL">Sell</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  className="w-full"
                  onClick={handleRecommend}
                  disabled={recommendMutation.isPending}
                >
                  {recommendMutation.isPending ? (
                    <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Analyzing...</>
                  ) : (
                    <><Route className="h-4 w-4 mr-2" /> Get Recommendation</>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Results */}
            <div className="lg:col-span-2 space-y-4">
              {recommendResult && (
                <>
                  {/* Reasoning card */}
                  <Card className="border-teal-200 bg-teal-50/30">
                    <CardContent className="pt-6">
                      <div className="flex items-start gap-3">
                        <Zap className="h-5 w-5 text-teal-600 mt-0.5 shrink-0" />
                        <div>
                          <p className="font-semibold text-teal-900">Routing Recommendation</p>
                          <p className="text-sm text-teal-800 mt-1 leading-relaxed">
                            {recommendResult.reasoning}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Broker recommendations table */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Ranked Broker Recommendations</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-12">#</TableHead>
                            <TableHead>Broker</TableHead>
                            <TableHead className="text-right">Score</TableHead>
                            <TableHead className="text-right">Fill Rate</TableHead>
                            <TableHead className="text-right">Slippage</TableHead>
                            <TableHead className="text-right">Commission</TableHead>
                            <TableHead className="text-right">Latency</TableHead>
                            <TableHead>Tags</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {recommendResult.recommendations.map((rec: any, idx: number) => {
                            const isBest = rec.brokerId === recommendResult.bestPick;
                            return (
                              <TableRow
                                key={rec.brokerId}
                                className={isBest ? "bg-teal-50/50 border-l-2 border-l-teal-500" : "hover:bg-muted/50"}
                              >
                                <TableCell>
                                  <span className={`font-bold ${RANK_COLORS[idx] ?? "text-muted-foreground"}`}>
                                    {idx + 1}
                                  </span>
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <span className="font-semibold">{rec.brokerName}</span>
                                    {isBest && (
                                      <Badge className="bg-teal-600 text-white text-[10px] px-1.5 py-0">
                                        BEST
                                      </Badge>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className="text-right font-bold text-lg">
                                  {rec.score}
                                </TableCell>
                                <TableCell className="text-right font-mono text-sm">
                                  {formatPct(rec.fillRate)}
                                </TableCell>
                                <TableCell className="text-right font-mono text-sm">
                                  {formatPct(rec.avgSlippage, 3)}
                                </TableCell>
                                <TableCell className="text-right font-mono text-sm">
                                  {formatPct(rec.commission, 3)}
                                </TableCell>
                                <TableCell className="text-right font-mono text-sm">
                                  {rec.avgLatencyMs}ms
                                </TableCell>
                                <TableCell>
                                  <div className="flex flex-wrap gap-1">
                                    {rec.specializations.slice(0, 2).map((s: any, i: number) => (
                                      <Badge key={i} variant="outline" className="text-[10px] px-1.5 py-0">
                                        {s}
                                      </Badge>
                                    ))}
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}

              {!recommendResult && (
                <Card className="border-dashed">
                  <CardContent className="pt-10 pb-10 text-center">
                    <Route className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
                    <p className="text-muted-foreground">
                      Enter trade parameters and click "Get Recommendation" to see broker rankings.
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
