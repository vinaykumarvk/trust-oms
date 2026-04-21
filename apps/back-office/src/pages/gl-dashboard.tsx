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
  const recentBatchesQ = useQuery<JournalBatch[]>({
    queryKey: ["gl-recent-batches"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/gl/posting/batches?limit=20")),
    refetchInterval: 30_000, enabled: tab === "overview",
  });
  const recentBatches: JournalBatch[] = recentBatchesQ.data?.data ?? recentBatchesQ.data ?? [];

  // Exceptions (overview)
  const exceptionsQ = useQuery<GLException[]>({
    queryKey: ["gl-exceptions"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/gl/gl-exceptions")),
    refetchInterval: 30_000, enabled: tab === "overview",
  });
  const exceptions: GLException[] = exceptionsQ.data?.data ?? exceptionsQ.data ?? [];

  // GL Heads
  const glHeadsQ = useQuery<GLHead[]>({
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
  const categoriesQ = useQuery<GLCategory[]>({
    queryKey: ["gl-categories"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/gl/gl-categories")),
    refetchInterval: 30_000, enabled: tab === "categories" || tab === "coa",
  });
  const categories: GLCategory[] = categoriesQ.data?.data ?? categoriesQ.data ?? [];

  // Hierarchy
  const hierarchyQ = useQuery<GLHierarchyNode[]>({
    queryKey: ["gl-hierarchy"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/gl/gl-hierarchy")),
    refetchInterval: 30_000, enabled: tab === "categories",
  });
  const hierarchy: GLHierarchyNode[] = hierarchyQ.data?.data ?? hierarchyQ.data ?? [];

  // Accounting Units
  const auQ = useQuery<AccountingUnit[]>({
    queryKey: ["gl-accounting-units"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/gl/accounting-units")),
    refetchInterval: 60_000,
  });
  const accountingUnits: AccountingUnit[] = auQ.data?.data ?? auQ.data ?? [];

  // Batches (tab)
  const batchesQ = useQuery<JournalBatch[]>({
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
  const trialBalQ = useQuery<TrialBalanceRow[]>({
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
  const balSheetQ = useQuery<BalanceSheetRow[]>({
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
  const incStmtQ = useQuery<IncomeStatementRow[]>({
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
  const fxRatesQ = useQuery<FXRate[]>({
    queryKey: ["gl-fx-rates"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/gl/fx-rates")),
    refetchInterval: 30_000, enabled: tab === "fx",
  });
  const fxRates: FXRate[] = fxRatesQ.data?.data ?? fxRatesQ.data ?? [];

  // Revaluation Runs
  const revalRunsQ = useQuery<RevalRun[]>({
    queryKey: ["gl-reval-runs"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/gl/fx-revaluation/runs")),
    refetchInterval: 30_000, enabled: tab === "fx",
  });
  const revalRuns: RevalRun[] = revalRunsQ.data?.data ?? revalRunsQ.data ?? [];

  // Financial Years
  const finYearsQ = useQuery<FinancialYear[]>({
    queryKey: ["gl-financial-years"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/gl/financial-years")),
    refetchInterval: 30_000, enabled: tab === "yearend",
  });
  const finYears: FinancialYear[] = finYearsQ.data?.data ?? finYearsQ.data ?? [];

  // FRPTI Mappings
  const frptiQ = useQuery<FRPTIMapping[]>({
    queryKey: ["gl-frpti-mappings"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/gl/frpti-mappings")),
    refetchInterval: 30_000, enabled: tab === "frpti",
  });
  const frptiMappings: FRPTIMapping[] = frptiQ.data?.data ?? frptiQ.data ?? [];

  const filteredFrpti = useMemo(() => {
    if (frptiSchedule === "ALL") return frptiMappings;
    return frptiMappings.filter((m) => m.schedule === frptiSchedule);
  }, [frptiMappings, frptiSchedule]);

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

          {/* Period Close Controls */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Period Close Controls</CardTitle>
              <CardDescription>Monthly and quarterly period management for GL posting restrictions</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex h-32 items-center justify-center rounded-md border border-dashed text-muted-foreground">
                <div className="text-center">
                  <Calendar className="mx-auto mb-2 h-8 w-8" />
                  <p className="text-sm">Period close management</p>
                  <p className="text-xs">Close/open individual months and quarters for posting control</p>
                </div>
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
    </div>
  );
}
