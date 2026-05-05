/**
 * Feed & Degraded Mode Monitor — Enterprise-grade
 *
 * Real-time feed health monitoring and incident lifecycle management.
 * Auto-refreshes feed health (15s) and active incidents (10s).
 *
 * API endpoints (all under /api/v1/degraded-mode/):
 *   GET  /feed-health       - Feed status list
 *   GET  /active            - Active incidents
 *   GET  /history           - Resolved incidents
 *   GET  /kpi/{year}        - Yearly KPI metrics
 *   POST /report            - Report new incident
 *   PUT  /{incidentId}/resolve - Resolve incident
 */

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@ui/lib/queryClient';
import { apiUrl } from '@ui/lib/api-url';
import { Card, CardContent, CardHeader, CardTitle } from '@ui/components/ui/card';
import { Button } from '@ui/components/ui/button';
import { Badge } from '@ui/components/ui/badge';
import { Input } from '@ui/components/ui/input';
import { Label } from '@ui/components/ui/label';
import { Separator } from '@ui/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@ui/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@ui/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@ui/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@ui/components/ui/tabs';
import { Textarea } from '@ui/components/ui/textarea';
import { toast } from 'sonner';
import {
  Radio, AlertTriangle, CheckCircle, XCircle, Plus, Gauge, RefreshCw,
  Clock, Activity, ShieldAlert, Target, Wifi, WifiOff,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FeedStatus {
  name: string;
  status: 'UP' | 'DOWN' | 'DEGRADED';
  latencyMs: number;
  lastUpdate?: string;
  overrideStatus?: string;
}

interface Incident {
  incident_id: string;
  failed_component: string;
  fallback_path: string;
  reason?: string;
  severity?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  started_at: string;
  ended_at?: string;
  rca_completed?: boolean;
  resolution_notes?: string;
  owner_team?: string;
}

interface KpiData {
  degradedModeDays: number;
  target: number;
  slaTargetPct?: number;
  totalIncidents?: number;
  mttr?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_BASE = '/api/v1/degraded-mode';

const FEED_COMPONENTS = ['BLOOMBERG', 'REUTERS', 'DTCC', 'PDTC', 'SWIFT', 'AI', 'DB'] as const;
const SEVERITY_OPTIONS = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;
const ROOT_CAUSE_OPTIONS = ['NETWORK', 'PROVIDER', 'INFRASTRUCTURE', 'CONFIGURATION', 'UNKNOWN'] as const;

const FEED_STATUS_CONFIG: Record<string, { color: string; bgClass: string; borderClass: string; icon: typeof CheckCircle }> = {
  UP: { color: 'text-green-600 dark:text-green-400', bgClass: 'bg-green-50 dark:bg-green-950', borderClass: 'border-green-300 dark:border-green-700', icon: CheckCircle },
  DEGRADED: { color: 'text-yellow-600 dark:text-yellow-400', bgClass: 'bg-yellow-50 dark:bg-yellow-950', borderClass: 'border-yellow-300 dark:border-yellow-700', icon: Activity },
  DOWN: { color: 'text-red-600 dark:text-red-400', bgClass: 'bg-red-50 dark:bg-red-950', borderClass: 'border-red-300 dark:border-red-700', icon: XCircle },
};

const SEVERITY_BADGE_VARIANT: Record<string, 'destructive' | 'outline' | 'secondary' | 'default'> = {
  CRITICAL: 'destructive',
  HIGH: 'outline',
  MEDIUM: 'secondary',
  LOW: 'default',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(startIso: string): string {
  const ms = Date.now() - new Date(startIso).getTime();
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  if (hours > 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatTimestamp(iso?: string): string {
  if (!iso) return '--';
  return new Date(iso).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function DegradedModeMonitor() {
  const queryClient = useQueryClient();
  const currentYear = new Date().getFullYear();

  // --- Dialog state ---
  const [reportOpen, setReportOpen] = useState(false);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [resolveTarget, setResolveTarget] = useState<string | null>(null);
  const [reportData, setReportData] = useState({
    failedComponent: '',
    fallbackPath: '',
    reason: '',
    ownerTeam: '',
    affectedFeeds: '',
    severity: 'HIGH',
  });
  const [resolveData, setResolveData] = useState({ resolutionNotes: '', rootCause: '' });

  // --- History date filter ---
  const [historyFrom, setHistoryFrom] = useState('');
  const [historyTo, setHistoryTo] = useState('');

  // --- Queries ---
  const { data: feedHealthResp, isFetching: feedFetching } = useQuery<{ feeds: FeedStatus[] }>({
    queryKey: ['feed-health'],
    queryFn: () => apiRequest('GET', apiUrl(`${API_BASE}/feed-health`)),
    refetchInterval: 15_000,
  });

  const { data: activeResp, isFetching: activeFetching } = useQuery<{ data: Incident[]; hasActiveIncident: boolean }>({
    queryKey: ['active-incidents'],
    queryFn: () => apiRequest('GET', apiUrl(`${API_BASE}/active`)),
    refetchInterval: 10_000,
  });

  const { data: historyResp } = useQuery<{ data: Incident[]; total?: number }>({
    queryKey: ['incident-history'],
    queryFn: () => apiRequest('GET', apiUrl(`${API_BASE}/history?pageSize=50`)),
  });

  const { data: kpi } = useQuery<KpiData>({
    queryKey: ['degraded-kpi', currentYear],
    queryFn: () => apiRequest('GET', apiUrl(`${API_BASE}/kpi/${currentYear}`)),
  });

  // --- Derived data ---
  const feeds = feedHealthResp?.feeds ?? [];
  const activeIncidents = activeResp?.data ?? [];
  const hasActiveIncident = activeResp?.hasActiveIncident ?? false;
  const historyIncidents = historyResp?.data ?? [];

  const feedsOnline = useMemo(() => feeds.filter(f => f.status === 'UP').length, [feeds]);
  const slaTargetPct = kpi?.slaTargetPct ?? 99.5;

  const filteredHistory = useMemo(() => {
    let items = historyIncidents;
    if (historyFrom) {
      const from = new Date(historyFrom).getTime();
      items = items.filter(i => new Date(i.started_at).getTime() >= from);
    }
    if (historyTo) {
      const to = new Date(historyTo).getTime() + 86_400_000;
      items = items.filter(i => new Date(i.started_at).getTime() <= to);
    }
    return items;
  }, [historyIncidents, historyFrom, historyTo]);

  // --- Mutations ---
  const reportMutation = useMutation({
    mutationFn: (data: typeof reportData) =>
      apiRequest('POST', apiUrl(`${API_BASE}/report`), {
        failedComponent: data.failedComponent,
        fallbackPath: data.fallbackPath,
        reason: data.reason || data.fallbackPath,
        ownerTeam: data.ownerTeam || undefined,
        affectedFeeds: data.affectedFeeds.split(',').map(f => f.trim()).filter(Boolean),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['active-incidents'] });
      queryClient.invalidateQueries({ queryKey: ['feed-health'] });
      queryClient.invalidateQueries({ queryKey: ['degraded-kpi'] });
      setReportOpen(false);
      setReportData({ failedComponent: '', fallbackPath: '', reason: '', ownerTeam: '', affectedFeeds: '', severity: 'HIGH' });
      toast.success('Incident reported successfully');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const resolveMutation = useMutation({
    mutationFn: ({ incidentId, body }: { incidentId: string; body: typeof resolveData }) =>
      apiRequest('PUT', apiUrl(`${API_BASE}/${incidentId}/resolve`), {
        resolutionNotes: body.resolutionNotes,
        rootCause: body.rootCause || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['active-incidents'] });
      queryClient.invalidateQueries({ queryKey: ['incident-history'] });
      queryClient.invalidateQueries({ queryKey: ['feed-health'] });
      queryClient.invalidateQueries({ queryKey: ['degraded-kpi'] });
      setResolveOpen(false);
      setResolveTarget(null);
      setResolveData({ resolutionNotes: '', rootCause: '' });
      toast.success('Incident resolved');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // --- Handlers ---
  function openResolveDialog(incidentId: string) {
    setResolveTarget(incidentId);
    setResolveData({ resolutionNotes: '', rootCause: '' });
    setResolveOpen(true);
  }

  // --- Render ---
  return (
    <div className="space-y-6 p-1">
      {/* Active incident alert banner */}
      {hasActiveIncident && (
        <div className="rounded-lg border-2 border-red-500 bg-red-50 dark:bg-red-950 p-4 flex items-center gap-3" role="alert">
          <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400 animate-pulse flex-shrink-0" />
          <div className="flex-1">
            <p className="font-semibold text-red-800 dark:text-red-200">DEGRADED MODE ACTIVE</p>
            <p className="text-sm text-red-600 dark:text-red-400">
              {activeIncidents.length} active incident{activeIncidents.length !== 1 ? 's' : ''} — some feeds may be unavailable or operating in fallback mode
            </p>
          </div>
          <Badge variant="destructive" className="text-xs">{activeIncidents.length} ACTIVE</Badge>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Feed & Degraded Mode Monitor</h1>
          <p className="text-muted-foreground">Business continuity — feed health and incident management</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <RefreshCw className={`h-3.5 w-3.5 ${feedFetching || activeFetching ? 'animate-spin' : ''}`} />
            <span>Auto-refresh</span>
          </div>
          <Dialog open={reportOpen} onOpenChange={setReportOpen}>
            <DialogTrigger asChild>
              <Button variant="destructive" size="sm">
                <Plus className="mr-2 h-4 w-4" /> Report Incident
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Report Feed Incident</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Failed Component *</Label>
                  <Select value={reportData.failedComponent} onValueChange={v => setReportData(d => ({ ...d, failedComponent: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select component" /></SelectTrigger>
                    <SelectContent>
                      {FEED_COMPONENTS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Severity</Label>
                  <Select value={reportData.severity} onValueChange={v => setReportData(d => ({ ...d, severity: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SEVERITY_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Fallback Path / Actions Taken *</Label>
                  <Textarea
                    placeholder="Describe fallback actions taken..."
                    value={reportData.fallbackPath}
                    onChange={e => setReportData(d => ({ ...d, fallbackPath: e.target.value }))}
                    rows={2}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Impact Description</Label>
                  <Textarea
                    placeholder="Describe impact on operations..."
                    value={reportData.reason}
                    onChange={e => setReportData(d => ({ ...d, reason: e.target.value }))}
                    rows={2}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Owner Team</Label>
                    <Input
                      placeholder="e.g. Infrastructure"
                      value={reportData.ownerTeam}
                      onChange={e => setReportData(d => ({ ...d, ownerTeam: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Affected Feeds</Label>
                    <Input
                      placeholder="BLOOMBERG, SWIFT"
                      value={reportData.affectedFeeds}
                      onChange={e => setReportData(d => ({ ...d, affectedFeeds: e.target.value }))}
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setReportOpen(false)}>Cancel</Button>
                <Button
                  variant="destructive"
                  onClick={() => reportMutation.mutate(reportData)}
                  disabled={!reportData.failedComponent || !reportData.fallbackPath || reportMutation.isPending}
                >
                  {reportMutation.isPending ? 'Reporting...' : 'Report Incident'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className={`border-l-4 ${feedsOnline === feeds.length ? 'border-l-green-500' : 'border-l-yellow-500'}`}>
          <CardContent className="flex items-center gap-3 pt-6">
            <Wifi className={`h-8 w-8 ${feedsOnline === feeds.length ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'}`} />
            <div>
              <p className="text-2xl font-bold">{feedsOnline}/{feeds.length || '--'}</p>
              <p className="text-sm text-muted-foreground">Feeds Online</p>
            </div>
          </CardContent>
        </Card>

        <Card className={`border-l-4 ${activeIncidents.length > 0 ? 'border-l-red-500' : 'border-l-green-500'}`}>
          <CardContent className="flex items-center gap-3 pt-6">
            <ShieldAlert className={`h-8 w-8 ${activeIncidents.length > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`} />
            <div>
              <p className="text-2xl font-bold">{activeIncidents.length}</p>
              <p className="text-sm text-muted-foreground">Active Incidents</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="flex items-center gap-3 pt-6">
            <Clock className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            <div>
              <p className="text-2xl font-bold">{kpi?.degradedModeDays ?? 0}</p>
              <p className="text-sm text-muted-foreground">Degraded Days YTD ({currentYear})</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-green-500">
          <CardContent className="flex items-center gap-3 pt-6">
            <Target className="h-8 w-8 text-green-600 dark:text-green-400" />
            <div>
              <p className="text-2xl font-bold">{slaTargetPct}%</p>
              <p className="text-sm text-muted-foreground">SLA Target Uptime</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="feeds">
        <TabsList>
          <TabsTrigger value="feeds">
            <Radio className="mr-1.5 h-4 w-4" /> Feed Health
          </TabsTrigger>
          <TabsTrigger value="incidents">
            <AlertTriangle className="mr-1.5 h-4 w-4" /> Active Incidents
            {activeIncidents.length > 0 && (
              <Badge variant="destructive" className="ml-2 text-[10px] px-1.5">{activeIncidents.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history">
            <Clock className="mr-1.5 h-4 w-4" /> Incident History
          </TabsTrigger>
        </TabsList>

        {/* Feed Health Tab */}
        <TabsContent value="feeds" className="mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {feeds.map((feed) => {
              const config = FEED_STATUS_CONFIG[feed.status] ?? FEED_STATUS_CONFIG.DOWN;
              const StatusIcon = config.icon;
              return (
                <Card key={feed.name} className={`border-2 ${config.borderClass} ${config.bgClass}`}>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <StatusIcon className={`h-5 w-5 ${config.color}`} />
                        <span className="font-bold text-sm">{feed.name}</span>
                      </div>
                      <Badge
                        variant={feed.status === 'UP' ? 'default' : feed.status === 'DEGRADED' ? 'secondary' : 'destructive'}
                      >
                        {feed.overrideStatus || feed.status}
                      </Badge>
                    </div>
                    <Separator className="my-2" />
                    <div className="flex justify-between text-xs text-muted-foreground mt-3">
                      <span>Last Update: {feed.lastUpdate ? formatTimestamp(feed.lastUpdate) : 'N/A'}</span>
                      <span className="font-medium">
                        {feed.latencyMs != null ? `${feed.latencyMs}ms` : '--'}
                      </span>
                    </div>
                    {feed.latencyMs != null && (
                      <div className="mt-2 w-full bg-muted rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full transition-all ${
                            feed.latencyMs < 100 ? 'bg-green-500' : feed.latencyMs < 500 ? 'bg-yellow-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${Math.min((feed.latencyMs / 1000) * 100, 100)}%` }}
                        />
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
            {feeds.length === 0 && (
              <div className="col-span-full text-center text-muted-foreground py-12">
                <WifiOff className="h-12 w-12 mx-auto mb-3 opacity-40" />
                <p>No feed health data available</p>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Active Incidents Tab */}
        <TabsContent value="incidents" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {activeIncidents.length === 0
                  ? 'No active incidents — all systems operational'
                  : `${activeIncidents.length} incident${activeIncidents.length !== 1 ? 's' : ''} requiring attention`}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted">
                      <TableHead className="font-semibold">Incident ID</TableHead>
                      <TableHead className="font-semibold">Feed / Component</TableHead>
                      <TableHead className="font-semibold">Severity</TableHead>
                      <TableHead className="font-semibold">Started</TableHead>
                      <TableHead className="font-semibold">Duration</TableHead>
                      <TableHead className="font-semibold">Description</TableHead>
                      <TableHead className="font-semibold text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activeIncidents.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-12">
                          <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500" />
                          All clear — no active incidents
                        </TableCell>
                      </TableRow>
                    )}
                    {activeIncidents.map((inc) => (
                      <TableRow key={inc.incident_id}>
                        <TableCell className="font-mono text-xs">{inc.incident_id.slice(0, 12)}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{inc.failed_component}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={SEVERITY_BADGE_VARIANT[inc.severity ?? 'HIGH'] ?? 'outline'}>
                            {inc.severity ?? 'HIGH'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{formatTimestamp(inc.started_at)}</TableCell>
                        <TableCell className="text-xs font-medium">{formatDuration(inc.started_at)}</TableCell>
                        <TableCell className="text-sm max-w-[300px] truncate">{inc.reason || inc.fallback_path}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openResolveDialog(inc.incident_id)}
                          >
                            Resolve
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Incident History Tab */}
        <TabsContent value="history" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">Resolved Incidents</CardTitle>
                <div className="flex items-center gap-2">
                  <Input
                    type="date"
                    className="h-8 w-36 text-xs"
                    value={historyFrom}
                    onChange={e => setHistoryFrom(e.target.value)}
                    placeholder="From"
                  />
                  <span className="text-xs text-muted-foreground">to</span>
                  <Input
                    type="date"
                    className="h-8 w-36 text-xs"
                    value={historyTo}
                    onChange={e => setHistoryTo(e.target.value)}
                    placeholder="To"
                  />
                  {(historyFrom || historyTo) && (
                    <Button variant="ghost" size="sm" onClick={() => { setHistoryFrom(''); setHistoryTo(''); }}>
                      Clear
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted">
                      <TableHead className="font-semibold">Incident ID</TableHead>
                      <TableHead className="font-semibold">Component</TableHead>
                      <TableHead className="font-semibold">Started</TableHead>
                      <TableHead className="font-semibold">Resolved</TableHead>
                      <TableHead className="font-semibold">Duration</TableHead>
                      <TableHead className="font-semibold">Root Cause</TableHead>
                      <TableHead className="font-semibold">Resolution</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredHistory.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                          No incident history found
                        </TableCell>
                      </TableRow>
                    )}
                    {filteredHistory.map((inc) => {
                      const durationMs = inc.ended_at
                        ? new Date(inc.ended_at).getTime() - new Date(inc.started_at).getTime()
                        : 0;
                      const hours = Math.floor(durationMs / 3_600_000);
                      const mins = Math.floor((durationMs % 3_600_000) / 60_000);
                      const durationStr = inc.ended_at ? (hours > 0 ? `${hours}h ${mins}m` : `${mins}m`) : '--';

                      return (
                        <TableRow key={inc.incident_id}>
                          <TableCell className="font-mono text-xs">{inc.incident_id.slice(0, 12)}</TableCell>
                          <TableCell><Badge variant="outline">{inc.failed_component}</Badge></TableCell>
                          <TableCell className="text-xs whitespace-nowrap">{formatTimestamp(inc.started_at)}</TableCell>
                          <TableCell className="text-xs whitespace-nowrap">{formatTimestamp(inc.ended_at)}</TableCell>
                          <TableCell className="text-xs">{durationStr}</TableCell>
                          <TableCell>
                            <Badge
                              variant="secondary"
                              className={inc.rca_completed ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200' : 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200'}
                            >
                              {inc.rca_completed ? 'RCA Complete' : 'RCA Pending'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs max-w-[200px] truncate">
                            {inc.resolution_notes || '--'}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <div className="mt-3 text-xs text-muted-foreground">
                Showing {filteredHistory.length} resolved incident{filteredHistory.length !== 1 ? 's' : ''}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Resolve Incident Dialog */}
      <Dialog open={resolveOpen} onOpenChange={setResolveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Resolve Incident</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Resolution Notes *</Label>
              <Textarea
                placeholder="Describe how the incident was resolved..."
                value={resolveData.resolutionNotes}
                onChange={e => setResolveData(d => ({ ...d, resolutionNotes: e.target.value }))}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Root Cause Category</Label>
              <Select value={resolveData.rootCause} onValueChange={v => setResolveData(d => ({ ...d, rootCause: v }))}>
                <SelectTrigger><SelectValue placeholder="Select root cause" /></SelectTrigger>
                <SelectContent>
                  {ROOT_CAUSE_OPTIONS.map(rc => <SelectItem key={rc} value={rc}>{rc}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveOpen(false)}>Cancel</Button>
            <Button
              onClick={() => resolveTarget && resolveMutation.mutate({ incidentId: resolveTarget, body: resolveData })}
              disabled={!resolveData.resolutionNotes || resolveMutation.isPending}
            >
              {resolveMutation.isPending ? 'Resolving...' : 'Resolve'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
