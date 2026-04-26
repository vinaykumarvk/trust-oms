/**
 * Handover Detail Page (HAM)
 *
 * Displays full details of a handover request including header with status,
 * RM details, items table, scrutiny checklist, audit trail timeline,
 * and action buttons (authorize / reject) for pending requests.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/ui/card";
import { Button } from "@ui/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ui/components/ui/table";
import { Badge } from "@ui/components/ui/badge";
import { toast } from "sonner";
import { SkeletonRows } from '@/components/ui/skeleton-rows';

/* ---------- Auth helpers ---------- */

function getToken(): string {
  try {
    const stored = localStorage.getItem('trustoms-user');
    if (stored) {
      const parsed = JSON.parse(stored);
      return parsed.token || '';
    }
  } catch { /* ignored */ }
  return '';
}

function fetcher<T>(url: string): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${getToken()}`,
    "Content-Type": "application/json",
  };
  return fetch(url, { headers }).then((r) => {
    if (!r.ok) {
      return r.json().then((e: { error?: string }) => {
        throw new Error(e.error || `Request failed (${r.status})`);
      });
    }
    return r.json();
  });
}

/* ---------- Types ---------- */

interface RMUser {
  id: number;
  full_name: string;
  email?: string;
  role?: string;
}

interface HandoverItem {
  id: number;
  handover_id: number;
  entity_id: string;
  entity_name_en: string;
  entity_name_local: string | null;
  previous_rm_id: number;
  aum_at_handover: string | null;
  product_count: number | null;
  open_orders_count: number | null;
  pending_settlements_count: number | null;
  last_interaction_date: string | null;
  tenure_years: string | null;
  status: string;
  failure_reason: string | null;
  created_at: string;
}

interface ChecklistItem {
  id: number;
  handover_id: number;
  template_item_id: number;
  validation_label: string;
  remarks: string | null;
  completed_by: number | null;
  completed_at: string | null;
  status: string;
  template_label: string | null;
  template_category: string | null;
  is_mandatory: boolean | null;
}

interface AuditEntry {
  id: number;
  event_type: string;
  reference_type: string;
  reference_id: number;
  actor_id: number;
  actor_role: string;
  details: Record<string, unknown> | null;
  created_at: string;
  actor_name: string | null;
}

interface HandoverRequest {
  id: number;
  handover_number: string;
  entity_type: "lead" | "prospect" | "client";
  outgoing_rm_id: number;
  incoming_rm_id: number;
  incoming_srm_id: number | null;
  reason: string;
  branch_code: string | null;
  outgoing_rm_name: string | null;
  incoming_rm_name: string | null;
  incoming_srm_name: string | null;
  status: string;
  rejection_reason: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  authorized_at: string | null;
  authorized_by: number | null;
  sla_deadline: string | null;
  outgoing_rm: RMUser | null;
  incoming_rm: RMUser | null;
  incoming_srm: RMUser | null;
  authorized_by_user: RMUser | null;
  items: HandoverItem[];
  checklistItems: ChecklistItem[];
  auditEntries: AuditEntry[];
}

interface HistoryResponse {
  data: AuditEntry[];
  total: number;
  page: number;
  pageSize: number;
}

/* ---------- Constants ---------- */

const API = "/api/v1/ham";

const statusBadgeClasses: Record<string, string> = {
  pending_auth:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  authorized:
    "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  cancelled: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  draft: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  pending_reversal:
    "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  bulk_pending_review:
    "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
};

const entityTypeBadgeClasses: Record<string, string> = {
  lead: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  prospect:
    "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  client:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
};

const checklistStatusClasses: Record<string, string> = {
  pending:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  completed:
    "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  not_applicable:
    "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  work_in_progress:
    "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
};

const auditEventColors: Record<string, string> = {
  handover_created:
    "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  handover_authorized:
    "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  handover_rejected:
    "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  handover_cancelled:
    "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  handover_amended:
    "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  batch_authorize:
    "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  batch_reject: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  delegation_early_terminated:
    "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
};

/* ---------- Helpers ---------- */

function formatDate(d: string | null | undefined): string {
  if (!d) return "--";
  try {
    return new Date(d).toLocaleDateString("en-PH", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return String(d);
  }
}

function formatDateTime(d: string | null | undefined): string {
  if (!d) return "--";
  try {
    return new Date(d).toLocaleString("en-PH", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(d);
  }
}

function formatCurrency(val: string | number | null | undefined): string {
  if (val == null) return "--";
  const num = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(num)) return "--";
  return num.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatLabel(str: string): string {
  return str.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ---------- Skeleton helpers ---------- */

function SkeletonBlock() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-5 w-32 animate-pulse rounded bg-muted" />
        <div className="h-5 w-16 animate-pulse rounded bg-muted" />
      </div>
      <div className="h-8 w-64 animate-pulse rounded bg-muted" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="space-y-3 pt-6">
              {Array.from({ length: 3 }).map((_, j) => (
                <div
                  key={j}
                  className="h-4 w-full animate-pulse rounded bg-muted"
                />
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ========== Main Component ========== */

export default function HandoverDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectInput, setShowRejectInput] = useState(false);

  /* ---- Queries ---- */

  const {
    data: request,
    isPending,
    isError,
    error: fetchError,
  } = useQuery<HandoverRequest>({
    queryKey: ["handover-detail", id],
    queryFn: () => fetcher<HandoverRequest>(`${API}/request/${id}`),
    enabled: !!id,
    refetchInterval: 30_000,
  });

  // Load full audit trail from history endpoint for this handover
  const { data: historyResult } = useQuery<HistoryResponse>({
    queryKey: ["handover-history", id],
    queryFn: () =>
      fetcher<HistoryResponse>(
        `${API}/history?reference_type=handover&event_type=&dateFrom=&dateTo=`
      ),
    enabled: !!id,
  });

  /* ---- Invalidation helper ---- */

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["handover-detail", id] });
    queryClient.invalidateQueries({ queryKey: ["handover-history", id] });
    queryClient.invalidateQueries({ queryKey: ["handover-pending"] });
  };

  /* ---- Mutations ---- */

  const authorizeMutation = useMutation({
    mutationFn: () =>
      fetch(`${API}/authorize/${id}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          version: request?.version,
          checker_id: "0",
        }),
      }).then((r) => {
        if (!r.ok) {
          return r
            .json()
            .then((e: { error?: string }) => {
              throw new Error(e.error || "Authorization failed");
            });
        }
        return r.json();
      }),
    onSuccess: () => {
      invalidateAll();
      toast.success("Handover request authorized successfully");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const rejectMutation = useMutation({
    mutationFn: (reason: string) =>
      fetch(`${API}/reject/${id}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          version: request?.version,
          reason,
          checker_id: "0",
        }),
      }).then((r) => {
        if (!r.ok) {
          return r
            .json()
            .then((e: { error?: string }) => {
              throw new Error(e.error || "Rejection failed");
            });
        }
        return r.json();
      }),
    onSuccess: () => {
      invalidateAll();
      setShowRejectInput(false);
      setRejectReason("");
      toast.success("Handover request rejected");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  /* ---- Loading state ---- */

  if (isPending) {
    return (
      <div className="space-y-6">
        <Link
          to="/crm/handovers"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          &larr; Back to Handovers
        </Link>
        <SkeletonBlock />
      </div>
    );
  }

  /* ---- Error state ---- */

  if (isError || !request) {
    return (
      <div className="space-y-6">
        <Link
          to="/crm/handovers"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          &larr; Back to Handovers
        </Link>
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center">
          <h2 className="text-xl font-semibold">Handover Request Not Found</h2>
          <p className="text-muted-foreground">
            {fetchError instanceof Error
              ? fetchError.message
              : "The handover request could not be loaded."}
          </p>
          <Link to="/crm/handovers">
            <Button variant="outline">&larr; Back to Handovers</Button>
          </Link>
        </div>
      </div>
    );
  }

  /* ---- Derived data ---- */

  const items = request.items ?? [];
  const checklistItems = request.checklistItems ?? [];

  // Merge audit entries from the request detail (embedded) and the history endpoint.
  // The request.auditEntries are specific to this handover. The history endpoint
  // may contain broader results; filter to those matching this handover's reference_id.
  const embeddedAudit = request.auditEntries ?? [];
  const historyAudit = (historyResult?.data ?? []).filter(
    (e) => e.reference_id === request.id
  );
  // Merge and de-duplicate by id, then sort reverse chronological
  const auditMap = new Map<number, AuditEntry>();
  for (const entry of [...embeddedAudit, ...historyAudit]) {
    auditMap.set(entry.id, entry);
  }
  const auditEntries = Array.from(auditMap.values()).sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const isPendingAuth =
    request.status === "pending_auth" ||
    request.status === "bulk_pending_review";
  const isViewOnly = !isPendingAuth;

  /* ---- Render ---- */

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        to="/crm/handovers"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        &larr; Back to Handovers
      </Link>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold">{request.handover_number}</h1>
            <Badge
              className={entityTypeBadgeClasses[request.entity_type] || ""}
              variant="secondary"
            >
              {formatLabel(request.entity_type)}
            </Badge>
            <Badge
              className={statusBadgeClasses[request.status] || ""}
              variant="secondary"
            >
              {formatLabel(request.status)}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Version {request.version}
            {request.branch_code && <> &middot; Branch: {request.branch_code}</>}
            {request.created_by && (
              <> &middot; Created by: {request.created_by}</>
            )}
          </p>
        </div>

        {/* Action Buttons */}
        {isPendingAuth && (
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              onClick={() => authorizeMutation.mutate()}
              disabled={
                authorizeMutation.isPending || rejectMutation.isPending
              }
            >
              {authorizeMutation.isPending ? "Authorizing..." : "Authorize"}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setShowRejectInput(true)}
              disabled={
                authorizeMutation.isPending ||
                rejectMutation.isPending ||
                showRejectInput
              }
            >
              Reject
            </Button>
          </div>
        )}
      </div>

      {/* Reject reason input */}
      {showRejectInput && (
        <Card className="border-red-300 dark:border-red-800">
          <CardContent className="pt-4 space-y-3">
            <label className="text-sm font-medium">Rejection Reason *</label>
            <textarea
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              rows={3}
              placeholder="Enter reason for rejecting this handover request..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="destructive"
                disabled={
                  !rejectReason.trim() || rejectMutation.isPending
                }
                onClick={() => rejectMutation.mutate(rejectReason)}
              >
                {rejectMutation.isPending
                  ? "Rejecting..."
                  : "Confirm Rejection"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setShowRejectInput(false);
                  setRejectReason("");
                }}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Rejection reason display (if already rejected) */}
      {request.status === "rejected" && request.rejection_reason && (
        <Card className="border-red-300 dark:border-red-800">
          <CardContent className="pt-4">
            <p className="text-sm font-medium text-red-800 dark:text-red-300 mb-1">
              Rejection Reason
            </p>
            <p className="text-sm">{request.rejection_reason}</p>
          </CardContent>
        </Card>
      )}

      {/* Request Details */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* RM Details */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">
              Relationship Manager Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <DetailRow
              label="Outgoing RM"
              value={
                request.outgoing_rm?.full_name ||
                request.outgoing_rm_name ||
                `RM #${request.outgoing_rm_id}`
              }
            />
            {request.outgoing_rm?.email && (
              <DetailRow label="Outgoing RM Email" value={request.outgoing_rm.email} />
            )}
            <DetailRow
              label="Incoming RM"
              value={
                request.incoming_rm?.full_name ||
                request.incoming_rm_name ||
                `RM #${request.incoming_rm_id}`
              }
            />
            {request.incoming_rm?.email && (
              <DetailRow label="Incoming RM Email" value={request.incoming_rm.email} />
            )}
            {request.incoming_srm && (
              <DetailRow
                label="Incoming SRM"
                value={
                  request.incoming_srm.full_name ||
                  request.incoming_srm_name ||
                  "--"
                }
              />
            )}
          </CardContent>
        </Card>

        {/* Request Info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">
              Request Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <DetailRow label="Reason" value={request.reason} />
            <DetailRow label="Entity Type" value={formatLabel(request.entity_type)} />
            <DetailRow label="Status" value={formatLabel(request.status)} />
            <DetailRow label="Version" value={String(request.version)} />
            <DetailRow label="Created" value={formatDateTime(request.created_at)} />
            {request.authorized_at && (
              <DetailRow
                label="Authorized"
                value={formatDateTime(request.authorized_at)}
              />
            )}
            {request.authorized_by_user && (
              <DetailRow
                label="Authorized By"
                value={request.authorized_by_user.full_name}
              />
            )}
            {request.sla_deadline && (
              <DetailRow
                label="SLA Deadline"
                value={formatDateTime(request.sla_deadline)}
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Items Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">
            Handover Items ({items.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
              <p>No items in this handover request</p>
            </div>
          ) : (
            <div className="rounded-md border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Entity ID</TableHead>
                    <TableHead>Entity Name</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead className="text-right">AUM at Handover</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-mono text-sm">
                        {item.entity_id}
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">
                            {item.entity_name_en}
                          </p>
                          {item.entity_name_local && (
                            <p className="text-xs text-muted-foreground">
                              {item.entity_name_local}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {request.branch_code || "--"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatCurrency(item.aum_at_handover)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {formatLabel(item.status)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Scrutiny Checklist */}
      {checklistItems.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">
              Scrutiny Checklist ({checklistItems.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Label</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Mandatory</TableHead>
                    <TableHead>Remarks</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {checklistItems.map((ci) => (
                    <TableRow key={ci.id}>
                      <TableCell className="text-sm font-medium">
                        {ci.template_label || ci.validation_label}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {ci.template_category || "--"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={
                            checklistStatusClasses[ci.status] || ""
                          }
                          variant="secondary"
                        >
                          {formatLabel(ci.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {ci.is_mandatory ? "Yes" : "No"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                        {ci.remarks || "--"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Audit Trail Timeline */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">
            Audit Trail ({auditEntries.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {auditEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
              <p>No audit entries found</p>
            </div>
          ) : (
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />

              <div className="space-y-6">
                {auditEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex gap-4 items-start relative"
                  >
                    {/* Timeline dot */}
                    <div className="z-10 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-background border-2 border-border">
                      <div className="h-2 w-2 rounded-full bg-foreground/50" />
                    </div>

                    <div className="flex-1 pb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge
                          className={
                            auditEventColors[entry.event_type] ||
                            "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200"
                          }
                          variant="secondary"
                        >
                          {formatLabel(entry.event_type)}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatDateTime(entry.created_at)}
                        </span>
                      </div>

                      {entry.actor_name && (
                        <p className="text-sm mt-1">
                          By:{" "}
                          <span className="font-medium">
                            {entry.actor_name}
                          </span>
                          {entry.actor_role && (
                            <span className="text-muted-foreground">
                              {" "}
                              ({entry.actor_role})
                            </span>
                          )}
                        </p>
                      )}

                      {entry.details && Object.keys(entry.details).length > 0 && (
                        <div className="mt-1 text-xs text-muted-foreground space-y-0.5">
                          {Object.entries(entry.details).map(([key, val]) => (
                            <p key={key}>
                              <span className="font-medium">
                                {formatLabel(key)}:
                              </span>{" "}
                              {String(val)}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ---------- Helper sub-component ---------- */

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between py-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium max-w-[60%] break-words">
        {value}
      </span>
    </div>
  );
}
