import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@ui/lib/queryClient";
import { Badge } from "@ui/components/ui/badge";
import { Button } from "@ui/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/ui/card";
import { Input } from "@ui/components/ui/input";
import { Label } from "@ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ui/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ui/components/ui/table";
import { Separator } from "@ui/components/ui/separator";
import { Textarea } from "@ui/components/ui/textarea";
import { Combobox } from "@ui/components/ui/combobox";
import { useToast } from "@ui/components/ui/toast";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle,
  ClipboardList,
  DollarSign,
  FileText,
  Loader2,
  Package,
  Send,
  ShieldCheck,
  Upload,
  User,
  XCircle,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────

type ProductFamily = "ODA" | "MLD" | "MUTUAL_FUND" | "BOND" | "FX_TODAY" | "WEALTH_LENDING";
type OemsChannel =
  | "OEMS_DIRECT" | "CRM_MICROSITE" | "DBANK_PRO_MICROSITE" | "BRANCH"
  | "CRM" | "RM_MOBILE" | "SECURE_MICROSITE" | "BACK_OFFICE" | "TREASURY";

interface Product {
  id: number; product_code: string; product_name: string;
  product_family: ProductFamily; currency: string; is_active: boolean;
  risk_score: number | null; product_score: number | null;
  currency_pair_from: string | null; currency_pair_to: string | null;
}
interface ClientSearchResult { client_id: string; legal_name: string | null; risk_profile: string | null; }
interface ClientPortfolio { portfolio_id: string; type: string | null; base_currency: string | null; aum: string | null; portfolio_status: string | null; }
interface MldTranche {
  id: number; tranche_code: string; tranche_name: string; currency: string;
  lifecycle: string; offering_start: string; offering_end: string;
}
interface ChargeItem {
  charge_type: string; charge_label: string; rate_type: string;
  rate_value: string | null; base_amount: string | null;
  charge_amount: string; currency: string; is_deducted: boolean;
}
interface ChargeResult {
  orderId: string; grossAmount: number; totalCharges: number; totalTax: number;
  netAmount: number; settlementAmount: number; indicativeSettlementDate: string;
  currency: string; charges: ChargeItem[];
}
interface ValidationFinding {
  id?: number; rule_code: string; severity: string; result: string;
  message: string; source?: string; ruleCode?: string;
}
interface ValidateResult {
  orderId: string; hasBlocking: boolean; hasExternalPending: boolean;
  warningCodesRequiringAcknowledgement: string[];
  findings: ValidationFinding[];
}
interface DocumentChecklistItem {
  id: number; order_id: string; document_type: string; requirement_level: string;
  registration_status: string; document_id?: number;
}

// ── Constants ──────────────────────────────────────────────────────────────

const productFamilies: ProductFamily[] = ["ODA", "MLD", "MUTUAL_FUND", "BOND", "FX_TODAY", "WEALTH_LENDING"];
const oemsChannels: OemsChannel[] = ["OEMS_DIRECT", "CRM_MICROSITE", "DBANK_PRO_MICROSITE", "BRANCH", "CRM", "RM_MOBILE", "SECURE_MICROSITE", "BACK_OFFICE", "TREASURY"];
const TRANSACTION_TYPES_BY_FAMILY: Record<ProductFamily, string[]> = {
  ODA: ["ODA_INTRADAY", "ODA_OVERNIGHT", "ODA_GTD", "ODA_SPECIAL"],
  MLD: ["MLD_SUBSCRIPTION"],
  MUTUAL_FUND: ["SUBSCRIPTION", "REDEMPTION", "SWITCHING", "DRIP"],
  BOND: ["BUY", "SELL", "SWITCHING", "AUCTION", "BUYBACK"],
  FX_TODAY: ["FX_TODAY_SPECIAL_RATE"],
  WEALTH_LENDING: ["DRAWDOWN", "REPAYMENT", "LIMIT_CHANGE"],
};
const SALES_ASSISTED_CHANNELS: OemsChannel[] = ["BRANCH", "CRM", "RM_MOBILE", "CRM_MICROSITE"];
const RISK_CATEGORIES: { code: number; label: string }[] = [
  { code: 1, label: "Conservative" }, { code: 2, label: "Moderately Conservative" },
  { code: 3, label: "Moderate" }, { code: 4, label: "Moderately Aggressive" },
  { code: 5, label: "Aggressive" }, { code: 6, label: "Very Aggressive" },
];

const STEPS = [
  { key: "customer", label: "Customer & Account", icon: User },
  { key: "product", label: "Product & Order", icon: Package },
  { key: "charges", label: "Charges & Settlement", icon: DollarSign },
  { key: "validation", label: "Validation", icon: ShieldCheck },
  { key: "documents", label: "Documents", icon: FileText },
  { key: "review", label: "Review & Submit", icon: ClipboardList },
];

// ── Helpers ────────────────────────────────────────────────────────────────

function riskLabel(score: number | null | undefined): string {
  if (score == null) return "";
  const cat = RISK_CATEGORIES.find((c) => c.code === score);
  return cat ? `${score} - ${cat.label}` : String(score);
}

function formatMoney(value: string | number | null | undefined, currency = "PHP") {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return "-";
  return `${currency} ${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function StatusBadge({ value }: { value: string | null | undefined }) {
  const status = value ?? "UNKNOWN";
  const tone: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    PASS: "secondary", FAIL: "destructive", WARN: "outline", BLOCKING: "destructive",
    WARNING: "outline", INFO: "secondary", REQUIRED: "destructive", OPTIONAL: "outline",
    UPLOADED: "secondary", VERIFIED: "secondary", SIGNED: "secondary", MISSING: "destructive",
    PENDING_UPLOAD: "outline", REJECTED: "destructive", EXPIRED: "destructive",
  };
  return <Badge variant={tone[status] ?? "outline"}>{status.replace(/_/g, " ")}</Badge>;
}

// ── Component ──────────────────────────────────────────────────────────────

export function OemsOrderWizard({ onDraftCreated, onOrderSubmitted }: {
  onDraftCreated?: () => void;
  onOrderSubmitted?: () => void;
}) {
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [clientSearch, setClientSearch] = useState("");
  const [orderNotes, setOrderNotes] = useState("");

  const [orderForm, setOrderForm] = useState({
    productFamily: "MUTUAL_FUND" as ProductFamily,
    transactionType: "",
    customerId: "",
    customerLabel: "",
    portfolioId: "",
    productId: "" as string,
    channel: "OEMS_DIRECT" as OemsChannel,
    assistedByUserId: "",
    branchCode: "",
    currency: "PHP",
    amount: "",
    customerRiskScore: null as number | null,
    customerRiskCategory: "",
    productScore: null as number | null,
    tenorDays: "",
    rate: "",
    currencyPair: "",
    direction: "BUY",
    effectiveType: "TODAY",
    valueDate: new Date().toISOString().slice(0, 10),
    trancheId: "",
    transactionVariant: "",
    quantity: "",
    dealtCurrency: "",
    counterCurrency: "",
    specialRate: "",
    facilityId: "",
    limitAmount: "",
    tenor: "",
    lendingRate: "",
  });

  // ── Charge, Validation, Document states ──────────────────────────────
  const [chargeResult, setChargeResult] = useState<ChargeResult | null>(null);
  const [validationResult, setValidationResult] = useState<ValidateResult | null>(null);
  const [docChecklist, setDocChecklist] = useState<DocumentChecklistItem[]>([]);

  // ── Queries ──────────────────────────────────────────────────────────
  const clientSearchQuery = useQuery<ClientSearchResult[]>({
    queryKey: ["oems-client-search", clientSearch],
    queryFn: () => apiRequest("GET", `/api/v1/oems/clients?search=${encodeURIComponent(clientSearch)}&limit=20`),
    enabled: clientSearch.length >= 2,
  });

  const clientPortfoliosQuery = useQuery<ClientPortfolio[]>({
    queryKey: ["oems-client-portfolios", orderForm.customerId],
    queryFn: () => apiRequest("GET", `/api/v1/oems/clients/${encodeURIComponent(orderForm.customerId)}/portfolios`),
    enabled: !!orderForm.customerId,
  });

  const familyProductsQuery = useQuery<Product[]>({
    queryKey: ["oems-family-products", orderForm.productFamily],
    queryFn: () => apiRequest("GET", `/api/v1/oems/products?productFamily=${orderForm.productFamily}&activeOnly=true`),
    enabled: !!orderForm.productFamily,
  });

  const mldTranchesQuery = useQuery<MldTranche[]>({
    queryKey: ["oems-mld"],
    queryFn: () => apiRequest("GET", "/api/v1/oems/mld/tranches"),
    enabled: orderForm.productFamily === "MLD",
  });

  const clientOptions = useMemo(() =>
    (clientSearchQuery.data ?? []).map((c) => ({
      value: c.client_id,
      label: `${c.client_id} — ${c.legal_name ?? ""}`,
      sublabel: c.risk_profile ?? undefined,
    })),
    [clientSearchQuery.data],
  );

  const familyProducts = useMemo(() => familyProductsQuery.data ?? [], [familyProductsQuery.data]);
  const mldTranches = useMemo(() => mldTranchesQuery.data ?? [], [mldTranchesQuery.data]);

  // Auto-select portfolio when only one available
  useEffect(() => {
    const portfolios = clientPortfoliosQuery.data ?? [];
    if (portfolios.length === 1) {
      setOrderForm((f) => ({ ...f, portfolioId: portfolios[0].portfolio_id, currency: portfolios[0].base_currency ?? f.currency }));
    }
  }, [clientPortfoliosQuery.data]);

  // Reset product-specific fields on family change
  const resetFamilyFields = useCallback(() => {
    setOrderForm((f) => ({
      ...f,
      transactionType: TRANSACTION_TYPES_BY_FAMILY[f.productFamily]?.[0] ?? "",
      productId: "", productScore: null, tenorDays: "", rate: "", currencyPair: "",
      direction: "BUY", effectiveType: "TODAY", valueDate: new Date().toISOString().slice(0, 10),
      trancheId: "", transactionVariant: "", quantity: "",
      dealtCurrency: "", counterCurrency: "", specialRate: "",
      facilityId: "", limitAmount: "", tenor: "", lendingRate: "",
    }));
  }, []);

  const handleProductSelect = useCallback((productId: string) => {
    const product = familyProducts.find((p) => String(p.id) === productId);
    setOrderForm((f) => ({
      ...f, productId,
      productScore: product?.product_score ?? null,
      currency: product?.currency ?? f.currency,
      currencyPair: product?.currency_pair_from && product?.currency_pair_to
        ? `${product.currency_pair_from}/${product.currency_pair_to}` : f.currencyPair,
      dealtCurrency: product?.currency_pair_from ?? f.dealtCurrency,
      counterCurrency: product?.currency_pair_to ?? f.counterCurrency,
    }));
  }, [familyProducts]);

  const handleCustomerSelect = useCallback((clientId: string) => {
    const client = (clientSearchQuery.data ?? []).find((c) => c.client_id === clientId);
    const riskMap: Record<string, number> = { CONSERVATIVE: 1, MODERATE: 3, BALANCED: 3, GROWTH: 4, AGGRESSIVE: 5 };
    const score = client?.risk_profile ? (riskMap[client.risk_profile] ?? null) : null;
    setOrderForm((f) => ({
      ...f, customerId: clientId,
      customerLabel: client ? `${client.client_id} — ${client.legal_name ?? ""}` : "",
      portfolioId: "", customerRiskScore: score, customerRiskCategory: client?.risk_profile ?? "",
    }));
  }, [clientSearchQuery.data]);

  // ── Client-side validation ───────────────────────────────────────────
  function validateOrderForm(): string | null {
    if (!orderForm.customerId) return "Customer is required";
    if (!orderForm.transactionType) return "Transaction type is required";
    const amt = Number(orderForm.amount);
    if (!amt || amt <= 0) return "Amount must be greater than 0";
    const fam = orderForm.productFamily;
    if (fam === "ODA") {
      if (!orderForm.tenorDays) return "Tenor days is required for ODA";
      if (!orderForm.rate) return "Rate is required for ODA";
      if (!orderForm.currencyPair) return "Currency pair is required for ODA";
      if (!orderForm.valueDate) return "Value date is required for ODA";
    }
    if (fam === "MLD" && !orderForm.trancheId) return "Tranche is required for MLD";
    if (fam === "FX_TODAY") {
      if (!orderForm.currencyPair && (!orderForm.dealtCurrency || !orderForm.counterCurrency))
        return "Currency pair is required for FX";
      if (!orderForm.specialRate) return "Special rate is required for FX";
    }
    if (fam === "BOND" && (orderForm.transactionType === "SELL" || orderForm.transactionType === "SWITCHING")) {
      if (!orderForm.quantity) return "Quantity is required for Bond sell/switch";
    }
    return null;
  }

  // ── Mutations ────────────────────────────────────────────────────────
  const createOrderMutation = useMutation({
    mutationFn: () => {
      const validationError = validateOrderForm();
      if (validationError) return Promise.reject(new Error(validationError));

      const base = {
        productFamily: orderForm.productFamily,
        transactionType: orderForm.transactionType,
        customerId: orderForm.customerId || undefined,
        portfolioId: orderForm.portfolioId || undefined,
        channel: orderForm.channel,
        assistedByUserId: orderForm.assistedByUserId || undefined,
        branchCode: orderForm.branchCode || undefined,
        amount: Number(orderForm.amount),
        currency: orderForm.currency,
        customerRiskScore: orderForm.customerRiskScore ?? 0,
        productScore: orderForm.productScore ?? 0,
        productId: orderForm.productId ? Number(orderForm.productId) : undefined,
        documentStatus: "REQUIRED",
        verificationStatus: orderForm.productFamily === "FX_TODAY" ? "PENDING" : "NOT_REQUIRED",
        payload: orderNotes ? { notes: orderNotes } : undefined,
      };

      const fam = orderForm.productFamily;
      if (fam === "ODA") {
        return apiRequest("POST", "/api/v1/oems/oda/recommendations", {
          ...base, tenorDays: Number(orderForm.tenorDays), rate: Number(orderForm.rate),
          currencyPair: orderForm.currencyPair, direction: orderForm.direction,
          effectiveType: orderForm.effectiveType, valueDate: orderForm.valueDate,
        });
      }
      if (fam === "MLD") {
        return apiRequest("POST", "/api/v1/oems/mld/orders", { ...base, trancheId: Number(orderForm.trancheId) });
      }
      if (fam === "MUTUAL_FUND" || fam === "BOND") {
        return apiRequest("POST", "/api/v1/oems/mf-bond/orders", {
          ...base, quantity: orderForm.quantity ? Number(orderForm.quantity) : undefined,
        });
      }
      if (fam === "FX_TODAY") {
        return apiRequest("POST", "/api/v1/oems/fx-today/orders", {
          ...base, dealtCurrency: orderForm.dealtCurrency,
          counterCurrency: orderForm.counterCurrency, specialRate: Number(orderForm.specialRate),
        });
      }
      return apiRequest("POST", "/api/v1/oems/orders", {
        ...base, facilityId: orderForm.facilityId || undefined,
        limitAmount: orderForm.limitAmount ? Number(orderForm.limitAmount) : undefined,
        tenor: orderForm.tenor ? Number(orderForm.tenor) : undefined,
        lendingRate: orderForm.lendingRate ? Number(orderForm.lendingRate) : undefined,
      });
    },
    onSuccess: (data: any) => {
      const id = data?.order_id ?? data?.orderId ?? data?.id;
      if (id) setOrderId(id);
      toast({ title: "Draft order created" });
      onDraftCreated?.();
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const calculateChargesMutation = useMutation({
    mutationFn: (oid: string) => apiRequest("POST", `/api/v1/oems/orders/${oid}/charges`) as Promise<ChargeResult>,
    onSuccess: (data) => setChargeResult(data),
    onError: (err: Error) => toast({ title: "Charge calculation failed", description: err.message, variant: "destructive" }),
  });

  const validateOrderMutation = useMutation({
    mutationFn: (oid: string) => apiRequest("POST", `/api/v1/oems/orders/${oid}/validate`) as Promise<ValidateResult>,
    onSuccess: (data) => setValidationResult(data),
    onError: (err: Error) => toast({ title: "Validation failed", description: err.message, variant: "destructive" }),
  });

  const acknowledgeWarningsMutation = useMutation({
    mutationFn: ({ oid, codes }: { oid: string; codes: string[] }) =>
      apiRequest("POST", `/api/v1/oems/orders/${oid}/validation-warnings/acknowledge`, { ruleCodes: codes }),
    onSuccess: () => {
      toast({ title: "Warnings acknowledged" });
      if (orderId) validateOrderMutation.mutate(orderId);
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const generateDocChecklistMutation = useMutation({
    mutationFn: async (oid: string) => {
      await apiRequest("POST", `/api/v1/oems/orders/${oid}/documents/checklist/generate`);
      return apiRequest("GET", `/api/v1/oems/orders/${oid}/documents/checklist`) as Promise<DocumentChecklistItem[]>;
    },
    onSuccess: (data) => setDocChecklist(data),
    onError: (err: Error) => toast({ title: "Document checklist failed", description: err.message, variant: "destructive" }),
  });

  const submitOrderMutation = useMutation({
    mutationFn: (oid: string) => apiRequest("POST", `/api/v1/oems/orders/${oid}/submit`),
    onSuccess: () => {
      toast({ title: "Order submitted successfully" });
      onOrderSubmitted?.();
      // Reset wizard
      setStep(0);
      setOrderId(null);
      setChargeResult(null);
      setValidationResult(null);
      setDocChecklist([]);
      setOrderNotes("");
    },
    onError: (err: Error) => toast({ title: "Submission failed", description: err.message, variant: "destructive" }),
  });

  // ── Navigation ───────────────────────────────────────────────────────
  const isLoading = createOrderMutation.isPending || calculateChargesMutation.isPending
    || validateOrderMutation.isPending || generateDocChecklistMutation.isPending || submitOrderMutation.isPending;

  const goNext = async () => {
    if (isLoading) return;

    // Step 1 → 2: Create draft and calculate charges
    if (step === 1 && !orderId) {
      createOrderMutation.mutate(undefined, {
        onSuccess: (data: any) => {
          const id = data?.order_id ?? data?.orderId ?? data?.id;
          if (id) {
            setOrderId(id);
            calculateChargesMutation.mutate(id, { onSuccess: () => setStep(2) });
          }
        },
      });
      return;
    }

    // Step 1 → 2 with existing orderId
    if (step === 1 && orderId) {
      calculateChargesMutation.mutate(orderId, { onSuccess: () => setStep(2) });
      return;
    }

    // Step 2 → 3: Validate
    if (step === 2 && orderId) {
      validateOrderMutation.mutate(orderId, { onSuccess: () => setStep(3) });
      return;
    }

    // Step 3 → 4: Generate doc checklist
    if (step === 3 && orderId) {
      generateDocChecklistMutation.mutate(orderId, { onSuccess: () => setStep(4) });
      return;
    }

    if (step < STEPS.length - 1) setStep(step + 1);
  };

  const goPrev = () => { if (step > 0) setStep(step - 1); };

  const hasBlockingValidation = validationResult?.hasBlocking ?? false;

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-base">Order Capture</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* ── Stepper ────────────────────────────────────────────── */}
        <div className="flex items-center gap-1 overflow-x-auto pb-2">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const isActive = i === step;
            const isCompleted = i < step;
            return (
              <div key={s.key} className="flex items-center gap-1">
                {i > 0 && (
                  <div className={`h-0.5 w-8 ${isCompleted ? "bg-primary" : "bg-muted"}`} />
                )}
                <button
                  onClick={() => {
                    if (isCompleted) setStep(i);
                  }}
                  disabled={!isCompleted && !isActive}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : isCompleted
                        ? "bg-primary/10 text-primary cursor-pointer"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {isCompleted ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                  <span className="hidden sm:inline">{s.label}</span>
                </button>
              </div>
            );
          })}
        </div>

        <Separator />

        {/* ── Step 0: Customer & Account ─────────────────────────── */}
        {step === 0 && (
          <div className="space-y-4">
            <p className="text-xs font-semibold text-muted-foreground mb-3">Customer & Account</p>
            <div className="grid gap-4 md:grid-cols-4">
              <Field label="Customer">
                <Combobox
                  options={clientOptions}
                  value={orderForm.customerId}
                  onValueChange={handleCustomerSelect}
                  onSearchChange={setClientSearch}
                  placeholder="Search by ID or name..."
                  emptyText={clientSearch.length < 2 ? "Type 2+ chars to search" : "No clients found"}
                  loading={clientSearchQuery.isLoading}
                />
              </Field>
              <Field label="Portfolio">
                <Select value={orderForm.portfolioId} onValueChange={(value) => setOrderForm({ ...orderForm, portfolioId: value })}>
                  <SelectTrigger><SelectValue placeholder="Select portfolio" /></SelectTrigger>
                  <SelectContent>
                    {(clientPortfoliosQuery.data ?? []).map((p) => (
                      <SelectItem key={p.portfolio_id} value={p.portfolio_id}>
                        {p.portfolio_id} ({p.type ?? "N/A"})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Risk Profile">
                <div className="flex h-9 items-center">
                  {orderForm.customerRiskScore != null ? (
                    <Badge variant="outline">{riskLabel(orderForm.customerRiskScore)}</Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">Auto-populated</span>
                  )}
                </div>
              </Field>
              <Field label="Customer Risk Score">
                <div className="flex h-9 items-center">
                  <span className="text-sm">{orderForm.customerRiskScore ?? "—"}</span>
                </div>
              </Field>
            </div>

            {orderForm.customerRiskCategory === "" && orderForm.customerId && (
              <div className="flex items-center gap-2 rounded-md border border-orange-200 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-800 p-3 text-sm text-orange-700 dark:text-orange-300">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Risk profile is missing or expired for this customer.
              </div>
            )}
          </div>
        )}

        {/* ── Step 1: Product & Order Details ────────────────────── */}
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-3">Product Selection</p>
              <div className="grid gap-4 md:grid-cols-4">
                <Field label="Product Family">
                  <Select value={orderForm.productFamily} onValueChange={(value) => { setOrderForm((f) => ({ ...f, productFamily: value as ProductFamily })); resetFamilyFields(); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {productFamilies.map((family) => <SelectItem key={family} value={family}>{family.replace(/_/g, " ")}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Transaction Type">
                  <Select value={orderForm.transactionType} onValueChange={(value) => setOrderForm({ ...orderForm, transactionType: value })}>
                    <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                    <SelectContent>
                      {(TRANSACTION_TYPES_BY_FAMILY[orderForm.productFamily] ?? []).map((tt) => (
                        <SelectItem key={tt} value={tt}>{tt.replace(/_/g, " ")}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Product / Security">
                  <Select value={orderForm.productId} onValueChange={handleProductSelect}>
                    <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                    <SelectContent>
                      {familyProducts.map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}>{p.product_code} — {p.product_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Product Risk Score">
                  <div className="flex h-9 items-center">
                    {orderForm.productScore != null ? (
                      <Badge variant="outline">{riskLabel(orderForm.productScore)}</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">Auto-populated</span>
                    )}
                  </div>
                </Field>
              </div>
            </div>

            {/* Dynamic fields per family */}
            {orderForm.productFamily === "ODA" && (
              <>
                <Separator />
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-3">ODA Details</p>
                  <div className="grid gap-4 md:grid-cols-4">
                    <Field label="Currency Pair">
                      <Input value={orderForm.currencyPair} onChange={(e) => setOrderForm({ ...orderForm, currencyPair: e.target.value.toUpperCase() })} placeholder="e.g. USD/PHP" />
                    </Field>
                    <Field label="Direction">
                      <Select value={orderForm.direction} onValueChange={(v) => setOrderForm({ ...orderForm, direction: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="BUY">BUY</SelectItem>
                          <SelectItem value="SELL">SELL</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Tenor Days">
                      <Input type="number" value={orderForm.tenorDays} onChange={(e) => setOrderForm({ ...orderForm, tenorDays: e.target.value })} />
                    </Field>
                    <Field label="Rate">
                      <Input type="number" step="0.0001" value={orderForm.rate} onChange={(e) => setOrderForm({ ...orderForm, rate: e.target.value })} />
                    </Field>
                    <Field label="Effective Type">
                      <Select value={orderForm.effectiveType} onValueChange={(v) => setOrderForm({ ...orderForm, effectiveType: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="TODAY">TODAY</SelectItem>
                          <SelectItem value="FORWARD">FORWARD</SelectItem>
                          <SelectItem value="SPOT">SPOT</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Value Date">
                      <Input type="date" value={orderForm.valueDate} onChange={(e) => setOrderForm({ ...orderForm, valueDate: e.target.value })} />
                    </Field>
                  </div>
                </div>
              </>
            )}

            {orderForm.productFamily === "MLD" && (
              <>
                <Separator />
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-3">MLD Details</p>
                  <div className="grid gap-4 md:grid-cols-4">
                    <Field label="Tranche">
                      <Select value={orderForm.trancheId} onValueChange={(v) => setOrderForm({ ...orderForm, trancheId: v })}>
                        <SelectTrigger><SelectValue placeholder="Select tranche" /></SelectTrigger>
                        <SelectContent>
                          {mldTranches.map((t) => (
                            <SelectItem key={t.id} value={String(t.id)}>{t.tranche_code} — {t.tranche_name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>
                </div>
              </>
            )}

            {(orderForm.productFamily === "MUTUAL_FUND" || orderForm.productFamily === "BOND") && (
              <>
                <Separator />
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-3">{orderForm.productFamily === "MUTUAL_FUND" ? "Mutual Fund" : "Bond"} Details</p>
                  <div className="grid gap-4 md:grid-cols-4">
                    {orderForm.productFamily === "BOND" && (
                      <Field label="Quantity">
                        <Input type="number" value={orderForm.quantity} onChange={(e) => setOrderForm({ ...orderForm, quantity: e.target.value })} />
                      </Field>
                    )}
                  </div>
                </div>
              </>
            )}

            {orderForm.productFamily === "FX_TODAY" && (
              <>
                <Separator />
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-3">FX Today Details</p>
                  <div className="grid gap-4 md:grid-cols-4">
                    <Field label="Dealt Currency">
                      <Input value={orderForm.dealtCurrency} onChange={(e) => setOrderForm({ ...orderForm, dealtCurrency: e.target.value.toUpperCase() })} placeholder="e.g. USD" />
                    </Field>
                    <Field label="Counter Currency">
                      <Input value={orderForm.counterCurrency} onChange={(e) => setOrderForm({ ...orderForm, counterCurrency: e.target.value.toUpperCase() })} placeholder="e.g. PHP" />
                    </Field>
                    <Field label="Special Rate">
                      <Input type="number" step="0.0001" value={orderForm.specialRate} onChange={(e) => setOrderForm({ ...orderForm, specialRate: e.target.value })} />
                    </Field>
                  </div>
                </div>
              </>
            )}

            {orderForm.productFamily === "WEALTH_LENDING" && (
              <>
                <Separator />
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-3">Wealth Lending Details</p>
                  <div className="grid gap-4 md:grid-cols-4">
                    <Field label="Facility ID">
                      <Input value={orderForm.facilityId} onChange={(e) => setOrderForm({ ...orderForm, facilityId: e.target.value })} />
                    </Field>
                    <Field label="Limit Amount">
                      <Input type="number" value={orderForm.limitAmount} onChange={(e) => setOrderForm({ ...orderForm, limitAmount: e.target.value })} />
                    </Field>
                    <Field label="Tenor">
                      <Input type="number" value={orderForm.tenor} onChange={(e) => setOrderForm({ ...orderForm, tenor: e.target.value })} />
                    </Field>
                    <Field label="Lending Rate">
                      <Input type="number" step="0.0001" value={orderForm.lendingRate} onChange={(e) => setOrderForm({ ...orderForm, lendingRate: e.target.value })} />
                    </Field>
                  </div>
                </div>
              </>
            )}

            <Separator />

            {/* Channel & Amount */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-3">Channel & Amount</p>
              <div className="grid gap-4 md:grid-cols-4">
                <Field label="Channel">
                  <Select value={orderForm.channel} onValueChange={(value) => setOrderForm({ ...orderForm, channel: value as OemsChannel })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {oemsChannels.map((channel) => <SelectItem key={channel} value={channel}>{channel.replace(/_/g, " ")}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                {SALES_ASSISTED_CHANNELS.includes(orderForm.channel) && (
                  <>
                    <Field label="Assisted by">
                      <Input value={orderForm.assistedByUserId} onChange={(e) => setOrderForm({ ...orderForm, assistedByUserId: e.target.value })} />
                    </Field>
                    <Field label="Branch Code">
                      <Input value={orderForm.branchCode} onChange={(e) => setOrderForm({ ...orderForm, branchCode: e.target.value.toUpperCase() })} />
                    </Field>
                  </>
                )}
                <Field label="Currency">
                  <Input value={orderForm.currency} onChange={(e) => setOrderForm({ ...orderForm, currency: e.target.value.toUpperCase() })} />
                </Field>
                <Field label="Amount">
                  <Input type="number" value={orderForm.amount} onChange={(e) => setOrderForm({ ...orderForm, amount: e.target.value })} placeholder="0.00" />
                </Field>
              </div>
            </div>

            <Separator />

            {/* Order notes */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-3">Order Notes</p>
              <Textarea
                value={orderNotes}
                onChange={(e) => setOrderNotes(e.target.value)}
                placeholder="Optional notes or special instructions..."
                rows={2}
              />
            </div>
          </div>
        )}

        {/* ── Step 2: Charges & Settlement ───────────────────────── */}
        {step === 2 && (
          <div className="space-y-4">
            <p className="text-xs font-semibold text-muted-foreground mb-3">Charges & Settlement Preview</p>

            {calculateChargesMutation.isPending && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
                <Loader2 className="h-4 w-4 animate-spin" /> Calculating charges...
              </div>
            )}

            {chargeResult && (
              <div className="space-y-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Charge</TableHead>
                      <TableHead>Rate</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow className="font-medium bg-muted/30">
                      <TableCell colSpan={2}>Gross Amount</TableCell>
                      <TableCell className="text-right">{formatMoney(chargeResult.grossAmount, chargeResult.currency)}</TableCell>
                    </TableRow>
                    {chargeResult.charges.map((c, i) => (
                      <TableRow key={i}>
                        <TableCell>{c.charge_label}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {c.rate_type === "PERCENTAGE" && c.rate_value ? `${c.rate_value}%` : ""}
                          {c.rate_type === "FLAT" && c.rate_value ? `Flat ${formatMoney(c.rate_value, chargeResult.currency)}` : ""}
                          {c.rate_type === "PER_UNIT" ? "Per unit" : ""}
                          {c.rate_type === "INFORMATIONAL" ? "Info" : ""}
                        </TableCell>
                        <TableCell className="text-right">
                          {c.is_deducted ? `(${formatMoney(c.charge_amount, chargeResult.currency)})` : formatMoney(c.charge_amount, chargeResult.currency)}
                        </TableCell>
                      </TableRow>
                    ))}
                    {chargeResult.totalTax > 0 && (
                      <TableRow>
                        <TableCell colSpan={2} className="text-muted-foreground">Total Tax</TableCell>
                        <TableCell className="text-right">({formatMoney(chargeResult.totalTax, chargeResult.currency)})</TableCell>
                      </TableRow>
                    )}
                    <TableRow className="font-bold border-t-2">
                      <TableCell colSpan={2}>Settlement Amount</TableCell>
                      <TableCell className="text-right text-base">{formatMoney(chargeResult.settlementAmount, chargeResult.currency)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>

                <div className="text-xs text-muted-foreground">
                  Indicative settlement date: <span className="font-medium">{chargeResult.indicativeSettlementDate}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Step 3: Validation & Compliance ────────────────────── */}
        {step === 3 && (
          <div className="space-y-4">
            <p className="text-xs font-semibold text-muted-foreground mb-3">Validation & Compliance</p>

            {validateOrderMutation.isPending && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
                <Loader2 className="h-4 w-4 animate-spin" /> Validating order...
              </div>
            )}

            {validationResult && (
              <div className="space-y-4">
                {/* Summary banner */}
                {validationResult.hasBlocking ? (
                  <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-300">
                    <XCircle className="h-4 w-4 shrink-0" />
                    {validationResult.findings.filter((f) => f.result === "FAIL").length} blocking issue(s) found
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800 p-3 text-sm text-green-700 dark:text-green-300">
                    <CheckCircle className="h-4 w-4 shrink-0" />
                    All checks passed
                  </div>
                )}

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Rule</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Severity</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {validationResult.findings.map((f, i) => (
                      <TableRow key={i} className={f.result === "FAIL" ? "bg-red-50/50 dark:bg-red-950/10" : ""}>
                        <TableCell className="font-mono text-xs">{f.rule_code ?? f.ruleCode}</TableCell>
                        <TableCell className="text-sm">{f.message}</TableCell>
                        <TableCell><StatusBadge value={f.severity} /></TableCell>
                        <TableCell>
                          {f.result === "PASS" && <CheckCircle className="h-4 w-4 text-green-600" />}
                          {f.result === "FAIL" && <XCircle className="h-4 w-4 text-red-600" />}
                          {f.result === "WARN" && <AlertTriangle className="h-4 w-4 text-orange-500" />}
                        </TableCell>
                        <TableCell>
                          {f.result === "WARN" && validationResult.warningCodesRequiringAcknowledgement.includes(f.rule_code ?? f.ruleCode ?? "") && orderId && (
                            <Button size="sm" variant="outline" onClick={() => acknowledgeWarningsMutation.mutate({ oid: orderId, codes: [f.rule_code ?? f.ruleCode ?? ""] })}>
                              Acknowledge
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}

        {/* ── Step 4: Document Requirements ──────────────────────── */}
        {step === 4 && (
          <div className="space-y-4">
            <p className="text-xs font-semibold text-muted-foreground mb-3">Document Requirements</p>

            {generateDocChecklistMutation.isPending && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
                <Loader2 className="h-4 w-4 animate-spin" /> Generating document checklist...
              </div>
            )}

            {docChecklist.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Document Type</TableHead>
                    <TableHead>Requirement</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {docChecklist.map((doc) => (
                    <TableRow key={doc.id}>
                      <TableCell className="text-sm">{doc.document_type.replace(/_/g, " ")}</TableCell>
                      <TableCell><StatusBadge value={doc.requirement_level} /></TableCell>
                      <TableCell><StatusBadge value={doc.registration_status} /></TableCell>
                      <TableCell>
                        {["MISSING", "PENDING_UPLOAD", "REJECTED"].includes(doc.registration_status) && (
                          <Button size="sm" variant="outline">
                            <Upload className="mr-1 h-3 w-3" /> Upload
                          </Button>
                        )}
                        {doc.registration_status === "EXPIRED" && (
                          <Button size="sm" variant="outline">Renew</Button>
                        )}
                        {["UPLOADED", "SIGNED", "VERIFIED"].includes(doc.registration_status) && (
                          <Button size="sm" variant="ghost">View</Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              !generateDocChecklistMutation.isPending && (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  No document requirements for this order.
                </div>
              )
            )}
          </div>
        )}

        {/* ── Step 5: Review & Submit ────────────────────────────── */}
        {step === 5 && (
          <div className="space-y-6">
            <p className="text-xs font-semibold text-muted-foreground mb-3">Review & Submit</p>

            <div className="grid gap-6 md:grid-cols-2">
              {/* Left column — Order summary */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Order Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Customer</span><span className="font-medium">{orderForm.customerLabel || orderForm.customerId}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Portfolio</span><span className="font-medium">{orderForm.portfolioId || "—"}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Product Family</span><span className="font-medium">{orderForm.productFamily.replace(/_/g, " ")}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Transaction Type</span><span className="font-medium">{orderForm.transactionType.replace(/_/g, " ")}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Amount</span><span className="font-medium">{formatMoney(orderForm.amount, orderForm.currency)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Channel</span><span className="font-medium">{orderForm.channel.replace(/_/g, " ")}</span></div>
                  {orderNotes && (
                    <div className="flex justify-between"><span className="text-muted-foreground">Notes</span><span className="font-medium truncate max-w-[200px]">{orderNotes}</span></div>
                  )}
                </CardContent>
              </Card>

              {/* Right column — Settlement & status summary */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Settlement & Status</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Total Charges</span><span className="font-medium">{chargeResult ? formatMoney(chargeResult.totalCharges, chargeResult.currency) : "—"}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Total Tax</span><span className="font-medium">{chargeResult ? formatMoney(chargeResult.totalTax, chargeResult.currency) : "—"}</span></div>
                  <div className="flex justify-between font-bold"><span>Settlement Amount</span><span>{chargeResult ? formatMoney(chargeResult.settlementAmount, chargeResult.currency) : "—"}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Settlement Date</span><span className="font-medium">{chargeResult?.indicativeSettlementDate ?? "—"}</span></div>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Validation</span>
                    {validationResult ? (
                      validationResult.hasBlocking
                        ? <Badge variant="destructive">Blocking Issues</Badge>
                        : <Badge variant="secondary">All Passed</Badge>
                    ) : <span>—</span>}
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Documents</span>
                    <span className="font-medium">{docChecklist.length > 0 ? `${docChecklist.filter((d) => ["UPLOADED", "SIGNED", "VERIFIED"].includes(d.registration_status)).length}/${docChecklist.length} ready` : "None required"}</span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {hasBlockingValidation && (
              <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-300">
                <XCircle className="h-4 w-4 shrink-0" />
                Cannot submit: order has blocking validation issues. Go back to Validation step to review.
              </div>
            )}
          </div>
        )}

        <Separator />

        {/* ── Navigation Buttons ──────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <Button variant="outline" onClick={goPrev} disabled={step === 0 || isLoading}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Previous
          </Button>

          <div className="flex items-center gap-2">
            {step === STEPS.length - 1 ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    toast({ title: "Order saved as draft" });
                    onDraftCreated?.();
                    setStep(0);
                    setOrderId(null);
                    setChargeResult(null);
                    setValidationResult(null);
                    setDocChecklist([]);
                  }}
                  disabled={isLoading}
                >
                  Save as Draft
                </Button>
                <Button
                  onClick={() => orderId && submitOrderMutation.mutate(orderId)}
                  disabled={isLoading || hasBlockingValidation || !orderId}
                >
                  {submitOrderMutation.isPending ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-1 h-4 w-4" />
                  )}
                  Submit Order
                </Button>
              </>
            ) : (
              <Button onClick={goNext} disabled={isLoading}>
                {isLoading ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : null}
                {step === 1 && !orderId ? "Create Draft & Continue" : "Next"}
                {!isLoading && <ArrowRight className="ml-1 h-4 w-4" />}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
