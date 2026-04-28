/**
 * Call Report Form (CRM — Call Report Module)
 *
 * Full-featured call report creation/editing form:
 *   - Scheduled mode: pre-populates from a linked meeting (meetingId search param)
 *   - Standalone mode: all fields editable, no meeting link
 *   - Edit mode: loads existing report (id route param), only editable if DRAFT/RETURNED
 *   - 5-business-day late-filing warning banner
 *   - Returned/rejected report banner with rejection reason
 *   - Sections: Meeting Info, Relationship & Context, Discussion, Action Items, Next Steps
 *   - Save as Draft / Submit / Cancel actions
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@ui/components/ui/card';
import { Button } from '@ui/components/ui/button';
import { Badge } from '@ui/components/ui/badge';
import { Input } from '@ui/components/ui/input';
import { Textarea } from '@ui/components/ui/textarea';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@ui/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@ui/components/ui/select';
import { toast } from 'sonner';
import {
  Save, Send, Plus, Trash2, AlertTriangle, ArrowLeft,
} from 'lucide-react';
import { fetcher, authHeaders, mutationFn } from '@/lib/api';
import {
  MEETING_TYPES,
  MEETING_REASONS,
  callReportStatusColors,
  actionPriorityColors,
  businessDaysBetween,
} from '@/lib/crm-constants';

/* ---------- Types ---------- */

interface MeetingData {
  id: number;
  title: string;
  start_time: string;
  meeting_type: string;
  meeting_reason: string;
  lead_id: string | null;
  prospect_id: string | null;
  client_id: string | null;
  relationship_name: string | null;
}

interface CallReportData {
  id: number;
  report_code: string;
  report_type: string;
  meeting_id: number | null;
  subject: string;
  meeting_date: string;
  meeting_type: string;
  meeting_reason: string;
  relationship_name: string;
  person_met: string;
  client_status: string;
  state_of_mind: string;
  summary: string;
  discussion_summary: string;
  topics_discussed: string[];
  products_discussed: string[];
  outcome: string;
  follow_up_required: boolean;
  follow_up_date: string | null;
  next_meeting_start: string | null;
  next_meeting_end: string | null;
  report_status: string;
  rejection_reason: string | null;
  action_items: ActionItemRow[];
}

interface ActionItemRow {
  _key: string;
  title: string;
  description: string;
  assigned_to: string;
  due_date: string;
  priority: string;
}

/* ---------- Helpers ---------- */

let _actionCounter = 0;
function genKey(): string {
  _actionCounter += 1;
  return `ai-${Date.now()}-${_actionCounter}`;
}

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;

/* ---------- Component ---------- */

export default function CallReportForm() {
  const { id: reportId } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const meetingIdParam = searchParams.get('meetingId') || '';
  const isEditMode = !!reportId;
  const isScheduledMode = !!meetingIdParam && !isEditMode;

  // --- Form state ---
  const [subject, setSubject] = useState('');
  const [meetingDate, setMeetingDate] = useState('');
  const [meetingType, setMeetingType] = useState('');
  const [meetingReason, setMeetingReason] = useState('');
  const [relationshipName, setRelationshipName] = useState('');
  const [personMet, setPersonMet] = useState('');
  const [clientStatus, setClientStatus] = useState('');
  const [stateOfMind, setStateOfMind] = useState('');
  const [summary, setSummary] = useState('');
  const [discussionSummary, setDiscussionSummary] = useState('');
  const [topicsStr, setTopicsStr] = useState('');
  const [productsStr, setProductsStr] = useState('');
  const [outcome, setOutcome] = useState('');
  const [followUpRequired, setFollowUpRequired] = useState(false);
  const [followUpDate, setFollowUpDate] = useState('');
  const [nextMeetingStart, setNextMeetingStart] = useState('');
  const [nextMeetingEnd, setNextMeetingEnd] = useState('');
  const [actionItems, setActionItems] = useState<ActionItemRow[]>([]);
  const [prefilled, setPrefilled] = useState(false);

  // --- Queries ---

  // Fetch linked meeting for scheduled mode
  const { data: meetingData, isPending: meetingPending } = useQuery<MeetingData>({
    queryKey: ['meeting-detail', meetingIdParam],
    queryFn: () => fetcher(`/api/v1/meetings/${meetingIdParam}`),
    enabled: !!meetingIdParam && !isEditMode,
  });

  // Fetch existing report for edit mode
  const { data: existingReport, isPending: reportPending } = useQuery<CallReportData>({
    queryKey: ['call-report-detail', reportId],
    queryFn: () => fetcher(`/api/v1/call-reports/${reportId}`),
    enabled: isEditMode,
  });

  // Determine report type
  const reportType = useMemo(() => {
    if (isEditMode && existingReport) return existingReport.report_type;
    return isScheduledMode ? 'SCHEDULED' : 'STANDALONE';
  }, [isEditMode, existingReport, isScheduledMode]);

  // Is the form editable?
  const isEditable = useMemo(() => {
    if (!isEditMode) return true;
    if (!existingReport) return false;
    return existingReport.report_status === 'DRAFT' || existingReport.report_status === 'RETURNED';
  }, [isEditMode, existingReport]);

  // Pre-populate from meeting (scheduled mode)
  useEffect(() => {
    if (meetingData && isScheduledMode && !prefilled) {
      setSubject(meetingData.title || '');
      setMeetingDate(meetingData.start_time ? meetingData.start_time.split('T')[0] : '');
      setMeetingType(meetingData.meeting_type || '');
      setMeetingReason(meetingData.meeting_reason || '');
      setRelationshipName(meetingData.relationship_name || '');
      setPrefilled(true);
    }
  }, [meetingData, isScheduledMode, prefilled]);

  // Populate form from existing report (edit mode)
  useEffect(() => {
    if (existingReport && isEditMode) {
      setSubject(existingReport.subject || '');
      setMeetingDate(existingReport.meeting_date ? existingReport.meeting_date.split('T')[0] : '');
      setMeetingType(existingReport.meeting_type || '');
      setMeetingReason(existingReport.meeting_reason || '');
      setRelationshipName(existingReport.relationship_name || '');
      setPersonMet(existingReport.person_met || '');
      setClientStatus(existingReport.client_status || '');
      setStateOfMind(existingReport.state_of_mind || '');
      setSummary(existingReport.summary || '');
      setDiscussionSummary(existingReport.discussion_summary || '');
      setTopicsStr((existingReport.topics_discussed || []).join(', '));
      setProductsStr((existingReport.products_discussed || []).join(', '));
      setOutcome(existingReport.outcome || '');
      setFollowUpRequired(existingReport.follow_up_required || false);
      setFollowUpDate(existingReport.follow_up_date || '');
      setNextMeetingStart(existingReport.next_meeting_start || '');
      setNextMeetingEnd(existingReport.next_meeting_end || '');
      setActionItems(
        (existingReport.action_items || []).map((ai) => ({
          ...ai,
          _key: ai._key || genKey(),
        })),
      );
    }
  }, [existingReport, isEditMode]);

  // 5-business-day warning
  const showLateWarning = useMemo(() => {
    if (!meetingDate) return false;
    const meeting = new Date(meetingDate);
    const today = new Date();
    return businessDaysBetween(meeting, today) > 5;
  }, [meetingDate]);

  // Rejected banner
  const showRejectedBanner = useMemo(() => {
    return isEditMode && existingReport?.report_status === 'RETURNED';
  }, [isEditMode, existingReport]);

  // --- Action items ---

  const addActionItem = useCallback(() => {
    setActionItems((prev) => [
      ...prev,
      { _key: genKey(), title: '', description: '', assigned_to: '', due_date: '', priority: 'MEDIUM' },
    ]);
  }, []);

  const removeActionItem = useCallback((key: string) => {
    setActionItems((prev) => prev.filter((ai) => ai._key !== key));
  }, []);

  const updateActionItem = useCallback((key: string, field: keyof ActionItemRow, value: string) => {
    setActionItems((prev) =>
      prev.map((ai) => (ai._key === key ? { ...ai, [field]: value } : ai)),
    );
  }, []);

  // --- Build payload ---

  function buildPayload(status: string) {
    const topicsArray = topicsStr
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const productsArray = productsStr
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    return {
      report_type: reportType,
      meeting_id: meetingIdParam ? parseInt(meetingIdParam, 10) : existingReport?.meeting_id ?? undefined,
      subject,
      meeting_date: meetingDate || undefined,
      meeting_type: meetingType || undefined,
      meeting_reason: meetingReason || undefined,
      relationship_name: relationshipName || undefined,
      person_met: personMet || undefined,
      client_status: clientStatus || undefined,
      state_of_mind: stateOfMind || undefined,
      summary,
      discussion_summary: discussionSummary || undefined,
      topics_discussed: topicsArray,
      products_discussed: productsArray,
      outcome: outcome || undefined,
      follow_up_required: followUpRequired,
      follow_up_date: followUpRequired && followUpDate ? followUpDate : undefined,
      next_meeting_start: nextMeetingStart || undefined,
      next_meeting_end: nextMeetingEnd || undefined,
      report_status: status,
      action_items: actionItems.map((ai) => ({
        title: ai.title,
        description: ai.description,
        assigned_to: ai.assigned_to || undefined,
        due_date: ai.due_date || undefined,
        priority: ai.priority,
      })),
    };
  }

  // --- Mutations ---

  const saveDraftMutation = useMutation({
    mutationFn: () => {
      const payload = buildPayload('DRAFT');
      if (isEditMode) {
        return mutationFn('PUT', `/api/v1/call-reports/${reportId}`, payload);
      }
      return mutationFn('POST', '/api/v1/call-reports', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['call-reports-list'] });
      queryClient.invalidateQueries({ queryKey: ['call-report-detail'] });
      toast.success('Call report saved as draft');
      navigate('/crm/call-reports');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const payload = buildPayload('DRAFT');
      let savedId = reportId;

      if (isEditMode) {
        await mutationFn('PUT', `/api/v1/call-reports/${reportId}`, payload);
      } else {
        const result = await mutationFn('POST', '/api/v1/call-reports', payload);
        savedId = result.id;
      }

      return mutationFn('PATCH', `/api/v1/call-reports/${savedId}/submit`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['call-reports-list'] });
      queryClient.invalidateQueries({ queryKey: ['call-report-detail'] });
      toast.success('Call report submitted successfully');
      navigate('/crm/call-reports');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const isSaving = saveDraftMutation.isPending || submitMutation.isPending;
  const canSubmit = subject.trim() && summary.trim();

  // --- Loading state ---

  if (isEditMode && reportPending) {
    return (
      <div className="space-y-6">
        <div className="h-6 w-64 animate-pulse rounded bg-muted" />
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <Card>
          <CardContent className="pt-6 space-y-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-10 w-full animate-pulse rounded bg-muted" />
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (meetingIdParam && !isEditMode && meetingPending) {
    return (
      <div className="p-8 space-y-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-10 bg-muted animate-pulse rounded" />
        ))}
      </div>
    );
  }

  // --- Render ---

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            {isEditMode ? 'Edit Call Report' : 'New Call Report'}
            {reportType === 'STANDALONE' && !isEditMode && (
              <Badge variant="secondary" className="bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200">
                STANDALONE
              </Badge>
            )}
            {reportType === 'SCHEDULED' && !isEditMode && (
              <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                SCHEDULED
              </Badge>
            )}
            {isEditMode && existingReport && (
              <Badge
                variant="secondary"
                className={callReportStatusColors[existingReport.report_status] || ''}
              >
                {existingReport.report_status.replace(/_/g, ' ')}
              </Badge>
            )}
          </h1>
          <p className="text-muted-foreground">
            Document meeting outcomes, action items, and follow-up plans
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
      </div>

      {/* 5-Day Warning Banner */}
      {showLateWarning && (
        <div className="bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 text-orange-800 dark:text-orange-300 p-3 rounded-md flex items-start gap-2">
          <AlertTriangle className="h-5 w-5 mt-0.5 flex-shrink-0" />
          <span>
            This call report is being filed more than 5 business days after the meeting. It will require supervisor approval.
          </span>
        </div>
      )}

      {/* Rejected Banner */}
      {showRejectedBanner && existingReport?.rejection_reason && (
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-300 p-3 rounded-md">
          This report was returned: {existingReport.rejection_reason}. Please revise and re-submit.
        </div>
      )}

      {/* Not editable notice */}
      {isEditMode && !isEditable && (
        <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300 p-3 rounded-md">
          This report is in <strong>{existingReport?.report_status}</strong> status and cannot be edited.
        </div>
      )}

      {/* AI Tags panel — shown when the intelligence service has tagged this report */}
      {isEditMode && existingReport && (existingReport as any).ai_tags && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <svg className="h-4 w-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.347.347a3.001 3.001 0 01-2.121.879H9.375a3 3 0 01-2.121-.879l-.347-.347z" />
              </svg>
              AI Analysis
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(() => {
              const tags = (existingReport as any).ai_tags as {
                topics?: string[];
                sentiment?: string;
                action_items?: string[];
                keywords?: string[];
              };
              const sentimentColor =
                tags.sentiment === 'POSITIVE' ? 'text-green-600 bg-green-50 border-green-200' :
                tags.sentiment === 'NEGATIVE' ? 'text-red-600 bg-red-50 border-red-200' :
                'text-gray-600 bg-gray-50 border-gray-200';
              return (
                <div className="space-y-3">
                  {tags.sentiment && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Sentiment:</span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded border ${sentimentColor}`}>
                        {tags.sentiment}
                      </span>
                    </div>
                  )}
                  {tags.topics && tags.topics.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Topics</p>
                      <div className="flex flex-wrap gap-1">
                        {tags.topics.map((t: string) => (
                          <span key={t} className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                            {t.replace(/_/g, ' ')}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {tags.action_items && tags.action_items.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Extracted Action Items</p>
                      <ul className="list-disc pl-4 space-y-0.5">
                        {tags.action_items.map((ai: string, i: number) => (
                          <li key={i} className="text-xs text-foreground">{ai}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {tags.keywords && tags.keywords.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Keywords</p>
                      <div className="flex flex-wrap gap-1">
                        {tags.keywords.map((k: string) => (
                          <span key={k} className="text-xs bg-muted px-2 py-0.5 rounded text-muted-foreground">
                            {k}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {/* Section 1: Meeting Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Meeting Info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="cr-subject" className="text-sm font-medium">Subject *</label>
              {isScheduledMode && prefilled ? (
                <>
                  <Input id="cr-subject" value={subject} readOnly className="bg-muted" />
                  <p className="text-xs text-muted-foreground mt-1">Pre-filled from meeting</p>
                </>
              ) : (
                <Input
                  id="cr-subject"
                  placeholder="e.g. Portfolio Review Q2 2026"
                  value={subject}
                  disabled={!isEditable}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSubject(e.target.value)}
                />
              )}
            </div>
            <div>
              <label htmlFor="cr-meeting_date" className="text-sm font-medium">Meeting Date *</label>
              {isScheduledMode && prefilled ? (
                <>
                  <Input id="cr-meeting_date" type="date" value={meetingDate} readOnly className="bg-muted" />
                  <p className="text-xs text-muted-foreground mt-1">Pre-filled from meeting</p>
                </>
              ) : (
                <Input
                  id="cr-meeting_date"
                  type="date"
                  value={meetingDate}
                  disabled={!isEditable}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMeetingDate(e.target.value)}
                />
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="cr-meeting_type" className="text-sm font-medium">Meeting Type</label>
              {isScheduledMode && prefilled ? (
                <>
                  <Input id="cr-meeting_type" value={meetingType.replace(/_/g, ' ')} readOnly className="bg-muted" />
                  <p className="text-xs text-muted-foreground mt-1">Pre-filled from meeting</p>
                </>
              ) : (
                <Select value={meetingType} onValueChange={(v: string) => setMeetingType(v)} disabled={!isEditable}>
                  <SelectTrigger id="cr-meeting_type">
                    <SelectValue placeholder="Select meeting type" />
                  </SelectTrigger>
                  <SelectContent>
                    {MEETING_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div>
              <label htmlFor="cr-meeting_reason" className="text-sm font-medium">Meeting Reason</label>
              {isScheduledMode && prefilled ? (
                <>
                  <Input id="cr-meeting_reason" value={meetingReason.replace(/_/g, ' ')} readOnly className="bg-muted" />
                  <p className="text-xs text-muted-foreground mt-1">Pre-filled from meeting</p>
                </>
              ) : (
                <Select value={meetingReason} onValueChange={(v: string) => setMeetingReason(v)} disabled={!isEditable}>
                  <SelectTrigger id="cr-meeting_reason">
                    <SelectValue placeholder="Select meeting reason" />
                  </SelectTrigger>
                  <SelectContent>
                    {MEETING_REASONS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section 2: Relationship & Context */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Relationship & Context</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="cr-relationship_name" className="text-sm font-medium">Relationship Name</label>
              {isScheduledMode && prefilled && meetingData?.relationship_name ? (
                <>
                  <Input id="cr-relationship_name" value={relationshipName} readOnly className="bg-muted" />
                  <p className="text-xs text-muted-foreground mt-1">Pre-filled from meeting</p>
                </>
              ) : (
                <Input
                  id="cr-relationship_name"
                  placeholder="Client or prospect name"
                  value={relationshipName}
                  disabled={!isEditable}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRelationshipName(e.target.value)}
                />
              )}
            </div>
            <div>
              <label htmlFor="cr-person_met" className="text-sm font-medium">Person Met</label>
              <Input
                id="cr-person_met"
                placeholder="Name of person met"
                value={personMet}
                disabled={!isEditable}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPersonMet(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="cr-client_status" className="text-sm font-medium">Client Status</label>
              <Input
                id="cr-client_status"
                placeholder="e.g. Active, Prospect"
                value={clientStatus}
                disabled={!isEditable}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setClientStatus(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="cr-state_of_mind" className="text-sm font-medium">State of Mind</label>
              <Input
                id="cr-state_of_mind"
                placeholder="e.g. Satisfied, Concerned"
                value={stateOfMind}
                disabled={!isEditable}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setStateOfMind(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section 3: Discussion */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Discussion</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label htmlFor="cr-summary" className="text-sm font-medium">Summary *</label>
            <Textarea
              id="cr-summary"
              placeholder="Brief summary of the call/meeting..."
              value={summary}
              disabled={!isEditable}
              rows={4}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setSummary(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="cr-discussion_summary" className="text-sm font-medium">Discussion Summary</label>
            <Textarea
              id="cr-discussion_summary"
              placeholder="Detailed notes on what was discussed..."
              value={discussionSummary}
              disabled={!isEditable}
              rows={3}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDiscussionSummary(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="cr-topics_discussed" className="text-sm font-medium">Topics Discussed</label>
              <Input
                id="cr-topics_discussed"
                placeholder="Comma-separated, e.g. Portfolio Review, Tax Planning"
                value={topicsStr}
                disabled={!isEditable}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTopicsStr(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">Separate tags with commas</p>
            </div>
            <div>
              <label htmlFor="cr-products_discussed" className="text-sm font-medium">Products Discussed</label>
              <Input
                id="cr-products_discussed"
                placeholder="Comma-separated, e.g. UITF, Government Securities"
                value={productsStr}
                disabled={!isEditable}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProductsStr(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">Separate tags with commas</p>
            </div>
          </div>
          <div>
            <label htmlFor="cr-outcome" className="text-sm font-medium">Outcome</label>
            <Textarea
              id="cr-outcome"
              placeholder="Describe the outcome of the meeting..."
              value={outcome}
              disabled={!isEditable}
              rows={2}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setOutcome(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Section 4: Action Items */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Action Items</CardTitle>
          {isEditable && (
            <Button size="sm" variant="outline" onClick={addActionItem}>
              <Plus className="mr-1 h-4 w-4" /> Add Action Item
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {actionItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2">
              <p className="text-sm">No action items added yet</p>
              {isEditable && (
                <Button size="sm" variant="ghost" onClick={addActionItem}>
                  <Plus className="mr-1 h-4 w-4" /> Add First Action Item
                </Button>
              )}
            </div>
          ) : (
            <div className="rounded-md border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[180px]">Title</TableHead>
                    <TableHead className="min-w-[200px]">Description</TableHead>
                    <TableHead className="min-w-[140px]">Assigned To</TableHead>
                    <TableHead className="min-w-[140px]">Due Date</TableHead>
                    <TableHead className="min-w-[120px]">Priority</TableHead>
                    {isEditable && <TableHead className="w-[60px]" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {actionItems.map((item) => (
                    <TableRow key={item._key}>
                      <TableCell>
                        <Input
                          placeholder="Action title"
                          value={item.title}
                          disabled={!isEditable}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            updateActionItem(item._key, 'title', e.target.value)
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          placeholder="Description"
                          value={item.description}
                          disabled={!isEditable}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            updateActionItem(item._key, 'description', e.target.value)
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          placeholder="User ID"
                          value={item.assigned_to}
                          disabled={!isEditable}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            updateActionItem(item._key, 'assigned_to', e.target.value)
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="date"
                          value={item.due_date}
                          disabled={!isEditable}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            updateActionItem(item._key, 'due_date', e.target.value)
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Select
                          value={item.priority}
                          onValueChange={(v: string) => updateActionItem(item._key, 'priority', v)}
                          disabled={!isEditable}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PRIORITIES.map((p) => (
                              <SelectItem key={p} value={p}>
                                <Badge variant="secondary" className={actionPriorityColors[p] || ''}>
                                  {p}
                                </Badge>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      {isEditable && (
                        <TableCell>
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label="Remove action item"
                            className="text-red-600 hover:text-red-700 dark:text-red-400"
                            onClick={() => removeActionItem(item._key)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 5: Next Steps */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Next Steps</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="followUpRequired"
              checked={followUpRequired}
              disabled={!isEditable}
              onChange={(e) => {
                setFollowUpRequired(e.target.checked);
                if (!e.target.checked) setFollowUpDate('');
              }}
              className="h-4 w-4 rounded border-gray-300 dark:border-gray-600"
            />
            <label htmlFor="followUpRequired" className="text-sm font-medium cursor-pointer">
              Follow-up Required
            </label>
          </div>
          {followUpRequired && (
            <div className="max-w-xs">
              <label htmlFor="cr-follow_up_date" className="text-sm font-medium">Follow-up Date</label>
              <Input
                id="cr-follow_up_date"
                type="date"
                value={followUpDate}
                disabled={!isEditable}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFollowUpDate(e.target.value)}
              />
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="cr-next_meeting_start" className="text-sm font-medium">Next Meeting Start</label>
              <Input
                id="cr-next_meeting_start"
                type="datetime-local"
                value={nextMeetingStart}
                disabled={!isEditable}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNextMeetingStart(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="cr-next_meeting_end" className="text-sm font-medium">Next Meeting End</label>
              <Input
                id="cr-next_meeting_end"
                type="datetime-local"
                value={nextMeetingEnd}
                disabled={!isEditable}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNextMeetingEnd(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Form Actions */}
      <div className="flex items-center justify-end gap-3 pb-8">
        <Button variant="outline" onClick={() => navigate(-1)} disabled={isSaving}>
          Cancel
        </Button>
        {isEditable && (
          <>
            <Button
              variant="outline"
              disabled={isSaving}
              onClick={() => saveDraftMutation.mutate()}
            >
              <Save className="mr-2 h-4 w-4" />
              {saveDraftMutation.isPending ? 'Saving...' : 'Save as Draft'}
            </Button>
            <Button
              disabled={!canSubmit || isSaving}
              onClick={() => submitMutation.mutate()}
            >
              <Send className="mr-2 h-4 w-4" />
              {submitMutation.isPending ? 'Submitting...' : 'Submit'}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
