/**
 * Supervisor Dashboard — Risk Profiling & Proposal Oversight
 *
 * Provides supervisors with a consolidated view of:
 *   - Summary KPIs (active profiles, pending approvals, proposals, deviations)
 *   - Leads pipeline summary with drill-down per RM
 *   - Pending risk profile deviation approvals
 *   - Proposal approval queue (L1 approve / reject / return)
 *   - Risk distribution across client categories
 *
 * Auto-refreshes every 30 seconds.
 */

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from '@ui/components/ui/card';
import { Button } from '@ui/components/ui/button';
import { Badge } from '@ui/components/ui/badge';
import { Input } from '@ui/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@ui/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@ui/components/ui/dialog';
import { toast } from 'sonner';
import {
  ShieldCheck, Clock, FileText, AlertTriangle, Search,
  RefreshCw, ChevronLeft, ChevronRight, CheckCircle,
  XCircle, RotateCcw, Users, BarChart3, Eye,
} from 'lucide-react';

/* ---------- Constants ---------- */

const RP_API = '/api/v1/risk-profiling';
const PROPOSALS_API = '/api/v1/proposals';
const REFETCH_INTERVAL = 30_000;
const PAGE_SIZE = 10;

/* ---------- Auth helpers ---------- */

function fetcher<T>(url: string): Promise<T> {
  return fetch(url, { credentials: 'include', headers: { 'Content-Type': 'application/json' } }).then((r) => {
    if (!r.ok) throw new Error(`Request failed: ${r.status}`);
    return r.json() as Promise<T>;
  });
}

function poster<T>(url: string, body?: Record<string, unknown>): Promise<T> {
  return fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  }).then((r) => {
    if (!r.ok) throw new Error(`Request failed: ${r.status}`);
    return r.json() as Promise<T>;
  });
}

/* ---------- Types ---------- */

interface DashboardSummary {
  activeProfiles: number;
  pendingApprovals: number;
  proposalsThisMonth: number;
  riskDeviations: number;
}

interface LeadRmRow {
  rmId: number;
  rmName: string | null;
  statusCounts: Record<string, number>;
  total: number;
}

interface PendingAssessment {
  id: number;
  customerName: string;
  assessmentDate: string;
  computedCategory: string;
  deviatedCategory: string;
  deviationReason: string;
}

interface ProposalRow {
  id: number;
  proposalNumber: string;
  customerName: string;
  amount: number;
  status: string;
  rmName: string;
}

interface RiskDistEntry {
  category: string;
  code: number;
  count: number;
}

/* ---------- Risk category colours ---------- */

const RISK_CAT_COLORS: Record<string, string> = {
  Conservative: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  'Low to Moderate': 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300',
  Moderate: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  'Moderately High': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  Aggressive: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  'Very Aggressive': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

const RISK_BAR_BG: Record<string, string> = {
  Conservative: 'bg-blue-400',
  'Low to Moderate': 'bg-cyan-400',
  Moderate: 'bg-green-400',
  'Moderately High': 'bg-yellow-400',
  Aggressive: 'bg-orange-400',
  'Very Aggressive': 'bg-red-400',
};

const LEAD_STATUS_COLORS: Record<string, string> = {
  IN_PROGRESS: 'bg-yellow-400',
  NEW: 'bg-blue-400',
  CLIENT_REJECTED: 'bg-red-400',
  READY_FOR_FOLLOWUP: 'bg-teal-400',
  CLIENT_ACCEPTED: 'bg-pink-400',
};

const LEAD_STATUS_LABELS: Record<string, string> = {
  IN_PROGRESS: 'In Progress',
  NEW: 'New',
  CLIENT_REJECTED: 'Client Rejected',
  READY_FOR_FOLLOWUP: 'Ready for Follow-up',
  CLIENT_ACCEPTED: 'Client Accepted',
};

const LEAD_STATUSES = ['IN_PROGRESS', 'NEW', 'CLIENT_REJECTED', 'READY_FOR_FOLLOWUP', 'CLIENT_ACCEPTED'] as const;

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2 }).format(v);

/* ---------- Empty defaults (no fabricated data) ---------- */

const EMPTY_SUMMARY: DashboardSummary = {
  activeProfiles: 0,
  pendingApprovals: 0,
  proposalsThisMonth: 0,
  riskDeviations: 0,
};

const EMPTY_LEADS: LeadRmRow[] = [];

const EMPTY_PENDING: PendingAssessment[] = [];

const EMPTY_PROPOSALS: { data: ProposalRow[]; total: number } = {
  data: [],
  total: 0,
};

const EMPTY_RISK_DIST: RiskDistEntry[] = [];

/* ========== Main Component ========== */

export default function SupervisorDashboardRP() {
  const queryClient = useQueryClient();
  const [leadsSearch, setLeadsSearch] = useState('');
  const [leadsPage, setLeadsPage] = useState(1);
  const [drillDown, setDrillDown] = useState(false);

  /* --- View Responses dialog (G-024, G-025, G-081) --- */
  const [viewResponsesOpen, setViewResponsesOpen] = useState(false);
  const [viewResponsesAssessment, setViewResponsesAssessment] = useState<PendingAssessment | null>(null);

  /* --- Reject Assessment dialog (G-081) --- */
  const [rejectAssessOpen, setRejectAssessOpen] = useState(false);
  const [rejectAssessId, setRejectAssessId] = useState<number | null>(null);
  const [rejectAssessComment, setRejectAssessComment] = useState('');

  /* --- Proposal Pipeline date filter (G-097) --- */
  const [pipelineDateFrom, setPipelineDateFrom] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1);
    return d.toISOString().split('T')[0];
  });
  const [pipelineDateTo, setPipelineDateTo] = useState(() => new Date().toISOString().split('T')[0]);

  /* ---------- Data queries ---------- */

  const dashboardQuery = useQuery<DashboardSummary>({
    queryKey: ['rp-supervisor-dashboard'],
    queryFn: () => fetcher<DashboardSummary>(`${RP_API}/supervisor/dashboard`),
    refetchInterval: REFETCH_INTERVAL,
  });

  const leadsQuery = useQuery<LeadRmRow[]>({
    queryKey: ['rp-supervisor-leads'],
    // Leads pipeline is served from the leads endpoint; dashboard summary is separate
    queryFn: () => fetcher<LeadRmRow[]>(`/api/v1/leads?view=rm_summary`),
    refetchInterval: REFETCH_INTERVAL,
  });

  const pendingQuery = useQuery<PendingAssessment[]>({
    queryKey: ['rp-pending-assessments'],
    queryFn: async () => {
      const res = await fetcher<{ data: PendingAssessment[] }>(`${RP_API}/assessments?status=PENDING_APPROVAL&page_size=50`);
      return res.data ?? [];
    },
    refetchInterval: REFETCH_INTERVAL,
  });

  const proposalsQuery = useQuery<{ data: ProposalRow[]; total: number }>({
    queryKey: ['rp-proposals-queue', pipelineDateFrom, pipelineDateTo],
    queryFn: () =>
      fetcher<{ data: ProposalRow[]; total: number }>(
        `${PROPOSALS_API}?status=SUBMITTED&page=1&page_size=50&date_from=${pipelineDateFrom}&date_to=${pipelineDateTo}`,
      ),
    refetchInterval: REFETCH_INTERVAL,
  });

  const riskDistQuery = useQuery<RiskDistEntry[]>({
    queryKey: ['rp-risk-distribution'],
    queryFn: async () => {
      const res = await fetcher<{ pipeline: RiskDistEntry[] }>(`${PROPOSALS_API}/reports/pipeline?entity_id=default`);
      return res.pipeline ?? [];
    },
    refetchInterval: REFETCH_INTERVAL,
  });

  /* Risk Mismatch Report (G-059 — FR-035.AC2) */
  const mismatchQuery = useQuery<{ total: number; mismatches: { id: number; customer_id: string; product_risk_code: number; customer_risk_code: number; deviation_acknowledged: boolean }[] }>({
    queryKey: ['rp-risk-mismatch'],
    queryFn: () => fetcher(`${RP_API}/reports/risk-mismatch?entity_id=default`),
    refetchInterval: REFETCH_INTERVAL,
  });

  /* ---------- Mutations ---------- */

  const approveDeviation = useMutation({
    mutationFn: (assessmentId: number) =>
      poster(`${RP_API}/assessments/${assessmentId}/approve-deviation`),
    onSuccess: () => {
      toast.success('Deviation approved successfully');
      queryClient.invalidateQueries({ queryKey: ['rp-pending-assessments'] });
      queryClient.invalidateQueries({ queryKey: ['rp-supervisor-dashboard'] });
    },
    onError: () => toast.error('Failed to approve deviation'),
  });

  /* Reject with mandatory comment (FR-020.AC4) */
  const rejectAssessmentMut = useMutation({
    mutationFn: ({ id, comments }: { id: number; comments: string }) =>
      poster(`${RP_API}/assessments/${id}/reject-deviation`, { comments }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rp-pending-assessments'] });
      queryClient.invalidateQueries({ queryKey: ['rp-supervisor-dashboard'] });
      setRejectAssessOpen(false);
      setRejectAssessComment('');
      toast.success('Assessment rejected');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const approveProposalL1 = useMutation({
    mutationFn: (proposalId: number) =>
      poster(`${PROPOSALS_API}/${proposalId}/approve-l1`, { comments: '' }),
    onSuccess: () => {
      toast.success('Proposal approved (L1)');
      queryClient.invalidateQueries({ queryKey: ['rp-proposals-queue'] });
      queryClient.invalidateQueries({ queryKey: ['rp-supervisor-dashboard'] });
    },
    onError: () => toast.error('Failed to approve proposal'),
  });

  const rejectProposalL1 = useMutation({
    mutationFn: (proposalId: number) =>
      poster(`${PROPOSALS_API}/${proposalId}/reject-l1`, { comments: '' }),
    onSuccess: () => {
      toast.success('Proposal rejected');
      queryClient.invalidateQueries({ queryKey: ['rp-proposals-queue'] });
      queryClient.invalidateQueries({ queryKey: ['rp-supervisor-dashboard'] });
    },
    onError: () => toast.error('Failed to reject proposal'),
  });

  const returnProposal = useMutation({
    mutationFn: (proposalId: number) =>
      poster(`${PROPOSALS_API}/${proposalId}/return-for-revision`, { level: 'L1_SUPERVISOR', comments: '' }),
    onSuccess: () => {
      toast.success('Proposal returned to RM');
      queryClient.invalidateQueries({ queryKey: ['rp-proposals-queue'] });
    },
    onError: () => toast.error('Failed to return proposal'),
  });

  /* ---------- Derived data ---------- */

  const summary = dashboardQuery.data ?? EMPTY_SUMMARY;
  const leads = leadsQuery.data ?? [];
  const pendingAssessments = pendingQuery.data ?? [];
  const proposals = proposalsQuery.data?.data ?? [];
  const riskDist = riskDistQuery.data ?? [];
  const riskDistTotal = useMemo(() => riskDist.reduce((s, r) => s + r.count, 0), [riskDist]);
  const mismatchData = mismatchQuery.data ?? null;

  // Leads aggregate totals for bar chart
  const leadsAggregate = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const status of LEAD_STATUSES) totals[status] = 0;
    for (const rm of leads) {
      for (const status of LEAD_STATUSES) {
        totals[status] += rm.statusCounts[status] ?? 0;
      }
    }
    const grand = Object.values(totals).reduce((a, b) => a + b, 0);
    return { totals, grand };
  }, [leads]);

  // Leads drill-down filtering and pagination
  const filteredLeads = useMemo(() => {
    if (!leadsSearch.trim()) return leads;
    const q = leadsSearch.toLowerCase();
    return leads.filter((rm) => rm.rmName?.toLowerCase().includes(q));
  }, [leads, leadsSearch]);

  const leadsPageCount = Math.max(1, Math.ceil(filteredLeads.length / PAGE_SIZE));
  const pagedLeads = useMemo(
    () => filteredLeads.slice((leadsPage - 1) * PAGE_SIZE, leadsPage * PAGE_SIZE),
    [filteredLeads, leadsPage],
  );

  /* ---------- Refresh ---------- */

  function refreshAll() {
    dashboardQuery.refetch();
    leadsQuery.refetch();
    pendingQuery.refetch();
    proposalsQuery.refetch();
    riskDistQuery.refetch();
  }

  /* ---------- Render ---------- */

  return (
    <div className="space-y-6 p-6" role="main" aria-label="Supervisor Dashboard - Risk Profiling">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" aria-hidden="true" />
            Risk Profiling Supervisor Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">
            Oversight of risk assessments, proposals, and lead pipeline
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refreshAll} aria-label="Refresh all data">
          <RefreshCw className="h-4 w-4 mr-1" aria-hidden="true" />
          Refresh
        </Button>
      </div>

      {/* ---- Error banners ---- */}
      {dashboardQuery.isError && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 dark:bg-red-900/20 px-4 py-2 text-sm text-red-700 dark:text-red-400">
          Failed to load dashboard summary. Please refresh.
        </div>
      )}
      {leadsQuery.isError && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 dark:bg-red-900/20 px-4 py-2 text-sm text-red-700 dark:text-red-400">
          Failed to load leads pipeline. Please refresh.
        </div>
      )}
      {pendingQuery.isError && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 dark:bg-red-900/20 px-4 py-2 text-sm text-red-700 dark:text-red-400">
          Failed to load pending assessments. Please refresh.
        </div>
      )}
      {proposalsQuery.isError && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 dark:bg-red-900/20 px-4 py-2 text-sm text-red-700 dark:text-red-400">
          Failed to load proposals queue. Please refresh.
        </div>
      )}

      {/* ---- 1. Summary Cards ---- */}
      <section aria-label="Summary metrics">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Active Risk Profiles</p>
                  <p className="mt-1 text-2xl font-bold">{summary.activeProfiles.toLocaleString()}</p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600" aria-hidden="true">
                  <Users className="h-5 w-5 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Pending Approvals</p>
                  <p className="mt-1 text-2xl font-bold">{summary.pendingApprovals}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Risk profiles + proposals</p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-600" aria-hidden="true">
                  <Clock className="h-5 w-5 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Proposals This Month</p>
                  <p className="mt-1 text-2xl font-bold">{summary.proposalsThisMonth}</p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-600" aria-hidden="true">
                  <FileText className="h-5 w-5 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Risk Deviations</p>
                  <p className="mt-1 text-2xl font-bold">{summary.riskDeviations}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Active deviations</p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-600" aria-hidden="true">
                  <AlertTriangle className="h-5 w-5 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ---- 2. Leads Summary Widget ---- */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" aria-hidden="true" />
                Leads Pipeline Summary
              </CardTitle>
              <CardDescription>
                {drillDown ? 'Breakdown by Relationship Manager' : 'Aggregate status distribution'}
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setDrillDown(!drillDown); setLeadsPage(1); setLeadsSearch(''); }}
            >
              {drillDown ? 'Show Chart' : 'Drill Down'}
              <Eye className="h-4 w-4 ml-1" aria-hidden="true" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!drillDown ? (
            /* Level 1: Bar chart as horizontal progress bars */
            <div className="space-y-3">
              {LEAD_STATUSES.map((status) => {
                const count = leadsAggregate.totals[status] ?? 0;
                const pct = leadsAggregate.grand > 0 ? (count / leadsAggregate.grand) * 100 : 0;
                return (
                  <div key={status} className="flex items-center gap-3">
                    <span className="w-40 text-sm font-medium truncate">{LEAD_STATUS_LABELS[status]}</span>
                    <div className="flex-1 h-6 bg-muted rounded-full overflow-hidden relative">
                      <div
                        className={`h-full rounded-full transition-all ${LEAD_STATUS_COLORS[status]}`}
                        style={{ width: `${pct}%` }}
                        role="progressbar"
                        aria-valuenow={count}
                        aria-valuemin={0}
                        aria-valuemax={leadsAggregate.grand}
                        aria-label={`${LEAD_STATUS_LABELS[status]}: ${count}`}
                      />
                    </div>
                    <span className="w-12 text-sm font-semibold text-right">{count}</span>
                  </div>
                );
              })}
              <p className="text-xs text-muted-foreground text-right mt-1">
                Total leads: {leadsAggregate.grand}
              </p>
            </div>
          ) : (
            /* Level 2: Drill-down table */
            <div className="space-y-3">
              <div className="relative max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  placeholder="Search RM name..."
                  className="pl-9"
                  value={leadsSearch}
                  onChange={(e) => { setLeadsSearch(e.target.value); setLeadsPage(1); }}
                  aria-label="Search relationship managers"
                />
              </div>
              <div className="overflow-x-auto rounded-md border">
                <Table aria-label="Leads drill-down by RM">
                  <TableHeader>
                    <TableRow>
                      <TableHead>RM Name</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Accepted</TableHead>
                      <TableHead className="text-right">Rejected</TableHead>
                      <TableHead className="text-right">In Progress</TableHead>
                      <TableHead className="text-right">Follow-up</TableHead>
                      <TableHead className="text-right">New</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagedLeads.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                          No RM data matches the current search.
                        </TableCell>
                      </TableRow>
                    ) : (
                      pagedLeads.map((rm) => (
                        <TableRow key={rm.rmId}>
                          <TableCell className="font-medium">{rm.rmName ?? `RM #${rm.rmId}`}</TableCell>
                          <TableCell className="text-right font-semibold">{rm.total}</TableCell>
                          <TableCell className="text-right">{rm.statusCounts.CLIENT_ACCEPTED ?? 0}</TableCell>
                          <TableCell className="text-right">{rm.statusCounts.CLIENT_REJECTED ?? 0}</TableCell>
                          <TableCell className="text-right">{rm.statusCounts.IN_PROGRESS ?? 0}</TableCell>
                          <TableCell className="text-right">{rm.statusCounts.READY_FOR_FOLLOWUP ?? 0}</TableCell>
                          <TableCell className="text-right">{rm.statusCounts.NEW ?? 0}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              {/* Pagination */}
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Page {leadsPage} of {leadsPageCount} ({filteredLeads.length} RMs)
                </span>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" disabled={leadsPage <= 1} onClick={() => setLeadsPage((p) => p - 1)}>
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Prev
                  </Button>
                  <Button variant="outline" size="sm" disabled={leadsPage >= leadsPageCount} onClick={() => setLeadsPage((p) => p + 1)}>
                    Next <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---- 3. Pending Risk Profile Approvals ---- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" aria-hidden="true" />
            Pending Risk Profile Approvals
          </CardTitle>
          <CardDescription>
            Risk assessments with category deviations awaiting supervisor approval
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <Table aria-label="Pending risk profile deviation approvals">
              <TableHeader>
                <TableRow>
                  <TableHead>Customer Name</TableHead>
                  <TableHead>Assessment Date</TableHead>
                  <TableHead>Computed Category</TableHead>
                  <TableHead>Deviated Category</TableHead>
                  <TableHead className="max-w-[200px]">Deviation Reason</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingAssessments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      No pending risk profile approvals.
                    </TableCell>
                  </TableRow>
                ) : (
                  pendingAssessments.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.customerName}</TableCell>
                      <TableCell>{a.assessmentDate}</TableCell>
                      <TableCell>
                        <Badge className={RISK_CAT_COLORS[a.computedCategory] ?? 'bg-gray-100 text-gray-800'}>
                          {a.computedCategory}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={RISK_CAT_COLORS[a.deviatedCategory] ?? 'bg-gray-100 text-gray-800'}>
                          {a.deviatedCategory}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground" title={a.deviationReason}>
                        {a.deviationReason}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1 flex-wrap">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-blue-600 border-blue-300 hover:bg-blue-50"
                            onClick={() => { setViewResponsesAssessment(a); setViewResponsesOpen(true); }}
                            aria-label={`View responses for ${a.customerName}`}
                          >
                            <Eye className="h-3 w-3 mr-1" aria-hidden="true" /> Responses
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-green-700 hover:text-green-800"
                            onClick={() => approveDeviation.mutate(a.id)}
                            disabled={approveDeviation.isPending}
                            aria-label={`Approve deviation for ${a.customerName}`}
                          >
                            <CheckCircle className="h-4 w-4 mr-1" aria-hidden="true" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600 border-red-300 hover:bg-red-50"
                            onClick={() => { setRejectAssessId(a.id); setRejectAssessOpen(true); }}
                            aria-label={`Reject deviation for ${a.customerName}`}
                          >
                            <XCircle className="h-3 w-3 mr-1" aria-hidden="true" /> Reject
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ---- 3b. Risk Mismatch Report (G-059 — FR-035.AC2) ---- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" aria-hidden="true" />
            Risk Mismatch Report
          </CardTitle>
          <CardDescription>
            Clients holding products with a risk rating that exceeds their profile
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Risk Mismatch Summary Stats */}
          {mismatchData && (
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="rounded-md border bg-muted/30 p-3 text-center">
                <p className="text-2xl font-bold">{mismatchData.total ?? 0}</p>
                <p className="text-xs text-muted-foreground">Total Mismatches</p>
              </div>
              <div className="rounded-md border bg-green-50 dark:bg-green-900/20 p-3 text-center">
                <p className="text-2xl font-bold text-green-700">
                  {mismatchData.total > 0
                    ? Math.round(
                        ((mismatchData.mismatches ?? []).filter((m) => m.deviation_acknowledged).length /
                          mismatchData.total) *
                          100
                      )
                    : 0}%
                </p>
                <p className="text-xs text-muted-foreground">Acknowledged</p>
              </div>
              <div className="rounded-md border bg-amber-50 dark:bg-amber-900/20 p-3 text-center">
                <p className="text-2xl font-bold text-amber-700">
                  {(mismatchData.mismatches ?? []).filter((m) => !m.deviation_acknowledged).length}
                </p>
                <p className="text-xs text-muted-foreground">Unacknowledged</p>
              </div>
            </div>
          )}
          <div className="overflow-x-auto rounded-md border">
            <Table aria-label="Risk mismatch report">
              <TableHeader>
                <TableRow>
                  <TableHead>Customer ID</TableHead>
                  <TableHead className="text-right">Product Risk Code</TableHead>
                  <TableHead className="text-right">Customer Risk Code</TableHead>
                  <TableHead>Acknowledged</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(!mismatchData || mismatchData.mismatches.length === 0) ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                      No risk mismatches found.
                    </TableCell>
                  </TableRow>
                ) : (
                  mismatchData.mismatches.map((row) => (
                    <TableRow
                      key={row.id}
                      className={row.product_risk_code > row.customer_risk_code ? 'bg-amber-50 dark:bg-amber-900/20' : ''}
                    >
                      <TableCell className="font-mono text-sm">{row.customer_id}</TableCell>
                      <TableCell className="text-right font-mono">{row.product_risk_code}</TableCell>
                      <TableCell className="text-right font-mono">{row.customer_risk_code}</TableCell>
                      <TableCell>
                        {row.deviation_acknowledged ? (
                          <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">Yes</Badge>
                        ) : (
                          <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">No</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ---- 4. Proposal Approval Queue ---- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-500" aria-hidden="true" />
            Proposal Approval Queue
          </CardTitle>
          <CardDescription>
            Investment proposals submitted for L1 supervisor review
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Pipeline date filter (G-097 — FR-036.AC3) */}
          <div className="flex items-center gap-2 mb-3">
            <input
              type="date"
              value={pipelineDateFrom}
              onChange={(e) => setPipelineDateFrom(e.target.value)}
              className="rounded-md border border-input bg-background px-2 py-1 text-xs h-7"
              aria-label="Filter proposals from date"
            />
            <span className="text-xs text-muted-foreground">to</span>
            <input
              type="date"
              value={pipelineDateTo}
              onChange={(e) => setPipelineDateTo(e.target.value)}
              className="rounded-md border border-input bg-background px-2 py-1 text-xs h-7"
              aria-label="Filter proposals to date"
            />
          </div>
          <div className="overflow-x-auto rounded-md border">
            <Table aria-label="Proposal approval queue">
              <TableHeader>
                <TableRow>
                  <TableHead>Proposal Number</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>RM Name</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {proposals.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      No proposals pending approval.
                    </TableCell>
                  </TableRow>
                ) : (
                  proposals.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-sm font-medium">{p.proposalNumber}</TableCell>
                      <TableCell>{p.customerName}</TableCell>
                      <TableCell className="text-right font-mono">{fmtCurrency(p.amount)}</TableCell>
                      <TableCell>
                        <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                          {p.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{p.rmName}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-green-700 hover:text-green-800"
                            onClick={() => approveProposalL1.mutate(p.id)}
                            disabled={approveProposalL1.isPending}
                            aria-label={`Approve proposal ${p.proposalNumber}`}
                          >
                            <CheckCircle className="h-4 w-4 mr-1" aria-hidden="true" />
                            Approve
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-red-700 hover:text-red-800"
                            onClick={() => rejectProposalL1.mutate(p.id)}
                            disabled={rejectProposalL1.isPending}
                            aria-label={`Reject proposal ${p.proposalNumber}`}
                          >
                            <XCircle className="h-4 w-4 mr-1" aria-hidden="true" />
                            Reject
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => returnProposal.mutate(p.id)}
                            disabled={returnProposal.isPending}
                            aria-label={`Return proposal ${p.proposalNumber} to RM`}
                          >
                            <RotateCcw className="h-4 w-4 mr-1" aria-hidden="true" />
                            Return
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ---- 5. Risk Distribution ---- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" aria-hidden="true" />
            Client Risk Distribution
          </CardTitle>
          <CardDescription>
            Number of clients per risk category (1-6)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* CSS Donut Chart for Risk Distribution (G-020 — FR-018.AC3) */}
          <div className="mb-6">
            {(() => {
              const total = riskDist.reduce((s: number, e: RiskDistEntry) => s + e.count, 0);
              const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#f97316', '#ef4444', '#7c3aed'];
              let cumulative = 0;
              const segments = riskDist.map((entry: RiskDistEntry, i: number) => {
                const pct = total > 0 ? (entry.count / total) * 100 : 0;
                const startPct = cumulative;
                cumulative += pct;
                return { ...entry, pct, startPct, color: COLORS[i % COLORS.length] };
              });
              const gradientParts = segments.map((s: typeof segments[0]) =>
                `${s.color} ${s.startPct.toFixed(1)}% ${(s.startPct + s.pct).toFixed(1)}%`
              ).join(', ');
              return (
                <div className="flex flex-col items-center gap-4">
                  <div
                    className="rounded-full"
                    role="img"
                    aria-label="Risk distribution donut chart"
                    style={{
                      width: 120, height: 120,
                      background: total > 0
                        ? `conic-gradient(${gradientParts})`
                        : 'conic-gradient(#e5e7eb 0% 100%)',
                      mask: 'radial-gradient(circle at 50% 50%, transparent 40%, black 41%)',
                      WebkitMask: 'radial-gradient(circle at 50% 50%, transparent 40%, black 41%)',
                    }}
                  />
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 w-full text-xs">
                    {segments.map((s: typeof segments[0]) => (
                      <div key={s.category} className="flex items-center gap-1.5">
                        <div className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
                        <span className="text-muted-foreground truncate">{s.category}</span>
                        <span className="ml-auto font-medium">{s.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Legend / table */}
          <div className="overflow-x-auto rounded-md border">
            <Table aria-label="Risk distribution breakdown">
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead className="text-right">Clients</TableHead>
                  <TableHead className="text-right">Percentage</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {riskDist.map((entry) => {
                  const pct = riskDistTotal > 0 ? (entry.count / riskDistTotal) * 100 : 0;
                  return (
                    <TableRow key={entry.code}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className={`inline-block h-3 w-3 rounded-full ${RISK_BAR_BG[entry.category] ?? 'bg-gray-400'}`} aria-hidden="true" />
                          <span className="font-medium">{entry.category}</span>
                        </div>
                      </TableCell>
                      <TableCell>{entry.code}</TableCell>
                      <TableCell className="text-right font-semibold">{entry.count.toLocaleString()}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{pct.toFixed(1)}%</TableCell>
                    </TableRow>
                  );
                })}
                <TableRow className="font-semibold bg-muted/50">
                  <TableCell colSpan={2}>Total</TableCell>
                  <TableCell className="text-right">{riskDistTotal.toLocaleString()}</TableCell>
                  <TableCell className="text-right">100%</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      {/* View Responses Dialog (G-024, G-025 — FR-020.AC2) */}
      <Dialog open={viewResponsesOpen} onOpenChange={setViewResponsesOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Assessment Responses — {viewResponsesAssessment?.customerName}</DialogTitle>
            <DialogDescription>
              Summary of the risk assessment deviation details.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2 max-h-80 overflow-y-auto">
            <p className="text-sm text-muted-foreground">Assessment Date: {viewResponsesAssessment?.assessmentDate}</p>
            <div className="rounded-md border p-3 space-y-2">
              <p className="text-sm"><span className="font-medium">Computed Category:</span> {viewResponsesAssessment?.computedCategory}</p>
              <p className="text-sm"><span className="font-medium">Deviated Category:</span> {viewResponsesAssessment?.deviatedCategory}</p>
              <p className="text-sm"><span className="font-medium">Deviation Reason:</span> {viewResponsesAssessment?.deviationReason}</p>
            </div>
            <p className="text-xs text-muted-foreground italic">Full Q&amp;A responses are available in the detailed assessment report.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewResponsesOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Assessment Dialog (G-081 — FR-020.AC4) */}
      <Dialog open={rejectAssessOpen} onOpenChange={setRejectAssessOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reject Risk Assessment</DialogTitle>
            <DialogDescription>
              Provide a mandatory reason for rejecting this deviation.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <p className="text-sm text-muted-foreground">Provide a reason for rejection:</p>
            <textarea
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              rows={3}
              value={rejectAssessComment}
              onChange={(e) => setRejectAssessComment(e.target.value)}
              placeholder="Enter rejection reason..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectAssessOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!rejectAssessComment.trim() || rejectAssessmentMut.isPending}
              onClick={() => rejectAssessId !== null && rejectAssessmentMut.mutate({ id: rejectAssessId, comments: rejectAssessComment })}
            >
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
