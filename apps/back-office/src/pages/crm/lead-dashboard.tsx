/**
 * Lead Dashboard (CRM Phase 4)
 *
 * "My Leads" dashboard with:
 *   - KPI tiles: Total, New, Contacted, Qualified, Converted
 *   - Card-based lead grid (not table) with status badges
 *   - Filters: search, status, source, AUM range
 *   - Per-card actions: View, Edit, Schedule Meeting, Convert
 *   - Pagination: 20 per page
 *   - "Add Lead" button navigating to lead-form
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@ui/components/ui/card';
import { Button } from '@ui/components/ui/button';
import { Badge } from '@ui/components/ui/badge';
import { Input } from '@ui/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@ui/components/ui/select';
import { toast } from 'sonner';
import {
  Plus, Search, Users, UserPlus, Phone, CheckCircle, ArrowRightCircle,
  Eye, Pencil, Calendar, ChevronLeft, ChevronRight, Star,
  TrendingUp, XCircle, Ban,
} from 'lucide-react';
import { fetcher, authHeaders } from '@/lib/api';

/* ---------- Constants ---------- */

const API = '/api/v1/leads';
const PAGE_SIZE = 20;

const LEAD_STATUSES = [
  'NEW', 'CONTACTED', 'QUALIFIED', 'CLIENT_ACCEPTED',
  'CONVERTED', 'NOT_INTERESTED', 'DO_NOT_CONTACT', 'DROPPED',
] as const;

const LEAD_SOURCES = [
  'REFERRAL', 'WALK_IN', 'WEBSITE', 'CAMPAIGN', 'EVENT', 'COLD_CALL', 'PARTNER',
] as const;

const statusColors: Record<string, string> = {
  NEW: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  CONTACTED: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
  QUALIFIED: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
  CLIENT_ACCEPTED: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  CONVERTED: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
  NOT_INTERESTED: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
  DO_NOT_CONTACT: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
  DROPPED: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

const statusIcons: Record<string, typeof Star> = {
  NEW: Star,
  CONTACTED: Phone,
  QUALIFIED: CheckCircle,
  CLIENT_ACCEPTED: TrendingUp,
  CONVERTED: ArrowRightCircle,
  NOT_INTERESTED: XCircle,
  DO_NOT_CONTACT: Ban,
  DROPPED: XCircle,
};

/* ---------- Interfaces ---------- */

interface LeadRecord {
  id: number;
  lead_code: string;
  first_name: string;
  last_name: string;
  entity_name: string | null;
  lead_type: string;
  status: string;
  source: string | null;
  email: string | null;
  mobile_phone: string | null;
  estimated_aum: string | null;
  aum_currency: string;
  assigned_rm: string | null;
  classification: string | null;
  created_at: string;
}

interface LeadListResult {
  data: LeadRecord[];
  total: number;
  page: number;
  pageSize: number;
}

interface LeadStats {
  total: number;
  new: number;
  contacted: number;
  qualified: number;
  converted: number;
}

/* ---------- Component ---------- */

export default function LeadDashboard() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sourceFilter, setSourceFilter] = useState('ALL');
  const [aumMin, setAumMin] = useState('');
  const [aumMax, setAumMax] = useState('');
  const [page, setPage] = useState(1);

  /* ---- Queries ---- */

  const { data: leadsResult, isPending: listPending, isError: listError } = useQuery<LeadListResult>({
    queryKey: ['my-leads', searchTerm, statusFilter, sourceFilter, aumMin, aumMax, page],
    queryFn: () => {
      const params = new URLSearchParams();
      if (searchTerm.trim()) params.set('search', searchTerm.trim());
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (sourceFilter !== 'ALL') params.set('source', sourceFilter);
      if (aumMin) params.set('aum_min', aumMin);
      if (aumMax) params.set('aum_max', aumMax);
      params.set('page', String(page));
      params.set('pageSize', String(PAGE_SIZE));
      return fetcher(`${API}?${params.toString()}`);
    },
    refetchInterval: 30000,
  });

  const { data: stats, isPending: statsPending, isError: statsError } = useQuery<LeadStats>({
    queryKey: ['lead-stats'],
    queryFn: () => fetcher(`${API}/stats`),
    refetchInterval: 30000,
  });

  const leads = leadsResult?.data ?? [];
  const totalRecords = leadsResult?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalRecords / PAGE_SIZE));

  /* ---- KPI cards ---- */

  const kpiCards = [
    { label: 'Total Leads', value: stats?.total ?? 0, icon: Users, color: 'text-primary' },
    { label: 'New', value: stats?.new ?? 0, icon: UserPlus, color: 'text-blue-600 dark:text-blue-400' },
    { label: 'Contacted', value: stats?.contacted ?? 0, icon: Phone, color: 'text-yellow-600 dark:text-yellow-400' },
    { label: 'Qualified', value: stats?.qualified ?? 0, icon: CheckCircle, color: 'text-orange-600 dark:text-orange-400' },
    { label: 'Converted', value: stats?.converted ?? 0, icon: ArrowRightCircle, color: 'text-purple-600 dark:text-purple-400' },
  ];

  /* ---- Helpers ---- */

  function formatAum(amount: string | null, currency: string): string {
    if (!amount) return '-';
    const num = parseFloat(amount);
    if (isNaN(num)) return '-';
    if (num >= 1_000_000) return `${currency} ${(num / 1_000_000).toFixed(1)}M`;
    if (num >= 1_000) return `${currency} ${(num / 1_000).toFixed(0)}K`;
    return `${currency} ${num.toLocaleString()}`;
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-PH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  function handleConvert(leadId: number) {
    fetch(`/api/v1/campaign-mgmt/leads/${leadId}/convert`, {
      method: 'POST',
      headers: authHeaders(),
    })
      .then((r) => {
        if (!r.ok) return r.json().then((e: { error?: string }) => { throw new Error(e.error || 'Conversion failed'); });
        return r.json();
      })
      .then(() => {
        toast.success('Lead converted to prospect');
      })
      .catch((err: Error) => toast.error(err.message));
  }

  /* ---------- Error state ---------- */

  if (listError || statsError) {
    return (
      <div className="flex items-center justify-center py-12 text-destructive">
        <p>Failed to load data. Please try again.</p>
      </div>
    );
  }

  /* ---------- Render ---------- */

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">My Leads</h1>
          <p className="text-muted-foreground">
            Track and manage leads through the CRM pipeline
          </p>
        </div>
        <Button size="sm" onClick={() => navigate('/crm/leads/new')}>
          <Plus className="mr-2 h-4 w-4" /> Add Lead
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        {statsPending
          ? Array.from({ length: 5 }).map((_, i) => (
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
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="text-sm font-medium mb-1 block">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search by name or lead code..."
                  value={searchTerm}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setSearchTerm(e.target.value); setPage(1); }}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="w-40">
              <label className="text-sm font-medium mb-1 block">Status</label>
              <Select value={statusFilter} onValueChange={(v: string) => { setStatusFilter(v); setPage(1); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Statuses</SelectItem>
                  {LEAD_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-40">
              <label className="text-sm font-medium mb-1 block">Source</label>
              <Select value={sourceFilter} onValueChange={(v: string) => { setSourceFilter(v); setPage(1); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Sources</SelectItem>
                  {LEAD_SOURCES.map((s) => (
                    <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-28">
              <label className="text-sm font-medium mb-1 block">AUM Min</label>
              <Input
                type="number"
                placeholder="0"
                value={aumMin}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setAumMin(e.target.value); setPage(1); }}
              />
            </div>
            <div className="w-28">
              <label className="text-sm font-medium mb-1 block">AUM Max</label>
              <Input
                type="number"
                placeholder="No max"
                value={aumMax}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setAumMax(e.target.value); setPage(1); }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lead Cards Grid */}
      {listPending ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-4 space-y-3">
                <div className="h-5 w-3/4 animate-pulse rounded bg-muted" />
                <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
                <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
                <div className="h-8 w-full animate-pulse rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : leads.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
          <Users className="h-12 w-12 text-muted-foreground/50" />
          <p className="text-lg">No leads found</p>
          <p className="text-sm">
            {searchTerm || statusFilter !== 'ALL'
              ? 'Try adjusting your filters'
              : 'Click "Add Lead" to create your first lead'}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {leads.map((lead: LeadRecord) => {
              const StatusIcon = statusIcons[lead.status] || Star;
              return (
                <Card key={lead.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="pt-4">
                    {/* Status badge & lead code */}
                    <div className="flex items-center justify-between mb-3">
                      <Badge className={statusColors[lead.status] || ''} variant="secondary">
                        <StatusIcon className="mr-1 h-3 w-3" />
                        {lead.status.replace(/_/g, ' ')}
                      </Badge>
                      <span className="text-xs font-mono text-muted-foreground">
                        {lead.lead_code}
                      </span>
                    </div>

                    {/* Name */}
                    <h3 className="text-sm font-semibold truncate">
                      {lead.lead_type === 'NON_INDIVIDUAL' && lead.entity_name
                        ? lead.entity_name
                        : `${lead.first_name} ${lead.last_name}`}
                    </h3>

                    {/* Details */}
                    <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                      {lead.source && (
                        <p>Source: <span className="text-foreground">{lead.source.replace(/_/g, ' ')}</span></p>
                      )}
                      <p>AUM: <span className="font-mono text-foreground">{formatAum(lead.estimated_aum, lead.aum_currency || 'PHP')}</span></p>
                      {lead.assigned_rm && (
                        <p>RM: <span className="text-foreground">{lead.assigned_rm}</span></p>
                      )}
                      <p>Created: <span className="text-foreground">{formatDate(lead.created_at)}</span></p>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-wrap gap-1 mt-3 pt-3 border-t">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        onClick={() => navigate(`/crm/leads/${lead.id}/edit`)}
                      >
                        <Eye className="mr-1 h-3 w-3" /> View
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        onClick={() => navigate(`/crm/leads/${lead.id}/edit`)}
                      >
                        <Pencil className="mr-1 h-3 w-3" /> Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        onClick={() => navigate('/crm/meetings')}
                      >
                        <Calendar className="mr-1 h-3 w-3" /> Meet
                      </Button>
                      {lead.status === 'CLIENT_ACCEPTED' && (
                        <Button
                          size="sm"
                          variant="default"
                          className="h-7 text-xs"
                          onClick={() => handleConvert(lead.id)}
                        >
                          <ArrowRightCircle className="mr-1 h-3 w-3" /> Convert
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Showing {(page - 1) * PAGE_SIZE + 1}--{Math.min(page * PAGE_SIZE, totalRecords)} of {totalRecords} leads
            </p>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="mr-1 h-4 w-4" /> Prev
              </Button>
              <span className="text-sm font-medium">
                Page {page} of {totalPages}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
