/**
 * RM Handover & Delegation
 *
 * Manages the transfer of client relationships between Relationship
 * Managers, supporting permanent handovers, temporary transfers, and
 * delegations with full audit trail.
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
  ArrowRight, Users, Clock, CheckCircle, Plus, UserCheck,
  RefreshCw, AlertTriangle,
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

interface HandoverRecord {
  id: number;
  handover_code: string;
  handover_type: 'PERMANENT' | 'TEMPORARY' | 'DELEGATION';
  from_rm_id: string;
  from_rm_name: string;
  to_rm_id: string;
  to_rm_name: string;
  client_count: number;
  effective_date: string;
  end_date: string | null;
  status: string;
  reason: string | null;
  notes: string | null;
  created_at: string;
}

interface HandoverListResult {
  data: HandoverRecord[];
  total: number;
  page: number;
  pageSize: number;
  summary: {
    total: number;
    pending: number;
    completed: number;
    activeDelegations: number;
  };
}

interface CreateHandoverPayload {
  handover_type: string;
  from_rm_id: string;
  to_rm_id: string;
  client_ids: string[];
  effective_date: string;
  end_date: string;
  reason: string;
  notes: string;
}

/* ---------- Constants ---------- */

const HANDOVER_TYPES = ['PERMANENT', 'TEMPORARY', 'DELEGATION'] as const;

const typeColors: Record<string, string> = {
  PERMANENT: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  TEMPORARY: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  DELEGATION: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
};

const statusColors: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  APPROVED: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  ACTIVE: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  COMPLETED: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
  CANCELLED: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

const API = '/api/v1/rm-handovers';

/* ---------- Component ---------- */

export default function RMHandover() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);

  const [newHandover, setNewHandover] = useState({
    handover_type: '' as string,
    from_rm_id: '',
    to_rm_id: '',
    client_ids_csv: '',
    effective_date: '',
    end_date: '',
    reason: '',
    notes: '',
  });

  /* --- Compute status filter from tab --- */
  const statusFilterMap: Record<string, string> = {
    all: '',
    pending: 'PENDING',
    completed: 'COMPLETED',
  };
  const statusParam = statusFilterMap[activeTab] || '';

  /* --- Queries --- */
  const { data: handoverResult, isPending: listPending } = useQuery<HandoverListResult>({
    queryKey: ['rm-handovers', statusParam],
    queryFn: () => fetcher(`${API}?status=${statusParam}&pageSize=100`),
    refetchInterval: 15000,
  });

  const handovers = handoverResult?.data ?? [];
  const summary = handoverResult?.summary ?? { total: 0, pending: 0, completed: 0, activeDelegations: 0 };

  /* --- Mutations --- */
  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['rm-handovers'] });
  };

  const createMutation = useMutation({
    mutationFn: (payload: CreateHandoverPayload) =>
      fetch(API, {
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
      setNewHandover({
        handover_type: '',
        from_rm_id: '',
        to_rm_id: '',
        client_ids_csv: '',
        effective_date: '',
        end_date: '',
        reason: '',
        notes: '',
      });
      toast.success('Handover created successfully');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function handleCreate() {
    const clientIds = newHandover.client_ids_csv
      .split(',')
      .map((id: string) => id.trim())
      .filter((id: string) => id.length > 0);

    createMutation.mutate({
      handover_type: newHandover.handover_type,
      from_rm_id: newHandover.from_rm_id,
      to_rm_id: newHandover.to_rm_id,
      client_ids: clientIds,
      effective_date: newHandover.effective_date,
      end_date: newHandover.end_date,
      reason: newHandover.reason,
      notes: newHandover.notes,
    });
  }

  const isEndDateRequired = newHandover.handover_type === 'TEMPORARY' || newHandover.handover_type === 'DELEGATION';

  const canCreate =
    newHandover.handover_type &&
    newHandover.from_rm_id &&
    newHandover.to_rm_id &&
    newHandover.client_ids_csv.trim() &&
    newHandover.effective_date &&
    newHandover.reason &&
    (!isEndDateRequired || newHandover.end_date);

  /* --- KPI cards --- */
  const kpiCards = [
    {
      label: 'Total Handovers',
      value: summary.total,
      icon: RefreshCw,
      color: 'text-blue-600',
    },
    {
      label: 'Pending',
      value: summary.pending,
      icon: Clock,
      color: 'text-yellow-600',
    },
    {
      label: 'Completed',
      value: summary.completed,
      icon: CheckCircle,
      color: 'text-green-600',
    },
    {
      label: 'Active Delegations',
      value: summary.activeDelegations,
      icon: UserCheck,
      color: 'text-purple-600',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">RM Handover & Delegation</h1>
          <p className="text-muted-foreground">
            Transfer client relationships between Relationship Managers
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-2 h-4 w-4" /> New Handover
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[520px]">
            <DialogHeader>
              <DialogTitle>Create Handover</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <label className="text-sm font-medium">Handover Type *</label>
                <Select
                  value={newHandover.handover_type}
                  onValueChange={(v: string) => setNewHandover({ ...newHandover, handover_type: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {HANDOVER_TYPES.map((t: typeof HANDOVER_TYPES[number]) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">From RM ID *</label>
                  <Input
                    placeholder="e.g. RM-001"
                    value={newHandover.from_rm_id}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setNewHandover({ ...newHandover, from_rm_id: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">To RM ID *</label>
                  <Input
                    placeholder="e.g. RM-002"
                    value={newHandover.to_rm_id}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setNewHandover({ ...newHandover, to_rm_id: e.target.value })
                    }
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Client IDs * (comma-separated)</label>
                <Input
                  placeholder="e.g. CLT-001, CLT-002, CLT-003"
                  value={newHandover.client_ids_csv}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setNewHandover({ ...newHandover, client_ids_csv: e.target.value })
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Effective Date *</label>
                  <Input
                    type="date"
                    value={newHandover.effective_date}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setNewHandover({ ...newHandover, effective_date: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">
                    End Date {isEndDateRequired ? '*' : '(optional)'}
                  </label>
                  <Input
                    type="date"
                    value={newHandover.end_date}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setNewHandover({ ...newHandover, end_date: e.target.value })
                    }
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Reason *</label>
                <Input
                  placeholder="e.g. RM resignation, maternity leave"
                  value={newHandover.reason}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setNewHandover({ ...newHandover, reason: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="text-sm font-medium">Notes (optional)</label>
                <Input
                  placeholder="Additional notes"
                  value={newHandover.notes}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setNewHandover({ ...newHandover, notes: e.target.value })
                  }
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button
                onClick={handleCreate}
                disabled={!canCreate}
              >
                Create Handover
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {listPending
          ? Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                  <div className="h-4 w-4 animate-pulse rounded bg-muted" />
                </CardHeader>
                <CardContent>
                  <div className="h-8 w-16 animate-pulse rounded bg-muted" />
                </CardContent>
              </Card>
            ))
          : kpiCards.map((card: typeof kpiCards[number]) => (
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

      {/* Tabs & Table */}
      <Tabs value={activeTab} onValueChange={(v: string) => setActiveTab(v)}>
        <TabsList>
          <TabsTrigger value="all">
            All {summary.total ? `(${summary.total})` : ''}
          </TabsTrigger>
          <TabsTrigger value="pending">
            Pending {summary.pending ? `(${summary.pending})` : ''}
          </TabsTrigger>
          <TabsTrigger value="completed">
            Completed {summary.completed ? `(${summary.completed})` : ''}
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          {listPending ? (
            <div className="rounded-md border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Handover Code</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>From RM</TableHead>
                    <TableHead>To RM</TableHead>
                    <TableHead className="text-right">Clients</TableHead>
                    <TableHead>Effective Date</TableHead>
                    <TableHead>End Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <SkeletonRows cols={9} />
                </TableBody>
              </Table>
            </div>
          ) : handovers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
              <Users className="h-10 w-10 text-muted-foreground/50" />
              <p>No handovers found</p>
              <p className="text-sm">Create a new handover to transfer client relationships</p>
            </div>
          ) : (
            <div className="rounded-md border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Handover Code</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>From RM</TableHead>
                    <TableHead>To RM</TableHead>
                    <TableHead className="text-right">Clients</TableHead>
                    <TableHead>Effective Date</TableHead>
                    <TableHead>End Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {handovers.map((h: HandoverRecord) => (
                    <TableRow key={h.id}>
                      <TableCell className="font-mono text-sm">{h.handover_code}</TableCell>
                      <TableCell>
                        <Badge className={typeColors[h.handover_type] || ''} variant="secondary">
                          {h.handover_type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <p className="font-medium">{h.from_rm_name}</p>
                          <p className="text-muted-foreground">{h.from_rm_id}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <p className="font-medium">{h.to_rm_name}</p>
                          <p className="text-muted-foreground">{h.to_rm_id}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono">{h.client_count}</TableCell>
                      <TableCell className="text-sm">
                        {new Date(h.effective_date).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {h.end_date ? new Date(h.end_date).toLocaleDateString() : '-'}
                      </TableCell>
                      <TableCell>
                        <Badge className={statusColors[h.status] || ''} variant="secondary">
                          {h.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              toast.info(`Viewing handover ${h.handover_code}`);
                            }}
                          >
                            <ArrowRight className="mr-1 h-3 w-3" /> View
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
