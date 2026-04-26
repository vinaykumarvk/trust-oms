/**
 * Opportunity Pipeline Dashboard (CRM — Phases 7 & 8)
 *
 * Kanban-style pipeline view for managing sales opportunities:
 *   - Pipeline metrics: total pipeline value, weighted value
 *   - Stage columns: IDENTIFIED, QUALIFYING, PROPOSAL, NEGOTIATION, WON, LOST
 *   - Cards with opportunity name, value, probability, expected close date
 *   - Filters: product type, date range
 *   - Create Opportunity dialog
 *   - Stage progression via "Move to next stage" button
 *   - LOST requires loss_reason dialog
 */

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@ui/components/ui/card';
import { Button } from '@ui/components/ui/button';
import { Badge } from '@ui/components/ui/badge';
import { Input } from '@ui/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@ui/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@ui/components/ui/select';
import { toast } from 'sonner';
import {
  Plus, DollarSign, TrendingUp, ArrowRight, X,
  Calendar, Briefcase, Target, ChevronRight,
} from 'lucide-react';
import { fetcher, authHeaders } from '@/lib/api';

/* ---------- Types ---------- */

interface Opportunity {
  id: number;
  name: string;
  stage: string;
  value: number;
  currency: string;
  probability: number;
  expected_close_date: string | null;
  product_type: string;
  client_name: string | null;
  description: string | null;
  loss_reason: string | null;
  created_at: string;
  updated_at: string;
}

interface PipelineStats {
  totalValue: number;
  weightedValue: number;
  count: number;
  wonCount: number;
  lostCount: number;
}

interface OpportunityListResult {
  data: Opportunity[];
  total: number;
}

interface NewOpportunityForm {
  name: string;
  product_type: string;
  value: string;
  currency: string;
  probability: string;
  expected_close_date: string;
  client_name: string;
  description: string;
}

/* ---------- Constants ---------- */

const STAGES = [
  'IDENTIFIED',
  'QUALIFYING',
  'PROPOSAL',
  'NEGOTIATION',
  'WON',
  'LOST',
] as const;

const STAGE_COLORS: Record<string, string> = {
  IDENTIFIED: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300',
  QUALIFYING: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  PROPOSAL: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
  NEGOTIATION: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300',
  WON: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  LOST: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
};

const STAGE_BORDER_COLORS: Record<string, string> = {
  IDENTIFIED: 'border-l-slate-400 dark:border-l-slate-500',
  QUALIFYING: 'border-l-blue-400 dark:border-l-blue-500',
  PROPOSAL: 'border-l-purple-400 dark:border-l-purple-500',
  NEGOTIATION: 'border-l-amber-400 dark:border-l-amber-500',
  WON: 'border-l-green-400 dark:border-l-green-500',
  LOST: 'border-l-red-400 dark:border-l-red-500',
};

const STAGE_HEADER_COLORS: Record<string, string> = {
  IDENTIFIED: 'bg-slate-50 dark:bg-slate-900/50',
  QUALIFYING: 'bg-blue-50 dark:bg-blue-950/30',
  PROPOSAL: 'bg-purple-50 dark:bg-purple-950/30',
  NEGOTIATION: 'bg-amber-50 dark:bg-amber-950/30',
  WON: 'bg-green-50 dark:bg-green-950/30',
  LOST: 'bg-red-50 dark:bg-red-950/30',
};

const DEFAULT_PROBABILITY: Record<string, number> = {
  IDENTIFIED: 10,
  QUALIFYING: 25,
  PROPOSAL: 50,
  NEGOTIATION: 75,
  WON: 100,
  LOST: 0,
};

const PRODUCT_TYPES = [
  'UITF',
  'Government Securities',
  'Corporate Bonds',
  'Equities',
  'Trust Account',
  'Estate Trust',
  'Insurance',
  'Real Estate',
  'Other',
] as const;

const INITIAL_FORM: NewOpportunityForm = {
  name: '',
  product_type: '',
  value: '',
  currency: 'PHP',
  probability: '10',
  expected_close_date: '',
  client_name: '',
  description: '',
};

/* ---------- Helpers ---------- */

function formatCurrency(value: number, currency: string = 'PHP'): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString();
}

function getNextStage(current: string): string | null {
  const order = ['IDENTIFIED', 'QUALIFYING', 'PROPOSAL', 'NEGOTIATION', 'WON'];
  const idx = order.indexOf(current);
  if (idx < 0 || idx >= order.length - 1) return null;
  return order[idx + 1];
}

/* ---------- Component ---------- */

export default function OpportunityPipeline() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [lossDialogOpen, setLossDialogOpen] = useState(false);
  const [lossTargetId, setLossTargetId] = useState<number | null>(null);
  const [lossReason, setLossReason] = useState('');
  const [newOpp, setNewOpp] = useState<NewOpportunityForm>(INITIAL_FORM);

  // Filters
  const [filterProduct, setFilterProduct] = useState('all');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  /* ---- Queries ---- */

  const { data: listResult, isPending: listPending, isError: listError } = useQuery<OpportunityListResult>({
    queryKey: ['opportunity-pipeline'],
    queryFn: () => fetcher('/api/v1/opportunities?pageSize=500'),
    refetchInterval: 15000,
  });

  const opportunities = listResult?.data ?? [];

  // Apply filters
  const filteredOpportunities = useMemo(() => {
    return opportunities.filter((opp: Opportunity) => {
      if (filterProduct !== 'all' && opp.product_type !== filterProduct) return false;
      if (filterDateFrom && opp.expected_close_date && opp.expected_close_date < filterDateFrom) return false;
      if (filterDateTo && opp.expected_close_date && opp.expected_close_date > filterDateTo) return false;
      return true;
    });
  }, [opportunities, filterProduct, filterDateFrom, filterDateTo]);

  // Group by stage
  const stageGroups: Record<string, Opportunity[]> = useMemo(() => {
    const groups: Record<string, Opportunity[]> = {};
    for (const stage of STAGES) {
      groups[stage] = [];
    }
    for (const opp of filteredOpportunities) {
      if (groups[opp.stage]) {
        groups[opp.stage].push(opp);
      }
    }
    return groups;
  }, [filteredOpportunities]);

  // Pipeline stats (exclude WON and LOST from pipeline totals)
  const stats: PipelineStats = useMemo(() => {
    const activeOpps = filteredOpportunities.filter(
      (o: Opportunity) => o.stage !== 'WON' && o.stage !== 'LOST',
    );
    const totalValue = activeOpps.reduce((sum: number, o: Opportunity) => sum + (o.value || 0), 0);
    const weightedValue = activeOpps.reduce(
      (sum: number, o: Opportunity) => sum + (o.value || 0) * ((o.probability || 0) / 100),
      0,
    );
    return {
      totalValue,
      weightedValue,
      count: activeOpps.length,
      wonCount: stageGroups['WON']?.length || 0,
      lostCount: stageGroups['LOST']?.length || 0,
    };
  }, [filteredOpportunities, stageGroups]);

  /* ---- Mutations ---- */

  const createMutation = useMutation({
    mutationFn: (data: NewOpportunityForm) =>
      fetch('/api/v1/opportunities', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          name: data.name,
          product_type: data.product_type,
          value: parseFloat(data.value) || 0,
          currency: data.currency,
          probability: parseInt(data.probability, 10) || 10,
          expected_close_date: data.expected_close_date || undefined,
          client_name: data.client_name || undefined,
          description: data.description || undefined,
          stage: 'IDENTIFIED',
        }),
      }).then((r) => {
        if (!r.ok) return r.json().then((e: { error?: string }) => { throw new Error(e.error || 'Create failed'); });
        return r.json();
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['opportunity-pipeline'] });
      setCreateOpen(false);
      setNewOpp(INITIAL_FORM);
      toast.success('Opportunity created successfully');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const moveStageMutation = useMutation({
    mutationFn: ({ id, newStage, loss_reason }: { id: number; newStage: string; loss_reason?: string }) =>
      fetch(`/api/v1/opportunities/${id}/stage`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({
          stage: newStage,
          probability: DEFAULT_PROBABILITY[newStage] ?? 0,
          loss_reason,
        }),
      }).then((r) => {
        if (!r.ok) return r.json().then((e: { error?: string }) => { throw new Error(e.error || 'Update failed'); });
        return r.json();
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['opportunity-pipeline'] });
      toast.success('Opportunity stage updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function handleMoveToStage(opp: Opportunity, targetStage: string) {
    if (targetStage === 'LOST') {
      setLossTargetId(opp.id);
      setLossReason('');
      setLossDialogOpen(true);
      return;
    }
    moveStageMutation.mutate({ id: opp.id, newStage: targetStage });
  }

  function confirmLoss() {
    if (lossTargetId != null && lossReason.trim()) {
      moveStageMutation.mutate({
        id: lossTargetId,
        newStage: 'LOST',
        loss_reason: lossReason,
      });
      setLossDialogOpen(false);
      setLossTargetId(null);
      setLossReason('');
    }
  }

  /* ---- Error state ---- */

  if (listError) {
    return (
      <div className="flex items-center justify-center py-12 text-destructive">
        <p>Failed to load data. Please try again.</p>
      </div>
    );
  }

  /* ---- Render ---- */

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Opportunity Pipeline</h1>
          <p className="text-muted-foreground">
            Track and manage sales opportunities across the pipeline
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-2 h-4 w-4" /> New Opportunity
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[540px]">
            <DialogHeader>
              <DialogTitle>Create Opportunity</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto">
              <div>
                <label className="text-sm font-medium">Opportunity Name *</label>
                <Input
                  placeholder="e.g. UITF Investment - Santos Corp"
                  value={newOpp.name}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setNewOpp({ ...newOpp, name: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="text-sm font-medium">Product Type *</label>
                <Select
                  value={newOpp.product_type}
                  onValueChange={(v: string) => setNewOpp({ ...newOpp, product_type: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select product" />
                  </SelectTrigger>
                  <SelectContent>
                    {PRODUCT_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Client Name</label>
                <Input
                  placeholder="e.g. Santos Corp"
                  value={newOpp.client_name}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setNewOpp({ ...newOpp, client_name: e.target.value })
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Value *</label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={newOpp.value}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setNewOpp({ ...newOpp, value: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Currency</label>
                  <Select
                    value={newOpp.currency}
                    onValueChange={(v: string) => setNewOpp({ ...newOpp, currency: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PHP">PHP</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Probability (%)</label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={newOpp.probability}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setNewOpp({ ...newOpp, probability: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Expected Close Date</label>
                  <Input
                    type="date"
                    value={newOpp.expected_close_date}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setNewOpp({ ...newOpp, expected_close_date: e.target.value })
                    }
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Description</label>
                <textarea
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[80px] resize-y"
                  placeholder="Opportunity details..."
                  value={newOpp.description}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                    setNewOpp({ ...newOpp, description: e.target.value })
                  }
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => createMutation.mutate(newOpp)}
                disabled={!newOpp.name || !newOpp.product_type || !newOpp.value || createMutation.isPending}
              >
                {createMutation.isPending ? 'Creating...' : 'Create Opportunity'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Pipeline Metric Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {listPending
          ? Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div className="h-4 w-20 animate-pulse rounded bg-muted" />
                  <div className="h-4 w-4 animate-pulse rounded bg-muted" />
                </CardHeader>
                <CardContent>
                  <div className="h-8 w-24 animate-pulse rounded bg-muted" />
                </CardContent>
              </Card>
            ))
          : [
              {
                label: 'Active Pipeline',
                value: stats.count,
                icon: Briefcase,
                color: 'text-blue-600',
                format: 'number' as const,
              },
              {
                label: 'Total Pipeline Value',
                value: stats.totalValue,
                icon: DollarSign,
                color: 'text-green-600',
                format: 'currency' as const,
              },
              {
                label: 'Weighted Value',
                value: stats.weightedValue,
                icon: TrendingUp,
                color: 'text-purple-600',
                format: 'currency' as const,
              },
              {
                label: 'Win / Loss',
                value: `${stats.wonCount} / ${stats.lostCount}`,
                icon: Target,
                color: 'text-amber-600',
                format: 'string' as const,
              },
            ].map((card) => (
              <Card key={card.label}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">{card.label}</CardTitle>
                  <card.icon className={`h-4 w-4 ${card.color}`} />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {card.format === 'currency'
                      ? formatCurrency(card.value as number)
                      : card.value}
                  </div>
                </CardContent>
              </Card>
            ))}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end gap-4">
            <div className="min-w-[180px]">
              <label className="text-sm font-medium">Product Type</label>
              <Select value={filterProduct} onValueChange={(v: string) => setFilterProduct(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Products</SelectItem>
                  {PRODUCT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[150px]">
              <label className="text-sm font-medium">Close Date From</label>
              <Input
                type="date"
                value={filterDateFrom}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFilterDateFrom(e.target.value)}
              />
            </div>
            <div className="min-w-[150px]">
              <label className="text-sm font-medium">Close Date To</label>
              <Input
                type="date"
                value={filterDateTo}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFilterDateTo(e.target.value)}
              />
            </div>
            {(filterProduct !== 'all' || filterDateFrom || filterDateTo) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFilterProduct('all');
                  setFilterDateFrom('');
                  setFilterDateTo('');
                }}
              >
                <X className="mr-1 h-4 w-4" /> Clear Filters
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Pipeline Columns */}
      {listPending ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-lg border p-4 space-y-3">
              <div className="h-5 w-24 animate-pulse rounded bg-muted" />
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="h-24 w-full animate-pulse rounded bg-muted" />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {STAGES.map((stage) => {
            const stageOpps = stageGroups[stage] || [];
            const stageTotal = stageOpps.reduce((sum: number, o: Opportunity) => sum + (o.value || 0), 0);

            return (
              <div key={stage} className="flex flex-col rounded-lg border bg-card">
                {/* Column header */}
                <div className={`rounded-t-lg px-3 py-2 ${STAGE_HEADER_COLORS[stage] || ''}`}>
                  <div className="flex items-center justify-between">
                    <Badge className={STAGE_COLORS[stage] || ''} variant="secondary">
                      {stage}
                    </Badge>
                    <span className="text-xs font-medium text-muted-foreground">
                      {stageOpps.length}
                    </span>
                  </div>
                  {stage !== 'WON' && stage !== 'LOST' && stageOpps.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatCurrency(stageTotal)}
                    </p>
                  )}
                </div>

                {/* Cards */}
                <div className="flex-1 space-y-2 p-2 min-h-[120px]">
                  {stageOpps.length === 0 ? (
                    <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
                      No opportunities
                    </div>
                  ) : (
                    stageOpps.map((opp: Opportunity) => {
                      const nextStage = getNextStage(opp.stage);
                      return (
                        <Card
                          key={opp.id}
                          className={`border-l-4 ${STAGE_BORDER_COLORS[opp.stage] || ''} shadow-sm`}
                        >
                          <CardContent className="p-3 space-y-2">
                            <p className="text-sm font-medium leading-tight">{opp.name}</p>
                            {opp.client_name && (
                              <p className="text-xs text-muted-foreground">{opp.client_name}</p>
                            )}
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-bold">
                                {formatCurrency(opp.value, opp.currency)}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {opp.probability}%
                              </span>
                            </div>
                            {opp.expected_close_date && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Calendar className="h-3 w-3" />
                                {formatDate(opp.expected_close_date)}
                              </div>
                            )}
                            <Badge variant="outline" className="text-xs">
                              {opp.product_type}
                            </Badge>

                            {/* Stage progression buttons */}
                            {opp.stage !== 'WON' && opp.stage !== 'LOST' && (
                              <div className="flex gap-1 pt-1">
                                {nextStage && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 text-xs flex-1"
                                    disabled={moveStageMutation.isPending}
                                    onClick={() => handleMoveToStage(opp, nextStage)}
                                  >
                                    <ArrowRight className="mr-1 h-3 w-3" />
                                    {nextStage === 'WON' ? 'Won' : 'Advance'}
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 text-xs text-red-600 hover:text-red-700 dark:text-red-400"
                                  disabled={moveStageMutation.isPending}
                                  onClick={() => handleMoveToStage(opp, 'LOST')}
                                >
                                  <X className="mr-1 h-3 w-3" /> Lost
                                </Button>
                              </div>
                            )}

                            {/* Show loss reason for LOST opportunities */}
                            {opp.stage === 'LOST' && opp.loss_reason && (
                              <p className="text-xs text-red-600 dark:text-red-400 italic">
                                {opp.loss_reason}
                              </p>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Loss Reason Dialog */}
      <Dialog open={lossDialogOpen} onOpenChange={setLossDialogOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Mark as Lost</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Please provide a reason why this opportunity was lost.
            </p>
            <div>
              <label className="text-sm font-medium">Loss Reason *</label>
              <textarea
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[80px] resize-y"
                placeholder="e.g. Competitor offered lower fees, Client decided not to proceed..."
                value={lossReason}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setLossReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLossDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!lossReason.trim() || moveStageMutation.isPending}
              onClick={confirmLoss}
            >
              {moveStageMutation.isPending ? 'Updating...' : 'Confirm Loss'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
