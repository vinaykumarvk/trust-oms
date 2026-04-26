/**
 * TCO (Total Cost of Ownership) Dashboard — Phase 8
 *
 * Provides visibility into operational costs across the Trust OMS platform:
 *   - Cost-per-event metrics cards
 *   - Feed cost breakdown by provider
 *   - Processing cost trends over time
 *   - Monthly cost summary with drill-down
 *
 * Auto-refreshes every 60 seconds.
 */
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@ui/lib/queryClient";
import { apiUrl } from "@ui/lib/api-url";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@ui/components/ui/card";
import { Badge } from "@ui/components/ui/badge";
import { Button } from "@ui/components/ui/button";
import { Separator } from "@ui/components/ui/separator";
import { Skeleton } from "@ui/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@ui/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@ui/components/ui/select";
import {
  DollarSign, TrendingUp, TrendingDown, Activity,
  BarChart3, RefreshCw, Database, Cpu,
  Rss, Calendar, ArrowUpDown, AlertTriangle,
  CheckCircle, Layers, PieChart, Download,
} from "lucide-react";

/* ---------- Types ---------- */

interface CostMetric {
  label: string;
  value: number;
  unit: string;
  trend: number; // percent change vs prior period
  count: number;
}

interface FeedCost {
  feedName: string;
  provider: string;
  monthlyBaseCost: number;
  perCallCost: number;
  callCount: number;
  totalCost: number;
  status: "active" | "degraded" | "inactive";
}

interface ProcessingCostPoint {
  period: string;
  orderProcessing: number;
  settlement: number;
  reconciliation: number;
  glPosting: number;
  reporting: number;
  total: number;
}

interface MonthlySummary {
  month: string;
  infrastructure: number;
  dataFeeds: number;
  processing: number;
  licensing: number;
  support: number;
  total: number;
  budget: number;
  variance: number;
}

/* ---------- Constants ---------- */

const REFETCH_INTERVAL = 60_000;

const trendColor = (v: number) =>
  v > 0 ? "text-red-600" : v < 0 ? "text-green-600" : "text-muted-foreground";

const trendIcon = (v: number) =>
  v > 0 ? <TrendingUp className="h-3 w-3" /> : v < 0 ? <TrendingDown className="h-3 w-3" /> : null;

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(v);

const fmtNumber = (v: number) =>
  new Intl.NumberFormat("en-US").format(v);

const feedStatusBadge: Record<string, string> = {
  active: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  degraded: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  inactive: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

/* ---------- Fallback / mock data for development ---------- */

const MOCK_METRICS: CostMetric[] = [
  { label: "Cost per Order", value: 0.42, unit: "USD", trend: -3.2, count: 148200 },
  { label: "Cost per Settlement", value: 0.18, unit: "USD", trend: 1.1, count: 96500 },
  { label: "Cost per Reconciliation", value: 0.07, unit: "USD", trend: -8.5, count: 312000 },
  { label: "Cost per GL Posting", value: 0.03, unit: "USD", trend: 0, count: 724000 },
];

const MOCK_FEEDS: FeedCost[] = [
  { feedName: "PSE Market Data", provider: "PSE Direct", monthlyBaseCost: 2500, perCallCost: 0.001, callCount: 1_200_000, totalCost: 3700, status: "active" },
  { feedName: "FX Rates", provider: "BSP/Reuters", monthlyBaseCost: 1800, perCallCost: 0.0005, callCount: 800_000, totalCost: 2200, status: "active" },
  { feedName: "Securities Reference", provider: "PDTC", monthlyBaseCost: 1200, perCallCost: 0.002, callCount: 450_000, totalCost: 2100, status: "active" },
  { feedName: "Corporate Actions", provider: "SWIFT/CA", monthlyBaseCost: 3000, perCallCost: 0.005, callCount: 120_000, totalCost: 3600, status: "active" },
  { feedName: "KYC/AML Screening", provider: "World-Check", monthlyBaseCost: 5000, perCallCost: 0.05, callCount: 35_000, totalCost: 6750, status: "degraded" },
  { feedName: "Tax Reference", provider: "BIR API", monthlyBaseCost: 500, perCallCost: 0.0, callCount: 22_000, totalCost: 500, status: "inactive" },
];

const MOCK_TRENDS: ProcessingCostPoint[] = [
  { period: "2026-01", orderProcessing: 12400, settlement: 5200, reconciliation: 3100, glPosting: 1800, reporting: 900, total: 23400 },
  { period: "2026-02", orderProcessing: 11800, settlement: 5100, reconciliation: 2900, glPosting: 1750, reporting: 880, total: 22430 },
  { period: "2026-03", orderProcessing: 12900, settlement: 5500, reconciliation: 3200, glPosting: 1900, reporting: 950, total: 24450 },
  { period: "2026-04", orderProcessing: 12200, settlement: 5300, reconciliation: 2800, glPosting: 1700, reporting: 870, total: 22870 },
];

const MOCK_MONTHLY: MonthlySummary[] = [
  { month: "2026-01", infrastructure: 18500, dataFeeds: 18850, processing: 23400, licensing: 8500, support: 4200, total: 73450, budget: 75000, variance: -1550 },
  { month: "2026-02", infrastructure: 18500, dataFeeds: 18850, processing: 22430, licensing: 8500, support: 4200, total: 72480, budget: 75000, variance: -2520 },
  { month: "2026-03", infrastructure: 19200, dataFeeds: 19100, processing: 24450, licensing: 8500, support: 4200, total: 75450, budget: 75000, variance: 450 },
  { month: "2026-04", infrastructure: 19200, dataFeeds: 18850, processing: 22870, licensing: 8500, support: 4200, total: 73620, budget: 75000, variance: -1380 },
];

/* ---------- Component ---------- */

export default function TcoDashboard() {
  const [tab, setTab] = useState("overview");
  const [period, setPeriod] = useState("2026-Q1");

  // ---- Data queries (fallback to mock until API is wired) ----

  const metricsQuery = useQuery<CostMetric[]>({
    queryKey: ["/api/v1/tco/metrics", period],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", apiUrl(`/api/v1/tco/metrics?period=${period}`));
        return (await res.json()) as CostMetric[];
      } catch {
        return MOCK_METRICS;
      }
    },
    refetchInterval: REFETCH_INTERVAL,
  });

  const feedsQuery = useQuery<FeedCost[]>({
    queryKey: ["/api/v1/tco/feeds", period],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", apiUrl(`/api/v1/tco/feeds?period=${period}`));
        return (await res.json()) as FeedCost[];
      } catch {
        return MOCK_FEEDS;
      }
    },
    refetchInterval: REFETCH_INTERVAL,
  });

  const trendsQuery = useQuery<ProcessingCostPoint[]>({
    queryKey: ["/api/v1/tco/trends", period],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", apiUrl(`/api/v1/tco/trends?period=${period}`));
        return (await res.json()) as ProcessingCostPoint[];
      } catch {
        return MOCK_TRENDS;
      }
    },
    refetchInterval: REFETCH_INTERVAL,
  });

  const summaryQuery = useQuery<MonthlySummary[]>({
    queryKey: ["/api/v1/tco/summary", period],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", apiUrl(`/api/v1/tco/summary?period=${period}`));
        return (await res.json()) as MonthlySummary[];
      } catch {
        return MOCK_MONTHLY;
      }
    },
    refetchInterval: REFETCH_INTERVAL,
  });

  const metrics = metricsQuery.data ?? [];
  const feeds = feedsQuery.data ?? [];
  const trends = trendsQuery.data ?? [];
  const summary = summaryQuery.data ?? [];

  const totalFeedCost = useMemo(
    () => feeds.reduce((acc, f) => acc + f.totalCost, 0),
    [feeds],
  );

  const latestSummary = summary.length > 0 ? summary[summary.length - 1] : null;

  const isLoading =
    metricsQuery.isLoading || feedsQuery.isLoading || trendsQuery.isLoading || summaryQuery.isLoading;

  // ---- Render ----

  return (
    <div className="space-y-6 p-6" role="main" aria-label="TCO Dashboard">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <DollarSign className="h-6 w-6 text-primary" aria-hidden="true" />
            Total Cost of Ownership
          </h1>
          <p className="text-muted-foreground mt-1">
            Platform operational cost visibility and optimization insights
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[160px]" aria-label="Select period">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2026-Q1">Q1 2026</SelectItem>
              <SelectItem value="2026-Q2">Q2 2026</SelectItem>
              <SelectItem value="2025-Q4">Q4 2025</SelectItem>
              <SelectItem value="2025-Q3">Q3 2025</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              metricsQuery.refetch();
              feedsQuery.refetch();
              trendsQuery.refetch();
              summaryQuery.refetch();
            }}
            aria-label="Refresh all data"
          >
            <RefreshCw className="h-4 w-4 mr-1" aria-hidden="true" />
            Refresh
          </Button>
          <Button variant="outline" size="sm" aria-label="Export cost report">
            <Download className="h-4 w-4 mr-1" aria-hidden="true" />
            Export
          </Button>
        </div>
      </div>

      <Separator />

      {/* Summary strip */}
      {latestSummary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4" role="region" aria-label="Cost summary cards">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Monthly Cost</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{fmtCurrency(latestSummary.total)}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Budget: {fmtCurrency(latestSummary.budget)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Budget Variance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${latestSummary.variance <= 0 ? "text-green-600" : "text-red-600"}`}>
                {latestSummary.variance <= 0 ? "" : "+"}{fmtCurrency(latestSummary.variance)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {latestSummary.variance <= 0 ? "Under budget" : "Over budget"}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Feed Cost</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{fmtCurrency(totalFeedCost)}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {feeds.length} active feeds
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Processing Cost</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{fmtCurrency(latestSummary.processing)}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {fmtNumber(metrics.reduce((a, m) => a + m.count, 0))} total events
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview" className="flex items-center gap-1">
            <BarChart3 className="h-4 w-4" aria-hidden="true" /> Overview
          </TabsTrigger>
          <TabsTrigger value="feeds" className="flex items-center gap-1">
            <Rss className="h-4 w-4" aria-hidden="true" /> Feed Costs
          </TabsTrigger>
          <TabsTrigger value="processing" className="flex items-center gap-1">
            <Cpu className="h-4 w-4" aria-hidden="true" /> Processing Trends
          </TabsTrigger>
          <TabsTrigger value="monthly" className="flex items-center gap-1">
            <Calendar className="h-4 w-4" aria-hidden="true" /> Monthly Summary
          </TabsTrigger>
        </TabsList>

        {/* ---- Overview Tab ---- */}
        <TabsContent value="overview" className="space-y-6">
          <h2 className="text-lg font-semibold">Cost-per-Event Metrics</h2>
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-32 rounded-lg" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4" role="list" aria-label="Cost per event metrics">
              {metrics.map((m) => (
                <Card key={m.label} role="listitem">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">{m.label}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {fmtCurrency(m.value)}
                      <span className="text-sm font-normal text-muted-foreground ml-1">/ event</span>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs text-muted-foreground">{fmtNumber(m.count)} events</span>
                      <span className={`flex items-center gap-1 text-xs font-medium ${trendColor(m.trend)}`}>
                        {trendIcon(m.trend)}
                        {m.trend > 0 ? "+" : ""}{m.trend.toFixed(1)}%
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Quick cost breakdown visual (table-based) */}
          {latestSummary && (
            <>
              <h2 className="text-lg font-semibold mt-6">Cost Breakdown — {latestSummary.month}</h2>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                {[
                  { label: "Infrastructure", value: latestSummary.infrastructure, icon: <Database className="h-4 w-4" aria-hidden="true" /> },
                  { label: "Data Feeds", value: latestSummary.dataFeeds, icon: <Rss className="h-4 w-4" aria-hidden="true" /> },
                  { label: "Processing", value: latestSummary.processing, icon: <Cpu className="h-4 w-4" aria-hidden="true" /> },
                  { label: "Licensing", value: latestSummary.licensing, icon: <Layers className="h-4 w-4" aria-hidden="true" /> },
                  { label: "Support", value: latestSummary.support, icon: <Activity className="h-4 w-4" aria-hidden="true" /> },
                ].map((item) => (
                  <Card key={item.label}>
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                        {item.icon} {item.label}
                      </div>
                      <div className="text-xl font-semibold">{fmtCurrency(item.value)}</div>
                      <div className="text-xs text-muted-foreground">
                        {((item.value / latestSummary.total) * 100).toFixed(1)}% of total
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </TabsContent>

        {/* ---- Feed Costs Tab ---- */}
        <TabsContent value="feeds" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Feed Cost Breakdown</h2>
            <Badge variant="outline" className="text-sm">
              Total: {fmtCurrency(totalFeedCost)} / month
            </Badge>
          </div>

          {feedsQuery.isLoading ? (
            <Skeleton className="h-64 rounded-lg" />
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table aria-label="Feed cost breakdown table">
                <TableHeader>
                  <TableRow>
                    <TableHead>Feed Name</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Base Cost</TableHead>
                    <TableHead className="text-right">Per-Call Cost</TableHead>
                    <TableHead className="text-right">Call Count</TableHead>
                    <TableHead className="text-right">Total Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {feeds.map((f) => (
                    <TableRow key={f.feedName}>
                      <TableCell className="font-medium">{f.feedName}</TableCell>
                      <TableCell>{f.provider}</TableCell>
                      <TableCell>
                        <Badge
                          className={feedStatusBadge[f.status]}
                          aria-label={`Feed status: ${f.status}`}
                        >
                          {f.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{fmtCurrency(f.monthlyBaseCost)}</TableCell>
                      <TableCell className="text-right">{fmtCurrency(f.perCallCost)}</TableCell>
                      <TableCell className="text-right">{fmtNumber(f.callCount)}</TableCell>
                      <TableCell className="text-right font-semibold">{fmtCurrency(f.totalCost)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Feed cost insights */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-500" aria-hidden="true" />
                Cost Optimization Insights
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {feeds.filter((f) => f.status === "degraded").length > 0 && (
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" aria-hidden="true" />
                  <span>
                    <strong>{feeds.filter((f) => f.status === "degraded").length} feed(s)</strong> in degraded state.
                    Consider switching to backup providers to avoid SLA penalties.
                  </span>
                </div>
              )}
              {feeds.filter((f) => f.status === "inactive").length > 0 && (
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" aria-hidden="true" />
                  <span>
                    <strong>{feeds.filter((f) => f.status === "inactive").length} feed(s)</strong> inactive but still incurring base costs.
                    Review whether these can be decommissioned.
                  </span>
                </div>
              )}
              <div className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 shrink-0" aria-hidden="true" />
                <span>
                  Overall feed utilization within expected bounds for the period.
                </span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---- Processing Trends Tab ---- */}
        <TabsContent value="processing" className="space-y-4">
          <h2 className="text-lg font-semibold">Processing Cost Trends</h2>

          {trendsQuery.isLoading ? (
            <Skeleton className="h-64 rounded-lg" />
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table aria-label="Processing cost trends by month">
                <TableHeader>
                  <TableRow>
                    <TableHead>Period</TableHead>
                    <TableHead className="text-right">Order Processing</TableHead>
                    <TableHead className="text-right">Settlement</TableHead>
                    <TableHead className="text-right">Reconciliation</TableHead>
                    <TableHead className="text-right">GL Posting</TableHead>
                    <TableHead className="text-right">Reporting</TableHead>
                    <TableHead className="text-right font-semibold">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {trends.map((t) => (
                    <TableRow key={t.period}>
                      <TableCell className="font-medium">{t.period}</TableCell>
                      <TableCell className="text-right">{fmtCurrency(t.orderProcessing)}</TableCell>
                      <TableCell className="text-right">{fmtCurrency(t.settlement)}</TableCell>
                      <TableCell className="text-right">{fmtCurrency(t.reconciliation)}</TableCell>
                      <TableCell className="text-right">{fmtCurrency(t.glPosting)}</TableCell>
                      <TableCell className="text-right">{fmtCurrency(t.reporting)}</TableCell>
                      <TableCell className="text-right font-semibold">{fmtCurrency(t.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Month-over-month change cards */}
          {trends.length >= 2 && (
            <>
              <h3 className="text-base font-semibold mt-4">Month-over-Month Change</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
                {(["orderProcessing", "settlement", "reconciliation", "glPosting", "reporting"] as const).map((key) => {
                  const curr = trends[trends.length - 1][key];
                  const prev = trends[trends.length - 2][key];
                  const change = prev > 0 ? ((curr - prev) / prev) * 100 : 0;
                  const labels: Record<string, string> = {
                    orderProcessing: "Order Processing",
                    settlement: "Settlement",
                    reconciliation: "Reconciliation",
                    glPosting: "GL Posting",
                    reporting: "Reporting",
                  };
                  return (
                    <Card key={key}>
                      <CardContent className="pt-4">
                        <div className="text-sm text-muted-foreground">{labels[key]}</div>
                        <div className="text-lg font-semibold">{fmtCurrency(curr)}</div>
                        <div className={`flex items-center gap-1 text-xs font-medium mt-1 ${trendColor(change)}`}>
                          {trendIcon(change)}
                          {change > 0 ? "+" : ""}{change.toFixed(1)}% vs prior month
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </>
          )}
        </TabsContent>

        {/* ---- Monthly Summary Tab ---- */}
        <TabsContent value="monthly" className="space-y-4">
          <h2 className="text-lg font-semibold">Monthly Cost Summary</h2>

          {summaryQuery.isLoading ? (
            <Skeleton className="h-64 rounded-lg" />
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table aria-label="Monthly cost summary table">
                <TableHeader>
                  <TableRow>
                    <TableHead>Month</TableHead>
                    <TableHead className="text-right">Infrastructure</TableHead>
                    <TableHead className="text-right">Data Feeds</TableHead>
                    <TableHead className="text-right">Processing</TableHead>
                    <TableHead className="text-right">Licensing</TableHead>
                    <TableHead className="text-right">Support</TableHead>
                    <TableHead className="text-right font-semibold">Total</TableHead>
                    <TableHead className="text-right">Budget</TableHead>
                    <TableHead className="text-right">Variance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.map((s) => (
                    <TableRow key={s.month}>
                      <TableCell className="font-medium">{s.month}</TableCell>
                      <TableCell className="text-right">{fmtCurrency(s.infrastructure)}</TableCell>
                      <TableCell className="text-right">{fmtCurrency(s.dataFeeds)}</TableCell>
                      <TableCell className="text-right">{fmtCurrency(s.processing)}</TableCell>
                      <TableCell className="text-right">{fmtCurrency(s.licensing)}</TableCell>
                      <TableCell className="text-right">{fmtCurrency(s.support)}</TableCell>
                      <TableCell className="text-right font-semibold">{fmtCurrency(s.total)}</TableCell>
                      <TableCell className="text-right">{fmtCurrency(s.budget)}</TableCell>
                      <TableCell className={`text-right font-medium ${s.variance <= 0 ? "text-green-600" : "text-red-600"}`}>
                        {s.variance <= 0 ? "" : "+"}{fmtCurrency(s.variance)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Quarterly totals */}
          {summary.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <PieChart className="h-4 w-4" aria-hidden="true" />
                  Quarterly Aggregate
                </CardTitle>
                <CardDescription>
                  Sum across {summary.length} months in the selected period
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Total Spend</span>
                    <div className="text-lg font-semibold">
                      {fmtCurrency(summary.reduce((a, s) => a + s.total, 0))}
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Total Budget</span>
                    <div className="text-lg font-semibold">
                      {fmtCurrency(summary.reduce((a, s) => a + s.budget, 0))}
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Net Variance</span>
                    <div className={`text-lg font-semibold ${summary.reduce((a, s) => a + s.variance, 0) <= 0 ? "text-green-600" : "text-red-600"}`}>
                      {fmtCurrency(summary.reduce((a, s) => a + s.variance, 0))}
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Avg Monthly</span>
                    <div className="text-lg font-semibold">
                      {fmtCurrency(summary.reduce((a, s) => a + s.total, 0) / summary.length)}
                    </div>
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
