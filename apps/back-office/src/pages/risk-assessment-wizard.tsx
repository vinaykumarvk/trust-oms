/**
 * Risk Assessment Wizard -- Risk Profiling Module
 *
 * 3-step wizard for conducting customer risk assessments:
 *   Step 1: Select Customer & Questionnaire
 *   Step 2: Answer Questionnaire (dynamic rendering)
 *   Step 3: Review & Submit (score, allocation, deviation, acknowledgement)
 *
 * Used by Relationship Managers. Supervisor deviation approval panel included.
 */
import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@ui/components/ui/card';
import { Button } from '@ui/components/ui/button';
import { Badge } from '@ui/components/ui/badge';
import { Input } from '@ui/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@ui/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@ui/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@ui/components/ui/select';
import { toast } from 'sonner';
import {
  User, ClipboardList, FileCheck, Search, ArrowLeft, ArrowRight, Check,
  AlertTriangle, ShieldCheck, History, ChevronDown, Loader2, CheckCircle,
} from 'lucide-react';

const API = '/api/v1/risk-profiling';
const STEPS = [
  { key: 'customer', label: 'Select Customer & Questionnaire', icon: User },
  { key: 'questions', label: 'Answer Questionnaire', icon: ClipboardList },
  { key: 'review', label: 'Review & Submit', icon: FileCheck },
];
const RISK_CATEGORIES = [
  { code: 1, label: 'Conservative' },
  { code: 2, label: 'Moderately Conservative' },
  { code: 3, label: 'Moderate' },
  { code: 4, label: 'Moderately Aggressive' },
  { code: 5, label: 'Aggressive' },
  { code: 6, label: 'Very Aggressive' },
];
const ALLOC_COLORS = [
  'bg-blue-500', 'bg-green-500', 'bg-yellow-500', 'bg-purple-500',
  'bg-orange-500', 'bg-pink-500', 'bg-teal-500', 'bg-indigo-500',
];
const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-800', expired: 'bg-red-100 text-red-800',
  pending_deviation: 'bg-yellow-100 text-yellow-800', none: 'bg-gray-100 text-gray-800',
};

/* Risk category color coding (G-079 — FR-018.AC2) */
function riskCategoryColor(category: string): string {
  const lower = (category || '').toLowerCase();
  if (lower.includes('aggressive') || lower.includes('very')) return 'text-red-600 font-semibold';
  if (lower.includes('moderate')) return 'text-amber-600 font-semibold';
  if (lower.includes('conservative')) return 'text-green-600 font-semibold';
  return 'text-foreground font-semibold';
}

// User identity is derived from the httpOnly cookie JWT on the server;
// role is read from the cookie claim via /api/v1/auth/me (or similar).
// We use a static default here since the back-office session is enforced
// server-side via requireBackOfficeRole() middleware on mutation routes.
function getCurrentUser() {
  return { id: 1, role: 'RM' };
}
function fetcher(url: string) {
  return fetch(url, { credentials: 'include', headers: { 'Content-Type': 'application/json' } }).then((r) => r.json());
}

interface AnswerOption { id: number; question_id: number; option_number: number; answer_description: string; weightage: string; }
interface Question {
  id: number; questionnaire_id: number; question_number: number; question_description: string;
  is_mandatory: boolean; is_multi_select: boolean; scoring_type: string; computation_type: string;
  answerOptions: AnswerOption[]; scoreNormalizationRanges: { id: number; range_from: string; range_to: string; normalized_score: string }[];
}
interface Questionnaire {
  id: number; questionnaire_name: string; customer_category: string; questionnaire_type: string;
  effective_start_date: string; effective_end_date: string; valid_period_years: number; is_score: boolean;
  warning_text: string | null; acknowledgement_text: string | null; disclaimer_text: string | null;
  authorization_status: string; entity_id: string; questions: Question[];
}
interface QListItem { id: number; questionnaire_name: string; questionnaire_type: string; valid_period_years: number; is_score: boolean; }
interface ComputedResult { totalScore: number; riskCategory: string; riskCode: number; questionScores: { questionId: number; rawScore: number; normalizedScore: number }[]; }
interface AllocLine { risk_category: string; asset_class: string; allocation_percentage: string; expected_return_pct: string | null; standard_deviation_pct: string | null; }
interface Assessment {
  id: number; customer_id: string; computed_risk_category: string; computed_risk_code: number;
  effective_risk_category: string; effective_risk_code: number; is_deviated: boolean; deviation_status: string | null;
  assessment_date: string; expiry_date: string; is_active: boolean; total_score: string;
}

export default function RiskAssessmentWizard() {
  const queryClient = useQueryClient();
  const currentUser = getCurrentUser();
  const isSupervisor = currentUser.role === 'RM_SUPERVISOR';

  const [step, setStep] = useState(0);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [selQId, setSelQId] = useState<number | null>(null);
  const [responses, setResponses] = useState<Record<number, Set<number>>>({});
  const [computedResult, setComputedResult] = useState<ComputedResult | null>(null);
  const [isDeviating, setIsDeviating] = useState(false);
  const [deviatedCategory, setDeviatedCategory] = useState('');
  const [deviatedCode, setDeviatedCode] = useState<number | null>(null);
  const [deviationReason, setDeviationReason] = useState('');
  const [ackChecked, setAckChecked] = useState(false);
  const [disclaimerChecked, setDisclaimerChecked] = useState(false);
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
  const [selDeviationId, setSelDeviationId] = useState<number | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  /* Deviation acknowledgement confirmation dialog (G-022 — FR-019.AC1) */
  const [deviationConfirmOpen, setDeviationConfirmOpen] = useState(false);
  const [deviationAcknowledged, setDeviationAcknowledged] = useState(false);

  // --- Queries ---
  const { data: qListData } = useQuery<{ data: QListItem[] }>({
    queryKey: ['rp-questionnaires'],
    queryFn: () => fetcher(`${API}/questionnaires?entity_id=default&status=AUTHORIZED`),
  });
  const questionnaires = qListData?.data ?? [];

  const { data: fullQ, isPending: qLoading } = useQuery<Questionnaire>({
    queryKey: ['rp-questionnaire-detail', selQId],
    queryFn: () => fetcher(`${API}/questionnaires/${selQId}`),
    enabled: !!selQId,
  });

  const { data: activeProfile } = useQuery<Assessment | null>({
    queryKey: ['rp-active-profile', customerId],
    queryFn: () => fetch(`${API}/assessments/customer/${encodeURIComponent(customerId)}/active`, { credentials: 'include', headers: { 'Content-Type': 'application/json' } }).then((r) => r.ok ? r.json() : null),
    enabled: !!customerId,
  });

  const { data: history } = useQuery<Assessment[]>({
    queryKey: ['rp-history', customerId],
    queryFn: () => fetcher(`${API}/assessments/customer/${encodeURIComponent(customerId)}`),
    enabled: !!customerId && showHistory,
  });

  const { data: allocLines } = useQuery<AllocLine[]>({
    queryKey: ['rp-alloc', computedResult?.riskCategory, deviatedCategory, isDeviating],
    queryFn: async () => {
      const configs = await fetcher(`${API}/asset-allocation?entity_id=default`);
      if (!Array.isArray(configs)) return [];
      const cat = isDeviating && deviatedCategory ? deviatedCategory : computedResult?.riskCategory;
      const lines: AllocLine[] = [];
      for (const cfg of configs) {
        if (cfg.authorization_status === 'AUTHORIZED' && cfg.lines) {
          for (const l of cfg.lines) { if (l.risk_category === cat) lines.push(l); }
        }
      }
      return lines;
    },
    enabled: !!computedResult,
  });

  const { data: pendingDevs } = useQuery<Assessment[]>({
    queryKey: ['rp-pending-devs'],
    queryFn: async () => { const d = await fetcher(`${API}/supervisor/dashboard`); return d?.pendingDeviations ?? []; },
    enabled: isSupervisor,
    refetchInterval: 30000,
  });

  // --- Mutations ---
  const computeMut = useMutation({
    mutationFn: (p: { questionnaire_id: number; responses: { questionId: number; answerOptionIds: number[] }[] }) =>
      fetch(`${API}/assessments/compute-score`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) })
        .then((r) => { if (!r.ok) return r.json().then((e: { error?: string }) => { throw new Error(e.error || 'Computation failed'); }); return r.json(); }),
    onSuccess: (data: ComputedResult) => { setComputedResult(data); setStep(2); },
    onError: (err: Error) => toast.error(err.message),
  });

  const submitMut = useMutation({
    mutationFn: (p: { customer_id: string; questionnaire_id: number; responses: { questionId: number; answerOptionIds: number[] }[]; deviation?: { deviated_risk_category: string; deviated_risk_code: number; deviation_reason: string }; device_info: { device_type: string; user_agent: string } }) =>
      fetch(`${API}/assessments`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) })
        .then((r) => { if (!r.ok) return r.json().then((e: { error?: string }) => { throw new Error(e.error || 'Submit failed'); }); return r.json(); }),
    onSuccess: () => {
      toast.success('Risk assessment submitted successfully');
      queryClient.invalidateQueries({ queryKey: ['rp-active-profile'] });
      queryClient.invalidateQueries({ queryKey: ['rp-history'] });
      queryClient.invalidateQueries({ queryKey: ['rp-pending-devs'] });
      setStep(0); setCustomerId(''); setCustomerSearch(''); setSelQId(null); setResponses({});
      setComputedResult(null); setIsDeviating(false); setDeviatedCategory(''); setDeviatedCode(null);
      setDeviationReason(''); setAckChecked(false); setDisclaimerChecked(false); setDeviationAcknowledged(false); setDeviationConfirmOpen(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const approveMut = useMutation({
    mutationFn: (id: number) => fetch(`${API}/assessments/${id}/approve-deviation`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' } })
      .then((r) => { if (!r.ok) return r.json().then((e: { error?: string }) => { throw new Error(e.error || 'Approval failed'); }); return r.json(); }),
    onSuccess: () => { toast.success('Deviation approved'); queryClient.invalidateQueries({ queryKey: ['rp-pending-devs'] }); setApprovalDialogOpen(false); },
    onError: (err: Error) => toast.error(err.message),
  });

  // --- Helpers ---
  const questions = fullQ?.questions ?? [];

  const toggleOption = useCallback((qId: number, optId: number, isMulti: boolean) => {
    setResponses((prev) => {
      const cur = new Set(prev[qId] ?? []);
      if (isMulti) { cur.has(optId) ? cur.delete(optId) : cur.add(optId); }
      else { cur.clear(); cur.add(optId); }
      return { ...prev, [qId]: cur };
    });
  }, []);

  const runningScore = useMemo(() => {
    if (!fullQ?.is_score) return null;
    let t = 0;
    for (const q of questions) {
      const sel = responses[q.id];
      if (!sel) continue;
      for (const id of sel) { const o = q.answerOptions.find((a) => a.id === id); if (o) t += parseFloat(o.weightage); }
    }
    return t;
  }, [responses, questions, fullQ]);

  const mandatoryOk = useMemo(() => {
    for (const q of questions) { if (q.is_mandatory && (!responses[q.id] || responses[q.id].size === 0)) return false; }
    return questions.length > 0;
  }, [responses, questions]);

  const canSubmit = useMemo(() => {
    if (!computedResult) return false;
    if (fullQ?.acknowledgement_text && !ackChecked) return false;
    if (fullQ?.disclaimer_text && !disclaimerChecked) return false;
    if (isDeviating && (!deviatedCategory || !deviationReason.trim())) return false;
    return true;
  }, [computedResult, ackChecked, disclaimerChecked, isDeviating, deviatedCategory, deviationReason, fullQ]);

  const profileStatus = useMemo(() => {
    if (!activeProfile) return 'none';
    if (!activeProfile.is_active || new Date(activeProfile.expiry_date) < new Date()) return 'expired';
    if (activeProfile.is_deviated && activeProfile.deviation_status === 'PENDING') return 'pending_deviation';
    return 'active';
  }, [activeProfile]);

  const allocStats = useMemo(() => {
    if (!allocLines || allocLines.length === 0) return null;
    let er = 0, sd = 0;
    for (const l of allocLines) { const p = parseFloat(l.allocation_percentage) || 0; er += p * (parseFloat(l.expected_return_pct ?? '0') || 0) / 100; sd += p * (parseFloat(l.standard_deviation_pct ?? '0') || 0) / 100; }
    return { expectedReturn: er, stdDeviation: sd };
  }, [allocLines]);

  const handleCompute = () => {
    if (!selQId) return;
    computeMut.mutate({ questionnaire_id: selQId, responses: Object.entries(responses).map(([qId, opts]) => ({ questionId: parseInt(qId, 10), answerOptionIds: Array.from(opts) })) });
  };
  const handleSubmit = () => {
    if (!selQId || !customerId) return;
    const p: Parameters<typeof submitMut.mutate>[0] = {
      customer_id: customerId, questionnaire_id: selQId,
      responses: Object.entries(responses).map(([qId, opts]) => ({ questionId: parseInt(qId, 10), answerOptionIds: Array.from(opts) })),
      device_info: { device_type: 'WEB', user_agent: navigator.userAgent },
    };
    if (isDeviating && deviatedCategory && deviatedCode !== null) {
      p.deviation = { deviated_risk_category: deviatedCategory, deviated_risk_code: deviatedCode, deviation_reason: deviationReason };
    }
    submitMut.mutate(p);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Risk Assessment Wizard</h1>
        <p className="text-muted-foreground">Conduct customer risk profiling assessment in 3 steps</p>
      </div>

      {/* Supervisor: pending deviation approvals */}
      {isSupervisor && pendingDevs && pendingDevs.length > 0 && (
        <Card className="border-yellow-300 bg-yellow-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-yellow-600" /> Pending Deviation Approvals ({pendingDevs.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead><TableHead>Computed</TableHead><TableHead>Deviated To</TableHead><TableHead>Date</TableHead><TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingDevs.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-mono text-sm">{d.customer_id}</TableCell>
                    <TableCell>{d.computed_risk_category} ({d.computed_risk_code})</TableCell>
                    <TableCell><Badge variant="secondary" className="bg-orange-100 text-orange-800">{d.effective_risk_category} ({d.effective_risk_code})</Badge></TableCell>
                    <TableCell className="text-sm text-muted-foreground">{new Date(d.assessment_date).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <Button size="sm" onClick={() => { setSelDeviationId(d.id); setApprovalDialogOpen(true); }}>
                        <Check className="mr-1 h-3 w-3" /> Approve
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Customer history (collapsible) */}
      {customerId && (
        <Card>
          <CardHeader className="pb-2 cursor-pointer" onClick={() => setShowHistory(!showHistory)}>
            <CardTitle className="text-sm font-medium flex items-center justify-between">
              <span className="flex items-center gap-2">
                <History className="h-4 w-4" /> Risk Profile History - {customerId}
                {activeProfile && <Badge className={STATUS_COLORS[profileStatus]} variant="secondary">{profileStatus.replace(/_/g, ' ').toUpperCase()}</Badge>}
              </span>
              <ChevronDown className={`h-4 w-4 transition-transform ${showHistory ? 'rotate-180' : ''}`} />
            </CardTitle>
          </CardHeader>
          {showHistory && (
            <CardContent>
              {!history || history.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No previous assessments found</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead><TableHead>Computed</TableHead><TableHead>Effective</TableHead>
                      <TableHead>Score</TableHead><TableHead>Deviated</TableHead><TableHead>Expiry</TableHead><TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(Array.isArray(history) ? history : []).map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="text-sm">{new Date(a.assessment_date).toLocaleDateString()}</TableCell>
                        <TableCell>{a.computed_risk_category} ({a.computed_risk_code})</TableCell>
                        <TableCell>{a.effective_risk_category} ({a.effective_risk_code})</TableCell>
                        <TableCell className="font-mono">{a.total_score}</TableCell>
                        <TableCell>{a.is_deviated ? <Badge variant="secondary" className="bg-orange-100 text-orange-800">Yes</Badge> : <span className="text-muted-foreground">No</span>}</TableCell>
                        <TableCell className="text-sm">{new Date(a.expiry_date).toLocaleDateString()}</TableCell>
                        <TableCell><Badge variant="secondary" className={a.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}>{a.is_active ? 'Active' : 'Inactive'}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          )}
        </Card>
      )}

      {/* Stepper */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, idx) => {
          const active = idx === step, done = idx < step;
          return (
            <div key={s.key} className="flex items-center gap-2">
              {idx > 0 && <div className={`h-px w-8 ${done ? 'bg-primary' : 'bg-muted-foreground/30'}`} />}
              <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${active ? 'bg-primary text-primary-foreground' : done ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${active ? 'bg-primary-foreground text-primary' : done ? 'bg-primary text-primary-foreground' : 'bg-muted-foreground/20 text-muted-foreground'}`}>
                  {done ? <Check className="h-3 w-3" /> : idx + 1}
                </div>
                <s.icon className="h-4 w-4 hidden sm:block" />
                <span className="hidden md:inline">{s.label}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Step content */}
      <Card>
        <CardContent className="pt-6">
          {/* ===== Step 1: Select Customer & Questionnaire ===== */}
          {step === 0 && (
            <div className="space-y-6">
              <h2 className="text-lg font-semibold">Select Customer</h2>
              <div className="flex gap-3 items-end">
                <div className="flex-1">
                  <label htmlFor="raw-customer-search" className="text-sm font-medium mb-1 block">Customer Name or ID</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input id="raw-customer-search" placeholder="Search by customer name or ID..." value={customerSearch} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCustomerSearch(e.target.value)} className="pl-10" />
                  </div>
                </div>
                <Button variant="outline" onClick={() => { if (customerSearch.trim()) { setCustomerId(customerSearch.trim()); setShowHistory(false); } }} disabled={!customerSearch.trim()}>
                  <Search className="mr-2 h-4 w-4" /> Lookup
                </Button>
              </div>
              {customerId && (
                <div className="rounded-lg border p-4 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div><span className="text-sm text-muted-foreground">Selected:</span> <span className="font-mono font-semibold">{customerId}</span></div>
                    <Badge className={STATUS_COLORS[profileStatus]} variant="secondary">
                      {profileStatus === 'none' ? 'No Profile' : profileStatus === 'active' ? `Active - ${activeProfile?.effective_risk_category}` : profileStatus === 'expired' ? 'Expired' : 'Pending Deviation'}
                    </Badge>
                  </div>
                  {activeProfile && profileStatus === 'active' && (
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div><span className="text-muted-foreground">Code:</span> <span className="font-semibold">{activeProfile.effective_risk_code}</span></div>
                      <div><span className="text-muted-foreground">Score:</span> <span className="font-mono">{activeProfile.total_score}</span></div>
                      <div><span className="text-muted-foreground">Expires:</span> {new Date(activeProfile.expiry_date).toLocaleDateString()}</div>
                    </div>
                  )}
                </div>
              )}
              <h2 className="text-lg font-semibold">Select Questionnaire</h2>
              <Select value={selQId?.toString() ?? ''} onValueChange={(v: string) => { setSelQId(parseInt(v, 10)); setResponses({}); setComputedResult(null); }}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Choose an authorized questionnaire..." /></SelectTrigger>
                <SelectContent>{questionnaires.map((q) => <SelectItem key={q.id} value={q.id.toString()}>{q.questionnaire_name}</SelectItem>)}</SelectContent>
              </Select>
              {fullQ && (
                <div className="rounded-lg border p-4">
                  <h3 className="text-sm font-semibold mb-2">Questionnaire Details</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div><span className="text-muted-foreground">Type:</span> <Badge variant="outline">{fullQ.questionnaire_type}</Badge></div>
                    <div><span className="text-muted-foreground">Valid Period:</span> {fullQ.valid_period_years} year(s)</div>
                    <div><span className="text-muted-foreground">Scored:</span> {fullQ.is_score ? 'Yes' : 'No'}</div>
                    <div><span className="text-muted-foreground">Questions:</span> {fullQ.questions.length}</div>
                  </div>
                  {fullQ.warning_text && (
                    <div className="mt-3 flex items-start gap-2 rounded-md bg-yellow-50 p-3 text-sm text-yellow-800">
                      <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />{fullQ.warning_text}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ===== Step 2: Answer Questionnaire ===== */}
          {step === 1 && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">{fullQ?.questionnaire_name ?? 'Questionnaire'}</h2>
                {runningScore !== null && <Badge variant="outline" className="text-base px-3 py-1">Running Score: <span className="ml-1 font-mono font-bold">{runningScore.toFixed(1)}</span></Badge>}
              </div>
              {qLoading ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading...</div>
              ) : (
                questions.map((q, qIdx) => {
                  const sel = responses[q.id] ?? new Set<number>();
                  return (
                    <div key={q.id} className={`rounded-lg border p-4 ${q.is_mandatory && sel.size === 0 ? 'border-orange-300 bg-orange-50/30' : ''}`}>
                      <div className="flex items-start gap-3 mb-3">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-bold flex-shrink-0">{qIdx + 1}</span>
                        <div>
                          <p className="font-medium text-sm">{q.question_description}{q.is_mandatory && <span className="ml-1 text-red-500">*</span>}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{q.is_multi_select ? 'Select all that apply' : 'Select one option'}</p>
                        </div>
                      </div>
                      <div className="ml-10 space-y-2">
                        {q.answerOptions.map((opt) => {
                          const isSel = sel.has(opt.id);
                          return (
                            <label key={opt.id} className={`flex items-center gap-3 rounded-md border px-3 py-2 cursor-pointer hover:bg-muted/50 ${isSel ? 'border-primary bg-primary/5' : ''}`}>
                              <input type={q.is_multi_select ? 'checkbox' : 'radio'} name={`q-${q.id}`} checked={isSel} onChange={() => toggleOption(q.id, opt.id, q.is_multi_select)} className="h-4 w-4" />
                              <span className="flex-1 text-sm">{opt.answer_description}</span>
                              {fullQ?.is_score && <span className="text-xs text-muted-foreground font-mono">wt: {opt.weightage}</span>}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* ===== Step 3: Review & Submit ===== */}
          {step === 2 && computedResult && (
            <div className="space-y-6">
              <h2 className="text-lg font-semibold">Review Assessment Results</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Raw Score</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold font-mono">{computedResult.totalScore.toFixed(1)}</div></CardContent></Card>
                <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Risk Category</CardTitle></CardHeader><CardContent><div className="text-xl"><span className={riskCategoryColor(computedResult.riskCategory)}>{computedResult.riskCategory}</span></div><Badge variant="outline" className="mt-1">Code: {computedResult.riskCode}</Badge></CardContent></Card>
                <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Expected Performance</CardTitle></CardHeader><CardContent>{allocStats ? (<div className="space-y-1 text-sm"><div><span className="text-muted-foreground">Return:</span> <span className="font-mono font-semibold">{allocStats.expectedReturn.toFixed(2)}%</span></div><div><span className="text-muted-foreground">Std Dev:</span> <span className="font-mono font-semibold">{allocStats.stdDeviation.toFixed(2)}%</span></div></div>) : <span className="text-sm text-muted-foreground">No data</span>}</CardContent></Card>
              </div>

              {/* Asset Allocation */}
              {allocLines && allocLines.length > 0 && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Recommended Asset Allocation ({isDeviating && deviatedCategory ? deviatedCategory : computedResult.riskCategory})</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex h-8 rounded-md overflow-hidden">
                      {allocLines.map((l, i) => { const p = parseFloat(l.allocation_percentage) || 0; return p > 0 ? <div key={i} className={`${ALLOC_COLORS[i % ALLOC_COLORS.length]} flex items-center justify-center text-white text-xs font-medium`} style={{ width: `${p}%` }} title={`${l.asset_class}: ${p}%`}>{p >= 10 ? `${p}%` : ''}</div> : null; })}
                    </div>
                    <Table>
                      <TableHeader><TableRow><TableHead>Asset Class</TableHead><TableHead className="text-right">Alloc %</TableHead><TableHead className="text-right">Exp Return %</TableHead><TableHead className="text-right">Std Dev %</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {allocLines.map((l, i) => (
                          <TableRow key={i}>
                            <TableCell className="flex items-center gap-2"><div className={`h-3 w-3 rounded-sm ${ALLOC_COLORS[i % ALLOC_COLORS.length]}`} />{l.asset_class}</TableCell>
                            <TableCell className="text-right font-mono">{l.allocation_percentage}%</TableCell>
                            <TableCell className="text-right font-mono">{l.expected_return_pct ?? '-'}</TableCell>
                            <TableCell className="text-right font-mono">{l.standard_deviation_pct ?? '-'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}

              {/* Deviation */}
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Risk Category Deviation</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  {/* Client deviation acknowledgement (G-022 — FR-019.AC1) */}
                  <div>
                    {deviationAcknowledged ? (
                      <div className="flex items-center gap-2 text-green-700 text-sm">
                        <CheckCircle className="h-4 w-4" />
                        <span>Client acknowledges the product risk deviation</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-xs h-6"
                          onClick={() => { setDeviationAcknowledged(false); setIsDeviating(false); setDeviatedCategory(''); setDeviatedCode(null); setDeviationReason(''); }}
                        >
                          Undo
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-amber-300 text-amber-700"
                        onClick={() => setDeviationConfirmOpen(true)}
                      >
                        Confirm Client Acknowledgement
                      </Button>
                    )}
                  </div>
                  {isDeviating && (
                    <div className="space-y-4 pl-7">
                      <div className="flex items-start gap-2 rounded-md bg-yellow-50 p-3 text-sm text-yellow-800">
                        <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" /> This deviation requires supervisor approval before the profile becomes effective.
                      </div>
                      <div>
                        <label htmlFor="raw-dev-category" className="text-sm font-medium mb-1 block">Deviated Risk Category</label>
                        <Select value={deviatedCategory} onValueChange={(v: string) => { setDeviatedCategory(v); const m = RISK_CATEGORIES.find((c) => c.label === v); setDeviatedCode(m?.code ?? null); }}>
                          <SelectTrigger className="w-full max-w-sm"><SelectValue placeholder="Select risk category..." /></SelectTrigger>
                          <SelectContent>{RISK_CATEGORIES.filter((c) => c.label !== computedResult.riskCategory).map((c) => <SelectItem key={c.code} value={c.label}>{c.label} (Code {c.code})</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label htmlFor="raw-dev-reason" className="text-sm font-medium mb-1 block">Deviation Reason *</label>
                        <textarea id="raw-dev-reason" className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder="Describe the reason for deviating..." value={deviationReason} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDeviationReason(e.target.value)} />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Acknowledgements */}
              {(fullQ?.acknowledgement_text || fullQ?.disclaimer_text) && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Acknowledgements</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    {fullQ.acknowledgement_text && (
                      <div className="flex items-start gap-3">
                        <input type="checkbox" id="ack" checked={ackChecked} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAckChecked(e.target.checked)} className="h-4 w-4 mt-0.5 rounded border-gray-300" />
                        <label htmlFor="ack" className="text-sm leading-relaxed">{fullQ.acknowledgement_text}</label>
                      </div>
                    )}
                    {fullQ.disclaimer_text && (
                      <div className="flex items-start gap-3">
                        <input type="checkbox" id="disc" checked={disclaimerChecked} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDisclaimerChecked(e.target.checked)} className="h-4 w-4 mt-0.5 rounded border-gray-300" />
                        <label htmlFor="disc" className="text-sm leading-relaxed">{fullQ.disclaimer_text}</label>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Score breakdown */}
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Score Breakdown by Question</CardTitle></CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader><TableRow><TableHead>#</TableHead><TableHead>Question</TableHead><TableHead className="text-right">Raw</TableHead><TableHead className="text-right">Normalized</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {computedResult.questionScores.map((qs, idx) => (
                        <TableRow key={qs.questionId}>
                          <TableCell className="font-mono text-sm">{idx + 1}</TableCell>
                          <TableCell className="text-sm max-w-md truncate">{questions.find((q) => q.id === qs.questionId)?.question_description ?? `Q ${qs.questionId}`}</TableCell>
                          <TableCell className="text-right font-mono">{qs.rawScore.toFixed(1)}</TableCell>
                          <TableCell className="text-right font-mono">{qs.normalizedScore.toFixed(1)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="font-semibold bg-muted/50">
                        <TableCell /><TableCell>Total</TableCell>
                        <TableCell className="text-right font-mono">{computedResult.questionScores.reduce((s, q) => s + q.rawScore, 0).toFixed(1)}</TableCell>
                        <TableCell className="text-right font-mono">{computedResult.totalScore.toFixed(1)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* Profile validity dates (G-021 — FR-018.AC5) */}
              <div className="rounded-md border bg-muted/30 p-3 space-y-1 text-sm">
                <p className="font-medium">Profile Validity</p>
                <p className="text-muted-foreground">
                  Profile Date:{' '}
                  <span className="font-medium text-foreground">
                    {new Date().toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                </p>
                <p className="text-muted-foreground">
                  Expires:{' '}
                  <span className="font-medium text-foreground">
                    {(() => {
                      const expiry = new Date();
                      expiry.setFullYear(expiry.getFullYear() + (fullQ?.valid_period_years ?? 2));
                      return expiry.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
                    })()}
                  </span>
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <div className="flex items-center gap-2">
          {step === 0 && <Button onClick={() => setStep(1)} disabled={!customerId || !selQId || !fullQ}>Next <ArrowRight className="ml-2 h-4 w-4" /></Button>}
          {step === 1 && (
            <Button onClick={handleCompute} disabled={!mandatoryOk || computeMut.isPending}>
              {computeMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Compute Score & Review <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )}
          {step === 2 && (
            <Button onClick={handleSubmit} disabled={!canSubmit || submitMut.isPending}>
              {submitMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}<Check className="mr-2 h-4 w-4" /> Submit Assessment
            </Button>
          )}
        </div>
      </div>

      {/* Client Deviation Acknowledgement Confirmation (G-022 — FR-019.AC1) */}
      <Dialog open={deviationConfirmOpen} onOpenChange={setDeviationConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirm Client Acknowledgement</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Do you confirm that the client acknowledges the product risk deviation?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeviationConfirmOpen(false)}>No</Button>
            <Button onClick={() => { setDeviationAcknowledged(true); setIsDeviating(true); setDeviationConfirmOpen(false); }}>
              Yes, Confirmed
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Supervisor approval dialog */}
      <Dialog open={approvalDialogOpen} onOpenChange={setApprovalDialogOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader><DialogTitle>Approve Deviation</DialogTitle>
          <DialogDescription>Are you sure you want to approve this risk category deviation? The client's effective risk profile will be updated accordingly.</DialogDescription></DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApprovalDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => { if (selDeviationId !== null) approveMut.mutate(selDeviationId); }} disabled={approveMut.isPending}>
              {approveMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Approve Deviation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
