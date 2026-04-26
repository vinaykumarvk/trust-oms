/**
 * Enterprise GL Dashboard — General Ledger Management
 *
 * Chart of Accounts, journal posting, batch management, GL drilldown,
 * financial reports, FX revaluation, year-end processing, and FRPTI.
 * Auto-refreshes every 30 seconds.
 */
import { useState, useMemo, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@ui/lib/queryClient";
import { apiUrl } from "@ui/lib/api-url";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@ui/components/ui/card";
import { Badge } from "@ui/components/ui/badge";
import { Button } from "@ui/components/ui/button";
import { Input } from "@ui/components/ui/input";
import { Separator } from "@ui/components/ui/separator";
import { Skeleton } from "@ui/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@ui/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ui/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@ui/components/ui/table";
import {
  BookOpen, Layers, PenLine, FolderTree, Search, BarChart3, RefreshCw, Plus,
  Check, X, Ban, ArrowRightLeft, Calendar, FileText, Download, Play,
  AlertTriangle, ChevronRight, DollarSign, Building2, ClipboardList,
  Calculator, TrendingUp, Lock, Unlock, Landmark,
  Settings, Shield, Clock, RotateCcw, Percent, Users,
} from "lucide-react";

/* ---------- Types ---------- */
interface GLHead {
  id: string; code: string; name: string; gl_type: string;
  category_name?: string; category_id?: string; hierarchy_id?: string;
  status: string; currency_restriction?: string; opening_date: string;
  is_manual_posting_allowed?: boolean; is_revaluation_enabled?: boolean;
  description?: string;
}
interface GLCategory {
  id: string; code: string; name: string; category_type: string;
  is_reportable?: boolean; is_budgetable?: boolean;
}
interface GLHierarchyNode {
  id: string; code: string; name: string; parent_id?: string;
  level: number; sort_order?: number;
}
interface JournalBatch {
  id: string; batch_ref: string; source: string; event_type?: string;
  posting_mode: string; status: string; transaction_date: string;
  total_debit: number; total_credit: number; line_count?: number;
  maker?: string; checker?: string;
}
interface JournalLine {
  id: string; dr_cr: string; gl_head_code: string; gl_head_name?: string;
  amount: number; currency: string; narration?: string;
}
interface BatchDetail extends JournalBatch { lines: JournalLine[]; }
interface DrilldownResult {
  opening_balance: number; debit_turnover: number;
  credit_turnover: number; closing_balance: number;
  lines: Array<{
    id: string; batch_ref: string; transaction_date: string;
    value_date: string; dr_cr: string; amount: number;
    currency: string; narration?: string;
  }>;
}
interface TrialBalanceRow {
  gl_code: string; gl_name: string; debit_balance: number;
  credit_balance: number;
}
interface BalanceSheetRow {
  category: string; gl_code: string; gl_name: string; balance: number;
}
interface IncomeStatementRow {
  category: string; gl_code: string; gl_name: string; amount: number;
}
interface FXRate {
  id: string; from_currency: string; to_currency: string;
  rate: number; rate_date: string; source?: string;
}
interface RevalRun {
  id: string; run_date: string; status: string; gl_entries_count: number;
  total_gain_loss: number; created_at: string;
}
interface FinancialYear {
  id: string; year_label: string; start_date: string; end_date: string;
  status: string; closed_at?: string;
}
interface FRPTIMapping {
  id: string; schedule: string; bsp_code: string;
  gl_code: string; gl_name?: string; description?: string;
}
interface AccountingUnit {
  id: string; code: string; name: string;
}
interface GLException {
  id: string; batch_ref?: string; error_type: string;
  message: string; created_at: string; status: string;
}
interface GLSummary {
  total_gl_heads: number; today_postings: number;
  pending_auth: number; posting_exceptions: number;
}
interface AuthMatrixEntry {
  id: string; entity_type: string; action: string;
  amount_from?: number; amount_to?: number;
  required_approvers: number; approval_level: number;
  role_required?: string; is_active: boolean;
}
interface AuthAuditEntry {
  id: string; object_type: string; object_id: string;
  action: string; actor_id: string; decision: string;
  reason?: string; amount?: number; created_at: string;
}
interface AccrualSchedule {
  id: string; accrual_type: string; coupon_rate: number;
  face_value: number; day_count_convention: string;
  accrual_frequency: string; effective_from: string;
  effective_to?: string; fund_id?: string; security_id?: string;
}
interface AmortizationSchedule {
  id: string; amortization_method: string; purchase_price: number;
  par_value: number; premium_discount: number;
  total_periods: number; periods_elapsed: number;
  amortized_amount: number; remaining_amount: number;
  maturity_date: string; fund_id?: string; security_id?: string;
}
interface EodRun {
  id: string; business_date: string; status: string;
  started_at: string; completed_at?: string;
  rollback_status?: string;
}
interface EodJobDetail {
  id: string; job_name: string; status: string;
  retry_count: number; max_retries: number;
  started_at?: string; completed_at?: string;
  error_message?: string;
}
interface FinancialPeriod {
  id: string; period_label: string; start_date: string;
  end_date: string; is_closed: boolean; closed_at?: string;
}
interface ReportDefinition {
  id: string; name: string; description?: string;
  columns: unknown[]; filters?: unknown[];
  created_at: string;
}

/* ---------- Helpers ---------- */
const GL_TYPE_COLORS: Record<string, string> = {
  ASSET: "bg-blue-100 text-blue-800", LIABILITY: "bg-purple-100 text-purple-800",
  INCOME: "bg-green-100 text-green-800", EXPENDITURE: "bg-red-100 text-red-800",
  EQUITY: "bg-indigo-100 text-indigo-800",
};
const STATUS_COLORS: Record<string, string> = {
  OPEN: "bg-green-100 text-green-800", CLOSED: "bg-muted text-foreground",
  POSTED: "bg-green-100 text-green-800", PENDING_AUTH: "bg-yellow-100 text-yellow-800",
  REJECTED: "bg-red-100 text-red-800", CANCELLED: "bg-muted text-foreground",
  APPROVED: "bg-green-100 text-green-800", COMPLETED: "bg-green-100 text-green-800",
  FAILED: "bg-red-100 text-red-800", RUNNING: "bg-blue-100 text-blue-800",
  ACTIVE: "bg-green-100 text-green-800", DRAFT: "bg-yellow-100 text-yellow-800",
};
const BATCH_MODE_COLORS: Record<string, string> = {
  ONLINE: "bg-blue-100 text-blue-800", BATCH: "bg-purple-100 text-purple-800",
  MANUAL: "bg-orange-100 text-orange-800",
};
const fmtPHP = (n: number) => n.toLocaleString("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2 });
const fmtDate = (d: string) => { try { return new Date(d).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }); } catch { return d; } };
const fmtNum = (n: number) => n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const bc = (map: Record<string, string>, key: string) => map[key] ?? "bg-muted text-foreground";

function SummaryCard({ title, value, icon: Icon, accent }: { title: string; value: string | number; icon: React.ElementType; accent: string }) {
  return (
    <Card><CardContent className="pt-6"><div className="flex items-center justify-between">
      <div><p className="text-sm font-medium text-muted-foreground">{title}</p><p className="mt-1 text-2xl font-bold">{value}</p></div>
      <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${accent}`}><Icon className="h-5 w-5 text-white" /></div>
    </div></CardContent></Card>
  );
}
function SkeletonRows({ cols, rows = 5 }: { cols: number; rows?: number }) {
  return <>{Array.from({ length: rows }).map((_, i) => (
    <TableRow key={i}>{Array.from({ length: cols }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-16" /></TableCell>)}</TableRow>
  ))}</>;
}
function EmptyRow({ cols, msg }: { cols: number; msg: string }) {
  return <TableRow><TableCell colSpan={cols} className="py-8 text-center text-muted-foreground">{msg}</TableCell></TableRow>;
}

/* ========== Main Component ========== */
export default function GLDashboard() {
  const qc = useQueryClient();
  const location = useLocation();
  const pathTabMap: Record<string, string> = {
    "/accounting/chart-of-accounts": "coa",
    "/accounting/journal-entry": "journal",
    "/accounting/gl-drilldown": "drilldown",
    "/accounting/fx-revaluation": "fx",
    "/accounting/year-end": "yearend",
    "/accounting/frpti": "frpti",
    "/accounting/operations": "operations",
    "/accounting/accruals": "accruals",
    "/accounting/authorization": "authorization",
  };
  const initialTab = pathTabMap[location.pathname] || "overview";
  const [tab, setTab] = useState(initialTab);
  useEffect(() => {
    const mapped = pathTabMap[location.pathname];
    if (mapped && mapped !== tab) setTab(mapped);
  }, [location.pathname]);

  // --- Chart of Accounts state ---
  const [coaSearch, setCoaSearch] = useState("");
  const [coaTypeFilter, setCoaTypeFilter] = useState("ALL");
  const [coaStatusFilter, setCoaStatusFilter] = useState("ALL");
  const [createHeadOpen, setCreateHeadOpen] = useState(false);
  const [newHead, setNewHead] = useState({
    code: "", name: "", gl_type: "ASSET", category_id: "", hierarchy_id: "",
    currency_restriction: "", opening_date: "", is_manual_posting_allowed: true,
    is_revaluation_enabled: false, description: "",
  });

  // --- Category & Hierarchy state ---
  const [createCatOpen, setCreateCatOpen] = useState(false);
  const [newCat, setNewCat] = useState({ code: "", name: "", category_type: "ASSET", is_reportable: true, is_budgetable: false });
  const [createHierOpen, setCreateHierOpen] = useState(false);
  const [newHier, setNewHier] = useState({ code: "", name: "", parent_id: "", level: 1, sort_order: 0 });

  // --- Journal Entry state ---
  const [jeHeader, setJeHeader] = useState({ accounting_unit: "", transaction_date: "", value_date: "", narration: "" });
  const [jeLines, setJeLines] = useState<Array<{ dr_cr: string; gl_head: string; amount: string; currency: string; narration: string }>>([
    { dr_cr: "DR", gl_head: "", amount: "", currency: "PHP", narration: "" },
    { dr_cr: "CR", gl_head: "", amount: "", currency: "PHP", narration: "" },
  ]);

  // --- Batch state ---
  const [batchStatusFilter, setBatchStatusFilter] = useState("ALL");
  const [batchModeFilter, setBatchModeFilter] = useState("ALL");
  const [batchAuFilter, setBatchAuFilter] = useState("ALL");
  const [batchDateFrom, setBatchDateFrom] = useState("");
  const [batchDateTo, setBatchDateTo] = useState("");
  const [batchDetailOpen, setBatchDetailOpen] = useState(false);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);

  // --- Drilldown state ---
  const [ddAu, setDdAu] = useState("");
  const [ddGlCode, setDdGlCode] = useState("");
  const [ddFrom, setDdFrom] = useState("");
  const [ddTo, setDdTo] = useState("");
  const [ddTriggered, setDdTriggered] = useState(false);

  // --- Reports state ---
  const [reportSub, setReportSub] = useState("trial-balance");
  const [rptDate, setRptDate] = useState("");
  const [rptAu, setRptAu] = useState("");

  // --- FX & Revaluation state ---
  const [createFxOpen, setCreateFxOpen] = useState(false);
  const [newFx, setNewFx] = useState({ from_currency: "", to_currency: "PHP", rate: "", rate_date: "" });
  const [revalDate, setRevalDate] = useState("");

  // --- Year-End state ---
  const [yeSelectedYear, setYeSelectedYear] = useState("");
  const [yeConfirmOpen, setYeConfirmOpen] = useState(false);

  // --- FRPTI state ---
  const [frptiSchedule, setFrptiSchedule] = useState("ALL");
  const [frptiPeriod, setFrptiPeriod] = useState("");
  const [frptiComparePeriod1, setFrptiComparePeriod1] = useState("");
  const [frptiComparePeriod2, setFrptiComparePeriod2] = useState("");
  const [frptiAmendPeriod, setFrptiAmendPeriod] = useState("");
  const [frptiAmendReason, setFrptiAmendReason] = useState("");

  // --- Operations state ---
  const [sodDate, setSodDate] = useState("");
  const [eodRollbackRunId, setEodRollbackRunId] = useState("");
  const [eodRollbackReason, setEodRollbackReason] = useState("");

  // --- Accruals state ---
  const [accrualRunDate, setAccrualRunDate] = useState("");
  const [amortRunDate, setAmortRunDate] = useState("");

  // --- Authorization state ---
  const [createAuthMatrixOpen, setCreateAuthMatrixOpen] = useState(false);
  const [newAuthMatrix, setNewAuthMatrix] = useState({
    entity_type: "JOURNAL_BATCH", action: "APPROVE", amount_from: "",
    amount_to: "", required_approvers: "1", approval_level: "1", role_required: "",
  });

  // --- Period Management state ---
  const [createPeriodOpen, setCreatePeriodOpen] = useState(false);
  const [newPeriod, setNewPeriod] = useState({ period_label: "", start_date: "", end_date: "" });

  // =========================================================================
  // Queries
  // =========================================================================

  // Summary
  const summaryQ = useQuery<GLSummary>({
    queryKey: ["gl-summary"],
    queryFn: async () => {
      const [heads, batches, exceptions] = await Promise.all([
        apiRequest("GET", apiUrl("/api/v1/gl/gl-heads?status=OPEN")),
        apiRequest("GET", apiUrl("/api/v1/gl/posting/batches?status=PENDING_AUTH")),
        apiRequest("GET", apiUrl("/api/v1/gl/gl-exceptions?status=OPEN")),
      ]);
      const headList = heads?.data ?? heads ?? [];
      const batchList = batches?.data ?? batches ?? [];
      const excList = exceptions?.data ?? exceptions ?? [];
      return {
        total_gl_heads: Array.isArray(headList) ? headList.length : 0,
        today_postings: 0,
        pending_auth: Array.isArray(batchList) ? batchList.length : 0,
        posting_exceptions: Array.isArray(excList) ? excList.length : 0,
      };
    },
    refetchInterval: 30_000,
  });
  const sum = summaryQ.data ?? { total_gl_heads: 0, today_postings: 0, pending_auth: 0, posting_exceptions: 0 };

  // Recent batches (overview)
  const recentBatchesQ = useQuery<any>({
    queryKey: ["gl-recent-batches"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/gl/posting/batches?limit=20")),
    refetchInterval: 30_000, enabled: tab === "overview",
  });
  const recentBatches: JournalBatch[] = recentBatchesQ.data?.data ?? recentBatchesQ.data ?? [];

  // Exceptions (overview)
  const exceptionsQ = useQuery<any>({
    queryKey: ["gl-exceptions"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/gl/gl-exceptions")),
    refetchInterval: 30_000, enabled: tab === "overview",
  });
  const exceptions: GLException[] = exceptionsQ.data?.data ?? exceptionsQ.data ?? [];

  // GL Heads
  const glHeadsQ = useQuery<any>({
    queryKey: ["gl-heads"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/gl/gl-heads")),
    refetchInterval: 30_000, enabled: tab === "coa" || tab === "journal" || tab === "drilldown",
  });
  const glHeads: GLHead[] = glHeadsQ.data?.data ?? glHeadsQ.data ?? [];

  const filteredHeads = useMemo(() => {
    let list = glHeads;
    if (coaSearch) {
      const s = coaSearch.toLowerCase();
      list = list.filter((h) => h.code.toLowerCase().includes(s) || h.name.toLowerCase().includes(s));
    }
    if (coaTypeFilter !== "ALL") list = list.filter((h) => h.gl_type === coaTypeFilter);
    if (coaStatusFilter !== "ALL") list = list.filter((h) => h.status === coaStatusFilter);
    return list;
  }, [glHeads, coaSearch, coaTypeFilter, coaStatusFilter]);

  // Categories
  const categoriesQ = useQuery<any>({
    queryKey: ["gl-categories"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/gl/gl-categories")),
    refetchInterval: 30_000, enabled: tab === "categories" || tab === "coa",
  });
  const categories: GLCategory[] = categoriesQ.data?.data ?? categoriesQ.data ?? [];

  // Hierarchy
  const hierarchyQ = useQuery<any>({
    queryKey: ["gl-hierarchy"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/gl/gl-hierarchy")),
    refetchInterval: 30_000, enabled: tab === "categories",
  });
  const hierarchy: GLHierarchyNode[] = hierarchyQ.data?.data ?? hierarchyQ.data ?? [];

  // Accounting Units
  const auQ = useQuery<any>({
    queryKey: ["gl-accounting-units"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/gl/accounting-units")),
    refetchInterval: 60_000,
  });
  const accountingUnits: AccountingUnit[] = auQ.data?.data ?? auQ.data ?? [];

  // Batches (tab)
  const batchesQ = useQuery<any>({
    queryKey: ["gl-batches", batchStatusFilter, batchModeFilter, batchAuFilter, batchDateFrom, batchDateTo],
    queryFn: () => {
      const p = new URLSearchParams();
      if (batchStatusFilter !== "ALL") p.set("status", batchStatusFilter);
      if (batchModeFilter !== "ALL") p.set("posting_mode", batchModeFilter);
      if (batchAuFilter !== "ALL") p.set("accounting_unit", batchAuFilter);
      if (batchDateFrom) p.set("from_date", batchDateFrom);
      if (batchDateTo) p.set("to_date", batchDateTo);
      return apiRequest("GET", apiUrl(`/api/v1/gl/posting/batches${p.toString() ? `?${p}` : ""}`));
    },
    refetchInterval: 30_000, enabled: tab === "batches",
  });
  const batches: JournalBatch[] = batchesQ.data?.data ?? batchesQ.data ?? [];

  // Batch detail
  const batchDetailQ = useQuery<BatchDetail>({
    queryKey: ["gl-batch-detail", selectedBatchId],
    queryFn: () => apiRequest("GET", apiUrl(`/api/v1/gl/posting/batches/${selectedBatchId}`)),
    enabled: !!selectedBatchId && batchDetailOpen,
  });

  // Drilldown
  const drilldownQ = useQuery<DrilldownResult>({
    queryKey: ["gl-drilldown", ddAu, ddGlCode, ddFrom, ddTo],
    queryFn: () => {
      const p = new URLSearchParams();
      if (ddAu) p.set("accounting_unit", ddAu);
      if (ddGlCode) p.set("gl_access_code", ddGlCode);
      if (ddFrom) p.set("from_date", ddFrom);
      if (ddTo) p.set("to_date", ddTo);
      return apiRequest("GET", apiUrl(`/api/v1/gl/ledger/gl-drilldown?${p}`));
    },
    enabled: tab === "drilldown" && ddTriggered && !!ddGlCode,
  });

  // Trial Balance
  const trialBalQ = useQuery<any>({
    queryKey: ["gl-trial-balance", rptDate, rptAu],
    queryFn: () => {
      const p = new URLSearchParams();
      if (rptDate) p.set("as_of_date", rptDate);
      if (rptAu) p.set("accounting_unit", rptAu);
      return apiRequest("GET", apiUrl(`/api/v1/gl/ledger/trial-balance?${p}`));
    },
    enabled: tab === "reports" && reportSub === "trial-balance" && !!rptDate,
  });
  const trialBal: TrialBalanceRow[] = trialBalQ.data?.data ?? trialBalQ.data ?? [];

  // Balance Sheet
  const balSheetQ = useQuery<any>({
    queryKey: ["gl-balance-sheet", rptDate, rptAu],
    queryFn: () => {
      const p = new URLSearchParams();
      if (rptDate) p.set("as_of_date", rptDate);
      if (rptAu) p.set("accounting_unit", rptAu);
      return apiRequest("GET", apiUrl(`/api/v1/gl/ledger/balance-sheet?${p}`));
    },
    enabled: tab === "reports" && reportSub === "balance-sheet" && !!rptDate,
  });
  const balSheet: BalanceSheetRow[] = balSheetQ.data?.data ?? balSheetQ.data ?? [];

  // Income Statement
  const incStmtQ = useQuery<any>({
    queryKey: ["gl-income-statement", rptDate, rptAu],
    queryFn: () => {
      const p = new URLSearchParams();
      if (rptDate) p.set("as_of_date", rptDate);
      if (rptAu) p.set("accounting_unit", rptAu);
      return apiRequest("GET", apiUrl(`/api/v1/gl/ledger/income-statement?${p}`));
    },
    enabled: tab === "reports" && reportSub === "income-statement" && !!rptDate,
  });
  const incStmt: IncomeStatementRow[] = incStmtQ.data?.data ?? incStmtQ.data ?? [];

  // FX Rates
  const fxRatesQ = useQuery<any>({
    queryKey: ["gl-fx-rates"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/gl/fx-rates")),
    refetchInterval: 30_000, enabled: tab === "fx",
  });
  const fxRates: FXRate[] = fxRatesQ.data?.data ?? fxRatesQ.data ?? [];

  // Revaluation Runs
  const revalRunsQ = useQuery<any>({
    queryKey: ["gl-reval-runs"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/gl/fx-revaluation/runs")),
    refetchInterval: 30_000, enabled: tab === "fx",
  });
  const revalRuns: RevalRun[] = revalRunsQ.data?.data ?? revalRunsQ.data ?? [];

  // Financial Years
  const finYearsQ = useQuery<any>({
    queryKey: ["gl-financial-years"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/gl/financial-years")),
    refetchInterval: 30_000, enabled: tab === "yearend",
  });
  const finYears: FinancialYear[] = finYearsQ.data?.data ?? finYearsQ.data ?? [];

  // FRPTI Mappings
  const frptiQ = useQuery<any>({
    queryKey: ["gl-frpti-mappings"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/gl/frpti-mappings")),
    refetchInterval: 30_000, enabled: tab === "frpti",
  });
  const frptiMappings: FRPTIMapping[] = frptiQ.data?.data ?? frptiQ.data ?? [];

  const filteredFrpti = useMemo(() => {
    if (frptiSchedule === "ALL") return frptiMappings;
    return frptiMappings.filter((m) => m.schedule === frptiSchedule);
  }, [frptiMappings, frptiSchedule]);

  // Auth Matrix
  const authMatrixQ = useQuery<any>({
    queryKey: ["gl-auth-matrix"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/gl/auth-matrix")),
    refetchInterval: 30_000, enabled: tab === "authorization",
  });
  const authMatrix: AuthMatrixEntry[] = authMatrixQ.data?.data ?? authMatrixQ.data ?? [];

  // Pending Approvals
  const authPendingQ = useQuery<any>({
    queryKey: ["gl-auth-pending"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/gl/posting/batches?status=PENDING_AUTH")),
    refetchInterval: 15_000, enabled: tab === "authorization",
  });
  const authPendingBatches: JournalBatch[] = authPendingQ.data?.data ?? authPendingQ.data ?? [];

  // Accrual Schedules
  const accrualSchedulesQ = useQuery<any>({
    queryKey: ["gl-accrual-schedules"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/gl/accruals/schedules")),
    refetchInterval: 30_000, enabled: tab === "accruals",
  });
  const accrualSchedules: AccrualSchedule[] = accrualSchedulesQ.data?.data ?? accrualSchedulesQ.data ?? [];

  // Amortization Schedules
  const amortSchedulesQ = useQuery<any>({
    queryKey: ["gl-amort-schedules"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/gl/amortization/schedules")),
    refetchInterval: 30_000, enabled: tab === "accruals",
  });
  const amortSchedules: AmortizationSchedule[] = amortSchedulesQ.data?.data ?? amortSchedulesQ.data ?? [];

  // EOD Runs
  const eodRunsQ = useQuery<any>({
    queryKey: ["gl-eod-runs"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/gl/eod/runs")),
    refetchInterval: 15_000, enabled: tab === "operations",
  });
  const eodRuns: EodRun[] = eodRunsQ.data?.data ?? eodRunsQ.data ?? [];

  // Financial Periods
  const finPeriodsQ = useQuery<any>({
    queryKey: ["gl-financial-periods"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/gl/financial-periods")),
    refetchInterval: 30_000, enabled: tab === "yearend",
  });
  const financialPeriods: FinancialPeriod[] = finPeriodsQ.data?.data ?? finPeriodsQ.data ?? [];

  // Report Definitions
  const reportDefsQ = useQuery<any>({
    queryKey: ["gl-report-definitions"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/gl/report-definitions")),
    refetchInterval: 30_000, enabled: tab === "reports",
  });
  const reportDefs: ReportDefinition[] = reportDefsQ.data?.data ?? reportDefsQ.data ?? [];

  // =========================================================================
  // Mutations
  // =========================================================================

  const createHeadMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiRequest("POST", apiUrl("/api/v1/gl/gl-heads"), body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["gl-heads"] }); qc.invalidateQueries({ queryKey: ["gl-summary"] }); setCreateHeadOpen(false); },
  });

  const closeHeadMut = useMutation({
    mutationFn: (id: string) => apiRequest("POST", apiUrl(`/api/v1/gl/gl-heads/${id}/close`)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["gl-heads"] }); qc.invalidateQueries({ queryKey: ["gl-summary"] }); },
  });

  const createCatMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiRequest("POST", apiUrl("/api/v1/gl/gl-categories"), body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["gl-categories"] }); setCreateCatOpen(false); },
  });

  const createHierMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiRequest("POST", apiUrl("/api/v1/gl/gl-hierarchy"), body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["gl-hierarchy"] }); setCreateHierOpen(false); },
  });

  const createJournalMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiRequest("POST", apiUrl("/api/v1/gl/posting/journals/manual"), body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gl-batches"] });
      qc.invalidateQueries({ queryKey: ["gl-recent-batches"] });
      qc.invalidateQueries({ queryKey: ["gl-summary"] });
      setJeHeader({ accounting_unit: "", transaction_date: "", value_date: "", narration: "" });
      setJeLines([
        { dr_cr: "DR", gl_head: "", amount: "", currency: "PHP", narration: "" },
        { dr_cr: "CR", gl_head: "", amount: "", currency: "PHP", narration: "" },
      ]);
    },
  });

  const approveBatchMut = useMutation({
    mutationFn: (id: string) => apiRequest("POST", apiUrl(`/api/v1/gl/posting/batches/${id}/approve`)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["gl-batches"] }); qc.invalidateQueries({ queryKey: ["gl-recent-batches"] }); qc.invalidateQueries({ queryKey: ["gl-summary"] }); },
  });

  const rejectBatchMut = useMutation({
    mutationFn: (id: string) => apiRequest("POST", apiUrl(`/api/v1/gl/posting/batches/${id}/reject`)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["gl-batches"] }); qc.invalidateQueries({ queryKey: ["gl-recent-batches"] }); qc.invalidateQueries({ queryKey: ["gl-summary"] }); },
  });

  const cancelBatchMut = useMutation({
    mutationFn: (id: string) => apiRequest("POST", apiUrl(`/api/v1/gl/posting/batches/${id}/cancel`)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["gl-batches"] }); qc.invalidateQueries({ queryKey: ["gl-recent-batches"] }); qc.invalidateQueries({ queryKey: ["gl-summary"] }); },
  });

  const createFxMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiRequest("POST", apiUrl("/api/v1/gl/fx-rates"), body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["gl-fx-rates"] }); setCreateFxOpen(false); },
  });

  const runRevalMut = useMutation({
    mutationFn: (date: string) => apiRequest("POST", apiUrl("/api/v1/gl/fx-revaluation/run"), { run_date: date }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["gl-reval-runs"] }); },
  });

  const runYearEndMut = useMutation({
    mutationFn: (yearId: string) => apiRequest("POST", apiUrl("/api/v1/gl/year-end/run"), { financial_year_id: yearId }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["gl-financial-years"] }); setYeConfirmOpen(false); },
  });

  const frptiExtractMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiRequest("POST", apiUrl("/api/v1/gl/frpti/extract"), body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["gl-frpti-mappings"] }); },
  });

  // --- Operations mutations ---
  const runSodMut = useMutation({
    mutationFn: (date: string) => apiRequest("POST", apiUrl("/api/v1/gl/sod/run"), { business_date: date }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["gl-eod-runs"] }); },
  });

  const rollbackEodMut = useMutation({
    mutationFn: (body: { runId: string; reason: string }) => apiRequest("POST", apiUrl(`/api/v1/gl/eod/rollback/${body.runId}`), { reason: body.reason }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["gl-eod-runs"] }); },
  });

  // --- Accrual mutations ---
  const runAccrualMut = useMutation({
    mutationFn: (date: string) => apiRequest("POST", apiUrl("/api/v1/gl/accruals/interest/run"), { business_date: date }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["gl-accrual-schedules"] }); },
  });

  const runAmortMut = useMutation({
    mutationFn: (date: string) => apiRequest("POST", apiUrl("/api/v1/gl/accruals/amortization/run"), { business_date: date }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["gl-amort-schedules"] }); },
  });

  // --- Auth matrix mutations ---
  const createAuthMatrixMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiRequest("POST", apiUrl("/api/v1/gl/auth-matrix"), body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["gl-auth-matrix"] }); setCreateAuthMatrixOpen(false); },
  });

  // --- Period management mutations ---
  const createPeriodMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiRequest("POST", apiUrl("/api/v1/gl/financial-periods"), body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["gl-financial-periods"] }); setCreatePeriodOpen(false); },
  });

  const closePeriodMut = useMutation({
    mutationFn: (id: string) => apiRequest("POST", apiUrl(`/api/v1/gl/financial-periods/${id}/close`), {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["gl-financial-periods"] }); },
  });

  const reopenPeriodMut = useMutation({
    mutationFn: (body: { id: string; reason: string }) => apiRequest("PUT", apiUrl(`/api/v1/gl/financial-periods/${body.id}/reopen`), { reason: body.reason }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["gl-financial-periods"] }); },
  });

  // --- FRPTI enhancement mutations ---
  const frptiAmendMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiRequest("POST", apiUrl(`/api/v1/gl/frpti/amend/${body.period}`), body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["gl-frpti-mappings"] }); },
  });

  const frptiCompareQ = useQuery<any>({
    queryKey: ["gl-frpti-compare", frptiComparePeriod1, frptiComparePeriod2],
    queryFn: () => apiRequest("GET", apiUrl(`/api/v1/gl/frpti/compare?period1=${frptiComparePeriod1}&period2=${frptiComparePeriod2}`)),
    enabled: !!frptiComparePeriod1 && !!frptiComparePeriod2 && tab === "frpti",
  });

  // =========================================================================
  // Journal Entry helpers
  // =========================================================================

  const addJeLine = () => setJeLines([...jeLines, { dr_cr: "DR", gl_head: "", amount: "", currency: "PHP", narration: "" }]);
  const removeJeLine = (idx: number) => { if (jeLines.length > 2) setJeLines(jeLines.filter((_, i) => i !== idx)); };
  const updateJeLine = (idx: number, field: string, val: string) => {
    setJeLines(jeLines.map((l, i) => i === idx ? { ...l, [field]: val } : l));
  };

  const jeTotalDr = useMemo(() => jeLines.filter((l) => l.dr_cr === "DR").reduce((s, l) => s + (parseFloat(l.amount) || 0), 0), [jeLines]);
  const jeTotalCr = useMemo(() => jeLines.filter((l) => l.dr_cr === "CR").reduce((s, l) => s + (parseFloat(l.amount) || 0), 0), [jeLines]);
  const jeDiff = Math.abs(jeTotalDr - jeTotalCr);
  const jeBalanced = jeDiff < 0.005 && jeTotalDr > 0;

  const submitJournal = () => {
    createJournalMut.mutate({
      accounting_unit: jeHeader.accounting_unit,
      transaction_date: jeHeader.transaction_date,
      value_date: jeHeader.value_date,
      narration: jeHeader.narration,
      lines: jeLines.map((l) => ({
        dr_cr: l.dr_cr,
        gl_head_code: l.gl_head,
        amount: parseFloat(l.amount) || 0,
        currency: l.currency,
        narration: l.narration,
      })),
    });
  };

  // =========================================================================
  // Render
  // =========================================================================

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10"><BookOpen className="h-5 w-5 text-primary" /></div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Enterprise GL Dashboard</h1>
            <p className="text-sm text-muted-foreground">General Ledger management, journal posting, reporting, and regulatory compliance</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => { summaryQ.refetch(); }} disabled={summaryQ.isFetching}>
          <RefreshCw className={`h-4 w-4 ${summaryQ.isFetching ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard title="Total GL Heads" value={sum.total_gl_heads} icon={Layers} accent="bg-blue-600" />
        <SummaryCard title="Today's Postings" value={sum.today_postings} icon={PenLine} accent="bg-green-600" />
        <SummaryCard title="Pending Authorization" value={sum.pending_auth} icon={ClipboardList} accent="bg-yellow-500" />
        <SummaryCard title="Posting Exceptions" value={sum.posting_exceptions} icon={AlertTriangle} accent="bg-red-600" />
      </div>

      <Separator />

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview"><BarChart3 className="mr-1 h-4 w-4" /> Overview</TabsTrigger>
          <TabsTrigger value="coa"><Layers className="mr-1 h-4 w-4" /> Chart of Accounts</TabsTrigger>
          <TabsTrigger value="categories"><FolderTree className="mr-1 h-4 w-4" /> Categories</TabsTrigger>
          <TabsTrigger value="journal"><PenLine className="mr-1 h-4 w-4" /> Journal Entry</TabsTrigger>
          <TabsTrigger value="batches"><FileText className="mr-1 h-4 w-4" /> Batches</TabsTrigger>
          <TabsTrigger value="drilldown"><Search className="mr-1 h-4 w-4" /> Drilldown</TabsTrigger>
          <TabsTrigger value="reports"><BarChart3 className="mr-1 h-4 w-4" /> Reports</TabsTrigger>
          <TabsTrigger value="fx"><ArrowRightLeft className="mr-1 h-4 w-4" /> FX & Reval</TabsTrigger>
          <TabsTrigger value="operations"><Settings className="mr-1 h-4 w-4" /> Operations</TabsTrigger>
          <TabsTrigger value="accruals"><Percent className="mr-1 h-4 w-4" /> Accruals</TabsTrigger>
          <TabsTrigger value="authorization"><Shield className="mr-1 h-4 w-4" /> Authorization</TabsTrigger>
          <TabsTrigger value="yearend"><Calendar className="mr-1 h-4 w-4" /> Year-End</TabsTrigger>
          <TabsTrigger value="frpti"><Landmark className="mr-1 h-4 w-4" /> FRPTI</TabsTrigger>
        </TabsList>

        {/* ================================================================
            TAB 1: OVERVIEW
            ================================================================ */}
        <TabsContent value="overview" className="mt-4 space-y-4">
          {/* Recent Journal Batches */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Recent Journal Batches</CardTitle>
              <CardDescription>Last 20 journal batches across all sources</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {["Batch Ref", "Source", "Mode", "Status", "Date", "Total DR", "Total CR"].map((h) => (
                        <TableHead key={h} className={["Total DR", "Total CR"].includes(h) ? "text-right" : ""}>{h}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentBatchesQ.isLoading ? <SkeletonRows cols={7} /> :
                      recentBatches.length === 0 ? <EmptyRow cols={7} msg="No journal batches yet" /> :
                        recentBatches.slice(0, 20).map((b) => (
                          <TableRow key={b.id}>
                            <TableCell className="font-mono text-sm">{b.batch_ref}</TableCell>
                            <TableCell className="text-sm">{b.source}</TableCell>
                            <TableCell><Badge className={bc(BATCH_MODE_COLORS, b.posting_mode)}>{b.posting_mode}</Badge></TableCell>
                            <TableCell><Badge className={bc(STATUS_COLORS, b.status)}>{b.status}</Badge></TableCell>
                            <TableCell className="text-xs">{fmtDate(b.transaction_date)}</TableCell>
                            <TableCell className="text-right font-mono">{fmtPHP(b.total_debit)}</TableCell>
                            <TableCell className="text-right font-mono">{fmtPHP(b.total_credit)}</TableCell>
                          </TableRow>
                        ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Balance Summary Placeholder & Exceptions */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Balance Summary</CardTitle>
                <CardDescription>GL balance distribution by type</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex h-48 items-center justify-center rounded-md border border-dashed text-muted-foreground">
                  <div className="text-center">
                    <BarChart3 className="mx-auto mb-2 h-8 w-8" />
                    <p className="text-sm">Balance summary chart</p>
                    <p className="text-xs">Visualization available after first posting run</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Posting Exceptions</CardTitle>
                <CardDescription>Recent posting errors requiring attention</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {["Batch Ref", "Error Type", "Message", "Date"].map((h) => <TableHead key={h}>{h}</TableHead>)}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {exceptionsQ.isLoading ? <SkeletonRows cols={4} rows={3} /> :
                        exceptions.length === 0 ? <EmptyRow cols={4} msg="No posting exceptions" /> :
                          exceptions.slice(0, 10).map((e) => (
                            <TableRow key={e.id}>
                              <TableCell className="font-mono text-xs">{e.batch_ref ?? "\u2014"}</TableCell>
                              <TableCell><Badge variant="destructive" className="text-xs">{e.error_type}</Badge></TableCell>
                              <TableCell className="max-w-[200px] truncate text-xs">{e.message}</TableCell>
                              <TableCell className="text-xs">{fmtDate(e.created_at)}</TableCell>
                            </TableRow>
                          ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ================================================================
            TAB 2: CHART OF ACCOUNTS
            ================================================================ */}
        <TabsContent value="coa" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base">GL Heads</CardTitle>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Search code or name..." value={coaSearch} onChange={(e) => setCoaSearch(e.target.value)} className="w-[200px] pl-8" />
                  </div>
                  <Select value={coaTypeFilter} onValueChange={setCoaTypeFilter}>
                    <SelectTrigger className="w-[150px]"><SelectValue placeholder="Type" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Types</SelectItem>
                      {["ASSET", "LIABILITY", "INCOME", "EXPENDITURE", "EQUITY"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={coaStatusFilter} onValueChange={setCoaStatusFilter}>
                    <SelectTrigger className="w-[130px]"><SelectValue placeholder="Status" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Status</SelectItem>
                      <SelectItem value="OPEN">OPEN</SelectItem>
                      <SelectItem value="CLOSED">CLOSED</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button size="sm" onClick={() => { setNewHead({ code: "", name: "", gl_type: "ASSET", category_id: "", hierarchy_id: "", currency_restriction: "", opening_date: "", is_manual_posting_allowed: true, is_revaluation_enabled: false, description: "" }); setCreateHeadOpen(true); }}>
                    <Plus className="mr-1 h-3 w-3" /> New GL Head
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {["Code", "Name", "Type", "Category", "Status", "Currency", "Opening Date", "Actions"].map((h) => <TableHead key={h}>{h}</TableHead>)}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {glHeadsQ.isLoading ? <SkeletonRows cols={8} /> :
                      filteredHeads.length === 0 ? <EmptyRow cols={8} msg="No GL heads found" /> :
                        filteredHeads.map((h) => (
                          <TableRow key={h.id}>
                            <TableCell className="font-mono text-sm font-medium">{h.code}</TableCell>
                            <TableCell className="text-sm">{h.name}</TableCell>
                            <TableCell><Badge className={bc(GL_TYPE_COLORS, h.gl_type)}>{h.gl_type}</Badge></TableCell>
                            <TableCell className="text-sm">{h.category_name ?? "\u2014"}</TableCell>
                            <TableCell><Badge className={bc(STATUS_COLORS, h.status)}>{h.status}</Badge></TableCell>
                            <TableCell className="text-xs">{h.currency_restriction || "ANY"}</TableCell>
                            <TableCell className="text-xs">{fmtDate(h.opening_date)}</TableCell>
                            <TableCell>
                              {h.status === "OPEN" && (
                                <Button variant="outline" size="sm" onClick={() => closeHeadMut.mutate(h.id)} disabled={closeHeadMut.isPending}>
                                  <Lock className="mr-1 h-3 w-3" /> Close
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================================================================
            TAB 3: CATEGORIES & HIERARCHY
            ================================================================ */}
        <TabsContent value="categories" className="mt-4 space-y-4">
          {/* GL Categories */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">GL Categories</CardTitle>
                <Button size="sm" onClick={() => { setNewCat({ code: "", name: "", category_type: "ASSET", is_reportable: true, is_budgetable: false }); setCreateCatOpen(true); }}>
                  <Plus className="mr-1 h-3 w-3" /> New Category
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {["Code", "Name", "Type", "Reportable", "Budgetable"].map((h) => <TableHead key={h}>{h}</TableHead>)}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {categoriesQ.isLoading ? <SkeletonRows cols={5} /> :
                      categories.length === 0 ? <EmptyRow cols={5} msg="No categories configured" /> :
                        categories.map((c) => (
                          <TableRow key={c.id}>
                            <TableCell className="font-mono text-sm font-medium">{c.code}</TableCell>
                            <TableCell className="text-sm">{c.name}</TableCell>
                            <TableCell><Badge className={bc(GL_TYPE_COLORS, c.category_type)}>{c.category_type}</Badge></TableCell>
                            <TableCell>{c.is_reportable ? <Check className="h-4 w-4 text-green-600" /> : <X className="h-4 w-4 text-muted-foreground" />}</TableCell>
                            <TableCell>{c.is_budgetable ? <Check className="h-4 w-4 text-green-600" /> : <X className="h-4 w-4 text-muted-foreground" />}</TableCell>
                          </TableRow>
                        ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* GL Hierarchy */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">GL Hierarchy</CardTitle>
                <Button size="sm" onClick={() => { setNewHier({ code: "", name: "", parent_id: "", level: 1, sort_order: 0 }); setCreateHierOpen(true); }}>
                  <Plus className="mr-1 h-3 w-3" /> New Node
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {["Code", "Name", "Level", "Sort Order"].map((h) => <TableHead key={h}>{h}</TableHead>)}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {hierarchyQ.isLoading ? <SkeletonRows cols={4} /> :
                      hierarchy.length === 0 ? <EmptyRow cols={4} msg="No hierarchy nodes configured" /> :
                        hierarchy.map((n) => (
                          <TableRow key={n.id}>
                            <TableCell className="font-mono text-sm">
                              <span style={{ paddingLeft: `${(n.level - 1) * 20}px` }} className="flex items-center gap-1">
                                {n.level > 1 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                                <span className="font-medium">{n.code}</span>
                              </span>
                            </TableCell>
                            <TableCell className="text-sm">{n.name}</TableCell>
                            <TableCell className="text-sm">{n.level}</TableCell>
                            <TableCell className="text-sm">{n.sort_order ?? "\u2014"}</TableCell>
                          </TableRow>
                        ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================================================================
            TAB 4: JOURNAL ENTRY
            ================================================================ */}
        <TabsContent value="journal" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Manual Journal Entry</CardTitle>
              <CardDescription>Create a manual journal entry for authorization</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Header fields */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Accounting Unit</label>
                  <Select value={jeHeader.accounting_unit} onValueChange={(v) => setJeHeader({ ...jeHeader, accounting_unit: v })}>
                    <SelectTrigger><SelectValue placeholder="Select unit" /></SelectTrigger>
                    <SelectContent>
                      {accountingUnits.map((au) => <SelectItem key={au.id} value={au.code}>{au.code} - {au.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Transaction Date</label>
                  <Input type="date" value={jeHeader.transaction_date} onChange={(e) => setJeHeader({ ...jeHeader, transaction_date: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Value Date</label>
                  <Input type="date" value={jeHeader.value_date} onChange={(e) => setJeHeader({ ...jeHeader, value_date: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Narration</label>
                  <Input value={jeHeader.narration} onChange={(e) => setJeHeader({ ...jeHeader, narration: e.target.value })} placeholder="Journal description" />
                </div>
              </div>

              <Separator />

              {/* Lines */}
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {["#", "DR/CR", "GL Head", "Amount", "Currency", "Narration", ""].map((h) => (
                        <TableHead key={h} className={h === "Amount" ? "text-right" : ""}>{h}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {jeLines.map((line, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="text-sm text-muted-foreground">{idx + 1}</TableCell>
                        <TableCell>
                          <Select value={line.dr_cr} onValueChange={(v) => updateJeLine(idx, "dr_cr", v)}>
                            <SelectTrigger className="w-[80px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="DR">DR</SelectItem>
                              <SelectItem value="CR">CR</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Select value={line.gl_head} onValueChange={(v) => updateJeLine(idx, "gl_head", v)}>
                            <SelectTrigger className="w-[200px]"><SelectValue placeholder="Select GL head" /></SelectTrigger>
                            <SelectContent>
                              {glHeads.filter((h) => h.status === "OPEN").map((h) => (
                                <SelectItem key={h.id} value={h.code}>{h.code} - {h.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Input type="number" value={line.amount} onChange={(e) => updateJeLine(idx, "amount", e.target.value)} className="w-[140px] text-right font-mono" placeholder="0.00" step="0.01" />
                        </TableCell>
                        <TableCell>
                          <Input value={line.currency} onChange={(e) => updateJeLine(idx, "currency", e.target.value)} className="w-[80px]" />
                        </TableCell>
                        <TableCell>
                          <Input value={line.narration} onChange={(e) => updateJeLine(idx, "narration", e.target.value)} className="w-[180px]" placeholder="Line narration" />
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" onClick={() => removeJeLine(idx)} disabled={jeLines.length <= 2}>
                            <X className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4">
                <Button variant="outline" size="sm" onClick={addJeLine}><Plus className="mr-1 h-3 w-3" /> Add Line</Button>
                <div className="flex items-center gap-6">
                  <div className="text-sm">
                    <span className="text-muted-foreground">Total DR: </span>
                    <span className="font-mono font-bold">{fmtPHP(jeTotalDr)}</span>
                  </div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">Total CR: </span>
                    <span className="font-mono font-bold">{fmtPHP(jeTotalCr)}</span>
                  </div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">Difference: </span>
                    <span className={`font-mono font-bold ${jeDiff > 0.005 ? "text-red-600" : "text-green-600"}`}>{fmtPHP(jeDiff)}</span>
                  </div>
                </div>
              </div>

              <Separator />

              <div className="flex justify-end">
                <Button onClick={submitJournal} disabled={!jeBalanced || !jeHeader.accounting_unit || !jeHeader.transaction_date || createJournalMut.isPending}>
                  <ClipboardList className="mr-1 h-4 w-4" />
                  {createJournalMut.isPending ? "Submitting..." : "Submit for Authorization"}
                </Button>
              </div>

              {createJournalMut.isError && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  <AlertTriangle className="mr-1 inline h-4 w-4" /> {(createJournalMut.error as Error)?.message ?? "Failed to create journal entry"}
                </div>
              )}
              {createJournalMut.isSuccess && (
                <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                  <Check className="mr-1 inline h-4 w-4" /> Journal entry submitted for authorization
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================================================================
            TAB 5: JOURNAL BATCHES
            ================================================================ */}
        <TabsContent value="batches" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base">Journal Batches</CardTitle>
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={batchStatusFilter} onValueChange={setBatchStatusFilter}>
                    <SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Status</SelectItem>
                      {["PENDING_AUTH", "POSTED", "REJECTED", "CANCELLED"].map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={batchModeFilter} onValueChange={setBatchModeFilter}>
                    <SelectTrigger className="w-[130px]"><SelectValue placeholder="Mode" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Modes</SelectItem>
                      {["ONLINE", "BATCH", "MANUAL"].map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={batchAuFilter} onValueChange={setBatchAuFilter}>
                    <SelectTrigger className="w-[160px]"><SelectValue placeholder="Acctg Unit" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Units</SelectItem>
                      {accountingUnits.map((au) => <SelectItem key={au.id} value={au.code}>{au.code}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input type="date" value={batchDateFrom} onChange={(e) => setBatchDateFrom(e.target.value)} className="w-[140px]" />
                  <Input type="date" value={batchDateTo} onChange={(e) => setBatchDateTo(e.target.value)} className="w-[140px]" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {["Batch Ref", "Source", "Event", "Mode", "Status", "Date", "Total DR", "Total CR", "Maker", "Checker", "Actions"].map((h) => (
                        <TableHead key={h} className={["Total DR", "Total CR"].includes(h) ? "text-right" : ""}>{h}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {batchesQ.isLoading ? <SkeletonRows cols={11} /> :
                      batches.length === 0 ? <EmptyRow cols={11} msg="No batches found" /> :
                        batches.map((b) => (
                          <TableRow key={b.id} className="cursor-pointer hover:bg-muted/50" onClick={() => { setSelectedBatchId(b.id); setBatchDetailOpen(true); }}>
                            <TableCell className="font-mono text-sm font-medium">{b.batch_ref}</TableCell>
                            <TableCell className="text-sm">{b.source}</TableCell>
                            <TableCell className="text-xs">{b.event_type ?? "\u2014"}</TableCell>
                            <TableCell><Badge className={bc(BATCH_MODE_COLORS, b.posting_mode)}>{b.posting_mode}</Badge></TableCell>
                            <TableCell><Badge className={bc(STATUS_COLORS, b.status)}>{b.status.replace(/_/g, " ")}</Badge></TableCell>
                            <TableCell className="text-xs">{fmtDate(b.transaction_date)}</TableCell>
                            <TableCell className="text-right font-mono">{fmtPHP(b.total_debit)}</TableCell>
                            <TableCell className="text-right font-mono">{fmtPHP(b.total_credit)}</TableCell>
                            <TableCell className="text-xs">{b.maker ?? "\u2014"}</TableCell>
                            <TableCell className="text-xs">{b.checker ?? "\u2014"}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                {b.status === "PENDING_AUTH" && (
                                  <>
                                    <Button variant="outline" size="sm" onClick={() => approveBatchMut.mutate(b.id)} disabled={approveBatchMut.isPending}>
                                      <Check className="h-3 w-3" />
                                    </Button>
                                    <Button variant="outline" size="sm" onClick={() => rejectBatchMut.mutate(b.id)} disabled={rejectBatchMut.isPending}>
                                      <X className="h-3 w-3" />
                                    </Button>
                                  </>
                                )}
                                {b.status === "POSTED" && (
                                  <Button variant="outline" size="sm" onClick={() => cancelBatchMut.mutate(b.id)} disabled={cancelBatchMut.isPending}>
                                    <Ban className="mr-1 h-3 w-3" /> Cancel
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================================================================
            TAB 6: GL DRILLDOWN
            ================================================================ */}
        <TabsContent value="drilldown" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">GL Drilldown Query</CardTitle>
              <CardDescription>Query GL balances and transaction details for a specific account</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Accounting Unit</label>
                  <Select value={ddAu} onValueChange={setDdAu}>
                    <SelectTrigger><SelectValue placeholder="Select unit" /></SelectTrigger>
                    <SelectContent>
                      {accountingUnits.map((au) => <SelectItem key={au.id} value={au.code}>{au.code} - {au.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">GL Access Code</label>
                  <Select value={ddGlCode} onValueChange={setDdGlCode}>
                    <SelectTrigger><SelectValue placeholder="Select GL head" /></SelectTrigger>
                    <SelectContent>
                      {glHeads.map((h) => <SelectItem key={h.id} value={h.code}>{h.code} - {h.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">From Date</label>
                  <Input type="date" value={ddFrom} onChange={(e) => setDdFrom(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">To Date</label>
                  <Input type="date" value={ddTo} onChange={(e) => setDdTo(e.target.value)} />
                </div>
                <div className="flex items-end">
                  <Button onClick={() => setDdTriggered(true)} disabled={!ddGlCode || drilldownQ.isFetching}>
                    <Search className="mr-1 h-4 w-4" />{drilldownQ.isFetching ? "Querying..." : "Query"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {ddTriggered && drilldownQ.data && (
            <>
              {/* Balance summary */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card><CardContent className="pt-6">
                  <p className="text-sm font-medium text-muted-foreground">Opening Balance</p>
                  <p className="mt-1 text-xl font-bold font-mono">{fmtPHP(drilldownQ.data.opening_balance)}</p>
                </CardContent></Card>
                <Card><CardContent className="pt-6">
                  <p className="text-sm font-medium text-muted-foreground">Debit Turnover</p>
                  <p className="mt-1 text-xl font-bold font-mono text-blue-600">{fmtPHP(drilldownQ.data.debit_turnover)}</p>
                </CardContent></Card>
                <Card><CardContent className="pt-6">
                  <p className="text-sm font-medium text-muted-foreground">Credit Turnover</p>
                  <p className="mt-1 text-xl font-bold font-mono text-purple-600">{fmtPHP(drilldownQ.data.credit_turnover)}</p>
                </CardContent></Card>
                <Card><CardContent className="pt-6">
                  <p className="text-sm font-medium text-muted-foreground">Closing Balance</p>
                  <p className="mt-1 text-xl font-bold font-mono">{fmtPHP(drilldownQ.data.closing_balance)}</p>
                </CardContent></Card>
              </div>

              {/* Detail lines */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Transaction Details</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {["Batch Ref", "Txn Date", "Value Date", "DR/CR", "Amount", "Currency", "Narration"].map((h) => (
                            <TableHead key={h} className={h === "Amount" ? "text-right" : ""}>{h}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(drilldownQ.data.lines ?? []).length === 0 ? <EmptyRow cols={7} msg="No transactions in this period" /> :
                          drilldownQ.data.lines.map((l) => (
                            <TableRow key={l.id}>
                              <TableCell className="font-mono text-xs">{l.batch_ref}</TableCell>
                              <TableCell className="text-xs">{fmtDate(l.transaction_date)}</TableCell>
                              <TableCell className="text-xs">{fmtDate(l.value_date)}</TableCell>
                              <TableCell>
                                <Badge className={l.dr_cr === "DR" ? "bg-blue-100 text-blue-800" : "bg-purple-100 text-purple-800"}>{l.dr_cr}</Badge>
                              </TableCell>
                              <TableCell className="text-right font-mono">{fmtPHP(l.amount)}</TableCell>
                              <TableCell className="text-xs">{l.currency}</TableCell>
                              <TableCell className="max-w-[200px] truncate text-xs">{l.narration ?? "\u2014"}</TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {ddTriggered && drilldownQ.isLoading && (
            <Card><CardContent className="py-8"><div className="space-y-2"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-3/4" /><Skeleton className="h-8 w-1/2" /></div></CardContent></Card>
          )}
        </TabsContent>

        {/* ================================================================
            TAB 7: REPORTS
            ================================================================ */}
        <TabsContent value="reports" className="mt-4 space-y-4">
          {/* Filters */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Financial Reports</CardTitle>
              <CardDescription>Generate standard financial statements and regulatory reports</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-end gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium">As-of Date</label>
                  <Input type="date" value={rptDate} onChange={(e) => setRptDate(e.target.value)} className="w-[180px]" />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Accounting Unit</label>
                  <Select value={rptAu} onValueChange={setRptAu}>
                    <SelectTrigger className="w-[180px]"><SelectValue placeholder="All units" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All Units</SelectItem>
                      {accountingUnits.map((au) => <SelectItem key={au.id} value={au.code}>{au.code} - {au.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Button variant="outline" size="sm" disabled><Download className="mr-1 h-3 w-3" /> Export CSV</Button>
                <Button variant="outline" size="sm" disabled><Download className="mr-1 h-3 w-3" /> Export PDF</Button>
              </div>
            </CardContent>
          </Card>

          <Tabs value={reportSub} onValueChange={setReportSub}>
            <TabsList>
              <TabsTrigger value="trial-balance">Trial Balance</TabsTrigger>
              <TabsTrigger value="balance-sheet">Balance Sheet</TabsTrigger>
              <TabsTrigger value="income-statement">Income Statement</TabsTrigger>
              <TabsTrigger value="nav-summary">NAV Summary</TabsTrigger>
              <TabsTrigger value="report-builder">Report Builder</TabsTrigger>
            </TabsList>

            {/* Trial Balance */}
            <TabsContent value="trial-balance" className="mt-4">
              <Card>
                <CardContent className="pt-6">
                  {!rptDate ? (
                    <div className="py-8 text-center text-muted-foreground">Select an as-of date to generate the trial balance</div>
                  ) : (
                    <div className="overflow-x-auto rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            {["GL Code", "GL Name", "Debit Balance", "Credit Balance"].map((h) => (
                              <TableHead key={h} className={["Debit Balance", "Credit Balance"].includes(h) ? "text-right" : ""}>{h}</TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {trialBalQ.isLoading ? <SkeletonRows cols={4} /> :
                            trialBal.length === 0 ? <EmptyRow cols={4} msg="No data available" /> :
                              <>
                                {trialBal.map((r, i) => (
                                  <TableRow key={i}>
                                    <TableCell className="font-mono text-sm font-medium">{r.gl_code}</TableCell>
                                    <TableCell className="text-sm">{r.gl_name}</TableCell>
                                    <TableCell className="text-right font-mono">{r.debit_balance > 0 ? fmtPHP(r.debit_balance) : "\u2014"}</TableCell>
                                    <TableCell className="text-right font-mono">{r.credit_balance > 0 ? fmtPHP(r.credit_balance) : "\u2014"}</TableCell>
                                  </TableRow>
                                ))}
                                <TableRow className="font-bold bg-muted/50">
                                  <TableCell colSpan={2} className="text-right">Totals</TableCell>
                                  <TableCell className="text-right font-mono">{fmtPHP(trialBal.reduce((s, r) => s + r.debit_balance, 0))}</TableCell>
                                  <TableCell className="text-right font-mono">{fmtPHP(trialBal.reduce((s, r) => s + r.credit_balance, 0))}</TableCell>
                                </TableRow>
                              </>}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Balance Sheet */}
            <TabsContent value="balance-sheet" className="mt-4">
              <Card>
                <CardContent className="pt-6">
                  {!rptDate ? (
                    <div className="py-8 text-center text-muted-foreground">Select an as-of date to generate the balance sheet</div>
                  ) : (
                    <div className="overflow-x-auto rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            {["Category", "GL Code", "GL Name", "Balance"].map((h) => (
                              <TableHead key={h} className={h === "Balance" ? "text-right" : ""}>{h}</TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {balSheetQ.isLoading ? <SkeletonRows cols={4} /> :
                            balSheet.length === 0 ? <EmptyRow cols={4} msg="No data available" /> :
                              balSheet.map((r, i) => (
                                <TableRow key={i}>
                                  <TableCell className="text-sm font-medium">{r.category}</TableCell>
                                  <TableCell className="font-mono text-sm">{r.gl_code}</TableCell>
                                  <TableCell className="text-sm">{r.gl_name}</TableCell>
                                  <TableCell className="text-right font-mono">{fmtPHP(r.balance)}</TableCell>
                                </TableRow>
                              ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Income Statement */}
            <TabsContent value="income-statement" className="mt-4">
              <Card>
                <CardContent className="pt-6">
                  {!rptDate ? (
                    <div className="py-8 text-center text-muted-foreground">Select an as-of date to generate the income statement</div>
                  ) : (
                    <div className="overflow-x-auto rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            {["Category", "GL Code", "GL Name", "Amount"].map((h) => (
                              <TableHead key={h} className={h === "Amount" ? "text-right" : ""}>{h}</TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {incStmtQ.isLoading ? <SkeletonRows cols={4} /> :
                            incStmt.length === 0 ? <EmptyRow cols={4} msg="No data available" /> :
                              <>
                                {incStmt.map((r, i) => (
                                  <TableRow key={i}>
                                    <TableCell className="text-sm font-medium">{r.category}</TableCell>
                                    <TableCell className="font-mono text-sm">{r.gl_code}</TableCell>
                                    <TableCell className="text-sm">{r.gl_name}</TableCell>
                                    <TableCell className="text-right font-mono">{fmtPHP(r.amount)}</TableCell>
                                  </TableRow>
                                ))}
                                <TableRow className="font-bold bg-muted/50">
                                  <TableCell colSpan={3} className="text-right">Net Income</TableCell>
                                  <TableCell className="text-right font-mono">{fmtPHP(incStmt.reduce((s, r) => s + r.amount, 0))}</TableCell>
                                </TableRow>
                              </>}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* NAV Summary */}
            <TabsContent value="nav-summary" className="mt-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex h-48 items-center justify-center rounded-md border border-dashed text-muted-foreground">
                    <div className="text-center">
                      <TrendingUp className="mx-auto mb-2 h-8 w-8" />
                      <p className="text-sm">NAV Summary Report</p>
                      <p className="text-xs">Consolidated NAV across funds and accounting units</p>
                      <p className="mt-2 text-xs">Select an as-of date and accounting unit to generate</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Report Builder */}
            <TabsContent value="report-builder" className="mt-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Saved Report Definitions</CardTitle>
                  <CardDescription>User-configurable report templates with custom columns, filters, and grouping</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {["ID", "Name", "Description", "Columns", "Created At"].map((h) => <TableHead key={h}>{h}</TableHead>)}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {reportDefsQ.isLoading ? <SkeletonRows cols={5} /> :
                          reportDefs.length === 0 ? <EmptyRow cols={5} msg="No report definitions saved. Use the API to create report templates." /> :
                            reportDefs.map((r) => (
                              <TableRow key={r.id}>
                                <TableCell className="font-mono text-sm">#{r.id}</TableCell>
                                <TableCell className="font-medium text-sm">{r.name}</TableCell>
                                <TableCell className="text-xs max-w-[200px] truncate">{r.description ?? "\u2014"}</TableCell>
                                <TableCell className="text-xs">{Array.isArray(r.columns) ? r.columns.length : 0} cols</TableCell>
                                <TableCell className="text-xs">{fmtDate(r.created_at)}</TableCell>
                              </TableRow>
                            ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </TabsContent>

        {/* ================================================================
            TAB 8: FX & REVALUATION
            ================================================================ */}
        <TabsContent value="fx" className="mt-4 space-y-4">
          {/* FX Rates */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">FX Rate Maintenance</CardTitle>
                  <CardDescription>Manage exchange rates for multi-currency GL posting</CardDescription>
                </div>
                <Button size="sm" onClick={() => { setNewFx({ from_currency: "", to_currency: "PHP", rate: "", rate_date: "" }); setCreateFxOpen(true); }}>
                  <Plus className="mr-1 h-3 w-3" /> New Rate
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {["From", "To", "Rate", "Rate Date", "Source"].map((h) => (
                        <TableHead key={h} className={h === "Rate" ? "text-right" : ""}>{h}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fxRatesQ.isLoading ? <SkeletonRows cols={5} /> :
                      fxRates.length === 0 ? <EmptyRow cols={5} msg="No FX rates configured" /> :
                        fxRates.map((r) => (
                          <TableRow key={r.id}>
                            <TableCell className="font-mono text-sm font-medium">{r.from_currency}</TableCell>
                            <TableCell className="font-mono text-sm">{r.to_currency}</TableCell>
                            <TableCell className="text-right font-mono">{fmtNum(r.rate)}</TableCell>
                            <TableCell className="text-xs">{fmtDate(r.rate_date)}</TableCell>
                            <TableCell className="text-xs">{r.source ?? "MANUAL"}</TableCell>
                          </TableRow>
                        ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Revaluation Controls */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">FX Revaluation</CardTitle>
              <CardDescription>Revalue GL balances denominated in foreign currencies</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-end gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Revaluation Date</label>
                  <Input type="date" value={revalDate} onChange={(e) => setRevalDate(e.target.value)} className="w-[200px]" />
                </div>
                <Button onClick={() => runRevalMut.mutate(revalDate)} disabled={!revalDate || runRevalMut.isPending}>
                  <Play className="mr-1 h-4 w-4" />{runRevalMut.isPending ? "Running..." : "Run FX Revaluation"}
                </Button>
              </div>
              {runRevalMut.isSuccess && (
                <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                  <Check className="mr-1 inline h-4 w-4" /> FX revaluation completed successfully
                </div>
              )}
            </CardContent>
          </Card>

          {/* Revaluation History */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Revaluation History</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {["Run Date", "Status", "GL Entries", "Total Gain/Loss", "Created At"].map((h) => (
                        <TableHead key={h} className={["GL Entries", "Total Gain/Loss"].includes(h) ? "text-right" : ""}>{h}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {revalRunsQ.isLoading ? <SkeletonRows cols={5} /> :
                      revalRuns.length === 0 ? <EmptyRow cols={5} msg="No revaluation runs yet" /> :
                        revalRuns.map((r) => (
                          <TableRow key={r.id}>
                            <TableCell className="text-sm">{fmtDate(r.run_date)}</TableCell>
                            <TableCell><Badge className={bc(STATUS_COLORS, r.status)}>{r.status}</Badge></TableCell>
                            <TableCell className="text-right font-mono">{r.gl_entries_count}</TableCell>
                            <TableCell className={`text-right font-mono ${r.total_gain_loss >= 0 ? "text-green-600" : "text-red-600"}`}>
                              {fmtPHP(r.total_gain_loss)}
                            </TableCell>
                            <TableCell className="text-xs">{fmtDate(r.created_at)}</TableCell>
                          </TableRow>
                        ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================================================================
            TAB 9: YEAR-END
            ================================================================ */}
        <TabsContent value="yearend" className="mt-4 space-y-4">
          {/* Financial Years */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Financial Years</CardTitle>
              <CardDescription>Manage financial year definitions and year-end closing</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {["Year", "Start Date", "End Date", "Status", "Closed At", "Actions"].map((h) => <TableHead key={h}>{h}</TableHead>)}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {finYearsQ.isLoading ? <SkeletonRows cols={6} /> :
                      finYears.length === 0 ? <EmptyRow cols={6} msg="No financial years defined" /> :
                        finYears.map((y) => (
                          <TableRow key={y.id}>
                            <TableCell className="font-medium">{y.year_label}</TableCell>
                            <TableCell className="text-xs">{fmtDate(y.start_date)}</TableCell>
                            <TableCell className="text-xs">{fmtDate(y.end_date)}</TableCell>
                            <TableCell><Badge className={bc(STATUS_COLORS, y.status)}>{y.status}</Badge></TableCell>
                            <TableCell className="text-xs">{y.closed_at ? fmtDate(y.closed_at) : "\u2014"}</TableCell>
                            <TableCell>
                              {y.status === "ACTIVE" && (
                                <Button variant="outline" size="sm" onClick={() => { setYeSelectedYear(y.id); setYeConfirmOpen(true); }}>
                                  <Lock className="mr-1 h-3 w-3" /> Run Year-End
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Financial Periods */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Financial Periods</CardTitle>
                  <CardDescription>Monthly and quarterly period management for GL posting restrictions</CardDescription>
                </div>
                <Button size="sm" onClick={() => { setNewPeriod({ period_label: "", start_date: "", end_date: "" }); setCreatePeriodOpen(true); }}>
                  <Plus className="mr-1 h-3 w-3" /> New Period
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {["Period", "Start Date", "End Date", "Status", "Closed At", "Actions"].map((h) => <TableHead key={h}>{h}</TableHead>)}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {finPeriodsQ.isLoading ? <SkeletonRows cols={6} /> :
                      financialPeriods.length === 0 ? <EmptyRow cols={6} msg="No financial periods defined" /> :
                        financialPeriods.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell className="font-medium">{p.period_label}</TableCell>
                            <TableCell className="text-xs">{fmtDate(p.start_date)}</TableCell>
                            <TableCell className="text-xs">{fmtDate(p.end_date)}</TableCell>
                            <TableCell><Badge className={bc(STATUS_COLORS, p.is_closed ? "CLOSED" : "OPEN")}>{p.is_closed ? "CLOSED" : "OPEN"}</Badge></TableCell>
                            <TableCell className="text-xs">{p.closed_at ? fmtDate(p.closed_at) : "\u2014"}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                {!p.is_closed ? (
                                  <Button variant="outline" size="sm" onClick={() => closePeriodMut.mutate(p.id)} disabled={closePeriodMut.isPending}>
                                    <Lock className="mr-1 h-3 w-3" /> Close
                                  </Button>
                                ) : (
                                  <Button variant="outline" size="sm" onClick={() => reopenPeriodMut.mutate({ id: p.id, reason: "Reopened from dashboard" })} disabled={reopenPeriodMut.isPending}>
                                    <Unlock className="mr-1 h-3 w-3" /> Reopen
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================================================================
            TAB 10: FRPTI
            ================================================================ */}
        <TabsContent value="frpti" className="mt-4 space-y-4">
          {/* FRPTI Mappings */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base">FRPTI Mapping Maintenance</CardTitle>
                  <CardDescription>BSP Financial Reporting Package for Trust Institutions</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Select value={frptiSchedule} onValueChange={setFrptiSchedule}>
                    <SelectTrigger className="w-[160px]"><SelectValue placeholder="Schedule" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Schedules</SelectItem>
                      {["A", "B", "C", "D", "E", "F", "G", "H"].map((s) => <SelectItem key={s} value={s}>Schedule {s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {["Schedule", "BSP Code", "GL Code", "GL Name", "Description"].map((h) => <TableHead key={h}>{h}</TableHead>)}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {frptiQ.isLoading ? <SkeletonRows cols={5} /> :
                      filteredFrpti.length === 0 ? <EmptyRow cols={5} msg="No FRPTI mappings configured" /> :
                        filteredFrpti.map((m) => (
                          <TableRow key={m.id}>
                            <TableCell className="font-medium">Schedule {m.schedule}</TableCell>
                            <TableCell className="font-mono text-sm">{m.bsp_code}</TableCell>
                            <TableCell className="font-mono text-sm">{m.gl_code}</TableCell>
                            <TableCell className="text-sm">{m.gl_name ?? "\u2014"}</TableCell>
                            <TableCell className="max-w-[200px] truncate text-xs">{m.description ?? "\u2014"}</TableCell>
                          </TableRow>
                        ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Generate Extract */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Generate FRPTI Extract</CardTitle>
              <CardDescription>Generate regulatory extract for BSP submission</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-end gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Reporting Period</label>
                  <Input type="month" value={frptiPeriod} onChange={(e) => setFrptiPeriod(e.target.value)} className="w-[200px]" />
                </div>
                <Button onClick={() => frptiExtractMut.mutate({ period: frptiPeriod })} disabled={!frptiPeriod || frptiExtractMut.isPending}>
                  <Play className="mr-1 h-4 w-4" />{frptiExtractMut.isPending ? "Generating..." : "Generate Extract"}
                </Button>
                <Button variant="outline" size="sm" disabled><Download className="mr-1 h-3 w-3" /> Download Extract</Button>
              </div>

              {frptiExtractMut.isSuccess && (
                <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                  <Check className="mr-1 inline h-4 w-4" /> FRPTI extract generated successfully
                </div>
              )}
              {frptiExtractMut.isError && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  <AlertTriangle className="mr-1 inline h-4 w-4" /> {(frptiExtractMut.error as Error)?.message ?? "Failed to generate extract"}
                </div>
              )}

              {/* Validation Errors placeholder */}
              <div className="mt-4 flex h-24 items-center justify-center rounded-md border border-dashed text-muted-foreground">
                <div className="text-center">
                  <AlertTriangle className="mx-auto mb-1 h-6 w-6" />
                  <p className="text-xs">Validation results will appear here after generation</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* FRPTI Amendment */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">FRPTI Amendment</CardTitle>
              <CardDescription>Submit amendments for a previously submitted FRPTI period</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-end gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Period</label>
                  <Input type="month" value={frptiAmendPeriod} onChange={(e) => setFrptiAmendPeriod(e.target.value)} className="w-[200px]" />
                </div>
                <div className="space-y-1 flex-1">
                  <label className="text-sm font-medium">Reason</label>
                  <Input value={frptiAmendReason} onChange={(e) => setFrptiAmendReason(e.target.value)} placeholder="Reason for amendment" />
                </div>
                <Button onClick={() => frptiAmendMut.mutate({ period: frptiAmendPeriod, reason: frptiAmendReason })} disabled={!frptiAmendPeriod || !frptiAmendReason || frptiAmendMut.isPending}>
                  <PenLine className="mr-1 h-4 w-4" />{frptiAmendMut.isPending ? "Submitting..." : "Submit Amendment"}
                </Button>
              </div>
              {frptiAmendMut.isSuccess && (
                <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                  <Check className="mr-1 inline h-4 w-4" /> Amendment submitted successfully
                </div>
              )}
            </CardContent>
          </Card>

          {/* FRPTI Period Comparison */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Period Comparison</CardTitle>
              <CardDescription>Compare FRPTI extracts between two reporting periods</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-end gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Period 1</label>
                  <Input type="month" value={frptiComparePeriod1} onChange={(e) => setFrptiComparePeriod1(e.target.value)} className="w-[200px]" />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Period 2</label>
                  <Input type="month" value={frptiComparePeriod2} onChange={(e) => setFrptiComparePeriod2(e.target.value)} className="w-[200px]" />
                </div>
              </div>
              {frptiCompareQ.isLoading && <div className="py-4"><Skeleton className="h-8 w-full" /></div>}
              {frptiCompareQ.data && (
                <div className="rounded-md border p-4 text-sm">
                  <p className="font-medium mb-2">Comparison Results</p>
                  <pre className="text-xs bg-muted p-3 rounded overflow-x-auto">{JSON.stringify(frptiCompareQ.data, null, 2)}</pre>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================================================================
            TAB: OPERATIONS — SOD/EOD Controls
            ================================================================ */}
        <TabsContent value="operations" className="mt-4 space-y-4">
          {/* SOD Controls */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Start of Day (SOD)</CardTitle>
              <CardDescription>Carry forward closing balances to new business day opening balances</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-end gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Business Date</label>
                  <Input type="date" value={sodDate} onChange={(e) => setSodDate(e.target.value)} className="w-[200px]" />
                </div>
                <Button onClick={() => runSodMut.mutate(sodDate)} disabled={!sodDate || runSodMut.isPending}>
                  <Play className="mr-1 h-4 w-4" />{runSodMut.isPending ? "Running..." : "Run SOD"}
                </Button>
              </div>
              {runSodMut.isSuccess && (
                <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                  <Check className="mr-1 inline h-4 w-4" /> SOD completed successfully
                </div>
              )}
              {runSodMut.isError && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  <AlertTriangle className="mr-1 inline h-4 w-4" /> {(runSodMut.error as Error)?.message ?? "SOD failed"}
                </div>
              )}
            </CardContent>
          </Card>

          {/* EOD Rollback */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">EOD Rollback</CardTitle>
              <CardDescription>Roll back an EOD run by reversing all posted batches from that run</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-end gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium">EOD Run ID</label>
                  <Select value={eodRollbackRunId} onValueChange={setEodRollbackRunId}>
                    <SelectTrigger className="w-[240px]"><SelectValue placeholder="Select EOD run" /></SelectTrigger>
                    <SelectContent>
                      {eodRuns.filter((r) => r.status === "COMPLETED").map((r) => (
                        <SelectItem key={r.id} value={r.id}>Run #{r.id} — {fmtDate(r.business_date)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 flex-1">
                  <label className="text-sm font-medium">Reason</label>
                  <Input value={eodRollbackReason} onChange={(e) => setEodRollbackReason(e.target.value)} placeholder="Reason for rollback" />
                </div>
                <Button variant="destructive" onClick={() => rollbackEodMut.mutate({ runId: eodRollbackRunId, reason: eodRollbackReason })} disabled={!eodRollbackRunId || !eodRollbackReason || rollbackEodMut.isPending}>
                  <RotateCcw className="mr-1 h-4 w-4" />{rollbackEodMut.isPending ? "Rolling back..." : "Rollback EOD"}
                </Button>
              </div>
              {rollbackEodMut.isSuccess && (
                <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                  <Check className="mr-1 inline h-4 w-4" /> EOD rollback completed
                </div>
              )}
              {rollbackEodMut.isError && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  <AlertTriangle className="mr-1 inline h-4 w-4" /> {(rollbackEodMut.error as Error)?.message ?? "Rollback failed"}
                </div>
              )}
            </CardContent>
          </Card>

          {/* EOD Run History */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">EOD Run History</CardTitle>
              <CardDescription>Recent end-of-day processing runs and their status</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {["Run ID", "Business Date", "Status", "Started At", "Completed At", "Rollback"].map((h) => <TableHead key={h}>{h}</TableHead>)}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {eodRunsQ.isLoading ? <SkeletonRows cols={6} /> :
                      eodRuns.length === 0 ? <EmptyRow cols={6} msg="No EOD runs recorded" /> :
                        eodRuns.map((r) => (
                          <TableRow key={r.id}>
                            <TableCell className="font-mono text-sm">#{r.id}</TableCell>
                            <TableCell className="text-sm">{fmtDate(r.business_date)}</TableCell>
                            <TableCell><Badge className={bc(STATUS_COLORS, r.status)}>{r.status}</Badge></TableCell>
                            <TableCell className="text-xs">{r.started_at ? fmtDate(r.started_at) : "\u2014"}</TableCell>
                            <TableCell className="text-xs">{r.completed_at ? fmtDate(r.completed_at) : "\u2014"}</TableCell>
                            <TableCell>
                              {r.rollback_status ? <Badge className={bc(STATUS_COLORS, r.rollback_status)}>{r.rollback_status}</Badge> : "\u2014"}
                            </TableCell>
                          </TableRow>
                        ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================================================================
            TAB: ACCRUALS — Interest Accrual & Amortization
            ================================================================ */}
        <TabsContent value="accruals" className="mt-4 space-y-4">
          {/* Run Controls */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Interest Accrual</CardTitle>
                <CardDescription>Run daily interest accrual across active schedules</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-end gap-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Business Date</label>
                    <Input type="date" value={accrualRunDate} onChange={(e) => setAccrualRunDate(e.target.value)} className="w-[180px]" />
                  </div>
                  <Button onClick={() => runAccrualMut.mutate(accrualRunDate)} disabled={!accrualRunDate || runAccrualMut.isPending}>
                    <Play className="mr-1 h-4 w-4" />{runAccrualMut.isPending ? "Running..." : "Run Accrual"}
                  </Button>
                </div>
                {runAccrualMut.isSuccess && (
                  <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                    <Check className="mr-1 inline h-4 w-4" /> Interest accrual completed
                  </div>
                )}
                {runAccrualMut.isError && (
                  <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                    <AlertTriangle className="mr-1 inline h-4 w-4" /> {(runAccrualMut.error as Error)?.message ?? "Accrual failed"}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Amortization</CardTitle>
                <CardDescription>Run daily amortization for premium/discount schedules</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-end gap-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Business Date</label>
                    <Input type="date" value={amortRunDate} onChange={(e) => setAmortRunDate(e.target.value)} className="w-[180px]" />
                  </div>
                  <Button onClick={() => runAmortMut.mutate(amortRunDate)} disabled={!amortRunDate || runAmortMut.isPending}>
                    <Play className="mr-1 h-4 w-4" />{runAmortMut.isPending ? "Running..." : "Run Amortization"}
                  </Button>
                </div>
                {runAmortMut.isSuccess && (
                  <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                    <Check className="mr-1 inline h-4 w-4" /> Amortization completed
                  </div>
                )}
                {runAmortMut.isError && (
                  <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                    <AlertTriangle className="mr-1 inline h-4 w-4" /> {(runAmortMut.error as Error)?.message ?? "Amortization failed"}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Accrual Schedules */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Interest Accrual Schedules</CardTitle>
              <CardDescription>Active schedules for daily interest accrual processing</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {["ID", "Type", "Day Count", "Coupon Rate", "Face Value", "Frequency", "Effective From", "Effective To"].map((h) => (
                        <TableHead key={h} className={["Coupon Rate", "Face Value"].includes(h) ? "text-right" : ""}>{h}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {accrualSchedulesQ.isLoading ? <SkeletonRows cols={8} /> :
                      accrualSchedules.length === 0 ? <EmptyRow cols={8} msg="No accrual schedules configured" /> :
                        accrualSchedules.map((s) => (
                          <TableRow key={s.id}>
                            <TableCell className="font-mono text-sm">#{s.id}</TableCell>
                            <TableCell><Badge className="bg-blue-100 text-blue-800">{s.accrual_type}</Badge></TableCell>
                            <TableCell className="text-xs">{s.day_count_convention}</TableCell>
                            <TableCell className="text-right font-mono">{(s.coupon_rate * 100).toFixed(4)}%</TableCell>
                            <TableCell className="text-right font-mono">{fmtPHP(s.face_value)}</TableCell>
                            <TableCell className="text-xs">{s.accrual_frequency}</TableCell>
                            <TableCell className="text-xs">{fmtDate(s.effective_from)}</TableCell>
                            <TableCell className="text-xs">{s.effective_to ? fmtDate(s.effective_to) : "\u2014"}</TableCell>
                          </TableRow>
                        ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Amortization Schedules */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Amortization Schedules</CardTitle>
              <CardDescription>Premium/discount amortization tracking for held securities</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {["ID", "Method", "Purchase", "Par Value", "Prem/Disc", "Periods", "Elapsed", "Amortized", "Remaining", "Maturity"].map((h) => (
                        <TableHead key={h} className={["Purchase", "Par Value", "Prem/Disc", "Amortized", "Remaining"].includes(h) ? "text-right" : ""}>{h}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {amortSchedulesQ.isLoading ? <SkeletonRows cols={10} /> :
                      amortSchedules.length === 0 ? <EmptyRow cols={10} msg="No amortization schedules configured" /> :
                        amortSchedules.map((s) => (
                          <TableRow key={s.id}>
                            <TableCell className="font-mono text-sm">#{s.id}</TableCell>
                            <TableCell><Badge className="bg-purple-100 text-purple-800">{s.amortization_method}</Badge></TableCell>
                            <TableCell className="text-right font-mono">{fmtPHP(s.purchase_price)}</TableCell>
                            <TableCell className="text-right font-mono">{fmtPHP(s.par_value)}</TableCell>
                            <TableCell className={`text-right font-mono ${s.premium_discount >= 0 ? "text-green-600" : "text-red-600"}`}>{fmtPHP(s.premium_discount)}</TableCell>
                            <TableCell className="text-center">{s.total_periods}</TableCell>
                            <TableCell className="text-center">{s.periods_elapsed}</TableCell>
                            <TableCell className="text-right font-mono">{fmtPHP(s.amortized_amount)}</TableCell>
                            <TableCell className="text-right font-mono">{fmtPHP(s.remaining_amount)}</TableCell>
                            <TableCell className="text-xs">{fmtDate(s.maturity_date)}</TableCell>
                          </TableRow>
                        ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================================================================
            TAB: AUTHORIZATION — Matrix Config & Approval Queue
            ================================================================ */}
        <TabsContent value="authorization" className="mt-4 space-y-4">
          {/* Authorization Matrix */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Authorization Matrix</CardTitle>
                  <CardDescription>Configure approval tiers based on entity type, action, and amount range</CardDescription>
                </div>
                <Button size="sm" onClick={() => { setNewAuthMatrix({ entity_type: "JOURNAL_BATCH", action: "APPROVE", amount_from: "", amount_to: "", required_approvers: "1", approval_level: "1", role_required: "" }); setCreateAuthMatrixOpen(true); }}>
                  <Plus className="mr-1 h-3 w-3" /> New Rule
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {["Entity Type", "Action", "Amount From", "Amount To", "Approvers", "Level", "Role", "Active"].map((h) => (
                        <TableHead key={h} className={["Amount From", "Amount To", "Approvers", "Level"].includes(h) ? "text-right" : ""}>{h}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {authMatrixQ.isLoading ? <SkeletonRows cols={8} /> :
                      authMatrix.length === 0 ? <EmptyRow cols={8} msg="No authorization rules configured" /> :
                        authMatrix.map((m) => (
                          <TableRow key={m.id}>
                            <TableCell className="text-sm font-medium">{m.entity_type}</TableCell>
                            <TableCell className="text-sm">{m.action}</TableCell>
                            <TableCell className="text-right font-mono">{m.amount_from != null ? fmtPHP(m.amount_from) : "\u2014"}</TableCell>
                            <TableCell className="text-right font-mono">{m.amount_to != null ? fmtPHP(m.amount_to) : "\u2014"}</TableCell>
                            <TableCell className="text-right">{m.required_approvers}</TableCell>
                            <TableCell className="text-right">{m.approval_level}</TableCell>
                            <TableCell className="text-xs">{m.role_required ?? "Any"}</TableCell>
                            <TableCell>{m.is_active ? <Check className="h-4 w-4 text-green-600" /> : <X className="h-4 w-4 text-muted-foreground" />}</TableCell>
                          </TableRow>
                        ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Pending Approvals Queue */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Pending Approvals</CardTitle>
              <CardDescription>Journal batches awaiting authorization</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {["Batch Ref", "Source", "Mode", "Date", "Total DR", "Total CR", "Maker", "Actions"].map((h) => (
                        <TableHead key={h} className={["Total DR", "Total CR"].includes(h) ? "text-right" : ""}>{h}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {authPendingQ.isLoading ? <SkeletonRows cols={8} /> :
                      authPendingBatches.length === 0 ? <EmptyRow cols={8} msg="No batches pending authorization" /> :
                        authPendingBatches.map((b) => (
                          <TableRow key={b.id}>
                            <TableCell className="font-mono text-sm font-medium">{b.batch_ref}</TableCell>
                            <TableCell className="text-sm">{b.source}</TableCell>
                            <TableCell><Badge className={bc(BATCH_MODE_COLORS, b.posting_mode)}>{b.posting_mode}</Badge></TableCell>
                            <TableCell className="text-xs">{fmtDate(b.transaction_date)}</TableCell>
                            <TableCell className="text-right font-mono">{fmtPHP(b.total_debit)}</TableCell>
                            <TableCell className="text-right font-mono">{fmtPHP(b.total_credit)}</TableCell>
                            <TableCell className="text-xs">{b.maker ?? "\u2014"}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Button variant="outline" size="sm" onClick={() => approveBatchMut.mutate(b.id)} disabled={approveBatchMut.isPending}>
                                  <Check className="mr-1 h-3 w-3" /> Approve
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => rejectBatchMut.mutate(b.id)} disabled={rejectBatchMut.isPending}>
                                  <X className="mr-1 h-3 w-3" /> Reject
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ==================================================================
          DIALOGS
          ================================================================== */}

      {/* Create GL Head Dialog */}
      <Dialog open={createHeadOpen} onOpenChange={setCreateHeadOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Create GL Head</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">Code</label>
              <Input value={newHead.code} onChange={(e) => setNewHead({ ...newHead, code: e.target.value })} placeholder="e.g. 1001-001" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Name</label>
              <Input value={newHead.name} onChange={(e) => setNewHead({ ...newHead, name: e.target.value })} placeholder="GL Head name" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">GL Type</label>
              <Select value={newHead.gl_type} onValueChange={(v) => setNewHead({ ...newHead, gl_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["ASSET", "LIABILITY", "INCOME", "EXPENDITURE", "EQUITY"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Category</label>
              <Select value={newHead.category_id} onValueChange={(v) => setNewHead({ ...newHead, category_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.code} - {c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Hierarchy Node</label>
              <Select value={newHead.hierarchy_id} onValueChange={(v) => setNewHead({ ...newHead, hierarchy_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select node" /></SelectTrigger>
                <SelectContent>
                  {hierarchy.length > 0 ? hierarchy.map((n) => <SelectItem key={n.id} value={n.id}>{n.code} - {n.name}</SelectItem>) :
                    <SelectItem value="" disabled>No hierarchy nodes</SelectItem>}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Currency Restriction</label>
              <Input value={newHead.currency_restriction} onChange={(e) => setNewHead({ ...newHead, currency_restriction: e.target.value })} placeholder="e.g. PHP or leave blank" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Opening Date</label>
              <Input type="date" value={newHead.opening_date} onChange={(e) => setNewHead({ ...newHead, opening_date: e.target.value })} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="text-sm font-medium">Description</label>
              <Input value={newHead.description} onChange={(e) => setNewHead({ ...newHead, description: e.target.value })} placeholder="Optional description" />
            </div>
            <div className="flex items-center gap-6 sm:col-span-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={newHead.is_manual_posting_allowed} onChange={(e) => setNewHead({ ...newHead, is_manual_posting_allowed: e.target.checked })} className="rounded" />
                Manual Posting Allowed
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={newHead.is_revaluation_enabled} onChange={(e) => setNewHead({ ...newHead, is_revaluation_enabled: e.target.checked })} className="rounded" />
                Revaluation Enabled
              </label>
            </div>
          </div>
          {createHeadMut.isError && (
            <div className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-800">{(createHeadMut.error as Error)?.message ?? "Creation failed"}</div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateHeadOpen(false)}>Cancel</Button>
            <Button onClick={() => createHeadMut.mutate({ ...newHead })} disabled={!newHead.code || !newHead.name || createHeadMut.isPending}>
              {createHeadMut.isPending ? "Creating..." : "Create GL Head"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Category Dialog */}
      <Dialog open={createCatOpen} onOpenChange={setCreateCatOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Create GL Category</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">Code</label>
              <Input value={newCat.code} onChange={(e) => setNewCat({ ...newCat, code: e.target.value })} placeholder="e.g. CASH-EQUIV" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Name</label>
              <Input value={newCat.name} onChange={(e) => setNewCat({ ...newCat, name: e.target.value })} placeholder="Category name" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Type</label>
              <Select value={newCat.category_type} onValueChange={(v) => setNewCat({ ...newCat, category_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["ASSET", "LIABILITY", "INCOME", "EXPENDITURE", "EQUITY"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-4 pt-6">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={newCat.is_reportable} onChange={(e) => setNewCat({ ...newCat, is_reportable: e.target.checked })} className="rounded" />
                Reportable
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={newCat.is_budgetable} onChange={(e) => setNewCat({ ...newCat, is_budgetable: e.target.checked })} className="rounded" />
                Budgetable
              </label>
            </div>
          </div>
          {createCatMut.isError && (
            <div className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-800">{(createCatMut.error as Error)?.message ?? "Creation failed"}</div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateCatOpen(false)}>Cancel</Button>
            <Button onClick={() => createCatMut.mutate({ ...newCat })} disabled={!newCat.code || !newCat.name || createCatMut.isPending}>
              {createCatMut.isPending ? "Creating..." : "Create Category"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Hierarchy Node Dialog */}
      <Dialog open={createHierOpen} onOpenChange={setCreateHierOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Create Hierarchy Node</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">Code</label>
              <Input value={newHier.code} onChange={(e) => setNewHier({ ...newHier, code: e.target.value })} placeholder="e.g. ASSETS-ROOT" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Name</label>
              <Input value={newHier.name} onChange={(e) => setNewHier({ ...newHier, name: e.target.value })} placeholder="Node name" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Parent Node</label>
              <Select value={newHier.parent_id} onValueChange={(v) => setNewHier({ ...newHier, parent_id: v })}>
                <SelectTrigger><SelectValue placeholder="Root (none)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Root (none)</SelectItem>
                  {hierarchy.map((n) => <SelectItem key={n.id} value={n.id}>{n.code} - {n.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Level</label>
              <Input type="number" min={1} max={10} value={newHier.level} onChange={(e) => setNewHier({ ...newHier, level: parseInt(e.target.value) || 1 })} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Sort Order</label>
              <Input type="number" min={0} value={newHier.sort_order} onChange={(e) => setNewHier({ ...newHier, sort_order: parseInt(e.target.value) || 0 })} />
            </div>
          </div>
          {createHierMut.isError && (
            <div className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-800">{(createHierMut.error as Error)?.message ?? "Creation failed"}</div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateHierOpen(false)}>Cancel</Button>
            <Button onClick={() => createHierMut.mutate({ ...newHier, parent_id: newHier.parent_id || undefined })} disabled={!newHier.code || !newHier.name || createHierMut.isPending}>
              {createHierMut.isPending ? "Creating..." : "Create Node"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create FX Rate Dialog */}
      <Dialog open={createFxOpen} onOpenChange={setCreateFxOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New FX Rate</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">From Currency</label>
              <Input value={newFx.from_currency} onChange={(e) => setNewFx({ ...newFx, from_currency: e.target.value.toUpperCase() })} placeholder="e.g. USD" maxLength={3} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">To Currency</label>
              <Input value={newFx.to_currency} onChange={(e) => setNewFx({ ...newFx, to_currency: e.target.value.toUpperCase() })} placeholder="e.g. PHP" maxLength={3} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Rate</label>
              <Input type="number" step="0.000001" value={newFx.rate} onChange={(e) => setNewFx({ ...newFx, rate: e.target.value })} placeholder="0.000000" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Rate Date</label>
              <Input type="date" value={newFx.rate_date} onChange={(e) => setNewFx({ ...newFx, rate_date: e.target.value })} />
            </div>
          </div>
          {createFxMut.isError && (
            <div className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-800">{(createFxMut.error as Error)?.message ?? "Creation failed"}</div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateFxOpen(false)}>Cancel</Button>
            <Button onClick={() => createFxMut.mutate({ from_currency: newFx.from_currency, to_currency: newFx.to_currency, rate: parseFloat(newFx.rate), rate_date: newFx.rate_date })} disabled={!newFx.from_currency || !newFx.rate || !newFx.rate_date || createFxMut.isPending}>
              {createFxMut.isPending ? "Saving..." : "Save Rate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Year-End Confirmation Dialog */}
      <Dialog open={yeConfirmOpen} onOpenChange={setYeConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Confirm Year-End Close</DialogTitle></DialogHeader>
          <div className="py-4 space-y-3">
            <div className="rounded-md border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
              <AlertTriangle className="mr-1 inline h-4 w-4" />
              <strong>Warning:</strong> Running year-end close is an irreversible operation. This will:
            </div>
            <ul className="list-disc pl-6 text-sm text-muted-foreground space-y-1">
              <li>Close all income and expenditure accounts</li>
              <li>Transfer net income to retained earnings</li>
              <li>Set opening balances for the next financial year</li>
              <li>Lock the current year from further posting</li>
            </ul>
            <p className="text-sm font-medium">Selected Year: <span className="font-mono">{finYears.find((y) => y.id === yeSelectedYear)?.year_label ?? "\u2014"}</span></p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setYeConfirmOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => runYearEndMut.mutate(yeSelectedYear)} disabled={runYearEndMut.isPending}>
              <Lock className="mr-1 h-4 w-4" />{runYearEndMut.isPending ? "Processing..." : "Confirm Year-End Close"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Batch Detail Dialog */}
      <Dialog open={batchDetailOpen} onOpenChange={(v) => { setBatchDetailOpen(v); if (!v) setSelectedBatchId(null); }}>
        <DialogContent className="max-w-4xl">
          <DialogHeader><DialogTitle>Batch Details {batchDetailQ.data?.batch_ref ? `\u2014 ${batchDetailQ.data.batch_ref}` : ""}</DialogTitle></DialogHeader>
          {batchDetailQ.isLoading ? (
            <div className="space-y-2 py-4"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-3/4" /><Skeleton className="h-8 w-1/2" /></div>
          ) : batchDetailQ.data ? (
            <div className="space-y-4 py-4">
              <div className="grid gap-3 sm:grid-cols-3 text-sm">
                <div><span className="text-muted-foreground">Source:</span> <span className="font-medium">{batchDetailQ.data.source}</span></div>
                <div><span className="text-muted-foreground">Mode:</span> <Badge className={bc(BATCH_MODE_COLORS, batchDetailQ.data.posting_mode)}>{batchDetailQ.data.posting_mode}</Badge></div>
                <div><span className="text-muted-foreground">Status:</span> <Badge className={bc(STATUS_COLORS, batchDetailQ.data.status)}>{batchDetailQ.data.status.replace(/_/g, " ")}</Badge></div>
                <div><span className="text-muted-foreground">Date:</span> <span>{fmtDate(batchDetailQ.data.transaction_date)}</span></div>
                <div><span className="text-muted-foreground">Total DR:</span> <span className="font-mono font-medium">{fmtPHP(batchDetailQ.data.total_debit)}</span></div>
                <div><span className="text-muted-foreground">Total CR:</span> <span className="font-mono font-medium">{fmtPHP(batchDetailQ.data.total_credit)}</span></div>
                <div><span className="text-muted-foreground">Maker:</span> <span>{batchDetailQ.data.maker ?? "\u2014"}</span></div>
                <div><span className="text-muted-foreground">Checker:</span> <span>{batchDetailQ.data.checker ?? "\u2014"}</span></div>
              </div>
              <Separator />
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {["DR/CR", "GL Code", "GL Name", "Amount", "Currency", "Narration"].map((h) => (
                        <TableHead key={h} className={h === "Amount" ? "text-right" : ""}>{h}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(batchDetailQ.data.lines ?? []).length === 0 ? <EmptyRow cols={6} msg="No lines in this batch" /> :
                      batchDetailQ.data.lines.map((l) => (
                        <TableRow key={l.id}>
                          <TableCell>
                            <Badge className={l.dr_cr === "DR" ? "bg-blue-100 text-blue-800" : "bg-purple-100 text-purple-800"}>{l.dr_cr}</Badge>
                          </TableCell>
                          <TableCell className="font-mono text-sm">{l.gl_head_code}</TableCell>
                          <TableCell className="text-sm">{l.gl_head_name ?? "\u2014"}</TableCell>
                          <TableCell className="text-right font-mono">{fmtPHP(l.amount)}</TableCell>
                          <TableCell className="text-xs">{l.currency}</TableCell>
                          <TableCell className="max-w-[200px] truncate text-xs">{l.narration ?? "\u2014"}</TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">No batch data available</div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchDetailOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Auth Matrix Rule Dialog */}
      <Dialog open={createAuthMatrixOpen} onOpenChange={setCreateAuthMatrixOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Create Authorization Rule</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">Entity Type</label>
              <Select value={newAuthMatrix.entity_type} onValueChange={(v) => setNewAuthMatrix({ ...newAuthMatrix, entity_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["JOURNAL_BATCH", "MANUAL_JOURNAL", "FX_REVALUATION", "YEAR_END"].map((t) => <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Action</label>
              <Select value={newAuthMatrix.action} onValueChange={(v) => setNewAuthMatrix({ ...newAuthMatrix, action: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["APPROVE", "REJECT", "CANCEL", "REVERSE"].map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Amount From</label>
              <Input type="number" value={newAuthMatrix.amount_from} onChange={(e) => setNewAuthMatrix({ ...newAuthMatrix, amount_from: e.target.value })} placeholder="0.00" step="0.01" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Amount To</label>
              <Input type="number" value={newAuthMatrix.amount_to} onChange={(e) => setNewAuthMatrix({ ...newAuthMatrix, amount_to: e.target.value })} placeholder="No limit" step="0.01" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Required Approvers</label>
              <Input type="number" min={1} max={10} value={newAuthMatrix.required_approvers} onChange={(e) => setNewAuthMatrix({ ...newAuthMatrix, required_approvers: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Approval Level</label>
              <Input type="number" min={1} max={5} value={newAuthMatrix.approval_level} onChange={(e) => setNewAuthMatrix({ ...newAuthMatrix, approval_level: e.target.value })} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="text-sm font-medium">Role Required (optional)</label>
              <Input value={newAuthMatrix.role_required} onChange={(e) => setNewAuthMatrix({ ...newAuthMatrix, role_required: e.target.value })} placeholder="e.g. GL_SUPERVISOR" />
            </div>
          </div>
          {createAuthMatrixMut.isError && (
            <div className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-800">{(createAuthMatrixMut.error as Error)?.message ?? "Creation failed"}</div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateAuthMatrixOpen(false)}>Cancel</Button>
            <Button onClick={() => createAuthMatrixMut.mutate({
              entity_type: newAuthMatrix.entity_type,
              action: newAuthMatrix.action,
              amount_from: newAuthMatrix.amount_from ? parseFloat(newAuthMatrix.amount_from) : undefined,
              amount_to: newAuthMatrix.amount_to ? parseFloat(newAuthMatrix.amount_to) : undefined,
              required_approvers: parseInt(newAuthMatrix.required_approvers) || 1,
              approval_level: parseInt(newAuthMatrix.approval_level) || 1,
              role_required: newAuthMatrix.role_required || undefined,
            })} disabled={createAuthMatrixMut.isPending}>
              {createAuthMatrixMut.isPending ? "Creating..." : "Create Rule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Financial Period Dialog */}
      <Dialog open={createPeriodOpen} onOpenChange={setCreatePeriodOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Create Financial Period</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <label className="text-sm font-medium">Period Label</label>
              <Input value={newPeriod.period_label} onChange={(e) => setNewPeriod({ ...newPeriod, period_label: e.target.value })} placeholder="e.g. 2026-Q1 or 2026-01" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Start Date</label>
              <Input type="date" value={newPeriod.start_date} onChange={(e) => setNewPeriod({ ...newPeriod, start_date: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">End Date</label>
              <Input type="date" value={newPeriod.end_date} onChange={(e) => setNewPeriod({ ...newPeriod, end_date: e.target.value })} />
            </div>
          </div>
          {createPeriodMut.isError && (
            <div className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-800">{(createPeriodMut.error as Error)?.message ?? "Creation failed"}</div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreatePeriodOpen(false)}>Cancel</Button>
            <Button onClick={() => createPeriodMut.mutate({ ...newPeriod })} disabled={!newPeriod.period_label || !newPeriod.start_date || !newPeriod.end_date || createPeriodMut.isPending}>
              {createPeriodMut.isPending ? "Creating..." : "Create Period"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
