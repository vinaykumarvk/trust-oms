/**
 * Unified Interaction Logger — Campaign Management Module
 *
 * Allows RMs to quickly log interactions with leads/prospects in a single flow:
 *   - Capture a campaign response (required)
 *   - Create an action item (optional)
 *   - Schedule a follow-up meeting (optional)
 *
 * Designed for max 6 clicks per the BRD requirement.
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
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from '@ui/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@ui/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@ui/components/ui/tabs';
import { toast } from 'sonner';
import { SkeletonRows } from '@/components/ui/skeleton-rows';

/* ---------- Auth helpers ---------- */

function authHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json' };
}

function fetcher<T>(url: string): Promise<T> {
  return fetch(url, { headers: authHeaders(), credentials: 'include' }).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json() as Promise<T>;
  });
}

/* ---------- Types ---------- */

interface Lead {
  id: number;
  name: string;
  email: string;
  campaign_name: string | null;
  status: string;
}

interface Campaign {
  id: number;
  name: string;
  status: string;
}

interface RecentInteraction {
  id: number;
  created_at: string;
  lead_name: string;
  campaign_name: string;
  response_type: string;
  channel: string;
  has_action_item: boolean;
  has_meeting: boolean;
}

interface InteractionPayload {
  lead_id: number;
  campaign_id: number;
  response: {
    response_type: string;
    channel: string;
    notes: string;
  };
  action_item?: {
    description: string;
    due_date: string;
    priority: string;
    assigned_to_user_id: string;
  };
  meeting?: {
    title: string;
    meeting_type: string;
    scheduled_start: string;
    scheduled_end: string;
    location?: string;
    virtual_link?: string;
  };
}

/* ---------- Constants ---------- */

const RESPONSE_TYPES = [
  'INTERESTED',
  'NOT_INTERESTED',
  'MAYBE',
  'CONVERTED',
  'NO_RESPONSE',
  'CALLBACK_REQUESTED',
] as const;

const CHANNELS = [
  'EMAIL',
  'PHONE',
  'IN_PERSON',
  'VIRTUAL',
] as const;

const PRIORITIES = [
  'LOW',
  'MEDIUM',
  'HIGH',
  'URGENT',
] as const;

const MEETING_TYPES = [
  'IN_PERSON',
  'VIRTUAL',
  'PHONE',
] as const;

const responseTypeBadgeColors: Record<string, string> = {
  INTERESTED: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  NOT_INTERESTED: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  MAYBE: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  CONVERTED: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  CALLBACK_REQUESTED: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  NO_RESPONSE: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
};

/* ---------- Skeleton helpers ---------- */

function SkeletonCard() {
  return (
    <Card>
      <CardContent className="pt-6 space-y-3">
        <div className="h-4 w-40 animate-pulse rounded bg-muted" />
        <div className="h-4 w-32 animate-pulse rounded bg-muted" />
        <div className="h-4 w-24 animate-pulse rounded bg-muted" />
      </CardContent>
    </Card>
  );
}

/* ---------- Component ---------- */

export default function InteractionLogger() {
  const queryClient = useQueryClient();

  // Lead selection state
  const [leadSearch, setLeadSearch] = useState('');
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  // Response form state (Section A)
  const [campaignId, setCampaignId] = useState('');
  const [responseType, setResponseType] = useState('');
  const [channel, setChannel] = useState('');
  const [notes, setNotes] = useState('');

  // Action item form state (Section B)
  const [includeActionItem, setIncludeActionItem] = useState(false);
  const [actionDescription, setActionDescription] = useState('');
  const [actionDueDate, setActionDueDate] = useState('');
  const [actionPriority, setActionPriority] = useState('');
  const [actionAssignedTo, setActionAssignedTo] = useState('');

  // Meeting form state (Section C)
  const [includeMeeting, setIncludeMeeting] = useState(false);
  const [meetingTitle, setMeetingTitle] = useState('');
  const [meetingType, setMeetingType] = useState('');
  const [meetingStart, setMeetingStart] = useState('');
  const [meetingEnd, setMeetingEnd] = useState('');
  const [meetingLocation, setMeetingLocation] = useState('');
  const [meetingVirtualLink, setMeetingVirtualLink] = useState('');

  // Confirmation dialog
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Active tab for bottom section
  const [activeTab, setActiveTab] = useState('recent');

  // ---- Queries ----

  const { data: leadsData, isPending: leadsPending } = useQuery<Lead[]>({
    queryKey: ['interaction-leads'],
    queryFn: () => fetcher<Lead[]>('/api/v1/leads'),
  });

  const { data: campaignsData, isPending: campaignsPending } = useQuery<Campaign[]>({
    queryKey: ['interaction-campaigns'],
    queryFn: () => fetcher<Campaign[]>('/api/v1/campaigns'),
  });

  const { data: recentData, isPending: recentPending } = useQuery<RecentInteraction[]>({
    queryKey: ['recent-interactions'],
    queryFn: () => fetcher<RecentInteraction[]>('/api/v1/campaign-responses?limit=20'),
    refetchInterval: 30000,
  });

  const leads = leadsData ?? [];
  const campaigns = campaignsData ?? [];
  const recentInteractions = recentData ?? [];

  // Filter leads by search
  const filteredLeads = leads.filter((lead: Lead) => {
    if (!leadSearch.trim()) return true;
    const term = leadSearch.toLowerCase();
    return (
      lead.name.toLowerCase().includes(term) ||
      lead.email.toLowerCase().includes(term) ||
      (lead.campaign_name ?? '').toLowerCase().includes(term)
    );
  });

  // ---- Mutation ----

  const logInteractionMutation = useMutation({
    mutationFn: (payload: InteractionPayload) =>
      fetch('/api/v1/campaign-mgmt/interactions', {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
        body: JSON.stringify(payload),
      }).then((r) => {
        if (!r.ok) {
          return r.json().then((e: { error?: string }) => {
            throw new Error(e.error || 'Failed to log interaction');
          });
        }
        return r.json();
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recent-interactions'] });
      resetForm();
      setConfirmOpen(false);
      toast.success('Interaction logged successfully');
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  // ---- Helpers ----

  function resetForm() {
    setSelectedLead(null);
    setCampaignId('');
    setResponseType('');
    setChannel('');
    setNotes('');
    setIncludeActionItem(false);
    setActionDescription('');
    setActionDueDate('');
    setActionPriority('');
    setActionAssignedTo('');
    setIncludeMeeting(false);
    setMeetingTitle('');
    setMeetingType('');
    setMeetingStart('');
    setMeetingEnd('');
    setMeetingLocation('');
    setMeetingVirtualLink('');
  }

  function buildPayload(): InteractionPayload | null {
    if (!selectedLead || !campaignId || !responseType || !channel) return null;

    const payload: InteractionPayload = {
      lead_id: selectedLead.id,
      campaign_id: parseInt(campaignId, 10),
      response: {
        response_type: responseType,
        channel: channel,
        notes: notes,
      },
    };

    if (includeActionItem && actionDescription && actionDueDate && actionPriority) {
      payload.action_item = {
        description: actionDescription,
        due_date: actionDueDate,
        priority: actionPriority,
        assigned_to_user_id: actionAssignedTo,
      };
    }

    if (includeMeeting && meetingTitle && meetingType && meetingStart && meetingEnd) {
      payload.meeting = {
        title: meetingTitle,
        meeting_type: meetingType,
        scheduled_start: meetingStart,
        scheduled_end: meetingEnd,
      };
      if (meetingType === 'IN_PERSON' && meetingLocation) {
        payload.meeting.location = meetingLocation;
      }
      if (meetingType === 'VIRTUAL' && meetingVirtualLink) {
        payload.meeting.virtual_link = meetingVirtualLink;
      }
    }

    return payload;
  }

  const isResponseValid = Boolean(selectedLead && campaignId && responseType && channel);
  const isActionItemValid = !includeActionItem || Boolean(actionDescription && actionDueDate && actionPriority);
  const isMeetingValid = !includeMeeting || Boolean(meetingTitle && meetingType && meetingStart && meetingEnd);
  const canSubmit = isResponseValid && isActionItemValid && isMeetingValid;

  function handleSubmit() {
    const payload = buildPayload();
    if (payload) {
      setConfirmOpen(true);
    }
  }

  function confirmSubmit() {
    const payload = buildPayload();
    if (payload) {
      logInteractionMutation.mutate(payload);
    }
  }

  // ---- Render ----

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Interaction Logger</h1>
        <p className="text-muted-foreground">
          Quick-capture responses, action items, and follow-up meetings
        </p>
      </div>

      {/* Lead Selector */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Select Lead</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="Search leads by name, email, or campaign..."
            value={leadSearch}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLeadSearch(e.target.value)}
          />

          {selectedLead ? (
            <div className="flex items-center justify-between rounded-md border p-4 bg-muted/50 dark:bg-muted/20">
              <div>
                <p className="font-medium">{selectedLead.name}</p>
                <p className="text-sm text-muted-foreground">{selectedLead.email}</p>
                {selectedLead.campaign_name && (
                  <Badge variant="outline" className="mt-1">{selectedLead.campaign_name}</Badge>
                )}
              </div>
              <Button variant="outline" size="sm" onClick={() => setSelectedLead(null)}>
                Change
              </Button>
            </div>
          ) : leadsPending ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 rounded-md border p-3">
                  <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                  <div className="h-4 w-48 animate-pulse rounded bg-muted" />
                  <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                </div>
              ))}
            </div>
          ) : filteredLeads.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2">
              <p>No leads found matching your search.</p>
            </div>
          ) : (
            <div className="max-h-60 overflow-y-auto rounded-md border divide-y">
              {filteredLeads.map((lead: Lead) => (
                <button
                  key={lead.id}
                  type="button"
                  className="flex items-center justify-between w-full px-4 py-3 text-left hover:bg-muted/50 dark:hover:bg-muted/20 transition-colors"
                  onClick={() => setSelectedLead(lead)}
                >
                  <div>
                    <p className="font-medium text-sm">{lead.name}</p>
                    <p className="text-xs text-muted-foreground">{lead.email}</p>
                  </div>
                  {lead.campaign_name && (
                    <Badge variant="outline" className="text-xs">{lead.campaign_name}</Badge>
                  )}
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Unified Interaction Form — only visible when a lead is selected */}
      {selectedLead && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Log Interaction for {selectedLead.name}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">

            {/* Section A: Response Capture */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Response Capture
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Campaign *</label>
                  {campaignsPending ? (
                    <div className="h-10 w-full animate-pulse rounded bg-muted mt-1" />
                  ) : (
                    <Select value={campaignId} onValueChange={(v: string) => setCampaignId(v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select campaign" />
                      </SelectTrigger>
                      <SelectContent>
                        {campaigns.map((c: Campaign) => (
                          <SelectItem key={c.id} value={String(c.id)}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                <div>
                  <label className="text-sm font-medium">Response Type *</label>
                  <Select value={responseType} onValueChange={(v: string) => setResponseType(v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select response type" />
                    </SelectTrigger>
                    <SelectContent>
                      {RESPONSE_TYPES.map((rt: typeof RESPONSE_TYPES[number]) => (
                        <SelectItem key={rt} value={rt}>
                          {rt.replace(/_/g, ' ')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm font-medium">Channel *</label>
                  <Select value={channel} onValueChange={(v: string) => setChannel(v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select channel" />
                    </SelectTrigger>
                    <SelectContent>
                      {CHANNELS.map((ch: typeof CHANNELS[number]) => (
                        <SelectItem key={ch} value={ch}>
                          {ch.replace(/_/g, ' ')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium">Notes</label>
                <textarea
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[80px] resize-y"
                  placeholder="Enter interaction notes..."
                  value={notes}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)}
                />
              </div>
            </div>

            {/* Section B: Action Item (optional, expandable) */}
            <div className="space-y-4 border-t pt-4">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="include-action-item"
                  checked={includeActionItem}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setIncludeActionItem(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <label htmlFor="include-action-item" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground cursor-pointer">
                  Add Action Item
                </label>
              </div>

              {includeActionItem && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-6">
                  <div className="md:col-span-2">
                    <label className="text-sm font-medium">Description *</label>
                    <Input
                      placeholder="Action item description"
                      value={actionDescription}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setActionDescription(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Due Date *</label>
                    <Input
                      type="date"
                      value={actionDueDate}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setActionDueDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Priority *</label>
                    <Select value={actionPriority} onValueChange={(v: string) => setActionPriority(v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select priority" />
                      </SelectTrigger>
                      <SelectContent>
                        {PRIORITIES.map((p: typeof PRIORITIES[number]) => (
                          <SelectItem key={p} value={p}>{p}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Assigned To (User ID)</label>
                    <Input
                      placeholder="e.g. user-001"
                      value={actionAssignedTo}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setActionAssignedTo(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Section C: Follow-up Meeting (optional, expandable) */}
            <div className="space-y-4 border-t pt-4">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="include-meeting"
                  checked={includeMeeting}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setIncludeMeeting(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <label htmlFor="include-meeting" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground cursor-pointer">
                  Schedule Follow-up Meeting
                </label>
              </div>

              {includeMeeting && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-6">
                  <div className="md:col-span-2">
                    <label className="text-sm font-medium">Meeting Title *</label>
                    <Input
                      placeholder="e.g. Follow-up call with prospect"
                      value={meetingTitle}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMeetingTitle(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Meeting Type *</label>
                    <Select value={meetingType} onValueChange={(v: string) => setMeetingType(v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select meeting type" />
                      </SelectTrigger>
                      <SelectContent>
                        {MEETING_TYPES.map((mt: typeof MEETING_TYPES[number]) => (
                          <SelectItem key={mt} value={mt}>{mt.replace(/_/g, ' ')}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Scheduled Start *</label>
                    <Input
                      type="datetime-local"
                      value={meetingStart}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMeetingStart(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Scheduled End *</label>
                    <Input
                      type="datetime-local"
                      value={meetingEnd}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMeetingEnd(e.target.value)}
                    />
                  </div>
                  {meetingType === 'IN_PERSON' && (
                    <div>
                      <label className="text-sm font-medium">Location</label>
                      <Input
                        placeholder="e.g. Main office, Meeting Room 3"
                        value={meetingLocation}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMeetingLocation(e.target.value)}
                      />
                    </div>
                  )}
                  {meetingType === 'VIRTUAL' && (
                    <div>
                      <label className="text-sm font-medium">Virtual Link</label>
                      <Input
                        placeholder="e.g. https://meet.google.com/..."
                        value={meetingVirtualLink}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMeetingVirtualLink(e.target.value)}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Submit */}
            <div className="flex items-center justify-end gap-3 border-t pt-4">
              <Button variant="outline" onClick={resetForm}>
                Reset
              </Button>
              <Button
                disabled={!canSubmit || logInteractionMutation.isPending}
                onClick={handleSubmit}
              >
                {logInteractionMutation.isPending ? 'Logging...' : 'Log Interaction'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Confirmation Dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Confirm Interaction</DialogTitle>
            <DialogDescription>
              Review the interaction details below before submitting.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm py-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Lead</span>
              <span className="font-medium">{selectedLead?.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Response</span>
              <Badge className={responseTypeBadgeColors[responseType] || ''} variant="secondary">
                {responseType.replace(/_/g, ' ')}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Channel</span>
              <span>{channel.replace(/_/g, ' ')}</span>
            </div>
            {includeActionItem && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Action Item</span>
                <span className="text-right max-w-[250px] truncate">{actionDescription}</span>
              </div>
            )}
            {includeMeeting && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Meeting</span>
                <span className="text-right max-w-[250px] truncate">{meetingTitle}</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={confirmSubmit}
              disabled={logInteractionMutation.isPending}
            >
              {logInteractionMutation.isPending ? 'Submitting...' : 'Confirm & Log'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Recent Interactions Table */}
      <Tabs value={activeTab} onValueChange={(v: string) => setActiveTab(v)}>
        <TabsList>
          <TabsTrigger value="recent">Recent Interactions</TabsTrigger>
        </TabsList>

        <TabsContent value="recent" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Last 20 Interactions</CardTitle>
            </CardHeader>
            <CardContent>
              {recentPending ? (
                <div className="rounded-md border overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Lead</TableHead>
                        <TableHead>Campaign</TableHead>
                        <TableHead>Response Type</TableHead>
                        <TableHead>Channel</TableHead>
                        <TableHead>Action Item?</TableHead>
                        <TableHead>Meeting?</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <SkeletonRows cols={7} />
                    </TableBody>
                  </Table>
                </div>
              ) : recentInteractions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                  <p>No interactions logged yet.</p>
                  <p className="text-sm">Select a lead above to log your first interaction.</p>
                </div>
              ) : (
                <div className="rounded-md border overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Lead</TableHead>
                        <TableHead>Campaign</TableHead>
                        <TableHead>Response Type</TableHead>
                        <TableHead>Channel</TableHead>
                        <TableHead>Action Item?</TableHead>
                        <TableHead>Meeting?</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recentInteractions.map((interaction: RecentInteraction) => (
                        <TableRow key={interaction.id}>
                          <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                            {new Date(interaction.created_at).toLocaleDateString()}{' '}
                            {new Date(interaction.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </TableCell>
                          <TableCell className="font-medium">{interaction.lead_name}</TableCell>
                          <TableCell>{interaction.campaign_name}</TableCell>
                          <TableCell>
                            <Badge
                              className={responseTypeBadgeColors[interaction.response_type] || ''}
                              variant="secondary"
                            >
                              {interaction.response_type.replace(/_/g, ' ')}
                            </Badge>
                          </TableCell>
                          <TableCell>{interaction.channel.replace(/_/g, ' ')}</TableCell>
                          <TableCell>
                            {interaction.has_action_item ? (
                              <Badge variant="outline" className="bg-blue-50 text-blue-700 dark:bg-blue-900 dark:text-blue-200">
                                Yes
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">No</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {interaction.has_meeting ? (
                              <Badge variant="outline" className="bg-purple-50 text-purple-700 dark:bg-purple-900 dark:text-purple-200">
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
      </Tabs>
    </div>
  );
}
