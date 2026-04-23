/**
 * Investment Proposals -- Risk Profiling Module
 *
 * Full investment proposal lifecycle management: creation, line-item editing,
 * what-if analysis, suitability checks, multi-tier approval workflow,
 * and client acceptance tracking.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/ui/card";
import { Button } from "@ui/components/ui/button";
import { Badge } from "@ui/components/ui/badge";
import { Input } from "@ui/components/ui/input";
import { Textarea } from "@ui/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@ui/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@ui/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@ui/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/components/ui/tabs";
import { toast } from "sonner";
import {
  Plus, Search, Eye, Trash2, Pencil, Send, ShieldCheck, XCircle,
  RotateCcw, CheckCircle, AlertTriangle, FileText, BarChart3,
  Download, TrendingUp, RefreshCw,
} from "lucide-react";

/* ---------- Constants ---------- */
const API = "/api/v1/proposals";

const STATUSES = [
  "ALL", "DRAFT", "SUBMITTED", "L1_APPROVED", "L1_REJECTED",
  "COMPLIANCE_APPROVED", "COMPLIANCE_REJECTED", "SENT_TO_CLIENT",
  "CLIENT_ACCEPTED", "CLIENT_REJECTED", "EXPIRED",
] as const;

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-800",
  SUBMITTED: "bg-blue-100 text-blue-800",
  L1_APPROVED: "bg-indigo-100 text-indigo-800",
  L1_REJECTED: "bg-red-100 text-red-800",
  COMPLIANCE_APPROVED: "bg-green-100 text-green-800",
  COMPLIANCE_REJECTED: "bg-red-100 text-red-800",
  SENT_TO_CLIENT: "bg-purple-100 text-purple-800",
  CLIENT_ACCEPTED: "bg-emerald-100 text-emerald-800",
  CLIENT_REJECTED: "bg-orange-100 text-orange-800",
  EXPIRED: "bg-gray-100 text-gray-500",
};

const OBJECTIVES = [
  "GROWTH", "INCOME", "BALANCED", "CAPITAL_PRESERVATION", "AGGRESSIVE_GROWTH",
] as const;

const CURRENCIES = ["INR", "USD", "EUR", "GBP", "SGD"] as const;

/* ---------- Auth helpers ---------- */

async function apiFetch<T = unknown>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || json.message || "Request failed");
  return json;
}

/* ---------- Types ---------- */
interface Proposal {
  id: number;
  proposal_number: string;
  customer_id: string;
  customer_name: string;
  title: string;
  investment_objective: string;
  time_horizon_years: number;
  proposed_amount: number;
  currency: string;
  status: string;
  suitability_pass: boolean | null;
  suitability_details: string | null;
  risk_profile_summary: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  comments: string | null;
}

interface LineItem {
  id: number;
  proposal_id: number;
  asset_class: string;
  product_name: string;
  product_risk_code: string;
  allocation_percentage: number;
  allocation_amount: number;
  risk_deviation_flagged: boolean;
}

interface WhatIfResult {
  expected_return_pct: number;
  expected_std_dev_pct: number;
  sharpe_ratio: number;
  max_drawdown_pct: number;
}

interface ProposalDetail extends Proposal {
  line_items: LineItem[];
}

/* ---------- Formatters ---------- */
const fmtCurrency = (n: number | string | null | undefined, ccy = "INR") => {
  if (n == null) return "--";
  const num = typeof n === "string" ? parseFloat(n) : n;
  if (isNaN(num)) return "--";
  return num.toLocaleString("en-IN", { style: "currency", currency: ccy, minimumFractionDigits: 2 });
};

const fmtDate = (d: string | null | undefined) => {
  if (!d) return "--";
  try {
    return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return d;
  }
};

const fmtPct = (n: number | null | undefined) => {
  if (n == null) return "--";
  return `${n.toFixed(2)}%`;
};

/* ========== Main Component ========== */
export default function InvestmentProposals() {
  const qc = useQueryClient();

  /* -- List state -- */
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  /* -- Dialog states -- */
  const [createOpen, setCreateOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [actionType, setActionType] = useState("");
  const [actionComment, setActionComment] = useState("");
  const [lineItemDialogOpen, setLineItemDialogOpen] = useState(false);
  const [editingLineItem, setEditingLineItem] = useState<LineItem | null>(null);

  /* -- Delete confirmation state -- */
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  /* -- Deviation check state -- */
  const [deviationAlert, setDeviationAlert] = useState<{
    open: boolean;
    hasDeviation: boolean;
    customerRiskCode: number | null;
    customerRiskCategory: string | null;
    productRiskCode: number | null;
    pendingBody: Record<string, unknown> | null;
  }>({
    open: false,
    hasDeviation: false,
    customerRiskCode: null,
    customerRiskCategory: null,
    productRiskCode: null,
    pendingBody: null,
  });

  const [riskRatingFilter, setRiskRatingFilter] = useState<string>("ALL");

  /* -- Create form -- */
  const [newProposal, setNewProposal] = useState({
    customer_id: "",
    title: "",
    investment_objective: "",
    time_horizon_years: "5",
    proposed_amount: "",
    currency: "INR",
  });

  /* -- Line item form -- */
  const [lineItemForm, setLineItemForm] = useState({
    asset_class: "",
    product_name: "",
    product_risk_code: "",
    allocation_percentage: "",
    allocation_amount: "",
  });

  /* -- What-if state -- */
  const [whatIfResult, setWhatIfResult] = useState<WhatIfResult | null>(null);

  /* ---------- Queries ---------- */
  const statusParam = statusFilter === "ALL" ? "" : statusFilter;

  const listQuery = useQuery<{ data: Proposal[]; total: number }>({
    queryKey: ["proposals", statusParam, page],
    queryFn: () => apiFetch(`${API}?entity_id=default&status=${statusParam}&page=${page}&page_size=${pageSize}`),
    refetchInterval: 30_000,
  });

  const detailQuery = useQuery<{ data: ProposalDetail }>({
    queryKey: ["proposal-detail", selectedId],
    queryFn: () => apiFetch(`${API}/${selectedId}`),
    enabled: !!selectedId && detailOpen,
  });

  const proposals = listQuery.data?.data ?? [];
  const totalCount = listQuery.data?.total ?? 0;
  const detail = detailQuery.data?.data;
  const lineItems = detail?.line_items ?? [];

  /* ---------- Filtered list ---------- */
  const filtered = searchTerm
    ? proposals.filter(
        (p) =>
          p.proposal_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
          p.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          p.title.toLowerCase().includes(searchTerm.toLowerCase()),
      )
    : proposals;

  /* ---------- Mutations ---------- */
  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["proposals"] });
    qc.invalidateQueries({ queryKey: ["proposal-detail", selectedId] });
  };

  const createMut = useMutation({
    mutationFn: (data: typeof newProposal) =>
      apiFetch(API, {
        method: "POST",
        body: JSON.stringify({
          customer_id: data.customer_id,
          title: data.title,
          investment_objective: data.investment_objective,
          time_horizon_years: parseInt(data.time_horizon_years, 10),
          proposed_amount: parseFloat(data.proposed_amount),
          currency: data.currency,
        }),
      }),
    onSuccess: () => {
      invalidateAll();
      setCreateOpen(false);
      setNewProposal({ customer_id: "", title: "", investment_objective: "", time_horizon_years: "5", proposed_amount: "", currency: "INR" });
      toast.success("Proposal created successfully");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteProposalMut = useMutation({
    mutationFn: (id: number) => apiFetch(`${API}/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidateAll();
      setDetailOpen(false);
      setSelectedId(null);
      toast.success("Proposal deleted");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const addLineItemMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch(`${API}/${selectedId}/line-items`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["proposal-detail", selectedId] });
      setLineItemDialogOpen(false);
      resetLineItemForm();
      toast.success("Line item added");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateLineItemMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      apiFetch(`${API}/line-items/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["proposal-detail", selectedId] });
      setLineItemDialogOpen(false);
      setEditingLineItem(null);
      resetLineItemForm();
      toast.success("Line item updated");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteLineItemMut = useMutation({
    mutationFn: (id: number) => apiFetch(`${API}/line-items/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["proposal-detail", selectedId] });
      toast.success("Line item removed");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const suitabilityMut = useMutation({
    mutationFn: (proposalId: number) =>
      apiFetch(`${API}/${proposalId}/suitability-check`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["proposal-detail", selectedId] });
      toast.success("Suitability check completed");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const whatIfMut = useMutation({
    mutationFn: (proposalId: number) =>
      apiFetch<{ data: WhatIfResult }>(`${API}/${proposalId}/what-if`, { method: "POST" }),
    onSuccess: (res) => {
      setWhatIfResult(res.data);
      toast.success("What-if analysis computed");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const workflowMut = useMutation({
    mutationFn: ({ id, action, comments }: { id: number; action: string; comments?: string }) =>
      apiFetch(`${API}/${id}/${action}`, {
        method: "POST",
        body: JSON.stringify({ comments }),
      }),
    onSuccess: (_data: unknown, vars) => {
      invalidateAll();
      setActionDialogOpen(false);
      setActionComment("");
      toast.success(`Action "${vars.action.replace(/-/g, " ")}" completed`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const generatePdfMut = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`${API}/${id}/generate-pdf`, { method: "POST" }),
    onSuccess: () => toast.success("PDF generated"),
    onError: (err: Error) => toast.error(err.message),
  });

  const recordDeviationMut = useMutation({
    mutationFn: (data: { customer_id: string; product_risk_code: number; customer_risk_code: number }) =>
      apiFetch("/api/v1/risk-profiling/deviations", {
        method: "POST",
        body: JSON.stringify({
          customer_id: data.customer_id,
          risk_profile_id: 0, // Will be resolved server-side
          product_id: lineItemForm.product_name,
          customer_risk_code: data.customer_risk_code,
          product_risk_code: data.product_risk_code,
          context: "PROPOSAL",
        }),
      }),
    onError: (err: Error) => console.error("Deviation record failed:", err),
  });

  /* ---------- Helpers ---------- */
  const resetLineItemForm = () =>
    setLineItemForm({ asset_class: "", product_name: "", product_risk_code: "", allocation_percentage: "", allocation_amount: "" });

  const openDetail = (id: number) => {
    setSelectedId(id);
    setDetailOpen(true);
    setWhatIfResult(null);
  };

  const openAction = (type: string) => {
    setActionType(type);
    setActionComment("");
    setActionDialogOpen(true);
  };

  const handleAddLineItem = () => {
    setEditingLineItem(null);
    resetLineItemForm();
    setLineItemDialogOpen(true);
  };

  const handleEditLineItem = (li: LineItem) => {
    setEditingLineItem(li);
    setLineItemForm({
      asset_class: li.asset_class,
      product_name: li.product_name,
      product_risk_code: li.product_risk_code,
      allocation_percentage: String(li.allocation_percentage),
      allocation_amount: String(li.allocation_amount),
    });
    setLineItemDialogOpen(true);
  };

  const submitLineItem = async () => {
    const body: Record<string, unknown> = {
      asset_class: lineItemForm.asset_class,
      product_name: lineItemForm.product_name,
      product_risk_code: parseInt(lineItemForm.product_risk_code, 10),
      allocation_percentage: parseFloat(lineItemForm.allocation_percentage),
      allocation_amount: parseFloat(lineItemForm.allocation_amount || "0"),
    };

    // Check for product risk deviation (FR-021.AC1)
    if (!editingLineItem && detail?.customer_id && lineItemForm.product_risk_code) {
      try {
        const checkResult = await apiFetch<{
          hasDeviation: boolean;
          customerRiskCode: number | null;
          riskCategory: string | null;
          productRiskCode: number;
        }>("/api/v1/risk-profiling/deviations/check", {
          method: "POST",
          body: JSON.stringify({
            customer_id: detail.customer_id,
            product_risk_code: parseInt(lineItemForm.product_risk_code, 10),
          }),
        });

        if (checkResult.hasDeviation) {
          setDeviationAlert({
            open: true,
            hasDeviation: true,
            customerRiskCode: checkResult.customerRiskCode,
            customerRiskCategory: checkResult.riskCategory,
            productRiskCode: checkResult.productRiskCode,
            pendingBody: body,
          });
          return; // Don't submit yet; wait for confirmation
        }
      } catch {
        // If check fails, proceed with normal submission
      }
    }

    if (editingLineItem) {
      updateLineItemMut.mutate({ id: editingLineItem.id, body });
    } else {
      addLineItemMut.mutate(body);
    }
  };

  const totalAllocation = lineItems.reduce((sum, li) => sum + (li.allocation_percentage ?? 0), 0);

  /* ---------- Workflow actions for current status ---------- */
  function renderWorkflowActions(proposal: ProposalDetail) {
    const s = proposal.status;
    const btnClass = "gap-1";
    return (
      <div className="flex flex-wrap items-center gap-2">
        {s === "DRAFT" && (
          <>
            <Button size="sm" className={btnClass} onClick={() => openAction("submit")}>
              <Send className="h-3 w-3" /> Submit
            </Button>
            <Button size="sm" variant="destructive" className={btnClass} onClick={() => setDeleteConfirmId(proposal.id)}>
              <Trash2 className="h-3 w-3" /> Delete
            </Button>
          </>
        )}
        {s === "SUBMITTED" && (
          <>
            <Button size="sm" className={btnClass} onClick={() => openAction("approve-l1")}>
              <ShieldCheck className="h-3 w-3" /> L1 Approve
            </Button>
            <Button size="sm" variant="destructive" className={btnClass} onClick={() => openAction("reject-l1")}>
              <XCircle className="h-3 w-3" /> L1 Reject
            </Button>
            <Button size="sm" variant="outline" className={btnClass} onClick={() => openAction("return-for-revision")}>
              <RotateCcw className="h-3 w-3" /> Return
            </Button>
          </>
        )}
        {s === "L1_APPROVED" && (
          <>
            <Button size="sm" className={btnClass} onClick={() => openAction("approve-compliance")}>
              <ShieldCheck className="h-3 w-3" /> Compliance Approve
            </Button>
            <Button size="sm" variant="destructive" className={btnClass} onClick={() => openAction("reject-compliance")}>
              <XCircle className="h-3 w-3" /> Compliance Reject
            </Button>
            <Button size="sm" variant="outline" className={btnClass} onClick={() => openAction("return-for-revision")}>
              <RotateCcw className="h-3 w-3" /> Return
            </Button>
          </>
        )}
        {s === "COMPLIANCE_APPROVED" && (
          <Button size="sm" className={btnClass} onClick={() => openAction("send-to-client")}>
            <Send className="h-3 w-3" /> Send to Client
          </Button>
        )}
        {s === "SENT_TO_CLIENT" && (
          <>
            <Button size="sm" className={btnClass} onClick={() => openAction("client-accept")}>
              <CheckCircle className="h-3 w-3" /> Client Accept
            </Button>
            <Button size="sm" variant="destructive" className={btnClass} onClick={() => openAction("client-reject")}>
              <XCircle className="h-3 w-3" /> Client Reject
            </Button>
          </>
        )}
        <Button
          size="sm"
          variant="outline"
          className={btnClass}
          onClick={() => generatePdfMut.mutate(proposal.id)}
          disabled={generatePdfMut.isPending}
        >
          <Download className="h-3 w-3" /> PDF
        </Button>
      </div>
    );
  }

  /* ========== Render ========== */
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Investment Proposals</h1>
          <p className="text-sm text-muted-foreground">
            Manage proposal lifecycle: creation, suitability, approval, and client acceptance
          </p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1 h-4 w-4" /> New Proposal
        </Button>
      </div>

      {/* Search */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search proposals..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Status Tabs */}
      <Tabs value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
        <TabsList className="flex flex-wrap h-auto gap-1">
          {STATUSES.map((s) => (
            <TabsTrigger key={s} value={s} className="text-xs">
              {s === "ALL" ? "All" : s.replace(/_/g, " ")}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={statusFilter} className="mt-4">
          {listQuery.isLoading ? (
            <Card>
              <CardContent className="py-12">
                <div className="flex items-center justify-center gap-2 text-muted-foreground">
                  <RefreshCw className="h-4 w-4 animate-spin" /> Loading proposals...
                </div>
              </CardContent>
            </Card>
          ) : filtered.length === 0 ? (
            <Card>
              <CardContent className="py-12">
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <FileText className="h-10 w-10 text-muted-foreground/50" />
                  <p>No proposals found</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="rounded-md border overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Proposal #</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Objective</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Suitability</TableHead>
                      <TableHead>Created By</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((p) => (
                      <TableRow key={p.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openDetail(p.id)}>
                        <TableCell className="font-mono text-sm">{p.proposal_number}</TableCell>
                        <TableCell>{p.customer_name}</TableCell>
                        <TableCell className="max-w-[200px] truncate">{p.title}</TableCell>
                        <TableCell className="text-xs">{p.investment_objective.replace(/_/g, " ")}</TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {fmtCurrency(p.proposed_amount, p.currency)}
                        </TableCell>
                        <TableCell>
                          <Badge className={STATUS_COLORS[p.status] ?? "bg-muted text-foreground"} variant="secondary">
                            {p.status.replace(/_/g, " ")}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {p.suitability_pass === null ? (
                            <span className="text-xs text-muted-foreground">--</span>
                          ) : p.suitability_pass ? (
                            <CheckCircle className="h-4 w-4 text-green-600" />
                          ) : (
                            <AlertTriangle className="h-4 w-4 text-red-600" />
                          )}
                        </TableCell>
                        <TableCell className="text-sm">{p.created_by}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{fmtDate(p.created_at)}</TableCell>
                        <TableCell>
                          <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); openDetail(p.id); }}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalCount > pageSize && (
                <div className="flex items-center justify-between pt-4">
                  <p className="text-sm text-muted-foreground">
                    Showing {(page - 1) * pageSize + 1} - {Math.min(page * pageSize, totalCount)} of {totalCount}
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                      Previous
                    </Button>
                    <Button size="sm" variant="outline" disabled={page * pageSize >= totalCount} onClick={() => setPage((p) => p + 1)}>
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* ====== Create Proposal Dialog ====== */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Create Investment Proposal</DialogTitle>
            <DialogDescription>Fill in the details to create a new proposal in DRAFT status.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label htmlFor="ip-customer-id" className="text-sm font-medium">Customer ID *</label>
              <Input
                id="ip-customer-id"
                placeholder="e.g. CUST-001"
                value={newProposal.customer_id}
                onChange={(e) => setNewProposal({ ...newProposal, customer_id: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="ip-title" className="text-sm font-medium">Title *</label>
              <Input
                id="ip-title"
                placeholder="Proposal title"
                value={newProposal.title}
                onChange={(e) => setNewProposal({ ...newProposal, title: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Investment Objective *</label>
              <Select
                value={newProposal.investment_objective}
                onValueChange={(v) => setNewProposal({ ...newProposal, investment_objective: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select objective" />
                </SelectTrigger>
                <SelectContent>
                  {OBJECTIVES.map((o) => (
                    <SelectItem key={o} value={o}>{o.replace(/_/g, " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label htmlFor="ip-horizon" className="text-sm font-medium">Time Horizon (years) *</label>
              <Input
                id="ip-horizon"
                type="number"
                min={1}
                max={30}
                value={newProposal.time_horizon_years}
                onChange={(e) => setNewProposal({ ...newProposal, time_horizon_years: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="ip-amount" className="text-sm font-medium">Proposed Amount *</label>
                <Input
                  id="ip-amount"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={newProposal.proposed_amount}
                  onChange={(e) => setNewProposal({ ...newProposal, proposed_amount: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Currency</label>
                <Select
                  value={newProposal.currency}
                  onValueChange={(v) => setNewProposal({ ...newProposal, currency: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              onClick={() => createMut.mutate(newProposal)}
              disabled={
                createMut.isPending ||
                !newProposal.customer_id ||
                !newProposal.title ||
                !newProposal.investment_objective ||
                !newProposal.proposed_amount
              }
            >
              {createMut.isPending ? "Creating..." : "Create Proposal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ====== Proposal Detail Dialog ====== */}
      <Dialog open={detailOpen} onOpenChange={(open) => { setDetailOpen(open); if (!open) { setSelectedId(null); setWhatIfResult(null); } }}>
        <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              {detail ? (
                <>
                  <span className="font-mono">{detail.proposal_number}</span>
                  <Badge className={STATUS_COLORS[detail.status] ?? ""} variant="secondary">
                    {detail.status.replace(/_/g, " ")}
                  </Badge>
                </>
              ) : (
                "Loading..."
              )}
            </DialogTitle>
            {detail && (
              <DialogDescription>
                {detail.title} -- {detail.customer_name}
              </DialogDescription>
            )}
          </DialogHeader>

          {detailQuery.isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <RefreshCw className="h-4 w-4 animate-spin mr-2" /> Loading details...
            </div>
          ) : detail ? (
            <div className="space-y-6 py-2">
              {/* Summary Card */}
              <div className="grid gap-4 sm:grid-cols-2">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <FileText className="h-4 w-4" /> Proposal Details
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1 text-sm">
                    <DetailRow label="Customer" value={detail.customer_name} />
                    <DetailRow label="Objective" value={detail.investment_objective.replace(/_/g, " ")} />
                    <DetailRow label="Horizon" value={`${detail.time_horizon_years} years`} />
                    <DetailRow label="Amount" value={fmtCurrency(detail.proposed_amount, detail.currency)} />
                    <DetailRow label="Created" value={fmtDate(detail.created_at)} />
                    <DetailRow label="Created By" value={detail.created_by} />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4" /> Risk & Suitability
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <DetailRow label="Risk Profile" value={detail.risk_profile_summary ?? "Not assessed"} />
                    <div className="flex items-center justify-between py-1">
                      <span className="text-muted-foreground">Suitability</span>
                      {detail.suitability_pass === null ? (
                        <span className="text-muted-foreground">Not checked</span>
                      ) : detail.suitability_pass ? (
                        <Badge className="bg-green-100 text-green-800">PASS</Badge>
                      ) : (
                        <Badge className="bg-red-100 text-red-800">FAIL</Badge>
                      )}
                    </div>
                    {detail.suitability_details && (
                      <p className="text-xs text-muted-foreground bg-muted p-2 rounded">{detail.suitability_details}</p>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full mt-2 gap-1"
                      onClick={() => suitabilityMut.mutate(detail.id)}
                      disabled={suitabilityMut.isPending}
                    >
                      <ShieldCheck className="h-3 w-3" />
                      {suitabilityMut.isPending ? "Checking..." : "Run Suitability Check"}
                    </Button>
                  </CardContent>
                </Card>
              </div>

              {/* Workflow Actions */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Actions</CardTitle>
                </CardHeader>
                <CardContent>{renderWorkflowActions(detail)}</CardContent>
              </Card>

              {/* Line Items */}
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <BarChart3 className="h-4 w-4" /> Line Items
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-medium ${Math.abs(totalAllocation - 100) < 0.01 ? "text-green-600" : "text-orange-600"}`}>
                        Total: {fmtPct(totalAllocation)}
                      </span>
                      {detail.status === "DRAFT" && (
                        <Button size="sm" variant="outline" onClick={handleAddLineItem}>
                          <Plus className="h-3 w-3 mr-1" /> Add
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {lineItems.length === 0 ? (
                    <p className="text-center text-sm text-muted-foreground py-6">
                      No line items yet. Add assets to build the allocation.
                    </p>
                  ) : (
                    <div className="rounded-md border overflow-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Asset Class</TableHead>
                            <TableHead>Product</TableHead>
                            <TableHead>Risk Code</TableHead>
                            <TableHead className="text-right">Allocation %</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead>Risk Flag</TableHead>
                            {detail.status === "DRAFT" && <TableHead>Actions</TableHead>}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {lineItems.map((li) => (
                            <TableRow key={li.id} className={li.risk_deviation_flagged ? "bg-amber-50 dark:bg-amber-900/20" : ""}>
                              <TableCell className="text-sm">{li.asset_class}</TableCell>
                              <TableCell className="text-sm">{li.product_name}</TableCell>
                              <TableCell className="font-mono text-sm">{li.product_risk_code}</TableCell>
                              <TableCell className="text-right font-mono text-sm">{fmtPct(li.allocation_percentage)}</TableCell>
                              <TableCell className="text-right font-mono text-sm">
                                {fmtCurrency(li.allocation_amount, detail.currency)}
                              </TableCell>
                              <TableCell>
                                {li.risk_deviation_flagged ? (
                                  <AlertTriangle className="h-4 w-4 text-orange-500" />
                                ) : (
                                  <CheckCircle className="h-4 w-4 text-green-500" />
                                )}
                              </TableCell>
                              {detail.status === "DRAFT" && (
                                <TableCell>
                                  <div className="flex gap-1">
                                    <Button size="sm" variant="ghost" onClick={() => handleEditLineItem(li)}>
                                      <Pencil className="h-3 w-3" />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="text-destructive"
                                      onClick={() => deleteLineItemMut.mutate(li.id)}
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </TableCell>
                              )}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* What-If Panel */}
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <TrendingUp className="h-4 w-4" /> What-If Analysis
                    </CardTitle>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => whatIfMut.mutate(detail.id)}
                      disabled={whatIfMut.isPending || lineItems.length === 0}
                    >
                      <BarChart3 className="h-3 w-3 mr-1" />
                      {whatIfMut.isPending ? "Computing..." : "Compute"}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {whatIfResult ? (
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                      <MetricCard label="Expected Return" value={fmtPct(whatIfResult.expected_return_pct)} />
                      <MetricCard label="Std Deviation" value={fmtPct(whatIfResult.expected_std_dev_pct)} />
                      <MetricCard label="Sharpe Ratio" value={whatIfResult.sharpe_ratio.toFixed(3)} />
                      <MetricCard label="Max Drawdown" value={fmtPct(whatIfResult.max_drawdown_pct)} negative />
                    </div>
                  ) : (
                    <p className="text-center text-sm text-muted-foreground py-4">
                      Click "Compute" to run what-if analysis on the current allocation.
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">Proposal not found.</p>
          )}
        </DialogContent>
      </Dialog>

      {/* ====== Workflow Action Dialog ====== */}
      <Dialog open={actionDialogOpen} onOpenChange={setActionDialogOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="capitalize">{actionType.replace(/-/g, " ")}</DialogTitle>
            <DialogDescription>
              Provide optional comments for this action on proposal{" "}
              <span className="font-mono font-semibold">{detail?.proposal_number}</span>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <label htmlFor="ip-action-comment" className="text-sm font-medium">Comments</label>
            <Textarea
              id="ip-action-comment"
              value={actionComment}
              onChange={(e) => setActionComment(e.target.value)}
              placeholder="Enter comments..."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialogOpen(false)}>Cancel</Button>
            <Button
              variant={actionType.includes("reject") ? "destructive" : "default"}
              onClick={() => {
                if (selectedId != null) {
                  workflowMut.mutate({ id: selectedId, action: actionType, comments: actionComment || undefined });
                }
              }}
              disabled={workflowMut.isPending}
            >
              {workflowMut.isPending ? "Processing..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Product Risk Deviation Alert Dialog (FR-021.AC1-4) */}
      <Dialog open={deviationAlert.open} onOpenChange={(open) => setDeviationAlert((s) => ({ ...s, open }))}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700">
              <AlertTriangle className="h-5 w-5" />
              Product Risk Rating Alert
            </DialogTitle>
            <DialogDescription>
              This product has a higher risk rating than the client's risk profile.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-sm">
              <p className="font-medium text-amber-800 mb-2">Client Risk Profile</p>
              <p className="text-amber-700">Risk Category: <span className="font-semibold">{deviationAlert.customerRiskCategory ?? "—"}</span></p>
              <p className="text-amber-700">Risk Code: <span className="font-semibold">{deviationAlert.customerRiskCode ?? "—"}</span></p>
            </div>
            <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm">
              <p className="font-medium text-red-800 mb-2">Product Details</p>
              <p className="text-red-700">Product: <span className="font-semibold">{lineItemForm.product_name}</span></p>
              <p className="text-red-700">Product Risk Code: <span className="font-semibold">{deviationAlert.productRiskCode ?? lineItemForm.product_risk_code}</span></p>
            </div>
            <p className="text-xs text-muted-foreground italic">
              This product has a higher risk rating than the client's risk profile. Confirmation of client notification is required before proceeding.
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeviationAlert((s) => ({ ...s, open: false, pendingBody: null }))}
            >
              Cancel
            </Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={() => {
                if (!deviationAlert.pendingBody || !detail?.customer_id) return;
                const body = {
                  ...deviationAlert.pendingBody,
                  deviation_acknowledged: true,
                };
                addLineItemMut.mutate(body);
                // Record the deviation
                if (deviationAlert.customerRiskCode != null && deviationAlert.productRiskCode != null) {
                  recordDeviationMut.mutate({
                    customer_id: detail.customer_id,
                    product_risk_code: deviationAlert.productRiskCode,
                    customer_risk_code: deviationAlert.customerRiskCode,
                  });
                }
                setDeviationAlert({ open: false, hasDeviation: false, customerRiskCode: null, customerRiskCategory: null, productRiskCode: null, pendingBody: null });
              }}
            >
              Confirm Notified to Customer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ====== Line Item Dialog ====== */}
      <Dialog open={lineItemDialogOpen} onOpenChange={setLineItemDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>{editingLineItem ? "Edit Line Item" : "Add Line Item"}</DialogTitle>
            <DialogDescription>
              {editingLineItem ? "Update the allocation details." : "Add a new asset to the proposal allocation."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label htmlFor="ip-li-asset" className="text-sm font-medium">Asset Class *</label>
              <Input
                id="ip-li-asset"
                placeholder="e.g. Equity, Fixed Income, Alternatives"
                value={lineItemForm.asset_class}
                onChange={(e) => setLineItemForm({ ...lineItemForm, asset_class: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="ip-li-product" className="text-sm font-medium">Product Name *</label>
              <Input
                id="ip-li-product"
                placeholder="e.g. Large Cap Growth Fund"
                value={lineItemForm.product_name}
                onChange={(e) => setLineItemForm({ ...lineItemForm, product_name: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="ip-li-risk-code" className="text-sm font-medium">Product Risk Code *</label>
              {/* Risk Rating guidance */}
              <div className="rounded-md bg-blue-50 border border-blue-200 p-2 text-xs text-blue-700 mb-1">
                Risk Code Reference: 1=Very Low, 2=Low, 3=Moderate, 4=Moderately High, 5=High, 6=Very High
              </div>
              <Input
                id="ip-li-risk-code"
                placeholder="e.g. 1–6"
                value={lineItemForm.product_risk_code}
                onChange={(e) => setLineItemForm({ ...lineItemForm, product_risk_code: e.target.value })}
              />
              <p className="text-xs text-muted-foreground mt-1">Risk Code 1 (lowest) to 6 (highest risk)</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Allocation % *</label>
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  max={100}
                  placeholder="0.00"
                  value={lineItemForm.allocation_percentage}
                  onChange={(e) => setLineItemForm({ ...lineItemForm, allocation_percentage: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Allocation Amount *</label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={lineItemForm.allocation_amount}
                  onChange={(e) => setLineItemForm({ ...lineItemForm, allocation_amount: e.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLineItemDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={submitLineItem}
              disabled={
                addLineItemMut.isPending ||
                updateLineItemMut.isPending ||
                !lineItemForm.asset_class ||
                !lineItemForm.product_name ||
                !lineItemForm.product_risk_code ||
                !lineItemForm.allocation_percentage ||
                !lineItemForm.allocation_amount
              }
            >
              {(addLineItemMut.isPending || updateLineItemMut.isPending)
                ? "Saving..."
                : editingLineItem
                  ? "Update"
                  : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ====== Delete Confirmation Dialog ====== */}
      <Dialog open={deleteConfirmId !== null} onOpenChange={(open) => { if (!open) setDeleteConfirmId(null); }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Delete Proposal</DialogTitle>
            <DialogDescription>
              Are you sure you want to permanently delete this proposal? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteConfirmId !== null) {
                  deleteProposalMut.mutate(deleteConfirmId);
                  setDeleteConfirmId(null);
                }
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------- Sub-components ---------- */
function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

function MetricCard({ label, value, negative }: { label: string; value: string; negative?: boolean }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3 text-center">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-bold ${negative ? "text-red-600" : "text-primary"}`}>{value}</p>
    </div>
  );
}
