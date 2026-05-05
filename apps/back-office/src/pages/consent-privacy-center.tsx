/**
 * Data Privacy & Consent Center — Enterprise-grade
 *
 * DPA R.A. 10173 compliance center for managing client consents,
 * data erasure requests, and privacy breach lifecycle workflows.
 *
 * API endpoints:
 *   GET  /api/v1/consent/client/{clientId}           - Client consents
 *   GET  /api/v1/consent/erasure-queue               - Erasure queue
 *   GET  /api/v1/privacy-breaches?pageSize=25        - Breach list
 *   POST /api/v1/consent                             - Grant consent
 *   PUT  /api/v1/consent/{consentId}/withdraw        - Withdraw consent
 *   POST /api/v1/consent/erasure/{clientId}          - Request erasure
 *   POST /api/v1/consent/erasure/{clientId}/process  - Process erasure
 *   POST /api/v1/privacy-breaches                    - Report breach
 *   POST /api/v1/privacy-breaches/{id}/containment   - Contain breach
 *   POST /api/v1/privacy-breaches/{id}/notify-npc    - Notify NPC
 *   POST /api/v1/privacy-breaches/{id}/notify-data-subjects - Notify subjects
 *   POST /api/v1/privacy-breaches/{id}/close         - Close breach
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
  AlertTriangle, CheckCircle2, FileCheck, Plus, Send, Shield, UserX,
  Clock, Search, ShieldCheck, ShieldAlert, Trash2, ChevronDown, ChevronUp,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Consent {
  consent_id: string;
  client_id: string;
  purpose: string;
  channel_scope: string[];
  legal_basis: string;
  granted: boolean;
  granted_at?: string;
  withdrawn_at?: string;
  expires_at?: string;
}

interface ErasureRequest {
  clientId: string;
  requestedAt: string;
  deadline: string;
  daysRemaining: number;
  overdue: boolean;
  status?: string;
}

interface PrivacyBreach {
  breach_id: string;
  title: string;
  breach_type: string;
  breach_status: string;
  affected_count: number;
  containment_status?: string;
  npc_notification_required: boolean;
  npc_deadline?: string;
  npc_notified_at?: string;
  data_subject_notification_required: boolean;
  data_subject_notification_deadline?: string;
  data_subject_notified_at?: string;
  reported_at?: string;
  contained_at?: string;
  closed_at?: string;
  sensitive_personal_information?: boolean;
  data_categories?: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CONSENT_TYPES = ['MARKETING', 'DATA_SHARING', 'ANALYTICS', 'PROFILING', 'CROSS_BORDER'] as const;
const CONSENT_CHANNELS = ['BRANCH', 'ONLINE', 'MOBILE', 'EMAIL'] as const;
const LEGAL_BASES = ['CONSENT', 'CONTRACT', 'LEGAL_OBLIGATION', 'LEGITIMATE_INTEREST'] as const;
const BREACH_TYPES = ['PERSONAL_DATA_BREACH', 'UNAUTHORIZED_DISCLOSURE', 'DATA_LOSS', 'SYSTEM_INTRUSION'] as const;

const PURPOSE_COLORS: Record<string, string> = {
  MARKETING: 'bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200',
  DATA_SHARING: 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200',
  ANALYTICS: 'bg-cyan-100 dark:bg-cyan-900 text-cyan-800 dark:text-cyan-200',
  PROFILING: 'bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200',
  CROSS_BORDER: 'bg-indigo-100 dark:bg-indigo-900 text-indigo-800 dark:text-indigo-200',
  OPERATIONAL: 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200',
  AUTOMATED_DECISION: 'bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200',
  RESEARCH_AGGREGATE: 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200',
};

const BREACH_STATUS_CONFIG: Record<string, { class: string; label: string }> = {
  DETECTED: { class: 'bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200', label: 'Detected' },
  TRIAGED: { class: 'bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200', label: 'Triaged' },
  REPORTED: { class: 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200', label: 'Reported' },
  CONTAINED: { class: 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200', label: 'Contained' },
  NPC_NOTIFIED: { class: 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200', label: 'NPC Notified' },
  DATA_SUBJECT_NOTIFIED: { class: 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200', label: 'Subjects Notified' },
  CLOSED: { class: 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200', label: 'Closed' },
};

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200',
  HIGH: 'bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200',
  MEDIUM: 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200',
  LOW: 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso?: string): string {
  if (!iso) return '--';
  return new Date(iso).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateTime(iso?: string): string {
  if (!iso) return '--';
  return new Date(iso).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function ConsentPrivacyCenter() {
  const queryClient = useQueryClient();

  // --- Search state ---
  const [clientId, setClientId] = useState('');
  const [searchedClient, setSearchedClient] = useState('');
  const [consentTypeFilter, setConsentTypeFilter] = useState<string>('ALL');

  // --- Dialog state ---
  const [grantOpen, setGrantOpen] = useState(false);
  const [grantData, setGrantData] = useState({
    clientId: '',
    purpose: '',
    channelScope: ['EMAIL', 'SMS'] as string[],
    legalBasis: '',
    dpaRef: 'R.A. 10173',
    expiresAt: '',
  });

  const [breachOpen, setBreachOpen] = useState(false);
  const [breachData, setBreachData] = useState({
    title: '',
    breach_type: 'PERSONAL_DATA_BREACH',
    affected_count: '1',
    data_categories: 'TIN, ACCOUNT_NUMBER',
    sensitive_personal_information: true,
    real_risk_of_serious_harm: true,
  });

  const [processConfirmOpen, setProcessConfirmOpen] = useState(false);
  const [processTarget, setProcessTarget] = useState<string | null>(null);

  // --- Expanded breach rows ---
  const [expandedBreaches, setExpandedBreaches] = useState<Set<string>>(new Set());

  // --- Queries ---
  const { data: consentsResp } = useQuery<{ data: Consent[] }>({
    queryKey: ['consents', searchedClient],
    queryFn: () => apiRequest('GET', apiUrl(`/api/v1/consent/client/${searchedClient}`)),
    enabled: !!searchedClient,
  });

  const { data: erasureResp } = useQuery<{ data: ErasureRequest[]; total?: number }>({
    queryKey: ['erasure-queue'],
    queryFn: () => apiRequest('GET', apiUrl('/api/v1/consent/erasure-queue')),
  });

  const { data: breachesResp } = useQuery<{ data: PrivacyBreach[] }>({
    queryKey: ['privacy-breaches'],
    queryFn: () => apiRequest('GET', apiUrl('/api/v1/privacy-breaches?pageSize=25')),
  });

  // --- Derived data ---
  const allConsents = consentsResp?.data ?? [];
  const filteredConsents = useMemo(() => {
    if (consentTypeFilter === 'ALL') return allConsents;
    return allConsents.filter(c => c.purpose === consentTypeFilter);
  }, [allConsents, consentTypeFilter]);

  const erasureQueue = erasureResp?.data ?? [];
  const breachRows = breachesResp?.data ?? [];

  const activeConsents = allConsents.filter(c => c.granted).length;
  const pendingErasures = erasureQueue.filter(e => !e.overdue).length;
  const overdueErasures = erasureQueue.filter(e => e.overdue).length;
  const openBreaches = breachRows.filter(b => b.breach_status !== 'CLOSED').length;

  const overdueBreachTimers = useMemo(() => {
    return breachRows.filter((b) => {
      if (b.breach_status === 'CLOSED') return false;
      const now = Date.now();
      const npcOverdue = b.npc_notification_required && !b.npc_notified_at && b.npc_deadline && new Date(b.npc_deadline).getTime() < now;
      const dsOverdue = b.data_subject_notification_required && !b.data_subject_notified_at && b.data_subject_notification_deadline && new Date(b.data_subject_notification_deadline).getTime() < now;
      return npcOverdue || dsOverdue;
    }).length;
  }, [breachRows]);

  // --- Mutations ---
  const grantMutation = useMutation({
    mutationFn: (data: typeof grantData) =>
      apiRequest('POST', apiUrl('/api/v1/consent'), {
        clientId: data.clientId,
        purpose: data.purpose,
        channelScope: data.channelScope,
        legalBasis: data.legalBasis,
        dpaRef: data.dpaRef,
        expiresAt: data.expiresAt || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['consents'] });
      setGrantOpen(false);
      setGrantData({ clientId: '', purpose: '', channelScope: ['EMAIL', 'SMS'], legalBasis: '', dpaRef: 'R.A. 10173', expiresAt: '' });
      toast.success('Consent granted successfully');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const withdrawMutation = useMutation({
    mutationFn: (consentId: string) =>
      apiRequest('PUT', apiUrl(`/api/v1/consent/${consentId}/withdraw`)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['consents'] });
      toast.success('Consent withdrawn');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const erasureMutation = useMutation({
    mutationFn: (cId: string) =>
      apiRequest('POST', apiUrl(`/api/v1/consent/erasure/${cId}`)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['erasure-queue'] });
      toast.success('Erasure request submitted');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const processErasureMutation = useMutation({
    mutationFn: (cId: string) =>
      apiRequest('POST', apiUrl(`/api/v1/consent/erasure/${cId}/process`)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['erasure-queue'] });
      setProcessConfirmOpen(false);
      setProcessTarget(null);
      toast.success('Erasure processed successfully');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const reportBreachMutation = useMutation({
    mutationFn: () =>
      apiRequest('POST', apiUrl('/api/v1/privacy-breaches'), {
        title: breachData.title,
        breach_type: breachData.breach_type,
        affected_count: Number(breachData.affected_count),
        data_categories: breachData.data_categories.split(',').map(v => v.trim()).filter(Boolean),
        sensitive_personal_information: breachData.sensitive_personal_information,
        real_risk_of_serious_harm: breachData.real_risk_of_serious_harm,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['privacy-breaches'] });
      setBreachOpen(false);
      setBreachData({ title: '', breach_type: 'PERSONAL_DATA_BREACH', affected_count: '1', data_categories: 'TIN, ACCOUNT_NUMBER', sensitive_personal_information: true, real_risk_of_serious_harm: true });
      toast.success('Privacy breach incident reported');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const breachActionMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'containment' | 'notify-npc' | 'notify-data-subjects' | 'close' }) => {
      const payloads: Record<string, unknown> = {
        containment: {
          containment_log: 'Access path contained and evidence preserved by privacy response team',
          evidence: { source: 'PRIVACY_CENTER', recorded_at: new Date().toISOString() },
        },
        'notify-npc': {
          reference: `NPC-${id}-${Date.now()}`,
          payload: { breach_id: id, submitted_from: 'PRIVACY_CENTER' },
        },
        'notify-data-subjects': {
          reference: `CLIENT-NOTICE-${id}-${Date.now()}`,
          channel: 'SECURE_CLIENT_NOTICE',
          payload: { breach_id: id, submitted_from: 'PRIVACY_CENTER' },
        },
        close: {
          root_cause: 'Privacy incident response completed with documented root cause',
          corrective_actions: ['Evidence reviewed by DPO', 'Preventive controls confirmed'],
          residual_risk: 'LOW',
          notes: 'DPO closure recorded after containment and notification evidence review',
        },
      };
      return apiRequest('POST', apiUrl(`/api/v1/privacy-breaches/${id}/${action}`), payloads[action]);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['privacy-breaches'] });
      toast.success('Breach workflow updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // --- Handlers ---
  function handleSearch() {
    if (clientId.trim()) setSearchedClient(clientId.trim());
  }

  function toggleBreachExpanded(breachId: string) {
    setExpandedBreaches(prev => {
      const next = new Set(prev);
      if (next.has(breachId)) next.delete(breachId);
      else next.add(breachId);
      return next;
    });
  }

  function openProcessConfirm(cId: string) {
    setProcessTarget(cId);
    setProcessConfirmOpen(true);
  }

  // --- Render ---
  return (
    <div className="space-y-6 p-1">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">Data Privacy & Consent Center</h1>
            <Badge variant="outline" className="text-xs bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 border-green-300">
              <ShieldCheck className="h-3 w-3 mr-1" /> DPA R.A. 10173
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1">Consent management, erasure workflows, and breach lifecycle tracking</p>
        </div>
        <Dialog open={grantOpen} onOpenChange={setGrantOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="mr-2 h-4 w-4" /> Grant Consent</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader><DialogTitle>Grant Client Consent</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Client ID *</Label>
                <Input placeholder="Enter client ID" value={grantData.clientId} onChange={e => setGrantData(d => ({ ...d, clientId: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Consent Type *</Label>
                <Select value={grantData.purpose} onValueChange={v => setGrantData(d => ({ ...d, purpose: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select consent type" /></SelectTrigger>
                  <SelectContent>
                    {CONSENT_TYPES.map(t => <SelectItem key={t} value={t}>{t.replace(/_/g, ' ')}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Channel</Label>
                <Select value={grantData.channelScope[0] || ''} onValueChange={v => setGrantData(d => ({ ...d, channelScope: [v] }))}>
                  <SelectTrigger><SelectValue placeholder="Select channel" /></SelectTrigger>
                  <SelectContent>
                    {CONSENT_CHANNELS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Legal Basis *</Label>
                <Select value={grantData.legalBasis} onValueChange={v => setGrantData(d => ({ ...d, legalBasis: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select legal basis" /></SelectTrigger>
                  <SelectContent>
                    {LEGAL_BASES.map(l => <SelectItem key={l} value={l}>{l.replace(/_/g, ' ')}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Expires At (optional)</Label>
                <Input type="date" value={grantData.expiresAt} onChange={e => setGrantData(d => ({ ...d, expiresAt: e.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setGrantOpen(false)}>Cancel</Button>
              <Button
                onClick={() => grantMutation.mutate(grantData)}
                disabled={!grantData.clientId || !grantData.purpose || !grantData.legalBasis || grantMutation.isPending}
              >
                {grantMutation.isPending ? 'Granting...' : 'Grant Consent'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="flex items-center gap-3 pt-6">
            <Shield className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            <div>
              <p className="text-2xl font-bold">{allConsents.length}</p>
              <p className="text-sm text-muted-foreground">Total Consents</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-green-500">
          <CardContent className="flex items-center gap-3 pt-6">
            <FileCheck className="h-8 w-8 text-green-600 dark:text-green-400" />
            <div>
              <p className="text-2xl font-bold">{activeConsents}</p>
              <p className="text-sm text-muted-foreground">Active Consents</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-yellow-500">
          <CardContent className="flex items-center gap-3 pt-6">
            <UserX className="h-8 w-8 text-yellow-600 dark:text-yellow-400" />
            <div>
              <p className="text-2xl font-bold">{pendingErasures}</p>
              <p className="text-sm text-muted-foreground">Pending Erasures</p>
            </div>
          </CardContent>
        </Card>

        <Card className={`border-l-4 ${overdueErasures > 0 ? 'border-l-red-500' : 'border-l-green-500'}`}>
          <CardContent className="flex items-center gap-3 pt-6">
            <Clock className={`h-8 w-8 ${overdueErasures > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`} />
            <div>
              <p className={`text-2xl font-bold ${overdueErasures > 0 ? 'text-red-600 dark:text-red-400' : ''}`}>{overdueErasures}</p>
              <p className="text-sm text-muted-foreground">Overdue Erasures</p>
            </div>
          </CardContent>
        </Card>

        <Card className={`border-l-4 ${openBreaches > 0 ? 'border-l-red-500' : 'border-l-green-500'}`}>
          <CardContent className="flex items-center gap-3 pt-6">
            <ShieldAlert className={`h-8 w-8 ${openBreaches > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`} />
            <div>
              <p className={`text-2xl font-bold ${openBreaches > 0 ? 'text-red-600 dark:text-red-400' : ''}`}>{openBreaches}</p>
              <p className="text-sm text-muted-foreground">Open Breaches</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="consents">
        <TabsList>
          <TabsTrigger value="consents">
            <Shield className="mr-1.5 h-4 w-4" /> Client Consents
          </TabsTrigger>
          <TabsTrigger value="erasure">
            <Trash2 className="mr-1.5 h-4 w-4" /> Erasure Queue
            {overdueErasures > 0 && <Badge variant="destructive" className="ml-2 text-[10px] px-1.5">{overdueErasures}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="breaches">
            <AlertTriangle className="mr-1.5 h-4 w-4" /> Breach Management
            {openBreaches > 0 && <Badge variant="destructive" className="ml-2 text-[10px] px-1.5">{openBreaches}</Badge>}
          </TabsTrigger>
        </TabsList>

        {/* Client Consents Tab */}
        <TabsContent value="consents" className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Input
                placeholder="Enter Client ID"
                value={clientId}
                onChange={e => setClientId(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                className="w-56"
              />
              <Button variant="outline" onClick={handleSearch}>
                <Search className="h-4 w-4 mr-1" /> Search
              </Button>
            </div>
            <Select value={consentTypeFilter} onValueChange={setConsentTypeFilter}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Filter type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Types</SelectItem>
                {CONSENT_TYPES.map(t => <SelectItem key={t} value={t}>{t.replace(/_/g, ' ')}</SelectItem>)}
              </SelectContent>
            </Select>
            {searchedClient && (
              <Button variant="destructive" size="sm" onClick={() => erasureMutation.mutate(searchedClient)}>
                <UserX className="h-4 w-4 mr-1" /> Request Erasure
              </Button>
            )}
          </div>

          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted">
                  <TableHead className="font-semibold">Client ID</TableHead>
                  <TableHead className="font-semibold">Consent Type</TableHead>
                  <TableHead className="font-semibold">Channel</TableHead>
                  <TableHead className="font-semibold">Legal Basis</TableHead>
                  <TableHead className="font-semibold">Status</TableHead>
                  <TableHead className="font-semibold">Granted</TableHead>
                  <TableHead className="font-semibold">Expires</TableHead>
                  <TableHead className="font-semibold text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredConsents.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-12">
                      {searchedClient ? 'No consents found for this client' : 'Search for a client to view consents'}
                    </TableCell>
                  </TableRow>
                )}
                {filteredConsents.map((c) => (
                  <TableRow key={c.consent_id}>
                    <TableCell className="font-mono text-xs">{c.client_id || searchedClient}</TableCell>
                    <TableCell>
                      <Badge className={PURPOSE_COLORS[c.purpose] || 'bg-muted'}>{c.purpose}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {Array.isArray(c.channel_scope) ? c.channel_scope.join(', ') : '--'}
                    </TableCell>
                    <TableCell className="text-xs">{c.legal_basis}</TableCell>
                    <TableCell>
                      <Badge className={c.granted
                        ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
                        : 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200'}>
                        {c.granted ? 'Active' : 'Withdrawn'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{formatDate(c.granted_at)}</TableCell>
                    <TableCell className="text-xs">{formatDate(c.expires_at)}</TableCell>
                    <TableCell className="text-right">
                      {c.granted && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => withdrawMutation.mutate(c.consent_id)}
                          disabled={withdrawMutation.isPending}
                        >
                          Withdraw
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* Erasure Queue Tab */}
        <TabsContent value="erasure" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Data Erasure Requests — DPA 30-day compliance window
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted">
                      <TableHead className="font-semibold">Client ID</TableHead>
                      <TableHead className="font-semibold">Request Date</TableHead>
                      <TableHead className="font-semibold">Deadline</TableHead>
                      <TableHead className="font-semibold">Days Remaining</TableHead>
                      <TableHead className="font-semibold">Status</TableHead>
                      <TableHead className="font-semibold text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {erasureQueue.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-12">
                          <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
                          No erasure requests pending
                        </TableCell>
                      </TableRow>
                    )}
                    {erasureQueue.map((e) => (
                      <TableRow key={e.clientId} className={e.overdue ? 'bg-red-50/50 dark:bg-red-950/30' : ''}>
                        <TableCell className="font-mono text-sm">{e.clientId}</TableCell>
                        <TableCell className="text-xs">{formatDate(e.requestedAt)}</TableCell>
                        <TableCell className="text-xs">{formatDate(e.deadline)}</TableCell>
                        <TableCell>
                          <Badge className={
                            e.overdue
                              ? 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200'
                              : e.daysRemaining <= 7
                                ? 'bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200'
                                : 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
                          }>
                            {e.overdue ? `OVERDUE (${Math.abs(e.daysRemaining)}d)` : `${e.daysRemaining} days`}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={e.overdue ? 'destructive' : 'outline'}>
                            {e.status || (e.overdue ? 'OVERDUE' : 'PENDING')}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openProcessConfirm(e.clientId)}
                          >
                            Process
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

        {/* Breach Management Tab */}
        <TabsContent value="breaches" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Privacy Breach Playbook</h2>
              <p className="text-sm text-muted-foreground">
                NPC 72-hour notification deadline and data-subject notification tracking
              </p>
            </div>
            <Dialog open={breachOpen} onOpenChange={setBreachOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="destructive">
                  <AlertTriangle className="mr-2 h-4 w-4" /> Report Breach
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader><DialogTitle>Report Privacy Breach</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Incident Title *</Label>
                    <Input placeholder="Brief description of the breach" value={breachData.title} onChange={e => setBreachData(d => ({ ...d, title: e.target.value }))} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Breach Type</Label>
                      <Select value={breachData.breach_type} onValueChange={v => setBreachData(d => ({ ...d, breach_type: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {BREACH_TYPES.map(bt => <SelectItem key={bt} value={bt}>{bt.replace(/_/g, ' ')}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Affected Count *</Label>
                      <Input type="number" min="1" value={breachData.affected_count} onChange={e => setBreachData(d => ({ ...d, affected_count: e.target.value }))} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Data Categories</Label>
                    <Input placeholder="TIN, ACCOUNT_NUMBER, NAME" value={breachData.data_categories} onChange={e => setBreachData(d => ({ ...d, data_categories: e.target.value }))} />
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={breachData.sensitive_personal_information} onChange={e => setBreachData(d => ({ ...d, sensitive_personal_information: e.target.checked }))} className="rounded" />
                      Sensitive personal information
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={breachData.real_risk_of_serious_harm} onChange={e => setBreachData(d => ({ ...d, real_risk_of_serious_harm: e.target.checked }))} className="rounded" />
                      Real risk of serious harm
                    </label>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setBreachOpen(false)}>Cancel</Button>
                  <Button
                    variant="destructive"
                    onClick={() => reportBreachMutation.mutate()}
                    disabled={!breachData.title || Number(breachData.affected_count) < 1 || reportBreachMutation.isPending}
                  >
                    {reportBreachMutation.isPending ? 'Reporting...' : 'Report Breach'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {overdueBreachTimers > 0 && (
            <div className="rounded-lg border-2 border-red-400 bg-red-50 dark:bg-red-950 p-3 flex items-center gap-2" role="alert">
              <Clock className="h-5 w-5 text-red-600 flex-shrink-0" />
              <span className="text-sm font-medium text-red-800 dark:text-red-200">
                {overdueBreachTimers} breach notification deadline{overdueBreachTimers !== 1 ? 's' : ''} overdue — immediate action required
              </span>
            </div>
          )}

          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted">
                  <TableHead className="w-8"></TableHead>
                  <TableHead className="font-semibold">Incident</TableHead>
                  <TableHead className="font-semibold">Severity</TableHead>
                  <TableHead className="font-semibold">Affected</TableHead>
                  <TableHead className="font-semibold">Status</TableHead>
                  <TableHead className="font-semibold">NPC Deadline</TableHead>
                  <TableHead className="font-semibold">Subject Deadline</TableHead>
                  <TableHead className="font-semibold text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {breachRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-12">
                      <ShieldCheck className="h-8 w-8 mx-auto mb-2 text-green-500" />
                      No privacy breach incidents
                    </TableCell>
                  </TableRow>
                )}
                {breachRows.map((b) => {
                  const isExpanded = expandedBreaches.has(b.breach_id);
                  const statusConfig = BREACH_STATUS_CONFIG[b.breach_status] ?? { class: 'bg-muted', label: b.breach_status };
                  return (
                    <>
                      <TableRow key={b.breach_id} className="cursor-pointer hover:bg-muted/50" onClick={() => toggleBreachExpanded(b.breach_id)}>
                        <TableCell>
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-sm">{b.title || b.breach_type.replace(/_/g, ' ')}</div>
                          <div className="font-mono text-[10px] text-muted-foreground">{b.breach_id}</div>
                        </TableCell>
                        <TableCell>
                          <Badge className={b.sensitive_personal_information ? SEVERITY_COLORS.HIGH : SEVERITY_COLORS.MEDIUM}>
                            {b.sensitive_personal_information ? 'HIGH' : 'MEDIUM'}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">{b.affected_count}</TableCell>
                        <TableCell><Badge className={statusConfig.class}>{statusConfig.label}</Badge></TableCell>
                        <TableCell className="text-xs">
                          {b.npc_notification_required ? (
                            <div>
                              <div>{b.npc_deadline ? formatDateTime(b.npc_deadline) : '--'}</div>
                              {b.npc_notified_at && <Badge className="mt-1 bg-green-100 dark:bg-green-900 text-green-800 text-[10px]">Notified</Badge>}
                            </div>
                          ) : <Badge variant="outline" className="text-[10px]">N/A</Badge>}
                        </TableCell>
                        <TableCell className="text-xs">
                          {b.data_subject_notification_required ? (
                            <div>
                              <div>{b.data_subject_notification_deadline ? formatDateTime(b.data_subject_notification_deadline) : '--'}</div>
                              {b.data_subject_notified_at && <Badge className="mt-1 bg-green-100 dark:bg-green-900 text-green-800 text-[10px]">Notified</Badge>}
                            </div>
                          ) : <Badge variant="outline" className="text-[10px]">N/A</Badge>}
                        </TableCell>
                        <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                          <div className="flex flex-wrap justify-end gap-1.5">
                            {b.containment_status !== 'CONTAINED' && (
                              <Button variant="outline" size="sm" onClick={() => breachActionMutation.mutate({ id: b.breach_id, action: 'containment' })}>
                                <CheckCircle2 className="mr-1 h-3 w-3" /> Contain
                              </Button>
                            )}
                            {b.npc_notification_required && !b.npc_notified_at && (
                              <Button variant="outline" size="sm" onClick={() => breachActionMutation.mutate({ id: b.breach_id, action: 'notify-npc' })}>
                                <Send className="mr-1 h-3 w-3" /> NPC
                              </Button>
                            )}
                            {b.data_subject_notification_required && !b.data_subject_notified_at && (
                              <Button variant="outline" size="sm" onClick={() => breachActionMutation.mutate({ id: b.breach_id, action: 'notify-data-subjects' })}>
                                <Send className="mr-1 h-3 w-3" /> Subjects
                              </Button>
                            )}
                            {b.breach_status !== 'CLOSED' && b.containment_status === 'CONTAINED' && (
                              <Button variant="outline" size="sm" onClick={() => breachActionMutation.mutate({ id: b.breach_id, action: 'close' })}>
                                Close
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                      {/* Expanded timeline row */}
                      {isExpanded && (
                        <TableRow key={`${b.breach_id}-timeline`}>
                          <TableCell colSpan={8} className="bg-muted/30 py-4 px-8">
                            <div className="text-xs font-medium mb-2 text-muted-foreground">Lifecycle Timeline</div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <TimelineStep label="Reported" date={b.reported_at} done={!!b.reported_at} />
                              <TimelineArrow />
                              <TimelineStep label="Contained" date={b.contained_at} done={b.containment_status === 'CONTAINED'} />
                              <TimelineArrow />
                              <TimelineStep label="NPC Notified" date={b.npc_notified_at} done={!!b.npc_notified_at} />
                              <TimelineArrow />
                              <TimelineStep label="Subjects Notified" date={b.data_subject_notified_at} done={!!b.data_subject_notified_at} />
                              <TimelineArrow />
                              <TimelineStep label="Closed" date={b.closed_at} done={b.breach_status === 'CLOSED'} />
                            </div>
                            {b.data_categories && b.data_categories.length > 0 && (
                              <div className="mt-3 flex items-center gap-2 text-xs">
                                <span className="text-muted-foreground">Data categories:</span>
                                {b.data_categories.map(cat => <Badge key={cat} variant="outline" className="text-[10px]">{cat}</Badge>)}
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {/* Process Erasure Confirmation Dialog */}
      <Dialog open={processConfirmOpen} onOpenChange={setProcessConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Confirm Data Erasure</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This will permanently erase all personal data for client <span className="font-mono font-bold">{processTarget}</span>.
              This action cannot be undone.
            </p>
            <div className="rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 p-3 text-sm text-red-800 dark:text-red-200">
              <AlertTriangle className="h-4 w-4 inline mr-2" />
              Ensure all legal holds have been checked and DPO has approved the erasure.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProcessConfirmOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => processTarget && processErasureMutation.mutate(processTarget)}
              disabled={processErasureMutation.isPending}
            >
              {processErasureMutation.isPending ? 'Processing...' : 'Confirm Erasure'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function formatDateShort(iso?: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

function TimelineStep({ label, date, done }: { label: string; date?: string; done: boolean }) {
  return (
    <div className={`flex flex-col items-center px-2 py-1 rounded ${done ? 'bg-green-50 dark:bg-green-950' : 'bg-muted'}`}>
      <div className={`w-3 h-3 rounded-full mb-1 ${done ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
      <span className={`text-[10px] font-medium ${done ? 'text-green-700 dark:text-green-300' : 'text-muted-foreground'}`}>{label}</span>
      {date && <span className="text-[9px] text-muted-foreground">{formatDateShort(date)}</span>}
    </div>
  );
}

function TimelineArrow() {
  return <div className="w-4 h-px bg-gray-300 dark:bg-gray-600" />;
}
