/**
 * Client Portal - Investment Proposals Page
 *
 * Features:
 * - List of proposals for the current client
 * - Status filter (pending, accepted, rejected, expired)
 * - Detail view with line items and allocation
 * - Accept / Reject actions for PENDING_CLIENT proposals
 * - Rejection reason input
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@ui/lib/queryClient";
import { apiUrl } from "@ui/lib/api-url";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@ui/components/ui/card";
import { Button } from "@ui/components/ui/button";
import { Badge } from "@ui/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@ui/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ui/components/ui/select";
import {
  FileSpreadsheet,
  CheckCircle,
  XCircle,
  Eye,
  Filter,
  Clock,
  PieChart,
} from "lucide-react";
import { useToast } from "@ui/components/ui/toast";

// ---- Helpers ----

function formatCurrency(value: number, currency = "PHP"): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "border-gray-200 text-gray-600 bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:bg-gray-800",
  PENDING_APPROVAL: "border-amber-200 text-amber-700 bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:bg-amber-900/30",
  APPROVED: "border-blue-200 text-blue-700 bg-blue-50 dark:border-blue-800 dark:text-blue-400 dark:bg-blue-900/30",
  PENDING_CLIENT: "border-teal-200 text-teal-700 bg-teal-50 dark:border-teal-800 dark:text-teal-400 dark:bg-teal-900/30",
  CLIENT_ACCEPTED: "border-emerald-200 text-emerald-700 bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:bg-emerald-900/30",
  CLIENT_REJECTED: "border-red-200 text-red-700 bg-red-50 dark:border-red-800 dark:text-red-400 dark:bg-red-900/30",
  EXPIRED: "border-gray-200 text-gray-500 bg-gray-50 dark:border-gray-700 dark:text-gray-500 dark:bg-gray-800",
};

function statusBadgeClass(status: string): string {
  return STATUS_COLORS[status] || STATUS_COLORS.DRAFT;
}

const ALLOCATION_COLORS = [
  "bg-teal-500",
  "bg-blue-500",
  "bg-amber-500",
  "bg-purple-500",
  "bg-rose-500",
  "bg-emerald-500",
];

// ---- Types ----

interface Proposal {
  id: number;
  proposal_number: string;
  customer_id: string;
  portfolio_id: string;
  risk_profile_id: number | null;
  status: string;
  total_amount: number;
  currency: string;
  notes: string | null;
  expires_at: string | null;
  created_at: string;
  created_by: string;
}

interface LineItem {
  id: number;
  security_name: string;
  asset_class: string;
  isin: string | null;
  proposed_weight: number;
  proposed_amount: number;
  currency: string;
  risk_rating: string | null;
  rationale: string | null;
}

interface ProposalDetail extends Proposal {
  lineItems: LineItem[];
}

// ---- Status filter options ----

const STATUS_OPTIONS = [
  { value: "all", label: "All Proposals" },
  { value: "PENDING_CLIENT", label: "Pending Your Decision" },
  { value: "CLIENT_ACCEPTED", label: "Accepted" },
  { value: "CLIENT_REJECTED", label: "Rejected" },
  { value: "EXPIRED", label: "Expired" },
];

// ---- Component ----

export default function ProposalsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  // Fetch proposals list — clientId derived from session on the server
  const { data: listData, isLoading } = useQuery({
    queryKey: ["client-portal", "proposals"],
    queryFn: () =>
      apiRequest(
        "GET",
        apiUrl(`/api/v1/client-portal/proposals`),
      ),
  });

  const allProposals: Proposal[] = listData?.proposals ?? [];

  // Apply status filter
  const filteredProposals =
    statusFilter === "all"
      ? allProposals
      : allProposals.filter((p) => p.status === statusFilter);

  // Count pending
  const pendingCount = allProposals.filter(
    (p) => p.status === "PENDING_CLIENT",
  ).length;

  // Fetch single proposal detail
  const { data: detailData, isLoading: detailLoading } = useQuery({
    queryKey: ["client-portal", "proposal-detail", selectedId],
    queryFn: () =>
      apiRequest(
        "GET",
        apiUrl(`/api/v1/client-portal/proposals/detail/${selectedId}`),
      ),
    enabled: selectedId !== null,
  });

  const detail: ProposalDetail | null = detailData?.proposal ?? null;

  // Accept mutation
  const acceptMutation = useMutation({
    mutationFn: (proposalId: number) =>
      apiRequest(
        "POST",
        apiUrl(`/api/v1/client-portal/proposals/${proposalId}/accept`),
        {},
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-portal", "proposals"] });
      queryClient.invalidateQueries({ queryKey: ["client-portal", "proposal-detail"] });
      toast({ title: "Proposal Accepted", description: "Your acceptance has been recorded." });
      setSelectedId(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to accept the proposal. Please try again.", variant: "destructive" });
    },
  });

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: ({ proposalId, reason }: { proposalId: number; reason: string }) =>
      apiRequest(
        "POST",
        apiUrl(`/api/v1/client-portal/proposals/${proposalId}/reject`),
        { reason },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-portal", "proposals"] });
      queryClient.invalidateQueries({ queryKey: ["client-portal", "proposal-detail"] });
      toast({ title: "Proposal Rejected", description: "Your response has been recorded." });
      setRejectDialogOpen(false);
      setRejectReason("");
      setSelectedId(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to reject the proposal. Please try again.", variant: "destructive" });
    },
  });

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground dark:text-white">
            Investment Proposals
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground dark:text-gray-400 mt-1">
            Review and respond to investment proposals from your Relationship
            Manager
          </p>
        </div>
        {pendingCount > 0 && (
          <Badge className="bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400 text-sm px-3 py-1 self-start">
            {pendingCount} pending your decision
          </Badge>
        )}
      </div>

      {/* Filters */}
      <Card className="border-border dark:border-gray-700 dark:bg-gray-800">
        <CardContent className="p-3 sm:p-4">
          <div className="flex items-center gap-3">
            <Filter className="h-4 w-4 text-muted-foreground dark:text-gray-400" />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[220px] border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground ml-auto">
              {filteredProposals.length} proposal
              {filteredProposals.length !== 1 ? "s" : ""}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Proposals List */}
      <Card className="border-border dark:border-gray-700 dark:bg-gray-800">
        <CardHeader className="pb-3 px-3 sm:px-6">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-muted-foreground dark:text-gray-400" />
            <CardTitle className="text-sm sm:text-base text-foreground dark:text-gray-100">
              Proposals
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-4 border-teal-600 border-t-transparent" />
            </div>
          ) : filteredProposals.length > 0 ? (
            <>
              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm min-w-[700px]">
                  <thead>
                    <tr className="border-b border-border dark:border-gray-600 bg-muted/80 dark:bg-gray-700/50">
                      <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Proposal #
                      </th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Status
                      </th>
                      <th className="text-right py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Amount
                      </th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Date
                      </th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Expires
                      </th>
                      <th className="text-right py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProposals.map((p) => (
                      <tr
                        key={p.id}
                        className="border-b border-border dark:border-gray-700 last:border-0 hover:bg-muted/50 dark:hover:bg-gray-700/50 transition-colors"
                      >
                        <td className="py-3 px-4 font-medium text-foreground dark:text-gray-100">
                          {p.proposal_number}
                        </td>
                        <td className="py-3 px-4">
                          <Badge
                            variant="outline"
                            className={`text-xs ${statusBadgeClass(p.status)}`}
                          >
                            {p.status.replace(/_/g, " ")}
                          </Badge>
                        </td>
                        <td className="text-right py-3 px-4 font-medium text-foreground dark:text-gray-100 tabular-nums">
                          {formatCurrency(Number(p.total_amount), p.currency)}
                        </td>
                        <td className="py-3 px-4 text-muted-foreground dark:text-gray-400">
                          {formatDate(p.created_at)}
                        </td>
                        <td className="py-3 px-4 text-muted-foreground dark:text-gray-400">
                          {formatDate(p.expires_at)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedId(p.id)}
                          >
                            <Eye className="h-3.5 w-3.5 mr-1.5" />
                            View
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="sm:hidden divide-y divide-border dark:divide-gray-700">
                {filteredProposals.map((p) => (
                  <div key={p.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-foreground dark:text-gray-100">
                          {p.proposal_number}
                        </p>
                        <Badge
                          variant="outline"
                          className={`text-xs mt-1 ${statusBadgeClass(p.status)}`}
                        >
                          {p.status.replace(/_/g, " ")}
                        </Badge>
                        <p className="text-sm font-medium text-foreground dark:text-gray-200 mt-1">
                          {formatCurrency(Number(p.total_amount), p.currency)}
                        </p>
                        <p className="text-xs text-muted-foreground dark:text-gray-400 mt-0.5">
                          {formatDate(p.created_at)}
                          {p.expires_at &&
                            ` · Expires ${formatDate(p.expires_at)}`}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0"
                        onClick={() => setSelectedId(p.id)}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="text-center py-8">
              <FileSpreadsheet className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                No proposals found matching your filter
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Proposal Detail Dialog */}
      <Dialog
        open={selectedId !== null}
        onOpenChange={(open) => !open && setSelectedId(null)}
      >
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Proposal {detail?.proposal_number || ""}
            </DialogTitle>
          </DialogHeader>

          {detailLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-4 border-teal-600 border-t-transparent" />
            </div>
          ) : detail ? (
            <div className="space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <Badge
                    variant="outline"
                    className={`text-xs mt-1 ${statusBadgeClass(detail.status)}`}
                  >
                    {detail.status.replace(/_/g, " ")}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total Amount</p>
                  <p className="font-semibold text-foreground mt-1">
                    {formatCurrency(Number(detail.total_amount), detail.currency)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Created</p>
                  <p className="text-foreground mt-1">
                    {formatDate(detail.created_at)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Expires</p>
                  <p className="text-foreground mt-1">
                    {formatDate(detail.expires_at)}
                  </p>
                </div>
              </div>

              {detail.notes && (
                <div className="text-sm">
                  <p className="text-xs text-muted-foreground mb-1">Notes</p>
                  <p className="text-foreground bg-muted/50 dark:bg-gray-700/50 rounded p-2">
                    {detail.notes}
                  </p>
                </div>
              )}

              {/* Line Items */}
              {detail.lineItems && detail.lineItems.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <PieChart className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm font-medium text-foreground">
                      Proposed Investments
                    </p>
                  </div>

                  {detail.lineItems.some((li: any) => li.risk_rating) && (
                    <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 p-3 mb-3 flex items-start gap-2">
                      <div className="mt-0.5 flex-shrink-0">
                        <svg className="h-4 w-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-amber-800 dark:text-amber-400">Risk Rating Notice</p>
                        <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                          One or more products in this proposal have risk ratings. Your Relationship Manager has confirmed all product risk ratings with you.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Allocation bar */}
                  <div className="flex h-6 rounded-full overflow-hidden mb-3">
                    {detail.lineItems.map((li, i) => (
                      <div
                        key={li.id}
                        className={`${ALLOCATION_COLORS[i % ALLOCATION_COLORS.length]} transition-all`}
                        style={{
                          width: `${Math.max(Number(li.proposed_weight), 2)}%`,
                        }}
                        title={`${li.security_name}: ${li.proposed_weight}%`}
                      />
                    ))}
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border dark:border-gray-600">
                          <th className="text-left py-2 text-xs font-medium text-muted-foreground">
                            Security
                          </th>
                          <th className="text-right py-2 text-xs font-medium text-muted-foreground">
                            Weight %
                          </th>
                          <th className="text-right py-2 text-xs font-medium text-muted-foreground">
                            Amount
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.lineItems.map((li) => (
                          <tr
                            key={li.id}
                            className="border-b border-border/50 dark:border-gray-700/50 last:border-0"
                          >
                            <td className="py-2">
                              <p className="font-medium text-foreground">
                                {li.security_name}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {li.asset_class}
                                {li.isin ? ` · ${li.isin}` : ""}
                              </p>
                            </td>
                            <td className="text-right py-2 text-foreground tabular-nums">
                              {Number(li.proposed_weight).toFixed(1)}%
                            </td>
                            <td className="text-right py-2 font-medium text-foreground tabular-nums">
                              {formatCurrency(
                                Number(li.proposed_amount),
                                li.currency,
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-border dark:border-gray-600">
                          <td className="py-2 font-semibold text-foreground">
                            Total
                          </td>
                          <td className="text-right py-2 font-semibold text-foreground tabular-nums">
                            {detail.lineItems
                              .reduce(
                                (sum, li) => sum + Number(li.proposed_weight),
                                0,
                              )
                              .toFixed(1)}
                            %
                          </td>
                          <td className="text-right py-2 font-bold text-foreground tabular-nums">
                            {formatCurrency(
                              Number(detail.total_amount),
                              detail.currency,
                            )}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {/* Actions for PENDING_CLIENT */}
          {detail?.status === "PENDING_CLIENT" && (
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button
                variant="outline"
                className="border-red-200 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/30"
                onClick={() => setRejectDialogOpen(true)}
                disabled={rejectMutation.isPending}
              >
                <XCircle className="h-4 w-4 mr-1.5" />
                Reject
              </Button>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => acceptMutation.mutate(detail.id)}
                disabled={acceptMutation.isPending}
              >
                <CheckCircle className="h-4 w-4 mr-1.5" />
                {acceptMutation.isPending ? "Accepting..." : "Accept Proposal"}
              </Button>
            </DialogFooter>
          )}

          {/* Accepted/Rejected confirmation */}
          {detail?.status === "CLIENT_ACCEPTED" && (
            <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 rounded p-3">
              <CheckCircle className="h-4 w-4" />
              You have accepted this proposal.
            </div>
          )}
          {detail?.status === "CLIENT_REJECTED" && (
            <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded p-3">
              <XCircle className="h-4 w-4" />
              You have rejected this proposal.
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Reject Reason Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reject Proposal</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Please provide a reason for rejecting this proposal (optional).
            </p>
            <textarea
              className="w-full rounded-md border border-border dark:border-gray-700 bg-background dark:bg-gray-800 p-3 text-sm text-foreground dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-teal-500"
              rows={3}
              placeholder="Enter reason..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRejectDialogOpen(false);
                setRejectReason("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (selectedId) {
                  rejectMutation.mutate({
                    proposalId: selectedId,
                    reason: rejectReason,
                  });
                }
              }}
              disabled={rejectMutation.isPending}
            >
              {rejectMutation.isPending ? "Rejecting..." : "Confirm Rejection"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
