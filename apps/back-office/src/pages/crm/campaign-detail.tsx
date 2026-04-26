/**
 * Campaign Detail Page (CRM-PAD)
 *
 * Tabbed detail page for a single campaign showing 6 tabs:
 *   Overview, Target Lists, Responses, Communications, Meetings, Call Reports.
 *
 * Supports status-aware action buttons (Submit, Approve/Reject, Copy)
 * and a breadcrumb navigation back to the campaign list.
 */

import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@ui/components/ui/card';
import { Button } from '@ui/components/ui/button';
import { Badge } from '@ui/components/ui/badge';
import { Input } from '@ui/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@ui/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from '@ui/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@ui/components/ui/tabs';
import { toast } from 'sonner';
import {
  Megaphone, Send, Copy, CheckCircle, XCircle, ChevronRight,
  Target, BarChart3, Mail, Calendar, Phone, FileText,
  Users, TrendingUp, ArrowLeft,
} from 'lucide-react';
import { SkeletonRows } from '@/components/ui/skeleton-rows';

/* ---------- API helpers ---------- */

const MGMT_API = '/api/v1/campaign-mgmt';

function authHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json' };
}

function fetcher(url: string) {
  return fetch(url, { headers: authHeaders(), credentials: 'include' }).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });
}

/* ---------- Constants ---------- */

const statusColors: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
  PENDING_APPROVAL: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
  ACTIVE: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  COMPLETED: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  PAUSED: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
  ARCHIVED: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300',
};

const typeColors: Record<string, string> = {
  PRODUCT_LAUNCH: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
  EVENT_INVITATION: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  EDUCATIONAL: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-300',
  REFERRAL: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  CROSS_SELL: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
  UP_SELL: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300',
  RETENTION: 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-300',
  RE_ENGAGEMENT: 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-300',
};

/* ---------- Interfaces ---------- */

interface CampaignDetail {
  id: number;
  campaign_code: string;
  name: string;
  campaign_type: string;
  campaign_status: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  budget_amount: string | null;
  currency: string;
  target_count: number;
  response_rate: number | null;
  event_name: string | null;
  event_date: string | null;
  event_venue: string | null;
  created_by: string | null;
  approved_by: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

interface AnalyticsData {
  campaignId: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
  responseRate: number;
  costPerConversion: number;
}

interface TargetListEntry {
  id: number;
  lead_id: number;
  lead_name: string;
  email: string | null;
  phone: string | null;
  status: string;
  added_at: string;
}

interface ResponseRecord {
  id: number;
  lead_name: string;
  response_type: string;
  channel: string;
  notes: string | null;
  responded_at: string;
}

interface CommunicationRecord {
  id: number;
  channel: string;
  subject: string | null;
  sent_at: string;
  status: string;
  recipient_count: number;
}

interface MeetingRecord {
  id: number;
  title: string;
  meeting_type: string;
  scheduled_start: string;
  scheduled_end: string;
  meeting_status: string;
  client_name: string | null;
}

interface CallReportRecord {
  id: number;
  meeting_id: number | null;
  client_name: string | null;
  rm_name: string | null;
  report_status: string;
  report_date: string;
  summary: string | null;
}

/* ---------- Component ---------- */

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('overview');
  const [approveRejectOpen, setApproveRejectOpen] = useState(false);
  const [approveAction, setApproveAction] = useState<'approve' | 'reject'>('approve');
  const [rejectReason, setRejectReason] = useState('');

  /* ---- Queries ---- */

  const { data: campaign, isPending: campaignPending, isError: campaignError } = useQuery<CampaignDetail>({
    queryKey: ['campaign-detail', id],
    queryFn: () => fetcher(`${MGMT_API}/campaigns/${id}`),
    enabled: !!id,
  });

  const { data: analytics, isPending: analyticsPending } = useQuery<AnalyticsData>({
    queryKey: ['campaign-analytics', id],
    queryFn: () => fetcher(`${MGMT_API}/campaigns/${id}/analytics`),
    enabled: !!id,
  });

  const { data: targetListData, isPending: targetListPending } = useQuery<{ data: TargetListEntry[] }>({
    queryKey: ['campaign-target-lists', id],
    queryFn: () => fetcher(`${MGMT_API}/campaigns/${id}/target-lists`),
    enabled: !!id && activeTab === 'target-lists',
  });

  const { data: responsesData, isPending: responsesPending } = useQuery<{ data: ResponseRecord[] }>({
    queryKey: ['campaign-responses', id],
    queryFn: () => fetcher(`${MGMT_API}/campaigns/${id}/responses`),
    enabled: !!id && activeTab === 'responses',
  });

  const { data: communicationsData, isPending: communicationsPending } = useQuery<{ data: CommunicationRecord[] }>({
    queryKey: ['campaign-communications', id],
    queryFn: () => fetcher(`${MGMT_API}/campaigns/${id}/communications`),
    enabled: !!id && activeTab === 'communications',
  });

  const { data: meetingsData, isPending: meetingsPending } = useQuery<{ data: MeetingRecord[] }>({
    queryKey: ['campaign-meetings', id],
    queryFn: () => fetcher(`${MGMT_API}/campaigns/${id}/meetings`),
    enabled: !!id && activeTab === 'meetings',
  });

  const { data: callReportsData, isPending: callReportsPending } = useQuery<{ data: CallReportRecord[] }>({
    queryKey: ['campaign-call-reports', id],
    queryFn: () => fetcher(`${MGMT_API}/campaigns/${id}/call-reports`),
    enabled: !!id && activeTab === 'call-reports',
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['campaign-detail', id] });
    queryClient.invalidateQueries({ queryKey: ['campaign-analytics', id] });
  };

  /* ---- Mutations ---- */

  const submitMutation = useMutation({
    mutationFn: () =>
      fetch(`${MGMT_API}/campaigns/${id}/submit`, {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
      }).then((r) => {
        if (!r.ok) return r.json().then((e: { error?: string }) => { throw new Error(e.error || 'Submit failed'); });
        return r.json();
      }),
    onSuccess: () => {
      invalidateAll();
      toast.success('Campaign submitted for approval');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const approveRejectMutation = useMutation({
    mutationFn: ({ action, reason }: { action: 'approve' | 'reject'; reason?: string }) => {
      const endpoint = action === 'approve'
        ? `${MGMT_API}/campaigns/${id}/approve`
        : `${MGMT_API}/campaigns/${id}/reject`;
      return fetch(endpoint, {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
        body: JSON.stringify(action === 'reject' ? { reason } : {}),
      }).then((r) => {
        if (!r.ok) return r.json().then((e: { error?: string }) => { throw new Error(e.error || 'Action failed'); });
        return r.json();
      });
    },
    onSuccess: (_data: unknown, vars: { action: 'approve' | 'reject'; reason?: string }) => {
      invalidateAll();
      setApproveRejectOpen(false);
      setRejectReason('');
      toast.success(`Campaign ${vars.action === 'approve' ? 'approved' : 'rejected'}`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const copyMutation = useMutation({
    mutationFn: () =>
      fetch(`${MGMT_API}/campaigns/${id}/copy`, {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
      }).then((r) => {
        if (!r.ok) return r.json().then((e: { error?: string }) => { throw new Error(e.error || 'Copy failed'); });
        return r.json();
      }),
    onSuccess: () => {
      toast.success('Campaign copied successfully');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  /* ---- Helpers ---- */

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString();
  }

  function formatDateTime(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  /* ---- Loading state ---- */

  if (campaignPending) {
    return (
      <div className="space-y-6">
        <div className="h-6 w-64 animate-pulse rounded bg-muted" />
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <div className="h-4 w-20 animate-pulse rounded bg-muted" />
              </CardHeader>
              <CardContent>
                <div className="h-8 w-16 animate-pulse rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (campaignError || !campaign) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center">
        <Megaphone className="h-12 w-12 text-muted-foreground/50" />
        <h2 className="text-xl font-semibold">Campaign Not Found</h2>
        <p className="text-muted-foreground">The campaign you are looking for does not exist or could not be loaded.</p>
        <Link to="/crm/campaigns">
          <Button variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Campaigns
          </Button>
        </Link>
      </div>
    );
  }

  const targetLists = targetListData?.data ?? [];
  const responses = responsesData?.data ?? [];
  const communications = communicationsData?.data ?? [];
  const meetings = meetingsData?.data ?? [];
  const callReports = callReportsData?.data ?? [];

  /* ---- Render ---- */

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-sm text-muted-foreground">
        <Link to="/crm/campaigns" className="hover:text-foreground transition-colors">
          Campaigns
        </Link>
        <ChevronRight className="h-4 w-4" />
        <span className="text-foreground font-medium">{campaign.name}</span>
      </nav>

      {/* Header with actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{campaign.name}</h1>
              <Badge className={statusColors[campaign.campaign_status] || ''} variant="secondary">
                {campaign.campaign_status.replace(/_/g, ' ')}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {campaign.campaign_code}
              {campaign.campaign_type && (
                <>
                  {' '}&middot;{' '}
                  <Badge className={typeColors[campaign.campaign_type] || ''} variant="secondary">
                    {campaign.campaign_type.replace(/_/g, ' ')}
                  </Badge>
                </>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {campaign.campaign_status === 'DRAFT' && (
            <Button
              size="sm"
              disabled={submitMutation.isPending}
              onClick={() => submitMutation.mutate()}
            >
              <Send className="mr-1 h-4 w-4" />
              {submitMutation.isPending ? 'Submitting...' : 'Submit for Approval'}
            </Button>
          )}
          {campaign.campaign_status === 'PENDING_APPROVAL' && (
            <>
              <Button
                size="sm"
                onClick={() => {
                  setApproveAction('approve');
                  setRejectReason('');
                  setApproveRejectOpen(true);
                }}
              >
                <CheckCircle className="mr-1 h-4 w-4" /> Approve
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => {
                  setApproveAction('reject');
                  setRejectReason('');
                  setApproveRejectOpen(true);
                }}
              >
                <XCircle className="mr-1 h-4 w-4" /> Reject
              </Button>
            </>
          )}
          <Button
            size="sm"
            variant="outline"
            disabled={copyMutation.isPending}
            onClick={() => copyMutation.mutate()}
          >
            <Copy className="mr-1 h-4 w-4" />
            {copyMutation.isPending ? 'Copying...' : 'Copy'}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v: string) => setActiveTab(v)}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="target-lists">Target Lists</TabsTrigger>
          <TabsTrigger value="responses">Responses</TabsTrigger>
          <TabsTrigger value="communications">Communications</TabsTrigger>
          <TabsTrigger value="meetings">Meetings</TabsTrigger>
          <TabsTrigger value="call-reports">Call Reports</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="mt-4 space-y-6">
          {/* Analytics KPI Cards */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {analyticsPending ? (
              Array.from({ length: 4 }).map((_, i) => (
                <Card key={i}>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <div className="h-4 w-20 animate-pulse rounded bg-muted" />
                    <div className="h-4 w-4 animate-pulse rounded bg-muted" />
                  </CardHeader>
                  <CardContent>
                    <div className="h-8 w-16 animate-pulse rounded bg-muted" />
                  </CardContent>
                </Card>
              ))
            ) : (
              <>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">Target Count</CardTitle>
                    <Target className="h-4 w-4 text-blue-600" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{campaign.target_count.toLocaleString()}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">Conversions</CardTitle>
                    <TrendingUp className="h-4 w-4 text-green-600" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{analytics?.conversions?.toLocaleString() ?? '-'}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">Response Rate</CardTitle>
                    <BarChart3 className="h-4 w-4 text-purple-600" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {campaign.response_rate != null ? `${campaign.response_rate.toFixed(1)}%` : '-'}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">Revenue</CardTitle>
                    <BarChart3 className="h-4 w-4 text-amber-600" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {analytics?.revenue != null
                        ? analytics.revenue.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                        : '-'}
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </div>

          {/* Campaign Details Grid */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Campaign Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Campaign Code</span>
                  <span className="font-mono">{campaign.campaign_code}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Type</span>
                  <Badge className={typeColors[campaign.campaign_type] || ''} variant="secondary">
                    {campaign.campaign_type.replace(/_/g, ' ')}
                  </Badge>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Status</span>
                  <Badge className={statusColors[campaign.campaign_status] || ''} variant="secondary">
                    {campaign.campaign_status.replace(/_/g, ' ')}
                  </Badge>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Start Date</span>
                  <span>{formatDate(campaign.start_date)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">End Date</span>
                  <span>{formatDate(campaign.end_date)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Budget</span>
                  <span className="font-mono">
                    {campaign.budget_amount
                      ? `${campaign.currency} ${parseFloat(campaign.budget_amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
                      : '-'}
                  </span>
                </div>
                {campaign.description && (
                  <div className="pt-2 border-t">
                    <p className="text-sm text-muted-foreground mb-1">Description</p>
                    <p className="text-sm">{campaign.description}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Event & Meta</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {campaign.event_name && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Event Name</span>
                    <span>{campaign.event_name}</span>
                  </div>
                )}
                {campaign.event_date && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Event Date</span>
                    <span>{formatDate(campaign.event_date)}</span>
                  </div>
                )}
                {campaign.event_venue && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Event Venue</span>
                    <span>{campaign.event_venue}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Created By</span>
                  <span>{campaign.created_by ?? '-'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Approved By</span>
                  <span>{campaign.approved_by ?? '-'}</span>
                </div>
                {campaign.rejection_reason && (
                  <div className="pt-2 border-t">
                    <p className="text-sm text-muted-foreground mb-1">Rejection Reason</p>
                    <p className="text-sm text-red-600 dark:text-red-400">{campaign.rejection_reason}</p>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Created</span>
                  <span>{formatDateTime(campaign.created_at)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Last Updated</span>
                  <span>{formatDateTime(campaign.updated_at)}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Additional analytics details */}
          {analytics && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Performance Analytics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">Impressions</p>
                    <p className="text-xl font-bold">{analytics.impressions.toLocaleString()}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">Clicks</p>
                    <p className="text-xl font-bold">{analytics.clicks.toLocaleString()}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">Conversions</p>
                    <p className="text-xl font-bold">{analytics.conversions.toLocaleString()}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">Response Rate</p>
                    <p className="text-xl font-bold">{analytics.responseRate?.toFixed(1) ?? '-'}%</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">Cost / Conversion</p>
                    <p className="text-xl font-bold">
                      {analytics.costPerConversion?.toLocaleString('en-PH', { minimumFractionDigits: 2 }) ?? '-'}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">Revenue</p>
                    <p className="text-xl font-bold">
                      {analytics.revenue.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Target Lists Tab */}
        <TabsContent value="target-lists" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Target Lists</CardTitle>
            </CardHeader>
            <CardContent>
              {targetListPending ? (
                <div className="rounded-md border overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Lead Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Added</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody><SkeletonRows cols={5} /></TableBody>
                  </Table>
                </div>
              ) : targetLists.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                  <Users className="h-10 w-10 text-muted-foreground/50" />
                  <p>No target list entries found</p>
                </div>
              ) : (
                <div className="rounded-md border overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Lead Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Added</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {targetLists.map((entry: TargetListEntry) => (
                        <TableRow key={entry.id}>
                          <TableCell className="font-medium">{entry.lead_name}</TableCell>
                          <TableCell>{entry.email ?? <span className="text-muted-foreground">-</span>}</TableCell>
                          <TableCell>{entry.phone ?? <span className="text-muted-foreground">-</span>}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">{entry.status}</Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatDate(entry.added_at)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Responses Tab */}
        <TabsContent value="responses" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Campaign Responses</CardTitle>
            </CardHeader>
            <CardContent>
              {responsesPending ? (
                <div className="rounded-md border overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Lead</TableHead>
                        <TableHead>Response Type</TableHead>
                        <TableHead>Channel</TableHead>
                        <TableHead>Notes</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody><SkeletonRows cols={5} /></TableBody>
                  </Table>
                </div>
              ) : responses.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                  <Mail className="h-10 w-10 text-muted-foreground/50" />
                  <p>No responses recorded yet</p>
                </div>
              ) : (
                <div className="rounded-md border overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Lead</TableHead>
                        <TableHead>Response Type</TableHead>
                        <TableHead>Channel</TableHead>
                        <TableHead>Notes</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {responses.map((response: ResponseRecord) => (
                        <TableRow key={response.id}>
                          <TableCell className="font-medium">{response.lead_name}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">{response.response_type.replace(/_/g, ' ')}</Badge>
                          </TableCell>
                          <TableCell>{response.channel.replace(/_/g, ' ')}</TableCell>
                          <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
                            {response.notes ?? '-'}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatDateTime(response.responded_at)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Communications Tab */}
        <TabsContent value="communications" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Communications</CardTitle>
            </CardHeader>
            <CardContent>
              {communicationsPending ? (
                <div className="rounded-md border overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Channel</TableHead>
                        <TableHead>Subject</TableHead>
                        <TableHead>Recipients</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Sent</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody><SkeletonRows cols={5} /></TableBody>
                  </Table>
                </div>
              ) : communications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                  <Mail className="h-10 w-10 text-muted-foreground/50" />
                  <p>No communications sent yet</p>
                </div>
              ) : (
                <div className="rounded-md border overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Channel</TableHead>
                        <TableHead>Subject</TableHead>
                        <TableHead>Recipients</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Sent</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {communications.map((comm: CommunicationRecord) => (
                        <TableRow key={comm.id}>
                          <TableCell>
                            <Badge variant="outline">{comm.channel}</Badge>
                          </TableCell>
                          <TableCell className="font-medium">{comm.subject ?? '-'}</TableCell>
                          <TableCell className="font-mono">{comm.recipient_count.toLocaleString()}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">{comm.status}</Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatDateTime(comm.sent_at)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Meetings Tab */}
        <TabsContent value="meetings" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Campaign Meetings</CardTitle>
            </CardHeader>
            <CardContent>
              {meetingsPending ? (
                <div className="rounded-md border overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Title</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Scheduled</TableHead>
                        <TableHead>Client</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody><SkeletonRows cols={5} /></TableBody>
                  </Table>
                </div>
              ) : meetings.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                  <Calendar className="h-10 w-10 text-muted-foreground/50" />
                  <p>No meetings associated with this campaign</p>
                </div>
              ) : (
                <div className="rounded-md border overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Title</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Scheduled</TableHead>
                        <TableHead>Client</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {meetings.map((meeting: MeetingRecord) => (
                        <TableRow key={meeting.id}>
                          <TableCell className="font-medium">{meeting.title}</TableCell>
                          <TableCell>{meeting.meeting_type.replace(/_/g, ' ')}</TableCell>
                          <TableCell className="text-sm">
                            <div>{formatDateTime(meeting.scheduled_start)}</div>
                            <div className="text-muted-foreground text-xs">
                              to {formatDateTime(meeting.scheduled_end)}
                            </div>
                          </TableCell>
                          <TableCell>{meeting.client_name ?? <span className="text-muted-foreground">-</span>}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">{meeting.meeting_status.replace(/_/g, ' ')}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Call Reports Tab */}
        <TabsContent value="call-reports" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Call Reports</CardTitle>
              <Link to={`/crm/call-reports/new?campaignId=${id}`}>
                <Button size="sm" variant="outline">
                  <FileText className="mr-1 h-4 w-4" /> New Call Report
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {callReportsPending ? (
                <div className="rounded-md border overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Client</TableHead>
                        <TableHead>RM</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Summary</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody><SkeletonRows cols={5} /></TableBody>
                  </Table>
                </div>
              ) : callReports.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                  <FileText className="h-10 w-10 text-muted-foreground/50" />
                  <p>No call reports filed yet</p>
                </div>
              ) : (
                <div className="rounded-md border overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Client</TableHead>
                        <TableHead>RM</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Summary</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {callReports.map((report: CallReportRecord) => (
                        <TableRow key={report.id}>
                          <TableCell className="text-sm">
                            {formatDate(report.report_date)}
                          </TableCell>
                          <TableCell>{report.client_name ?? <span className="text-muted-foreground">-</span>}</TableCell>
                          <TableCell>{report.rm_name ?? <span className="text-muted-foreground">-</span>}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">{report.report_status}</Badge>
                          </TableCell>
                          <TableCell className="max-w-[250px] truncate text-sm text-muted-foreground">
                            {report.summary ?? '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Approve / Reject Dialog */}
      <Dialog open={approveRejectOpen} onOpenChange={setApproveRejectOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>
              {approveAction === 'approve' ? 'Approve Campaign' : 'Reject Campaign'}
            </DialogTitle>
            <DialogDescription>
              {approveAction === 'approve'
                ? 'Review and approve this campaign for activation.'
                : 'Provide a reason for rejecting this campaign.'}
            </DialogDescription>
          </DialogHeader>
          {approveAction === 'reject' && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Rejection Reason *</label>
              <Input
                placeholder="Enter reason for rejection"
                value={rejectReason}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRejectReason(e.target.value)}
              />
            </div>
          )}
          {approveAction === 'approve' && (
            <p className="text-sm text-muted-foreground">
              Are you sure you want to approve this campaign? Once approved it will become active
              on its scheduled start date.
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveRejectOpen(false)}>
              Cancel
            </Button>
            {approveAction === 'approve' ? (
              <Button
                disabled={approveRejectMutation.isPending}
                onClick={() => approveRejectMutation.mutate({ action: 'approve' })}
              >
                <CheckCircle className="mr-1 h-4 w-4" /> Approve
              </Button>
            ) : (
              <Button
                variant="destructive"
                disabled={!rejectReason.trim() || approveRejectMutation.isPending}
                onClick={() => approveRejectMutation.mutate({ action: 'reject', reason: rejectReason })}
              >
                <XCircle className="mr-1 h-4 w-4" /> Reject
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
