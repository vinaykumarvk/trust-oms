/**
 * Campaign Analytics Dashboard
 *
 * Visualises campaign performance metrics including KPIs, response
 * breakdowns, dispatch summaries, and per-campaign drill-down.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@ui/components/ui/card';
import { Button } from '@ui/components/ui/button';
import { Badge } from '@ui/components/ui/badge';
import { Input } from '@ui/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@ui/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@ui/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@ui/components/ui/dropdown-menu';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { toast } from 'sonner';
import {
  BarChart3, Users, Target, TrendingUp, DollarSign, Mail,
  Calendar, CheckCircle, Clock, Send, Download, Filter,
} from 'lucide-react';
import { SkeletonRows } from '@/components/ui/skeleton-rows';

/* ---------- Auth helpers ---------- */

function authHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json' };
}

function fetcher(url: string) {
  return fetch(url, { headers: authHeaders(), credentials: 'include' }).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });
}

/* ---------- Types ---------- */

interface DashboardStats {
  campaigns_by_status: Array<{ campaign_status: string; count: number }>;
  total_leads: number;
  total_responses: number;
  conversion_rate: number;
  roi: number;
  total_revenue: number;
  total_campaign_cost: number;
  cost_per_lead: number;
  pipeline_value: number;
}

interface CampaignListItem {
  id: number;
  campaign_code: string;
  name: string;
  campaign_status: string;
}

interface CampaignAnalyticsData {
  campaign: {
    id: number;
    campaign_code: string;
    name: string;
    campaign_type: string;
    start_date: string;
    end_date: string;
    budget: number;
    status: string;
  };
  responseBreakdown: {
    INTERESTED: number;
    NOT_INTERESTED: number;
    MAYBE: number;
    CONVERTED: number;
    NO_RESPONSE: number;
  };
  dispatch: {
    totalRecipients: number;
    delivered: number;
    bounced: number;
    deliveryRate: number;
  };
  timeline: Array<{
    event: string;
    timestamp: string;
    actor: string | null;
  }>;
}

interface FunnelStage {
  stage: string;
  count: number;
}

interface RmScorecard {
  rm_id: string;
  rm_name: string;
  assigned_leads: number;
  response_rate: number;
  conversion_rate: number;
  meetings_held: number;
  call_reports_filed: number;
}

/* ---------- Constants ---------- */

const FUNNEL_COLORS = ['#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#22c55e'];

const RESPONSE_BAR_COLORS: Record<string, string> = {
  INTERESTED: 'bg-green-500',
  NOT_INTERESTED: 'bg-red-500',
  MAYBE: 'bg-yellow-500',
  CONVERTED: 'bg-purple-500',
  NO_RESPONSE: 'bg-gray-400',
};

const RESPONSE_TEXT_COLORS: Record<string, string> = {
  INTERESTED: 'text-green-700 dark:text-green-400',
  NOT_INTERESTED: 'text-red-700 dark:text-red-400',
  MAYBE: 'text-yellow-700 dark:text-yellow-400',
  CONVERTED: 'text-purple-700 dark:text-purple-400',
  NO_RESPONSE: 'text-gray-600 dark:text-gray-400',
};

const RESPONSE_BADGE_COLORS: Record<string, string> = {
  INTERESTED: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  NOT_INTERESTED: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  MAYBE: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  CONVERTED: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  NO_RESPONSE: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
};

const TIMELINE_ICONS: Record<string, typeof CheckCircle> = {
  created: Calendar,
  submitted: Send,
  approved: CheckCircle,
  dispatched: Mail,
};

/* ---------- Component ---------- */

export default function CampaignAnalytics() {
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [campaignFilter, setCampaignFilter] = useState<string>('');

  const { data: stats, isPending: statsPending } = useQuery<DashboardStats>({
    queryKey: ['campaign-dashboard-stats'],
    queryFn: () => fetcher('/api/v1/campaign-mgmt/campaign-dashboard/stats'),
    refetchInterval: 30000,
  });

  const { data: campaignList, isPending: listPending } = useQuery<{ data: CampaignListItem[] }>({
    queryKey: ['campaigns-list'],
    queryFn: () => fetcher('/api/v1/campaigns'),
  });

  const { data: campaignAnalytics, isPending: analyticsPending } = useQuery<CampaignAnalyticsData>({
    queryKey: ['campaign-analytics', selectedCampaignId],
    queryFn: () => fetcher(`/api/v1/campaign-mgmt/campaigns/${selectedCampaignId}/analytics`),
    enabled: !!selectedCampaignId,
  });

  // Conversion funnel query
  const funnelParams = new URLSearchParams();
  if (dateFrom) funnelParams.set('from', dateFrom);
  if (dateTo) funnelParams.set('to', dateTo);
  if (campaignFilter) funnelParams.set('campaignId', campaignFilter);
  const funnelQs = funnelParams.toString();

  const { data: funnelData, isPending: funnelPending } = useQuery<{ data: FunnelStage[] }>({
    queryKey: ['conversion-funnel', funnelQs],
    queryFn: () => fetcher(`/api/v1/campaign-mgmt/conversion-history/funnel${funnelQs ? `?${funnelQs}` : ''}`),
    refetchInterval: 60000,
  });

  // RM Scorecards query
  const { data: rmScorecards, isPending: rmPending } = useQuery<{ data: RmScorecard[] }>({
    queryKey: ['rm-scorecards', funnelQs],
    queryFn: () => fetcher(`/api/v1/campaign-mgmt/campaign-dashboard/rm-scorecards${funnelQs ? `?${funnelQs}` : ''}`),
    refetchInterval: 60000,
  });

  const funnelStages = funnelData?.data ?? [
    { stage: 'Leads', count: 0 },
    { stage: 'Contacted', count: 0 },
    { stage: 'Qualified', count: 0 },
    { stage: 'Converted', count: 0 },
    { stage: 'Prospects', count: 0 },
  ];

  const rmData = rmScorecards?.data ?? [];

  const campaigns = campaignList?.data ?? [];

  /* --- Export handler --- */
  async function handleExport(format: 'xlsx' | 'pdf') {
    try {
      const resp = await fetch(`/api/v1/campaign-mgmt/analytics/export?format=${format}`, {
        headers: authHeaders(),
        credentials: 'include',
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'Export failed' }));
        throw new Error((err as { error?: string }).error || 'Export failed');
      }
      const blob = await resp.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `campaign-analytics.${format}`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success(`Analytics exported as ${format.toUpperCase()}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed');
    }
  }

  /* --- Derived stats from backend response --- */
  const totalCampaigns = (stats?.campaigns_by_status ?? []).reduce(
    (sum, s) => sum + Number(s.count), 0,
  );
  const activeCampaigns = (stats?.campaigns_by_status ?? []).find(
    (s) => s.campaign_status === 'ACTIVE',
  )?.count ?? 0;

  /* --- KPI card definitions --- */
  const kpiCards = [
    {
      label: 'Total Campaigns',
      value: totalCampaigns,
      icon: BarChart3,
      color: 'text-blue-600',
    },
    {
      label: 'Active Campaigns',
      value: Number(activeCampaigns),
      icon: Target,
      color: 'text-green-600',
    },
    {
      label: 'Total Leads',
      value: (stats?.total_leads ?? 0).toLocaleString(),
      icon: Users,
      color: 'text-indigo-600',
    },
    {
      label: 'Total Responses',
      value: (stats?.total_responses ?? 0).toLocaleString(),
      icon: Mail,
      color: 'text-orange-600',
    },
    {
      label: 'Conversion Rate',
      value: `${(stats?.conversion_rate ?? 0).toFixed(1)}%`,
      icon: TrendingUp,
      color: 'text-purple-600',
    },
    {
      label: 'Campaign Cost',
      value: (stats?.total_campaign_cost ?? 0).toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }),
      icon: DollarSign,
      color: 'text-emerald-600',
    },
  ];

  /* --- Response breakdown renderer --- */
  function renderResponseBreakdown(breakdown: CampaignAnalyticsData['responseBreakdown']) {
    const entries = Object.entries(breakdown) as Array<[string, number]>;
    const total = entries.reduce((sum, [, count]) => sum + count, 0);
    const maxCount = Math.max(...entries.map(([, count]) => count), 1);

    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Response Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {entries.map(([type, count]: [string, number]) => (
            <div key={type} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <Badge className={RESPONSE_BADGE_COLORS[type] || ''} variant="secondary">
                    {type.replace(/_/g, ' ')}
                  </Badge>
                </div>
                <span className={`font-mono font-medium ${RESPONSE_TEXT_COLORS[type] || ''}`}>
                  {count} ({total > 0 ? ((count / total) * 100).toFixed(1) : '0.0'}%)
                </span>
              </div>
              <div className="h-3 w-full rounded-full bg-muted">
                <div
                  className={`h-3 rounded-full transition-all ${RESPONSE_BAR_COLORS[type] || 'bg-gray-400'}`}
                  style={{ width: `${Math.max((count / maxCount) * 100, 2)}%` }}
                />
              </div>
            </div>
          ))}
          <div className="pt-2 border-t text-sm text-muted-foreground">
            Total responses: <span className="font-medium">{total.toLocaleString()}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  /* --- Skeleton card helper --- */
  function SkeletonCard() {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          <div className="h-4 w-4 animate-pulse rounded bg-muted" />
        </CardHeader>
        <CardContent>
          <div className="h-8 w-20 animate-pulse rounded bg-muted" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Campaign Analytics</h1>
          <p className="text-muted-foreground">
            Performance metrics and drill-down analytics for marketing campaigns
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" /> Export
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleExport('xlsx')}>
              <Download className="h-3.5 w-3.5 mr-2" /> Export as Excel
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExport('pdf')}>
              <Download className="h-3.5 w-3.5 mr-2" /> Export as PDF
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Global Filters */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
              <Filter className="h-4 w-4" /> Filters
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">From</label>
              <Input
                type="date"
                className="h-8 w-[150px] text-sm"
                value={dateFrom}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">To</label>
              <Input
                type="date"
                className="h-8 w-[150px] text-sm"
                value={dateTo}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDateTo(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Campaign</label>
              <Select value={campaignFilter} onValueChange={(v: string) => setCampaignFilter(v)}>
                <SelectTrigger className="h-8 w-[220px] text-sm">
                  <SelectValue placeholder="All campaigns" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All campaigns</SelectItem>
                  {campaigns.map((c: CampaignListItem) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.campaign_code} - {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {(dateFrom || dateTo || campaignFilter) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={() => {
                  setDateFrom('');
                  setDateTo('');
                  setCampaignFilter('');
                }}
              >
                Clear filters
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        {statsPending
          ? Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
          : kpiCards.map((card: typeof kpiCards[number]) => (
              <Card key={card.label}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">{card.label}</CardTitle>
                  <card.icon className={`h-4 w-4 ${card.color}`} />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{card.value}</div>
                </CardContent>
              </Card>
            ))}
      </div>

      {/* Conversion Funnel Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Conversion Funnel</CardTitle>
        </CardHeader>
        <CardContent>
          {funnelPending ? (
            <div className="h-[260px] flex items-center justify-center">
              <div className="h-8 w-48 animate-pulse rounded bg-muted" />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={funnelStages}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 80, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" />
                <YAxis
                  type="category"
                  dataKey="stage"
                  tick={{ fontSize: 13 }}
                  width={80}
                />
                <Tooltip
                  formatter={(value: number) => [value.toLocaleString(), 'Count']}
                  contentStyle={{
                    backgroundColor: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '6px',
                    color: 'hsl(var(--popover-foreground))',
                  }}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={36}>
                  {funnelStages.map((_entry: FunnelStage, index: number) => (
                    <Cell key={index} fill={FUNNEL_COLORS[index % FUNNEL_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* RM Scorecards Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">RM Scorecards</CardTitle>
        </CardHeader>
        <CardContent>
          {rmPending ? (
            <div className="rounded-md border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>RM Name</TableHead>
                    <TableHead className="text-right">Assigned Leads</TableHead>
                    <TableHead className="text-right">Response Rate</TableHead>
                    <TableHead className="text-right">Conversion Rate</TableHead>
                    <TableHead className="text-right">Meetings Held</TableHead>
                    <TableHead className="text-right">Call Reports Filed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <SkeletonRows cols={6} rows={4} />
                </TableBody>
              </Table>
            </div>
          ) : rmData.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
              <Users className="h-10 w-10 text-muted-foreground/50" />
              <p>No RM scorecard data available</p>
            </div>
          ) : (
            <div className="rounded-md border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>RM Name</TableHead>
                    <TableHead className="text-right">Assigned Leads</TableHead>
                    <TableHead className="text-right">Response Rate</TableHead>
                    <TableHead className="text-right">Conversion Rate</TableHead>
                    <TableHead className="text-right">Meetings Held</TableHead>
                    <TableHead className="text-right">Call Reports Filed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rmData.map((rm: RmScorecard) => (
                    <TableRow key={rm.rm_id}>
                      <TableCell className="font-medium">{rm.rm_name}</TableCell>
                      <TableCell className="text-right font-mono">
                        {rm.assigned_leads.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        <Badge
                          variant="secondary"
                          className={
                            rm.response_rate >= 70
                              ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                              : rm.response_rate >= 40
                                ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                                : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                          }
                        >
                          {rm.response_rate.toFixed(1)}%
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        <Badge
                          variant="secondary"
                          className={
                            rm.conversion_rate >= 30
                              ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                              : rm.conversion_rate >= 15
                                ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                                : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                          }
                        >
                          {rm.conversion_rate.toFixed(1)}%
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">{rm.meetings_held}</TableCell>
                      <TableCell className="text-right font-mono">{rm.call_reports_filed}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Campaign Selector */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Campaign Drill-Down</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Select
              value={selectedCampaignId}
              onValueChange={(v: string) => setSelectedCampaignId(v)}
            >
              <SelectTrigger className="w-[360px]">
                <SelectValue placeholder={listPending ? 'Loading campaigns...' : 'Select a campaign to view analytics'} />
              </SelectTrigger>
              <SelectContent>
                {campaigns.map((c: CampaignListItem) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.campaign_code} - {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedCampaignId && (
              <button
                className="text-sm text-muted-foreground underline hover:text-foreground"
                onClick={() => setSelectedCampaignId('')}
              >
                Clear selection
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Campaign Detail Section */}
      {selectedCampaignId && (
        <>
          {analyticsPending ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i}>
                  <CardContent className="pt-6 space-y-3">
                    <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                    <div className="h-4 w-48 animate-pulse rounded bg-muted" />
                    <div className="h-4 w-40 animate-pulse rounded bg-muted" />
                    <div className="h-4 w-36 animate-pulse rounded bg-muted" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : campaignAnalytics ? (
            <div className="space-y-4">
              {/* Campaign Detail Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">Campaign Details</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Name</p>
                      <p className="font-medium">{campaignAnalytics.campaign.name}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Type</p>
                      <Badge variant="outline">
                        {campaignAnalytics.campaign.campaign_type.replace(/_/g, ' ')}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Period</p>
                      <p className="text-sm">
                        {new Date(campaignAnalytics.campaign.start_date).toLocaleDateString()}
                        {' - '}
                        {new Date(campaignAnalytics.campaign.end_date).toLocaleDateString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Budget</p>
                      <p className="font-mono font-medium">
                        {campaignAnalytics.campaign.budget.toLocaleString('en-US', {
                          style: 'currency',
                          currency: 'USD',
                          minimumFractionDigits: 2,
                        })}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {/* Response Breakdown */}
                {renderResponseBreakdown(campaignAnalytics.responseBreakdown)}

                {/* Dispatch Summary */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium">Dispatch Summary</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Total Recipients</p>
                        <p className="text-2xl font-bold">
                          {campaignAnalytics.dispatch.totalRecipients.toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Delivered</p>
                        <p className="text-2xl font-bold text-green-600">
                          {campaignAnalytics.dispatch.delivered.toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Bounced</p>
                        <p className="text-2xl font-bold text-red-600">
                          {campaignAnalytics.dispatch.bounced.toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Delivery Rate</p>
                        <p className="text-2xl font-bold">
                          {campaignAnalytics.dispatch.deliveryRate.toFixed(1)}%
                        </p>
                      </div>
                    </div>
                    {/* Delivery rate bar */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-sm text-muted-foreground">
                        <span>Delivery Rate</span>
                        <span>{campaignAnalytics.dispatch.deliveryRate.toFixed(1)}%</span>
                      </div>
                      <div className="h-3 w-full rounded-full bg-muted">
                        <div
                          className="h-3 rounded-full bg-green-500 transition-all"
                          style={{ width: `${Math.min(campaignAnalytics.dispatch.deliveryRate, 100)}%` }}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Timeline */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">Campaign Timeline</CardTitle>
                </CardHeader>
                <CardContent>
                  {campaignAnalytics.timeline.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2">
                      <Clock className="h-8 w-8 text-muted-foreground/50" />
                      <p>No timeline events recorded</p>
                    </div>
                  ) : (
                    <div className="relative space-y-4">
                      {campaignAnalytics.timeline.map((event: CampaignAnalyticsData['timeline'][number], idx: number) => {
                        const IconComponent = TIMELINE_ICONS[event.event.toLowerCase()] || Clock;
                        return (
                          <div key={idx} className="flex items-start gap-4">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                              <IconComponent className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <div className="flex-1 space-y-1">
                              <div className="flex items-center justify-between">
                                <p className="text-sm font-medium capitalize">
                                  {event.event.replace(/_/g, ' ')}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  {new Date(event.timestamp).toLocaleString()}
                                </p>
                              </div>
                              {event.actor && (
                                <p className="text-sm text-muted-foreground">
                                  By: {event.actor}
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                <BarChart3 className="h-10 w-10 text-muted-foreground/50" />
                <p>Failed to load analytics for the selected campaign</p>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Aggregated view when no campaign selected */}
      {!selectedCampaignId && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">All Campaigns Overview</CardTitle>
          </CardHeader>
          <CardContent>
            {listPending ? (
              <div className="rounded-md border overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <SkeletonRows cols={3} rows={4} />
                  </TableBody>
                </Table>
              </div>
            ) : campaigns.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                <BarChart3 className="h-10 w-10 text-muted-foreground/50" />
                <p>No campaigns found</p>
                <p className="text-sm">Create a campaign to begin tracking analytics</p>
              </div>
            ) : (
              <div className="rounded-md border overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {campaigns.map((c: CampaignListItem) => (
                      <TableRow
                        key={c.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => setSelectedCampaignId(String(c.id))}
                      >
                        <TableCell className="font-mono text-sm">{c.campaign_code}</TableCell>
                        <TableCell>{c.name}</TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={
                              c.campaign_status === 'ACTIVE'
                                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                                : c.campaign_status === 'DRAFT'
                                  ? 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
                                  : c.campaign_status === 'COMPLETED'
                                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                                    : ''
                            }
                          >
                            {c.campaign_status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
