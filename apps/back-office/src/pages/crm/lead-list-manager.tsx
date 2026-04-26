/**
 * Lead List Manager (CRM / Campaign Management)
 *
 * Manages lead lists for campaign targeting in the wealth-management
 * back-office:
 *   - KPI cards: total lists, static, rule-based, total leads
 *   - Tabs: All / Static / Rule-Based
 *   - Data table with source badges, status, actions
 *   - Expand a row to view leads within a list
 *   - Create dialog (manual, import, rule-based with JSON definition)
 *   - Merge dialog (select 2+ lists, provide merged-list name)
 *   - Refresh action for rule-based lists
 */

import React, { useState } from 'react';
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
  Plus, ListPlus, Merge, RefreshCw, Eye, Trash2,
  Users, FileSpreadsheet, Cpu, ChevronDown, ChevronRight,
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

type SourceType = 'MANUAL' | 'IMPORT' | 'RULE_BASED';

interface LeadList {
  id: number;
  name: string;
  description: string | null;
  source_type: SourceType;
  rule_definition: Record<string, unknown> | null;
  total_count: number;
  status: string;
  created_at: string;
  updated_at: string;
}

interface Lead {
  id: number;
  lead_list_id: number;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  status: string;
  created_at: string;
}

interface LeadListsResponse {
  data: LeadList[];
  total: number;
}

interface LeadsResponse {
  data: Lead[];
  total: number;
}

interface CreateLeadListPayload {
  name: string;
  description: string;
  source_type: SourceType;
  rule_definition?: Record<string, unknown>;
}

/* ---------- Constants ---------- */

const API_LISTS = '/api/v1/lead-lists';
const API_LEADS = '/api/v1/leads';
const API_CAMPAIGN = '/api/v1/campaign-mgmt/lead-lists';

const SOURCE_BADGE_COLORS: Record<SourceType, string> = {
  MANUAL: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  IMPORT: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  RULE_BASED: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
};

const STATUS_BADGE_COLORS: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  DRAFT: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
  ARCHIVED: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  REFRESHING: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
};

const SOURCE_TYPES: SourceType[] = ['MANUAL', 'IMPORT', 'RULE_BASED'];

/* ---------- Component ---------- */

export default function LeadListManager() {
  const queryClient = useQueryClient();

  // UI state
  const [activeTab, setActiveTab] = useState<string>('all');
  const [createOpen, setCreateOpen] = useState<boolean>(false);
  const [mergeOpen, setMergeOpen] = useState<boolean>(false);
  const [expandedListId, setExpandedListId] = useState<number | null>(null);
  const [mergeSelectedIds, setMergeSelectedIds] = useState<number[]>([]);
  const [mergedListName, setMergedListName] = useState<string>('');

  // Create form state
  const [newList, setNewList] = useState<{
    name: string;
    description: string;
    source_type: SourceType | '';
    rule_definition: string;
  }>({
    name: '',
    description: '',
    source_type: '',
    rule_definition: '',
  });

  /* ---------- Queries ---------- */

  const { data: listsResult, isPending: listsPending } = useQuery<LeadListsResponse>({
    queryKey: ['lead-lists'],
    queryFn: () => fetcher(API_LISTS),
    refetchInterval: 30_000,
  });

  const { data: leadsResult, isPending: leadsPending } = useQuery<LeadsResponse>({
    queryKey: ['leads-in-list', expandedListId],
    queryFn: () => fetcher(`${API_LEADS}?lead_list_id=${expandedListId}`),
    enabled: expandedListId !== null,
  });

  const allLists: LeadList[] = listsResult?.data ?? [];

  // Filtered lists per tab
  const filteredLists: LeadList[] = (() => {
    if (activeTab === 'static') return allLists.filter((l: LeadList) => l.source_type === 'MANUAL' || l.source_type === 'IMPORT');
    if (activeTab === 'rule-based') return allLists.filter((l: LeadList) => l.source_type === 'RULE_BASED');
    return allLists;
  })();

  const leads: Lead[] = leadsResult?.data ?? [];

  // KPI values
  const totalLists = allLists.length;
  const staticLists = allLists.filter((l: LeadList) => l.source_type === 'MANUAL' || l.source_type === 'IMPORT').length;
  const ruleBasedLists = allLists.filter((l: LeadList) => l.source_type === 'RULE_BASED').length;
  const totalLeads = allLists.reduce((acc: number, l: LeadList) => acc + (l.total_count ?? 0), 0);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['lead-lists'] });
    queryClient.invalidateQueries({ queryKey: ['leads-in-list'] });
  };

  /* ---------- Mutations ---------- */

  const createMutation = useMutation({
    mutationFn: (payload: CreateLeadListPayload) =>
      fetch(API_LISTS, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(payload),
      }).then((r) => {
        if (!r.ok) return r.json().then((e: { error?: string }) => { throw new Error(e.error || 'Create failed'); });
        return r.json();
      }),
    onSuccess: () => {
      invalidateAll();
      setCreateOpen(false);
      setNewList({ name: '', description: '', source_type: '', rule_definition: '' });
      toast.success('Lead list created successfully');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const refreshMutation = useMutation({
    mutationFn: (listId: number) =>
      fetch(`${API_CAMPAIGN}/${listId}/refresh`, {
        method: 'POST',
        headers: authHeaders(),
      }).then((r) => {
        if (!r.ok) return r.json().then((e: { error?: string }) => { throw new Error(e.error || 'Refresh failed'); });
        return r.json();
      }),
    onSuccess: () => {
      invalidateAll();
      toast.success('Lead list refresh started');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (listId: number) =>
      fetch(`${API_LISTS}/${listId}`, {
        method: 'DELETE',
        headers: authHeaders(),
      }).then((r) => {
        if (!r.ok) return r.json().then((e: { error?: string }) => { throw new Error(e.error || 'Delete failed'); });
        return r.json();
      }),
    onSuccess: () => {
      invalidateAll();
      setExpandedListId(null);
      toast.success('Lead list deleted');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const mergeMutation = useMutation({
    mutationFn: (payload: { list_ids: number[]; name: string }) =>
      fetch(`${API_CAMPAIGN}/merge`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(payload),
      }).then((r) => {
        if (!r.ok) return r.json().then((e: { error?: string }) => { throw new Error(e.error || 'Merge failed'); });
        return r.json();
      }),
    onSuccess: () => {
      invalidateAll();
      setMergeOpen(false);
      setMergeSelectedIds([]);
      setMergedListName('');
      toast.success('Lists merged successfully');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  /* ---------- Handlers ---------- */

  function handleCreate() {
    if (!newList.name.trim() || !newList.source_type) return;

    const payload: CreateLeadListPayload = {
      name: newList.name.trim(),
      description: newList.description.trim(),
      source_type: newList.source_type as SourceType,
    };

    if (newList.source_type === 'RULE_BASED' && newList.rule_definition.trim()) {
      try {
        payload.rule_definition = JSON.parse(newList.rule_definition);
      } catch {
        toast.error('Invalid JSON in rule definition');
        return;
      }
    }

    createMutation.mutate(payload);
  }

  function handleMerge() {
    if (mergeSelectedIds.length < 2 || !mergedListName.trim()) return;
    mergeMutation.mutate({ list_ids: mergeSelectedIds, name: mergedListName.trim() });
  }

  function toggleMergeSelection(id: number) {
    setMergeSelectedIds((prev: number[]) =>
      prev.includes(id) ? prev.filter((x: number) => x !== id) : [...prev, id],
    );
  }

  function toggleExpandRow(listId: number) {
    setExpandedListId((prev: number | null) => (prev === listId ? null : listId));
  }

  /* ---------- Sub-components ---------- */

  function SkeletonCards() {
    return (
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="h-4 w-20 animate-pulse rounded bg-muted" />
              <div className="h-4 w-4 animate-pulse rounded bg-muted" />
            </CardHeader>
            <CardContent>
              <div className="h-8 w-16 animate-pulse rounded bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  function renderLeadsSubTable() {
    if (leadsPending) {
      return (
        <TableRow>
          <TableCell colSpan={7} className="bg-muted/30 p-4">
            <div className="rounded-md border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Added</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <SkeletonRows cols={6} rows={3} />
                </TableBody>
              </Table>
            </div>
          </TableCell>
        </TableRow>
      );
    }

    if (leads.length === 0) {
      return (
        <TableRow>
          <TableCell colSpan={7} className="bg-muted/30 p-4">
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2">
              <Users className="h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm">No leads in this list</p>
            </div>
          </TableCell>
        </TableRow>
      );
    }

    return (
      <TableRow>
        <TableCell colSpan={7} className="bg-muted/30 p-4">
          <div className="rounded-md border overflow-auto bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Added</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leads.map((lead: Lead) => (
                  <TableRow key={lead.id}>
                    <TableCell className="font-medium">
                      {lead.first_name} {lead.last_name}
                    </TableCell>
                    <TableCell className="text-sm">{lead.email ?? '-'}</TableCell>
                    <TableCell className="text-sm">{lead.phone ?? '-'}</TableCell>
                    <TableCell className="text-sm">{lead.company ?? '-'}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">
                        {lead.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(lead.created_at).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Showing {leads.length} lead(s)
          </p>
        </TableCell>
      </TableRow>
    );
  }

  function renderListsTable(data: LeadList[]) {
    if (listsPending) {
      return (
        <div className="rounded-md border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Name</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="text-right">Total Count</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <SkeletonRows cols={7} />
            </TableBody>
          </Table>
        </div>
      );
    }

    if (data.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
          <ListPlus className="h-10 w-10 text-muted-foreground/50" />
          <p>No lead lists found</p>
          <p className="text-sm">Create a new lead list to get started</p>
        </div>
      );
    }

    return (
      <div className="rounded-md border overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Name</TableHead>
              <TableHead>Source</TableHead>
              <TableHead className="text-right">Total Count</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((list: LeadList) => {
              const isExpanded = expandedListId === list.id;
              return (
                <React.Fragment key={list.id}>
                  <TableRow
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => toggleExpandRow(list.id)}
                  >
                    <TableCell className="w-8">
                      {isExpanded
                        ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    </TableCell>
                    <TableCell className="font-medium">{list.name}</TableCell>
                    <TableCell>
                      <Badge
                        className={SOURCE_BADGE_COLORS[list.source_type] || ''}
                        variant="secondary"
                      >
                        {list.source_type.replace(/_/g, ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {(list.total_count ?? 0).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={STATUS_BADGE_COLORS[list.status] || 'bg-gray-100 text-gray-800'}
                        variant="secondary"
                      >
                        {list.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(list.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                        {list.source_type === 'RULE_BASED' && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={refreshMutation.isPending}
                            onClick={() => refreshMutation.mutate(list.id)}
                          >
                            <RefreshCw className="mr-1 h-3 w-3" /> Refresh
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => toggleExpandRow(list.id)}
                        >
                          <Eye className="mr-1 h-3 w-3" /> View Leads
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => {
                            if (window.confirm('Are you sure you want to delete this lead list?')) {
                              deleteMutation.mutate(list.id);
                            }
                          }}
                        >
                          <Trash2 className="mr-1 h-3 w-3" /> Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  {isExpanded && renderLeadsSubTable()}
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
    );
  }

  /* ---------- Render ---------- */

  const kpiCards = [
    { label: 'Total Lists', value: totalLists, icon: ListPlus, color: 'text-primary' },
    { label: 'Static Lists', value: staticLists, icon: FileSpreadsheet, color: 'text-blue-600' },
    { label: 'Rule-Based Lists', value: ruleBasedLists, icon: Cpu, color: 'text-purple-600' },
    { label: 'Total Leads', value: totalLeads, icon: Users, color: 'text-green-600' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Lead List Manager</h1>
          <p className="text-muted-foreground">
            Create and manage lead lists for campaign targeting
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => { setMergeOpen(true); setMergeSelectedIds([]); setMergedListName(''); }}>
            <Merge className="mr-2 h-4 w-4" /> Merge Lists
          </Button>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-2 h-4 w-4" /> New Lead List
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[520px]">
              <DialogHeader>
                <DialogTitle>Create Lead List</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div>
                  <label className="text-sm font-medium">Name *</label>
                  <Input
                    placeholder="e.g. High-Net-Worth Prospects Q2"
                    value={newList.name}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setNewList({ ...newList, name: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Description</label>
                  <Input
                    placeholder="Describe the purpose of this list"
                    value={newList.description}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setNewList({ ...newList, description: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Source Type *</label>
                  <Select
                    value={newList.source_type}
                    onValueChange={(v: string) =>
                      setNewList({ ...newList, source_type: v as SourceType | '' })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select source type" />
                    </SelectTrigger>
                    <SelectContent>
                      {SOURCE_TYPES.map((st: SourceType) => (
                        <SelectItem key={st} value={st}>
                          {st.replace(/_/g, ' ')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {newList.source_type === 'RULE_BASED' && (
                  <div>
                    <label className="text-sm font-medium">Rule Definition (JSON)</label>
                    <textarea
                      className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono"
                      placeholder='{ "min_aum": 1000000, "region": "NCR" }'
                      value={newList.rule_definition}
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                        setNewList({ ...newList, rule_definition: e.target.value })
                      }
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Define criteria as a JSON object to auto-populate leads
                    </p>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={!newList.name.trim() || !newList.source_type || createMutation.isPending}
                >
                  {createMutation.isPending ? 'Creating...' : 'Create List'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* KPI Cards */}
      {listsPending ? (
        <SkeletonCards />
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {kpiCards.map((card: typeof kpiCards[number]) => (
            <Card key={card.label}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">{card.label}</CardTitle>
                <card.icon className={`h-4 w-4 ${card.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{card.value.toLocaleString()}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Tabs & Table */}
      <Tabs value={activeTab} onValueChange={(v: string) => setActiveTab(v)}>
        <TabsList>
          <TabsTrigger value="all">
            All {totalLists > 0 ? `(${totalLists})` : ''}
          </TabsTrigger>
          <TabsTrigger value="static">
            Static {staticLists > 0 ? `(${staticLists})` : ''}
          </TabsTrigger>
          <TabsTrigger value="rule-based">
            Rule-Based {ruleBasedLists > 0 ? `(${ruleBasedLists})` : ''}
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          {renderListsTable(filteredLists)}
        </TabsContent>
      </Tabs>

      {/* Merge Dialog */}
      <Dialog open={mergeOpen} onOpenChange={setMergeOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Merge Lead Lists</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium">Merged List Name *</label>
              <Input
                placeholder="e.g. Combined Q2 Prospects"
                value={mergedListName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setMergedListName(e.target.value)
                }
              />
            </div>
            <div>
              <label className="text-sm font-medium">
                Select Lists to Merge (min 2) *
              </label>
              {allLists.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">
                  No lists available to merge
                </p>
              ) : (
                <div className="max-h-[240px] overflow-y-auto rounded-md border mt-2">
                  {allLists.map((list: LeadList) => {
                    const isSelected = mergeSelectedIds.includes(list.id);
                    return (
                      <div
                        key={list.id}
                        className={`flex items-center gap-3 px-3 py-2 border-b last:border-b-0 cursor-pointer hover:bg-muted/50 ${
                          isSelected ? 'bg-muted' : ''
                        }`}
                        onClick={() => toggleMergeSelection(list.id)}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleMergeSelection(list.id)}
                          className="h-4 w-4 rounded border-gray-300"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{list.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {list.source_type.replace(/_/g, ' ')} -- {list.total_count} leads
                          </p>
                        </div>
                        <Badge
                          className={SOURCE_BADGE_COLORS[list.source_type] || ''}
                          variant="secondary"
                        >
                          {list.source_type.replace(/_/g, ' ')}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              )}
              {mergeSelectedIds.length > 0 && (
                <p className="text-xs text-muted-foreground mt-2">
                  {mergeSelectedIds.length} list(s) selected
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMergeOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleMerge}
              disabled={mergeSelectedIds.length < 2 || !mergedListName.trim() || mergeMutation.isPending}
            >
              {mergeMutation.isPending ? 'Merging...' : 'Merge Lists'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
