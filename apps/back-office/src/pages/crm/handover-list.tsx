/**
 * Handover List & Create Page (Handover & Assignment Management)
 *
 * Main page for the HAM module. Supports:
 *   - KPI dashboard cards (pending handovers, recent transfers, active delegations)
 *   - Tabbed entity selection (Lead / Prospect / Client) with multi-select grid
 *   - Incoming RM searchable dropdown
 *   - Handover reason text area
 *   - Scrutiny checklist (Client tab only)
 *   - AUM impact summary bar
 *   - Submit handover request via POST /api/v1/ham/request
 */

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@ui/components/ui/card';
import { Button } from '@ui/components/ui/button';
import { Input } from '@ui/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@ui/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@ui/components/ui/table';
import { Badge } from '@ui/components/ui/badge';
import { Checkbox } from '@ui/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@ui/components/ui/select';
import { Textarea } from '@ui/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@ui/components/ui/dialog';
import { toast } from 'sonner';
import {
  Clock, ArrowRightLeft, UserCheck, Search, Loader2, AlertCircle,
  Send, DollarSign,
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

async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

async function poster<T>(url: string, payload: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

/* ---------- Types ---------- */

interface Entity {
  entity_id: string;
  entity_name: string;
  current_rm: string;
  branch: string;
  aum: number;
}

interface EntityListResponse {
  data: Entity[];
  total: number;
  page: number;
  pageSize: number;
}

interface RMOption {
  id: string;
  name: string;
  branch: string;
}

interface RMListResponse {
  data: RMOption[];
}

interface ChecklistItem {
  id: string;
  label: string;
  required: boolean;
}

interface ChecklistConfigResponse {
  data: ChecklistItem[];
}

interface DashboardKPIs {
  pending_handovers: number;
  recent_transfers: number;
  active_delegations: number;
}

interface HandoverRequestPayload {
  entity_type: 'lead' | 'prospect' | 'client';
  outgoing_rm_id: string;
  incoming_rm_id: string;
  reason: string;
  items: { entity_id: string; entity_name: string; aum: number }[];
  scrutiny_checklist: string[];
}

type EntityTab = 'lead' | 'prospect' | 'client';

/* ---------- Constants ---------- */

const API = '/api/v1/ham';

const ENTITY_ENDPOINTS: Record<EntityTab, string> = {
  lead: `${API}/leads`,
  prospect: `${API}/prospects`,
  client: `${API}/clients`,
};

/* ---------- Helpers ---------- */

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

/* ---------- Sub-components ---------- */

function SkeletonCards() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="h-4 w-24 animate-pulse rounded bg-muted" />
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

/* ---------- Main Component ---------- */

export default function HandoverListPage() {
  const queryClient = useQueryClient();

  // UI state
  const [activeTab, setActiveTab] = useState<EntityTab>('lead');
  const [searchTerms, setSearchTerms] = useState<Record<EntityTab, string>>({
    lead: '',
    prospect: '',
    client: '',
  });
  const [selectedEntities, setSelectedEntities] = useState<Record<EntityTab, Set<string>>>({
    lead: new Set(),
    prospect: new Set(),
    client: new Set(),
  });
  const [incomingRmId, setIncomingRmId] = useState('');
  const [rmSearch, setRmSearch] = useState('');
  const [reason, setReason] = useState('');
  const [checkedScrutiny, setCheckedScrutiny] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Current search term for active tab
  const currentSearch = searchTerms[activeTab];

  /* ---------- Queries ---------- */

  // Dashboard KPIs
  const {
    data: dashboard,
    isPending: dashboardPending,
    isError: dashboardError,
  } = useQuery<DashboardKPIs>({
    queryKey: ['ham-dashboard'],
    queryFn: () => fetcher<DashboardKPIs>(`${API}/dashboard`),
    refetchInterval: 30_000,
  });

  // Entity list per tab
  const {
    data: entityResult,
    isPending: entityPending,
    isError: entityError,
  } = useQuery<EntityListResponse>({
    queryKey: ['ham-entities', activeTab, currentSearch],
    queryFn: () =>
      fetcher<EntityListResponse>(
        `${ENTITY_ENDPOINTS[activeTab]}?search=${encodeURIComponent(currentSearch)}&page=1&pageSize=25`,
      ),
  });

  const entities: Entity[] = entityResult?.data ?? [];

  // RM list (searchable)
  const { data: rmResult, isPending: rmPending } = useQuery<RMListResponse>({
    queryKey: ['ham-rms', rmSearch],
    queryFn: () =>
      fetcher<RMListResponse>(`${API}/rms?search=${encodeURIComponent(rmSearch)}`),
  });

  const rmOptions: RMOption[] = rmResult?.data ?? [];

  // Scrutiny checklist config (only needed when Client tab is active)
  const {
    data: checklistResult,
    isPending: checklistPending,
  } = useQuery<ChecklistConfigResponse>({
    queryKey: ['ham-checklist-config'],
    queryFn: () => fetcher<ChecklistConfigResponse>(`${API}/checklist-config`),
    enabled: activeTab === 'client',
  });

  const checklistItems: ChecklistItem[] = checklistResult?.data ?? [];

  /* ---------- Derived data ---------- */

  // Build a map of entity_id -> Entity for selected items across all tabs
  const allSelectedEntities = useMemo(() => {
    const result: Entity[] = [];
    // We can only reliably include entities from the currently loaded list.
    // For a real app you might cache all loaded entities -- but for simplicity,
    // we operate on the current tab's selection against the current tab's data.
    const selected = selectedEntities[activeTab];
    for (const entity of entities) {
      if (selected.has(entity.entity_id)) {
        result.push(entity);
      }
    }
    return result;
  }, [entities, selectedEntities, activeTab]);

  const selectedCount = selectedEntities[activeTab].size;
  const selectedAum = allSelectedEntities.reduce((sum, e) => sum + (e.aum ?? 0), 0);

  // Total AUM across ALL tabs for the impact bar
  const totalSelectedCount = Object.values(selectedEntities).reduce(
    (sum, set) => sum + set.size,
    0,
  );

  // For outgoing RM: derive from the first selected entity's current_rm
  const outgoingRmId = allSelectedEntities.length > 0 ? allSelectedEntities[0].current_rm : '';

  // Validation
  const canSubmit =
    selectedCount > 0 &&
    incomingRmId &&
    reason.trim().length >= 10 &&
    (activeTab !== 'client' ||
      checklistItems.filter((item) => item.required).every((item) => checkedScrutiny.has(item.id)));

  /* ---------- Mutation ---------- */

  const submitMutation = useMutation({
    mutationFn: (payload: HandoverRequestPayload) =>
      poster(`${API}/request`, payload),
    onSuccess: () => {
      toast.success('Handover request submitted successfully');
      // Reset form
      setSelectedEntities({ lead: new Set(), prospect: new Set(), client: new Set() });
      setIncomingRmId('');
      setReason('');
      setCheckedScrutiny(new Set());
      setConfirmOpen(false);
      queryClient.invalidateQueries({ queryKey: ['ham-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['ham-entities'] });
    },
    onError: (err: Error) => {
      toast.error(err.message);
      setConfirmOpen(false);
    },
  });

  function handleSubmit() {
    if (!canSubmit) return;

    const payload: HandoverRequestPayload = {
      entity_type: activeTab,
      outgoing_rm_id: outgoingRmId,
      incoming_rm_id: incomingRmId,
      reason: reason.trim(),
      items: allSelectedEntities.map((e) => ({
        entity_id: e.entity_id,
        entity_name: e.entity_name,
        aum: e.aum,
      })),
      scrutiny_checklist: activeTab === 'client' ? Array.from(checkedScrutiny) : [],
    };

    submitMutation.mutate(payload);
  }

  /* ---------- Selection helpers ---------- */

  function toggleEntity(entityId: string) {
    setSelectedEntities((prev) => {
      const current = new Set(prev[activeTab]);
      if (current.has(entityId)) {
        current.delete(entityId);
      } else {
        current.add(entityId);
      }
      return { ...prev, [activeTab]: current };
    });
  }

  function toggleAll() {
    setSelectedEntities((prev) => {
      const current = prev[activeTab];
      const allIds = entities.map((e) => e.entity_id);
      const allSelected = allIds.length > 0 && allIds.every((id) => current.has(id));
      return {
        ...prev,
        [activeTab]: allSelected ? new Set<string>() : new Set(allIds),
      };
    });
  }

  const allChecked =
    entities.length > 0 &&
    entities.every((e) => selectedEntities[activeTab].has(e.entity_id));

  /* ---------- KPI cards ---------- */

  const kpiCards = [
    {
      label: 'Pending Handovers',
      value: dashboard?.pending_handovers ?? 0,
      icon: Clock,
      color: 'text-yellow-600',
    },
    {
      label: 'Recent Transfers',
      value: dashboard?.recent_transfers ?? 0,
      icon: ArrowRightLeft,
      color: 'text-blue-600',
    },
    {
      label: 'Active Delegations',
      value: dashboard?.active_delegations ?? 0,
      icon: UserCheck,
      color: 'text-green-600',
    },
  ];

  /* ---------- Render: Entity table ---------- */

  function renderEntityTable() {
    if (entityError) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
          <AlertCircle className="h-10 w-10 text-destructive/60" />
          <p>Failed to load {activeTab}s</p>
          <p className="text-sm">Please try again later or check your connection.</p>
        </div>
      );
    }

    if (entityPending) {
      return (
        <div className="rounded-md border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead>ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Current RM</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead className="text-right">AUM</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <SkeletonRows cols={6} />
            </TableBody>
          </Table>
        </div>
      );
    }

    if (entities.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
          <Search className="h-10 w-10 text-muted-foreground/50" />
          <p>No {activeTab}s found</p>
          <p className="text-sm">
            {currentSearch ? 'Try a different search term.' : 'No records are available.'}
          </p>
        </div>
      );
    }

    return (
      <div className="rounded-md border overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allChecked}
                  onCheckedChange={toggleAll}
                  aria-label="Select all"
                />
              </TableHead>
              <TableHead>ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Current RM</TableHead>
              <TableHead>Branch</TableHead>
              <TableHead className="text-right">AUM</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entities.map((entity) => {
              const isSelected = selectedEntities[activeTab].has(entity.entity_id);
              return (
                <TableRow
                  key={entity.entity_id}
                  className={`cursor-pointer ${isSelected ? 'bg-muted/50' : ''}`}
                  onClick={() => toggleEntity(entity.entity_id)}
                >
                  <TableCell className="w-10" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleEntity(entity.entity_id)}
                      aria-label={`Select ${entity.entity_name}`}
                    />
                  </TableCell>
                  <TableCell className="font-mono text-sm">{entity.entity_id}</TableCell>
                  <TableCell className="font-medium">{entity.entity_name}</TableCell>
                  <TableCell className="text-sm">{entity.current_rm}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs">
                      {entity.branch}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(entity.aum)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    );
  }

  /* ---------- Render ---------- */

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Handover & Assignment Management</h1>
        <p className="text-muted-foreground">
          Select entities, assign an incoming RM, and submit a handover request
        </p>
      </div>

      {/* KPI Cards */}
      {dashboardPending ? (
        <SkeletonCards />
      ) : dashboardError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          <AlertCircle className="mr-2 inline h-4 w-4" />
          Failed to load dashboard metrics.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {kpiCards.map((card) => (
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

      {/* Entity Selection Tabs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Select Entities for Handover</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs
            value={activeTab}
            onValueChange={(v: string) => setActiveTab(v as EntityTab)}
          >
            <TabsList>
              <TabsTrigger value="lead">Lead</TabsTrigger>
              <TabsTrigger value="prospect">Prospect</TabsTrigger>
              <TabsTrigger value="client">Client</TabsTrigger>
            </TabsList>

            {(['lead', 'prospect', 'client'] as EntityTab[]).map((tab) => (
              <TabsContent key={tab} value={tab} className="mt-4 space-y-4">
                {/* Search */}
                <div className="relative max-w-sm">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder={`Search ${tab}s by name or ID...`}
                    className="pl-9"
                    value={searchTerms[tab]}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setSearchTerms((prev) => ({ ...prev, [tab]: e.target.value }))
                    }
                  />
                </div>

                {/* Entity table */}
                {renderEntityTable()}

                {/* Selected summary */}
                {selectedEntities[tab].size > 0 && (
                  <div className="flex items-center gap-4 rounded-md border bg-muted/30 px-4 py-3 text-sm">
                    <span className="font-medium">
                      {selectedEntities[tab].size} {tab}(s) selected
                    </span>
                    <span className="text-muted-foreground">|</span>
                    <span>
                      Total AUM: <span className="font-mono font-medium">{formatCurrency(selectedAum)}</span>
                    </span>
                  </div>
                )}
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      {/* Incoming RM & Reason */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Incoming RM */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Incoming Relationship Manager</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search RMs by name..."
                className="pl-9"
                value={rmSearch}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRmSearch(e.target.value)}
              />
            </div>
            <Select value={incomingRmId} onValueChange={setIncomingRmId}>
              <SelectTrigger>
                <SelectValue placeholder={rmPending ? 'Loading RMs...' : 'Select incoming RM'} />
              </SelectTrigger>
              <SelectContent>
                {rmOptions.length === 0 && !rmPending && (
                  <SelectItem value="__none" disabled>
                    No RMs found
                  </SelectItem>
                )}
                {rmOptions.map((rm) => (
                  <SelectItem key={rm.id} value={rm.id}>
                    {rm.name} ({rm.branch})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {outgoingRmId && (
              <p className="text-xs text-muted-foreground">
                Outgoing RM (auto-detected): <span className="font-mono">{outgoingRmId}</span>
              </p>
            )}
          </CardContent>
        </Card>

        {/* Reason */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Handover Reason</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder="Provide the reason for this handover (e.g. RM resignation, branch consolidation, client request)..."
              rows={4}
              value={reason}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setReason(e.target.value)}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              {reason.trim().length < 10
                ? `Minimum 10 characters required (${reason.trim().length}/10)`
                : `${reason.trim().length} character(s)`}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Scrutiny Checklist -- Client tab only */}
      {activeTab === 'client' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Scrutiny Checklist</CardTitle>
          </CardHeader>
          <CardContent>
            {checklistPending ? (
              <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading checklist items...
              </div>
            ) : checklistItems.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">
                No checklist items configured.
              </p>
            ) : (
              <div className="space-y-3">
                {checklistItems.map((item) => {
                  const isChecked = checkedScrutiny.has(item.id);
                  return (
                    <div key={item.id} className="flex items-start gap-3">
                      <Checkbox
                        id={`scrutiny-${item.id}`}
                        checked={isChecked}
                        onCheckedChange={(checked: boolean | 'indeterminate') => {
                          setCheckedScrutiny((prev) => {
                            const next = new Set(prev);
                            if (checked === true) {
                              next.add(item.id);
                            } else {
                              next.delete(item.id);
                            }
                            return next;
                          });
                        }}
                      />
                      <label
                        htmlFor={`scrutiny-${item.id}`}
                        className="text-sm leading-tight cursor-pointer select-none"
                      >
                        {item.label}
                        {item.required && (
                          <span className="ml-1 text-destructive">*</span>
                        )}
                      </label>
                    </div>
                  );
                })}
                <p className="text-xs text-muted-foreground pt-1">
                  Items marked with * are required before submission.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* AUM Impact Summary Bar */}
      {totalSelectedCount > 0 && (
        <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-5 py-4">
          <div className="flex items-center gap-3">
            <DollarSign className="h-5 w-5 text-blue-600" />
            <div>
              <p className="text-sm font-medium">AUM Impact Summary</p>
              <p className="text-xs text-muted-foreground">
                {totalSelectedCount} entity(ies) selected for transfer
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold font-mono">{formatCurrency(selectedAum)}</p>
            <p className="text-xs text-muted-foreground">Total AUM being transferred</p>
          </div>
        </div>
      )}

      {/* Submit */}
      <div className="flex items-center justify-end gap-3">
        <Button
          size="lg"
          disabled={!canSubmit || submitMutation.isPending}
          onClick={() => setConfirmOpen(true)}
        >
          {submitMutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Submitting...
            </>
          ) : (
            <>
              <Send className="mr-2 h-4 w-4" />
              Submit Handover Request
            </>
          )}
        </Button>
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Confirm Handover Request</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-sm">
            <p>You are about to submit a handover request with the following details:</p>
            <div className="rounded-md border bg-muted/30 p-3 space-y-1">
              <p>
                <span className="font-medium">Entity type:</span>{' '}
                <Badge variant="secondary" className="capitalize">{activeTab}</Badge>
              </p>
              <p>
                <span className="font-medium">Entities selected:</span> {selectedCount}
              </p>
              <p>
                <span className="font-medium">Total AUM:</span>{' '}
                <span className="font-mono">{formatCurrency(selectedAum)}</span>
              </p>
              <p>
                <span className="font-medium">Outgoing RM:</span>{' '}
                <span className="font-mono">{outgoingRmId || 'N/A'}</span>
              </p>
              <p>
                <span className="font-medium">Incoming RM:</span>{' '}
                <span className="font-mono">{incomingRmId}</span>
              </p>
              {activeTab === 'client' && checkedScrutiny.size > 0 && (
                <p>
                  <span className="font-medium">Scrutiny items checked:</span>{' '}
                  {checkedScrutiny.size} / {checklistItems.length}
                </p>
              )}
            </div>
            <p className="text-muted-foreground">
              This action will initiate the approval workflow. Are you sure?
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitMutation.isPending}
            >
              {submitMutation.isPending ? 'Submitting...' : 'Confirm & Submit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
