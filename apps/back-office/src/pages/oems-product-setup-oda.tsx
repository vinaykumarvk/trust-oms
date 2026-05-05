/**
 * FX ODA Product Setup -- OEMS Module
 *
 * Full CRUD + approval workflow for FX ODA product configurations.
 * Supports create, modify, submit, approve, reject, deactivate lifecycle.
 */
import { useState } from "react";
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
  Plus, Search, Eye, Pencil, Send, ShieldCheck, XCircle, Ban,
} from "lucide-react";

/* ---------- Constants ---------- */
const API = "/api/v1/oems";

const CURRENCY_PAIRS = [
  "USD/IDR", "EUR/IDR", "SGD/IDR", "AUD/IDR", "JPY/IDR", "GBP/IDR", "CNY/IDR", "HKD/IDR",
] as const;

const STATUSES = ["ALL", "DRAFT", "PENDING_APPROVAL", "ACTIVE", "REJECTED", "INACTIVE"] as const;

const TRANSACTION_TYPES = ["BUY", "SELL"] as const;
const EFFECTIVE_DATE_TYPES = ["INTRADAY", "OVERNIGHT", "GTD"] as const;

type ProductStatus = "DRAFT" | "PENDING_APPROVAL" | "ACTIVE" | "REJECTED" | "INACTIVE";

/* ---------- Types ---------- */
interface OdaProduct {
  id: number;
  product_code: string;
  product_name: string;
  product_family: string;
  currency_pair_from: string;
  currency_pair_to: string;
  reference_rate_source: string;
  oda_transaction_types_allowed: string[];
  effective_date_types_allowed: string[];
  min_placement_amount: number;
  min_collective_order_amount: number;
  spread_tolerance_percent: number;
  cutoff_intraday: string;
  cutoff_overnight: string;
  cutoff_gtd: string;
  cutoff_timezone: string;
  eligible_account_types: string;
  eligible_account_codes: string;
  sales_cert_required: boolean;
  sales_cert_type: string;
  sales_cert_expiry_mode: string;
  trade_ideas_enabled: boolean;
  trade_ideas_rate: string;
  trade_ideas_message: string;
  status: ProductStatus;
  submitted_by: string | null;
  submitted_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejected_reason: string | null;
  deactivated_reason: string | null;
  created_at: string;
  updated_at: string;
}

interface ProductListResponse {
  products: OdaProduct[];
  total: number;
  page: number;
  pageSize: number;
}

/* ---------- Formatters ---------- */
const fmtMoney = (n: number | string | null | undefined) => {
  if (n == null) return "--";
  const num = typeof n === "string" ? parseFloat(n) : n;
  if (isNaN(num)) return "--";
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(num);
};

const fmtDate = (d: string | null | undefined) => {
  if (!d) return "--";
  try {
    return new Date(d).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return d;
  }
};

/* ---------- Status Badge ---------- */
function StatusBadge({ status }: { status: ProductStatus }) {
  const variants: Record<ProductStatus, "default" | "secondary" | "outline" | "destructive"> = {
    ACTIVE: "default",
    INACTIVE: "secondary",
    PENDING_APPROVAL: "outline",
    REJECTED: "destructive",
    DRAFT: "secondary",
  };
  return <Badge variant={variants[status] || "secondary"}>{status.replace("_", " ")}</Badge>;
}

/* ---------- Form Initial State ---------- */
function emptyForm() {
  return {
    product_name: "",
    product_family: "ODA",
    currency_pair_from: "",
    currency_pair_to: "",
    reference_rate_source: "",
    oda_transaction_types_allowed: [] as string[],
    effective_date_types_allowed: [] as string[],
    min_placement_amount: "",
    min_collective_order_amount: "",
    spread_tolerance_percent: "",
    cutoff_intraday: "",
    cutoff_overnight: "",
    cutoff_gtd: "",
    cutoff_timezone: "Asia/Jakarta",
    eligible_account_types: "",
    eligible_account_codes: "",
    sales_cert_required: false,
    sales_cert_type: "",
    sales_cert_expiry_mode: "",
    trade_ideas_enabled: false,
    trade_ideas_rate: "",
    trade_ideas_message: "",
  };
}

type FormData = ReturnType<typeof emptyForm>;

/* ---------- Create/Edit Form Sections ---------- */
function IdentitySection({ form, setForm }: { form: FormData; setForm: (f: FormData) => void }) {
  return (
    <div className="space-y-3">
      <h4 className="font-semibold text-sm">Identity</h4>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="product_name">Product Name</Label>
          <Input id="product_name" value={form.product_name}
            onChange={(e) => setForm({ ...form, product_name: e.target.value })} />
        </div>
        <div>
          <Label>Product Family</Label>
          <Input value="ODA" disabled />
        </div>
      </div>
    </div>
  );
}

function CurrencyRateSection({ form, setForm }: { form: FormData; setForm: (f: FormData) => void }) {
  return (
    <div className="space-y-3">
      <h4 className="font-semibold text-sm">Currency & Rate</h4>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label htmlFor="currency_pair_from">Currency From</Label>
          <Input id="currency_pair_from" value={form.currency_pair_from}
            onChange={(e) => setForm({ ...form, currency_pair_from: e.target.value })}
            placeholder="e.g. USD" />
        </div>
        <div>
          <Label htmlFor="currency_pair_to">Currency To</Label>
          <Input id="currency_pair_to" value={form.currency_pair_to}
            onChange={(e) => setForm({ ...form, currency_pair_to: e.target.value })}
            placeholder="e.g. IDR" />
        </div>
        <div>
          <Label htmlFor="reference_rate_source">Reference Rate Source</Label>
          <Input id="reference_rate_source" value={form.reference_rate_source}
            onChange={(e) => setForm({ ...form, reference_rate_source: e.target.value })}
            placeholder="e.g. JISDOR" />
        </div>
      </div>
    </div>
  );
}

function OrderRulesSection({ form, setForm }: { form: FormData; setForm: (f: FormData) => void }) {
  const toggleTxnType = (t: string) => {
    const arr = form.oda_transaction_types_allowed.includes(t)
      ? form.oda_transaction_types_allowed.filter((x) => x !== t)
      : [...form.oda_transaction_types_allowed, t];
    setForm({ ...form, oda_transaction_types_allowed: arr });
  };
  const toggleEffDate = (t: string) => {
    const arr = form.effective_date_types_allowed.includes(t)
      ? form.effective_date_types_allowed.filter((x) => x !== t)
      : [...form.effective_date_types_allowed, t];
    setForm({ ...form, effective_date_types_allowed: arr });
  };

  return (
    <div className="space-y-3">
      <h4 className="font-semibold text-sm">Order Rules</h4>
      <div className="space-y-2">
        <Label>Transaction Types Allowed</Label>
        <div className="flex gap-4">
          {TRANSACTION_TYPES.map((t) => (
            <label key={t} className="flex items-center gap-1 text-sm">
              <input type="checkbox" checked={form.oda_transaction_types_allowed.includes(t)}
                onChange={() => toggleTxnType(t)} />
              {t}
            </label>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <Label>Effective Date Types Allowed</Label>
        <div className="flex gap-4">
          {EFFECTIVE_DATE_TYPES.map((t) => (
            <label key={t} className="flex items-center gap-1 text-sm">
              <input type="checkbox" checked={form.effective_date_types_allowed.includes(t)}
                onChange={() => toggleEffDate(t)} />
              {t}
            </label>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label htmlFor="min_placement_amount">Min Placement Amount</Label>
          <Input id="min_placement_amount" type="number" value={form.min_placement_amount}
            onChange={(e) => setForm({ ...form, min_placement_amount: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="min_collective_order_amount">Min Collective Order Amount</Label>
          <Input id="min_collective_order_amount" type="number" value={form.min_collective_order_amount}
            onChange={(e) => setForm({ ...form, min_collective_order_amount: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="spread_tolerance_percent">Spread Tolerance (%)</Label>
          <Input id="spread_tolerance_percent" type="number" step="0.01" value={form.spread_tolerance_percent}
            onChange={(e) => setForm({ ...form, spread_tolerance_percent: e.target.value })} />
        </div>
      </div>
    </div>
  );
}

function CutoffSection({ form, setForm }: { form: FormData; setForm: (f: FormData) => void }) {
  return (
    <div className="space-y-3">
      <h4 className="font-semibold text-sm">Cut-Off Times</h4>
      <div className="grid grid-cols-4 gap-3">
        <div>
          <Label htmlFor="cutoff_intraday">Intraday COT</Label>
          <Input id="cutoff_intraday" type="time" value={form.cutoff_intraday}
            onChange={(e) => setForm({ ...form, cutoff_intraday: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="cutoff_overnight">Overnight COT</Label>
          <Input id="cutoff_overnight" type="time" value={form.cutoff_overnight}
            onChange={(e) => setForm({ ...form, cutoff_overnight: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="cutoff_gtd">GTD COT</Label>
          <Input id="cutoff_gtd" type="time" value={form.cutoff_gtd}
            onChange={(e) => setForm({ ...form, cutoff_gtd: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="cutoff_timezone">Timezone</Label>
          <Input id="cutoff_timezone" value={form.cutoff_timezone}
            onChange={(e) => setForm({ ...form, cutoff_timezone: e.target.value })} />
        </div>
      </div>
    </div>
  );
}

function EligibilitySection({ form, setForm }: { form: FormData; setForm: (f: FormData) => void }) {
  return (
    <div className="space-y-3">
      <h4 className="font-semibold text-sm">Eligibility</h4>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="eligible_account_types">Eligible Account Types (comma-separated)</Label>
          <Input id="eligible_account_types" value={form.eligible_account_types}
            onChange={(e) => setForm({ ...form, eligible_account_types: e.target.value })}
            placeholder="SAVINGS, CURRENT, TIME_DEPOSIT" />
        </div>
        <div>
          <Label htmlFor="eligible_account_codes">Eligible Account Codes (comma-separated)</Label>
          <Input id="eligible_account_codes" value={form.eligible_account_codes}
            onChange={(e) => setForm({ ...form, eligible_account_codes: e.target.value })}
            placeholder="ACC001, ACC002" />
        </div>
      </div>
    </div>
  );
}

function SalesCertSection({ form, setForm }: { form: FormData; setForm: (f: FormData) => void }) {
  return (
    <div className="space-y-3">
      <h4 className="font-semibold text-sm">Sales Cert & Trade Ideas</h4>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.sales_cert_required}
              onChange={(e) => setForm({ ...form, sales_cert_required: e.target.checked })} />
            Sales Certification Required
          </label>
          <div>
            <Label htmlFor="sales_cert_type">Cert Type</Label>
            <Input id="sales_cert_type" value={form.sales_cert_type}
              onChange={(e) => setForm({ ...form, sales_cert_type: e.target.value })}
              placeholder="e.g. WAPERD" />
          </div>
          <div>
            <Label htmlFor="sales_cert_expiry_mode">Cert Expiry Mode</Label>
            <Input id="sales_cert_expiry_mode" value={form.sales_cert_expiry_mode}
              onChange={(e) => setForm({ ...form, sales_cert_expiry_mode: e.target.value })}
              placeholder="e.g. ANNUAL, BIENNIAL" />
          </div>
        </div>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.trade_ideas_enabled}
              onChange={(e) => setForm({ ...form, trade_ideas_enabled: e.target.checked })} />
            Trade Ideas Enabled
          </label>
          <div>
            <Label htmlFor="trade_ideas_rate">Trade Ideas Rate</Label>
            <Input id="trade_ideas_rate" value={form.trade_ideas_rate}
              onChange={(e) => setForm({ ...form, trade_ideas_rate: e.target.value })}
              placeholder="e.g. 14500.50" />
          </div>
          <div>
            <Label htmlFor="trade_ideas_message">Trade Ideas Message</Label>
            <Input id="trade_ideas_message" value={form.trade_ideas_message}
              onChange={(e) => setForm({ ...form, trade_ideas_message: e.target.value })}
              placeholder="Alert message for RM" />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- View Dialog Content ---------- */
function ViewProductContent({ product }: { product: OdaProduct }) {
  const Field = ({ label, value }: { label: string; value: string | number | boolean | null | undefined }) => (
    <div className="space-y-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <p className="text-sm font-medium">{value == null ? "--" : String(value)}</p>
    </div>
  );

  return (
    <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
      <div className="grid grid-cols-3 gap-3">
        <Field label="Product Code" value={product.product_code} />
        <Field label="Product Name" value={product.product_name} />
        <Field label="Product Family" value={product.product_family} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Currency From" value={product.currency_pair_from} />
        <Field label="Currency To" value={product.currency_pair_to} />
        <Field label="Reference Rate Source" value={product.reference_rate_source} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Transaction Types" value={(product.oda_transaction_types_allowed || []).join(", ")} />
        <Field label="Effective Date Types" value={(product.effective_date_types_allowed || []).join(", ")} />
        <Field label="Spread Tolerance %" value={product.spread_tolerance_percent} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Min Placement" value={fmtMoney(product.min_placement_amount)} />
        <Field label="Min Collective" value={fmtMoney(product.min_collective_order_amount)} />
        <Field label="Status" value={product.status} />
      </div>
      <div className="grid grid-cols-4 gap-3">
        <Field label="COT Intraday" value={product.cutoff_intraday} />
        <Field label="COT Overnight" value={product.cutoff_overnight} />
        <Field label="COT GTD" value={product.cutoff_gtd} />
        <Field label="Timezone" value={product.cutoff_timezone} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Eligible Account Types" value={product.eligible_account_types} />
        <Field label="Eligible Account Codes" value={product.eligible_account_codes} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Sales Cert Required" value={product.sales_cert_required ? "Yes" : "No"} />
        <Field label="Sales Cert Type" value={product.sales_cert_type} />
        <Field label="Sales Cert Expiry Mode" value={product.sales_cert_expiry_mode} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Trade Ideas Enabled" value={product.trade_ideas_enabled ? "Yes" : "No"} />
        <Field label="Trade Ideas Rate" value={product.trade_ideas_rate} />
        <Field label="Trade Ideas Message" value={product.trade_ideas_message} />
      </div>
      <hr className="my-2" />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Submitted By" value={product.submitted_by} />
        <Field label="Submitted At" value={fmtDate(product.submitted_at)} />
        <Field label="Approved By" value={product.approved_by} />
        <Field label="Approved At" value={fmtDate(product.approved_at)} />
      </div>
      {product.rejected_reason && (
        <div className="p-2 bg-red-50 dark:bg-red-900/20 rounded text-sm">
          <span className="font-medium text-red-700 dark:text-red-300">Rejection Reason:</span>{" "}
          {product.rejected_reason}
        </div>
      )}
      {product.deactivated_reason && (
        <div className="p-2 bg-orange-50 dark:bg-orange-900/20 rounded text-sm">
          <span className="font-medium text-orange-700 dark:text-orange-300">Deactivation Reason:</span>{" "}
          {product.deactivated_reason}
        </div>
      )}
    </div>
  );
}

/* ========== Main Component ========== */
export default function OemsProductSetupOda() {
  const qc = useQueryClient();

  /* -- Filter state -- */
  const [search, setSearch] = useState("");
  const [currencyPairFilter, setCurrencyPairFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  /* -- Dialog states -- */
  const [createOpen, setCreateOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<OdaProduct | null>(null);
  const [viewProduct, setViewProduct] = useState<OdaProduct | null>(null);
  const [reasonDialogOpen, setReasonDialogOpen] = useState(false);
  const [reasonAction, setReasonAction] = useState<"reject" | "deactivate">("reject");
  const [reasonTargetId, setReasonTargetId] = useState<number | null>(null);
  const [reasonText, setReasonText] = useState("");
  const [form, setForm] = useState<FormData>(emptyForm());

  /* -- Query -- */
  const queryParams = new URLSearchParams({
    search,
    page: String(page),
    pageSize: String(pageSize),
    ...(currencyPairFilter !== "ALL" && { currencyPair: currencyPairFilter }),
    ...(statusFilter !== "ALL" && { status: statusFilter }),
    ...(dateFrom && { dateFrom }),
    ...(dateTo && { dateTo }),
  });

  const { data, isLoading } = useQuery<ProductListResponse>({
    queryKey: ["oems-products-enhanced", search, currencyPairFilter, statusFilter, dateFrom, dateTo, page],
    queryFn: async () => {
      const res = await apiRequest("GET", `${API}/products/enhanced?${queryParams.toString()}`);
      return res as ProductListResponse;
    },
  });

  const products = data?.products || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / pageSize);

  /* -- Mutations -- */
  const createMutation = useMutation({
    mutationFn: async (payload: FormData) => {
      return apiRequest("POST", `${API}/products/enhanced`, {
        ...payload,
        min_placement_amount: parseFloat(payload.min_placement_amount) || 0,
        min_collective_order_amount: parseFloat(payload.min_collective_order_amount) || 0,
        spread_tolerance_percent: parseFloat(payload.spread_tolerance_percent) || 0,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["oems-products-enhanced"] });
      setCreateOpen(false);
      setForm(emptyForm());
    },
  });

  const modifyMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: FormData }) => {
      return apiRequest("PATCH", `${API}/products/${id}`, {
        ...payload,
        min_placement_amount: parseFloat(payload.min_placement_amount) || 0,
        min_collective_order_amount: parseFloat(payload.min_collective_order_amount) || 0,
        spread_tolerance_percent: parseFloat(payload.spread_tolerance_percent) || 0,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["oems-products-enhanced"] });
      setEditingProduct(null);
      setForm(emptyForm());
    },
  });

  const submitMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("POST", `${API}/products/${id}/submit`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["oems-products-enhanced"] }),
  });

  const approveMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("POST", `${API}/products/${id}/approve`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["oems-products-enhanced"] }),
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: number; reason: string }) =>
      apiRequest("POST", `${API}/products/${id}/reject`, { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["oems-products-enhanced"] });
      setReasonDialogOpen(false);
      setReasonText("");
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: number; reason: string }) =>
      apiRequest("POST", `${API}/products/${id}/deactivate`, { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["oems-products-enhanced"] });
      setReasonDialogOpen(false);
      setReasonText("");
    },
  });

  /* -- Helpers -- */
  const openCreate = () => {
    setForm(emptyForm());
    setCreateOpen(true);
  };

  const openEdit = (p: OdaProduct) => {
    setForm({
      product_name: p.product_name,
      product_family: "ODA",
      currency_pair_from: p.currency_pair_from,
      currency_pair_to: p.currency_pair_to,
      reference_rate_source: p.reference_rate_source || "",
      oda_transaction_types_allowed: p.oda_transaction_types_allowed || [],
      effective_date_types_allowed: p.effective_date_types_allowed || [],
      min_placement_amount: String(p.min_placement_amount || ""),
      min_collective_order_amount: String(p.min_collective_order_amount || ""),
      spread_tolerance_percent: String(p.spread_tolerance_percent || ""),
      cutoff_intraday: p.cutoff_intraday || "",
      cutoff_overnight: p.cutoff_overnight || "",
      cutoff_gtd: p.cutoff_gtd || "",
      cutoff_timezone: p.cutoff_timezone || "Asia/Jakarta",
      eligible_account_types: p.eligible_account_types || "",
      eligible_account_codes: p.eligible_account_codes || "",
      sales_cert_required: p.sales_cert_required || false,
      sales_cert_type: p.sales_cert_type || "",
      sales_cert_expiry_mode: p.sales_cert_expiry_mode || "",
      trade_ideas_enabled: p.trade_ideas_enabled || false,
      trade_ideas_rate: p.trade_ideas_rate || "",
      trade_ideas_message: p.trade_ideas_message || "",
    });
    setEditingProduct(p);
  };

  const openReasonDialog = (action: "reject" | "deactivate", id: number) => {
    setReasonAction(action);
    setReasonTargetId(id);
    setReasonText("");
    setReasonDialogOpen(true);
  };

  const handleReasonSubmit = () => {
    if (reasonText.length < 10 || !reasonTargetId) return;
    if (reasonAction === "reject") {
      rejectMutation.mutate({ id: reasonTargetId, reason: reasonText });
    } else {
      deactivateMutation.mutate({ id: reasonTargetId, reason: reasonText });
    }
  };

  const handleFormSubmit = () => {
    if (editingProduct) {
      modifyMutation.mutate({ id: editingProduct.id, payload: form });
    } else {
      createMutation.mutate(form);
    }
  };

  /* -- Render actions for a product row -- */
  const renderActions = (p: OdaProduct) => {
    const actions: JSX.Element[] = [];

    actions.push(
      <Button key="view" variant="ghost" size="sm" onClick={() => setViewProduct(p)} title="View">
        <Eye className="h-4 w-4" />
      </Button>
    );

    if (p.status === "DRAFT" || p.status === "REJECTED") {
      actions.push(
        <Button key="edit" variant="ghost" size="sm" onClick={() => openEdit(p)} title="Modify">
          <Pencil className="h-4 w-4" />
        </Button>
      );
      actions.push(
        <Button key="submit" variant="ghost" size="sm" onClick={() => submitMutation.mutate(p.id)} title="Submit">
          <Send className="h-4 w-4" />
        </Button>
      );
    }

    if (p.status === "PENDING_APPROVAL") {
      actions.push(
        <Button key="approve" variant="ghost" size="sm" onClick={() => approveMutation.mutate(p.id)} title="Approve">
          <ShieldCheck className="h-4 w-4 text-green-600" />
        </Button>
      );
      actions.push(
        <Button key="reject" variant="ghost" size="sm" onClick={() => openReasonDialog("reject", p.id)} title="Reject">
          <XCircle className="h-4 w-4 text-red-600" />
        </Button>
      );
    }

    if (p.status === "ACTIVE") {
      actions.push(
        <Button key="deactivate" variant="ghost" size="sm" onClick={() => openReasonDialog("deactivate", p.id)} title="Deactivate">
          <Ban className="h-4 w-4 text-orange-600" />
        </Button>
      );
    }

    return <div className="flex items-center gap-0.5">{actions}</div>;
  };

  /* ========== RENDER ========== */
  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">FX ODA Product Setup</h1>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" /> Create
        </Button>
      </div>

      {/* Filter bar */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[200px]">
              <Label>Search</Label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-8" placeholder="Product code or name..."
                  value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
              </div>
            </div>
            <div className="w-[180px]">
              <Label>Currency Pair</Label>
              <Select value={currencyPairFilter} onValueChange={(v) => { setCurrencyPairFilter(v); setPage(1); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Pairs</SelectItem>
                  {CURRENCY_PAIRS.map((cp) => (
                    <SelectItem key={cp} value={cp}>{cp}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-[180px]">
              <Label>Status</Label>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{s === "ALL" ? "All Statuses" : s.replace("_", " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-[150px]">
              <Label>From Date</Label>
              <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} />
            </div>
            <div className="w-[150px]">
              <Label>To Date</Label>
              <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Data table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Currency Pair</TableHead>
                <TableHead className="text-right">Min Placement</TableHead>
                <TableHead className="text-right">Min Collective</TableHead>
                <TableHead>COT Intraday</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Loading...</TableCell>
                </TableRow>
              ) : products.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No products found</TableCell>
                </TableRow>
              ) : (
                products.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-sm">{p.product_code}</TableCell>
                    <TableCell>{p.product_name}</TableCell>
                    <TableCell>{p.currency_pair_from}/{p.currency_pair_to}</TableCell>
                    <TableCell className="text-right">{fmtMoney(p.min_placement_amount)}</TableCell>
                    <TableCell className="text-right">{fmtMoney(p.min_collective_order_amount)}</TableCell>
                    <TableCell>{p.cutoff_intraday || "--"}</TableCell>
                    <TableCell><StatusBadge status={p.status} /></TableCell>
                    <TableCell>{fmtDate(p.created_at)}</TableCell>
                    <TableCell>{renderActions(p)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <span className="text-sm text-muted-foreground">
                Page {page} of {totalPages} ({total} total)
              </span>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={createOpen || !!editingProduct} onOpenChange={(open) => {
        if (!open) { setCreateOpen(false); setEditingProduct(null); setForm(emptyForm()); }
      }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingProduct ? "Modify ODA Product" : "Create ODA Product"}</DialogTitle>
            <DialogDescription>
              {editingProduct ? "Update the product configuration below." : "Fill in the product configuration below."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-2">
            <IdentitySection form={form} setForm={setForm} />
            <CurrencyRateSection form={form} setForm={setForm} />
            <OrderRulesSection form={form} setForm={setForm} />
            <CutoffSection form={form} setForm={setForm} />
            <EligibilitySection form={form} setForm={setForm} />
            <SalesCertSection form={form} setForm={setForm} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreateOpen(false); setEditingProduct(null); setForm(emptyForm()); }}>
              Cancel
            </Button>
            <Button onClick={handleFormSubmit}
              disabled={createMutation.isPending || modifyMutation.isPending}>
              {editingProduct ? "Save Changes" : "Create Product"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={!!viewProduct} onOpenChange={(open) => { if (!open) setViewProduct(null); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Product Details — {viewProduct?.product_code}</DialogTitle>
            <DialogDescription>Read-only view of the ODA product configuration.</DialogDescription>
          </DialogHeader>
          {viewProduct && <ViewProductContent product={viewProduct} />}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewProduct(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject / Deactivate Reason Dialog */}
      <Dialog open={reasonDialogOpen} onOpenChange={(open) => { if (!open) { setReasonDialogOpen(false); setReasonText(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{reasonAction === "reject" ? "Reject Product" : "Deactivate Product"}</DialogTitle>
            <DialogDescription>
              Please provide a reason (minimum 10 characters).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reason">Reason</Label>
            <Textarea id="reason" value={reasonText} onChange={(e) => setReasonText(e.target.value)}
              placeholder={reasonAction === "reject" ? "Reason for rejection..." : "Reason for deactivation..."}
              rows={4} />
            {reasonText.length > 0 && reasonText.length < 10 && (
              <p className="text-xs text-red-500">Minimum 10 characters required ({reasonText.length}/10)</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setReasonDialogOpen(false); setReasonText(""); }}>
              Cancel
            </Button>
            <Button variant={reasonAction === "reject" ? "destructive" : "default"}
              disabled={reasonText.length < 10 || rejectMutation.isPending || deactivateMutation.isPending}
              onClick={handleReasonSubmit}>
              {reasonAction === "reject" ? "Reject" : "Deactivate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
