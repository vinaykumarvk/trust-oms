/**
 * Operations Control Tower -- Phase 5B (BRD Screen #8)
 *
 * Operational monitoring dashboard for Trust Operations Head:
 *   - STP Rate gauge (prominent, color-coded)
 *   - Service SLA heat-map grid
 *   - Operations summary cards (pending settlements, recon breaks, EOD status)
 *   - Incidents panel (from ORE events)
 *
 * Auto-refreshes every 30 seconds.
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
  Activity, Target, CheckCircle2, AlertTriangle, AlertOctagon,
  Clock, RefreshCw, Gauge, ShieldCheck, ShieldOff,
  ArrowRightLeft, FileSearch, Calculator, FileText,
  Zap, TrendingUp, Server, Layers,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OperationsMetrics {
  stpRate: number;
  stpTarget: number;
  settlementSlaCompliance: number;
  reconBreaks: number;
  pendingSettlements: number;
  eodStatus: "COMPLETED" | "IN_PROGRESS" | "NOT_STARTED";
}

interface ServiceSla {
  service: string;
  slaTarget: number;
  actual: number;
  status: "MEETING" | "AT_RISK" | "BREACHING";
}

interface RiskSummary {
  complianceScore: number;
  openBreaches: number;
  oreEvents: number;
  pendingSurveillance: number;
  mandateBreaches: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REFRESH_INTERVAL = 30_000; // 30 seconds

const SLA_STATUS_STYLES: Record<string, { bg: string; text: string; border: string; badge: string }> = {
  MEETING: {
    bg: "bg-green-50",
    text: "text-green-700",
    border: "border-green-200",
    badge: "bg-green-100 text-green-800 border-green-300",
  },
  AT_RISK: {
    bg: "bg-yellow-50",
    text: "text-yellow-700",
    border: "border-yellow-200",
    badge: "bg-yellow-100 text-yellow-800 border-yellow-300",
  },
  BREACHING: {
    bg: "bg-red-50",
    text: "text-red-700",
    border: "border-red-200",
    badge: "bg-red-100 text-red-800 border-red-300",
  },
};

const SERVICE_ICONS: Record<string, typeof Activity> = {
  "Order Processing": Zap,
  Settlement: ArrowRightLeft,
  "NAV Computation": Calculator,
  Reporting: FileText,
  Reconciliation: FileSearch,
};

const EOD_STATUS_STYLES: Record<string, { bg: string; text: string; icon: typeof CheckCircle2 }> = {
  COMPLETED: { bg: "bg-green-50 border-green-200", text: "text-green-700", icon: CheckCircle2 },
  IN_PROGRESS: { bg: "bg-yellow-50 border-yellow-200", text: "text-yellow-700", icon: RefreshCw },
  NOT_STARTED: { bg: "bg-muted border-border", text: "text-muted-foreground", icon: Clock },
};

// Stub incident data from ORE events context
const STUB_INCIDENTS = [
  {
    id: 1,
    timestamp: "2026-04-18T09:15:00Z",
    category: "Execution/Delivery",
    description: "Settlement instruction rejected by custodian due to SSI mismatch",
    severity: "HIGH" as const,
    status: "INVESTIGATING" as const,
  },
  {
    id: 2,
    timestamp: "2026-04-18T08:42:00Z",
    category: "Business Disruption",
    description: "NAV computation delayed by 15 minutes due to pricing feed timeout",
    severity: "MEDIUM" as const,
    status: "RESOLVED" as const,
  },
  {
    id: 3,
    timestamp: "2026-04-17T16:30:00Z",
    category: "Execution/Delivery",
    description: "Reconciliation break detected: 3 positions with custodian mismatch",
    severity: "MEDIUM" as const,
    status: "INVESTIGATING" as const,
  },
  {
    id: 4,
    timestamp: "2026-04-17T14:22:00Z",
    category: "Clients/Products",
    description: "Fee computation override required for IMA discretionary portfolio",
    severity: "LOW" as const,
    status: "RESOLVED" as const,
  },
  {
    id: 5,
    timestamp: "2026-04-17T11:05:00Z",
    category: "Internal Fraud",
    description: "Unauthorized order attempt blocked by pre-trade compliance check",
    severity: "HIGH" as const,
    status: "ESCALATED" as const,
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function LoadingSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-48" />
      </CardHeader>
      <CardContent className="space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// STP Rate Gauge
// ---------------------------------------------------------------------------

function StpGauge({ rate, target }: { rate: number; target: number }) {
  const pct = Math.round(rate * 100);
  const targetPct = Math.round(target * 100);

  let color: string;
  let bgRing: string;
  let label: string;
  if (pct >= 92) {
    color = "text-green-600";
    bgRing = "border-green-500";
    label = "Excellent";
  } else if (pct >= 85) {
    color = "text-yellow-600";
    bgRing = "border-yellow-500";
    label = "Needs Attention";
  } else {
    color = "text-red-600";
    bgRing = "border-red-500";
    label = "Critical";
  }

  // Visual gauge as concentric circles
  const circumference = 2 * Math.PI * 45; // radius = 45
  const strokeDashoffset = circumference - (pct / 100) * circumference;
  const targetOffset = circumference - (targetPct / 100) * circumference;

  return (
    <div className="flex flex-col items-center justify-center py-4">
      <div className="relative w-40 h-40">
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
          {/* Background circle */}
          <circle
            cx="50" cy="50" r="45"
            fill="none"
            stroke="#e5e7eb"
            strokeWidth="8"
          />
          {/* Target line */}
          <circle
            cx="50" cy="50" r="45"
            fill="none"
            stroke="#d1d5db"
            strokeWidth="8"
            strokeDasharray={circumference}
            strokeDashoffset={targetOffset}
            strokeLinecap="round"
            opacity="0.4"
          />
          {/* Actual rate */}
          <circle
            cx="50" cy="50" r="45"
            fill="none"
            stroke={pct >= 92 ? "#16a34a" : pct >= 85 ? "#ca8a04" : "#dc2626"}
            strokeWidth="8"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-1000"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-3xl font-bold ${color}`}>{pct}%</span>
          <span className="text-xs text-muted-foreground">STP Rate</span>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3 text-sm">
        <div className="flex items-center gap-1">
          <Target className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">Target: {targetPct}%</span>
        </div>
        <Badge
          variant="outline"
          className={`text-xs ${
            pct >= 92
              ? "bg-green-50 text-green-700 border-green-200"
              : pct >= 85
                ? "bg-yellow-50 text-yellow-700 border-yellow-200"
                : "bg-red-50 text-red-700 border-red-200"
          }`}
        >
          {label}
        </Badge>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Service SLA Card
// ---------------------------------------------------------------------------

function SlaCard({ sla }: { sla: ServiceSla }) {
  const styles = SLA_STATUS_STYLES[sla.status] ?? SLA_STATUS_STYLES.MEETING;
  const Icon = SERVICE_ICONS[sla.service] ?? Activity;

  return (
    <div
      className={`p-4 rounded-lg border-2 ${styles.bg} ${styles.border} transition-all hover:shadow-md`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon className={`h-5 w-5 ${styles.text}`} />
          <span className="font-semibold text-sm text-foreground">{sla.service}</span>
        </div>
        <Badge variant="outline" className={`text-[10px] ${styles.badge}`}>
          {sla.status.replace("_", " ")}
        </Badge>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">SLA Target</span>
          <span className="font-medium text-foreground">{formatPct(sla.slaTarget)}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Actual</span>
          <span className={`font-bold ${styles.text}`}>{formatPct(sla.actual)}</span>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-muted rounded-full h-2 mt-1">
          <div
            className={`h-2 rounded-full transition-all duration-700 ${
              sla.status === "MEETING"
                ? "bg-green-500"
                : sla.status === "AT_RISK"
                  ? "bg-yellow-500"
                  : "bg-red-500"
            }`}
            style={{ width: `${Math.min(sla.actual * 100, 100)}%` }}
          />
          {/* Target marker */}
          <div
            className="relative h-0"
            style={{ marginLeft: `${sla.slaTarget * 100}%`, top: "-8px" }}
          >
            <div className="w-0.5 h-2 bg-gray-600 -ml-px" />
          </div>
        </div>

        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>0%</span>
          <span>Target: {formatPct(sla.slaTarget)}</span>
          <span>100%</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Severity Badge
// ---------------------------------------------------------------------------

function SeverityBadge({ severity }: { severity: string }) {
  const styles: Record<string, string> = {
    HIGH: "bg-red-100 text-red-800 border-red-200",
    MEDIUM: "bg-yellow-100 text-yellow-800 border-yellow-200",
    LOW: "bg-blue-100 text-blue-800 border-blue-200",
  };
  return (
    <Badge variant="outline" className={`text-[10px] ${styles[severity] ?? "bg-muted text-muted-foreground"}`}>
      {severity}
    </Badge>
  );
}

function IncidentStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    INVESTIGATING: "bg-orange-100 text-orange-800 border-orange-200",
    RESOLVED: "bg-green-100 text-green-800 border-green-200",
    ESCALATED: "bg-red-100 text-red-800 border-red-200",
  };
  return (
    <Badge variant="outline" className={`text-[10px] ${styles[status] ?? "bg-muted text-muted-foreground"}`}>
      {status}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function OperationsControlTower() {
  // -- Data fetching --------------------------------------------------------

  const { data: opsResp, isLoading: opsLoading } = useQuery<{ data: OperationsMetrics }>({
    queryKey: ["executive", "operations"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/executive/operations")),
    refetchInterval: REFRESH_INTERVAL,
  });

  const { data: slaResp, isLoading: slaLoading } = useQuery<{ data: ServiceSla[] }>({
    queryKey: ["executive", "service-sla"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/executive/service-sla")),
    refetchInterval: REFRESH_INTERVAL,
  });

  const { data: riskResp, isLoading: riskLoading } = useQuery<{ data: RiskSummary }>({
    queryKey: ["executive", "risk"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/executive/risk")),
    refetchInterval: REFRESH_INTERVAL,
  });

  const ops = opsResp?.data;
  const slas = slaResp?.data;
  const risk = riskResp?.data;

  // -- Render ---------------------------------------------------------------

  return (
    <div className="space-y-6 p-4 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Operations Control Tower</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Real-time operational monitoring and SLA tracking
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <RefreshCw className="h-3 w-3 animate-spin" />
          Auto-refresh every 30s
        </div>
      </div>

      {/* ================================================================== */}
      {/* Top Row: STP Gauge + Operations Summary                            */}
      {/* ================================================================== */}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* STP Rate Gauge (prominent) */}
        {opsLoading ? (
          <LoadingSkeleton />
        ) : (
          <Card className="lg:col-span-1 border-2 border-border">
            <CardHeader className="pb-0">
              <CardTitle className="text-base flex items-center gap-2">
                <Gauge className="h-5 w-5 text-blue-500" />
                STP Rate (Straight-Through Processing)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <StpGauge
                rate={ops?.stpRate ?? 0}
                target={ops?.stpTarget ?? 0.92}
              />
              <Separator className="my-3" />
              <p className="text-xs text-muted-foreground text-center">
                Orders processed without manual intervention
              </p>
            </CardContent>
          </Card>
        )}

        {/* Operations Summary Cards */}
        {opsLoading ? (
          <div className="lg:col-span-2">
            <LoadingSkeleton />
          </div>
        ) : (
          <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Pending Settlements */}
            <Card className="border-l-4 border-l-orange-400">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <ArrowRightLeft className="h-4 w-4 text-orange-500" />
                  Pending Settlements
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-orange-700">
                  {ops?.pendingSettlements ?? 0}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Awaiting settlement completion
                </p>
                <div className="mt-2">
                  <div className="text-xs text-muted-foreground">
                    SLA: {formatPct(ops?.settlementSlaCompliance ?? 0)} compliance
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Recon Breaks */}
            <Card className="border-l-4 border-l-red-400">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <FileSearch className="h-4 w-4 text-red-500" />
                  Recon Breaks
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-3xl font-bold ${
                  (ops?.reconBreaks ?? 0) === 0 ? "text-green-600" : "text-red-700"
                }`}>
                  {ops?.reconBreaks ?? 0}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Open reconciliation breaks
                </p>
                {(ops?.reconBreaks ?? 0) === 0 ? (
                  <Badge variant="outline" className="mt-2 text-[10px] bg-green-50 text-green-700 border-green-200">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    All Reconciled
                  </Badge>
                ) : (
                  <Badge variant="outline" className="mt-2 text-[10px] bg-red-50 text-red-700 border-red-200">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    Action Required
                  </Badge>
                )}
              </CardContent>
            </Card>

            {/* EOD Status */}
            <Card className="border-l-4 border-l-blue-400">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Server className="h-4 w-4 text-blue-500" />
                  EOD Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(() => {
                  const status = ops?.eodStatus ?? "NOT_STARTED";
                  const style = EOD_STATUS_STYLES[status];
                  const StatusIcon = style.icon;
                  return (
                    <>
                      <div className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border ${style.bg}`}>
                        <StatusIcon className={`h-5 w-5 ${style.text} ${
                          status === "IN_PROGRESS" ? "animate-spin" : ""
                        }`} />
                        <span className={`text-sm font-bold ${style.text}`}>
                          {status.replace(/_/g, " ")}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        {status === "COMPLETED" && "All end-of-day processes finished successfully"}
                        {status === "IN_PROGRESS" && "End-of-day batch processing is running"}
                        {status === "NOT_STARTED" && "End-of-day processing has not begun"}
                      </p>
                    </>
                  );
                })()}
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* ================================================================== */}
      {/* Service SLA Heat-map                                               */}
      {/* ================================================================== */}

      {slaLoading ? (
        <LoadingSkeleton />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Layers className="h-4 w-4 text-blue-500" />
              Service SLA Heat-map
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
              {slas && slas.length > 0 ? (
                slas.map((sla) => <SlaCard key={sla.service} sla={sla} />)
              ) : (
                <div className="col-span-full text-center text-muted-foreground py-8">
                  No SLA data available
                </div>
              )}
            </div>

            <Separator className="my-4" />

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <span className="font-medium">Legend:</span>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <span>Meeting SLA</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-yellow-500" />
                <span>At Risk (within 5% of target)</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <span>Breaching (more than 5% below target)</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ================================================================== */}
      {/* Incidents Panel (ORE Events)                                       */}
      {/* ================================================================== */}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertOctagon className="h-4 w-4 text-red-500" />
              Recent Operational Incidents
            </CardTitle>
            {!riskLoading && risk && (
              <div className="flex items-center gap-3 text-xs">
                <span className="text-muted-foreground">
                  {risk.oreEvents} open ORE events
                </span>
                <span className="text-muted-foreground">
                  {risk.openBreaches} compliance breaches
                </span>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted">
                  <TableHead className="font-semibold w-36">Timestamp</TableHead>
                  <TableHead className="font-semibold w-40">Category</TableHead>
                  <TableHead className="font-semibold">Description</TableHead>
                  <TableHead className="font-semibold w-24">Severity</TableHead>
                  <TableHead className="font-semibold w-28">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {STUB_INCIDENTS.map((inc) => (
                  <TableRow key={inc.id} className="hover:bg-muted">
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatTime(inc.timestamp)}
                    </TableCell>
                    <TableCell className="text-xs font-medium">
                      {inc.category}
                    </TableCell>
                    <TableCell className="text-sm">{inc.description}</TableCell>
                    <TableCell>
                      <SeverityBadge severity={inc.severity} />
                    </TableCell>
                    <TableCell>
                      <IncidentStatusBadge status={inc.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <AlertTriangle className="h-3 w-3" />
            Incidents sourced from Operational Risk Event (ORE) ledger and compliance breach records
          </div>
        </CardContent>
      </Card>

      {/* ================================================================== */}
      {/* Quick Stats Footer                                                 */}
      {/* ================================================================== */}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="text-center p-3 bg-muted rounded-lg border">
          <div className="text-lg font-bold text-foreground">
            {ops ? formatPct(ops.stpRate) : "--"}
          </div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">STP Rate</div>
        </div>
        <div className="text-center p-3 bg-muted rounded-lg border">
          <div className="text-lg font-bold text-foreground">
            {ops ? formatPct(ops.settlementSlaCompliance) : "--"}
          </div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Settlement SLA</div>
        </div>
        <div className="text-center p-3 bg-muted rounded-lg border">
          <div className="text-lg font-bold text-foreground">
            {risk?.complianceScore ?? "--"}
          </div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Compliance Score</div>
        </div>
        <div className="text-center p-3 bg-muted rounded-lg border">
          <div className="text-lg font-bold text-foreground">
            {slas ? slas.filter((s) => s.status === "MEETING").length : "--"}/{slas?.length ?? "--"}
          </div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">SLAs Meeting Target</div>
        </div>
      </div>
    </div>
  );
}
