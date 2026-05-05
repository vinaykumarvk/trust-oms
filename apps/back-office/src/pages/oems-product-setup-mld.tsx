import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@ui/lib/queryClient";
import { Badge } from "@ui/components/ui/badge";
import { Button } from "@ui/components/ui/button";
import { Card, CardContent } from "@ui/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@ui/components/ui/dialog";
import { Input } from "@ui/components/ui/input";
import { Label } from "@ui/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@ui/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@ui/components/ui/table";
import { Textarea } from "@ui/components/ui/textarea";
import {
  Plus, Search, Eye, Pencil, Send, CheckCircle, XCircle, Ban,
} from "lucide-react";

/* ---------- Constants ---------- */
const API = "/api/v1/oems/mld/tranches";

const OPTION_TYPES = ["One Touch", "No Touch", "Double No Touch"] as const;

const STATUSES = ["ALL", "DRAFT", "PENDING_APPROVAL", "ACTIVE", "REJECTED", "INACTIVE"] as const;

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  ACTIVE: "default",
  INACTIVE: "secondary",
  PENDING_APPROVAL: "outline",
  REJECTED: "destructive",
  DRAFT: "secondary",
};

const BALANCE_VALIDATION_MODES = ["AVAILABLE_BALANCE", "AVERAGE_90_DAY"] as const;
const SUITABILITY_MODES = ["STANDARD", "ENHANCED", "WAIVED"] as const;

/* ---------- Types ---------- */
interface MldTrancheEnhanced {
  id: number; tranche_code: string; tranche_name: string; product_id: string | null;
  currency: string; underlying_reference: string | null; option_type: string | null;
  option_style: string | null; reference_spot: string | null; data_source: string | null;
  strike_rate: string | null; indicative_rate: string | null;
  minimum_interest_rate: string | null; bonus_payout_rate: string | null;
  participation_rate: string | null; max_interest_rate: string | null; tax_rate: string | null;
  offering_start: string; offering_end: string; trade_date: string; value_date: string;
  fixing_date: string; maturity_date: string; tenor: number | null;
  quota_amount: string | null; min_investment: string | null; max_investment: string | null;
  minimum_collective_nominal: string | null; balance_validation_mode: string | null;
  upper_limit: string | null; lower_limit: string | null;
  observation_period_start: string | null; observation_period_end: string | null;
  calculating_agent: string | null; required_documents: string | null;
  term_sheet_file_path: string | null; eligible_account_types: string | null;
  risk_rating: string | null; suitability_check_mode: string | null;
  sales_cert_required: boolean; sales_cert_type: string | null;
  cutoff_time: string | null; cutoff_timezone: string | null;
  early_termination_allowed: boolean; callback_required: boolean;
  authorization_status: string; rejection_reason: string | null;
  deactivation_reason: string | null; created_at: string; updated_at: string;
  approval_history?: ApprovalEntry[];
}

interface ApprovalEntry { action: string; performed_by: string; performed_at: string; reason?: string; }
interface ListResponse { data: MldTrancheEnhanced[]; total: number; }
/* ---------- Form defaults ---------- */
const emptyForm = () => ({
  tranche_name: "",
  product_id: "",
  currency: "IDR",
  offering_start: "",
  offering_end: "",
  trade_date: "",
  value_date: "",
  fixing_date: "",
  maturity_date: "",
  tenor: "",
  option_type: "",
  option_style: "",
  underlying_reference: "",
  reference_spot: "",
  data_source: "",
  strike_rate: "",
  indicative_rate: "",
  minimum_interest_rate: "",
  bonus_payout_rate: "",
  participation_rate: "",
  max_interest_rate: "",
  tax_rate: "",
  quota_amount: "",
  min_investment: "",
  max_investment: "",
  minimum_collective_nominal: "",
  balance_validation_mode: "AVAILABLE_BALANCE",
  upper_limit: "",
  lower_limit: "",
  observation_period_start: "",
  observation_period_end: "",
  calculating_agent: "",
  required_documents: "[]",
  term_sheet_file_path: "",
  eligible_account_types: "",
  risk_rating: "",
  suitability_check_mode: "STANDARD",
  sales_cert_required: false,
  sales_cert_type: "",
  cutoff_time: "",
  cutoff_timezone: "Asia/Jakarta",
  early_termination_allowed: false,
  callback_required: false,
});

type FormState = ReturnType<typeof emptyForm>;
/* ---------- Helpers ---------- */
const fmtDate = (d: string | null | undefined) => {
  if (!d) return "--";
  try { return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return d; }
};

const fmtAmount = (n: string | null | undefined) => {
  if (!n) return "--";
  const num = parseFloat(n);
  if (isNaN(num)) return "--";
  return num.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};
/* ========== Main Component ========== */
export default function OemsProductSetupMld() {
  const qc = useQueryClient();

  /* -- Filter state -- */
  const [search, setSearch] = useState("");
  const [optionTypeFilter, setOptionTypeFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  /* -- Dialog state -- */
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const [viewItem, setViewItem] = useState<MldTrancheEnhanced | null>(null);
  const [reasonDialogOpen, setReasonDialogOpen] = useState(false);
  const [reasonAction, setReasonAction] = useState<"reject" | "deactivate">("reject");
  const [reasonTargetId, setReasonTargetId] = useState<number | null>(null);
  const [reasonText, setReasonText] = useState("");

  /* -- Form state -- */
  const [form, setForm] = useState<FormState>(emptyForm());

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  /* -- Computed max interest suggestion -- */
  const maxInterestSuggestion = useMemo(() => {
    const min = parseFloat(form.minimum_interest_rate);
    const bonus = parseFloat(form.bonus_payout_rate);
    if (!isNaN(min) && !isNaN(bonus)) return (min + bonus).toFixed(4);
    return null;
  }, [form.minimum_interest_rate, form.bonus_payout_rate]);

  /* -- Query params -- */
  const queryParams = useMemo(() => {
    const p = new URLSearchParams();
    if (search) p.set("search", search);
    if (optionTypeFilter !== "ALL") p.set("optionType", optionTypeFilter);
    if (statusFilter !== "ALL") p.set("status", statusFilter);
    p.set("page", String(page));
    p.set("pageSize", String(pageSize));
    return p.toString();
  }, [search, optionTypeFilter, statusFilter, page]);

  /* -- Queries -- */
  const listQuery = useQuery<ListResponse>({
    queryKey: ["mld-tranches-enhanced", queryParams],
    queryFn: () => apiRequest("GET", `${API}/enhanced?${queryParams}`),
  });

  const tranches = listQuery.data?.data ?? [];
  const total = listQuery.data?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  /* -- Mutations -- */
  const createMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiRequest("POST", `${API}/enhanced`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["mld-tranches-enhanced"] }); setCreateOpen(false); setForm(emptyForm()); },
  });

  const modifyMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      apiRequest("PATCH", `${API}/${id}`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["mld-tranches-enhanced"] }); setCreateOpen(false); setEditingId(null); setForm(emptyForm()); },
  });

  const submitMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `${API}/${id}/submit`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mld-tranches-enhanced"] }),
  });

  const approveMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `${API}/${id}/approve`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mld-tranches-enhanced"] }),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      apiRequest("POST", `${API}/${id}/reject`, { reason }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["mld-tranches-enhanced"] }); setReasonDialogOpen(false); setReasonText(""); },
  });

  const deactivateMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      apiRequest("POST", `${API}/${id}/deactivate`, { reason }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["mld-tranches-enhanced"] }); setReasonDialogOpen(false); setReasonText(""); },
  });

  /* -- Handlers -- */
  const handleCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setCreateOpen(true);
  };

  const handleEdit = (t: MldTrancheEnhanced) => {
    setEditingId(t.id);
    setForm({
      tranche_name: t.tranche_name || "",
      product_id: t.product_id || "",
      currency: t.currency || "IDR",
      offering_start: t.offering_start?.slice(0, 10) || "",
      offering_end: t.offering_end?.slice(0, 10) || "",
      trade_date: t.trade_date?.slice(0, 10) || "",
      value_date: t.value_date?.slice(0, 10) || "",
      fixing_date: t.fixing_date?.slice(0, 10) || "",
      maturity_date: t.maturity_date?.slice(0, 10) || "",
      tenor: t.tenor != null ? String(t.tenor) : "",
      option_type: t.option_type || "",
      option_style: t.option_style || "",
      underlying_reference: t.underlying_reference || "",
      reference_spot: t.reference_spot || "",
      data_source: t.data_source || "",
      strike_rate: t.strike_rate || "",
      indicative_rate: t.indicative_rate || "",
      minimum_interest_rate: t.minimum_interest_rate || "",
      bonus_payout_rate: t.bonus_payout_rate || "",
      participation_rate: t.participation_rate || "",
      max_interest_rate: t.max_interest_rate || "",
      tax_rate: t.tax_rate || "",
      quota_amount: t.quota_amount || "",
      min_investment: t.min_investment || "",
      max_investment: t.max_investment || "",
      minimum_collective_nominal: t.minimum_collective_nominal || "",
      balance_validation_mode: t.balance_validation_mode || "AVAILABLE_BALANCE",
      upper_limit: t.upper_limit || "",
      lower_limit: t.lower_limit || "",
      observation_period_start: t.observation_period_start?.slice(0, 10) || "",
      observation_period_end: t.observation_period_end?.slice(0, 10) || "",
      calculating_agent: t.calculating_agent || "",
      required_documents: t.required_documents || "[]",
      term_sheet_file_path: t.term_sheet_file_path || "",
      eligible_account_types: t.eligible_account_types || "",
      risk_rating: t.risk_rating || "",
      suitability_check_mode: t.suitability_check_mode || "STANDARD",
      sales_cert_required: t.sales_cert_required ?? false,
      sales_cert_type: t.sales_cert_type || "",
      cutoff_time: t.cutoff_time || "",
      cutoff_timezone: t.cutoff_timezone || "Asia/Jakarta",
      early_termination_allowed: t.early_termination_allowed ?? false,
      callback_required: t.callback_required ?? false,
    });
    setCreateOpen(true);
  };

  const handleView = (t: MldTrancheEnhanced) => {
    setViewItem(t);
    setViewOpen(true);
  };

  const handleSubmitTranche = (id: number) => submitMutation.mutate(id);
  const handleApprove = (id: number) => approveMutation.mutate(id);

  const handleRejectOrDeactivate = (id: number, action: "reject" | "deactivate") => {
    setReasonTargetId(id);
    setReasonAction(action);
    setReasonText("");
    setReasonDialogOpen(true);
  };

  const confirmReason = () => {
    if (!reasonTargetId || reasonText.length < 10) return;
    if (reasonAction === "reject") {
      rejectMutation.mutate({ id: reasonTargetId, reason: reasonText });
    } else {
      deactivateMutation.mutate({ id: reasonTargetId, reason: reasonText });
    }
  };

  const handleSave = () => {
    const body: Record<string, unknown> = { ...form };
    if (form.tenor) body.tenor = parseInt(form.tenor, 10);
    if (editingId) {
      modifyMutation.mutate({ id: editingId, body });
    } else {
      createMutation.mutate(body);
    }
  };

  const showBarrier = form.option_type.includes("Double");

  /* ========== Render ========== */
  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">MLD Product Setup</h1>
        <Button onClick={handleCreate}>
          <Plus className="mr-2 h-4 w-4" /> Create New Tranche
        </Button>
      </div>

      {/* Filter Bar */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 pt-4">
          <div className="flex-1 min-w-[200px]">
            <Label>Search</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Search by code or name..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              />
            </div>
          </div>
          <div className="w-[180px]">
            <Label>Option Type</Label>
            <Select value={optionTypeFilter} onValueChange={(v) => { setOptionTypeFilter(v); setPage(1); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Types</SelectItem>
                {OPTION_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="w-[180px]">
            <Label>Status</Label>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => <SelectItem key={s} value={s}>{s === "ALL" ? "All Statuses" : s.replace(/_/g, " ")}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Data Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tranche Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Currency</TableHead>
                <TableHead>Underlying</TableHead>
                <TableHead>Option Type</TableHead>
                <TableHead>Offer Period</TableHead>
                <TableHead>Tenor</TableHead>
                <TableHead>Min Placement</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tranches.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                    No tranches found.
                  </TableCell>
                </TableRow>
              )}
              {tranches.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-mono text-xs">{t.tranche_code}</TableCell>
                  <TableCell>{t.tranche_name}</TableCell>
                  <TableCell>{t.currency}</TableCell>
                  <TableCell>{t.underlying_reference || "--"}</TableCell>
                  <TableCell>{t.option_type || "--"}</TableCell>
                  <TableCell className="text-xs">
                    {fmtDate(t.offering_start)} - {fmtDate(t.offering_end)}
                  </TableCell>
                  <TableCell>{t.tenor != null ? `${t.tenor}d` : "--"}</TableCell>
                  <TableCell>{fmtAmount(t.min_investment)}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[t.authorization_status] ?? "secondary"}>
                      {t.authorization_status?.replace(/_/g, " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => handleView(t)} title="View">
                        <Eye className="h-4 w-4" />
                      </Button>
                      {(t.authorization_status === "DRAFT" || t.authorization_status === "REJECTED") && (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => handleEdit(t)} title="Modify">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleSubmitTranche(t.id)} title="Submit">
                            <Send className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                      {t.authorization_status === "PENDING_APPROVAL" && (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => handleApprove(t.id)} title="Approve">
                            <CheckCircle className="h-4 w-4 text-green-600" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleRejectOrDeactivate(t.id, "reject")} title="Reject">
                            <XCircle className="h-4 w-4 text-red-600" />
                          </Button>
                        </>
                      )}
                      {t.authorization_status === "ACTIVE" && (
                        <Button size="sm" variant="ghost" onClick={() => handleRejectOrDeactivate(t.id, "deactivate")} title="Deactivate">
                          <Ban className="h-4 w-4 text-orange-600" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t px-4 py-2">
              <span className="text-sm text-muted-foreground">
                Page {page} of {totalPages} ({total} records)
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
                <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create / Edit Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Modify Tranche" : "Create New Tranche"}</DialogTitle>
            <DialogDescription>
              {editingId ? "Update the MLD tranche details below." : "Fill in the details to create a new MLD tranche."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Section 1: Identity */}
            <fieldset className="border rounded p-3 space-y-3">
              <legend className="text-sm font-semibold px-1">Identity</legend>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Tranche Name *</Label>
                  <Input value={form.tranche_name} onChange={(e) => setField("tranche_name", e.target.value)} />
                </div>
                <div>
                  <Label>Product ID</Label>
                  <Input value={form.product_id} onChange={(e) => setField("product_id", e.target.value)} placeholder="Optional" />
                </div>
                <div>
                  <Label>Currency *</Label>
                  <Input value={form.currency} onChange={(e) => setField("currency", e.target.value)} />
                </div>
              </div>
            </fieldset>

            {/* Section 2: Offer Period & Dates */}
            <fieldset className="border rounded p-3 space-y-3">
              <legend className="text-sm font-semibold px-1">Offer Period & Dates</legend>
              <div className="grid grid-cols-4 gap-3">
                <div>
                  <Label>Offering Start *</Label>
                  <Input type="date" value={form.offering_start} onChange={(e) => setField("offering_start", e.target.value)} />
                </div>
                <div>
                  <Label>Offering End *</Label>
                  <Input type="date" value={form.offering_end} onChange={(e) => setField("offering_end", e.target.value)} />
                </div>
                <div>
                  <Label>Trade Date *</Label>
                  <Input type="date" value={form.trade_date} onChange={(e) => setField("trade_date", e.target.value)} />
                </div>
                <div>
                  <Label>Value Date *</Label>
                  <Input type="date" value={form.value_date} onChange={(e) => setField("value_date", e.target.value)} />
                </div>
                <div>
                  <Label>Fixing Date *</Label>
                  <Input type="date" value={form.fixing_date} onChange={(e) => setField("fixing_date", e.target.value)} />
                </div>
                <div>
                  <Label>Maturity Date *</Label>
                  <Input type="date" value={form.maturity_date} onChange={(e) => setField("maturity_date", e.target.value)} />
                </div>
                <div>
                  <Label>Tenor (days)</Label>
                  <Input type="number" value={form.tenor} onChange={(e) => setField("tenor", e.target.value)} />
                </div>
              </div>
            </fieldset>

            {/* Section 3: Currency & Option Structure */}
            <fieldset className="border rounded p-3 space-y-3">
              <legend className="text-sm font-semibold px-1">Currency & Option Structure</legend>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Option Type *</Label>
                  <Select value={form.option_type} onValueChange={(v) => setField("option_type", v)}>
                    <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>
                      {OPTION_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Option Style</Label>
                  <Input value={form.option_style} onChange={(e) => setField("option_style", e.target.value)} />
                </div>
                <div>
                  <Label>Underlying Reference</Label>
                  <Input value={form.underlying_reference} onChange={(e) => setField("underlying_reference", e.target.value)} />
                </div>
                <div>
                  <Label>Reference Spot</Label>
                  <Input value={form.reference_spot} onChange={(e) => setField("reference_spot", e.target.value)} />
                </div>
                <div>
                  <Label>Data Source</Label>
                  <Input value={form.data_source} onChange={(e) => setField("data_source", e.target.value)} />
                </div>
                <div>
                  <Label>Strike Rate</Label>
                  <Input value={form.strike_rate} onChange={(e) => setField("strike_rate", e.target.value)} />
                </div>
              </div>
            </fieldset>

            {/* Section 4: Interest Rates */}
            <fieldset className="border rounded p-3 space-y-3">
              <legend className="text-sm font-semibold px-1">Interest Rates</legend>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Indicative Rate</Label>
                  <Input value={form.indicative_rate} onChange={(e) => setField("indicative_rate", e.target.value)} />
                </div>
                <div>
                  <Label>Minimum Interest Rate</Label>
                  <Input value={form.minimum_interest_rate} onChange={(e) => setField("minimum_interest_rate", e.target.value)} />
                </div>
                <div>
                  <Label>Bonus Payout Rate</Label>
                  <Input value={form.bonus_payout_rate} onChange={(e) => setField("bonus_payout_rate", e.target.value)} />
                </div>
                <div>
                  <Label>Participation Rate</Label>
                  <Input value={form.participation_rate} onChange={(e) => setField("participation_rate", e.target.value)} />
                </div>
                <div>
                  <Label>Max Interest Rate</Label>
                  <Input value={form.max_interest_rate} onChange={(e) => setField("max_interest_rate", e.target.value)} />
                  {maxInterestSuggestion && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Suggested: {maxInterestSuggestion} (min + bonus)
                    </p>
                  )}
                </div>
                <div>
                  <Label>Tax Rate</Label>
                  <Input value={form.tax_rate} onChange={(e) => setField("tax_rate", e.target.value)} />
                </div>
              </div>
            </fieldset>

            {/* Section 5: Placement Rules */}
            <fieldset className="border rounded p-3 space-y-3">
              <legend className="text-sm font-semibold px-1">Placement Rules</legend>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Quota Amount</Label>
                  <Input value={form.quota_amount} onChange={(e) => setField("quota_amount", e.target.value)} />
                </div>
                <div>
                  <Label>Min Investment</Label>
                  <Input value={form.min_investment} onChange={(e) => setField("min_investment", e.target.value)} />
                </div>
                <div>
                  <Label>Max Investment</Label>
                  <Input value={form.max_investment} onChange={(e) => setField("max_investment", e.target.value)} />
                </div>
                <div>
                  <Label>Minimum Collective Nominal</Label>
                  <Input value={form.minimum_collective_nominal} onChange={(e) => setField("minimum_collective_nominal", e.target.value)} />
                </div>
                <div>
                  <Label>Balance Validation Mode</Label>
                  <Select value={form.balance_validation_mode} onValueChange={(v) => setField("balance_validation_mode", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {BALANCE_VALIDATION_MODES.map((m) => <SelectItem key={m} value={m}>{m.replace(/_/g, " ")}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </fieldset>

            {/* Section 6: Barrier Limits (conditional) */}
            {showBarrier && (
              <fieldset className="border rounded p-3 space-y-3">
                <legend className="text-sm font-semibold px-1">Barrier Limits</legend>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label>Upper Limit</Label>
                    <Input value={form.upper_limit} onChange={(e) => setField("upper_limit", e.target.value)} />
                  </div>
                  <div>
                    <Label>Lower Limit</Label>
                    <Input value={form.lower_limit} onChange={(e) => setField("lower_limit", e.target.value)} />
                  </div>
                  <div>
                    <Label>Calculating Agent</Label>
                    <Input value={form.calculating_agent} onChange={(e) => setField("calculating_agent", e.target.value)} />
                  </div>
                  <div>
                    <Label>Observation Period Start</Label>
                    <Input type="date" value={form.observation_period_start} onChange={(e) => setField("observation_period_start", e.target.value)} />
                  </div>
                  <div>
                    <Label>Observation Period End</Label>
                    <Input type="date" value={form.observation_period_end} onChange={(e) => setField("observation_period_end", e.target.value)} />
                  </div>
                </div>
              </fieldset>
            )}

            {/* Section 7: Documents & Eligibility */}
            <fieldset className="border rounded p-3 space-y-3">
              <legend className="text-sm font-semibold px-1">Documents & Eligibility</legend>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label>Required Documents (JSON array)</Label>
                  <Textarea
                    rows={3}
                    value={form.required_documents}
                    onChange={(e) => setField("required_documents", e.target.value)}
                    placeholder='["KTP", "NPWP", "Term Sheet Acknowledgment"]'
                  />
                </div>
                <div>
                  <Label>Term Sheet File Path</Label>
                  <Input value={form.term_sheet_file_path} onChange={(e) => setField("term_sheet_file_path", e.target.value)} />
                </div>
                <div>
                  <Label>Eligible Account Types (comma-separated)</Label>
                  <Input value={form.eligible_account_types} onChange={(e) => setField("eligible_account_types", e.target.value)} placeholder="SAVINGS,CURRENT,TD" />
                </div>
                <div>
                  <Label>Risk Rating</Label>
                  <Input value={form.risk_rating} onChange={(e) => setField("risk_rating", e.target.value)} />
                </div>
                <div>
                  <Label>Suitability Check Mode</Label>
                  <Select value={form.suitability_check_mode} onValueChange={(v) => setField("suitability_check_mode", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SUITABILITY_MODES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </fieldset>

            {/* Section 8: Sales Certification & Cutoffs */}
            <fieldset className="border rounded p-3 space-y-3">
              <legend className="text-sm font-semibold px-1">Sales Certification & Cutoffs</legend>
              <div className="grid grid-cols-3 gap-3">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="sales_cert_required"
                    checked={form.sales_cert_required}
                    onChange={(e) => setField("sales_cert_required", e.target.checked)}
                    className="h-4 w-4"
                  />
                  <Label htmlFor="sales_cert_required">Sales Cert Required</Label>
                </div>
                <div>
                  <Label>Sales Cert Type</Label>
                  <Input value={form.sales_cert_type} onChange={(e) => setField("sales_cert_type", e.target.value)} />
                </div>
                <div>
                  <Label>Cutoff Time</Label>
                  <Input type="time" value={form.cutoff_time} onChange={(e) => setField("cutoff_time", e.target.value)} />
                </div>
                <div>
                  <Label>Cutoff Timezone</Label>
                  <Input value={form.cutoff_timezone} onChange={(e) => setField("cutoff_timezone", e.target.value)} />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="early_termination_allowed"
                    checked={form.early_termination_allowed}
                    onChange={(e) => setField("early_termination_allowed", e.target.checked)}
                    className="h-4 w-4"
                  />
                  <Label htmlFor="early_termination_allowed">Early Termination Allowed</Label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="callback_required"
                    checked={form.callback_required}
                    onChange={(e) => setField("callback_required", e.target.checked)}
                    className="h-4 w-4"
                  />
                  <Label htmlFor="callback_required">Callback Required</Label>
                </div>
              </div>
            </fieldset>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={createMutation.isPending || modifyMutation.isPending}>
              {editingId ? "Save Changes" : "Create Tranche"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Tranche Details</DialogTitle>
            <DialogDescription>Read-only view of the tranche configuration.</DialogDescription>
          </DialogHeader>
          {viewItem && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-3 gap-x-6 gap-y-2">
                <ViewField label="Tranche Code" value={viewItem.tranche_code} />
                <ViewField label="Tranche Name" value={viewItem.tranche_name} />
                <ViewField label="Product ID" value={viewItem.product_id} />
                <ViewField label="Currency" value={viewItem.currency} />
                <ViewField label="Status" value={viewItem.authorization_status} />
                <ViewField label="Option Type" value={viewItem.option_type} />
                <ViewField label="Option Style" value={viewItem.option_style} />
                <ViewField label="Underlying Reference" value={viewItem.underlying_reference} />
                <ViewField label="Reference Spot" value={viewItem.reference_spot} />
                <ViewField label="Data Source" value={viewItem.data_source} />
                <ViewField label="Strike Rate" value={viewItem.strike_rate} />
                <ViewField label="Offering Start" value={fmtDate(viewItem.offering_start)} />
                <ViewField label="Offering End" value={fmtDate(viewItem.offering_end)} />
                <ViewField label="Trade Date" value={fmtDate(viewItem.trade_date)} />
                <ViewField label="Value Date" value={fmtDate(viewItem.value_date)} />
                <ViewField label="Fixing Date" value={fmtDate(viewItem.fixing_date)} />
                <ViewField label="Maturity Date" value={fmtDate(viewItem.maturity_date)} />
                <ViewField label="Tenor" value={viewItem.tenor != null ? `${viewItem.tenor} days` : null} />
                <ViewField label="Indicative Rate" value={viewItem.indicative_rate} />
                <ViewField label="Min Interest Rate" value={viewItem.minimum_interest_rate} />
                <ViewField label="Bonus Payout Rate" value={viewItem.bonus_payout_rate} />
                <ViewField label="Participation Rate" value={viewItem.participation_rate} />
                <ViewField label="Max Interest Rate" value={viewItem.max_interest_rate} />
                <ViewField label="Tax Rate" value={viewItem.tax_rate} />
                <ViewField label="Quota Amount" value={fmtAmount(viewItem.quota_amount)} />
                <ViewField label="Min Investment" value={fmtAmount(viewItem.min_investment)} />
                <ViewField label="Max Investment" value={fmtAmount(viewItem.max_investment)} />
                <ViewField label="Min Collective Nominal" value={fmtAmount(viewItem.minimum_collective_nominal)} />
                <ViewField label="Balance Validation" value={viewItem.balance_validation_mode} />
                <ViewField label="Upper Limit" value={viewItem.upper_limit} />
                <ViewField label="Lower Limit" value={viewItem.lower_limit} />
                <ViewField label="Observation Start" value={fmtDate(viewItem.observation_period_start)} />
                <ViewField label="Observation End" value={fmtDate(viewItem.observation_period_end)} />
                <ViewField label="Calculating Agent" value={viewItem.calculating_agent} />
                <ViewField label="Eligible Account Types" value={viewItem.eligible_account_types} />
                <ViewField label="Risk Rating" value={viewItem.risk_rating} />
                <ViewField label="Suitability Mode" value={viewItem.suitability_check_mode} />
                <ViewField label="Sales Cert Required" value={viewItem.sales_cert_required ? "Yes" : "No"} />
                <ViewField label="Sales Cert Type" value={viewItem.sales_cert_type} />
                <ViewField label="Cutoff Time" value={viewItem.cutoff_time} />
                <ViewField label="Cutoff Timezone" value={viewItem.cutoff_timezone} />
                <ViewField label="Early Termination" value={viewItem.early_termination_allowed ? "Yes" : "No"} />
                <ViewField label="Callback Required" value={viewItem.callback_required ? "Yes" : "No"} />
                <ViewField label="Term Sheet Path" value={viewItem.term_sheet_file_path} />
              </div>

              {viewItem.required_documents && (
                <div>
                  <span className="font-medium text-muted-foreground">Required Documents:</span>
                  <pre className="mt-1 text-xs bg-muted p-2 rounded overflow-x-auto">{viewItem.required_documents}</pre>
                </div>
              )}

              {viewItem.rejection_reason && (
                <div className="border-l-4 border-red-400 pl-3">
                  <span className="font-medium text-red-600">Rejection Reason:</span>
                  <p className="text-sm">{viewItem.rejection_reason}</p>
                </div>
              )}

              {viewItem.deactivation_reason && (
                <div className="border-l-4 border-orange-400 pl-3">
                  <span className="font-medium text-orange-600">Deactivation Reason:</span>
                  <p className="text-sm">{viewItem.deactivation_reason}</p>
                </div>
              )}

              {/* Approval History */}
              {viewItem.approval_history && viewItem.approval_history.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-2">Approval History</h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Action</TableHead>
                        <TableHead>Performed By</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Reason</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {viewItem.approval_history.map((h, i) => (
                        <TableRow key={i}>
                          <TableCell>{h.action}</TableCell>
                          <TableCell>{h.performed_by}</TableCell>
                          <TableCell>{fmtDate(h.performed_at)}</TableCell>
                          <TableCell>{h.reason || "--"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Reject / Deactivate Reason Dialog */}
      <Dialog open={reasonDialogOpen} onOpenChange={setReasonDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{reasonAction === "reject" ? "Reject Tranche" : "Deactivate Tranche"}</DialogTitle>
            <DialogDescription>
              Please provide a reason (minimum 10 characters).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              value={reasonText}
              onChange={(e) => setReasonText(e.target.value)}
              placeholder={reasonAction === "reject" ? "Reason for rejection..." : "Reason for deactivation..."}
              rows={4}
            />
            {reasonText.length > 0 && reasonText.length < 10 && (
              <p className="text-xs text-red-500">Minimum 10 characters required ({reasonText.length}/10)</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReasonDialogOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={reasonText.length < 10 || rejectMutation.isPending || deactivateMutation.isPending}
              onClick={confirmReason}
            >
              {reasonAction === "reject" ? "Reject" : "Deactivate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------- View Field Helper ---------- */
function ViewField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <span className="text-muted-foreground text-xs">{label}</span>
      <p className="font-medium">{value || "--"}</p>
    </div>
  );
}
