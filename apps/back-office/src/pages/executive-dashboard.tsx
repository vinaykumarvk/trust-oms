/**
 * Executive Dashboard -- Phase 5B (BRD Screen #9)
 *
 * Top-level dashboard for Trust Business Head / CRO showing:
 *   - 4 large KPI cards: Total AUM, Revenue YTD, Compliance Score, STP Rate
 *   - AUM breakdown by product type (horizontal bar chart) and 12-month trend
 *   - Revenue breakdown by fee type and monthly trend
 *   - Risk overview: breaches, ORE events, surveillance, mandate breaches
 *   - Regulatory filing status table
 *
 * Auto-refreshes every 60 seconds.
 */
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@ui/lib/queryClient";
import { apiUrl } from "@ui/lib/api-url";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/ui/card";
import { Badge } from "@ui/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@ui/components/ui/table";
import { Skeleton } from "@ui/components/ui/skeleton";
import { Separator } from "@ui/components/ui/separator";
import {
  TrendingUp, TrendingDown, DollarSign, ShieldCheck, Activity,
  AlertTriangle, BarChart3, FileText, Clock, CheckCircle2,
  AlertOctagon, Eye, Target, Building2, RefreshCw,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AumSummary {
  totalAum: number;
  byProductType: { type: string; aum: number }[];
  byBranch: { branch: string; aum: number }[];
  trend: { month: string; aum: number }[];
}

interface RevenueSummary {
  totalRevenue: number;
  byFeeType: { type: string; amount: number }[];
  byProduct: { product: string; amount: number }[];
  monthlyTrend: { month: string; amount: number }[];
}

interface RiskSummary {
  complianceScore: number;
  openBreaches: number;
  oreEvents: number;
  pendingSurveillance: number;
  mandateBreaches: number;
}

interface RegulatoryFiling {
  id: string;
  reportName: string;
  regulator: string;
  frequency: string;
  dueDate: string;
  status: "ON_TIME" | "OVERDUE" | "UPCOMING";
  lastFiled: string;
}

interface OperationsMetrics {
  stpRate: number;
  stpTarget: number;
  settlementSlaCompliance: number;
  reconBreaks: number;
  pendingSettlements: number;
  eodStatus: "COMPLETED" | "IN_PROGRESS" | "NOT_STARTED";
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REFRESH_INTERVAL = 60_000; // 60 seconds

const PRODUCT_TYPE_COLORS: Record<string, string> = {
  IMA_DIRECTED: "bg-blue-500",
  IMA_DISCRETIONARY: "bg-indigo-500",
  PMT: "bg-violet-500",
  UITF: "bg-emerald-500",
  PRE_NEED: "bg-amber-500",
  EMPLOYEE_BENEFIT: "bg-cyan-500",
  ESCROW: "bg-rose-500",
  AGENCY: "bg-orange-500",
  SAFEKEEPING: "bg-teal-500",
  UNKNOWN: "bg-gray-400",
};

const FEE_TYPE_COLORS: Record<string, string> = {
  TRUSTEE: "bg-blue-500",
  MANAGEMENT: "bg-emerald-500",
  CUSTODY: "bg-violet-500",
  PERFORMANCE: "bg-amber-500",
  UITF_TER: "bg-rose-500",
  OTHER: "bg-gray-400",
  ALL: "bg-gray-400",
};

const STATUS_BADGE: Record<string, string> = {
  ON_TIME: "bg-green-100 text-green-800 border-green-200",
  OVERDUE: "bg-red-100 text-red-800 border-red-200",
  UPCOMING: "bg-blue-100 text-blue-800 border-blue-200",
};

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function formatPHP(value: number): string {
  if (value >= 1_000_000_000) {
    return `PHP ${(value / 1_000_000_000).toFixed(2)}B`;
  }
  if (value >= 1_000_000) {
    return `PHP ${(value / 1_000_000).toFixed(2)}M`;
  }
  if (value >= 1_000) {
    return `PHP ${(value / 1_000).toFixed(1)}K`;
  }
  return `PHP ${value.toLocaleString()}`;
}

function formatPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function friendlyType(raw: string): string {
  return raw
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function KpiCardSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <Skeleton className="h-4 w-24" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-40 mb-2" />
        <Skeleton className="h-3 w-20" />
      </CardContent>
    </Card>
  );
}

function SectionSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-48" />
      </CardHeader>
      <CardContent className="space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-5/6" />
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Horizontal bar chart (CSS-based)
// ---------------------------------------------------------------------------

function HorizontalBar({
  items,
  colorMap,
  formatValue,
}: {
  items: { label: string; value: number }[];
  colorMap: Record<string, string>;
  formatValue: (v: number) => string;
}) {
  const maxVal = Math.max(...items.map((i) => i.value), 1);

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const pct = Math.max((item.value / maxVal) * 100, 2);
        const colorClass = colorMap[item.label] ?? "bg-gray-400";
        return (
          <div key={item.label}>
            <div className="flex justify-between text-sm mb-1">
              <span className="font-medium text-foreground">{friendlyType(item.label)}</span>
              <span className="text-muted-foreground">{formatValue(item.value)}</span>
            </div>
            <div className="w-full bg-muted rounded-full h-3">
              <div
                className={`h-3 rounded-full ${colorClass} transition-all duration-700`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Simple sparkline (text-based blocks)
// ---------------------------------------------------------------------------

function Sparkline({
  data,
  formatValue,
}: {
  data: { label: string; value: number }[];
  formatValue: (v: number) => string;
}) {
  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const barHeight = 60; // px max

  return (
    <div className="flex items-end gap-1 h-20">
      {data.map((d, i) => {
        const h = Math.max((d.value / maxVal) * barHeight, 4);
        const isLast = i === data.length - 1;
        return (
          <div
            key={d.label}
            className="flex flex-col items-center flex-1 group relative"
          >
            <div
              className={`w-full rounded-t transition-all ${
                isLast ? "bg-blue-500" : "bg-blue-200"
              }`}
              style={{ height: `${h}px` }}
              title={`${d.label}: ${formatValue(d.value)}`}
            />
            <span className="text-[9px] text-muted-foreground mt-1 truncate w-full text-center">
              {d.label.slice(5)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compliance Score Ring
// ---------------------------------------------------------------------------

function ScoreCircle({ score }: { score: number }) {
  const color =
    score >= 80 ? "text-green-600" : score >= 60 ? "text-yellow-600" : "text-red-600";
  const bgColor =
    score >= 80 ? "bg-green-50" : score >= 60 ? "bg-yellow-50" : "bg-red-50";
  const ringColor =
    score >= 80 ? "border-green-500" : score >= 60 ? "border-yellow-500" : "border-red-500";

  return (
    <div
      className={`inline-flex items-center justify-center w-16 h-16 rounded-full border-4 ${ringColor} ${bgColor}`}
    >
      <span className={`text-xl font-bold ${color}`}>{score}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function ExecutiveDashboard() {
  // -- Data fetching --------------------------------------------------------

  const { data: aumResp, isLoading: aumLoading } = useQuery<{ data: AumSummary }>({
    queryKey: ["executive", "aum"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/executive/aum")),
    refetchInterval: REFRESH_INTERVAL,
  });

  const { data: revResp, isLoading: revLoading } = useQuery<{ data: RevenueSummary }>({
    queryKey: ["executive", "revenue"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/executive/revenue")),
    refetchInterval: REFRESH_INTERVAL,
  });

  const { data: riskResp, isLoading: riskLoading } = useQuery<{ data: RiskSummary }>({
    queryKey: ["executive", "risk"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/executive/risk")),
    refetchInterval: REFRESH_INTERVAL,
  });

  const { data: regResp, isLoading: regLoading } = useQuery<{ data: RegulatoryFiling[] }>({
    queryKey: ["executive", "regulatory-status"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/executive/regulatory-status")),
    refetchInterval: REFRESH_INTERVAL,
  });

  const { data: opsResp, isLoading: opsLoading } = useQuery<{ data: OperationsMetrics }>({
    queryKey: ["executive", "operations"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/executive/operations")),
    refetchInterval: REFRESH_INTERVAL,
  });

  const aum = aumResp?.data;
  const revenue = revResp?.data;
  const risk = riskResp?.data;
  const filings = regResp?.data;
  const ops = opsResp?.data;

  // -- Derived values -------------------------------------------------------

  const aumChangeFromLastMonth =
    aum && aum.trend.length >= 2
      ? ((aum.trend[aum.trend.length - 1].aum - aum.trend[aum.trend.length - 2].aum) /
          Math.max(aum.trend[aum.trend.length - 2].aum, 1)) *
        100
      : 0;

  const stpColor = ops
    ? ops.stpRate >= 0.92
      ? "text-green-600"
      : ops.stpRate >= 0.85
        ? "text-yellow-600"
        : "text-red-600"
    : "text-muted-foreground";

  // -- Render ---------------------------------------------------------------

  return (
    <div className="space-y-6 p-4 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Executive Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Trust Business Head / CRO Overview
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <RefreshCw className="h-3 w-3 animate-spin" />
          Auto-refresh every 60s
        </div>
      </div>

      {/* ================================================================== */}
      {/* Top Row: 4 Large KPI Cards                                         */}
      {/* ================================================================== */}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* KPI 1: Total AUM */}
        {aumLoading ? (
          <KpiCardSkeleton />
        ) : (
          <Card className="border-l-4 border-l-blue-500">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total AUM
              </CardTitle>
              <DollarSign className="h-5 w-5 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">
                {formatPHP(aum?.totalAum ?? 0)}
              </div>
              <div className="flex items-center gap-1 mt-1">
                {aumChangeFromLastMonth >= 0 ? (
                  <TrendingUp className="h-3 w-3 text-green-500" />
                ) : (
                  <TrendingDown className="h-3 w-3 text-red-500" />
                )}
                <span
                  className={`text-xs font-medium ${
                    aumChangeFromLastMonth >= 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {aumChangeFromLastMonth >= 0 ? "+" : ""}
                  {aumChangeFromLastMonth.toFixed(1)}% from last month
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* KPI 2: Revenue YTD */}
        {revLoading ? (
          <KpiCardSkeleton />
        ) : (
          <Card className="border-l-4 border-l-emerald-500">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Revenue YTD
              </CardTitle>
              <BarChart3 className="h-5 w-5 text-emerald-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">
                {formatPHP(revenue?.totalRevenue ?? 0)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {revenue?.byFeeType.length ?? 0} fee types contributing
              </p>
            </CardContent>
          </Card>
        )}

        {/* KPI 3: Compliance Score */}
        {riskLoading ? (
          <KpiCardSkeleton />
        ) : (
          <Card className="border-l-4 border-l-violet-500">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Compliance Score
              </CardTitle>
              <ShieldCheck className="h-5 w-5 text-violet-500" />
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <ScoreCircle score={risk?.complianceScore ?? 0} />
                <div className="text-xs text-muted-foreground space-y-0.5">
                  <div>{risk?.openBreaches ?? 0} open breaches</div>
                  <div>{risk?.oreEvents ?? 0} ORE events</div>
                  <div>{risk?.pendingSurveillance ?? 0} pending alerts</div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* KPI 4: STP Rate */}
        {opsLoading ? (
          <KpiCardSkeleton />
        ) : (
          <Card className="border-l-4 border-l-amber-500">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                STP Rate
              </CardTitle>
              <Activity className="h-5 w-5 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${stpColor}`}>
                {formatPct(ops?.stpRate ?? 0)}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <Target className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  Target: {formatPct(ops?.stpTarget ?? 0.92)}
                </span>
                {ops && ops.stpRate >= ops.stpTarget ? (
                  <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-200">
                    Meeting
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] bg-red-50 text-red-700 border-red-200">
                    Below Target
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ================================================================== */}
      {/* AUM Section                                                        */}
      {/* ================================================================== */}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* AUM by Product Type */}
        {aumLoading ? (
          <SectionSkeleton />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="h-4 w-4 text-blue-500" />
                AUM by Product Type
              </CardTitle>
            </CardHeader>
            <CardContent>
              <HorizontalBar
                items={(aum?.byProductType ?? []).map((p) => ({
                  label: p.type,
                  value: p.aum,
                }))}
                colorMap={PRODUCT_TYPE_COLORS}
                formatValue={formatPHP}
              />
            </CardContent>
          </Card>
        )}

        {/* AUM Trend */}
        {aumLoading ? (
          <SectionSkeleton />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-blue-500" />
                AUM Trend (Last 12 Months)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Sparkline
                data={(aum?.trend ?? []).map((t) => ({
                  label: t.month,
                  value: t.aum,
                }))}
                formatValue={formatPHP}
              />
              <Separator className="my-3" />
              <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                {aum && aum.trend.length > 0 && (
                  <>
                    <div>
                      <span className="block text-muted-foreground">12m ago</span>
                      <span className="font-medium text-foreground">
                        {formatPHP(aum.trend[0].aum)}
                      </span>
                    </div>
                    <div>
                      <span className="block text-muted-foreground">6m ago</span>
                      <span className="font-medium text-foreground">
                        {formatPHP(aum.trend[Math.floor(aum.trend.length / 2)]?.aum ?? 0)}
                      </span>
                    </div>
                    <div>
                      <span className="block text-muted-foreground">Current</span>
                      <span className="font-medium text-foreground">
                        {formatPHP(aum.trend[aum.trend.length - 1].aum)}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ================================================================== */}
      {/* Revenue Section                                                    */}
      {/* ================================================================== */}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Revenue by Fee Type */}
        {revLoading ? (
          <SectionSkeleton />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-emerald-500" />
                Revenue by Fee Type
              </CardTitle>
            </CardHeader>
            <CardContent>
              <HorizontalBar
                items={(revenue?.byFeeType ?? []).map((f) => ({
                  label: f.type,
                  value: f.amount,
                }))}
                colorMap={FEE_TYPE_COLORS}
                formatValue={formatPHP}
              />
              {revenue && revenue.byFeeType.length === 0 && (
                <p className="text-sm text-muted-foreground italic">
                  No fee invoices recorded yet
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Revenue Monthly Trend */}
        {revLoading ? (
          <SectionSkeleton />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-500" />
                Monthly Revenue Trend
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Sparkline
                data={(revenue?.monthlyTrend ?? []).map((t) => ({
                  label: t.month,
                  value: t.amount,
                }))}
                formatValue={formatPHP}
              />
              <Separator className="my-3" />
              <div className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {formatPHP(revenue?.totalRevenue ?? 0)}
                </span>{" "}
                total revenue year-to-date across{" "}
                {revenue?.byProduct.length ?? 0} product types
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ================================================================== */}
      {/* Risk Section                                                       */}
      {/* ================================================================== */}

      {riskLoading ? (
        <SectionSkeleton />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              Risk Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-red-50 rounded-lg border border-red-100">
                <AlertOctagon className="h-6 w-6 text-red-500 mx-auto mb-2" />
                <div className="text-2xl font-bold text-red-700">
                  {risk?.openBreaches ?? 0}
                </div>
                <div className="text-xs text-red-600 mt-1">Open Breaches</div>
              </div>

              <div className="text-center p-4 bg-orange-50 rounded-lg border border-orange-100">
                <AlertTriangle className="h-6 w-6 text-orange-500 mx-auto mb-2" />
                <div className="text-2xl font-bold text-orange-700">
                  {risk?.oreEvents ?? 0}
                </div>
                <div className="text-xs text-orange-600 mt-1">ORE Events</div>
              </div>

              <div className="text-center p-4 bg-blue-50 rounded-lg border border-blue-100">
                <Eye className="h-6 w-6 text-blue-500 mx-auto mb-2" />
                <div className="text-2xl font-bold text-blue-700">
                  {risk?.pendingSurveillance ?? 0}
                </div>
                <div className="text-xs text-blue-600 mt-1">Pending Surveillance</div>
              </div>

              <div className="text-center p-4 bg-purple-50 rounded-lg border border-purple-100">
                <FileText className="h-6 w-6 text-purple-500 mx-auto mb-2" />
                <div className="text-2xl font-bold text-purple-700">
                  {risk?.mandateBreaches ?? 0}
                </div>
                <div className="text-xs text-purple-600 mt-1">Mandate Breaches</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ================================================================== */}
      {/* Regulatory Filing Status                                           */}
      {/* ================================================================== */}

      {regLoading ? (
        <SectionSkeleton />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              Regulatory Filing Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted">
                    <TableHead className="font-semibold">Report Name</TableHead>
                    <TableHead className="font-semibold">Regulator</TableHead>
                    <TableHead className="font-semibold">Frequency</TableHead>
                    <TableHead className="font-semibold">Due Date</TableHead>
                    <TableHead className="font-semibold">Last Filed</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filings && filings.length > 0 ? (
                    filings.map((f) => (
                      <TableRow key={f.id} className="hover:bg-muted">
                        <TableCell className="font-medium text-sm">
                          {f.reportName}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {f.regulator}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {friendlyType(f.frequency)}
                        </TableCell>
                        <TableCell className="text-sm">{f.dueDate}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {f.lastFiled}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`text-xs ${STATUS_BADGE[f.status] ?? ""}`}
                          >
                            {f.status === "ON_TIME" && (
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                            )}
                            {f.status === "OVERDUE" && (
                              <AlertOctagon className="h-3 w-3 mr-1" />
                            )}
                            {f.status === "UPCOMING" && (
                              <Clock className="h-3 w-3 mr-1" />
                            )}
                            {f.status.replace("_", " ")}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        No regulatory filings data available
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              Filing statuses are updated based on current date and last submission records
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
