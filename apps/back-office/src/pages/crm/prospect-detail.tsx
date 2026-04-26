/**
 * Prospect Detail Page (CRM-PAD)
 *
 * Tabbed detail page for a single prospect with 5 tabs:
 *   Personal, Financial, Family, History, Screening.
 *
 * Supports status transition buttons (Qualify, Drop, etc.)
 * and breadcrumb navigation back to the prospect list.
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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@ui/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@ui/components/ui/tabs';
import { toast } from 'sonner';
import {
  User, Phone, Mail, MapPin, Briefcase, DollarSign,
  Users, Clock, Shield, ChevronRight, ArrowLeft,
  CheckCircle, XCircle, ArrowRight, RefreshCw,
  AlertTriangle, FileText,
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

/* ---------- Types ---------- */

interface ProspectDetail {
  id: number;
  prospect_code: string;
  first_name: string;
  last_name: string;
  middle_name: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  date_of_birth: string | null;
  nationality: string | null;
  prospect_status: string;
  assigned_rm: string | null;
  source_campaign: string | null;
  source_lead_id: number | null;
  aum_potential: string | null;
  created_at: string;
  updated_at: string;
  // Addresses
  addresses: Address[];
  // Financial
  annual_income: string | null;
  net_worth: string | null;
  employer: string | null;
  occupation: string | null;
  tax_id: string | null;
  tax_residency: string | null;
  // Screening
  sanctions_status: string | null;
  negative_list_cleared: boolean | null;
  last_screening_date: string | null;
  screening_notes: string | null;
}

interface Address {
  id: number;
  address_type: string;
  line_1: string;
  line_2: string | null;
  city: string;
  province: string | null;
  postal_code: string | null;
  country: string;
}

interface FamilyMember {
  id: number;
  name: string;
  relationship: string;
  date_of_birth: string | null;
  contact: string | null;
  is_beneficiary: boolean;
}

interface HistoryEntry {
  id: number;
  event_type: string;
  description: string;
  performed_by: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

/* ---------- Constants ---------- */

const statusColors: Record<string, string> = {
  NEW: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  CONTACTED: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200',
  QUALIFIED: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  PROPOSAL_SENT: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  ONBOARDING: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  WON: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  LOST: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

const sanctionsStatusColors: Record<string, string> = {
  CLEARED: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  FLAGGED: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  PENDING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  NOT_SCREENED: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
};

const historyEventColors: Record<string, string> = {
  STATUS_CHANGE: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  NOTE_ADDED: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
  MEETING: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  CALL: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200',
  EMAIL: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  SCREENING: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  DOCUMENT: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
};

// Status transitions: which statuses can be reached from the current status
const statusTransitions: Record<string, { label: string; target: string; variant: 'default' | 'destructive' | 'outline' }[]> = {
  NEW: [
    { label: 'Mark Contacted', target: 'CONTACTED', variant: 'default' },
    { label: 'Drop', target: 'LOST', variant: 'destructive' },
  ],
  CONTACTED: [
    { label: 'Qualify', target: 'QUALIFIED', variant: 'default' },
    { label: 'Drop', target: 'LOST', variant: 'destructive' },
  ],
  QUALIFIED: [
    { label: 'Send Proposal', target: 'PROPOSAL_SENT', variant: 'default' },
    { label: 'Drop', target: 'LOST', variant: 'destructive' },
  ],
  PROPOSAL_SENT: [
    { label: 'Begin Onboarding', target: 'ONBOARDING', variant: 'default' },
    { label: 'Drop', target: 'LOST', variant: 'destructive' },
  ],
  ONBOARDING: [
    { label: 'Mark Won', target: 'WON', variant: 'default' },
    { label: 'Drop', target: 'LOST', variant: 'destructive' },
  ],
  LOST: [
    { label: 'Re-engage', target: 'NEW', variant: 'outline' },
  ],
  WON: [],
};

/* ---------- Component ---------- */

export default function ProspectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('personal');
  const [transitionOpen, setTransitionOpen] = useState(false);
  const [transitionTarget, setTransitionTarget] = useState('');
  const [transitionReason, setTransitionReason] = useState('');

  /* ---- Queries ---- */

  const { data: prospect, isPending: prospectPending, isError: prospectError } = useQuery<ProspectDetail>({
    queryKey: ['prospect-detail', id],
    queryFn: () => fetcher(`/api/v1/prospects/${id}`),
    enabled: !!id,
  });

  const { data: familyData, isPending: familyPending } = useQuery<{ data: FamilyMember[] }>({
    queryKey: ['prospect-family', id],
    queryFn: () => fetcher(`/api/v1/prospects/${id}/family`),
    enabled: !!id && activeTab === 'family',
  });

  const { data: historyData, isPending: historyPending } = useQuery<{ data: HistoryEntry[] }>({
    queryKey: ['prospect-history', id],
    queryFn: () => fetcher(`/api/v1/prospects/${id}/history`),
    enabled: !!id && activeTab === 'history',
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['prospect-detail', id] });
    queryClient.invalidateQueries({ queryKey: ['prospect-history', id] });
  };

  /* ---- Mutations ---- */

  const transitionMutation = useMutation({
    mutationFn: ({ target, reason }: { target: string; reason?: string }) =>
      fetch(`${MGMT_API}/prospects/${id}/transition`, {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
        body: JSON.stringify({ status: target, reason }),
      }).then((r) => {
        if (!r.ok) return r.json().then((e: { error?: string }) => { throw new Error(e.error || 'Transition failed'); });
        return r.json();
      }),
    onSuccess: (_data: unknown, vars: { target: string; reason?: string }) => {
      invalidateAll();
      setTransitionOpen(false);
      setTransitionReason('');
      toast.success(`Prospect status changed to ${vars.target.replace(/_/g, ' ')}`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const rescreenMutation = useMutation({
    mutationFn: () =>
      fetch(`${MGMT_API}/prospects/${id}/rescreen`, {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
      }).then((r) => {
        if (!r.ok) return r.json().then((e: { error?: string }) => { throw new Error(e.error || 'Re-screen failed'); });
        return r.json();
      }),
    onSuccess: () => {
      invalidateAll();
      toast.success('Re-screening initiated');
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

  function handleTransitionClick(target: string) {
    if (target === 'LOST') {
      setTransitionTarget(target);
      setTransitionReason('');
      setTransitionOpen(true);
    } else {
      transitionMutation.mutate({ target });
    }
  }

  /* ---- Loading state ---- */

  if (prospectPending) {
    return (
      <div className="space-y-6">
        <div className="h-6 w-64 animate-pulse rounded bg-muted" />
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-6 space-y-3">
                {Array.from({ length: 3 }).map((_, j) => (
                  <div key={j} className="h-4 w-full animate-pulse rounded bg-muted" />
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (prospectError || !prospect) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center">
        <User className="h-12 w-12 text-muted-foreground/50" />
        <h2 className="text-xl font-semibold">Prospect Not Found</h2>
        <p className="text-muted-foreground">The prospect you are looking for does not exist or could not be loaded.</p>
        <Link to="/crm/prospects">
          <Button variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Prospects
          </Button>
        </Link>
      </div>
    );
  }

  const family = familyData?.data ?? [];
  const history = historyData?.data ?? [];
  const transitions = statusTransitions[prospect.prospect_status] ?? [];

  /* ---- Render ---- */

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-sm text-muted-foreground">
        <Link to="/crm/prospects" className="hover:text-foreground transition-colors">
          Prospects
        </Link>
        <ChevronRight className="h-4 w-4" />
        <span className="text-foreground font-medium">
          {prospect.first_name} {prospect.last_name}
        </span>
      </nav>

      {/* Header with status and actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">
              {prospect.first_name} {prospect.middle_name ? `${prospect.middle_name} ` : ''}{prospect.last_name}
            </h1>
            <Badge className={statusColors[prospect.prospect_status] || ''} variant="secondary">
              {prospect.prospect_status.replace(/_/g, ' ')}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {prospect.prospect_code}
            {prospect.assigned_rm && (
              <> &middot; RM: {prospect.assigned_rm}</>
            )}
            {prospect.source_campaign && (
              <> &middot; Source: {prospect.source_campaign}</>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {transitions.map((t: typeof transitions[number]) => (
            <Button
              key={t.target}
              size="sm"
              variant={t.variant}
              disabled={transitionMutation.isPending}
              onClick={() => handleTransitionClick(t.target)}
            >
              {t.target === 'LOST' ? (
                <XCircle className="mr-1 h-4 w-4" />
              ) : t.target === 'WON' ? (
                <CheckCircle className="mr-1 h-4 w-4" />
              ) : (
                <ArrowRight className="mr-1 h-4 w-4" />
              )}
              {transitionMutation.isPending ? 'Processing...' : t.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v: string) => setActiveTab(v)}>
        <TabsList>
          <TabsTrigger value="personal">Personal</TabsTrigger>
          <TabsTrigger value="financial">Financial</TabsTrigger>
          <TabsTrigger value="family">Family</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="screening">Screening</TabsTrigger>
        </TabsList>

        {/* Personal Tab */}
        <TabsContent value="personal" className="mt-4 space-y-6">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <User className="h-4 w-4" /> Personal Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Full Name</span>
                  <span className="font-medium">
                    {prospect.first_name} {prospect.middle_name ? `${prospect.middle_name} ` : ''}{prospect.last_name}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Date of Birth</span>
                  <span>{formatDate(prospect.date_of_birth)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Nationality</span>
                  <span>{prospect.nationality ?? '-'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Prospect Code</span>
                  <span className="font-mono">{prospect.prospect_code}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Phone className="h-4 w-4" /> Contact Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Email</span>
                  <span>
                    {prospect.email ? (
                      <span className="flex items-center gap-1">
                        <Mail className="h-3 w-3 text-muted-foreground" />
                        {prospect.email}
                      </span>
                    ) : '-'}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Phone</span>
                  <span>
                    {prospect.phone ? (
                      <span className="flex items-center gap-1">
                        <Phone className="h-3 w-3 text-muted-foreground" />
                        {prospect.phone}
                      </span>
                    ) : '-'}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Mobile</span>
                  <span>{prospect.mobile ?? '-'}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Addresses */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <MapPin className="h-4 w-4" /> Addresses
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!prospect.addresses || prospect.addresses.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2">
                  <MapPin className="h-8 w-8 text-muted-foreground/50" />
                  <p className="text-sm">No addresses on file</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {prospect.addresses.map((addr: Address) => (
                    <div key={addr.id} className="rounded-md border p-4 space-y-1">
                      <Badge variant="outline" className="mb-2">{addr.address_type}</Badge>
                      <p className="text-sm">{addr.line_1}</p>
                      {addr.line_2 && <p className="text-sm">{addr.line_2}</p>}
                      <p className="text-sm">
                        {addr.city}{addr.province ? `, ${addr.province}` : ''} {addr.postal_code ?? ''}
                      </p>
                      <p className="text-sm text-muted-foreground">{addr.country}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Financial Tab */}
        <TabsContent value="financial" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <DollarSign className="h-4 w-4" /> Financial Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Annual Income</span>
                    <span className="font-mono">
                      {prospect.annual_income
                        ? parseFloat(prospect.annual_income).toLocaleString('en-PH', { minimumFractionDigits: 2 })
                        : '-'}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Net Worth</span>
                    <span className="font-mono">
                      {prospect.net_worth
                        ? parseFloat(prospect.net_worth).toLocaleString('en-PH', { minimumFractionDigits: 2 })
                        : '-'}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">AUM Potential</span>
                    <span className="font-mono">
                      {prospect.aum_potential
                        ? parseFloat(prospect.aum_potential).toLocaleString('en-PH', { minimumFractionDigits: 2 })
                        : '-'}
                    </span>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Employer</span>
                    <span>{prospect.employer ?? '-'}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Occupation</span>
                    <span>{prospect.occupation ?? '-'}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Tax ID</span>
                    <span className="font-mono">{prospect.tax_id ?? '-'}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Tax Residency</span>
                    <span>{prospect.tax_residency ?? '-'}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Family Tab */}
        <TabsContent value="family" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4" /> Family Members
              </CardTitle>
            </CardHeader>
            <CardContent>
              {familyPending ? (
                <div className="rounded-md border overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Relationship</TableHead>
                        <TableHead>Date of Birth</TableHead>
                        <TableHead>Contact</TableHead>
                        <TableHead>Beneficiary</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody><SkeletonRows cols={5} rows={3} /></TableBody>
                  </Table>
                </div>
              ) : family.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                  <Users className="h-10 w-10 text-muted-foreground/50" />
                  <p>No family members on file</p>
                </div>
              ) : (
                <div className="rounded-md border overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Relationship</TableHead>
                        <TableHead>Date of Birth</TableHead>
                        <TableHead>Contact</TableHead>
                        <TableHead>Beneficiary</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {family.map((member: FamilyMember) => (
                        <TableRow key={member.id}>
                          <TableCell className="font-medium">{member.name}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{member.relationship}</Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatDate(member.date_of_birth)}
                          </TableCell>
                          <TableCell>{member.contact ?? <span className="text-muted-foreground">-</span>}</TableCell>
                          <TableCell>
                            {member.is_beneficiary ? (
                              <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" variant="secondary">
                                Yes
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">No</span>
                            )}
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

        {/* History Tab */}
        <TabsContent value="history" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4" /> Interaction & Status History
              </CardTitle>
            </CardHeader>
            <CardContent>
              {historyPending ? (
                <div className="space-y-4">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex gap-4 items-start">
                      <div className="h-8 w-8 animate-pulse rounded-full bg-muted flex-shrink-0" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 w-48 animate-pulse rounded bg-muted" />
                        <div className="h-3 w-32 animate-pulse rounded bg-muted" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : history.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                  <Clock className="h-10 w-10 text-muted-foreground/50" />
                  <p>No history entries yet</p>
                </div>
              ) : (
                <div className="relative">
                  {/* Timeline line */}
                  <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />

                  <div className="space-y-6">
                    {history.map((entry: HistoryEntry) => (
                      <div key={entry.id} className="flex gap-4 items-start relative">
                        {/* Timeline dot */}
                        <div className="z-10 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-background border-2 border-border">
                          {entry.event_type === 'STATUS_CHANGE' && <ArrowRight className="h-3 w-3 text-blue-600" />}
                          {entry.event_type === 'MEETING' && <Users className="h-3 w-3 text-purple-600" />}
                          {entry.event_type === 'CALL' && <Phone className="h-3 w-3 text-cyan-600" />}
                          {entry.event_type === 'EMAIL' && <Mail className="h-3 w-3 text-blue-600" />}
                          {entry.event_type === 'SCREENING' && <Shield className="h-3 w-3 text-orange-600" />}
                          {entry.event_type === 'DOCUMENT' && <FileText className="h-3 w-3 text-green-600" />}
                          {entry.event_type === 'NOTE_ADDED' && <FileText className="h-3 w-3 text-gray-600" />}
                        </div>
                        <div className="flex-1 pb-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge
                              className={historyEventColors[entry.event_type] || 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'}
                              variant="secondary"
                            >
                              {entry.event_type.replace(/_/g, ' ')}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {formatDateTime(entry.created_at)}
                            </span>
                          </div>
                          <p className="text-sm mt-1">{entry.description}</p>
                          {entry.performed_by && (
                            <p className="text-xs text-muted-foreground mt-1">
                              By: {entry.performed_by}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Screening Tab */}
        <TabsContent value="screening" className="mt-4 space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="h-4 w-4" /> Screening & Compliance
              </CardTitle>
              <Button
                size="sm"
                variant="outline"
                disabled={rescreenMutation.isPending}
                onClick={() => rescreenMutation.mutate()}
              >
                <RefreshCw className={`mr-1 h-4 w-4 ${rescreenMutation.isPending ? 'animate-spin' : ''}`} />
                {rescreenMutation.isPending ? 'Screening...' : 'Re-screen'}
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Sanctions Status</span>
                    <Badge
                      className={sanctionsStatusColors[prospect.sanctions_status ?? 'NOT_SCREENED'] || ''}
                      variant="secondary"
                    >
                      {(prospect.sanctions_status ?? 'NOT SCREENED').replace(/_/g, ' ')}
                    </Badge>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Negative List Cleared</span>
                    {prospect.negative_list_cleared === null ? (
                      <span className="text-muted-foreground">Not checked</span>
                    ) : prospect.negative_list_cleared ? (
                      <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" variant="secondary">
                        <CheckCircle className="mr-1 h-3 w-3" /> Cleared
                      </Badge>
                    ) : (
                      <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" variant="secondary">
                        <AlertTriangle className="mr-1 h-3 w-3" /> Flagged
                      </Badge>
                    )}
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Last Screening Date</span>
                    <span>{formatDate(prospect.last_screening_date)}</span>
                  </div>
                </div>
              </div>

              {prospect.screening_notes && (
                <div className="pt-4 border-t">
                  <p className="text-sm text-muted-foreground mb-1">Screening Notes</p>
                  <p className="text-sm">{prospect.screening_notes}</p>
                </div>
              )}

              {prospect.sanctions_status === 'FLAGGED' && (
                <div className="flex items-center gap-3 rounded-md border border-red-300 bg-red-50 px-4 py-3 dark:border-red-800 dark:bg-red-950/30">
                  <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-500 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-red-800 dark:text-red-300">
                      Sanctions Flag Detected
                    </p>
                    <p className="text-sm text-red-700 dark:text-red-400">
                      This prospect has been flagged during sanctions screening. Please review before proceeding
                      with any status changes.
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Status Transition Confirmation Dialog (for drops with reason) */}
      <Dialog open={transitionOpen} onOpenChange={setTransitionOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Drop Prospect</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to mark this prospect as Lost? Please provide a reason.
            </p>
            <div>
              <label className="text-sm font-medium">Reason *</label>
              <Input
                placeholder="Enter reason for dropping this prospect"
                value={transitionReason}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTransitionReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransitionOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!transitionReason.trim() || transitionMutation.isPending}
              onClick={() =>
                transitionMutation.mutate({
                  target: transitionTarget,
                  reason: transitionReason,
                })
              }
            >
              <XCircle className="mr-1 h-4 w-4" />
              {transitionMutation.isPending ? 'Processing...' : 'Confirm Drop'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
