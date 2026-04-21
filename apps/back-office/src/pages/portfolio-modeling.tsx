/**
 * Portfolio Modeling & Rebalancing Workbench — Phase 3H (BRD Screen #25)
 * Model portfolio management, deviation analysis, rebalancing wizard,
 * what-if / stress-test simulations, and rebalancing run history.
 * Auto-refreshes runs every 30s.
 */
import { useState } from "react";
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
  PieChart, GitCompareArrows, Scale, FlaskConical, History,
  RefreshCw, Plus, Trash2, Pencil, Search, CheckCircle, Play, ArrowRight,
} from "lucide-react";

/* ---------- Types ---------- */
interface Allocation {
  asset_class: string;
  target_pct: number;
  min_pct: number;
  max_pct: number;
}

interface ModelPortfolio {
  id: string;
  name: string;
  description: string;
  allocations: Allocation[];
  active: boolean;
}

interface Deviation {
  asset_class: string;
  target_pct: number;
  actual_pct: number;
  deviation_pct: number;
}

interface RebalanceAction {
  security: string;
  ticker: string;
  asset_class: string;
  side: "BUY" | "SELL";
  quantity: number;
  estimated_value: number;
}

interface WhatIfResult {
  current: { roi: number; yield: number; duration: number; trading_pnl: number };
  projected: { roi: number; yield: number; duration: number; trading_pnl: number };
}

interface StressResult {
  metric: string;
  current_value: number;
  stressed_value: number;
  impact_pct: number;
}

interface RebalancingRun {
  id: string;
  portfolios: string[];
  model_name: string;
  run_type: string;
  status: string;
  created_at: string;
}

interface ProposedTrade {
  security: string;
  side: "BUY" | "SELL";
  qty: number;
  price: number;
}

/* ---------- Helpers ---------- */
const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-muted text-foreground",
  PENDING: "bg-yellow-100 text-yellow-800",
  APPROVED: "bg-blue-100 text-blue-800",
  EXECUTED: "bg-green-100 text-green-800",
  CANCELLED: "bg-red-100 text-red-800",
};

const fmtPct = (v: number) => `${v.toFixed(2)}%`;
const fmtPHP = (n: number) =>
  n.toLocaleString("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2 });
const fmtDate = (d: string) => {
  try {
    return new Date(d).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return d;
  }
};
const fmtQty = (n: number) => n.toLocaleString("en-PH", { maximumFractionDigits: 4 });
const bc = (map: Record<string, string>, key: string) => map[key] ?? "bg-muted text-foreground";

function SkeletonRows({ cols, rows = 5 }: { cols: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <TableRow key={i}>
          {Array.from({ length: cols }).map((_, j) => (
            <TableCell key={j}><Skeleton className="h-4 w-16" /></TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

function EmptyRow({ cols, msg }: { cols: number; msg: string }) {
  return (
    <TableRow>
      <TableCell colSpan={cols} className="py-8 text-center text-muted-foreground">{msg}</TableCell>
    </TableRow>
  );
}

const EMPTY_ALLOC: Allocation = { asset_class: "", target_pct: 0, min_pct: 0, max_pct: 0 };

const STRESS_SCENARIOS = [
  { value: "INTEREST_RATE_SHOCK", label: "Interest Rate Shock" },
  { value: "EQUITY_CRASH", label: "Equity Crash" },
  { value: "CREDIT_WIDENING", label: "Credit Widening" },
  { value: "CURRENCY_DEVALUATION", label: "Currency Devaluation" },
];

/* ========== Main Component ========== */
export default function PortfolioModeling() {
  const qc = useQueryClient();
  const [tab, setTab] = useState("models");

  /* --- Models tab state --- */
  const [modelOpen, setModelOpen] = useState(false);
  const [editingModel, setEditingModel] = useState<ModelPortfolio | null>(null);
  const [modelForm, setModelForm] = useState({ name: "", description: "" });
  const [allocRows, setAllocRows] = useState<Allocation[]>([{ ...EMPTY_ALLOC }]);

  /* --- Compare tab state --- */
  const [compareModelId, setCompareModelId] = useState("");
  const [comparePortfolioId, setComparePortfolioId] = useState("");
  const [compareEnabled, setCompareEnabled] = useState(false);

  /* --- Rebalance tab state --- */
  const [rebalStep, setRebalStep] = useState(1);
  const [rebalModelId, setRebalModelId] = useState("");
  const [rebalPortfolioId, setRebalPortfolioId] = useState("");
  const [rebalPortfolioIds, setRebalPortfolioIds] = useState("");
  const [rebalRunType, setRebalRunType] = useState("SIMULATION");
  const [rebalIncludeHeld, setRebalIncludeHeld] = useState(false);
  const [rebalIsGroup, setRebalIsGroup] = useState(false);

  /* --- Simulation tab state --- */
  const [whatIfPortfolioId, setWhatIfPortfolioId] = useState("");
  const [proposedTrades, setProposedTrades] = useState<ProposedTrade[]>([
    { security: "", side: "BUY", qty: 0, price: 0 },
  ]);
  const [stressPortfolioId, setStressPortfolioId] = useState("");
  const [stressScenario, setStressScenario] = useState("INTEREST_RATE_SHOCK");

  /* ========== Queries ========== */
  const modelsQ = useQuery<ModelPortfolio[]>({
    queryKey: ["models"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/rebalancing/models")),
  });
  const models = modelsQ.data?.data ?? [];

  const compareQ = useQuery<Deviation[]>({
    queryKey: ["rebalancing-compare", compareModelId, comparePortfolioId],
    queryFn: () =>
      apiRequest("GET", apiUrl(`/api/v1/rebalancing/models/${compareModelId}/compare/${comparePortfolioId}`)),
    enabled: compareEnabled && !!compareModelId && !!comparePortfolioId,
  });
  const deviations = compareQ.data?.data ?? [];

  const actionsQ = useQuery<RebalanceAction[]>({
    queryKey: ["rebalancing-actions", rebalModelId, rebalPortfolioId],
    queryFn: () =>
      apiRequest("GET", apiUrl(`/api/v1/rebalancing/models/${rebalModelId}/actions/${rebalPortfolioId}`)),
    enabled: rebalStep === 2 && !!rebalModelId && !!rebalPortfolioId,
  });
  const actions = actionsQ.data?.data ?? [];

  const runsQ = useQuery<RebalancingRun[]>({
    queryKey: ["rebalancing-runs"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/rebalancing/runs")),
    refetchInterval: 30_000,
    enabled: tab === "history",
  });
  const runs = runsQ.data?.data ?? [];

  /* ========== Mutations ========== */
  const invalidateModels = () => qc.invalidateQueries({ queryKey: ["models"] });

  const createModelMut = useMutation({
    mutationFn: (body: { name: string; description: string; allocations: Allocation[] }) =>
      apiRequest("POST", apiUrl("/api/v1/rebalancing/models"), body),
    onSuccess: () => { invalidateModels(); closeModelDialog(); },
  });

  const updateModelMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { name: string; description: string; allocations: Allocation[] } }) =>
      apiRequest("PUT", apiUrl(`/api/v1/rebalancing/models/${id}`), body),
    onSuccess: () => { invalidateModels(); closeModelDialog(); },
  });

  const deleteModelMut = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", apiUrl(`/api/v1/rebalancing/models/${id}`)),
    onSuccess: invalidateModels,
  });

  const whatIfMut = useMutation<WhatIfResult, Error, { portfolioId: string; proposedTrades: ProposedTrade[] }>({
    mutationFn: (body) => apiRequest("POST", apiUrl("/api/v1/rebalancing/simulate/what-if"), body),
  });

  const stressMut = useMutation<StressResult[], Error, { portfolioId: string; scenario: string }>({
    mutationFn: (body) => apiRequest("POST", apiUrl("/api/v1/rebalancing/simulate/stress-test"), body),
  });

  const rebalSingleMut = useMutation({
    mutationFn: (body: { portfolioId: string; modelId: string; runType: string; includeHeldAway: boolean }) =>
      apiRequest("POST", apiUrl("/api/v1/rebalancing/rebalance/single"), body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["rebalancing-runs"] }); setRebalStep(3); },
  });

  const rebalGroupMut = useMutation({
    mutationFn: (body: { portfolioIds: string[]; modelId: string; runType: string }) =>
      apiRequest("POST", apiUrl("/api/v1/rebalancing/rebalance/group"), body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["rebalancing-runs"] }); setRebalStep(3); },
  });

  const approveMut = useMutation({
    mutationFn: (id: string) => apiRequest("POST", apiUrl(`/api/v1/rebalancing/runs/${id}/approve`)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rebalancing-runs"] }),
  });

  const executeMut = useMutation({
    mutationFn: (id: string) => apiRequest("POST", apiUrl(`/api/v1/rebalancing/runs/${id}/execute`)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rebalancing-runs"] }),
  });

  /* ========== Dialog helpers ========== */
  function openCreateModel() {
    setEditingModel(null);
    setModelForm({ name: "", description: "" });
    setAllocRows([{ ...EMPTY_ALLOC }]);
    setModelOpen(true);
  }

  function openEditModel(m: ModelPortfolio) {
    setEditingModel(m);
    setModelForm({ name: m.name, description: m.description });
    setAllocRows(m.allocations.length > 0 ? m.allocations.map((a) => ({ ...a })) : [{ ...EMPTY_ALLOC }]);
    setModelOpen(true);
  }

  function closeModelDialog() {
    setModelOpen(false);
    setEditingModel(null);
  }

  function saveModel() {
    const allocs = allocRows.filter((a) => a.asset_class.trim() !== "");
    const body = { name: modelForm.name, description: modelForm.description, allocations: allocs };
    if (editingModel) {
      updateModelMut.mutate({ id: editingModel.id, body });
    } else {
      createModelMut.mutate(body);
    }
  }

  function addAllocRow() {
    setAllocRows((prev) => [...prev, { ...EMPTY_ALLOC }]);
  }

  function removeAllocRow(idx: number) {
    setAllocRows((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateAllocRow(idx: number, field: keyof Allocation, value: string | number) {
    setAllocRows((prev) =>
      prev.map((row, i) =>
        i === idx ? { ...row, [field]: typeof value === "string" && field !== "asset_class" ? parseFloat(value) || 0 : value } : row,
      ),
    );
  }

  function handleCompare() {
    setCompareEnabled(true);
    compareQ.refetch();
  }

  function submitRebalance() {
    if (rebalIsGroup) {
      const ids = rebalPortfolioIds.split(",").map((s) => s.trim()).filter(Boolean);
      rebalGroupMut.mutate({ portfolioIds: ids, modelId: rebalModelId, runType: rebalRunType });
    } else {
      rebalSingleMut.mutate({
        portfolioId: rebalPortfolioId,
        modelId: rebalModelId,
        runType: rebalRunType,
        includeHeldAway: rebalIncludeHeld,
      });
    }
  }

  const isSaving = createModelMut.isPending || updateModelMut.isPending;

  /* ========== Render ========== */
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <PieChart className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Portfolio Modeling & Rebalancing</h1>
            <p className="text-sm text-muted-foreground">
              Model portfolios, deviation analysis, rebalancing, and simulation tools
            </p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => { modelsQ.refetch(); runsQ.refetch(); }} disabled={modelsQ.isFetching}>
          <RefreshCw className={`h-4 w-4 ${modelsQ.isFetching ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <Separator />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="models"><PieChart className="mr-1 h-4 w-4" /> Models</TabsTrigger>
          <TabsTrigger value="compare"><GitCompareArrows className="mr-1 h-4 w-4" /> Compare</TabsTrigger>
          <TabsTrigger value="rebalance"><Scale className="mr-1 h-4 w-4" /> Rebalance</TabsTrigger>
          <TabsTrigger value="simulation"><FlaskConical className="mr-1 h-4 w-4" /> Simulation</TabsTrigger>
          <TabsTrigger value="history"><History className="mr-1 h-4 w-4" /> History</TabsTrigger>
        </TabsList>

        {/* ==================== MODELS TAB ==================== */}
        <TabsContent value="models" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Model Portfolios</CardTitle>
                <Button size="sm" onClick={openCreateModel}><Plus className="mr-1 h-3 w-3" /> Create Model</Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {["Name", "Description", "# Allocations", "Status", "Actions"].map((h) => (
                        <TableHead key={h}>{h}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {modelsQ.isLoading ? (
                      <SkeletonRows cols={5} />
                    ) : models.length === 0 ? (
                      <EmptyRow cols={5} msg="No model portfolios defined" />
                    ) : (
                      models.map((m) => (
                        <TableRow key={m.id}>
                          <TableCell className="font-medium">{m.name}</TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-[300px] truncate">
                            {m.description || "\u2014"}
                          </TableCell>
                          <TableCell className="font-mono">{m.allocations?.length ?? 0}</TableCell>
                          <TableCell>
                            <Badge className={m.active ? "bg-green-100 text-green-800" : "bg-muted text-foreground"}>
                              {m.active ? "Active" : "Inactive"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="outline" size="sm" onClick={() => openEditModel(m)}>
                                <Pencil className="mr-1 h-3 w-3" /> Edit
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => deleteModelMut.mutate(m.id)}
                                disabled={deleteModelMut.isPending}
                              >
                                <Trash2 className="mr-1 h-3 w-3" /> Delete
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ==================== COMPARE TAB ==================== */}
        <TabsContent value="compare" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Portfolio vs. Model Comparison</CardTitle>
              <CardDescription>Select a model and portfolio to see allocation deviations</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-end gap-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Model Portfolio</label>
                  <Select value={compareModelId} onValueChange={(v) => { setCompareModelId(v); setCompareEnabled(false); }}>
                    <SelectTrigger className="w-[250px]"><SelectValue placeholder="Select model" /></SelectTrigger>
                    <SelectContent>
                      {models.map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Portfolio ID</label>
                  <Input
                    value={comparePortfolioId}
                    onChange={(e) => { setComparePortfolioId(e.target.value); setCompareEnabled(false); }}
                    placeholder="Enter portfolio ID"
                    className="w-[250px]"
                  />
                </div>
                <Button onClick={handleCompare} disabled={!compareModelId || !comparePortfolioId || compareQ.isFetching}>
                  <Search className="mr-1 h-4 w-4" /> Compare
                </Button>
              </div>
            </CardContent>
          </Card>

          {compareQ.isLoading && (
            <Card><CardContent className="pt-6"><div className="space-y-2"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-3/4" /></div></CardContent></Card>
          )}

          {deviations.length > 0 && (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Deviation Analysis</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {["Asset Class", "Target %", "Actual %", "Deviation %", "Status"].map((h) => (
                          <TableHead key={h} className={["Target %", "Actual %", "Deviation %"].includes(h) ? "text-right" : ""}>{h}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {deviations.map((d) => (
                        <TableRow key={d.asset_class}>
                          <TableCell className="font-medium">{d.asset_class}</TableCell>
                          <TableCell className="text-right font-mono">{fmtPct(d.target_pct)}</TableCell>
                          <TableCell className="text-right font-mono">{fmtPct(d.actual_pct)}</TableCell>
                          <TableCell className="text-right font-mono">{fmtPct(d.deviation_pct)}</TableCell>
                          <TableCell>
                            <Badge className={d.deviation_pct > 0 ? "bg-red-100 text-red-800" : d.deviation_pct < 0 ? "bg-green-100 text-green-800" : "bg-muted text-foreground"}>
                              {d.deviation_pct > 0 ? "Over" : d.deviation_pct < 0 ? "Under" : "On Target"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Bar Visualization */}
                <div className="space-y-3">
                  <p className="text-sm font-medium">Target vs. Actual Allocation</p>
                  {deviations.map((d) => (
                    <div key={d.asset_class} className="space-y-1">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{d.asset_class}</span>
                        <span>Target {fmtPct(d.target_pct)} | Actual {fmtPct(d.actual_pct)}</span>
                      </div>
                      <div className="relative h-4 rounded bg-muted">
                        <div
                          className="absolute inset-y-0 left-0 rounded bg-blue-400/60"
                          style={{ width: `${Math.min(d.target_pct, 100)}%` }}
                        />
                        <div
                          className="absolute inset-y-0 left-0 rounded bg-primary/80"
                          style={{ width: `${Math.min(d.actual_pct, 100)}%`, height: "60%", top: "20%" }}
                        />
                      </div>
                      <div className="flex gap-4 text-[10px] text-muted-foreground">
                        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded bg-blue-400/60" /> Target</span>
                        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded bg-primary/80" /> Actual</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ==================== REBALANCE TAB ==================== */}
        <TabsContent value="rebalance" className="mt-4 space-y-4">
          {/* Wizard steps indicator */}
          <div className="flex items-center gap-2 text-sm">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center gap-2">
                {s > 1 && <ArrowRight className="h-4 w-4 text-muted-foreground" />}
                <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${rebalStep >= s ? "bg-primary text-white" : "bg-muted text-muted-foreground"}`}>
                  {s}
                </div>
                <span className={rebalStep >= s ? "font-medium" : "text-muted-foreground"}>
                  {s === 1 ? "Select" : s === 2 ? "Preview" : "Execute"}
                </span>
              </div>
            ))}
          </div>

          {/* Step 1: Select */}
          {rebalStep === 1 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Step 1 - Select Model & Portfolio(s)</CardTitle>
                <CardDescription>Choose a model portfolio and the portfolio(s) to rebalance</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Model Portfolio</label>
                  <Select value={rebalModelId} onValueChange={setRebalModelId}>
                    <SelectTrigger className="w-[300px]"><SelectValue placeholder="Select model" /></SelectTrigger>
                    <SelectContent>
                      {models.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium">Group Rebalance</label>
                  <input
                    type="checkbox"
                    checked={rebalIsGroup}
                    onChange={(e) => setRebalIsGroup(e.target.checked)}
                    className="h-4 w-4 rounded border-border"
                  />
                </div>

                {rebalIsGroup ? (
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Portfolio IDs (comma-separated)</label>
                    <Input
                      value={rebalPortfolioIds}
                      onChange={(e) => setRebalPortfolioIds(e.target.value)}
                      placeholder="portfolio-1, portfolio-2, ..."
                      className="w-[400px]"
                    />
                  </div>
                ) : (
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Portfolio ID</label>
                    <Input
                      value={rebalPortfolioId}
                      onChange={(e) => setRebalPortfolioId(e.target.value)}
                      placeholder="Enter portfolio ID"
                      className="w-[300px]"
                    />
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-sm font-medium">Run Type</label>
                  <Select value={rebalRunType} onValueChange={setRebalRunType}>
                    <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SIMULATION">Simulation</SelectItem>
                      <SelectItem value="LIVE">Live</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {!rebalIsGroup && (
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={rebalIncludeHeld}
                      onChange={(e) => setRebalIncludeHeld(e.target.checked)}
                      className="h-4 w-4 rounded border-border"
                    />
                    <label className="text-sm font-medium">Include held-away assets</label>
                  </div>
                )}

                <Separator />
                <Button
                  onClick={() => setRebalStep(2)}
                  disabled={!rebalModelId || (rebalIsGroup ? !rebalPortfolioIds.trim() : !rebalPortfolioId.trim())}
                >
                  Next: Preview Trades <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Step 2: Preview Trades */}
          {rebalStep === 2 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Step 2 - Preview Generated Trades</CardTitle>
                <CardDescription>
                  Review the rebalancing blotter before submitting
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {actionsQ.isLoading ? (
                  <div className="space-y-2"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-3/4" /></div>
                ) : actions.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">No rebalancing actions generated. Portfolio may already be aligned with the model.</p>
                ) : (
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {["Security", "Ticker", "Asset Class", "Side", "Quantity", "Estimated Value"].map((h) => (
                            <TableHead key={h} className={["Quantity", "Estimated Value"].includes(h) ? "text-right" : ""}>{h}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {actions.map((a, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-medium">{a.security}</TableCell>
                            <TableCell className="font-mono text-sm">{a.ticker}</TableCell>
                            <TableCell>{a.asset_class}</TableCell>
                            <TableCell>
                              <Badge className={a.side === "BUY" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}>
                                {a.side}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-mono">{fmtQty(a.quantity)}</TableCell>
                            <TableCell className="text-right font-mono">{fmtPHP(a.estimated_value)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setRebalStep(1)}>Back</Button>
                  <Button
                    onClick={submitRebalance}
                    disabled={rebalSingleMut.isPending || rebalGroupMut.isPending}
                  >
                    <Play className="mr-1 h-4 w-4" />
                    {rebalSingleMut.isPending || rebalGroupMut.isPending ? "Submitting..." : "Submit Rebalance"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 3: Approve & Execute */}
          {rebalStep === 3 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Step 3 - Approve & Execute</CardTitle>
                <CardDescription>Rebalancing run submitted. Approve and execute from the History tab or manage below.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border bg-green-50 p-4 text-center">
                  <CheckCircle className="mx-auto h-8 w-8 text-green-600" />
                  <p className="mt-2 text-sm font-medium text-green-800">Rebalancing run created successfully</p>
                  <p className="mt-1 text-xs text-green-600">Navigate to the History tab to approve and execute, or start a new rebalance.</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => { setRebalStep(1); setTab("history"); }}>
                    View History
                  </Button>
                  <Button onClick={() => setRebalStep(1)}>New Rebalance</Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ==================== SIMULATION TAB ==================== */}
        <TabsContent value="simulation" className="mt-4 space-y-4">
          {/* What-If Panel */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">What-If Analysis</CardTitle>
              <CardDescription>Simulate proposed trades and see projected portfolio metrics</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">Portfolio ID</label>
                <Input
                  value={whatIfPortfolioId}
                  onChange={(e) => setWhatIfPortfolioId(e.target.value)}
                  placeholder="Enter portfolio ID"
                  className="w-[300px]"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Proposed Trades</label>
                {proposedTrades.map((t, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input
                      placeholder="Security"
                      value={t.security}
                      onChange={(e) => {
                        const updated = [...proposedTrades];
                        updated[idx] = { ...updated[idx], security: e.target.value };
                        setProposedTrades(updated);
                      }}
                      className="w-[180px]"
                    />
                    <Select
                      value={t.side}
                      onValueChange={(v) => {
                        const updated = [...proposedTrades];
                        updated[idx] = { ...updated[idx], side: v as "BUY" | "SELL" };
                        setProposedTrades(updated);
                      }}
                    >
                      <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="BUY">BUY</SelectItem>
                        <SelectItem value="SELL">SELL</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      placeholder="Qty"
                      value={t.qty || ""}
                      onChange={(e) => {
                        const updated = [...proposedTrades];
                        updated[idx] = { ...updated[idx], qty: parseFloat(e.target.value) || 0 };
                        setProposedTrades(updated);
                      }}
                      className="w-[100px]"
                    />
                    <Input
                      type="number"
                      placeholder="Price"
                      value={t.price || ""}
                      onChange={(e) => {
                        const updated = [...proposedTrades];
                        updated[idx] = { ...updated[idx], price: parseFloat(e.target.value) || 0 };
                        setProposedTrades(updated);
                      }}
                      className="w-[100px]"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setProposedTrades((prev) => prev.filter((_, i) => i !== idx))}
                      disabled={proposedTrades.length <= 1}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => setProposedTrades((prev) => [...prev, { security: "", side: "BUY", qty: 0, price: 0 }])}>
                  <Plus className="mr-1 h-3 w-3" /> Add Trade
                </Button>
              </div>

              <Button
                onClick={() => whatIfMut.mutate({ portfolioId: whatIfPortfolioId, proposedTrades })}
                disabled={!whatIfPortfolioId || whatIfMut.isPending}
              >
                <FlaskConical className="mr-1 h-4 w-4" />
                {whatIfMut.isPending ? "Simulating..." : "Simulate"}
              </Button>

              {whatIfMut.data && (
                <>
                  <Separator />
                  <div className="grid gap-4 sm:grid-cols-2">
                    {(["roi", "yield", "duration", "trading_pnl"] as const).map((metric) => {
                      const current = whatIfMut.data.current[metric];
                      const projected = whatIfMut.data.projected[metric];
                      const label = metric === "trading_pnl" ? "Trading P&L" : metric === "roi" ? "ROI" : metric.charAt(0).toUpperCase() + metric.slice(1);
                      return (
                        <div key={metric} className="rounded-lg border p-3">
                          <p className="text-xs font-medium text-muted-foreground mb-2">{label}</p>
                          <div className="flex items-center justify-between">
                            <div className="text-center">
                              <p className="text-xs text-muted-foreground">Current</p>
                              <p className="font-mono text-sm font-bold">{metric === "trading_pnl" ? fmtPHP(current) : fmtPct(current)}</p>
                            </div>
                            <ArrowRight className="h-4 w-4 text-muted-foreground" />
                            <div className="text-center">
                              <p className="text-xs text-muted-foreground">Projected</p>
                              <p className={`font-mono text-sm font-bold ${projected >= current ? "text-green-700" : "text-red-700"}`}>
                                {metric === "trading_pnl" ? fmtPHP(projected) : fmtPct(projected)}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Stress Test Panel */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Stress Test</CardTitle>
              <CardDescription>Run predefined stress scenarios against a portfolio</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-end gap-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Portfolio ID</label>
                  <Input
                    value={stressPortfolioId}
                    onChange={(e) => setStressPortfolioId(e.target.value)}
                    placeholder="Enter portfolio ID"
                    className="w-[250px]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Scenario</label>
                  <Select value={stressScenario} onValueChange={setStressScenario}>
                    <SelectTrigger className="w-[250px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STRESS_SCENARIOS.map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={() => stressMut.mutate({ portfolioId: stressPortfolioId, scenario: stressScenario })}
                  disabled={!stressPortfolioId || stressMut.isPending}
                >
                  <Play className="mr-1 h-4 w-4" />
                  {stressMut.isPending ? "Running..." : "Run Stress Test"}
                </Button>
              </div>

              {stressMut.data && stressMut.data.length > 0 && (
                <>
                  <Separator />
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {["Metric", "Current Value", "Stressed Value", "Impact %"].map((h) => (
                            <TableHead key={h} className={h !== "Metric" ? "text-right" : ""}>{h}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {stressMut.data.map((r) => (
                          <TableRow key={r.metric}>
                            <TableCell className="font-medium">{r.metric}</TableCell>
                            <TableCell className="text-right font-mono">{fmtPHP(r.current_value)}</TableCell>
                            <TableCell className="text-right font-mono">{fmtPHP(r.stressed_value)}</TableCell>
                            <TableCell className="text-right">
                              <Badge className={r.impact_pct < 0 ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"}>
                                {r.impact_pct >= 0 ? "+" : ""}{fmtPct(r.impact_pct)}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ==================== HISTORY TAB ==================== */}
        <TabsContent value="history" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Rebalancing Runs</CardTitle>
              <CardDescription>Track, approve, and execute rebalancing runs</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {["ID", "Portfolios", "Model", "Type", "Status", "Created", "Actions"].map((h) => (
                        <TableHead key={h}>{h}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {runsQ.isLoading ? (
                      <SkeletonRows cols={7} />
                    ) : runs.length === 0 ? (
                      <EmptyRow cols={7} msg="No rebalancing runs found" />
                    ) : (
                      runs.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-mono text-xs">{r.id}</TableCell>
                          <TableCell className="text-sm max-w-[200px] truncate">
                            {r.portfolios?.join(", ") ?? "\u2014"}
                          </TableCell>
                          <TableCell className="text-sm">{r.model_name}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{r.run_type}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className={bc(STATUS_COLORS, r.status)}>{r.status}</Badge>
                          </TableCell>
                          <TableCell className="text-xs">{fmtDate(r.created_at)}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              {r.status === "PENDING" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => approveMut.mutate(r.id)}
                                  disabled={approveMut.isPending}
                                >
                                  <CheckCircle className="mr-1 h-3 w-3" /> Approve
                                </Button>
                              )}
                              {r.status === "APPROVED" && (
                                <Button
                                  size="sm"
                                  onClick={() => executeMut.mutate(r.id)}
                                  disabled={executeMut.isPending}
                                >
                                  <Play className="mr-1 h-3 w-3" /> Execute
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ==================== CREATE / EDIT MODEL DIALOG ==================== */}
      <Dialog open={modelOpen} onOpenChange={setModelOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingModel ? "Edit Model Portfolio" : "Create Model Portfolio"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">Name</label>
              <Input
                value={modelForm.name}
                onChange={(e) => setModelForm((s) => ({ ...s, name: e.target.value }))}
                placeholder="e.g. Conservative Balanced"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Description</label>
              <Input
                value={modelForm.description}
                onChange={(e) => setModelForm((s) => ({ ...s, description: e.target.value }))}
                placeholder="Brief description of the model"
              />
            </div>

            <Separator />

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Allocations</label>
                <Button variant="outline" size="sm" onClick={addAllocRow}>
                  <Plus className="mr-1 h-3 w-3" /> Add Row
                </Button>
              </div>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Asset Class</TableHead>
                      <TableHead className="text-right">Target %</TableHead>
                      <TableHead className="text-right">Min %</TableHead>
                      <TableHead className="text-right">Max %</TableHead>
                      <TableHead className="w-[60px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allocRows.map((row, idx) => (
                      <TableRow key={idx}>
                        <TableCell>
                          <Input
                            value={row.asset_class}
                            onChange={(e) => updateAllocRow(idx, "asset_class", e.target.value)}
                            placeholder="e.g. Equities"
                            className="h-8"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.01"
                            value={row.target_pct || ""}
                            onChange={(e) => updateAllocRow(idx, "target_pct", e.target.value)}
                            className="h-8 text-right"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.01"
                            value={row.min_pct || ""}
                            onChange={(e) => updateAllocRow(idx, "min_pct", e.target.value)}
                            className="h-8 text-right"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.01"
                            value={row.max_pct || ""}
                            onChange={(e) => updateAllocRow(idx, "max_pct", e.target.value)}
                            className="h-8 text-right"
                          />
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeAllocRow(idx)}
                            disabled={allocRows.length <= 1}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeModelDialog}>Cancel</Button>
            <Button onClick={saveModel} disabled={isSaving || !modelForm.name.trim()}>
              {isSaving ? "Saving..." : editingModel ? "Update Model" : "Create Model"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
