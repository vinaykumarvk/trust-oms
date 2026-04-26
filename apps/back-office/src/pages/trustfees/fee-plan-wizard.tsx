/**
 * Fee Plan Wizard -- TrustFees Pro Phase 5
 *
 * 4-step wizard with stepper navigation to create or edit a Fee Plan:
 *   Step 1: Basics (code, name, charge basis, fee type, jurisdiction, parties, template)
 *   Step 2: Pricing & Eligibility
 *   Step 3: Schedule & Thresholds (only for PERIOD charge basis)
 *   Step 4: Review & Preview (read-only summary + live calculation)
 */
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@ui/lib/queryClient";
import { apiUrl } from "@ui/lib/api-url";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/ui/card";
import { Badge } from "@ui/components/ui/badge";
import { Button } from "@ui/components/ui/button";
import { Input } from "@ui/components/ui/input";
import { Label } from "@ui/components/ui/label";
import { Separator } from "@ui/components/ui/separator";
import { Switch } from "@ui/components/ui/switch";
import { Textarea } from "@ui/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@ui/components/ui/dialog";
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
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Calculator,
  ClipboardList,
  Settings2,
  CalendarDays,
  Eye,
  Save,
  AlertTriangle,
} from "lucide-react";

/* ---------- Constants ---------- */
const STEPS = [
  { key: "basics", label: "Basics", icon: ClipboardList },
  { key: "pricing", label: "Pricing & Eligibility", icon: Settings2 },
  { key: "schedule", label: "Schedule & Thresholds", icon: CalendarDays },
  { key: "review", label: "Review & Preview", icon: Eye },
];

const FEE_TYPES = [
  { value: "CUSTODY", label: "Custody" },
  { value: "MANAGEMENT", label: "Management" },
  { value: "PERFORMANCE", label: "Performance" },
  { value: "SUBSCRIPTION", label: "Subscription" },
  { value: "REDEMPTION", label: "Redemption" },
  { value: "COMMISSION", label: "Commission" },
  { value: "TAX", label: "Tax" },
  { value: "TRUST", label: "Trust" },
  { value: "ESCROW", label: "Escrow" },
  { value: "ADMIN", label: "Admin" },
  { value: "OTHER", label: "Other" },
];

const SOURCE_PARTIES = [
  { value: "INVESTOR", label: "Investor" },
  { value: "ISSUER", label: "Issuer" },
];

const TARGET_PARTIES = [
  { value: "BANK", label: "Bank" },
  { value: "BROKER", label: "Broker" },
  { value: "PORTFOLIO_MANAGER", label: "Portfolio Manager" },
];

const COMPARISON_BASES = [
  { value: "PRICE", label: "Price" },
  { value: "TXN_AMOUNT", label: "Transaction Amount" },
  { value: "NUM_TXNS", label: "Number of Transactions" },
  { value: "AUM", label: "AUM" },
  { value: "NOMINAL", label: "Nominal" },
  { value: "XIRR", label: "XIRR" },
  { value: "YTM", label: "YTM" },
  { value: "COUPON_PCT", label: "Coupon %" },
  { value: "DIVIDEND_PCT", label: "Dividend %" },
];

const VALUE_BASES = [
  { value: "AUM", label: "AUM" },
  { value: "BUM", label: "BUM" },
  { value: "TXN_AMOUNT", label: "Transaction Amount" },
  { value: "NOTIONAL", label: "Notional" },
  { value: "AVG_INVESTMENT", label: "Average Investment" },
  { value: "FACE_VALUE", label: "Face Value" },
  { value: "PRINCIPAL", label: "Principal" },
  { value: "COST", label: "Cost" },
];

const RATE_TYPES = [
  { value: "FLAT", label: "Flat" },
  { value: "ANNUALIZED", label: "Annualized" },
];

const EVENT_TYPES = [
  { value: "BUY", label: "Buy" },
  { value: "SELL", label: "Sell" },
  { value: "MATURITY", label: "Maturity" },
  { value: "COUPON", label: "Coupon" },
  { value: "DIVIDEND", label: "Dividend" },
  { value: "PRE_TERMINATION", label: "Pre-Termination" },
  { value: "REDEMPTION", label: "Redemption" },
  { value: "CORPORATE_ACTION", label: "Corporate Action" },
];

/* ---------- Types ---------- */
interface FeePlanForm {
  fee_plan_code: string;
  fee_plan_name: string;
  description: string;
  charge_basis: string;
  fee_type: string;
  jurisdiction_id: string;
  source_party: string;
  target_party: string;
  template_id: string;
  pricing_definition_id: string;
  pricing_binding_mode: string;
  eligibility_expression_id: string;
  comparison_basis: string;
  value_basis: string;
  event_type: string;
  accrual_schedule_id: string;
  rate_type: string;
  min_charge_amount: string;
  max_charge_amount: string;
  lower_threshold_pct: string;
  upper_threshold_pct: string;
  aum_basis_include_uitf: boolean;
  aum_basis_include_3p_funds: boolean;
  market_value_includes_accruals_override: boolean;
  effective_date: string;
  expiry_date: string;
}

function emptyForm(): FeePlanForm {
  return {
    fee_plan_code: "",
    fee_plan_name: "",
    description: "",
    charge_basis: "PERIOD",
    fee_type: "CUSTODY",
    jurisdiction_id: "",
    source_party: "INVESTOR",
    target_party: "BANK",
    template_id: "",
    pricing_definition_id: "",
    pricing_binding_mode: "STRICT",
    eligibility_expression_id: "",
    comparison_basis: "AUM",
    value_basis: "AUM",
    event_type: "",
    accrual_schedule_id: "",
    rate_type: "FLAT",
    min_charge_amount: "0",
    max_charge_amount: "",
    lower_threshold_pct: "0.050000",
    upper_threshold_pct: "0.400000",
    aum_basis_include_uitf: false,
    aum_basis_include_3p_funds: false,
    market_value_includes_accruals_override: false,
    effective_date: new Date().toISOString().slice(0, 10),
    expiry_date: "",
  };
}

/* ---------- Helpers ---------- */
const fmtPHP = (n: number | string) => {
  const num = typeof n === "string" ? parseFloat(n) : n;
  if (isNaN(num)) return "PHP 0.00";
  return num.toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  });
};

const labelFor = (
  options: { value: string; label: string }[],
  value: string,
) => options.find((o) => o.value === value)?.label ?? value.replace(/_/g, " ");

/* ========== Main Component ========== */
export default function FeePlanWizard() {
  const navigate = useNavigate();
  const params = useParams<{ id: string }>();
  const isEdit = !!params.id;
  const qc = useQueryClient();

  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FeePlanForm>(emptyForm());

  // --- GAP-A20: Draft save on wizard exit ---
  const DRAFT_KEY = "fee-plan-wizard-draft";
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hasDraft, setHasDraft] = useState(false);

  // Restore draft on mount (only for new plans, not edit)
  useEffect(() => {
    if (isEdit) return;
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        setForm(parsed);
        setHasDraft(true);
      }
    } catch {
      // Ignore invalid draft data
    }
  }, [isEdit]);

  // Debounced auto-save (3 seconds) on form changes
  useEffect(() => {
    if (isEdit) return;
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(form));
        setHasDraft(true);
      } catch {
        // localStorage full or unavailable
      }
    }, 3000);
    return () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    };
  }, [form, isEdit]);

  // Warn on unsaved changes when leaving
  useEffect(() => {
    if (isEdit) return;
    const handler = (e: BeforeUnloadEvent) => {
      if (form.fee_plan_code || form.fee_plan_name) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [form.fee_plan_code, form.fee_plan_name, isEdit]);

  // Discard draft handler
  const discardDraft = useCallback(() => {
    localStorage.removeItem(DRAFT_KEY);
    setForm(emptyForm());
    setStep(0);
    setHasDraft(false);
  }, []);

  // Preview state
  const [previewAum, setPreviewAum] = useState("");
  const [previewTxn, setPreviewTxn] = useState("");
  const [previewResult, setPreviewResult] = useState<any>(null);

  // --- Reference data queries ---
  const jurisdictionsQ = useQuery<any>({
    queryKey: ["jurisdictions-list"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/fee-plan-templates?pageSize=1")),
    // We use a simpler approach: just use the known jurisdictions
    enabled: false,
  });

  const pricingDefsQ = useQuery<any>({
    queryKey: ["pricing-defs-for-wizard"],
    queryFn: () =>
      apiRequest("GET", apiUrl("/api/v1/pricing-definitions?status=ACTIVE&pageSize=100")),
    refetchInterval: 30_000,
  });

  const eligibilityExprsQ = useQuery<any>({
    queryKey: ["eligibility-exprs-for-wizard"],
    queryFn: () =>
      apiRequest("GET", apiUrl("/api/v1/eligibility-expressions?status=ACTIVE&pageSize=100")),
    refetchInterval: 30_000,
  });

  const accrualSchedulesQ = useQuery<any>({
    queryKey: ["accrual-schedules-for-wizard"],
    queryFn: () =>
      apiRequest("GET", apiUrl("/api/v1/accrual-schedules?status=ACTIVE&pageSize=100")),
    refetchInterval: 30_000,
  });

  const templatesQ = useQuery<any>({
    queryKey: ["templates-for-wizard"],
    queryFn: () =>
      apiRequest("GET", apiUrl("/api/v1/fee-plan-templates?pageSize=100")),
    refetchInterval: 30_000,
  });

  // Load existing plan for edit mode
  const existingPlanQ = useQuery<any>({
    queryKey: ["fee-plan-edit", params.id],
    queryFn: () =>
      apiRequest("GET", apiUrl(`/api/v1/fee-plans/${params.id}`)),
    enabled: isEdit,
  });

  // Populate form from existing plan
  useEffect(() => {
    if (existingPlanQ.data?.data) {
      const p = existingPlanQ.data.data;
      setForm({
        fee_plan_code: p.fee_plan_code ?? "",
        fee_plan_name: p.fee_plan_name ?? "",
        description: p.description ?? "",
        charge_basis: p.charge_basis ?? "PERIOD",
        fee_type: p.fee_type ?? "CUSTODY",
        jurisdiction_id: p.jurisdiction_id ? String(p.jurisdiction_id) : "",
        source_party: p.source_party ?? "INVESTOR",
        target_party: p.target_party ?? "BANK",
        template_id: p.template_id ? String(p.template_id) : "",
        pricing_definition_id: p.pricing_definition_id ? String(p.pricing_definition_id) : "",
        pricing_binding_mode: p.pricing_binding_mode ?? "STRICT",
        eligibility_expression_id: p.eligibility_expression_id ? String(p.eligibility_expression_id) : "",
        comparison_basis: p.comparison_basis ?? "AUM",
        value_basis: p.value_basis ?? "AUM",
        event_type: p.event_type ?? "",
        accrual_schedule_id: p.accrual_schedule_id ? String(p.accrual_schedule_id) : "",
        rate_type: p.rate_type ?? "FLAT",
        min_charge_amount: p.min_charge_amount ?? "0",
        max_charge_amount: p.max_charge_amount ?? "",
        lower_threshold_pct: p.lower_threshold_pct ?? "0.050000",
        upper_threshold_pct: p.upper_threshold_pct ?? "0.400000",
        aum_basis_include_uitf: p.aum_basis_include_uitf ?? false,
        aum_basis_include_3p_funds: p.aum_basis_include_3p_funds ?? false,
        market_value_includes_accruals_override: p.market_value_includes_accruals_override ?? false,
        effective_date: p.effective_date ?? new Date().toISOString().slice(0, 10),
        expiry_date: p.expiry_date ?? "",
      });
    }
  }, [existingPlanQ.data]);

  // Selected pricing definition details
  const selectedPricingDef = useMemo(() => {
    if (!form.pricing_definition_id) return null;
    const defs = pricingDefsQ.data?.data ?? [];
    return defs.find((d: any) => String(d.id) === form.pricing_definition_id) ?? null;
  }, [form.pricing_definition_id, pricingDefsQ.data]);

  // Selected eligibility expression details
  const selectedEligibility = useMemo(() => {
    if (!form.eligibility_expression_id) return null;
    const exprs = eligibilityExprsQ.data?.data ?? [];
    return exprs.find((e: any) => String(e.id) === form.eligibility_expression_id) ?? null;
  }, [form.eligibility_expression_id, eligibilityExprsQ.data]);

  // Selected accrual schedule details
  const selectedSchedule = useMemo(() => {
    if (!form.accrual_schedule_id) return null;
    const schedules = accrualSchedulesQ.data?.data ?? [];
    return schedules.find((s: any) => String(s.id) === form.accrual_schedule_id) ?? null;
  }, [form.accrual_schedule_id, accrualSchedulesQ.data]);

  // --- Template instantiation ---
  const handleTemplateSelect = async (templateId: string) => {
    setForm((f) => ({ ...f, template_id: templateId }));
    if (!templateId) return;

    try {
      const result = await apiRequest(
        "GET",
        apiUrl(`/api/v1/fee-plan-templates/${templateId}`),
      );
      const payload = result?.data?.default_payload ?? result?.default_payload ?? {};
      setForm((f) => ({
        ...f,
        template_id: templateId,
        ...(payload.fee_type ? { fee_type: payload.fee_type } : {}),
        ...(payload.charge_basis ? { charge_basis: payload.charge_basis } : {}),
        ...(payload.source_party ? { source_party: payload.source_party } : {}),
        ...(payload.target_party ? { target_party: payload.target_party } : {}),
        ...(payload.comparison_basis ? { comparison_basis: payload.comparison_basis } : {}),
        ...(payload.value_basis ? { value_basis: payload.value_basis } : {}),
        ...(payload.rate_type ? { rate_type: payload.rate_type } : {}),
        ...(payload.pricing_binding_mode ? { pricing_binding_mode: payload.pricing_binding_mode } : {}),
      }));
    } catch {
      // Template fetch failed, keep the id anyway
    }
  };

  // --- Create / Update mutations ---
  const saveMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => {
      if (isEdit) {
        return apiRequest("PUT", apiUrl(`/api/v1/fee-plans/${params.id}`), body);
      }
      return apiRequest("POST", apiUrl("/api/v1/fee-plans"), body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fee-plans"] });
      // GAP-A20: Clear draft on successful save
      localStorage.removeItem(DRAFT_KEY);
      navigate("/operations/fee-plans");
    },
  });

  const previewMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiRequest("POST", apiUrl("/api/v1/fee-plans/compute-preview"), body),
    onSuccess: (data: any) => {
      setPreviewResult(data?.data ?? data);
    },
  });

  const handleSave = () => {
    const body: Record<string, unknown> = {
      fee_plan_code: form.fee_plan_code,
      fee_plan_name: form.fee_plan_name,
      description: form.description || undefined,
      charge_basis: form.charge_basis,
      fee_type: form.fee_type,
      source_party: form.source_party,
      target_party: form.target_party,
      comparison_basis: form.comparison_basis,
      value_basis: form.value_basis,
      pricing_binding_mode: form.pricing_binding_mode,
      rate_type: form.rate_type,
      effective_date: form.effective_date,
      min_charge_amount: form.min_charge_amount || "0",
      lower_threshold_pct: form.lower_threshold_pct || "0.050000",
      upper_threshold_pct: form.upper_threshold_pct || "0.400000",
      aum_basis_include_uitf: form.aum_basis_include_uitf,
      aum_basis_include_3p_funds: form.aum_basis_include_3p_funds,
      market_value_includes_accruals_override: form.market_value_includes_accruals_override,
    };

    if (form.jurisdiction_id) body.jurisdiction_id = parseInt(form.jurisdiction_id, 10);
    if (form.pricing_definition_id) body.pricing_definition_id = parseInt(form.pricing_definition_id, 10);
    if (form.eligibility_expression_id) body.eligibility_expression_id = parseInt(form.eligibility_expression_id, 10);
    if (form.accrual_schedule_id) body.accrual_schedule_id = parseInt(form.accrual_schedule_id, 10);
    if (form.template_id) body.template_id = parseInt(form.template_id, 10);
    if (form.event_type) body.event_type = form.event_type;
    if (form.max_charge_amount) body.max_charge_amount = form.max_charge_amount;
    if (form.expiry_date) body.expiry_date = form.expiry_date;

    saveMut.mutate(body);
  };

  const handlePreview = () => {
    if (!isEdit && !params.id) return;
    previewMut.mutate({
      fee_plan_id: parseInt(params.id!, 10),
      aum_value: previewAum ? parseFloat(previewAum) : undefined,
      transaction_amount: previewTxn ? parseFloat(previewTxn) : undefined,
    });
  };

  // For new plans, preview needs a saved plan. Show message instead.
  const canPreview = isEdit && !!params.id;

  const isPeriod = form.charge_basis === "PERIOD";

  // Effective step count (skip step 3 for EVENT)
  const effectiveSteps = isPeriod ? STEPS : STEPS.filter((_, i) => i !== 2);
  const currentStepIndex = isPeriod ? step : step >= 2 ? step + 1 : step;

  const goNext = () => {
    if (step < effectiveSteps.length - 1) setStep(step + 1);
  };
  const goPrev = () => {
    if (step > 0) setStep(step - 1);
  };

  const updateField = (field: keyof FeePlanForm, value: any) => {
    setForm((f) => ({ ...f, [field]: value }));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/operations/fee-plans")}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {isEdit ? "Edit Fee Plan" : "New Fee Plan"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {isEdit
                ? `Editing ${form.fee_plan_code || "..."}`
                : "Create a new fee plan configuration"}
            </p>
          </div>
        </div>
        {/* GAP-A20: Discard Draft button */}
        {!isEdit && hasDraft && (
          <Button variant="outline" size="sm" onClick={discardDraft} className="text-destructive border-destructive/50">
            Discard Draft
          </Button>
        )}
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-1">
        {effectiveSteps.map((s, i) => {
          const Icon = s.icon;
          const isActive = i === step;
          const isCompleted = i < step;
          return (
            <div key={s.key} className="flex items-center gap-1">
              {i > 0 && (
                <div
                  className={`h-0.5 w-8 ${
                    isCompleted ? "bg-primary" : "bg-muted"
                  }`}
                />
              )}
              <button
                onClick={() => setStep(i)}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : isCompleted
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {isCompleted ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Icon className="h-4 w-4" />
                )}
                <span className="hidden sm:inline">{s.label}</span>
              </button>
            </div>
          );
        })}
      </div>

      {/* Step Content */}
      <Card>
        <CardContent className="pt-6">
          {/* ----- Step 1: Basics ----- */}
          {currentStepIndex === 0 && (
            <div className="space-y-5">
              <h2 className="text-lg font-semibold">Basic Information</h2>

              {/* Template selector */}
              <div className="space-y-1">
                <Label className="text-sm">Template (optional)</Label>
                <Select
                  value={form.template_id || "none"}
                  onValueChange={(v) => handleTemplateSelect(v === "none" ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a template to pre-fill..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No template</SelectItem>
                    {(templatesQ.data?.data ?? [])
                      .filter((t: any) => t.is_active)
                      .map((t: any) => (
                        <SelectItem key={t.id} value={String(t.id)}>
                          {t.template_code} -- {t.template_name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Fee Plan Code *</Label>
                  <Input
                    value={form.fee_plan_code}
                    onChange={(e) => updateField("fee_plan_code", e.target.value)}
                    placeholder="e.g. FP-CUSTODY-PH-01"
                    disabled={isEdit}
                  />
                  {isEdit && (
                    <p className="text-xs text-muted-foreground">Code cannot be changed after creation.</p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label>Fee Plan Name *</Label>
                  <Input
                    value={form.fee_plan_name}
                    onChange={(e) => updateField("fee_plan_name", e.target.value)}
                    placeholder="e.g. Custody Fee - Philippines"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label>Description</Label>
                <Textarea
                  value={form.description}
                  onChange={(e) => updateField("description", e.target.value)}
                  placeholder="Brief description of this fee plan..."
                  rows={2}
                />
              </div>

              {/* Charge Basis */}
              <div className="space-y-2">
                <Label>Charge Basis *</Label>
                <div className="flex gap-3">
                  {["PERIOD", "EVENT"].map((cb) => (
                    <button
                      key={cb}
                      onClick={() => updateField("charge_basis", cb)}
                      className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                        form.charge_basis === cb
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-muted bg-background text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {cb}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {/* Fee Type */}
                <div className="space-y-1">
                  <Label>Fee Type *</Label>
                  <Select value={form.fee_type} onValueChange={(v) => updateField("fee_type", v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FEE_TYPES.map((ft) => (
                        <SelectItem key={ft.value} value={ft.value}>{ft.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Jurisdiction */}
                <div className="space-y-1">
                  <Label>Jurisdiction</Label>
                  <Select
                    value={form.jurisdiction_id || "none"}
                    onValueChange={(v) => updateField("jurisdiction_id", v === "none" ? "" : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select jurisdiction..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="1">PH - Philippines</SelectItem>
                      <SelectItem value="2">SG - Singapore</SelectItem>
                      <SelectItem value="3">ID - Indonesia</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Source Party */}
                <div className="space-y-1">
                  <Label>Source Party *</Label>
                  <Select value={form.source_party} onValueChange={(v) => updateField("source_party", v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SOURCE_PARTIES.map((sp) => (
                        <SelectItem key={sp.value} value={sp.value}>{sp.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Target Party */}
                <div className="space-y-1">
                  <Label>Target Party *</Label>
                  <Select value={form.target_party} onValueChange={(v) => updateField("target_party", v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TARGET_PARTIES.map((tp) => (
                        <SelectItem key={tp.value} value={tp.value}>{tp.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Event Type — only when charge_basis=EVENT */}
              {form.charge_basis === "EVENT" && (
                <div className="space-y-1">
                  <Label>Event Type *</Label>
                  <Select value={form.event_type || "none"} onValueChange={(v) => updateField("event_type", v === "none" ? "" : v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select event type..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Select...</SelectItem>
                      {EVENT_TYPES.map((et) => (
                        <SelectItem key={et.value} value={et.value}>{et.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

          {/* ----- Step 2: Pricing & Eligibility ----- */}
          {currentStepIndex === 1 && (
            <div className="space-y-5">
              <h2 className="text-lg font-semibold">Pricing & Eligibility</h2>

              {/* Pricing Definition */}
              <div className="space-y-1">
                <Label>Pricing Definition</Label>
                <Select
                  value={form.pricing_definition_id || "none"}
                  onValueChange={(v) => updateField("pricing_definition_id", v === "none" ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select pricing definition..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {(pricingDefsQ.data?.data ?? []).map((pd: any) => (
                      <SelectItem key={pd.id} value={String(pd.id)}>
                        {pd.pricing_code} -- {pd.pricing_name} ({pd.pricing_type.replace(/_/g, " ")})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Pricing Def Preview */}
              {selectedPricingDef && (
                <Card className="bg-muted/50">
                  <CardContent className="pt-4">
                    <div className="grid gap-2 text-sm sm:grid-cols-3">
                      <div>
                        <span className="text-muted-foreground">Type:</span>{" "}
                        <span className="font-medium">{selectedPricingDef.pricing_type?.replace(/_/g, " ")}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Currency:</span>{" "}
                        <span className="font-medium">{selectedPricingDef.currency}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Version:</span>{" "}
                        <span className="font-mono font-medium">v{selectedPricingDef.pricing_version}</span>
                      </div>
                    </div>
                    {selectedPricingDef.pricing_tiers && (selectedPricingDef.pricing_tiers as any[]).length > 0 && (
                      <div className="mt-3">
                        <p className="text-xs font-medium text-muted-foreground mb-1">Tiers:</p>
                        <div className="overflow-x-auto rounded border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-xs">From</TableHead>
                                <TableHead className="text-xs">To</TableHead>
                                <TableHead className="text-xs">Rate/Amount</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {(selectedPricingDef.pricing_tiers as any[]).map((tier: any, i: number) => (
                                <TableRow key={i}>
                                  <TableCell className="text-xs">{fmtPHP(tier.from ?? 0)}</TableCell>
                                  <TableCell className="text-xs">{tier.to ? fmtPHP(tier.to) : "Unlimited"}</TableCell>
                                  <TableCell className="text-xs font-mono">
                                    {tier.rate != null ? `${tier.rate}%` : fmtPHP(tier.amount ?? 0)}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Pricing Binding Mode */}
              <div className="space-y-2">
                <Label>Pricing Binding Mode</Label>
                <div className="flex gap-3">
                  {["STRICT", "LATEST_APPROVED"].map((mode) => (
                    <button
                      key={mode}
                      onClick={() => updateField("pricing_binding_mode", mode)}
                      className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                        form.pricing_binding_mode === mode
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-muted bg-background text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {mode.replace(/_/g, " ")}
                    </button>
                  ))}
                </div>
                {form.pricing_binding_mode === "LATEST_APPROVED" && (
                  <div className="flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>
                      LATEST_APPROVED mode means this plan will automatically use the latest active pricing version.
                      This may lead to unexpected fee changes without explicit re-binding.
                    </span>
                  </div>
                )}
              </div>

              <Separator />

              {/* Eligibility Expression */}
              <div className="space-y-1">
                <Label>Eligibility Expression</Label>
                <Select
                  value={form.eligibility_expression_id || "none"}
                  onValueChange={(v) => updateField("eligibility_expression_id", v === "none" ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select eligibility expression..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None (all eligible)</SelectItem>
                    {(eligibilityExprsQ.data?.data ?? []).map((ee: any) => (
                      <SelectItem key={ee.id} value={String(ee.id)}>
                        {ee.eligibility_code} -- {ee.eligibility_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Eligibility preview */}
              {selectedEligibility && (
                <Card className="bg-muted/50">
                  <CardContent className="pt-4">
                    <p className="text-sm">
                      <span className="text-muted-foreground">Expression:</span>{" "}
                      <code className="text-xs bg-muted px-1 py-0.5 rounded">
                        {JSON.stringify(selectedEligibility.expression).slice(0, 200)}
                        {JSON.stringify(selectedEligibility.expression).length > 200 ? "..." : ""}
                      </code>
                    </p>
                  </CardContent>
                </Card>
              )}

              <Separator />

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Comparison Basis *</Label>
                  <Select value={form.comparison_basis} onValueChange={(v) => updateField("comparison_basis", v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COMPARISON_BASES.map((cb) => (
                        <SelectItem key={cb.value} value={cb.value}>{cb.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Value Basis *</Label>
                  <Select value={form.value_basis} onValueChange={(v) => updateField("value_basis", v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {VALUE_BASES.map((vb) => (
                        <SelectItem key={vb.value} value={vb.value}>{vb.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          {/* ----- Step 3: Schedule & Thresholds (only for PERIOD) ----- */}
          {currentStepIndex === 2 && isPeriod && (
            <div className="space-y-5">
              <h2 className="text-lg font-semibold">Schedule & Thresholds</h2>

              {/* Accrual Schedule */}
              <div className="space-y-1">
                <Label>Accrual Schedule *</Label>
                <Select
                  value={form.accrual_schedule_id || "none"}
                  onValueChange={(v) => updateField("accrual_schedule_id", v === "none" ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select accrual schedule..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {(accrualSchedulesQ.data?.data ?? []).map((as_: any) => (
                      <SelectItem key={as_.id} value={String(as_.id)}>
                        {as_.schedule_code} -- {as_.schedule_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Schedule Preview */}
              {selectedSchedule && (
                <Card className="bg-muted/50">
                  <CardContent className="pt-4">
                    <div className="grid gap-2 text-sm sm:grid-cols-3">
                      <div>
                        <span className="text-muted-foreground">Accrual Freq:</span>{" "}
                        <span className="font-medium">{selectedSchedule.accrual_frequency?.replace(/_/g, " ") ?? "N/A"}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Invoice Freq:</span>{" "}
                        <span className="font-medium">{selectedSchedule.invoice_frequency?.replace(/_/g, " ") ?? "N/A"}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Method:</span>{" "}
                        <span className="font-medium">{selectedSchedule.accrual_method ?? "N/A"}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              <Separator />

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Rate Type</Label>
                  <Select value={form.rate_type} onValueChange={(v) => updateField("rate_type", v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RATE_TYPES.map((rt) => (
                        <SelectItem key={rt.value} value={rt.value}>{rt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Min Charge Amount (PHP)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.min_charge_amount}
                    onChange={(e) => updateField("min_charge_amount", e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Max Charge Amount (PHP)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.max_charge_amount}
                    onChange={(e) => updateField("max_charge_amount", e.target.value)}
                    placeholder="No maximum"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Lower Threshold %</Label>
                  <div className="relative">
                    <Input
                      type="number"
                      step="0.000001"
                      value={form.lower_threshold_pct}
                      onChange={(e) => updateField("lower_threshold_pct", e.target.value)}
                      placeholder="0.050000"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Upper Threshold %</Label>
                  <div className="relative">
                    <Input
                      type="number"
                      step="0.000001"
                      value={form.upper_threshold_pct}
                      onChange={(e) => updateField("upper_threshold_pct", e.target.value)}
                      placeholder="0.400000"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                  </div>
                </div>
              </div>

              <Separator />

              {/* AUM Toggles */}
              <h3 className="text-sm font-semibold text-muted-foreground">AUM Basis Options</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Include UITF in AUM</Label>
                  <Switch
                    checked={form.aum_basis_include_uitf}
                    onCheckedChange={(v) => updateField("aum_basis_include_uitf", v)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Include 3rd Party Funds in AUM</Label>
                  <Switch
                    checked={form.aum_basis_include_3p_funds}
                    onCheckedChange={(v) => updateField("aum_basis_include_3p_funds", v)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Market Value Includes Accruals (Override)</Label>
                  <Switch
                    checked={form.market_value_includes_accruals_override}
                    onCheckedChange={(v) => updateField("market_value_includes_accruals_override", v)}
                  />
                </div>
              </div>

              <Separator />

              {/* Dates */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Effective Date *</Label>
                  <Input
                    type="date"
                    value={form.effective_date}
                    onChange={(e) => updateField("effective_date", e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Expiry Date</Label>
                  <Input
                    type="date"
                    value={form.expiry_date}
                    onChange={(e) => updateField("expiry_date", e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ----- Step 4 (or 3 for EVENT): Review & Preview ----- */}
          {currentStepIndex === 3 && (
            <div className="space-y-5">
              <h2 className="text-lg font-semibold">Review & Preview</h2>

              {/* Read-only summary */}
              <Card className="bg-muted/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Fee Plan Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableBody>
                        <SummaryRow label="Fee Plan Code" value={form.fee_plan_code} />
                        <SummaryRow label="Fee Plan Name" value={form.fee_plan_name} />
                        <SummaryRow label="Description" value={form.description || "--"} />
                        <SummaryRow label="Charge Basis" value={form.charge_basis} />
                        <SummaryRow label="Fee Type" value={labelFor(FEE_TYPES, form.fee_type)} />
                        <SummaryRow label="Source Party" value={labelFor(SOURCE_PARTIES, form.source_party)} />
                        <SummaryRow label="Target Party" value={labelFor(TARGET_PARTIES, form.target_party)} />
                        <SummaryRow label="Comparison Basis" value={labelFor(COMPARISON_BASES, form.comparison_basis)} />
                        <SummaryRow label="Value Basis" value={labelFor(VALUE_BASES, form.value_basis)} />
                        <SummaryRow
                          label="Pricing Definition"
                          value={selectedPricingDef ? `${selectedPricingDef.pricing_code} (${selectedPricingDef.pricing_type.replace(/_/g, " ")})` : "None"}
                        />
                        <SummaryRow label="Pricing Binding" value={form.pricing_binding_mode.replace(/_/g, " ")} />
                        <SummaryRow
                          label="Eligibility"
                          value={selectedEligibility ? selectedEligibility.eligibility_code : "None (all eligible)"}
                        />
                        {form.charge_basis === "EVENT" && (
                          <SummaryRow label="Event Type" value={form.event_type ? labelFor(EVENT_TYPES, form.event_type) : "--"} />
                        )}
                        {isPeriod && (
                          <>
                            <SummaryRow
                              label="Accrual Schedule"
                              value={selectedSchedule ? selectedSchedule.schedule_code : "None"}
                            />
                            <SummaryRow label="Rate Type" value={labelFor(RATE_TYPES, form.rate_type)} />
                            <SummaryRow label="Min Charge" value={fmtPHP(form.min_charge_amount)} />
                            <SummaryRow label="Max Charge" value={form.max_charge_amount ? fmtPHP(form.max_charge_amount) : "No max"} />
                            <SummaryRow label="Lower Threshold" value={`${form.lower_threshold_pct}%`} />
                            <SummaryRow label="Upper Threshold" value={`${form.upper_threshold_pct}%`} />
                            <SummaryRow label="Include UITF" value={form.aum_basis_include_uitf ? "Yes" : "No"} />
                            <SummaryRow label="Include 3P Funds" value={form.aum_basis_include_3p_funds ? "Yes" : "No"} />
                            <SummaryRow label="MV Includes Accruals" value={form.market_value_includes_accruals_override ? "Yes" : "No"} />
                          </>
                        )}
                        <SummaryRow label="Effective Date" value={form.effective_date} />
                        <SummaryRow label="Expiry Date" value={form.expiry_date || "None"} />
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              {/* Live Calculation Preview */}
              {canPreview && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Calculator className="h-4 w-4" />
                      Live Fee Calculation Preview
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div className="space-y-1">
                        <Label className="text-xs">AUM Value (PHP)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={previewAum}
                          onChange={(e) => setPreviewAum(e.target.value)}
                          placeholder="e.g. 10000000"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Transaction Amount (PHP)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={previewTxn}
                          onChange={(e) => setPreviewTxn(e.target.value)}
                          placeholder="e.g. 500000"
                        />
                      </div>
                      <div className="flex items-end">
                        <Button
                          size="sm"
                          onClick={handlePreview}
                          disabled={previewMut.isPending}
                        >
                          <Calculator className="mr-1 h-3 w-3" />
                          {previewMut.isPending ? "Calculating..." : "Calculate Preview"}
                        </Button>
                      </div>
                    </div>

                    {previewResult && (
                      <div className="space-y-3">
                        <div className="flex items-center gap-4">
                          <div className="rounded-lg bg-primary/10 px-4 py-3">
                            <p className="text-xs text-muted-foreground">Computed Fee</p>
                            <p className="text-2xl font-bold text-primary">
                              {fmtPHP(previewResult.computed_fee)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Pricing Type</p>
                            <Badge variant="outline">{previewResult.pricing_type?.replace(/_/g, " ")}</Badge>
                          </div>
                          {previewResult.eligibility_result !== null && (
                            <div>
                              <p className="text-xs text-muted-foreground">Eligible</p>
                              <Badge className={previewResult.eligibility_result ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}>
                                {previewResult.eligibility_result ? "Yes" : "No"}
                              </Badge>
                            </div>
                          )}
                        </div>

                        {previewResult.breakdown && previewResult.breakdown.length > 0 && (
                          <div className="overflow-x-auto rounded-md border">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="text-xs">Tier</TableHead>
                                  <TableHead className="text-xs">From</TableHead>
                                  <TableHead className="text-xs">To</TableHead>
                                  <TableHead className="text-xs">Rate/Amount</TableHead>
                                  <TableHead className="text-xs text-right">Computed</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {previewResult.breakdown.map((b: any, i: number) => (
                                  <TableRow key={i}>
                                    <TableCell className="text-xs font-mono">{b.tier}</TableCell>
                                    <TableCell className="text-xs">{fmtPHP(b.from)}</TableCell>
                                    <TableCell className="text-xs">{fmtPHP(b.to)}</TableCell>
                                    <TableCell className="text-xs font-mono">
                                      {previewResult.pricing_type?.includes("RATE") || previewResult.pricing_type === "FIXED_RATE"
                                        ? `${b.rate_or_amount}%`
                                        : fmtPHP(b.rate_or_amount)}
                                    </TableCell>
                                    <TableCell className="text-xs text-right font-mono">
                                      {fmtPHP(b.computed)}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </div>
                    )}

                    {previewMut.error && (
                      <div className="rounded-md border border-destructive p-3">
                        <p className="text-sm text-destructive">
                          {(previewMut.error as any)?.message ?? "Preview calculation failed"}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {!canPreview && (
                <Card className="bg-muted/30">
                  <CardContent className="pt-4">
                    <p className="text-sm text-muted-foreground">
                      Save the fee plan first, then return to edit mode to use the live calculation preview.
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={goPrev} disabled={step === 0}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Previous
        </Button>

        <div className="flex items-center gap-2">
          {step === effectiveSteps.length - 1 ? (
            <Button onClick={handleSave} disabled={saveMut.isPending}>
              <Save className="mr-1 h-4 w-4" />
              {saveMut.isPending
                ? "Saving..."
                : isEdit
                  ? "Update Fee Plan"
                  : "Save as Draft"}
            </Button>
          ) : (
            <Button onClick={goNext}>
              Next <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Save error */}
      {saveMut.error && (
        <Card className="border-destructive">
          <CardContent className="pt-4">
            <p className="text-sm text-destructive">
              {(saveMut.error as any)?.message ?? "Failed to save fee plan"}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ---------- Helper sub-component ---------- */
function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <TableRow>
      <TableCell className="text-sm font-medium text-muted-foreground w-48">{label}</TableCell>
      <TableCell className="text-sm">{value}</TableCell>
    </TableRow>
  );
}
