/**
 * Prospect Pipeline Manager (CRM PAD)
 *
 * Manages prospects (converted leads) through the CRM pipeline:
 *   - KPI cards: Total, New, Contacted, Qualified, Onboarding, Won, Lost
 *   - Filterable tabs by prospect status
 *   - Prospect detail table with search
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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@ui/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@ui/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@ui/components/ui/tabs';
import { toast } from 'sonner';
import {
  Users, UserPlus, Phone, CheckCircle, Trophy, XCircle,
  Search, ArrowRight, Mail, TrendingUp, Briefcase,
} from 'lucide-react';
import { SkeletonRows } from '@/components/ui/skeleton-rows';

/* ---------- Auth helpers ---------- */

function getToken(): string {
  try {
    const stored = localStorage.getItem('trustoms-user');
    if (stored) {
      const parsed = JSON.parse(stored);
      return parsed.token || '';
    }
  } catch {
    // ignore
  }
  return '';
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

function fetcher(url: string) {
  return fetch(url, { headers: authHeaders() }).then((r) => r.json());
}

/* ---------- Types ---------- */

interface ProspectRecord {
  id: number;
  prospect_code: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  source_campaign: string | null;
  prospect_status: string;
  assigned_rm: string | null;
  aum_potential: string | null;
  created_at: string;
  updated_at: string;
}

interface ProspectListResult {
  data: ProspectRecord[];
  total: number;
  page: number;
  pageSize: number;
}

/* ---------- Constants ---------- */

const PROSPECT_STATUSES = [
  'NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL_SENT', 'ONBOARDING', 'WON', 'LOST',
] as const;

const statusColors: Record<string, string> = {
  NEW: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  CONTACTED: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200',
  QUALIFIED: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  PROPOSAL_SENT: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  ONBOARDING: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  WON: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  LOST: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

/* ---------- Component ---------- */

export default function ProspectManager() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [convertOpen, setConvertOpen] = useState(false);
  const [convertLeadId, setConvertLeadId] = useState('');

  // Build query params
  const statusParam = activeTab === 'ALL' ? '' : activeTab;
  const searchParam = searchTerm.trim();

  const { data: prospectsList, isPending: listPending } = useQuery<ProspectListResult>({
    queryKey: ['prospects-list', statusParam, searchParam],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusParam) params.set('status', statusParam);
      if (searchParam) params.set('search', searchParam);
      params.set('pageSize', '100');
      return fetcher(`/api/v1/prospects?${params.toString()}`);
    },
    refetchInterval: 15000,
  });

  const convertMutation = useMutation({
    mutationFn: (leadId: string) =>
      fetch(`/api/v1/campaign-mgmt/leads/${leadId}/convert`, {
        method: 'POST',
        headers: authHeaders(),
      }).then((r) => {
        if (!r.ok) return r.json().then((e: { error?: string }) => { throw new Error(e.error || 'Conversion failed'); });
        return r.json();
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prospects-list'] });
      setConvertOpen(false);
      setConvertLeadId('');
      toast.success('Lead converted to prospect successfully');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const prospects = prospectsList?.data ?? [];
  const total = prospectsList?.total ?? 0;

  // Compute KPI counts from the full list (when on ALL tab) or from total
  const countByStatus = (status: string): number =>
    prospects.filter((p: ProspectRecord) => p.prospect_status === status).length;

  const kpiCards = [
    { label: 'Total Prospects', value: total, icon: Users, color: 'text-primary' },
    { label: 'New', value: countByStatus('NEW'), icon: UserPlus, color: 'text-blue-600' },
    { label: 'Contacted', value: countByStatus('CONTACTED'), icon: Phone, color: 'text-cyan-600' },
    { label: 'Qualified', value: countByStatus('QUALIFIED'), icon: CheckCircle, color: 'text-yellow-600' },
    { label: 'Onboarding', value: countByStatus('ONBOARDING'), icon: Briefcase, color: 'text-purple-600' },
    { label: 'Won', value: countByStatus('WON'), icon: Trophy, color: 'text-green-600' },
    { label: 'Lost', value: countByStatus('LOST'), icon: XCircle, color: 'text-red-600' },
  ];

  // Filter prospects by search term (client-side supplementary filter)
  const filteredProspects = prospects.filter((p: ProspectRecord) => {
    if (!searchParam) return true;
    const term = searchParam.toLowerCase();
    return (
      p.prospect_code.toLowerCase().includes(term) ||
      p.first_name.toLowerCase().includes(term) ||
      p.last_name.toLowerCase().includes(term) ||
      (p.email ?? '').toLowerCase().includes(term) ||
      (p.source_campaign ?? '').toLowerCase().includes(term) ||
      (p.assigned_rm ?? '').toLowerCase().includes(term)
    );
  });

  function renderProspectsTable() {
    if (listPending) {
      return (
        <div className="rounded-md border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Source Campaign</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Assigned RM</TableHead>
                <TableHead className="text-right">AUM Potential</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <SkeletonRows cols={9} />
            </TableBody>
          </Table>
        </div>
      );
    }

    if (filteredProspects.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
          <Users className="h-10 w-10 text-muted-foreground/50" />
          <p>No prospects found</p>
          {searchParam && (
            <p className="text-sm">Try adjusting your search criteria</p>
          )}
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
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Source Campaign</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Assigned RM</TableHead>
              <TableHead className="text-right">AUM Potential</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredProspects.map((prospect: ProspectRecord) => (
              <TableRow key={prospect.id}>
                <TableCell className="font-mono text-sm">{prospect.prospect_code}</TableCell>
                <TableCell className="font-medium">
                  {prospect.first_name} {prospect.last_name}
                </TableCell>
                <TableCell>
                  {prospect.email ? (
                    <span className="flex items-center gap-1 text-sm">
                      <Mail className="h-3 w-3 text-muted-foreground" />
                      {prospect.email}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell>
                  {prospect.phone ? (
                    <span className="flex items-center gap-1 text-sm">
                      <Phone className="h-3 w-3 text-muted-foreground" />
                      {prospect.phone}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell>{prospect.source_campaign ?? <span className="text-muted-foreground">-</span>}</TableCell>
                <TableCell>
                  <Badge className={statusColors[prospect.prospect_status] || ''} variant="secondary">
                    {prospect.prospect_status.replace(/_/g, ' ')}
                  </Badge>
                </TableCell>
                <TableCell>{prospect.assigned_rm ?? <span className="text-muted-foreground">-</span>}</TableCell>
                <TableCell className="text-right font-mono">
                  {prospect.aum_potential
                    ? parseFloat(prospect.aum_potential).toLocaleString('en-PH', { minimumFractionDigits: 2 })
                    : <span className="text-muted-foreground">-</span>}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {new Date(prospect.created_at).toLocaleDateString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Prospect Pipeline</h1>
          <p className="text-muted-foreground">
            Manage converted leads through the CRM prospect lifecycle
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search prospects..."
              value={searchTerm}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
              className="pl-9 w-64"
            />
          </div>
          <Dialog open={convertOpen} onOpenChange={setConvertOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <ArrowRight className="mr-2 h-4 w-4" /> Convert Lead
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[400px]">
              <DialogHeader>
                <DialogTitle>Convert Lead to Prospect</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div>
                  <label className="text-sm font-medium">Lead ID *</label>
                  <Input
                    placeholder="e.g. 42"
                    value={convertLeadId}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConvertLeadId(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setConvertOpen(false)}>Cancel</Button>
                <Button
                  onClick={() => convertMutation.mutate(convertLeadId)}
                  disabled={!convertLeadId.trim() || convertMutation.isPending}
                >
                  <ArrowRight className="mr-2 h-4 w-4" /> Convert
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-7">
        {listPending
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

      {/* Tabs & Table */}
      <Tabs value={activeTab} onValueChange={(v: string) => setActiveTab(v)}>
        <TabsList>
          <TabsTrigger value="ALL">All</TabsTrigger>
          {PROSPECT_STATUSES.map((status: typeof PROSPECT_STATUSES[number]) => (
            <TabsTrigger key={status} value={status}>
              {status.replace(/_/g, ' ')}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          {renderProspectsTable()}
        </TabsContent>
      </Tabs>
    </div>
  );
}
