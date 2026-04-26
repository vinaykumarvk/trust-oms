/**
 * Back-Office Service Request Workbench
 *
 * Pattern follows claims-workbench.tsx:
 * - KPI cards: Total, Approved, Ready for Teller, Completed, Overdue SLA
 * - Tab filters: All | New | Approved | Ready for Teller | Incomplete | Completed | Rejected | Closed
 * - Data table with action buttons per row
 * - Send for Verification / Complete / Mark Incomplete / Reject dialogs
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@ui/components/ui/card";
import { Button } from "@ui/components/ui/button";
import { Badge } from "@ui/components/ui/badge";
import { Input } from "@ui/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ui/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@ui/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@ui/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/components/ui/tabs";
import { Label } from "@ui/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ui/components/ui/select";
import { toast } from "sonner";
import {
  ClipboardList,
  Search,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Send,
  LayoutGrid,
  LayoutList,
} from "lucide-react";

const API = "/api/v1/service-requests";

function getToken(): string {
  try {
    const stored = localStorage.getItem("trustoms-user");
    if (stored) return JSON.parse(stored).token || "";
  } catch {}
  return "";
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

function fetcher(url: string) {
  return fetch(url, { headers: authHeaders() }).then((r) => r.json());
}

const statusColors: Record<string, string> = {
  NEW: "bg-gray-100 text-gray-800",
  APPROVED: "bg-blue-100 text-blue-800",
  READY_FOR_TELLER: "bg-yellow-100 text-yellow-800",
  COMPLETED: "bg-green-100 text-green-800",
  INCOMPLETE: "bg-orange-100 text-orange-800",
  REJECTED: "bg-red-100 text-red-800",
  CLOSED: "bg-purple-100 text-purple-800",
};

const priorityColors: Record<string, string> = {
  HIGH: "bg-red-100 text-red-700",
  MEDIUM: "bg-yellow-100 text-yellow-700",
  LOW: "bg-green-100 text-green-700",
};

interface ServiceRequest {
  id: number;
  request_id: string;
  client_id: string;
  sr_type: string;
  sr_details: string | null;
  priority: string;
  sr_status: string;
  request_date: string;
  closure_date: string | null;
  actual_closure_date: string | null;
  request_age: number;
  remarks: string | null;
  service_branch: string | null;
  resolution_unit: string | null;
  verification_notes: string | null;
  rejection_reason: string | null;
}

interface Summary {
  byStatus: {
    new: number;
    approved: number;
    readyForTeller: number;
    completed: number;
    incomplete: number;
    rejected: number;
    closed: number;
  };
  overdueSla: number;
  total: number;
}

export default function ServiceRequestWorkbench() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"table" | "card">("table");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Dialogs
  const [verifyDialogOpen, setVerifyDialogOpen] = useState(false);
  const [incompleteDialogOpen, setIncompleteDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [verifyData, setVerifyData] = useState({ service_branch: "", resolution_unit: "", sales_date: "" });
  const [incompleteNotes, setIncompleteNotes] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
  const [selectedCompleteId, setSelectedCompleteId] = useState<number | null>(null);
  const [reassignDialogOpen, setReassignDialogOpen] = useState(false);
  const [selectedReassignId, setSelectedReassignId] = useState<number | null>(null);
  const [newRmId, setNewRmId] = useState("");

  const statusFilterMap: Record<string, string> = {
    all: "",
    new: "NEW",
    approved: "APPROVED",
    ready: "READY_FOR_TELLER",
    incomplete: "INCOMPLETE",
    completed: "COMPLETED",
    rejected: "REJECTED",
    closed: "CLOSED",
  };
  const statusParam = statusFilterMap[activeTab] || "";

  const { data: summary, isPending: summaryPending } = useQuery<Summary>({
    queryKey: ["sr-summary"],
    queryFn: () => fetcher(`${API}/summary`),
    refetchInterval: 30000,
  });

  const { data: listResult, isPending: listPending } = useQuery<{
    data: ServiceRequest[];
    total: number;
    page: number;
    pageSize: number;
  }>({
    queryKey: ["sr-list", statusParam, searchQuery, page, pageSize],
    queryFn: () =>
      fetcher(`${API}?status=${statusParam}&search=${encodeURIComponent(searchQuery)}&page=${page}&pageSize=${pageSize}`),
    refetchInterval: 15000,
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["sr-list"] });
    queryClient.invalidateQueries({ queryKey: ["sr-summary"] });
  };

  const actionMutation = useMutation({
    mutationFn: ({ id, action, body }: { id: number; action: string; body?: Record<string, unknown> }) =>
      fetch(`${API}/${id}/${action}`, {
        method: "PUT",
        headers: authHeaders(),
        body: body ? JSON.stringify(body) : undefined,
      }).then((r) => {
        if (!r.ok) return r.json().then((e: { error?: string }) => { throw new Error(e.error || "Action failed"); });
        return r.json();
      }),
    onSuccess: (_: unknown, vars: { id: number; action: string; body?: Record<string, unknown> }) => {
      invalidateAll();
      toast.success(`Action "${vars.action}" completed`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const requests = listResult?.data ?? [];
  const total = listResult?.total ?? 0;

  function formatDate(d: string | null) {
    if (!d) return "-";
    return new Date(d).toLocaleDateString();
  }

  function slaStatus(sr: ServiceRequest) {
    if (!sr.closure_date) return null;
    const deadline = new Date(sr.closure_date).getTime();
    const now = Date.now();
    const daysRemaining = Math.ceil((deadline - now) / (1000 * 60 * 60 * 24));
    const isOpen = ["NEW", "APPROVED", "READY_FOR_TELLER", "INCOMPLETE"].includes(sr.sr_status);
    if (!isOpen) return null;
    let color = "bg-green-100 text-green-800";
    if (daysRemaining <= 0) color = "bg-red-100 text-red-800";
    else if (daysRemaining <= 1) color = "bg-orange-100 text-orange-800";
    else if (daysRemaining <= 3) color = "bg-yellow-100 text-yellow-800";
    const label = daysRemaining <= 0 ? `${Math.abs(daysRemaining)}d overdue` : `${daysRemaining}d left`;
    return { color, label };
  }

  function renderActions(sr: ServiceRequest) {
    const s = sr.sr_status;
    return (
      <div className="flex gap-1 flex-wrap">
        {s === "APPROVED" && (
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedId(sr.id);
              setVerifyData({ service_branch: "", resolution_unit: "", sales_date: "" });
              setVerifyDialogOpen(true);
            }}
          >
            <Send className="mr-1 h-3 w-3" /> Send for Verification
          </Button>
        )}
        {s === "READY_FOR_TELLER" && (
          <>
            <Button
              size="sm"
              variant="default"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedCompleteId(sr.id);
                setCompleteDialogOpen(true);
              }}
            >
              <CheckCircle className="mr-1 h-3 w-3" /> Complete
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedId(sr.id);
                setIncompleteNotes("");
                setIncompleteDialogOpen(true);
              }}
            >
              <AlertTriangle className="mr-1 h-3 w-3" /> Incomplete
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedId(sr.id);
                setRejectReason("");
                setRejectDialogOpen(true);
              }}
            >
              <XCircle className="mr-1 h-3 w-3" /> Reject
            </Button>
          </>
        )}
        {!["COMPLETED", "REJECTED", "CLOSED"].includes(s) && (
          <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); setSelectedReassignId(sr.id); setNewRmId(""); setReassignDialogOpen(true); }}>
            Reassign
          </Button>
        )}
      </div>
    );
  }

  const kpiCards = [
    { label: "Total", value: summary?.total ?? 0, icon: ClipboardList, color: "text-gray-600" },
    { label: "Approved", value: summary?.byStatus.approved ?? 0, icon: CheckCircle, color: "text-blue-600" },
    { label: "Ready for Teller", value: summary?.byStatus.readyForTeller ?? 0, icon: Send, color: "text-yellow-600" },
    { label: "Completed", value: summary?.byStatus.completed ?? 0, icon: CheckCircle, color: "text-green-600" },
    { label: "Overdue SLA", value: summary?.overdueSla ?? 0, icon: AlertTriangle, color: "text-red-600" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Service Request Workbench</h1>
          <p className="text-muted-foreground">
            Manage service request lifecycle: approval, verification, completion
          </p>
        </div>
        <div className="flex items-center border rounded-md">
          <Button
            variant={viewMode === "table" ? "default" : "ghost"}
            size="sm"
            className="rounded-r-none"
            onClick={() => setViewMode("table")}
          >
            <LayoutList className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === "card" ? "default" : "ghost"}
            size="sm"
            className="rounded-l-none"
            onClick={() => setViewMode("card")}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        {summaryPending
          ? Array.from({ length: 5 }).map((_, i) => (
              <Card key={i}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div className="h-4 w-20 animate-pulse rounded bg-muted" />
                  <div className="h-4 w-4 animate-pulse rounded bg-muted" />
                </CardHeader>
                <CardContent>
                  <div className="h-8 w-16 animate-pulse rounded bg-muted" />
                </CardContent>
              </Card>
            ))
          : kpiCards.map((card) => (
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

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by Request ID, type..."
          className="pl-9"
          value={searchQuery}
          onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
        />
      </div>

      {/* Tabs & Data */}
      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setPage(1); }}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="approved">
            Approved {summary?.byStatus.approved ? `(${summary.byStatus.approved})` : ""}
          </TabsTrigger>
          <TabsTrigger value="ready">
            Ready for Teller {summary?.byStatus.readyForTeller ? `(${summary.byStatus.readyForTeller})` : ""}
          </TabsTrigger>
          <TabsTrigger value="incomplete">
            Incomplete {summary?.byStatus.incomplete ? `(${summary.byStatus.incomplete})` : ""}
          </TabsTrigger>
          <TabsTrigger value="completed">
            Completed {summary?.byStatus.completed ? `(${summary.byStatus.completed})` : ""}
          </TabsTrigger>
          <TabsTrigger value="rejected">
            Rejected {summary?.byStatus.rejected ? `(${summary.byStatus.rejected})` : ""}
          </TabsTrigger>
          <TabsTrigger value="closed">
            Closed {summary?.byStatus.closed ? `(${summary.byStatus.closed})` : ""}
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          {viewMode === "table" ? (
            <div className="rounded-md border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Request ID</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Request Date</TableHead>
                    <TableHead>SLA Date</TableHead>
                    <TableHead>Age</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {listPending ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 9 }).map((_, j) => (
                          <TableCell key={j}>
                            <div className="h-4 w-full animate-pulse rounded bg-muted" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : requests.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                        <ClipboardList className="h-10 w-10 mx-auto mb-2 text-muted-foreground/50" />
                        No service requests found
                      </TableCell>
                    </TableRow>
                  ) : (
                    requests.map((sr) => {
                      const sla = slaStatus(sr);
                      return (
                        <TableRow key={sr.id}>
                          <TableCell className="font-mono text-sm">{sr.request_id}</TableCell>
                          <TableCell>{sr.client_id}</TableCell>
                          <TableCell>{sr.sr_type.replace(/_/g, " ")}</TableCell>
                          <TableCell>
                            <Badge className={priorityColors[sr.priority] || ""} variant="secondary">
                              {sr.priority}
                            </Badge>
                          </TableCell>
                          <TableCell>{formatDate(sr.request_date)}</TableCell>
                          <TableCell>{formatDate(sr.closure_date)}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {sla ? (
                                <Badge className={sla.color} variant="secondary">
                                  <Clock className="mr-1 h-3 w-3" />
                                  {sla.label}
                                </Badge>
                              ) : (
                                <span className="text-sm text-muted-foreground">{sr.request_age}d</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={statusColors[sr.sr_status] || ""} variant="secondary">
                              {sr.sr_status.replace(/_/g, " ")}
                            </Badge>
                          </TableCell>
                          <TableCell>{renderActions(sr)}</TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {listPending ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <Card key={i}>
                    <CardContent className="pt-6 space-y-3">
                      <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                      <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                      <div className="h-4 w-20 animate-pulse rounded bg-muted" />
                    </CardContent>
                  </Card>
                ))
              ) : requests.length === 0 ? (
                <div className="col-span-full flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                  <ClipboardList className="h-10 w-10 text-muted-foreground/50" />
                  <p>No service requests found</p>
                </div>
              ) : (
                requests.map((sr) => {
                  const sla = slaStatus(sr);
                  return (
                    <Card key={sr.id} className="flex flex-col">
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-sm font-mono">{sr.request_id}</CardTitle>
                          <Badge className={statusColors[sr.sr_status] || ""} variant="secondary">
                            {sr.sr_status.replace(/_/g, " ")}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="flex-1 space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Client</span>
                          <span>{sr.client_id}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Type</span>
                          <span>{sr.sr_type.replace(/_/g, " ")}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Priority</span>
                          <Badge className={priorityColors[sr.priority] || ""} variant="secondary">
                            {sr.priority}
                          </Badge>
                        </div>
                        {sla && (
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">SLA</span>
                            <Badge className={sla.color} variant="secondary">
                              <Clock className="mr-1 h-3 w-3" />
                              {sla.label}
                            </Badge>
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground pt-1">
                          Created {formatDate(sr.request_date)}
                        </div>
                        <div className="pt-2 border-t">{renderActions(sr)}</div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          )}
          {total > 0 && (
            <div className="flex items-center justify-between pt-4">
              <div className="flex items-center gap-2">
                <p className="text-sm text-muted-foreground">
                  Showing {Math.min((page - 1) * pageSize + 1, total)}–{Math.min(page * pageSize, total)} of {total}
                </p>
                <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
                  <SelectTrigger className="w-20 h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-sm text-muted-foreground">per page</span>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
                <span className="text-sm font-medium">Page {page} of {Math.ceil(total / pageSize)}</span>
                <Button variant="outline" size="sm" disabled={page >= Math.ceil(total / pageSize)} onClick={() => setPage(p => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Send for Verification Dialog */}
      <Dialog open={verifyDialogOpen} onOpenChange={setVerifyDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Send for Verification</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Service Branch</Label>
              <Input
                placeholder="e.g. Main Branch"
                value={verifyData.service_branch}
                onChange={(e) => setVerifyData({ ...verifyData, service_branch: e.target.value })}
              />
            </div>
            <div>
              <Label>Resolution Unit</Label>
              <Input
                placeholder="e.g. Trust Operations"
                value={verifyData.resolution_unit}
                onChange={(e) => setVerifyData({ ...verifyData, resolution_unit: e.target.value })}
              />
            </div>
            <div>
              <Label>Sales Date</Label>
              <Input
                type="date"
                value={verifyData.sales_date}
                onChange={(e) => setVerifyData({ ...verifyData, sales_date: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVerifyDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedId != null) {
                  actionMutation.mutate({
                    id: selectedId,
                    action: "send-for-verification",
                    body: verifyData as unknown as Record<string, unknown>,
                  });
                  setVerifyDialogOpen(false);
                }
              }}
            >
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark Incomplete Dialog */}
      <Dialog open={incompleteDialogOpen} onOpenChange={setIncompleteDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Mark as Incomplete</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Notes *</Label>
            <Input
              placeholder="Describe what is missing..."
              value={incompleteNotes}
              onChange={(e) => setIncompleteNotes(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Minimum 10 characters required ({incompleteNotes.trim().length}/10)</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIncompleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={incompleteNotes.trim().length < 10 || actionMutation.isPending}
              onClick={() => {
                if (selectedId != null) {
                  actionMutation.mutate({
                    id: selectedId,
                    action: "incomplete",
                    body: { notes: incompleteNotes },
                  });
                  setIncompleteDialogOpen(false);
                }
              }}
            >
              Mark Incomplete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Reject Service Request</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-destructive font-medium">This action cannot be undone. The service request will be permanently rejected.</p>
            <Label>Rejection Reason *</Label>
            <Input
              placeholder="Reason for rejection..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Minimum 10 characters required ({rejectReason.trim().length}/10)</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={rejectReason.trim().length < 10 || actionMutation.isPending}
              onClick={() => {
                if (selectedId != null) {
                  actionMutation.mutate({
                    id: selectedId,
                    action: "reject",
                    body: { reason: rejectReason },
                  });
                  setRejectDialogOpen(false);
                }
              }}
            >
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Complete Confirmation Dialog */}
      <AlertDialog open={completeDialogOpen} onOpenChange={setCompleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Complete Service Request?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark the service request as completed and set the actual closure date.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (selectedCompleteId) actionMutation.mutate({ id: selectedCompleteId, action: "complete", body: {} }); setCompleteDialogOpen(false); }}>
              Complete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reassign RM Dialog */}
      <Dialog open={reassignDialogOpen} onOpenChange={setReassignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reassign Relationship Manager</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>New RM ID</Label>
              <Input type="number" placeholder="Enter RM user ID" value={newRmId} onChange={(e) => setNewRmId(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReassignDialogOpen(false)}>Cancel</Button>
            <Button
              disabled={!newRmId.trim() || actionMutation.isPending}
              onClick={() => {
                if (selectedReassignId) actionMutation.mutate({ id: selectedReassignId, action: "reassign", body: { new_rm_id: Number(newRmId) } });
                setReassignDialogOpen(false);
              }}
            >
              Reassign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
