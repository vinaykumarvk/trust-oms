/**
 * Fee Dashboard -- TrustFees Pro Phase 10
 *
 * Main landing page for TrustFees Pro with:
 *   - KPI row (6 cards)
 *   - Accrual trend (7-day table) + Invoice status distribution
 *   - Exception SLA summary
 *   - Quick links to workbenches
 *   - Recent activity feed
 *   - 60-second auto-refresh
 *   - Dark mode support
 */
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@ui/lib/queryClient";
import { apiUrl } from "@ui/lib/api-url";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/ui/card";
import { Badge } from "@ui/components/ui/badge";
import { Button } from "@ui/components/ui/button";
import { Separator } from "@ui/components/ui/separator";
import { Skeleton } from "@ui/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ui/components/ui/table";
import {
  LayoutDashboard,
  FileText,
  Calculator,
  Receipt,
  AlertTriangle,
  TrendingUp,
  DollarSign,
  ArrowRight,
  RefreshCw,
  Activity,
  ShieldCheck,
  Clock,
} from "lucide-react";

/* ---------- Constants ---------- */
const REFETCH_INTERVAL = 60_000;

const INVOICE_STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-200 text-gray-800",
  ISSUED: "bg-blue-100 text-blue-800",
  PARTIALLY_PAID: "bg-amber-100 text-amber-800",
  PAID: "bg-green-100 text-green-800",
  OVERDUE: "bg-red-100 text-red-800",
  CANCELLED: "bg-gray-300 text-gray-600",
};

/* ---------- Helpers ---------- */
const fmtCurrency = (amt: number | string | null, currency = "PHP") => {
  if (amt === null || amt === undefined) return "--";
  const n = typeof amt === "string" ? parseFloat(amt) : amt;
  if (isNaN(n)) return "--";
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
};

const fmtDate = (d: string | null) => {
  if (!d) return "--";
  try {
    return new Date(d).toLocaleDateString("en-PH", {
      month: "short",
      day: "numeric",
    });
  } catch {
    return d;
  }
};

const fmtDateTime = (d: string | null) => {
  if (!d) return "--";
  try {
    return new Date(d).toLocaleString("en-PH", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return d;
  }
};

const fmtNumber = (n: number | string | null) => {
  if (n === null || n === undefined) return "0";
  const num = typeof n === "string" ? parseFloat(n) : n;
  if (isNaN(num)) return "0";
  return new Intl.NumberFormat("en-PH").format(num);
};

/* ---------- Sub-components ---------- */
function KPICard({
  title,
  value,
  subtitle,
  icon: Icon,
  accent,
  loading,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
  accent: string;
  loading?: boolean;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-muted-foreground truncate">{title}</p>
            {loading ? (
              <Skeleton className="mt-1 h-7 w-20" />
            ) : (
              <p className="mt-1 text-2xl font-bold">{value}</p>
            )}
            {subtitle && (
              <p className="mt-0.5 text-xs text-muted-foreground truncate">{subtitle}</p>
            )}
          </div>
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${accent}`}>
            <Icon className="h-5 w-5 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function QuickLinkCard({
  title,
  description,
  icon: Icon,
  path,
  onClick,
}: {
  title: string;
  description: string;
  icon: React.ElementType;
  path: string;
  onClick: (path: string) => void;
}) {
  return (
    <Card
      className="cursor-pointer transition-colors hover:bg-muted/50"
      onClick={() => onClick(path)}
    >
      <CardContent className="pt-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{title}</p>
            <p className="text-xs text-muted-foreground truncate">{description}</p>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------- Types ---------- */
interface FeePlanListResponse {
  data: unknown[];
  total: number;
}

interface AccrualSummary {
  date: string;
  day: { count: number; total: number };
  mtd: { count: number; total: number };
  exceptions: number;
  pendingOverrides: number;
  breakdown: Array<{ fee_type: string; count: number; total: number }>;
}

interface InvoiceSummary {
  total_invoices: number;
  total_amount: number;
  outstanding_amount: number;
  monthly_revenue: number;
  by_status: Array<{ invoice_status: string; count: number; total: number }>;
}

interface ExceptionKPI {
  total_open: number;
  total_in_progress: number;
  total_escalated: number;
  total_resolved: number;
  sla_adherence_pct: number;
  by_severity: Record<string, number>;
}

interface AuditEvent {
  id: number;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  actor_id: string;
  created_at: string;
}

interface AuditResponse {
  data: AuditEvent[];
  total: number;
}

/* ========== Main Component ========== */
export default function FeeDashboard() {
  const navigate = useNavigate();

  // --- KPI Queries ---
  const feePlansQ = useQuery<FeePlanListResponse>({
    queryKey: ["fee-dashboard-plans"],
    queryFn: () =>
      apiRequest("GET", apiUrl("/api/v1/fee-plans?plan_status=ACTIVE&pageSize=1")),
    refetchInterval: REFETCH_INTERVAL,
  });

  const accrualSummaryQ = useQuery<{ data: AccrualSummary }>({
    queryKey: ["fee-dashboard-accrual-summary"],
    queryFn: () =>
      apiRequest("GET", apiUrl("/api/v1/tfp-accruals/summary")),
    refetchInterval: REFETCH_INTERVAL,
  });

  const invoiceSummaryQ = useQuery<{ data: InvoiceSummary }>({
    queryKey: ["fee-dashboard-invoice-summary"],
    queryFn: () =>
      apiRequest("GET", apiUrl("/api/v1/tfp-invoices/summary")),
    refetchInterval: REFETCH_INTERVAL,
  });

  const exceptionKpiQ = useQuery<{ data: ExceptionKPI }>({
    queryKey: ["fee-dashboard-exception-kpi"],
    queryFn: () =>
      apiRequest("GET", apiUrl("/api/v1/exceptions/kpi")),
    refetchInterval: REFETCH_INTERVAL,
  });

  const auditQ = useQuery<AuditResponse>({
    queryKey: ["fee-dashboard-audit"],
    queryFn: () =>
      apiRequest("GET", apiUrl("/api/v1/tfp-audit/events?pageSize=10")),
    refetchInterval: REFETCH_INTERVAL,
  });

  // Last 7 days accrual trend
  const trendQ = useQuery<{ data: Array<{ date: string; total: number; count: number }> }>({
    queryKey: ["fee-dashboard-trend"],
    queryFn: async () => {
      const days: Array<{ date: string; total: number; count: number }> = [];
      const today = new Date();
      for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split("T")[0];
        try {
          const resp: { data: AccrualSummary } = await apiRequest(
            "GET",
            apiUrl(`/api/v1/tfp-accruals/summary?date=${dateStr}`)
          );
          days.push({
            date: dateStr,
            total: resp.data?.day?.total ?? 0,
            count: resp.data?.day?.count ?? 0,
          });
        } catch {
          days.push({ date: dateStr, total: 0, count: 0 });
        }
      }
      return { data: days };
    },
    refetchInterval: REFETCH_INTERVAL,
  });

  // --- Derived values ---
  const activePlans = feePlansQ.data?.total ?? 0;
  const accrualSummary = accrualSummaryQ.data?.data;
  const invoiceSummary = invoiceSummaryQ.data?.data;
  const exceptionKpi = exceptionKpiQ.data?.data;
  const auditEvents = auditQ.data?.data ?? [];
  const trendData = trendQ.data?.data ?? [];

  const todayAccruals = accrualSummary?.day?.total ?? 0;
  const outstandingInvoices = invoiceSummary?.outstanding_amount ?? 0;
  const exceptionBacklog =
    (exceptionKpi?.total_open ?? 0) +
    (exceptionKpi?.total_in_progress ?? 0) +
    (exceptionKpi?.total_escalated ?? 0);
  const slaAdherence = exceptionKpi?.sla_adherence_pct ?? null;
  const revenueMTD = invoiceSummary?.monthly_revenue ?? 0;

  const isLoading =
    feePlansQ.isLoading ||
    accrualSummaryQ.isLoading ||
    invoiceSummaryQ.isLoading ||
    exceptionKpiQ.isLoading;

  const isFetching =
    feePlansQ.isFetching ||
    accrualSummaryQ.isFetching ||
    invoiceSummaryQ.isFetching ||
    exceptionKpiQ.isFetching;

  const refetchAll = () => {
    feePlansQ.refetch();
    accrualSummaryQ.refetch();
    invoiceSummaryQ.refetch();
    exceptionKpiQ.refetch();
    auditQ.refetch();
    trendQ.refetch();
  };

  // Max for bar chart
  const maxTrend = Math.max(...trendData.map((d) => d.total), 1);

  // SLA color
  const slaColor =
    slaAdherence === null
      ? "text-muted-foreground"
      : slaAdherence >= 90
        ? "text-green-600"
        : slaAdherence >= 70
          ? "text-amber-600"
          : "text-red-600";

  const slaBg =
    slaAdherence === null
      ? "bg-muted"
      : slaAdherence >= 90
        ? "bg-green-50 border-green-200"
        : slaAdherence >= 70
          ? "bg-amber-50 border-amber-200"
          : "bg-red-50 border-red-200";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <LayoutDashboard className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">TrustFees Pro Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Fee management overview -- accruals, invoices, exceptions, and revenue
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={refetchAll}
          disabled={isFetching}
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* KPI Row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KPICard
          title="Active Fee Plans"
          value={fmtNumber(activePlans)}
          icon={FileText}
          accent="bg-blue-600"
          loading={feePlansQ.isLoading}
        />
        <KPICard
          title="Today's Accruals"
          value={fmtCurrency(todayAccruals)}
          subtitle={`${fmtNumber(accrualSummary?.day?.count ?? 0)} entries`}
          icon={Calculator}
          accent="bg-green-600"
          loading={accrualSummaryQ.isLoading}
        />
        <KPICard
          title="Outstanding Invoices"
          value={fmtCurrency(outstandingInvoices)}
          icon={Receipt}
          accent="bg-amber-500"
          loading={invoiceSummaryQ.isLoading}
        />
        <KPICard
          title="Exception Backlog"
          value={fmtNumber(exceptionBacklog)}
          subtitle={exceptionKpi ? `${exceptionKpi.total_escalated} escalated` : undefined}
          icon={AlertTriangle}
          accent="bg-red-500"
          loading={exceptionKpiQ.isLoading}
        />
        <KPICard
          title="STP Rate"
          value={slaAdherence !== null ? `${slaAdherence.toFixed(1)}%` : "N/A"}
          icon={ShieldCheck}
          accent="bg-purple-600"
          loading={exceptionKpiQ.isLoading}
        />
        <KPICard
          title="Revenue MTD"
          value={fmtCurrency(revenueMTD)}
          icon={TrendingUp}
          accent="bg-emerald-600"
          loading={invoiceSummaryQ.isLoading}
        />
      </div>

      <Separator />

      {/* Charts Section */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left: Accrual Trend */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Accrual Trend (Last 7 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            {trendQ.isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 7 }).map((_, i) => (
                  <Skeleton key={i} className="h-6 w-full" />
                ))}
              </div>
            ) : trendData.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No accrual data available
              </p>
            ) : (
              <div className="space-y-2">
                {trendData.map((day) => (
                  <div key={day.date} className="flex items-center gap-3">
                    <span className="w-14 text-xs text-muted-foreground shrink-0">
                      {fmtDate(day.date)}
                    </span>
                    <div className="flex-1 h-6 bg-muted rounded-md overflow-hidden">
                      <div
                        className="h-full bg-primary/80 rounded-md transition-all duration-500"
                        style={{
                          width: `${Math.max((day.total / maxTrend) * 100, 2)}%`,
                        }}
                      />
                    </div>
                    <span className="w-24 text-right text-xs font-mono font-medium shrink-0">
                      {fmtCurrency(day.total)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right: Invoice Status Distribution */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Invoice Status Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {invoiceSummaryQ.isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : !invoiceSummary?.by_status || invoiceSummary.by_status.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No invoice data available
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {invoiceSummary.by_status.map((s) => (
                  <div
                    key={s.invoice_status}
                    className="rounded-lg border p-3"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <Badge
                        className={
                          INVOICE_STATUS_COLORS[s.invoice_status] ??
                          "bg-muted text-foreground"
                        }
                      >
                        {s.invoice_status.replace(/_/g, " ")}
                      </Badge>
                      <span className="text-lg font-bold">{s.count}</span>
                    </div>
                    <p className="text-xs text-muted-foreground font-mono">
                      {fmtCurrency(s.total)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Exception SLA Summary */}
      <Card className={`border ${slaBg}`}>
        <CardContent className="pt-6">
          <div className="flex items-center gap-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-background border">
              <ShieldCheck className={`h-8 w-8 ${slaColor}`} />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Exception SLA Adherence
              </p>
              {isLoading ? (
                <Skeleton className="mt-1 h-10 w-24" />
              ) : (
                <p className={`text-4xl font-bold ${slaColor}`}>
                  {slaAdherence !== null ? `${slaAdherence.toFixed(1)}%` : "N/A"}
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                {slaAdherence !== null && slaAdherence >= 90
                  ? "SLA target met -- all exceptions within threshold"
                  : slaAdherence !== null && slaAdherence >= 70
                    ? "SLA under pressure -- review escalated items"
                    : slaAdherence !== null
                      ? "SLA breached -- immediate attention required"
                      : "No exception data available"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Links */}
      <div>
        <h2 className="mb-3 text-lg font-semibold">Quick Access</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <QuickLinkCard
            title="Accrual Workbench"
            description="Run and review daily accruals"
            icon={Calculator}
            path="/operations/accrual-workbench"
            onClick={navigate}
          />
          <QuickLinkCard
            title="Invoice Workbench"
            description="Generate and manage invoices"
            icon={Receipt}
            path="/operations/invoice-workbench"
            onClick={navigate}
          />
          <QuickLinkCard
            title="Exception Queue"
            description="Resolve and escalate exceptions"
            icon={AlertTriangle}
            path="/operations/exception-workbench"
            onClick={navigate}
          />
          <QuickLinkCard
            title="Fee Plans"
            description="Manage fee plan configurations"
            icon={FileText}
            path="/operations/fee-plans"
            onClick={navigate}
          />
        </div>
      </div>

      <Separator />

      {/* Recent Activity Feed */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4" />
              Recent Activity
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/compliance/audit-explorer")}
            >
              View All <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {auditQ.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : auditEvents.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No recent activity
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event</TableHead>
                    <TableHead>Aggregate</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead className="text-right">Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auditEvents.map((evt) => (
                    <TableRow key={evt.id}>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-xs">
                          {evt.event_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        <span className="text-muted-foreground">{evt.aggregate_type}:</span>{" "}
                        <span className="font-mono">{evt.aggregate_id}</span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {evt.actor_id || "--"}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {fmtDateTime(evt.created_at)}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
