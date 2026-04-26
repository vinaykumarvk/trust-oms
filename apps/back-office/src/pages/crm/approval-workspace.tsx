/**
 * Approval Workspace (CRM — Call Report Module)
 *
 * Two-tab approval interface for call report supervisors:
 *   - "Pending Approvals" tab: approvals waiting for action
 *     - Table: Report Code, Subject, RM Name, Meeting Date, Days Since Meeting, Filed Date, Status, Actions
 *     - PENDING -> Claim button; CLAIMED -> Review (Approve/Reject) buttons
 *     - Approve dialog with optional comments
 *     - Reject dialog with required comments
 *   - "My Decisions" tab: previously decided approvals
 *     - Table: Report Code, Subject, Decision badge, Comments, Decided Date
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Card, CardContent,
} from '@ui/components/ui/card';
import { Button } from '@ui/components/ui/button';
import { Badge } from '@ui/components/ui/badge';
import { Textarea } from '@ui/components/ui/textarea';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@ui/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@ui/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@ui/components/ui/tabs';
import { toast } from 'sonner';
import {
  CheckCircle, XCircle, FileText, Clock, Hand,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import { fetcher, mutationFn } from '@/lib/api';
import { daysSinceMeeting } from '@/lib/crm-constants';
import { SkeletonRows } from '@/components/ui/skeleton-rows';

/* ---------- Types ---------- */

interface ApprovalRecord {
  id: number;
  report_code: string;
  subject: string;
  rm_name: string;
  meeting_date: string;
  filed_date: string;
  approval_status: string; // PENDING | CLAIMED | APPROVED | REJECTED
  comments: string | null;
  decided_date: string | null;
}

interface ApprovalListResult {
  data: ApprovalRecord[];
  total: number;
  page: number;
  pageSize: number;
}

/* ---------- Constants ---------- */

const PAGE_SIZE = 20;

const approvalStatusColors: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  CLAIMED: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  APPROVED: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  REJECTED: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

/* ---------- Helpers ---------- */

/* ---------- Component ---------- */

export default function ApprovalWorkspace() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('pending');

  // Pagination state
  const [pendingPage, setPendingPage] = useState(1);
  const [decisionsPage, setDecisionsPage] = useState(1);

  // Dialog state
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [approveComments, setApproveComments] = useState('');
  const [rejectComments, setRejectComments] = useState('');

  // --- Queries ---

  const { data: pendingData, isPending: pendingLoading, isError: pendingError } = useQuery<ApprovalListResult>({
    queryKey: ['cr-approvals-pending', pendingPage],
    queryFn: () => fetcher(`/api/v1/cr-approvals?page=${pendingPage}&pageSize=${PAGE_SIZE}`),
    refetchInterval: 15_000,
  });

  const { data: decisionsData, isPending: decisionsLoading, isError: decisionsError } = useQuery<ApprovalListResult>({
    queryKey: ['cr-approvals-decisions', decisionsPage],
    queryFn: () => fetcher(`/api/v1/cr-approvals?action=APPROVED,REJECTED&page=${decisionsPage}&pageSize=${PAGE_SIZE}`),
    refetchInterval: 30_000,
  });

  const pendingApprovals = pendingData?.data ?? [];
  const pendingTotal = pendingData?.total ?? 0;
  const pendingTotalPages = Math.max(1, Math.ceil(pendingTotal / PAGE_SIZE));

  const decisions = decisionsData?.data ?? [];
  const decisionsTotal = decisionsData?.total ?? 0;
  const decisionsTotalPages = Math.max(1, Math.ceil(decisionsTotal / PAGE_SIZE));

  // --- Mutations ---

  const claimMutation = useMutation({
    mutationFn: (id: number) =>
      mutationFn('PATCH', `/api/v1/cr-approvals/${id}/claim`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cr-approvals-pending'] });
      toast.success('Approval claimed successfully');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, comments }: { id: number; comments: string }) =>
      mutationFn('PATCH', `/api/v1/cr-approvals/${id}/approve`, { comments }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cr-approvals-pending'] });
      queryClient.invalidateQueries({ queryKey: ['cr-approvals-decisions'] });
      setApproveDialogOpen(false);
      setApproveComments('');
      setSelectedId(null);
      toast.success('Call report approved');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, comments }: { id: number; comments: string }) =>
      mutationFn('PATCH', `/api/v1/cr-approvals/${id}/reject`, { comments }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cr-approvals-pending'] });
      queryClient.invalidateQueries({ queryKey: ['cr-approvals-decisions'] });
      setRejectDialogOpen(false);
      setRejectComments('');
      setSelectedId(null);
      toast.success('Call report rejected');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // --- Handlers ---

  function handleClaim(id: number) {
    claimMutation.mutate(id);
  }

  function openApproveDialog(id: number) {
    setSelectedId(id);
    setApproveComments('');
    setApproveDialogOpen(true);
  }

  function openRejectDialog(id: number) {
    setSelectedId(id);
    setRejectComments('');
    setRejectDialogOpen(true);
  }

  function handleApprove() {
    if (selectedId === null) return;
    approveMutation.mutate({ id: selectedId, comments: approveComments });
  }

  function handleReject() {
    if (selectedId === null || !rejectComments.trim()) return;
    rejectMutation.mutate({ id: selectedId, comments: rejectComments });
  }

  // --- Error state ---

  if (pendingError || decisionsError) {
    return (
      <div className="flex items-center justify-center py-12 text-destructive">
        <p>Failed to load data. Please try again.</p>
      </div>
    );
  }

  // --- Render ---

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Approval Workspace</h1>
        <p className="text-muted-foreground">
          Review, claim, and decide on call report approvals
        </p>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v: string) => setActiveTab(v)}>
        <TabsList>
          <TabsTrigger value="pending">
            <Clock className="mr-1 h-3 w-3" />
            Pending Approvals
            {pendingTotal > 0 && ` (${pendingTotal})`}
          </TabsTrigger>
          <TabsTrigger value="decisions">
            <CheckCircle className="mr-1 h-3 w-3" />
            My Decisions
            {decisionsTotal > 0 && ` (${decisionsTotal})`}
          </TabsTrigger>
        </TabsList>

        {/* ===== Pending Approvals Tab ===== */}
        <TabsContent value="pending" className="mt-4">
          <div className="rounded-md border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Report Code</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>RM Name</TableHead>
                  <TableHead>Meeting Date</TableHead>
                  <TableHead>Days Since Meeting</TableHead>
                  <TableHead>Filed Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingLoading ? (
                  <SkeletonRows cols={8} />
                ) : pendingApprovals.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8}>
                      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                        <FileText className="h-10 w-10 text-muted-foreground/50" />
                        <p>No pending approvals</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  pendingApprovals.map((approval) => {
                    const days = daysSinceMeeting(approval.meeting_date);
                    const isPending = approval.approval_status === 'PENDING';
                    const isClaimed = approval.approval_status === 'CLAIMED';

                    return (
                      <TableRow key={approval.id}>
                        <TableCell className="font-mono text-sm">
                          {approval.report_code}
                        </TableCell>
                        <TableCell className="font-medium max-w-[200px] truncate">
                          {approval.subject}
                        </TableCell>
                        <TableCell>{approval.rm_name || '-'}</TableCell>
                        <TableCell className="text-sm">
                          {approval.meeting_date
                            ? new Date(approval.meeting_date).toLocaleDateString()
                            : '-'}
                        </TableCell>
                        <TableCell className="text-sm">
                          <span className={days > 5 ? 'text-orange-600 font-medium' : ''}>
                            {days}d
                          </span>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {approval.filed_date
                            ? new Date(approval.filed_date).toLocaleDateString()
                            : '-'}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={approvalStatusColors[approval.approval_status] || ''}
                          >
                            {approval.approval_status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {isPending && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={claimMutation.isPending}
                                onClick={() => handleClaim(approval.id)}
                              >
                                <Hand className="mr-1 h-3 w-3" /> Claim
                              </Button>
                            )}
                            {isClaimed && (
                              <>
                                <Button
                                  size="sm"
                                  variant="default"
                                  onClick={() => openApproveDialog(approval.id)}
                                >
                                  <CheckCircle className="mr-1 h-3 w-3" /> Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => openRejectDialog(approval.id)}
                                >
                                  <XCircle className="mr-1 h-3 w-3" /> Reject
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pending Pagination */}
          {!pendingLoading && pendingTotal > 0 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">
                Page {pendingPage} of {pendingTotalPages} ({pendingTotal} total)
              </p>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pendingPage <= 1}
                  onClick={() => setPendingPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="mr-1 h-4 w-4" /> Prev
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pendingPage >= pendingTotalPages}
                  onClick={() => setPendingPage((p) => Math.min(pendingTotalPages, p + 1))}
                >
                  Next <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ===== My Decisions Tab ===== */}
        <TabsContent value="decisions" className="mt-4">
          <div className="rounded-md border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Report Code</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Decision</TableHead>
                  <TableHead>Comments</TableHead>
                  <TableHead>Decided Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {decisionsLoading ? (
                  <SkeletonRows cols={5} />
                ) : decisions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5}>
                      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                        <FileText className="h-10 w-10 text-muted-foreground/50" />
                        <p>No decisions yet</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  decisions.map((decision) => (
                    <TableRow key={decision.id}>
                      <TableCell className="font-mono text-sm">
                        {decision.report_code}
                      </TableCell>
                      <TableCell className="font-medium max-w-[240px] truncate">
                        {decision.subject}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={approvalStatusColors[decision.approval_status] || ''}
                        >
                          {decision.approval_status === 'APPROVED' ? 'Approved' : 'Rejected'}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[300px] text-sm">
                        {decision.comments || (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {decision.decided_date
                          ? new Date(decision.decided_date).toLocaleDateString()
                          : '-'}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Decisions Pagination */}
          {!decisionsLoading && decisionsTotal > 0 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">
                Page {decisionsPage} of {decisionsTotalPages} ({decisionsTotal} total)
              </p>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={decisionsPage <= 1}
                  onClick={() => setDecisionsPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="mr-1 h-4 w-4" /> Prev
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={decisionsPage >= decisionsTotalPages}
                  onClick={() => setDecisionsPage((p) => Math.min(decisionsTotalPages, p + 1))}
                >
                  Next <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ===== Approve Dialog ===== */}
      <Dialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Approve Call Report</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Optionally add comments before approving this call report.
            </p>
            <div>
              <label className="text-sm font-medium">Comments (optional)</label>
              <Textarea
                placeholder="Any notes or feedback..."
                value={approveComments}
                rows={3}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setApproveComments(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={approveMutation.isPending}
              onClick={handleApprove}
            >
              <CheckCircle className="mr-1 h-4 w-4" />
              {approveMutation.isPending ? 'Approving...' : 'Approve'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== Reject Dialog ===== */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Reject Call Report</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Please provide a reason for rejecting this call report. This will be shared with the author.
            </p>
            <div>
              <label className="text-sm font-medium">Comments *</label>
              <Textarea
                placeholder="Explain what needs to be corrected or added..."
                value={rejectComments}
                rows={3}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setRejectComments(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!rejectComments.trim() || rejectMutation.isPending}
              onClick={handleReject}
            >
              <XCircle className="mr-1 h-4 w-4" />
              {rejectMutation.isPending ? 'Rejecting...' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
