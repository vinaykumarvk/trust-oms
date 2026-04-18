/**
 * Approvals Page — Approval Queue with Batch Operations
 *
 * Features:
 *   - Summary cards (Pending, Approved Today, Rejected Today, SLA Breached)
 *   - Three tabs: Pending Review, My Submissions, History
 *   - Batch approve/reject with selection
 *   - Detail sheet with diff view and review form
 *   - SLA countdown with color-coded badges
 */

import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@ui/lib/queryClient';
import { useToast } from '@ui/components/ui/toast';

import { Card, CardContent, CardHeader, CardTitle } from '@ui/components/ui/card';
import { Badge } from '@ui/components/ui/badge';
import { Button } from '@ui/components/ui/button';
import { Input } from '@ui/components/ui/input';
import { Checkbox } from '@ui/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@ui/components/ui/tabs';
import { Skeleton } from '@ui/components/ui/skeleton';
import { Textarea } from '@ui/components/ui/textarea';
import { Separator } from '@ui/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@ui/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ui/components/ui/dialog';
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
import { ScrollArea } from '@ui/components/ui/scroll-area';

import { AuditDiffView } from '@/components/crud/AuditDiffView';

import {
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Search,
  Loader2,
  Ban,
  Eye,
  Filter,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ApprovalRequest {
  id: number;
  entity_type: string | null;
  entity_id: string | null;
  action: string | null;
  approval_status: string | null;
  payload: Record<string, unknown> | null;
  previous_values: Record<string, unknown> | null;
  submitted_by: number | null;
  submitted_at: string | null;
  reviewed_by: number | null;
  reviewed_at: string | null;
  review_comment: string | null;
  sla_deadline: string | null;
  is_sla_breached: boolean | null;
  submitter_name: string | null;
  reviewer_name: string | null;
}

interface ApprovalListResponse {
  data: ApprovalRequest[];
  total: number;
  page: number;
  pageSize: number;
}

interface ApprovalSummary {
  pending: number;
  approvedToday: number;
  rejectedToday: number;
  slaBreached: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  try {
    return new Date(dateStr).toLocaleString('en-PH', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

function actionBadgeVariant(
  action: string | null,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  const lower = (action ?? '').toLowerCase();
  if (lower === 'create') return 'default';
  if (lower === 'update') return 'secondary';
  if (lower === 'delete') return 'destructive';
  return 'outline';
}

function statusBadgeVariant(
  status: string | null,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  const upper = (status ?? '').toUpperCase();
  if (upper === 'PENDING') return 'outline';
  if (upper === 'APPROVED') return 'default';
  if (upper === 'REJECTED') return 'destructive';
  return 'secondary';
}

function getCurrentUserId(): string {
  try {
    const stored = localStorage.getItem('trustoms-user');
    if (stored) {
      const user = JSON.parse(stored);
      return String(user.id ?? 'dev-user');
    }
  } catch {
    // ignore
  }
  return 'dev-user';
}

// ---------------------------------------------------------------------------
// SLA Badge Component
// ---------------------------------------------------------------------------

function SlaBadge({ deadline, breached }: { deadline: string | null; breached: boolean | null }) {
  if (breached) {
    return (
      <Badge variant="destructive" className="gap-1">
        <AlertTriangle className="h-3 w-3" />
        SLA Breached
      </Badge>
    );
  }

  if (!deadline) return <span className="text-xs text-muted-foreground">-</span>;

  const now = new Date();
  const slaDate = new Date(deadline);
  const hoursRemaining = (slaDate.getTime() - now.getTime()) / (1000 * 60 * 60);

  if (hoursRemaining <= 0) {
    return (
      <Badge variant="destructive" className="gap-1">
        <AlertTriangle className="h-3 w-3" />
        Overdue
      </Badge>
    );
  }

  if (hoursRemaining < 1) {
    return (
      <Badge className="gap-1 bg-red-500 hover:bg-red-600 text-white">
        <Clock className="h-3 w-3" />
        {Math.round(hoursRemaining * 60)}m left
      </Badge>
    );
  }

  if (hoursRemaining < 4) {
    return (
      <Badge className="gap-1 bg-yellow-500 hover:bg-yellow-600 text-white">
        <Clock className="h-3 w-3" />
        {hoursRemaining.toFixed(1)}h left
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="gap-1 text-green-700 border-green-300">
      <Clock className="h-3 w-3" />
      {hoursRemaining.toFixed(0)}h left
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function ApprovalsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // State
  const [activeTab, setActiveTab] = useState('pending');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [entityTypeFilter, setEntityTypeFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<ApprovalRequest | null>(null);
  const [reviewComment, setReviewComment] = useState('');
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [batchRejectComment, setBatchRejectComment] = useState('');

  // Derive query params from active tab
  const queryParams = useMemo(() => {
    const params: Record<string, string> = {
      page: String(page),
      pageSize: String(pageSize),
    };

    if (search) params.search = search;
    if (entityTypeFilter) params.entityType = entityTypeFilter;

    if (activeTab === 'pending') {
      params.status = 'PENDING';
    } else if (activeTab === 'my-submissions') {
      params.view = 'my-submissions';
    } else if (activeTab === 'history') {
      // No status filter — show all non-pending
      params.status = '';
    }

    return params;
  }, [activeTab, page, pageSize, search, entityTypeFilter]);

  const queryString = useMemo(() => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(queryParams)) {
      if (v) qs.set(k, v);
    }
    // For history tab, fetch approved+rejected+cancelled
    if (activeTab === 'history') {
      qs.delete('status');
    }
    return qs.toString();
  }, [queryParams, activeTab]);

  // Queries
  const summaryQuery = useQuery<ApprovalSummary>({
    queryKey: ['approvals', 'summary'],
    queryFn: () => apiRequest('GET', '/api/v1/approvals/summary'),
  });

  const listQuery = useQuery<ApprovalListResponse>({
    queryKey: ['approvals', 'list', activeTab, page, search, entityTypeFilter],
    queryFn: () => apiRequest('GET', `/api/v1/approvals?${queryString}`),
  });

  // Filter history tab data client-side
  const filteredData = useMemo(() => {
    if (!listQuery.data?.data) return [];
    if (activeTab === 'history') {
      return listQuery.data.data.filter(
        (r) => r.approval_status !== 'PENDING',
      );
    }
    return listQuery.data.data;
  }, [listQuery.data, activeTab]);

  // Mutations
  const approveMutation = useMutation({
    mutationFn: (params: { id: number; comment?: string }) =>
      apiRequest('POST', `/api/v1/approvals/${params.id}/approve`, {
        comment: params.comment,
      }),
    onSuccess: () => {
      toast({ title: 'Request approved successfully' });
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
      setDetailOpen(false);
      setReviewComment('');
    },
    onError: (err: Error) => {
      toast({ title: 'Approval failed', description: err.message, variant: 'destructive' });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (params: { id: number; comment: string }) =>
      apiRequest('POST', `/api/v1/approvals/${params.id}/reject`, {
        comment: params.comment,
      }),
    onSuccess: () => {
      toast({ title: 'Request rejected' });
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
      setDetailOpen(false);
      setReviewComment('');
    },
    onError: (err: Error) => {
      toast({ title: 'Rejection failed', description: err.message, variant: 'destructive' });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest('POST', `/api/v1/approvals/${id}/cancel`),
    onSuccess: () => {
      toast({ title: 'Request cancelled' });
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
      setDetailOpen(false);
    },
    onError: (err: Error) => {
      toast({ title: 'Cancel failed', description: err.message, variant: 'destructive' });
    },
  });

  const batchApproveMutation = useMutation({
    mutationFn: (ids: number[]) =>
      apiRequest('POST', '/api/v1/approvals/batch-approve', { ids }),
    onSuccess: (data: any) => {
      toast({
        title: `Batch approved: ${data.approved?.length ?? 0} succeeded, ${data.failed?.length ?? 0} failed`,
      });
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
      setSelectedIds(new Set());
    },
    onError: (err: Error) => {
      toast({ title: 'Batch approve failed', description: err.message, variant: 'destructive' });
    },
  });

  const batchRejectMutation = useMutation({
    mutationFn: (params: { ids: number[]; comment: string }) =>
      apiRequest('POST', '/api/v1/approvals/batch-reject', params),
    onSuccess: (data: any) => {
      toast({
        title: `Batch rejected: ${data.rejected?.length ?? 0} succeeded, ${data.failed?.length ?? 0} failed`,
      });
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
      setSelectedIds(new Set());
      setRejectDialogOpen(false);
      setBatchRejectComment('');
    },
    onError: (err: Error) => {
      toast({ title: 'Batch reject failed', description: err.message, variant: 'destructive' });
    },
  });

  // Handlers
  const handleTabChange = useCallback((tab: string) => {
    setActiveTab(tab);
    setPage(1);
    setSelectedIds(new Set());
  }, []);

  const handleToggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    if (!filteredData) return;
    if (selectedIds.size === filteredData.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredData.map((r) => r.id)));
    }
  }, [filteredData, selectedIds]);

  const handleOpenDetail = useCallback((request: ApprovalRequest) => {
    setSelectedRequest(request);
    setReviewComment('');
    setDetailOpen(true);
  }, []);

  const handleApprove = useCallback(
    (id: number) => {
      approveMutation.mutate({ id, comment: reviewComment || undefined });
    },
    [approveMutation, reviewComment],
  );

  const handleReject = useCallback(
    (id: number) => {
      if (!reviewComment.trim()) {
        toast({ title: 'Comment is required for rejection', variant: 'destructive' });
        return;
      }
      rejectMutation.mutate({ id, comment: reviewComment.trim() });
    },
    [rejectMutation, reviewComment, toast],
  );

  const handleBatchApprove = useCallback(() => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    batchApproveMutation.mutate(ids);
  }, [selectedIds, batchApproveMutation]);

  const handleBatchReject = useCallback(() => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!batchRejectComment.trim()) {
      toast({ title: 'Comment is required for batch rejection', variant: 'destructive' });
      return;
    }
    batchRejectMutation.mutate({ ids, comment: batchRejectComment.trim() });
  }, [selectedIds, batchRejectComment, batchRejectMutation, toast]);

  const totalPages = Math.ceil((listQuery.data?.total ?? 0) / pageSize);
  const isMutating =
    approveMutation.isPending ||
    rejectMutation.isPending ||
    cancelMutation.isPending ||
    batchApproveMutation.isPending ||
    batchRejectMutation.isPending;

  const summary = summaryQuery.data;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Approval Queue</h1>
        <p className="text-sm text-muted-foreground">
          Review and manage pending approval requests
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          title="Pending"
          value={summary?.pending}
          icon={<Clock className="h-5 w-5 text-blue-600" />}
          loading={summaryQuery.isLoading}
        />
        <SummaryCard
          title="Approved Today"
          value={summary?.approvedToday}
          icon={<CheckCircle className="h-5 w-5 text-green-600" />}
          loading={summaryQuery.isLoading}
        />
        <SummaryCard
          title="Rejected Today"
          value={summary?.rejectedToday}
          icon={<XCircle className="h-5 w-5 text-red-600" />}
          loading={summaryQuery.isLoading}
        />
        <SummaryCard
          title="SLA Breached"
          value={summary?.slaBreached}
          icon={<AlertTriangle className="h-5 w-5 text-orange-600" />}
          loading={summaryQuery.isLoading}
        />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <TabsList>
            <TabsTrigger value="pending">Pending Review</TabsTrigger>
            <TabsTrigger value="my-submissions">My Submissions</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          {/* Filter Bar */}
          <div className="flex items-center gap-2">
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
            <Select
              value={entityTypeFilter}
              onValueChange={(v) => {
                setEntityTypeFilter(v === 'all' ? '' : v);
                setPage(1);
              }}
            >
              <SelectTrigger className="h-9 w-40">
                <Filter className="mr-1 h-3.5 w-3.5" />
                <SelectValue placeholder="Entity Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="portfolios">Portfolios</SelectItem>
                <SelectItem value="securities">Securities</SelectItem>
                <SelectItem value="clients">Clients</SelectItem>
                <SelectItem value="counterparties">Counterparties</SelectItem>
                <SelectItem value="brokers">Brokers</SelectItem>
                <SelectItem value="users">Users</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Batch Action Bar */}
        {selectedIds.size > 0 && activeTab === 'pending' && (
          <div className="flex items-center gap-3 rounded-md bg-muted/50 px-4 py-2 mt-3">
            <span className="text-sm font-medium">
              {selectedIds.size} selected
            </span>
            <Button
              size="sm"
              onClick={handleBatchApprove}
              disabled={isMutating}
            >
              {batchApproveMutation.isPending && (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              )}
              Approve Selected
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setRejectDialogOpen(true)}
              disabled={isMutating}
            >
              Reject Selected
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelectedIds(new Set())}
            >
              Clear
            </Button>
          </div>
        )}

        {/* Table Content for All Tabs */}
        <TabsContent value="pending" className="mt-4">
          <ApprovalTable
            data={filteredData}
            loading={listQuery.isLoading}
            showCheckbox={true}
            selectedIds={selectedIds}
            onToggleSelect={handleToggleSelect}
            onSelectAll={handleSelectAll}
            onRowClick={handleOpenDetail}
            showSla={true}
          />
        </TabsContent>

        <TabsContent value="my-submissions" className="mt-4">
          <ApprovalTable
            data={filteredData}
            loading={listQuery.isLoading}
            showCheckbox={false}
            selectedIds={selectedIds}
            onToggleSelect={handleToggleSelect}
            onSelectAll={handleSelectAll}
            onRowClick={handleOpenDetail}
            showSla={true}
          />
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <ApprovalTable
            data={filteredData}
            loading={listQuery.isLoading}
            showCheckbox={false}
            selectedIds={selectedIds}
            onToggleSelect={handleToggleSelect}
            onSelectAll={handleSelectAll}
            onRowClick={handleOpenDetail}
            showSla={false}
            showStatus={true}
          />
        </TabsContent>
      </Tabs>

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

      {/* Detail Sheet */}
      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent className="sm:max-w-xl w-full overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Approval Request #{selectedRequest?.id}</SheetTitle>
            <SheetDescription>
              {selectedRequest?.entity_type} / {selectedRequest?.entity_id} -{' '}
              {selectedRequest?.action}
            </SheetDescription>
          </SheetHeader>

          {selectedRequest && (
            <div className="mt-6 space-y-6">
              {/* Entity Info */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold">Request Details</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">Entity Type</span>
                    <p className="font-medium">{selectedRequest.entity_type}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Entity ID</span>
                    <p className="font-medium">{selectedRequest.entity_id ?? '-'}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Action</span>
                    <p>
                      <Badge variant={actionBadgeVariant(selectedRequest.action)}>
                        {selectedRequest.action}
                      </Badge>
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Status</span>
                    <p>
                      <Badge variant={statusBadgeVariant(selectedRequest.approval_status)}>
                        {selectedRequest.approval_status}
                      </Badge>
                    </p>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Submitter Info */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold">Submitted By</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">Name</span>
                    <p className="font-medium">
                      {selectedRequest.submitter_name ?? `User #${selectedRequest.submitted_by}`}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Submitted At</span>
                    <p className="font-medium">
                      {formatDate(selectedRequest.submitted_at)}
                    </p>
                  </div>
                </div>
              </div>

              <Separator />

              {/* SLA Info */}
              {selectedRequest.sla_deadline && (
                <>
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold">SLA Status</h3>
                    <SlaBadge
                      deadline={selectedRequest.sla_deadline}
                      breached={selectedRequest.is_sla_breached}
                    />
                  </div>
                  <Separator />
                </>
              )}

              {/* Payload */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold">Payload</h3>
                <ScrollArea className="max-h-64">
                  <pre className="rounded-md bg-muted p-3 text-xs overflow-x-auto">
                    {JSON.stringify(selectedRequest.payload, null, 2)}
                  </pre>
                </ScrollArea>
              </div>

              {/* Diff View */}
              {selectedRequest.previous_values &&
                Object.keys(selectedRequest.previous_values).length > 0 && (
                  <>
                    <Separator />
                    <div className="space-y-3">
                      <h3 className="text-sm font-semibold">Changes (Before / After)</h3>
                      <AuditDiffView
                        oldValues={selectedRequest.previous_values}
                        newValues={(selectedRequest.payload as Record<string, unknown>) ?? {}}
                      />
                    </div>
                  </>
                )}

              {/* Existing Review */}
              {selectedRequest.reviewed_at && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold">Review</h3>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-muted-foreground">Reviewed By</span>
                        <p className="font-medium">
                          {selectedRequest.reviewer_name ??
                            `User #${selectedRequest.reviewed_by}`}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Reviewed At</span>
                        <p className="font-medium">
                          {formatDate(selectedRequest.reviewed_at)}
                        </p>
                      </div>
                    </div>
                    {selectedRequest.review_comment && (
                      <div className="text-sm">
                        <span className="text-muted-foreground">Comment</span>
                        <p className="mt-1 rounded-md bg-muted p-2">
                          {selectedRequest.review_comment}
                        </p>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Review Form (only for pending requests) */}
              {selectedRequest.approval_status === 'PENDING' && (
                <>
                  <Separator />
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold">Review Decision</h3>
                    <Textarea
                      placeholder="Add a comment (required for rejection)..."
                      value={reviewComment}
                      onChange={(e) => setReviewComment(e.target.value)}
                      rows={3}
                    />
                    <div className="flex gap-2">
                      <Button
                        onClick={() => handleApprove(selectedRequest.id)}
                        disabled={isMutating}
                        className="flex-1"
                      >
                        {approveMutation.isPending && (
                          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                        )}
                        <CheckCircle className="mr-1.5 h-4 w-4" />
                        Approve
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() => handleReject(selectedRequest.id)}
                        disabled={isMutating}
                        className="flex-1"
                      >
                        {rejectMutation.isPending && (
                          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                        )}
                        <XCircle className="mr-1.5 h-4 w-4" />
                        Reject
                      </Button>
                    </div>

                    {/* Cancel button — only if current user is submitter */}
                    {String(selectedRequest.submitted_by) === getCurrentUserId() && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => cancelMutation.mutate(selectedRequest.id)}
                        disabled={isMutating}
                        className="w-full"
                      >
                        <Ban className="mr-1.5 h-4 w-4" />
                        Cancel Request
                      </Button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Batch Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject {selectedIds.size} Requests</DialogTitle>
            <DialogDescription>
              A comment is required when rejecting approval requests.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Reason for rejection..."
            value={batchRejectComment}
            onChange={(e) => setBatchRejectComment(e.target.value)}
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleBatchReject}
              disabled={isMutating || !batchRejectComment.trim()}
            >
              {batchRejectMutation.isPending && (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              )}
              Reject All
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
  icon,
  loading,
}: {
  title: string;
  value: number | undefined;
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
          <p className="text-2xl font-bold">{value ?? 0}</p>
        )}
      </CardContent>
    </Card>
  );
}

function ApprovalTable({
  data,
  loading,
  showCheckbox,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  onRowClick,
  showSla = false,
  showStatus = false,
}: {
  data: ApprovalRequest[];
  loading: boolean;
  showCheckbox: boolean;
  selectedIds: Set<number>;
  onToggleSelect: (id: number) => void;
  onSelectAll: () => void;
  onRowClick: (request: ApprovalRequest) => void;
  showSla?: boolean;
  showStatus?: boolean;
}) {
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <CheckCircle className="mb-3 h-10 w-10" />
        <p className="text-sm">No approval requests found</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {showCheckbox && (
              <TableHead className="w-10">
                <Checkbox
                  checked={data.length > 0 && selectedIds.size === data.length}
                  onCheckedChange={onSelectAll}
                />
              </TableHead>
            )}
            <TableHead>Entity Type</TableHead>
            <TableHead>Entity ID</TableHead>
            <TableHead>Action</TableHead>
            {showStatus && <TableHead>Status</TableHead>}
            <TableHead>Submitted By</TableHead>
            <TableHead>Submitted At</TableHead>
            {showSla && <TableHead>SLA</TableHead>}
            <TableHead className="w-10"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row) => (
            <TableRow
              key={row.id}
              className="cursor-pointer hover:bg-muted/50"
              onClick={() => onRowClick(row)}
            >
              {showCheckbox && (
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={selectedIds.has(row.id)}
                    onCheckedChange={() => onToggleSelect(row.id)}
                  />
                </TableCell>
              )}
              <TableCell className="font-medium">{row.entity_type}</TableCell>
              <TableCell className="text-muted-foreground">
                {row.entity_id ?? '-'}
              </TableCell>
              <TableCell>
                <Badge variant={actionBadgeVariant(row.action)}>
                  {row.action}
                </Badge>
              </TableCell>
              {showStatus && (
                <TableCell>
                  <Badge variant={statusBadgeVariant(row.approval_status)}>
                    {row.approval_status}
                  </Badge>
                </TableCell>
              )}
              <TableCell>
                {row.submitter_name ?? `User #${row.submitted_by}`}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatDate(row.submitted_at)}
              </TableCell>
              {showSla && (
                <TableCell>
                  <SlaBadge
                    deadline={row.sla_deadline}
                    breached={row.is_sla_breached}
                  />
                </TableCell>
              )}
              <TableCell>
                <Eye className="h-4 w-4 text-muted-foreground" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
