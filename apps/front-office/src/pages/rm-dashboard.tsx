/**
 * RM Dashboard (Cockpit) — Phase 1C
 *
 * Full dashboard for Relationship Managers showing:
 *   - Summary cards: Total AUM, Client Count, Pending Orders, Alerts
 *   - Order Pipeline bar chart (orders by status stage)
 *   - AUM by Product Type pie chart
 *   - Pending Tasks panel with actionable links
 *   - Client Alerts panel with severity badges
 *
 * Data source: GET /api/v1/rm-dashboard/summary?rmId=1
 * Auto-refresh: every 60 seconds
 */

import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@ui/components/ui/card";
import { Badge } from "@ui/components/ui/badge";
import { Skeleton } from "@ui/components/ui/skeleton";
import {
  DollarSign,
  Users,
  Clock,
  AlertTriangle,
  ArrowRight,
  ShieldAlert,
  FileWarning,
  UserX,
  XCircle,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { apiRequest } from "@ui/lib/queryClient";
import { apiUrl } from "@ui/lib/api-url";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BookOfBusiness {
  client_count: number;
  total_aum: number;
  portfolio_count: number;
  breakdown: Array<{
    product_type: string;
    portfolio_count: number;
    aum: number;
  }>;
}

interface PendingTasks {
  orders_pending_auth: number;
  kyc_expiring: number;
  kyc_pending: number;
  suitability_reviews_due: number;
  compliance_breaches: number;
  total: number;
}

interface PipelineStage {
  status: string;
  count: number;
}

interface OrderPipeline {
  stages: PipelineStage[];
  total_orders: number;
}

interface KycExpiringAlert {
  id: number;
  client_id: string;
  kyc_status: string | null;
  expiry_date: string | null;
  next_review_date: string | null;
}

interface ComplianceBreachAlert {
  id: number;
  limit_type: string;
  dimension: string;
  dimension_id: string | null;
  limit_amount: string | null;
  current_exposure: string | null;
  warning_threshold_pct: number | null;
}

interface RejectedOrderAlert {
  order_id: string;
  order_no: string | null;
  portfolio_id: string | null;
  side: string | null;
  security_id: string | null;
  quantity: string | null;
  updated_at: string;
}

interface ClientAlerts {
  kyc_expiring: KycExpiringAlert[];
  compliance_breaches: ComplianceBreachAlert[];
  rejected_orders: RejectedOrderAlert[];
  summary: {
    kyc_expiring_count: number;
    compliance_breach_count: number;
    rejected_order_count: number;
    total: number;
  };
}

interface DashboardSummary {
  book_of_business: BookOfBusiness;
  pending_tasks: PendingTasks;
  order_pipeline: OrderPipeline;
  client_alerts: ClientAlerts;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RM_ID = 1; // Hardcoded until auth is wired

const phpFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const PIPELINE_COLORS: Record<string, string> = {
  DRAFT: "#94a3b8",
  PENDING_AUTH: "#facc15",
  AUTHORIZED: "#3b82f6",
  REJECTED: "#ef4444",
  AGGREGATED: "#a855f7",
  PLACED: "#6366f1",
  PARTIALLY_FILLED: "#f97316",
  FILLED: "#14b8a6",
  CONFIRMED: "#06b6d4",
  SETTLED: "#22c55e",
  REVERSAL_PENDING: "#f43f5e",
  REVERSED: "#dc2626",
  CANCELLED: "#6b7280",
};

const PIE_COLORS = [
  "#3b82f6",
  "#22c55e",
  "#f97316",
  "#a855f7",
  "#06b6d4",
  "#ef4444",
  "#eab308",
  "#ec4899",
];

// ---------------------------------------------------------------------------
// Helper: format pipeline stage label
// ---------------------------------------------------------------------------

function formatStageLabel(status: string): string {
  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Summary Card Component
// ---------------------------------------------------------------------------

interface SummaryCardProps {
  title: string;
  value: string;
  description: string;
  icon: React.ElementType;
  valueClassName?: string;
}

function SummaryCard({
  title,
  value,
  description,
  icon: Icon,
  valueClassName,
}: SummaryCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${valueClassName ?? ""}`}>
          {value}
        </div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function RMDashboard() {
  const {
    data: summary,
    isLoading,
    isError,
  } = useQuery<DashboardSummary>({
    queryKey: ["/api/v1/rm-dashboard/summary", RM_ID],
    queryFn: () =>
      apiRequest(
        "GET",
        apiUrl(`/api/v1/rm-dashboard/summary?rmId=${RM_ID}`),
      ),
    refetchInterval: 60000,
  });

  // Derived data
  const book = summary?.book_of_business;
  const pendingTasks = summary?.pending_tasks;
  const pipeline = summary?.order_pipeline;
  const alerts = summary?.client_alerts;

  // Pipeline chart data — filter to the main stages for readability
  const mainStages = [
    "DRAFT",
    "PENDING_AUTH",
    "AUTHORIZED",
    "PLACED",
    "FILLED",
    "SETTLED",
  ];
  const pipelineChartData = pipeline
    ? pipeline.stages
        .filter((s) => mainStages.includes(s.status))
        .map((s) => ({
          stage: formatStageLabel(s.status),
          count: s.count,
          fill: PIPELINE_COLORS[s.status] ?? "#94a3b8",
        }))
    : [];

  // AUM pie chart data
  const aumChartData = book
    ? book.breakdown.map((b) => ({
        name: b.product_type,
        value: b.aum,
      }))
    : [];

  // Flatten alerts for the alerts panel
  type AlertItem = {
    type: "kyc_expiring" | "mandate_breach" | "suitability_due" | "order_rejected";
    severity: "warning" | "danger";
    message: string;
    detail: string;
  };

  const alertItems: AlertItem[] = [];
  if (alerts) {
    for (const kyc of alerts.kyc_expiring) {
      alertItems.push({
        type: "kyc_expiring",
        severity: "warning",
        message: `KYC expiring for client ${kyc.client_id}`,
        detail: kyc.expiry_date
          ? `Expires ${new Date(kyc.expiry_date).toLocaleDateString("en-PH")}`
          : "Expiry date unknown",
      });
    }
    for (const breach of alerts.compliance_breaches) {
      const limitAmt = parseFloat(breach.limit_amount ?? "0");
      const currentExp = parseFloat(breach.current_exposure ?? "0");
      const utilization =
        limitAmt > 0 ? ((currentExp / limitAmt) * 100).toFixed(1) : "N/A";
      alertItems.push({
        type: "mandate_breach",
        severity: "danger",
        message: `${breach.limit_type} limit breach: ${breach.dimension}`,
        detail: `Utilization ${utilization}% — ${breach.dimension_id ?? ""}`,
      });
    }
    for (const order of alerts.rejected_orders) {
      alertItems.push({
        type: "order_rejected",
        severity: "danger",
        message: `Order rejected: ${order.order_no ?? order.order_id.slice(0, 12)}`,
        detail: `${order.side ?? ""} ${order.security_id ?? ""} — ${new Date(order.updated_at).toLocaleDateString("en-PH")}`,
      });
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">RM Cockpit</h1>
          <p className="text-muted-foreground">Loading dashboard data...</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <Skeleton className="h-8 w-24 mb-2" />
                <Skeleton className="h-4 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">RM Cockpit</h1>
          <p className="text-muted-foreground">
            Overview of your book, orders, and compliance status
          </p>
        </div>
        <Card>
          <CardContent className="flex items-center justify-center h-48 text-muted-foreground">
            <p className="text-sm">
              Unable to load dashboard data. Please try again later.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">RM Cockpit</h1>
        <p className="text-muted-foreground">
          Overview of your book, orders, and compliance status
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          title="Total AUM"
          value={phpFormatter.format(book?.total_aum ?? 0)}
          description={`Across ${book?.portfolio_count ?? 0} portfolios`}
          icon={DollarSign}
        />
        <SummaryCard
          title="Client Count"
          value={String(book?.client_count ?? 0)}
          description="Active clients in your book"
          icon={Users}
        />
        <SummaryCard
          title="Pending Orders"
          value={String(pendingTasks?.orders_pending_auth ?? 0)}
          description="Awaiting authorization"
          icon={Clock}
          valueClassName={
            (pendingTasks?.orders_pending_auth ?? 0) > 0
              ? "text-yellow-600"
              : ""
          }
        />
        <SummaryCard
          title="Alerts"
          value={String(alerts?.summary.total ?? 0)}
          description="Require your attention"
          icon={AlertTriangle}
          valueClassName={
            (alerts?.summary.total ?? 0) > 0 ? "text-red-600" : ""
          }
        />
      </div>

      {/* Charts Row */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Order Pipeline Bar Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Order Pipeline</CardTitle>
            <CardDescription>
              Orders by status stage ({pipeline?.total_orders ?? 0} total)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {pipelineChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={pipelineChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="stage"
                    tick={{ fontSize: 11 }}
                    interval={0}
                    angle={-20}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis allowDecimals={false} />
                  <RechartsTooltip />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {pipelineChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[250px] text-muted-foreground text-sm">
                No order data available
              </div>
            )}
          </CardContent>
        </Card>

        {/* AUM by Product Type Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">AUM by Product Type</CardTitle>
            <CardDescription>
              Portfolio allocation breakdown
            </CardDescription>
          </CardHeader>
          <CardContent>
            {aumChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={aumChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={90}
                    dataKey="value"
                    nameKey="name"
                    label={({ name, percent }) =>
                      `${name} ${(percent * 100).toFixed(0)}%`
                    }
                    labelLine={false}
                  >
                    {aumChartData.map((_, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={PIE_COLORS[index % PIE_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Legend />
                  <RechartsTooltip
                    formatter={(value: number) => phpFormatter.format(value)}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[250px] text-muted-foreground text-sm">
                No AUM data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row: Pending Tasks + Client Alerts */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Pending Tasks */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pending Tasks</CardTitle>
            <CardDescription>
              Action items requiring your attention
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(pendingTasks?.orders_pending_auth ?? 0) > 0 && (
              <Link
                to="/orders/approvals"
                className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Clock className="h-4 w-4 text-yellow-600" />
                  <span className="text-sm">
                    {pendingTasks?.orders_pending_auth} orders pending
                    authorization
                  </span>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            )}
            {(pendingTasks?.kyc_expiring ?? 0) > 0 && (
              <Link
                to="/clients"
                className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <ShieldAlert className="h-4 w-4 text-orange-600" />
                  <span className="text-sm">
                    {pendingTasks?.kyc_expiring} KYC expiring within 30 days
                  </span>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            )}
            {(pendingTasks?.suitability_reviews_due ?? 0) > 0 && (
              <Link
                to="/clients/suitability"
                className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <FileWarning className="h-4 w-4 text-blue-600" />
                  <span className="text-sm">
                    {pendingTasks?.suitability_reviews_due} suitability refreshes
                    due
                  </span>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            )}
            {(pendingTasks?.compliance_breaches ?? 0) > 0 && (
              <Link
                to="/monitoring/mandates"
                className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                  <span className="text-sm">
                    {pendingTasks?.compliance_breaches} compliance limit breaches
                  </span>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            )}
            {(pendingTasks?.total ?? 0) === 0 && (
              <div className="flex items-center justify-center py-6 text-muted-foreground text-sm">
                No pending tasks — all clear
              </div>
            )}
          </CardContent>
        </Card>

        {/* Client Alerts */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Client Alerts</CardTitle>
            <CardDescription>
              {alertItems.length} alert{alertItems.length !== 1 ? "s" : ""}{" "}
              across your book
            </CardDescription>
          </CardHeader>
          <CardContent>
            {alertItems.length > 0 ? (
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {alertItems.slice(0, 20).map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-3 rounded-lg border p-3"
                  >
                    {item.type === "kyc_expiring" && (
                      <ShieldAlert className="h-4 w-4 mt-0.5 text-yellow-600 shrink-0" />
                    )}
                    {item.type === "mandate_breach" && (
                      <AlertTriangle className="h-4 w-4 mt-0.5 text-red-600 shrink-0" />
                    )}
                    {item.type === "suitability_due" && (
                      <UserX className="h-4 w-4 mt-0.5 text-blue-600 shrink-0" />
                    )}
                    {item.type === "order_rejected" && (
                      <XCircle className="h-4 w-4 mt-0.5 text-red-600 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">
                          {item.message}
                        </span>
                        <Badge
                          className={
                            item.severity === "danger"
                              ? "bg-red-100 text-red-800"
                              : "bg-yellow-100 text-yellow-800"
                          }
                        >
                          {item.severity}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {item.detail}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center py-6 text-muted-foreground text-sm">
                No alerts — book is clean
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
