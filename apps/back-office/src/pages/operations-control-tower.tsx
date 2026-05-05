/**
 * Operations Control Tower — Enterprise-grade (Phase 5B, BRD Screen #8)
 *
 * Operational monitoring dashboard for Trust Operations Head:
 *   - STP Rate gauge (prominent, color-coded)
 *   - Service SLA heat-map grid
 *   - Operations summary cards (pending settlements, recon breaks, EOD status)
 *   - Live incidents panel (from feed health + exception queue + degraded mode)
 *   - Date range selector for metrics
 *   - Drill-down navigation links
 *   - Auto-refresh with visual indicator
 *   - Export operational report
 *
 * API endpoints:
 *   GET /api/v1/executive/operations   - Operations metrics
 *   GET /api/v1/executive/service-sla  - Service SLA heat-map
 *   GET /api/v1/executive/risk         - Risk summary
 *   GET /api/v1/degraded-mode/active   - Active degraded-mode incidents
 *   GET /api/v1/exceptions/kpi         - Exception queue KPI
 */

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@ui/lib/queryClient';
import { apiUrl } from '@ui/lib/api-url';
import { Card, CardContent, CardHeader, CardTitle } from '@ui/components/ui/card';
import { Badge } from '@ui/components/ui/badge';
import { Button } from '@ui/components/ui/button';
import { Separator } from '@ui/components/ui/separator';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@ui/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@ui/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@ui/components/ui/tabs';
import {
  Activity, Target, CheckCircle2, AlertTriangle, AlertOctagon,
  Clock, RefreshCw, Gauge, ArrowRightLeft, FileSearch, Calculator,
  FileText, Zap, Server, Layers, Download, Shield, Bell,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OperationsMetrics {
  stpRate: number;
  stpTarget: number;
  settlementSlaCompliance: number;
  reconBreaks: number;
  pendingSettlements: number;
  eodStatus: 'COMPLETED' | 'IN_PROGRESS' | 'NOT_STARTED';
}

interface ServiceSla {
  service: string;
  slaTarget: number;
  actual: number;
  status: 'MEETING' | 'AT_RISK' | 'BREACHING';
}

interface RiskSummary {
  complianceScore: number;
  openBreaches: number;
  oreEvents: number;
  pendingSurveillance: number;
  mandateBreaches: number;
}

interface DegradedIncident {
  incident_id: string;
  failed_component: string;
  fallback_path: string;
  reason?: string;
  started_at: string;
  severity?: string;
  owner_team?: string;
}

interface ExceptionKpi {
  total: number;
  open: number;
  critical: number;
  breached_sla: number;
  resolved_today: number;
}

interface OperationalIncident {
  id: string;
  timestamp: string;
  category: string;
  description: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  status: 'INVESTIGATING' | 'RESOLVED' | 'ESCALATED' | 'ACKNOWLEDGED';
  source: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REFRESH_INTERVAL = 30_000;

const SLA_STATUS_STYLES: Record<string, { bg: string; text: string; border: string; badge: string; bar: string }> = {
  MEETING: {
    bg: 'bg-green-50 dark:bg-green-950',
    text: 'text-green-700 dark:text-green-300',
    border: 'border-green-200 dark:border-green-800',
    badge: 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 border-green-300',
    bar: 'bg-green-500',
  },
  AT_RISK: {
    bg: 'bg-yellow-50 dark:bg-yellow-950',
    text: 'text-yellow-700 dark:text-yellow-300',
    border: 'border-yellow-200 dark:border-yellow-800',
    badge: 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 border-yellow-300',
    bar: 'bg-yellow-500',
  },
  BREACHING: {
    bg: 'bg-red-50 dark:bg-red-950',
    text: 'text-red-700 dark:text-red-300',
    border: 'border-red-200 dark:border-red-800',
    badge: 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 border-red-300',
    bar: 'bg-red-500',
  },
};

const SERVICE_ICONS: Record<string, typeof Activity> = {
  'Order Processing': Zap,
  Settlement: ArrowRightLeft,
  'NAV Computation': Calculator,
  Reporting: FileText,
  Reconciliation: FileSearch,
};

const EOD_STATUS_STYLES: Record<string, { bg: string; text: string; icon: typeof CheckCircle2 }> = {
  COMPLETED: { bg: 'bg-green-50 dark:bg-green-950 border-green-200', text: 'text-green-700 dark:text-green-300', icon: CheckCircle2 },
  IN_PROGRESS: { bg: 'bg-yellow-50 dark:bg-yellow-950 border-yellow-200', text: 'text-yellow-700 dark:text-yellow-300', icon: RefreshCw },
  NOT_STARTED: { bg: 'bg-muted border-border', text: 'text-muted-foreground', icon: Clock },
};

const SEVERITY_BADGE_STYLES: Record<string, string> = {
  CRITICAL: 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 border-red-200',
  HIGH: 'bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200 border-orange-200',
  MEDIUM: 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 border-yellow-200',
  LOW: 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 border-blue-200',
};

const INCIDENT_STATUS_STYLES: Record<string, string> = {
  INVESTIGATING: 'bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200 border-orange-200',
  RESOLVED: 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 border-green-200',
  ESCALATED: 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 border-red-200',
  ACKNOWLEDGED: 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 border-blue-200',
};

const DATE_RANGE_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 Days' },
  { value: '30d', label: 'Last 30 Days' },
  { value: 'mtd', label: 'Month to Date' },
  { value: 'ytd', label: 'Year to Date' },
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(startIso: string): string {
  const ms = Date.now() - new Date(startIso).getTime();
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  if (hours > 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StpGauge({ rate, target }: { rate: number; target: number }) {
  const pct = Math.round(rate * 100);
  const targetPct = Math.round(target * 100);

  let color: string;
  let label: string;
  if (pct >= 92) { color = 'text-green-600 dark:text-green-400'; label = 'Excellent'; }
  else if (pct >= 85) { color = 'text-yellow-600 dark:text-yellow-400'; label = 'Needs Attention'; }
  else { color = 'text-red-600 dark:text-red-400'; label = 'Critical'; }

  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset = circumference - (pct / 100) * circumference;
  const targetOffset = circumference - (targetPct / 100) * circumference;

  return (
    <div className="flex flex-col items-center justify-center py-4">
      <div className="relative w-40 h-40">
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
          <circle cx="50" cy="50" r="45" fill="none" stroke="#e5e7eb" strokeWidth="8" />
          <circle cx="50" cy="50" r="45" fill="none" stroke="#d1d5db" strokeWidth="8"
            strokeDasharray={circumference} strokeDashoffset={targetOffset} strokeLinecap="round" opacity="0.4" />
          <circle cx="50" cy="50" r="45" fill="none"
            stroke={pct >= 92 ? '#16a34a' : pct >= 85 ? '#ca8a04' : '#dc2626'}
            strokeWidth="8" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
            strokeLinecap="round" className="transition-all duration-1000" />
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
        <Badge variant="outline" className={`text-xs ${
          pct >= 92 ? 'bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 border-green-200'
            : pct >= 85 ? 'bg-yellow-50 dark:bg-yellow-950 text-yellow-700 dark:text-yellow-300 border-yellow-200'
              : 'bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 border-red-200'
        }`}>
          {label}
        </Badge>
      </div>
    </div>
  );
}

function SlaCard({ sla }: { sla: ServiceSla }) {
  const styles = SLA_STATUS_STYLES[sla.status] ?? SLA_STATUS_STYLES.MEETING;
  const Icon = SERVICE_ICONS[sla.service] ?? Activity;

  return (
    <div className={`p-4 rounded-lg border-2 ${styles.bg} ${styles.border} transition-all hover:shadow-md`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon className={`h-5 w-5 ${styles.text}`} />
          <span className="font-semibold text-sm text-foreground">{sla.service}</span>
        </div>
        <Badge variant="outline" className={`text-[10px] ${styles.badge}`}>
          {sla.status.replace('_', ' ')}
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
        <div className="w-full bg-muted rounded-full h-2 mt-1">
          <div className={`h-2 rounded-full transition-all duration-700 ${styles.bar}`}
            style={{ width: `${Math.min(sla.actual * 100, 100)}%` }} />
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

function SeverityBadge({ severity }: { severity: string }) {
  return (
    <Badge variant="outline" className={`text-[10px] ${SEVERITY_BADGE_STYLES[severity] ?? 'bg-muted text-muted-foreground'}`}>
      {severity}
    </Badge>
  );
}

function IncidentStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={`text-[10px] ${INCIDENT_STATUS_STYLES[status] ?? 'bg-muted text-muted-foreground'}`}>
      {status}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function OperationsControlTower() {
  const [dateRange, setDateRange] = useState<string>('today');
  const [incidentFilter, setIncidentFilter] = useState<string>('ALL');

  // --- Data fetching ---
  const { data: opsResp, isLoading: opsLoading, isFetching: opsFetching } = useQuery<{ data: OperationsMetrics }>({
    queryKey: ['executive', 'operations'],
    queryFn: () => apiRequest('GET', apiUrl('/api/v1/executive/operations')),
    refetchInterval: REFRESH_INTERVAL,
  });

  const { data: slaResp, isLoading: slaLoading } = useQuery<{ data: ServiceSla[] }>({
    queryKey: ['executive', 'service-sla'],
    queryFn: () => apiRequest('GET', apiUrl('/api/v1/executive/service-sla')),
    refetchInterval: REFRESH_INTERVAL,
  });

  const { data: riskResp, isLoading: riskLoading } = useQuery<{ data: RiskSummary }>({
    queryKey: ['executive', 'risk'],
    queryFn: () => apiRequest('GET', apiUrl('/api/v1/executive/risk')),
    refetchInterval: REFRESH_INTERVAL,
  });

  const { data: degradedResp } = useQuery<{ data: DegradedIncident[]; hasActiveIncident: boolean }>({
    queryKey: ['degraded-mode-active'],
    queryFn: () => apiRequest('GET', apiUrl('/api/v1/degraded-mode/active')),
    refetchInterval: REFRESH_INTERVAL,
  });

  const { data: exceptionKpiResp } = useQuery<{ data: ExceptionKpi }>({
    queryKey: ['exceptions', 'kpi'],
    queryFn: () => apiRequest('GET', apiUrl('/api/v1/exceptions/kpi')),
    refetchInterval: REFRESH_INTERVAL,
  });

  // --- Derived data ---
  const ops = opsResp?.data;
  const slas = slaResp?.data;
  const risk = riskResp?.data;
  const degradedIncidents = degradedResp?.data ?? [];
  const exKpi = exceptionKpiResp?.data;

  // Build unified incidents from live sources
  const allIncidents: OperationalIncident[] = useMemo(() => {
    const incidents: OperationalIncident[] = [];

    // From degraded-mode active incidents
    degradedIncidents.forEach((d) => {
      incidents.push({
        id: d.incident_id,
        timestamp: d.started_at,
        category: 'Business Disruption',
        description: `${d.failed_component} — ${d.reason || d.fallback_path}`,
        severity: (d.severity as OperationalIncident['severity']) ?? 'HIGH',
        status: 'INVESTIGATING',
        source: 'Degraded Mode',
      });
    });

    // If exception KPI shows critical items, create synthetic incident
    if (exKpi && exKpi.critical > 0) {
      incidents.push({
        id: `exc-critical-${Date.now()}`,
        timestamp: new Date().toISOString(),
        category: 'Execution/Delivery',
        description: `${exKpi.critical} critical exception${exKpi.critical > 1 ? 's' : ''} in queue requiring immediate attention`,
        severity: 'HIGH',
        status: 'INVESTIGATING',
        source: 'Exception Queue',
      });
    }

    if (exKpi && exKpi.breached_sla > 0) {
      incidents.push({
        id: `exc-sla-${Date.now()}`,
        timestamp: new Date().toISOString(),
        category: 'Execution/Delivery',
        description: `${exKpi.breached_sla} exception item${exKpi.breached_sla > 1 ? 's' : ''} have breached SLA`,
        severity: 'MEDIUM',
        status: 'INVESTIGATING',
        source: 'Exception Queue',
      });
    }

    // From risk data
    if (risk && risk.openBreaches > 0) {
      incidents.push({
        id: `compliance-${Date.now()}`,
        timestamp: new Date().toISOString(),
        category: 'Compliance',
        description: `${risk.openBreaches} open compliance breach${risk.openBreaches > 1 ? 'es' : ''} under investigation`,
        severity: risk.openBreaches >= 3 ? 'HIGH' : 'MEDIUM',
        status: 'INVESTIGATING',
        source: 'Risk & Compliance',
      });
    }

    if (risk && risk.mandateBreaches > 0) {
      incidents.push({
        id: `mandate-${Date.now()}`,
        timestamp: new Date().toISOString(),
        category: 'Clients/Products',
        description: `${risk.mandateBreaches} mandate breach${risk.mandateBreaches > 1 ? 'es' : ''} detected`,
        severity: 'HIGH',
        status: 'ESCALATED',
        source: 'Risk & Compliance',
      });
    }

    // Sort by severity priority then timestamp
    const severityOrder: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    incidents.sort((a, b) => (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9));

    return incidents;
  }, [degradedIncidents, exKpi, risk]);

  const filteredIncidents = useMemo(() => {
    if (incidentFilter === 'ALL') return allIncidents;
    return allIncidents.filter(i => i.severity === incidentFilter);
  }, [allIncidents, incidentFilter]);

  const isRefreshing = opsFetching;

  // --- Export handler ---
  function handleExport() {
    const lines: string[] = [
      'Operations Control Tower Report',
      `Generated: ${new Date().toLocaleString('en-PH')}`,
      `Date Range: ${dateRange}`,
      '',
      '--- Operations Metrics ---',
      `STP Rate: ${ops ? formatPct(ops.stpRate) : 'N/A'} (Target: ${ops ? formatPct(ops.stpTarget) : 'N/A'})`,
      `Settlement SLA: ${ops ? formatPct(ops.settlementSlaCompliance) : 'N/A'}`,
      `Pending Settlements: ${ops?.pendingSettlements ?? 'N/A'}`,
      `Recon Breaks: ${ops?.reconBreaks ?? 'N/A'}`,
      `EOD Status: ${ops?.eodStatus ?? 'N/A'}`,
      '',
      '--- Risk Summary ---',
      `Compliance Score: ${risk?.complianceScore ?? 'N/A'}`,
      `Open Breaches: ${risk?.openBreaches ?? 'N/A'}`,
      `ORE Events: ${risk?.oreEvents ?? 'N/A'}`,
      '',
      '--- Active Incidents ---',
      ...allIncidents.map(i => `[${i.severity}] ${i.category}: ${i.description} (${i.status})`),
    ];

    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ops-control-tower-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // --- Render ---
  return (
    <div className="space-y-6 p-4 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Operations Control Tower</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Real-time operational monitoring, SLA tracking, and incident management
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-40 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DATE_RANGE_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-3.5 w-3.5 mr-1.5" /> Export
          </Button>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground border rounded-md px-2 py-1">
            <RefreshCw className={`h-3 w-3 ${isRefreshing ? 'animate-spin text-blue-500' : ''}`} />
            <span>{isRefreshing ? 'Refreshing...' : 'Auto 30s'}</span>
          </div>
        </div>
      </div>

      {/* Alert banner when incidents exist */}
      {allIncidents.length > 0 && allIncidents.some(i => i.severity === 'CRITICAL' || i.severity === 'HIGH') && (
        <div className="rounded-lg border-2 border-orange-400 bg-orange-50 dark:bg-orange-950 p-3 flex items-center gap-3" role="alert">
          <Bell className="h-5 w-5 text-orange-600 dark:text-orange-400 animate-pulse flex-shrink-0" />
          <div className="flex-1">
            <span className="font-medium text-orange-800 dark:text-orange-200">
              {allIncidents.filter(i => i.severity === 'CRITICAL' || i.severity === 'HIGH').length} high-priority operational incident{allIncidents.filter(i => i.severity === 'CRITICAL' || i.severity === 'HIGH').length !== 1 ? 's' : ''} require attention
            </span>
          </div>
          <Badge variant="outline" className="text-xs border-orange-300 text-orange-700 dark:text-orange-300">
            {allIncidents.length} total
          </Badge>
        </div>
      )}

      {/* Top Row: STP Gauge + Operations Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* STP Rate Gauge */}
        <Card className="lg:col-span-1 border-2 border-border cursor-pointer hover:shadow-md transition-shadow">
          <CardHeader className="pb-0">
            <CardTitle className="text-base flex items-center gap-2">
              <Gauge className="h-5 w-5 text-blue-500" />
              STP Rate (Straight-Through Processing)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {opsLoading ? (
              <div className="flex items-center justify-center h-48">
                <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <StpGauge rate={ops?.stpRate ?? 0} target={ops?.stpTarget ?? 0.92} />
                <Separator className="my-3" />
                <p className="text-xs text-muted-foreground text-center">
                  Orders processed without manual intervention
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Operations Summary Cards */}
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Pending Settlements */}
          <Card className="border-l-4 border-l-orange-400 cursor-pointer hover:shadow-md transition-shadow">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <ArrowRightLeft className="h-4 w-4 text-orange-500" />
                Pending Settlements
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-orange-700 dark:text-orange-300">
                {opsLoading ? '--' : ops?.pendingSettlements ?? 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Awaiting settlement completion</p>
              <div className="mt-2 text-xs text-muted-foreground">
                SLA: {ops ? formatPct(ops.settlementSlaCompliance) : '--'} compliance
              </div>
            </CardContent>
          </Card>

          {/* Recon Breaks */}
          <Card className="border-l-4 border-l-red-400 cursor-pointer hover:shadow-md transition-shadow">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <FileSearch className="h-4 w-4 text-red-500" />
                Recon Breaks
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-3xl font-bold ${
                (ops?.reconBreaks ?? 0) === 0 ? 'text-green-600 dark:text-green-400' : 'text-red-700 dark:text-red-300'
              }`}>
                {opsLoading ? '--' : ops?.reconBreaks ?? 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Open reconciliation breaks</p>
              {!opsLoading && (
                (ops?.reconBreaks ?? 0) === 0 ? (
                  <Badge variant="outline" className="mt-2 text-[10px] bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 border-green-200">
                    <CheckCircle2 className="h-3 w-3 mr-1" /> All Reconciled
                  </Badge>
                ) : (
                  <Badge variant="outline" className="mt-2 text-[10px] bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 border-red-200">
                    <AlertTriangle className="h-3 w-3 mr-1" /> Action Required
                  </Badge>
                )
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
              {opsLoading ? (
                <div className="text-3xl font-bold text-muted-foreground">--</div>
              ) : (() => {
                const status = ops?.eodStatus ?? 'NOT_STARTED';
                const style = EOD_STATUS_STYLES[status];
                const StatusIcon = style.icon;
                return (
                  <>
                    <div className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border ${style.bg}`}>
                      <StatusIcon className={`h-5 w-5 ${style.text} ${status === 'IN_PROGRESS' ? 'animate-spin' : ''}`} />
                      <span className={`text-sm font-bold ${style.text}`}>{status.replace(/_/g, ' ')}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      {status === 'COMPLETED' && 'All end-of-day processes finished successfully'}
                      {status === 'IN_PROGRESS' && 'End-of-day batch processing is running'}
                      {status === 'NOT_STARTED' && 'End-of-day processing has not begun'}
                    </p>
                  </>
                );
              })()}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Tabbed Section: SLA + Incidents */}
      <Tabs defaultValue="sla">
        <TabsList>
          <TabsTrigger value="sla">
            <Layers className="mr-1.5 h-4 w-4" /> Service SLA Heat-map
          </TabsTrigger>
          <TabsTrigger value="incidents">
            <AlertOctagon className="mr-1.5 h-4 w-4" /> Incidents
            {allIncidents.length > 0 && (
              <Badge variant="destructive" className="ml-2 text-[10px] px-1.5">{allIncidents.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="risk">
            <Shield className="mr-1.5 h-4 w-4" /> Risk Summary
          </TabsTrigger>
        </TabsList>

        {/* SLA Heat-map Tab */}
        <TabsContent value="sla" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              {slaLoading ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
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
                      <span>Breaching (below target)</span>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Incidents Tab */}
        <TabsContent value="incidents" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertOctagon className="h-4 w-4 text-red-500" />
                  Operational Incidents
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Select value={incidentFilter} onValueChange={setIncidentFilter}>
                    <SelectTrigger className="w-32 h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Severity</SelectItem>
                      <SelectItem value="CRITICAL">Critical</SelectItem>
                      <SelectItem value="HIGH">High</SelectItem>
                      <SelectItem value="MEDIUM">Medium</SelectItem>
                      <SelectItem value="LOW">Low</SelectItem>
                    </SelectContent>
                  </Select>
                  <span className="text-xs text-muted-foreground">
                    {filteredIncidents.length} incident{filteredIncidents.length !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted">
                      <TableHead className="font-semibold w-36">Timestamp</TableHead>
                      <TableHead className="font-semibold w-32">Source</TableHead>
                      <TableHead className="font-semibold w-40">Category</TableHead>
                      <TableHead className="font-semibold">Description</TableHead>
                      <TableHead className="font-semibold w-24">Severity</TableHead>
                      <TableHead className="font-semibold w-28">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredIncidents.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-12">
                          <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
                          No operational incidents
                        </TableCell>
                      </TableRow>
                    )}
                    {filteredIncidents.map((inc) => (
                      <TableRow key={inc.id} className="hover:bg-muted/50">
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatTime(inc.timestamp)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">{inc.source}</Badge>
                        </TableCell>
                        <TableCell className="text-xs font-medium">{inc.category}</TableCell>
                        <TableCell className="text-sm">{inc.description}</TableCell>
                        <TableCell><SeverityBadge severity={inc.severity} /></TableCell>
                        <TableCell><IncidentStatusBadge status={inc.status} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <AlertTriangle className="h-3 w-3" />
                Incidents sourced from Degraded Mode, Exception Queue, and Risk & Compliance systems
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Risk Summary Tab */}
        <TabsContent value="risk" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              {riskLoading ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : risk ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                  <div className="p-4 rounded-lg border bg-muted/30 text-center">
                    <div className={`text-3xl font-bold ${
                      risk.complianceScore >= 90 ? 'text-green-600' : risk.complianceScore >= 75 ? 'text-yellow-600' : 'text-red-600'
                    }`}>
                      {risk.complianceScore}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">Compliance Score</div>
                  </div>
                  <div className="p-4 rounded-lg border bg-muted/30 text-center">
                    <div className={`text-3xl font-bold ${risk.openBreaches > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {risk.openBreaches}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">Open Breaches</div>
                  </div>
                  <div className="p-4 rounded-lg border bg-muted/30 text-center">
                    <div className="text-3xl font-bold text-orange-600">{risk.oreEvents}</div>
                    <div className="text-xs text-muted-foreground mt-1">ORE Events</div>
                  </div>
                  <div className="p-4 rounded-lg border bg-muted/30 text-center">
                    <div className="text-3xl font-bold text-blue-600">{risk.pendingSurveillance}</div>
                    <div className="text-xs text-muted-foreground mt-1">Pending Surveillance</div>
                  </div>
                  <div className="p-4 rounded-lg border bg-muted/30 text-center">
                    <div className={`text-3xl font-bold ${risk.mandateBreaches > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {risk.mandateBreaches}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">Mandate Breaches</div>
                  </div>
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-8">No risk data available</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Quick Stats Footer */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="text-center p-3 bg-muted rounded-lg border">
          <div className="text-lg font-bold text-foreground">{ops ? formatPct(ops.stpRate) : '--'}</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">STP Rate</div>
        </div>
        <div className="text-center p-3 bg-muted rounded-lg border">
          <div className="text-lg font-bold text-foreground">{ops ? formatPct(ops.settlementSlaCompliance) : '--'}</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Settlement SLA</div>
        </div>
        <div className="text-center p-3 bg-muted rounded-lg border">
          <div className="text-lg font-bold text-foreground">{risk?.complianceScore ?? '--'}</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Compliance Score</div>
        </div>
        <div className="text-center p-3 bg-muted rounded-lg border">
          <div className="text-lg font-bold text-foreground">
            {slas ? slas.filter(s => s.status === 'MEETING').length : '--'}/{slas?.length ?? '--'}
          </div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">SLAs Meeting Target</div>
        </div>
        <div className="text-center p-3 bg-muted rounded-lg border">
          <div className="text-lg font-bold text-foreground">{exKpi?.resolved_today ?? '--'}</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Resolved Today</div>
        </div>
      </div>
    </div>
  );
}
