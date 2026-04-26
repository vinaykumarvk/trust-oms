/**
 * Claims & Compensation Workbench (TRUST-CA 360 Phase 6)
 *
 * Full lifecycle management of claims: creation, investigation,
 * root-cause classification, approval, settlement, and disclosure.
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
  FileWarning, Search, Plus, CheckCircle, XCircle, Clock, DollarSign,
  AlertTriangle, ArrowRight, Eye, Tag, Send, Ban, ShieldCheck,
  LayoutGrid, LayoutList, ArrowUpCircle,
} from 'lucide-react';

const API = '/api/v1/claims';

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

const statusColors: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-800',
  INVESTIGATING: 'bg-blue-100 text-blue-800',
  PENDING_APPROVAL: 'bg-yellow-100 text-yellow-800',
  APPROVED: 'bg-green-100 text-green-800',
  PAID: 'bg-emerald-100 text-emerald-800',
  REJECTED: 'bg-red-100 text-red-800',
  WITHDRAWN: 'bg-orange-100 text-orange-800',
  DISCLOSED: 'bg-purple-100 text-purple-800',
};

const tierColors: Record<string, string> = {
  AUTO: 'bg-green-50 text-green-700',
  MANAGER: 'bg-blue-50 text-blue-700',
  HEAD: 'bg-yellow-50 text-yellow-700',
  EXEC_COMMITTEE: 'bg-red-50 text-red-700',
};

const ROOT_CAUSES = [
  'DEADLINE_MISSED', 'TAX_ERROR', 'FEE_ERROR', 'WRONG_OPTION',
  'SYSTEM_OUTAGE', 'DATA_QUALITY', 'VENDOR_FAILURE', 'OTHER',
] as const;

const ORIGINATIONS = [
  'CLIENT_RAISED', 'INTERNALLY_DETECTED', 'REGULATOR_RAISED',
] as const;

interface ClaimRecord {
  id: number;
  claim_id: string;
  claim_reference: string;
  event_id: number | null;
  account_id: string | null;
  origination: string | null;
  root_cause_code: string | null;
  claim_amount: string;
  currency: string;
  pnl_impact_account: string | null;
  approval_tier: string;
  claim_status: string;
  compensation_settlement_id: number | null;
  regulatory_disclosure_required: boolean;
  supporting_docs: string[] | null;
  investigation_started_at: string | null;
  investigation_sla_deadline: string | null;
  approved_by: number | null;
  approved_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
}

interface DashboardSummary {
  byStatus: {
    draft: number;
    investigating: number;
    pendingApproval: number;
    approved: number;
    paid: number;
    rejected: number;
    withdrawn: number;
    disclosed: number;
  };
  totalPaidAmount: number;
  rootCauseSummary: Record<string, { count: number; totalAmount: number }>;
  slaBreaches: number;
  total: number;
}

interface ListResult {
  data: ClaimRecord[];
  total: number;
  page: number;
  pageSize: number;
}

export default function ClaimsWorkbench() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [rootCauseDialogOpen, setRootCauseDialogOpen] = useState(false);
  const [evidenceDialogOpen, setEvidenceDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [selectedClaimId, setSelectedClaimId] = useState<number | null>(null);
  const [rootCauseValue, setRootCauseValue] = useState('');
  const [evidenceInput, setEvidenceInput] = useState('');
  const [rejectReason, setRejectReason] = useState('');

  const [viewMode, setViewMode] = useState<'table' | 'card'>('table');
  const [escalateDialogOpen, setEscalateDialogOpen] = useState(false);
  const [escalateReason, setEscalateReason] = useState('');

  const [newClaim, setNewClaim] = useState({
    account_id: '',
    origination: '' as string,
    claim_amount: '',
    currency: 'PHP',
    event_id: '',
    regulatory_disclosure_required: false,
  });

  // Compute status filter from active tab
  const statusFilterMap: Record<string, string> = {
    new: 'DRAFT',
    investigating: 'INVESTIGATING',
    pending: 'PENDING_APPROVAL',
    paid: 'PAID',
    rejected: 'REJECTED',
    all: '',
  };
  const statusParam = statusFilterMap[activeTab] || '';

  const { data: summary, isPending: summaryPending } = useQuery<DashboardSummary>({
    queryKey: ['claims-summary'],
    queryFn: () => fetcher(`${API}/summary`),
    refetchInterval: 30000,
  });

  const { data: claimsList, isPending: listPending } = useQuery<ListResult>({
    queryKey: ['claims-list', statusParam],
    queryFn: () => fetcher(`${API}?status=${statusParam}&pageSize=100`),
    refetchInterval: 15000,
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['claims-list'] });
    queryClient.invalidateQueries({ queryKey: ['claims-summary'] });
  };

  const createMutation = useMutation({
    mutationFn: (data: typeof newClaim) =>
      fetch(API, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          account_id: data.account_id,
          origination: data.origination,
          claim_amount: parseFloat(data.claim_amount),
          currency: data.currency,
          event_id: data.event_id || undefined,
          regulatory_disclosure_required: data.regulatory_disclosure_required,
        }),
      }).then((r) => {
        if (!r.ok) return r.json().then((e: { error?: string }) => { throw new Error(e.error || 'Create failed'); });
        return r.json();
      }),
    onSuccess: () => {
      invalidateAll();
      setCreateOpen(false);
      setNewClaim({ account_id: '', origination: '', claim_amount: '', currency: 'PHP', event_id: '', regulatory_disclosure_required: false });
      toast.success('Claim created successfully');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const actionMutation = useMutation({
    mutationFn: ({ id, action, body }: { id: number; action: string; body?: Record<string, unknown> }) =>
      fetch(`${API}/${id}/${action}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: body ? JSON.stringify(body) : undefined,
      }).then((r) => {
        if (!r.ok) return r.json().then((e: { error?: string }) => { throw new Error(e.error || 'Action failed'); });
        return r.json();
      }),
    onSuccess: (_data: unknown, vars: { id: number; action: string; body?: Record<string, unknown> }) => {
      invalidateAll();
      toast.success(`Action "${vars.action}" completed`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const doAction = (id: number, action: string, body?: Record<string, unknown>) => {
    actionMutation.mutate({ id, action, body });
  };

  // Summary cards
  const cards = [
    {
      label: 'New (Draft)',
      value: summary?.byStatus.draft ?? 0,
      icon: FileWarning,
      color: 'text-gray-600',
    },
    {
      label: 'Investigating',
      value: summary?.byStatus.investigating ?? 0,
      icon: Search,
      color: 'text-blue-600',
    },
    {
      label: 'Pending Approval',
      value: summary?.byStatus.pendingApproval ?? 0,
      icon: Clock,
      color: 'text-yellow-600',
    },
    {
      label: 'Total Paid (PHP)',
      value: `${(summary?.totalPaidAmount ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      icon: DollarSign,
      color: 'text-green-600',
    },
    {
      label: 'SLA Breaches',
      value: summary?.slaBreaches ?? 0,
      icon: AlertTriangle,
      color: 'text-red-600',
    },
  ];

  // Root cause bar chart data
  const rootCauseEntries = summary?.rootCauseSummary
    ? Object.entries(summary.rootCauseSummary).sort(
        (a: [string, { count: number; totalAmount: number }], b: [string, { count: number; totalAmount: number }]) => b[1].totalAmount - a[1].totalAmount,
      )
    : [];
  const maxRootCauseAmount = rootCauseEntries.length > 0
    ? Math.max(...rootCauseEntries.map((e: [string, { count: number; totalAmount: number }]) => e[1].totalAmount))
    : 1;

  const claims = claimsList?.data ?? [];

  /** Compute SLA ageing: days remaining until investigation_sla_deadline */
  function slaAgeing(claim: ClaimRecord): { daysRemaining: number; color: string; label: string } | null {
    if (!claim.investigation_sla_deadline) return null;
    const deadline = new Date(claim.investigation_sla_deadline).getTime();
    const now = Date.now();
    const daysRemaining = Math.ceil((deadline - now) / (1000 * 60 * 60 * 24));
    let color = 'bg-green-100 text-green-800'; // plenty of time
    if (daysRemaining <= 0) color = 'bg-red-100 text-red-800';
    else if (daysRemaining <= 2) color = 'bg-orange-100 text-orange-800';
    else if (daysRemaining <= 5) color = 'bg-yellow-100 text-yellow-800';
    const label = daysRemaining <= 0 ? `${Math.abs(daysRemaining)}d overdue` : `${daysRemaining}d left`;
    return { daysRemaining, color, label };
  }

  function renderActions(claim: ClaimRecord) {
    const s = claim.claim_status;
    return (
      <div className="flex gap-1 flex-wrap">
        {s === 'DRAFT' && (
          <>
            <Button size="sm" variant="outline" onClick={() => doAction(claim.id, 'investigate')}>
              <Search className="mr-1 h-3 w-3" /> Investigate
            </Button>
            <Button size="sm" variant="ghost" onClick={() => doAction(claim.id, 'withdraw')}>
              <Ban className="mr-1 h-3 w-3" /> Withdraw
            </Button>
          </>
        )}
        {s === 'INVESTIGATING' && (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() => { setSelectedClaimId(claim.id); setRootCauseValue(''); setRootCauseDialogOpen(true); }}
            >
              <Tag className="mr-1 h-3 w-3" /> Root Cause
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => { setSelectedClaimId(claim.id); setEvidenceInput(''); setEvidenceDialogOpen(true); }}
            >
              <Eye className="mr-1 h-3 w-3" /> Evidence
            </Button>
            <Button size="sm" variant="default" onClick={() => doAction(claim.id, 'submit-approval')}>
              <Send className="mr-1 h-3 w-3" /> Submit
            </Button>
          </>
        )}
        {s === 'PENDING_APPROVAL' && (
          <>
            <Button size="sm" variant="default" onClick={() => doAction(claim.id, 'approve')}>
              <CheckCircle className="mr-1 h-3 w-3" /> Approve
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => { setSelectedClaimId(claim.id); setRejectReason(''); setRejectDialogOpen(true); }}
            >
              <XCircle className="mr-1 h-3 w-3" /> Reject
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-orange-300 text-orange-700 hover:bg-orange-50"
              onClick={() => { setSelectedClaimId(claim.id); setEscalateReason(''); setEscalateDialogOpen(true); }}
            >
              <ArrowUpCircle className="mr-1 h-3 w-3" /> Escalate
            </Button>
          </>
        )}
        {s === 'APPROVED' && (
          <Button size="sm" variant="default" onClick={() => doAction(claim.id, 'settle')}>
            <DollarSign className="mr-1 h-3 w-3" /> Settle
          </Button>
        )}
        {s === 'PAID' && claim.regulatory_disclosure_required && (
          <Button size="sm" variant="outline" onClick={() => doAction(claim.id, 'disclose')}>
            <ShieldCheck className="mr-1 h-3 w-3" /> Disclose
          </Button>
        )}
      </div>
    );
  }

  function SkeletonRows({ cols, rows = 5 }: { cols: number; rows?: number }) {
    return (
      <>
        {Array.from({ length: rows }).map((_, i) => (
          <TableRow key={i}>
            {Array.from({ length: cols }).map((_, j) => (
              <TableCell key={j}>
                <div className="h-4 w-full animate-pulse rounded bg-muted" />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </>
    );
  }

  function renderClaimsTable(data: ClaimRecord[]) {
    if (listPending) {
      return (
        <div className="rounded-md border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Claim Ref</TableHead>
                <TableHead>Origination</TableHead>
                <TableHead>Root Cause</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Currency</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Approval Tier</TableHead>
                <TableHead>SLA</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <SkeletonRows cols={10} />
            </TableBody>
          </Table>
        </div>
      );
    }

    if (data.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
          <FileWarning className="h-10 w-10 text-muted-foreground/50" />
          <p>No claims found</p>
        </div>
      );
    }

    return (
      <div className="rounded-md border overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Claim Ref</TableHead>
              <TableHead>Origination</TableHead>
              <TableHead>Root Cause</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Currency</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Approval Tier</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((claim: ClaimRecord) => (
              <TableRow key={claim.id}>
                <TableCell className="font-mono text-sm">{claim.claim_reference}</TableCell>
                <TableCell>{(claim.origination ?? '').replace(/_/g, ' ')}</TableCell>
                <TableCell>{claim.root_cause_code ? claim.root_cause_code.replace(/_/g, ' ') : '-'}</TableCell>
                <TableCell className="text-right font-mono">
                  {parseFloat(claim.claim_amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                </TableCell>
                <TableCell>{claim.currency}</TableCell>
                <TableCell>
                  <Badge className={statusColors[claim.claim_status] || ''} variant="secondary">
                    {claim.claim_status.replace(/_/g, ' ')}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge className={tierColors[claim.approval_tier] || ''} variant="outline">
                    {claim.approval_tier.replace(/_/g, ' ')}
                  </Badge>
                </TableCell>
                <TableCell>
                  {(() => {
                    const sla = slaAgeing(claim);
                    if (!sla) return <span className="text-muted-foreground">-</span>;
                    return (
                      <Badge className={sla.color} variant="secondary">
                        <Clock className="mr-1 h-3 w-3" />
                        {sla.label}
                      </Badge>
                    );
                  })()}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {new Date(claim.created_at).toLocaleDateString()}
                </TableCell>
                <TableCell>{renderActions(claim)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  function renderClaimsCards(data: ClaimRecord[]) {
    if (listPending) {
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-6 space-y-3">
                <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                <div className="h-4 w-20 animate-pulse rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      );
    }

    if (data.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
          <FileWarning className="h-10 w-10 text-muted-foreground/50" />
          <p>No claims found</p>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {data.map((claim: ClaimRecord) => {
          const sla = slaAgeing(claim);
          return (
            <Card key={claim.id} className="flex flex-col">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-mono">{claim.claim_reference}</CardTitle>
                  <Badge className={statusColors[claim.claim_status] || ''} variant="secondary">
                    {claim.claim_status.replace(/_/g, ' ')}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="flex-1 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Amount</span>
                  <span className="font-mono font-medium">
                    {claim.currency} {parseFloat(claim.claim_amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Root Cause</span>
                  <span>{claim.root_cause_code ? claim.root_cause_code.replace(/_/g, ' ') : '-'}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Tier</span>
                  <Badge className={tierColors[claim.approval_tier] || ''} variant="outline">
                    {claim.approval_tier.replace(/_/g, ' ')}
                  </Badge>
                </div>
                {sla && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">SLA</span>
                    <Badge className={sla.color} variant="secondary">
                      <Clock className="mr-1 h-3 w-3" />
                      {sla.label}
                    </Badge>
                  </div>
                )}
                <div className="text-xs text-muted-foreground pt-1">
                  Created {new Date(claim.created_at).toLocaleDateString()}
                </div>
                <div className="pt-2 border-t">{renderActions(claim)}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Claims & Compensation</h1>
          <p className="text-muted-foreground">
            Manage claim lifecycle: investigation, approval, settlement, and disclosure
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* View Mode Toggle */}
          <div className="flex items-center border rounded-md">
            <Button
              variant={viewMode === 'table' ? 'default' : 'ghost'}
              size="sm"
              className="rounded-r-none"
              onClick={() => setViewMode('table')}
            >
              <LayoutList className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'card' ? 'default' : 'ghost'}
              size="sm"
              className="rounded-l-none"
              onClick={() => setViewMode('card')}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-2 h-4 w-4" /> New Claim
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[480px]">
            <DialogHeader>
              <DialogTitle>Create Claim</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <label className="text-sm font-medium">Account ID *</label>
                <Input
                  placeholder="e.g. ACCT-001"
                  value={newClaim.account_id}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewClaim({ ...newClaim, account_id: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Origination *</label>
                <Select value={newClaim.origination} onValueChange={(v: string) => setNewClaim({ ...newClaim, origination: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select origination" />
                  </SelectTrigger>
                  <SelectContent>
                    {ORIGINATIONS.map((o: typeof ORIGINATIONS[number]) => (
                      <SelectItem key={o} value={o}>{o.replace(/_/g, ' ')}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Amount *</label>
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={newClaim.claim_amount}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewClaim({ ...newClaim, claim_amount: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Currency</label>
                  <Select value={newClaim.currency} onValueChange={(v: string) => setNewClaim({ ...newClaim, currency: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PHP">PHP</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">CA Event ID (optional)</label>
                <Input
                  placeholder="e.g. 42"
                  value={newClaim.event_id}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewClaim({ ...newClaim, event_id: e.target.value })}
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="reg-disclosure"
                  checked={newClaim.regulatory_disclosure_required}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setNewClaim({ ...newClaim, regulatory_disclosure_required: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-gray-300"
                />
                <label htmlFor="reg-disclosure" className="text-sm">Regulatory Disclosure Required</label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button
                onClick={() => createMutation.mutate(newClaim)}
                disabled={!newClaim.account_id || !newClaim.origination || !newClaim.claim_amount}
              >
                Create Claim
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        {summaryPending
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
          : cards.map((card: typeof cards[number]) => (
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

      {/* Root Cause Summary Chart */}
      {rootCauseEntries.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Claims by Root Cause</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {rootCauseEntries.map(([cause, data]: [string, { count: number; totalAmount: number }]) => (
                <div key={cause} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{cause.replace(/_/g, ' ')}</span>
                    <span className="text-muted-foreground">
                      {data.count} claims / PHP {data.totalAmount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="h-3 w-full rounded-full bg-muted">
                    <div
                      className="h-3 rounded-full bg-primary transition-all"
                      style={{ width: `${Math.max((data.totalAmount / maxRootCauseAmount) * 100, 2)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs & Claims Table */}
      <Tabs value={activeTab} onValueChange={(v: string) => setActiveTab(v)}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="new">
            New {summary?.byStatus.draft ? `(${summary.byStatus.draft})` : ''}
          </TabsTrigger>
          <TabsTrigger value="investigating">
            Investigating {summary?.byStatus.investigating ? `(${summary.byStatus.investigating})` : ''}
          </TabsTrigger>
          <TabsTrigger value="pending">
            Pending Approval {summary?.byStatus.pendingApproval ? `(${summary.byStatus.pendingApproval})` : ''}
          </TabsTrigger>
          <TabsTrigger value="paid">
            Paid {summary?.byStatus.paid ? `(${summary.byStatus.paid})` : ''}
          </TabsTrigger>
          <TabsTrigger value="rejected">
            Rejected {summary?.byStatus.rejected ? `(${summary.byStatus.rejected})` : ''}
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          {viewMode === 'table' ? renderClaimsTable(claims) : renderClaimsCards(claims)}
        </TabsContent>
      </Tabs>

      {/* Root Cause Dialog */}
      <Dialog open={rootCauseDialogOpen} onOpenChange={setRootCauseDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Classify Root Cause</DialogTitle>
          </DialogHeader>
          <Select value={rootCauseValue} onValueChange={(v: string) => setRootCauseValue(v)}>
            <SelectTrigger>
              <SelectValue placeholder="Select root cause" />
            </SelectTrigger>
            <SelectContent>
              {ROOT_CAUSES.map((rc: typeof ROOT_CAUSES[number]) => (
                <SelectItem key={rc} value={rc}>{rc.replace(/_/g, ' ')}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRootCauseDialogOpen(false)}>Cancel</Button>
            <Button
              disabled={!rootCauseValue}
              onClick={() => {
                if (selectedClaimId != null) {
                  doAction(selectedClaimId, 'root-cause', { rootCauseCode: rootCauseValue });
                  setRootCauseDialogOpen(false);
                }
              }}
            >
              Classify
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Evidence Dialog */}
      <Dialog open={evidenceDialogOpen} onOpenChange={setEvidenceDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Add Evidence Documents</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">Document references (comma-separated)</label>
            <Input
              placeholder="DOC-001, DOC-002"
              value={evidenceInput}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEvidenceInput(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEvidenceDialogOpen(false)}>Cancel</Button>
            <Button
              disabled={!evidenceInput.trim()}
              onClick={() => {
                if (selectedClaimId != null) {
                  const docs = evidenceInput.split(',').map((d: string) => d.trim()).filter((d: string) => d.length > 0);
                  doAction(selectedClaimId, 'evidence', { documents: docs });
                  setEvidenceDialogOpen(false);
                }
              }}
            >
              Add Evidence
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Reject Claim</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">Rejection Reason *</label>
            <Input
              placeholder="Enter reason for rejection"
              value={rejectReason}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRejectReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!rejectReason.trim()}
              onClick={() => {
                if (selectedClaimId != null) {
                  doAction(selectedClaimId, 'reject', { reason: rejectReason });
                  setRejectDialogOpen(false);
                }
              }}
            >
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Escalate Dialog */}
      <Dialog open={escalateDialogOpen} onOpenChange={setEscalateDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Escalate Claim</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">Escalation Reason *</label>
            <Input
              placeholder="Describe the reason for escalation"
              value={escalateReason}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEscalateReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEscalateDialogOpen(false)}>Cancel</Button>
            <Button
              className="bg-orange-600 hover:bg-orange-700 text-white"
              disabled={!escalateReason.trim()}
              onClick={() => {
                if (selectedClaimId != null) {
                  doAction(selectedClaimId, 'escalate', { reason: escalateReason });
                  setEscalateDialogOpen(false);
                }
              }}
            >
              <ArrowUpCircle className="mr-1 h-4 w-4" /> Escalate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
