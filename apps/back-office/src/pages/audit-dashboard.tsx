/**
 * Audit Dashboard Page
 *
 * Features:
 *   - Summary cards (Events Today, Creates, Updates, Deletes, Most Active User)
 *   - Filter bar (Entity Type, Action, Date Range, Search)
 *   - Audit events table with expandable rows showing AuditDiffView
 *   - Hash chain verification dialog
 *   - Pagination
 */

import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest } from '@ui/lib/queryClient';
import { useToast } from '@ui/components/ui/toast';

import { Card, CardContent, CardHeader, CardTitle } from '@ui/components/ui/card';
import { Badge } from '@ui/components/ui/badge';
import { Button } from '@ui/components/ui/button';
import { Input } from '@ui/components/ui/input';
import { Skeleton } from '@ui/components/ui/skeleton';
import { Separator } from '@ui/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ui/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ui/components/ui/dialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@ui/components/ui/collapsible';

import { AuditDiffView } from '@/components/crud/AuditDiffView';

import {
  FileText,
  Plus,
  Pencil,
  Trash2,
  User,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Search,
  Shield,
  CheckCircle2,
  XCircle,
  Loader2,
  X,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AuditRecord {
  id: number;
  entity_type: string | null;
  entity_id: string | null;
  action: string | null;
  actor_id: string | null;
  actor_role: string | null;
  changes: Record<string, unknown> | null;
  previous_hash: string | null;
  record_hash: string | null;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  correlation_id: string | null;
  created_at: string;
}

interface AuditListResponse {
  data: AuditRecord[];
  total: number;
  page: number;
  pageSize: number;
}

interface AuditSummary {
  today: number;
  thisWeek: number;
  thisMonth: number;
  byAction: Array<{ action: string; count: number }>;
  topUsers: Array<{ actorId: string; actorRole: string; count: number }>;
  topEntityTypes: Array<{ entityType: string; count: number }>;
}

interface VerifyChainResult {
  valid: boolean;
  totalRecords: number;
  firstBrokenRecord?: number;
  message: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AUDIT_ACTIONS = [
  'CREATE',
  'UPDATE',
  'DELETE',
  'LOGIN',
  'LOGOUT',
  'ACCESS',
  'EXPORT',
  'AUTHORIZE',
  'REJECT',
  'REVERSE',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimestamp(ts: string | null | undefined): string {
  if (!ts) return '-';
  try {
    return new Date(ts).toLocaleString('en-PH', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return ts;
  }
}

function actionBadgeVariant(
  action: string | null,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  const upper = (action ?? '').toUpperCase();
  if (upper === 'CREATE') return 'default';
  if (upper === 'UPDATE') return 'secondary';
  if (upper === 'DELETE') return 'destructive';
  if (upper === 'AUTHORIZE') return 'default';
  if (upper === 'REJECT') return 'destructive';
  return 'outline';
}

function extractOldNew(
  changes: Record<string, unknown> | null,
): { oldValues: Record<string, unknown>; newValues: Record<string, unknown> } {
  if (!changes) return { oldValues: {}, newValues: {} };

  const oldValues: Record<string, unknown> = {};
  const newValues: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(changes)) {
    if (value && typeof value === 'object' && ('old' in (value as any) || 'new' in (value as any))) {
      oldValues[key] = (value as any).old ?? null;
      newValues[key] = (value as any).new ?? null;
    } else {
      // Flat change — treat as new value
      newValues[key] = value;
    }
  }

  return { oldValues, newValues };
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function AuditDashboardPage() {
  const { toast } = useToast();

  // State
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [entityTypeFilter, setEntityTypeFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  // Verification dialog
  const [verifyDialogOpen, setVerifyDialogOpen] = useState(false);
  const [verifyEntityType, setVerifyEntityType] = useState('');
  const [verifyEntityId, setVerifyEntityId] = useState('');
  const [verifyResult, setVerifyResult] = useState<VerifyChainResult | null>(null);

  // Build query string
  const queryString = useMemo(() => {
    const qs = new URLSearchParams();
    qs.set('page', String(page));
    qs.set('pageSize', String(pageSize));
    if (entityTypeFilter) qs.set('entityType', entityTypeFilter);
    if (actionFilter) qs.set('action', actionFilter);
    if (search) qs.set('search', search);
    if (dateFrom) qs.set('dateFrom', dateFrom);
    if (dateTo) qs.set('dateTo', dateTo);
    return qs.toString();
  }, [page, pageSize, entityTypeFilter, actionFilter, search, dateFrom, dateTo]);

  const hasFilters = !!(entityTypeFilter || actionFilter || search || dateFrom || dateTo);

  // Queries
  const summaryQuery = useQuery<AuditSummary>({
    queryKey: ['audit', 'summary'],
    queryFn: () => apiRequest('GET', '/api/v1/audit/summary'),
  });

  const listQuery = useQuery<AuditListResponse>({
    queryKey: ['audit', 'list', page, entityTypeFilter, actionFilter, search, dateFrom, dateTo],
    queryFn: () => apiRequest('GET', `/api/v1/audit?${queryString}`),
  });

  // Verify mutation
  const verifyMutation = useMutation({
    mutationFn: (params: { entityType: string; entityId: string }) =>
      apiRequest(
        'GET',
        `/api/v1/audit/verify-chain/${encodeURIComponent(params.entityType)}/${encodeURIComponent(params.entityId)}`,
      ) as Promise<VerifyChainResult>,
    onSuccess: (data) => {
      setVerifyResult(data);
    },
    onError: (err: Error) => {
      toast({
        title: 'Verification failed',
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  // Derived data
  const summary = summaryQuery.data;
  const totalPages = Math.ceil((listQuery.data?.total ?? 0) / pageSize);

  const createCount = summary?.byAction?.find((a) => a.action === 'CREATE')?.count ?? 0;
  const updateCount = summary?.byAction?.find((a) => a.action === 'UPDATE')?.count ?? 0;
  const deleteCount = summary?.byAction?.find((a) => a.action === 'DELETE')?.count ?? 0;
  const mostActiveUser = summary?.topUsers?.[0];

  const entityTypes = useMemo(() => {
    return summary?.topEntityTypes?.map((t) => t.entityType).filter(Boolean) ?? [];
  }, [summary]);

  // Handlers
  const toggleExpanded = useCallback((id: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearFilters = useCallback(() => {
    setEntityTypeFilter('');
    setActionFilter('');
    setSearch('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  }, []);

  const handleVerify = useCallback(() => {
    if (!verifyEntityType.trim() || !verifyEntityId.trim()) {
      toast({
        title: 'Both Entity Type and Entity ID are required',
        variant: 'destructive',
      });
      return;
    }
    setVerifyResult(null);
    verifyMutation.mutate({
      entityType: verifyEntityType.trim(),
      entityId: verifyEntityId.trim(),
    });
  }, [verifyEntityType, verifyEntityId, verifyMutation, toast]);

  const openVerifyFromRow = useCallback(
    (entityType: string, entityId: string) => {
      setVerifyEntityType(entityType);
      setVerifyEntityId(entityId);
      setVerifyResult(null);
      setVerifyDialogOpen(true);
    },
    [],
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Audit Trail</h1>
          <p className="text-sm text-muted-foreground">
            View and verify audit records across all entities
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            setVerifyEntityType('');
            setVerifyEntityId('');
            setVerifyResult(null);
            setVerifyDialogOpen(true);
          }}
        >
          <Shield className="mr-1.5 h-4 w-4" />
          Verify Chain
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <SummaryCard
          title="Events Today"
          value={summary?.today}
          icon={<FileText className="h-5 w-5 text-blue-600" />}
          loading={summaryQuery.isLoading}
        />
        <SummaryCard
          title="Creates"
          value={createCount}
          icon={<Plus className="h-5 w-5 text-green-600" />}
          loading={summaryQuery.isLoading}
        />
        <SummaryCard
          title="Updates"
          value={updateCount}
          icon={<Pencil className="h-5 w-5 text-amber-600" />}
          loading={summaryQuery.isLoading}
        />
        <SummaryCard
          title="Deletes"
          value={deleteCount}
          icon={<Trash2 className="h-5 w-5 text-red-600" />}
          loading={summaryQuery.isLoading}
        />
        <SummaryCard
          title="Most Active User"
          value={mostActiveUser?.count}
          subtitle={mostActiveUser?.actorId ?? '-'}
          icon={<User className="h-5 w-5 text-purple-600" />}
          loading={summaryQuery.isLoading}
        />
      </div>

      {/* Filter Bar */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-4 pb-4">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Entity Type</label>
            <Select
              value={entityTypeFilter}
              onValueChange={(v) => {
                setEntityTypeFilter(v === 'all' ? '' : v);
                setPage(1);
              }}
            >
              <SelectTrigger className="h-9 w-40">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {entityTypes.map((et) => (
                  <SelectItem key={et} value={et}>
                    {et}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Action</label>
            <Select
              value={actionFilter}
              onValueChange={(v) => {
                setActionFilter(v === 'all' ? '' : v);
                setPage(1);
              }}
            >
              <SelectTrigger className="h-9 w-36">
                <SelectValue placeholder="All Actions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                {AUDIT_ACTIONS.map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Date From</label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(1);
              }}
              className="h-9 w-36"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Date To</label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(1);
              }}
              className="h-9 w-36"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Search</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="h-9 w-48 pl-8"
              />
            </div>
          </div>

          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9">
              <X className="mr-1 h-3.5 w-3.5" />
              Clear Filters
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Audit Events Table */}
      {listQuery.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (listQuery.data?.data?.length ?? 0) === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <FileText className="mb-3 h-10 w-10" />
          <p className="text-sm">No audit records found</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Timestamp</TableHead>
                <TableHead>Entity Type</TableHead>
                <TableHead>Entity ID</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>IP Address</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {listQuery.data!.data.map((record) => {
                const isExpanded = expandedRows.has(record.id);
                const { oldValues, newValues } = extractOldNew(record.changes);
                const hasChanges =
                  Object.keys(oldValues).length > 0 ||
                  Object.keys(newValues).length > 0;

                return (
                  <Collapsible key={record.id} open={isExpanded} asChild>
                    <>
                      <CollapsibleTrigger asChild>
                        <TableRow
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => toggleExpanded(record.id)}
                        >
                          <TableCell>
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {formatTimestamp(record.created_at)}
                          </TableCell>
                          <TableCell className="font-medium">
                            {record.entity_type}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {record.entity_id ?? '-'}
                          </TableCell>
                          <TableCell>
                            <Badge variant={actionBadgeVariant(record.action)}>
                              {record.action}
                            </Badge>
                          </TableCell>
                          <TableCell>{record.actor_id ?? '-'}</TableCell>
                          <TableCell className="text-muted-foreground text-xs">
                            {record.ip_address ?? '-'}
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            {record.entity_type && record.entity_id && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                title="Verify chain for this entity"
                                onClick={() =>
                                  openVerifyFromRow(
                                    record.entity_type!,
                                    record.entity_id!,
                                  )
                                }
                              >
                                <Shield className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      </CollapsibleTrigger>
                      <CollapsibleContent asChild>
                        <TableRow>
                          <TableCell colSpan={8} className="bg-muted/30 p-4">
                            {hasChanges ? (
                              <AuditDiffView
                                oldValues={oldValues}
                                newValues={newValues}
                              />
                            ) : record.changes ? (
                              <div className="space-y-2">
                                <p className="text-xs font-medium text-muted-foreground">
                                  Raw Changes
                                </p>
                                <pre className="max-h-48 overflow-auto rounded-md bg-muted p-3 text-xs">
                                  {JSON.stringify(record.changes, null, 2)}
                                </pre>
                              </div>
                            ) : (
                              <p className="text-sm text-muted-foreground">
                                No change details recorded.
                              </p>
                            )}
                            {record.metadata &&
                              Object.keys(record.metadata).length > 0 && (
                                <div className="mt-3 space-y-1">
                                  <p className="text-xs font-medium text-muted-foreground">
                                    Metadata
                                  </p>
                                  <pre className="max-h-32 overflow-auto rounded-md bg-muted p-2 text-xs">
                                    {JSON.stringify(record.metadata, null, 2)}
                                  </pre>
                                </div>
                              )}
                          </TableCell>
                        </TableRow>
                      </CollapsibleContent>
                    </>
                  </Collapsible>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {(page - 1) * pageSize + 1}-
            {Math.min(page * pageSize, listQuery.data?.total ?? 0)} of{' '}
            {listQuery.data?.total ?? 0}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Verify Chain Dialog */}
      <Dialog open={verifyDialogOpen} onOpenChange={setVerifyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Verify Audit Chain Integrity</DialogTitle>
            <DialogDescription>
              Check the hash chain integrity for a specific entity's audit trail.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium">Entity Type</label>
                <Input
                  placeholder="e.g. portfolios"
                  value={verifyEntityType}
                  onChange={(e) => setVerifyEntityType(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Entity ID</label>
                <Input
                  placeholder="e.g. 42"
                  value={verifyEntityId}
                  onChange={(e) => setVerifyEntityId(e.target.value)}
                />
              </div>
            </div>

            {/* Verification Result */}
            {verifyResult && (
              <div
                className={`flex items-start gap-3 rounded-md border p-4 ${
                  verifyResult.valid
                    ? 'border-green-300 bg-green-50'
                    : 'border-red-300 bg-red-50'
                }`}
              >
                {verifyResult.valid ? (
                  <CheckCircle2 className="mt-0.5 h-5 w-5 text-green-600" />
                ) : (
                  <XCircle className="mt-0.5 h-5 w-5 text-red-600" />
                )}
                <div className="space-y-1">
                  <p
                    className={`text-sm font-medium ${
                      verifyResult.valid ? 'text-green-800' : 'text-red-800'
                    }`}
                  >
                    {verifyResult.valid ? 'Chain Valid' : 'Chain Broken'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {verifyResult.message}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Total records: {verifyResult.totalRecords}
                    {verifyResult.firstBrokenRecord !== undefined && (
                      <> | First broken at index: {verifyResult.firstBrokenRecord}</>
                    )}
                  </p>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setVerifyDialogOpen(false)}>
              Close
            </Button>
            <Button
              onClick={handleVerify}
              disabled={verifyMutation.isPending || !verifyEntityType.trim() || !verifyEntityId.trim()}
            >
              {verifyMutation.isPending && (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              )}
              <Shield className="mr-1.5 h-4 w-4" />
              Verify
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

function SummaryCard({
  title,
  value,
  subtitle,
  icon,
  loading,
}: {
  title: string;
  value: number | undefined;
  subtitle?: string;
  icon: React.ReactNode;
  loading: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-16" />
        ) : (
          <>
            <p className="text-2xl font-bold">{value ?? 0}</p>
            {subtitle && (
              <p className="mt-0.5 text-xs text-muted-foreground truncate">
                {subtitle}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
