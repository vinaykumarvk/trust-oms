/**
 * Campaign Management Dashboard (CRM-PAD)
 *
 * Main entry page for campaign lifecycle management in a wealth-management
 * back-office context.  Supports creation, submission for approval,
 * approval / rejection, copying, and analytics viewing.
 */

import { useState } from 'react';
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
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@ui/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@ui/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@ui/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@ui/components/ui/tabs';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import {
  Megaphone, Plus, CheckCircle, XCircle, Clock, BarChart3,
  Send, Copy, Eye, Target, TrendingUp, Archive, Pause,
  Download, Pencil, Trash2, Users, Mail, Filter,
} from 'lucide-react';
import { SkeletonRows } from '@/components/ui/skeleton-rows';

/* ---------- API helpers ---------- */

const API = '/api/v1/campaigns';
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

const CAMPAIGN_TYPES = [
  'PRODUCT_LAUNCH',
  'EVENT_INVITATION',
  'EDUCATIONAL',
  'REFERRAL',
  'CROSS_SELL',
  'UP_SELL',
  'RETENTION',
  'RE_ENGAGEMENT',
] as const;

type CampaignType = typeof CAMPAIGN_TYPES[number];

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

interface CampaignRecord {
  id: number;
  campaign_code: string;
  name: string;
  campaign_type: string;
  status: string;
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
  created_at: string;
  updated_at: string;
}

interface DashboardStats {
  total: number;
  active: number;
  pendingApproval: number;
  completed: number;
  conversionRate: number;
}

interface ListResult {
  data: CampaignRecord[];
  total: number;
  page: number;
  pageSize: number;
}

interface AnalyticsData {
  campaignId: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
}

interface NewCampaignForm {
  name: string;
  campaign_type: string;
  description: string;
  start_date: string;
  end_date: string;
  budget_amount: string;
  currency: string;
  event_name: string;
  event_date: string;
  event_venue: string;
}

const INITIAL_FORM: NewCampaignForm = {
  name: '',
  campaign_type: '',
  description: '',
  start_date: '',
  end_date: '',
  budget_amount: '',
  currency: 'PHP',
  event_name: '',
  event_date: '',
  event_venue: '',
};

/* ---------- Component ---------- */

export default function CampaignDashboard() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [approveRejectOpen, setApproveRejectOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [approveAction, setApproveAction] = useState<'approve' | 'reject'>('approve');
  const [newCampaign, setNewCampaign] = useState<NewCampaignForm>(INITIAL_FORM);

  // Filters for Task 7.4
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [dateFromFilter, setDateFromFilter] = useState('');
  const [dateToFilter, setDateToFilter] = useState('');

  // Status filter from tab
  const statusFilterMap: Record<string, string> = {
    all: '',
    draft: 'DRAFT',
    pending: 'PENDING_APPROVAL',
    active: 'ACTIVE',
    completed: 'COMPLETED',
    archived: 'ARCHIVED',
  };
  const statusParam = statusFilterMap[activeTab] || '';

  /* ---- Queries ---- */

  const { data: stats, isPending: statsPending, isError: statsError } = useQuery<DashboardStats>({
    queryKey: ['campaign-stats'],
    queryFn: () => fetcher(`${MGMT_API}/campaign-dashboard/stats`),
    refetchInterval: 30000,
  });

  const { data: campaignList, isPending: listPending, isError: listError } = useQuery<ListResult>({
    queryKey: ['campaign-list', statusParam],
    queryFn: () => fetcher(`${API}?status=${statusParam}&pageSize=100`),
    refetchInterval: 15000,
  });

  const { data: analyticsData, isPending: analyticsPending } = useQuery<AnalyticsData>({
    queryKey: ['campaign-analytics', selectedCampaignId],
    queryFn: () => fetcher(`${MGMT_API}/campaigns/${selectedCampaignId}/analytics`),
    enabled: analyticsOpen && selectedCampaignId != null,
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['campaign-list'] });
    queryClient.invalidateQueries({ queryKey: ['campaign-stats'] });
  };

  /* ---- Mutations ---- */

  const createMutation = useMutation({
    mutationFn: (data: NewCampaignForm) =>
      fetch(API, {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
        body: JSON.stringify({
          name: data.name,
          campaign_type: data.campaign_type,
          description: data.description || undefined,
          start_date: data.start_date || undefined,
          end_date: data.end_date || undefined,
          budget_amount: data.budget_amount ? parseFloat(data.budget_amount) : undefined,
          currency: data.currency,
          event_name: data.event_name || undefined,
          event_date: data.event_date || undefined,
          event_venue: data.event_venue || undefined,
        }),
      }).then((r) => {
        if (!r.ok) return r.json().then((e: { error?: string }) => { throw new Error(e.error || 'Create failed'); });
        return r.json();
      }),
    onSuccess: () => {
      invalidateAll();
      setCreateOpen(false);
      setNewCampaign(INITIAL_FORM);
      toast.success('Campaign created successfully');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const submitMutation = useMutation({
    mutationFn: (id: number) =>
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
    mutationFn: ({ id, action, reason }: { id: number; action: 'approve' | 'reject'; reason?: string }) => {
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
    onSuccess: (_data: unknown, vars: { id: number; action: 'approve' | 'reject'; reason?: string }) => {
      invalidateAll();
      setApproveRejectOpen(false);
      setRejectReason('');
      toast.success(`Campaign ${vars.action === 'approve' ? 'approved' : 'rejected'}`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const copyMutation = useMutation({
    mutationFn: (id: number) =>
      fetch(`${MGMT_API}/campaigns/${id}/copy`, {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
      }).then((r) => {
        if (!r.ok) return r.json().then((e: { error?: string }) => { throw new Error(e.error || 'Copy failed'); });
        return r.json();
      }),
    onSuccess: () => {
      invalidateAll();
      toast.success('Campaign copied successfully');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Delete campaign mutation
  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      fetch(`${API}/${id}`, {
        method: 'DELETE',
        headers: authHeaders(),
        credentials: 'include',
      }).then((r) => {
        if (!r.ok) return r.json().then((e: { error?: string }) => { throw new Error(e.error || 'Delete failed'); });
        return r.json();
      }),
    onSuccess: () => {
      invalidateAll();
      setDeleteConfirmOpen(false);
      setSelectedCampaignId(null);
      toast.success('Campaign deleted successfully');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  /* ---- Export handler ---- */

  async function handleExport(format: 'xlsx' | 'pdf') {
    try {
      const resp = await fetch(`${MGMT_API}/campaigns/export?format=${format}`, {
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
      a.download = `campaigns.${format}`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success(`Campaigns exported as ${format.toUpperCase()}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed');
    }
  }

  const campaigns_raw = campaignList?.data ?? [];

  /* ---- KPI Cards ---- */

  const kpiCards = [
    {
      label: 'Total Campaigns',
      value: stats?.total ?? 0,
      icon: Megaphone,
      color: 'text-blue-600',
    },
    {
      label: 'Active',
      value: stats?.active ?? 0,
      icon: TrendingUp,
      color: 'text-green-600',
    },
    {
      label: 'Pending Approval',
      value: stats?.pendingApproval ?? 0,
      icon: Clock,
      color: 'text-yellow-600',
    },
    {
      label: 'Completed',
      value: stats?.completed ?? 0,
      icon: CheckCircle,
      color: 'text-blue-600',
    },
    {
      label: 'Conversion Rate',
      value: `${(stats?.conversionRate ?? 0).toFixed(1)}%`,
      icon: Target,
      color: 'text-purple-600',
    },
    {
      label: 'Total Leads',
      value: campaigns_raw.reduce((sum: number, c: CampaignRecord) => sum + (c.target_count || 0), 0).toLocaleString(),
      icon: Users,
      color: 'text-indigo-600',
    },
    {
      label: 'Avg Response Rate',
      value: (() => {
        const withRate = campaigns_raw.filter((c: CampaignRecord) => c.response_rate != null);
        if (withRate.length === 0) return '0.0%';
        const avg = withRate.reduce((sum: number, c: CampaignRecord) => sum + (c.response_rate ?? 0), 0) / withRate.length;
        return `${avg.toFixed(1)}%`;
      })(),
      icon: Mail,
      color: 'text-orange-600',
    },
  ];

  // Apply client-side filters (type filter, date range)
  const campaigns = campaigns_raw.filter((c: CampaignRecord) => {
    if (typeFilter && c.campaign_type !== typeFilter) return false;
    if (dateFromFilter && c.start_date && c.start_date < dateFromFilter) return false;
    if (dateToFilter && c.end_date && c.end_date > dateToFilter) return false;
    return true;
  });

  /* ---- Helpers ---- */

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString();
  }

  /* ---- Row Actions ---- */

  function renderActions(campaign: CampaignRecord) {
    const s = campaign.status;
    return (
      <div className="flex gap-1 flex-wrap">
        {/* View button */}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => navigate(`/crm/campaigns/${campaign.id}`)}
        >
          <Eye className="mr-1 h-3 w-3" /> View
        </Button>
        {/* Edit button */}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => navigate(`/crm/campaigns/${campaign.id}/edit`)}
        >
          <Pencil className="mr-1 h-3 w-3" /> Edit
        </Button>
        {s === 'DRAFT' && (
          <Button
            size="sm"
            variant="default"
            disabled={submitMutation.isPending}
            onClick={() => submitMutation.mutate(campaign.id)}
          >
            <Send className="mr-1 h-3 w-3" /> {submitMutation.isPending ? 'Submitting...' : 'Submit'}
          </Button>
        )}
        {s === 'PENDING_APPROVAL' && (
          <>
            <Button
              size="sm"
              variant="default"
              onClick={() => {
                setSelectedCampaignId(campaign.id);
                setApproveAction('approve');
                setRejectReason('');
                setApproveRejectOpen(true);
              }}
            >
              <CheckCircle className="mr-1 h-3 w-3" /> Approve
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                setSelectedCampaignId(campaign.id);
                setApproveAction('reject');
                setRejectReason('');
                setApproveRejectOpen(true);
              }}
            >
              <XCircle className="mr-1 h-3 w-3" /> Reject
            </Button>
          </>
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={copyMutation.isPending}
          onClick={() => copyMutation.mutate(campaign.id)}
        >
          <Copy className="mr-1 h-3 w-3" /> {copyMutation.isPending ? 'Copying...' : 'Copy'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setSelectedCampaignId(campaign.id);
            setAnalyticsOpen(true);
          }}
        >
          <BarChart3 className="mr-1 h-3 w-3" /> Analytics
        </Button>
        {/* Delete button */}
        <Button
          size="sm"
          variant="ghost"
          className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-950/30"
          onClick={() => {
            setSelectedCampaignId(campaign.id);
            setDeleteConfirmOpen(true);
          }}
        >
          <Trash2 className="mr-1 h-3 w-3" /> Delete
        </Button>
      </div>
    );
  }

  /* ---- Table ---- */

  function renderCampaignsTable(data: CampaignRecord[]) {
    if (listPending) {
      return (
        <div className="rounded-md border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Start Date</TableHead>
                <TableHead>End Date</TableHead>
                <TableHead className="text-right">Target Count</TableHead>
                <TableHead className="text-right">Response Rate</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <SkeletonRows cols={9} />
            </TableBody>
          </Table>
        </div>
      );
    }

    if (data.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
          <Megaphone className="h-10 w-10 text-muted-foreground/50" />
          <p>No campaigns found</p>
        </div>
      );
    }

    return (
      <div className="rounded-md border overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Start Date</TableHead>
              <TableHead>End Date</TableHead>
              <TableHead className="text-right">Target Count</TableHead>
              <TableHead className="text-right">Response Rate</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((campaign: CampaignRecord) => (
              <TableRow key={campaign.id}>
                <TableCell className="font-mono text-sm">{campaign.campaign_code}</TableCell>
                <TableCell className="font-medium">{campaign.name}</TableCell>
                <TableCell>
                  <Badge className={typeColors[campaign.campaign_type] || ''} variant="secondary">
                    {campaign.campaign_type.replace(/_/g, ' ')}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge className={statusColors[campaign.status] || ''} variant="secondary">
                    {campaign.status.replace(/_/g, ' ')}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatDate(campaign.start_date)}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatDate(campaign.end_date)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {campaign.target_count.toLocaleString()}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {campaign.response_rate != null
                    ? `${campaign.response_rate.toFixed(1)}%`
                    : '-'}
                </TableCell>
                <TableCell>{renderActions(campaign)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  /* ---- Error state ---- */

  if (statsError || listError) {
    return (
      <div className="flex items-center justify-center py-12 text-destructive">
        <p>Failed to load data. Please try again.</p>
      </div>
    );
  }

  /* ---- Render ---- */

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Campaign Management</h1>
          <p className="text-muted-foreground">
            Create, approve, and track marketing campaigns across all channels
          </p>
        </div>
        <div className="flex items-center gap-2">
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
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-2 h-4 w-4" /> New Campaign
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[540px]">
            <DialogHeader>
              <DialogTitle>Create Campaign</DialogTitle>
              <DialogDescription>
                Fill in the details below to create a new marketing campaign.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto">
              <div>
                <label className="text-sm font-medium">Name *</label>
                <Input
                  placeholder="e.g. Q2 2026 Product Launch"
                  value={newCampaign.name}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setNewCampaign({ ...newCampaign, name: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="text-sm font-medium">Campaign Type *</label>
                <Select
                  value={newCampaign.campaign_type}
                  onValueChange={(v: string) =>
                    setNewCampaign({ ...newCampaign, campaign_type: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {CAMPAIGN_TYPES.map((t: CampaignType) => (
                      <SelectItem key={t} value={t}>
                        {t.replace(/_/g, ' ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Description</label>
                <Input
                  placeholder="Brief description of the campaign"
                  value={newCampaign.description}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setNewCampaign({ ...newCampaign, description: e.target.value })
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Start Date</label>
                  <Input
                    type="date"
                    value={newCampaign.start_date}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setNewCampaign({ ...newCampaign, start_date: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">End Date</label>
                  <Input
                    type="date"
                    value={newCampaign.end_date}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setNewCampaign({ ...newCampaign, end_date: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Budget Amount</label>
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={newCampaign.budget_amount}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setNewCampaign({ ...newCampaign, budget_amount: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Currency</label>
                  <Select
                    value={newCampaign.currency}
                    onValueChange={(v: string) =>
                      setNewCampaign({ ...newCampaign, currency: v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PHP">PHP</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Event-specific fields */}
              {newCampaign.campaign_type === 'EVENT_INVITATION' && (
                <>
                  <div className="border-t pt-4">
                    <p className="text-sm font-medium text-muted-foreground mb-3">
                      Event Details (optional)
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Event Name</label>
                    <Input
                      placeholder="e.g. Annual Investment Summit"
                      value={newCampaign.event_name}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setNewCampaign({ ...newCampaign, event_name: e.target.value })
                      }
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium">Event Date</label>
                      <Input
                        type="date"
                        value={newCampaign.event_date}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          setNewCampaign({ ...newCampaign, event_date: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Event Venue</label>
                      <Input
                        placeholder="e.g. Manila Convention Center"
                        value={newCampaign.event_venue}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          setNewCampaign({ ...newCampaign, event_venue: e.target.value })
                        }
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => createMutation.mutate(newCampaign)}
                disabled={!newCampaign.name || !newCampaign.campaign_type || createMutation.isPending}
              >
                {createMutation.isPending ? 'Creating...' : 'Create Campaign'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-7">
        {statsPending
          ? Array.from({ length: 7 }).map((_, i) => (
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

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
              <Filter className="h-4 w-4" /> Filters
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Campaign Type</label>
              <Select value={typeFilter} onValueChange={(v: string) => setTypeFilter(v)}>
                <SelectTrigger className="h-8 w-[180px] text-sm">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All types</SelectItem>
                  {CAMPAIGN_TYPES.map((t: CampaignType) => (
                    <SelectItem key={t} value={t}>
                      {t.replace(/_/g, ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Start Date From</label>
              <Input
                type="date"
                className="h-8 w-[150px] text-sm"
                value={dateFromFilter}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDateFromFilter(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">End Date To</label>
              <Input
                type="date"
                className="h-8 w-[150px] text-sm"
                value={dateToFilter}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDateToFilter(e.target.value)}
              />
            </div>
            {(typeFilter || dateFromFilter || dateToFilter) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={() => {
                  setTypeFilter('');
                  setDateFromFilter('');
                  setDateToFilter('');
                }}
              >
                Clear filters
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tabs & Campaign Table */}
      <Tabs value={activeTab} onValueChange={(v: string) => setActiveTab(v)}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="draft">
            Draft
          </TabsTrigger>
          <TabsTrigger value="pending">
            Pending Approval
          </TabsTrigger>
          <TabsTrigger value="active">
            Active
          </TabsTrigger>
          <TabsTrigger value="completed">
            Completed
          </TabsTrigger>
          <TabsTrigger value="archived">
            Archived
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          {renderCampaignsTable(campaigns)}
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
                onClick={() => {
                  if (selectedCampaignId != null) {
                    approveRejectMutation.mutate({
                      id: selectedCampaignId,
                      action: 'approve',
                    });
                  }
                }}
              >
                <CheckCircle className="mr-1 h-4 w-4" /> Approve
              </Button>
            ) : (
              <Button
                variant="destructive"
                disabled={!rejectReason.trim()}
                onClick={() => {
                  if (selectedCampaignId != null) {
                    approveRejectMutation.mutate({
                      id: selectedCampaignId,
                      action: 'reject',
                      reason: rejectReason,
                    });
                  }
                }}
              >
                <XCircle className="mr-1 h-4 w-4" /> Reject
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Analytics Dialog */}
      <Dialog open={analyticsOpen} onOpenChange={setAnalyticsOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Campaign Analytics</DialogTitle>
            <DialogDescription>
              Performance metrics for the selected campaign.
            </DialogDescription>
          </DialogHeader>
          {analyticsPending ? (
            <div className="space-y-3 py-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                  <div className="h-4 w-16 animate-pulse rounded bg-muted" />
                </div>
              ))}
            </div>
          ) : analyticsData ? (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Impressions
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xl font-bold">
                      {analyticsData.impressions.toLocaleString()}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Clicks
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xl font-bold">
                      {analyticsData.clicks.toLocaleString()}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Conversions
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xl font-bold">
                      {analyticsData.conversions.toLocaleString()}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Revenue
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xl font-bold">
                      {analyticsData.revenue.toLocaleString('en-PH', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2">
              <BarChart3 className="h-8 w-8 text-muted-foreground/50" />
              <p>No analytics data available</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAnalyticsOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Delete Campaign</DialogTitle>
            <DialogDescription>
              This action is permanent and cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete this campaign? This action cannot be undone.
            All associated lead assignments, responses, and analytics data will be permanently removed.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (selectedCampaignId != null) {
                  deleteMutation.mutate(selectedCampaignId);
                }
              }}
            >
              <Trash2 className="mr-1 h-4 w-4" />
              {deleteMutation.isPending ? 'Deleting...' : 'Delete Campaign'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
