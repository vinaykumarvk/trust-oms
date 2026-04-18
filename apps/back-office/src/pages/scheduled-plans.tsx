/**
 * Scheduled Plans — Phase 3I (BRD Screen #27)
 *
 * EIP (Equity Investment Plan) and ERP (Equity Redemption Plan) enrollment,
 * standing instruction management, and due queue processing.
 * Four-tab interface with summary cards. Auto-refreshes every 30 seconds.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@ui/lib/queryClient";
import { apiUrl } from "@ui/lib/api-url";
import { Card, CardContent } from "@ui/components/ui/card";
import { Badge } from "@ui/components/ui/badge";
import { Button } from "@ui/components/ui/button";
import { Input } from "@ui/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@ui/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@ui/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ui/components/ui/select";
import { Skeleton } from "@ui/components/ui/skeleton";
import { Separator } from "@ui/components/ui/separator";
import {
  CalendarClock, TrendingUp, TrendingDown, ListChecks, Clock,
  RefreshCw, Plus, Play, XCircle, Pencil, AlertTriangle,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EipPlan {
  id: string;
  clientId: string;
  portfolioId: string;
  productId: string;
  amount: number;
  frequency: string;
  caAccount: string;
  nextExecution: string;
  status: string;
  createdAt: string;
}

interface EipListResponse {
  data: EipPlan[];
  total: number;
  page: number;
  pageSize: number;
}

interface ErpPlan {
  id: string;
  clientId: string;
  portfolioId: string;
  amount: number;
  frequency: string;
  caAccount: string;
  nextExecution: string;
  status: string;
  createdAt: string;
}

interface ErpListResponse {
  data: ErpPlan[];
  total: number;
  page: number;
  pageSize: number;
}

interface StandingInstruction {
  id: string;
  accountId: string;
  portfolioId: string;
  type: string;
  params: Record<string, unknown>;
  isActive: boolean;
  nextExecution: string;
  createdAt: string;
}

interface StandingInstructionsResponse {
  data: StandingInstruction[];
  total: number;
  page: number;
  pageSize: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-800",
  PAUSED: "bg-yellow-100 text-yellow-800",
  CANCELLED: "bg-red-100 text-red-800",
  COMPLETED: "bg-gray-100 text-gray-800",
};

const SI_TYPE_COLORS: Record<string, string> = {
  AUTO_ROLL: "bg-blue-100 text-blue-800",
  AUTO_CREDIT: "bg-green-100 text-green-800",
  AUTO_WITHDRAWAL: "bg-orange-100 text-orange-800",
};

function formatPHP(amount: number): string {
  return amount.toLocaleString("en-PH", {
    style: "currency", currency: "PHP", minimumFractionDigits: 2,
  });
}

function fmtDate(d: string): string {
  try {
    return new Date(d).toLocaleDateString("en-PH", {
      month: "short", day: "numeric", year: "numeric",
    });
  } catch { return d; }
}

function isOverdue(d: string): boolean {
  try {
    return new Date(d) < new Date(new Date().toISOString().split("T")[0]);
  } catch { return false; }
}

function isDueToday(d: string): boolean {
  try {
    return d.startsWith(new Date().toISOString().split("T")[0]);
  } catch { return false; }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SummaryCard({ title, value, icon: Icon, accent }: {
  title: string; value: string | number; icon: React.ElementType; accent: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="mt-1 text-2xl font-bold">{value}</p>
          </div>
          <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${accent}`}>
            <Icon className="h-5 w-5 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}

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

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function ScheduledPlans() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("eip");
  const [eipPage, setEipPage] = useState(1);
  const [erpPage, setErpPage] = useState(1);
  const [siPage, setSiPage] = useState(1);
  const pageSize = 25;

  // EIP dialog state
  const [eipDialogOpen, setEipDialogOpen] = useState(false);
  const [eipEditId, setEipEditId] = useState<string | null>(null);
  const [eipClientId, setEipClientId] = useState("");
  const [eipProductId, setEipProductId] = useState("");
  const [eipAmount, setEipAmount] = useState("");
  const [eipFrequency, setEipFrequency] = useState("MONTHLY");
  const [eipCaAccount, setEipCaAccount] = useState("");
  const [eipPortfolioId, setEipPortfolioId] = useState("");

  // ERP dialog state
  const [erpDialogOpen, setErpDialogOpen] = useState(false);
  const [erpClientId, setErpClientId] = useState("");
  const [erpPortfolioId, setErpPortfolioId] = useState("");
  const [erpAmount, setErpAmount] = useState("");
  const [erpFrequency, setErpFrequency] = useState("MONTHLY");
  const [erpCaAccount, setErpCaAccount] = useState("");

  // Standing instruction dialog state
  const [siDialogOpen, setSiDialogOpen] = useState(false);
  const [siAccountId, setSiAccountId] = useState("");
  const [siPortfolioId, setSiPortfolioId] = useState("");
  const [siType, setSiType] = useState("AUTO_ROLL");
  const [siParams, setSiParams] = useState("{}");

  // Unsubscribe reason dialog
  const [unsubDialogOpen, setUnsubDialogOpen] = useState(false);
  const [unsubTarget, setUnsubTarget] = useState<{ id: string; type: "eip" | "erp" } | null>(null);
  const [unsubReason, setUnsubReason] = useState("");

  // --- Queries ---------------------------------------------------------------

  const eipQuery = useQuery<EipListResponse>({
    queryKey: ["eip-plans", { page: eipPage }],
    queryFn: () => {
      const p = new URLSearchParams();
      p.set("page", String(eipPage));
      p.set("pageSize", String(pageSize));
      return apiRequest("GET", apiUrl("/api/v1/scheduled-plans/eip") + "?" + p.toString());
    },
    refetchInterval: 30_000,
  });

  const erpQuery = useQuery<ErpListResponse>({
    queryKey: ["erp-plans", { page: erpPage }],
    queryFn: () => {
      const p = new URLSearchParams();
      p.set("page", String(erpPage));
      p.set("pageSize", String(pageSize));
      return apiRequest("GET", apiUrl("/api/v1/scheduled-plans/erp") + "?" + p.toString());
    },
    refetchInterval: 30_000,
  });

  const siQuery = useQuery<StandingInstructionsResponse>({
    queryKey: ["standing-instructions", { page: siPage }],
    queryFn: () => {
      const p = new URLSearchParams();
      p.set("page", String(siPage));
      p.set("pageSize", String(pageSize));
      return apiRequest("GET", apiUrl("/api/v1/scheduled-plans/standing-instructions") + "?" + p.toString());
    },
    refetchInterval: 30_000,
  });

  const eipPlans = eipQuery.data?.data ?? [];
  const eipTotal = eipQuery.data?.total ?? 0;
  const eipTotalPages = Math.ceil(eipTotal / pageSize) || 1;

  const erpPlans = erpQuery.data?.data ?? [];
  const erpTotal = erpQuery.data?.total ?? 0;
  const erpTotalPages = Math.ceil(erpTotal / pageSize) || 1;

  const instructions = siQuery.data?.data ?? [];
  const siTotal = siQuery.data?.total ?? 0;
  const siTotalPages = Math.ceil(siTotal / pageSize) || 1;

  // Summary
  const activeEip = eipPlans.filter((p) => p.status === "ACTIVE").length;
  const activeErp = erpPlans.filter((p) => p.status === "ACTIVE").length;
  const activeSi = instructions.filter((s) => s.isActive).length;

  // Due queue: combine EIP + ERP + SI that are due today or overdue
  const dueEip = eipPlans.filter((p) => p.status === "ACTIVE" && (isDueToday(p.nextExecution) || isOverdue(p.nextExecution)));
  const dueErp = erpPlans.filter((p) => p.status === "ACTIVE" && (isDueToday(p.nextExecution) || isOverdue(p.nextExecution)));
  const dueSi = instructions.filter((s) => s.isActive && (isDueToday(s.nextExecution) || isOverdue(s.nextExecution)));
  const nextDueDate = [...eipPlans, ...erpPlans]
    .filter((p) => p.status === "ACTIVE" && p.nextExecution)
    .sort((a, b) => a.nextExecution.localeCompare(b.nextExecution))[0]?.nextExecution;

  // --- Mutations -------------------------------------------------------------

  // EIP
  const enrollEipMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiRequest("POST", apiUrl("/api/v1/scheduled-plans/eip"), body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["eip-plans"] });
      resetEipForm();
      setEipDialogOpen(false);
    },
  });

  const modifyEipMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      apiRequest("PUT", apiUrl("/api/v1/scheduled-plans/eip/" + id), body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["eip-plans"] });
      resetEipForm();
      setEipDialogOpen(false);
    },
  });

  const unsubEipMut = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiRequest("POST", apiUrl("/api/v1/scheduled-plans/eip/" + id + "/unsubscribe"), { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["eip-plans"] });
      setUnsubDialogOpen(false);
      setUnsubReason("");
    },
  });

  const processEipMut = useMutation({
    mutationFn: (id: string) =>
      apiRequest("POST", apiUrl("/api/v1/scheduled-plans/eip/" + id + "/process")),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["eip-plans"] }),
  });

  // ERP
  const enrollErpMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiRequest("POST", apiUrl("/api/v1/scheduled-plans/erp"), body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["erp-plans"] });
      resetErpForm();
      setErpDialogOpen(false);
    },
  });

  const unsubErpMut = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiRequest("POST", apiUrl("/api/v1/scheduled-plans/erp/" + id + "/unsubscribe"), { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["erp-plans"] });
      setUnsubDialogOpen(false);
      setUnsubReason("");
    },
  });

  const processErpMut = useMutation({
    mutationFn: (id: string) =>
      apiRequest("POST", apiUrl("/api/v1/scheduled-plans/erp/" + id + "/process")),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp-plans"] }),
  });

  // Standing instructions
  const createSiMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiRequest("POST", apiUrl("/api/v1/scheduled-plans/standing-instructions"), body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["standing-instructions"] });
      resetSiForm();
      setSiDialogOpen(false);
    },
  });

  const deactivateSiMut = useMutation({
    mutationFn: (id: string) =>
      apiRequest("POST", apiUrl("/api/v1/scheduled-plans/standing-instructions/" + id + "/deactivate")),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["standing-instructions"] }),
  });

  // --- Handlers --------------------------------------------------------------

  function resetEipForm() {
    setEipClientId(""); setEipProductId(""); setEipAmount("");
    setEipFrequency("MONTHLY"); setEipCaAccount(""); setEipPortfolioId("");
    setEipEditId(null);
  }

  function resetErpForm() {
    setErpClientId(""); setErpPortfolioId(""); setErpAmount("");
    setErpFrequency("MONTHLY"); setErpCaAccount("");
  }

  function resetSiForm() {
    setSiAccountId(""); setSiPortfolioId(""); setSiType("AUTO_ROLL"); setSiParams("{}");
  }

  function handleEipSubmit() {
    if (!eipClientId || !eipAmount || !eipCaAccount || !eipPortfolioId) return;
    const body = {
      clientId: eipClientId, productId: eipProductId, amount: parseFloat(eipAmount),
      frequency: eipFrequency, caAccount: eipCaAccount, portfolioId: eipPortfolioId,
    };
    if (eipEditId) {
      modifyEipMut.mutate({ id: eipEditId, body });
    } else {
      enrollEipMut.mutate(body);
    }
  }

  function handleErpSubmit() {
    if (!erpClientId || !erpAmount || !erpCaAccount || !erpPortfolioId) return;
    enrollErpMut.mutate({
      clientId: erpClientId, portfolioId: erpPortfolioId,
      amount: parseFloat(erpAmount), frequency: erpFrequency, caAccount: erpCaAccount,
    });
  }

  function handleSiSubmit() {
    if (!siAccountId || !siPortfolioId) return;
    let parsedParams: Record<string, unknown> = {};
    try { parsedParams = JSON.parse(siParams); } catch { /* use empty */ }
    createSiMut.mutate({
      accountId: siAccountId, portfolioId: siPortfolioId,
      type: siType, params: parsedParams,
    });
  }

  function handleUnsubscribe() {
    if (!unsubTarget) return;
    if (unsubTarget.type === "eip") {
      unsubEipMut.mutate({ id: unsubTarget.id, reason: unsubReason });
    } else {
      unsubErpMut.mutate({ id: unsubTarget.id, reason: unsubReason });
    }
  }

  function openEipEdit(plan: EipPlan) {
    setEipEditId(plan.id);
    setEipClientId(plan.clientId);
    setEipProductId(plan.productId);
    setEipAmount(String(plan.amount));
    setEipFrequency(plan.frequency);
    setEipCaAccount(plan.caAccount);
    setEipPortfolioId(plan.portfolioId);
    setEipDialogOpen(true);
  }

  function processAllDue() {
    dueEip.forEach((p) => processEipMut.mutate(p.id));
    dueErp.forEach((p) => processErpMut.mutate(p.id));
  }

  // --- Render ----------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <CalendarClock className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Scheduled Plans</h1>
            <p className="text-sm text-muted-foreground">
              Manage EIP, ERP, and standing instruction schedules
            </p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => { eipQuery.refetch(); erpQuery.refetch(); siQuery.refetch(); }} disabled={eipQuery.isFetching}>
          <RefreshCw className={`h-4 w-4 ${eipQuery.isFetching ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard title="Active EIP Plans" value={activeEip} icon={TrendingUp} accent="bg-green-600" />
        <SummaryCard title="Active ERP Plans" value={activeErp} icon={TrendingDown} accent="bg-blue-600" />
        <SummaryCard title="Standing Instructions" value={activeSi} icon={ListChecks} accent="bg-purple-600" />
        <SummaryCard title="Next Execution Due" value={nextDueDate ? fmtDate(nextDueDate) : "N/A"} icon={Clock} accent="bg-indigo-600" />
      </div>

      <Separator />

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="eip">EIP Plans</TabsTrigger>
          <TabsTrigger value="erp">ERP Plans</TabsTrigger>
          <TabsTrigger value="si">Standing Instructions</TabsTrigger>
          <TabsTrigger value="due">
            Due Queue
            {(dueEip.length + dueErp.length + dueSi.length) > 0 && (
              <Badge variant="destructive" className="ml-2 text-xs">{dueEip.length + dueErp.length + dueSi.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ============================================================== */}
        {/* EIP Plans Tab                                                   */}
        {/* ============================================================== */}
        <TabsContent value="eip" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Equity Investment Plans (EIP)</h2>
            <Button size="sm" onClick={() => { resetEipForm(); setEipDialogOpen(true); }}>
              <Plus className="mr-2 h-4 w-4" />Enroll EIP
            </Button>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Portfolio</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Frequency</TableHead>
                  <TableHead>CA/SA Account</TableHead>
                  <TableHead>Next Execution</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {eipQuery.isLoading ? (
                  <SkeletonRows cols={10} />
                ) : eipPlans.length === 0 ? (
                  <EmptyRow cols={10} msg="No EIP plans found" />
                ) : (
                  eipPlans.map((plan) => (
                    <TableRow key={plan.id}>
                      <TableCell className="font-mono text-xs">{plan.id}</TableCell>
                      <TableCell className="text-xs">{plan.clientId}</TableCell>
                      <TableCell className="text-xs">{plan.portfolioId}</TableCell>
                      <TableCell className="text-xs">{plan.productId}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{formatPHP(plan.amount)}</TableCell>
                      <TableCell><Badge variant="outline">{plan.frequency}</Badge></TableCell>
                      <TableCell className="text-xs">{plan.caAccount}</TableCell>
                      <TableCell className="text-xs">
                        {fmtDate(plan.nextExecution)}
                        {isOverdue(plan.nextExecution) && plan.status === "ACTIVE" && (
                          <Badge variant="destructive" className="ml-1 text-xs">Overdue</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge className={STATUS_COLORS[plan.status] ?? "bg-gray-100 text-gray-800"}>{plan.status}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {plan.status === "ACTIVE" && (
                            <>
                              <Button variant="ghost" size="sm" onClick={() => openEipEdit(plan)} title="Modify">
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => processEipMut.mutate(plan.id)} disabled={processEipMut.isPending} title="Process">
                                <Play className="h-3 w-3" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => { setUnsubTarget({ id: plan.id, type: "eip" }); setUnsubDialogOpen(true); }} title="Unsubscribe">
                                <XCircle className="h-3 w-3 text-red-500" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {eipTotalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {(eipPage - 1) * pageSize + 1}-{Math.min(eipPage * pageSize, eipTotal)} of {eipTotal}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={eipPage <= 1} onClick={() => setEipPage((p) => p - 1)}>Previous</Button>
                <span className="text-sm text-muted-foreground">Page {eipPage} of {eipTotalPages}</span>
                <Button variant="outline" size="sm" disabled={eipPage >= eipTotalPages} onClick={() => setEipPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ============================================================== */}
        {/* ERP Plans Tab                                                   */}
        {/* ============================================================== */}
        <TabsContent value="erp" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Equity Redemption Plans (ERP)</h2>
            <Button size="sm" onClick={() => { resetErpForm(); setErpDialogOpen(true); }}>
              <Plus className="mr-2 h-4 w-4" />Enroll ERP
            </Button>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Portfolio</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Frequency</TableHead>
                  <TableHead>CA/SA Account</TableHead>
                  <TableHead>Next Execution</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {erpQuery.isLoading ? (
                  <SkeletonRows cols={9} />
                ) : erpPlans.length === 0 ? (
                  <EmptyRow cols={9} msg="No ERP plans found" />
                ) : (
                  erpPlans.map((plan) => (
                    <TableRow key={plan.id}>
                      <TableCell className="font-mono text-xs">{plan.id}</TableCell>
                      <TableCell className="text-xs">{plan.clientId}</TableCell>
                      <TableCell className="text-xs">{plan.portfolioId}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{formatPHP(plan.amount)}</TableCell>
                      <TableCell><Badge variant="outline">{plan.frequency}</Badge></TableCell>
                      <TableCell className="text-xs">{plan.caAccount}</TableCell>
                      <TableCell className="text-xs">
                        {fmtDate(plan.nextExecution)}
                        {isOverdue(plan.nextExecution) && plan.status === "ACTIVE" && (
                          <Badge variant="destructive" className="ml-1 text-xs">Overdue</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge className={STATUS_COLORS[plan.status] ?? "bg-gray-100 text-gray-800"}>{plan.status}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {plan.status === "ACTIVE" && (
                            <>
                              <Button variant="ghost" size="sm" onClick={() => processErpMut.mutate(plan.id)} disabled={processErpMut.isPending} title="Process">
                                <Play className="h-3 w-3" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => { setUnsubTarget({ id: plan.id, type: "erp" }); setUnsubDialogOpen(true); }} title="Unsubscribe">
                                <XCircle className="h-3 w-3 text-red-500" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {erpTotalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {(erpPage - 1) * pageSize + 1}-{Math.min(erpPage * pageSize, erpTotal)} of {erpTotal}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={erpPage <= 1} onClick={() => setErpPage((p) => p - 1)}>Previous</Button>
                <span className="text-sm text-muted-foreground">Page {erpPage} of {erpTotalPages}</span>
                <Button variant="outline" size="sm" disabled={erpPage >= erpTotalPages} onClick={() => setErpPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ============================================================== */}
        {/* Standing Instructions Tab                                       */}
        {/* ============================================================== */}
        <TabsContent value="si" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Standing Instructions</h2>
            <Button size="sm" onClick={() => { resetSiForm(); setSiDialogOpen(true); }}>
              <Plus className="mr-2 h-4 w-4" />Create Instruction
            </Button>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Portfolio</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Params</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead>Next Execution</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {siQuery.isLoading ? (
                  <SkeletonRows cols={8} />
                ) : instructions.length === 0 ? (
                  <EmptyRow cols={8} msg="No standing instructions found" />
                ) : (
                  instructions.map((si) => (
                    <TableRow key={si.id}>
                      <TableCell className="font-mono text-xs">{si.id}</TableCell>
                      <TableCell className="text-xs">{si.accountId}</TableCell>
                      <TableCell className="text-xs">{si.portfolioId}</TableCell>
                      <TableCell>
                        <Badge className={SI_TYPE_COLORS[si.type] ?? "bg-gray-100 text-gray-800"}>{si.type}</Badge>
                      </TableCell>
                      <TableCell className="text-xs max-w-[200px] truncate font-mono" title={JSON.stringify(si.params)}>
                        {JSON.stringify(si.params)}
                      </TableCell>
                      <TableCell>
                        <Badge className={si.isActive ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}>
                          {si.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{fmtDate(si.nextExecution)}</TableCell>
                      <TableCell>
                        {si.isActive && (
                          <Button variant="ghost" size="sm" onClick={() => deactivateSiMut.mutate(si.id)} disabled={deactivateSiMut.isPending} title="Deactivate">
                            <XCircle className="h-3 w-3 text-red-500" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {siTotalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {(siPage - 1) * pageSize + 1}-{Math.min(siPage * pageSize, siTotal)} of {siTotal}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={siPage <= 1} onClick={() => setSiPage((p) => p - 1)}>Previous</Button>
                <span className="text-sm text-muted-foreground">Page {siPage} of {siTotalPages}</span>
                <Button variant="outline" size="sm" disabled={siPage >= siTotalPages} onClick={() => setSiPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ============================================================== */}
        {/* Due Queue Tab                                                   */}
        {/* ============================================================== */}
        <TabsContent value="due" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Due Queue</h2>
            {(dueEip.length + dueErp.length) > 0 && (
              <Button size="sm" onClick={processAllDue} disabled={processEipMut.isPending || processErpMut.isPending}>
                <Play className="mr-2 h-4 w-4" />
                {(processEipMut.isPending || processErpMut.isPending) ? "Processing..." : "Process All"}
              </Button>
            )}
          </div>

          {(dueEip.length + dueErp.length + dueSi.length) === 0 ? (
            <div className="rounded-md border p-8 text-center text-muted-foreground">
              No instructions are due or overdue at this time.
            </div>
          ) : (
            <>
              {/* Due EIP */}
              {dueEip.length > 0 && (
                <>
                  <h3 className="text-base font-medium flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-yellow-600" />EIP Plans Due ({dueEip.length})
                  </h3>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>ID</TableHead>
                          <TableHead>Client</TableHead>
                          <TableHead>Portfolio</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead>Next Execution</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dueEip.map((plan) => (
                          <TableRow key={plan.id}>
                            <TableCell className="font-mono text-xs">{plan.id}</TableCell>
                            <TableCell className="text-xs">{plan.clientId}</TableCell>
                            <TableCell className="text-xs">{plan.portfolioId}</TableCell>
                            <TableCell className="text-right font-mono text-xs">{formatPHP(plan.amount)}</TableCell>
                            <TableCell className="text-xs">
                              {fmtDate(plan.nextExecution)}
                              {isOverdue(plan.nextExecution) && <Badge variant="destructive" className="ml-1 text-xs">Overdue</Badge>}
                            </TableCell>
                            <TableCell>
                              <Button variant="outline" size="sm" onClick={() => processEipMut.mutate(plan.id)} disabled={processEipMut.isPending}>
                                <Play className="h-3 w-3 mr-1" />Process
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}

              {/* Due ERP */}
              {dueErp.length > 0 && (
                <>
                  <h3 className="text-base font-medium flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-yellow-600" />ERP Plans Due ({dueErp.length})
                  </h3>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>ID</TableHead>
                          <TableHead>Client</TableHead>
                          <TableHead>Portfolio</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead>Next Execution</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dueErp.map((plan) => (
                          <TableRow key={plan.id}>
                            <TableCell className="font-mono text-xs">{plan.id}</TableCell>
                            <TableCell className="text-xs">{plan.clientId}</TableCell>
                            <TableCell className="text-xs">{plan.portfolioId}</TableCell>
                            <TableCell className="text-right font-mono text-xs">{formatPHP(plan.amount)}</TableCell>
                            <TableCell className="text-xs">
                              {fmtDate(plan.nextExecution)}
                              {isOverdue(plan.nextExecution) && <Badge variant="destructive" className="ml-1 text-xs">Overdue</Badge>}
                            </TableCell>
                            <TableCell>
                              <Button variant="outline" size="sm" onClick={() => processErpMut.mutate(plan.id)} disabled={processErpMut.isPending}>
                                <Play className="h-3 w-3 mr-1" />Process
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}

              {/* Due Standing Instructions */}
              {dueSi.length > 0 && (
                <>
                  <h3 className="text-base font-medium flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-yellow-600" />Standing Instructions Due ({dueSi.length})
                  </h3>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>ID</TableHead>
                          <TableHead>Account</TableHead>
                          <TableHead>Portfolio</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Next Execution</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dueSi.map((si) => (
                          <TableRow key={si.id}>
                            <TableCell className="font-mono text-xs">{si.id}</TableCell>
                            <TableCell className="text-xs">{si.accountId}</TableCell>
                            <TableCell className="text-xs">{si.portfolioId}</TableCell>
                            <TableCell>
                              <Badge className={SI_TYPE_COLORS[si.type] ?? "bg-gray-100 text-gray-800"}>{si.type}</Badge>
                            </TableCell>
                            <TableCell className="text-xs">
                              {fmtDate(si.nextExecution)}
                              {isOverdue(si.nextExecution) && <Badge variant="destructive" className="ml-1 text-xs">Overdue</Badge>}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* ================================================================ */}
      {/* Dialogs                                                          */}
      {/* ================================================================ */}

      {/* EIP Enroll / Modify Dialog */}
      <Dialog open={eipDialogOpen} onOpenChange={setEipDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{eipEditId ? "Modify EIP Plan" : "Enroll EIP Plan"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <FormField label="Client ID">
              <Input placeholder="e.g. CLI-001" value={eipClientId} onChange={(e) => setEipClientId(e.target.value)} />
            </FormField>
            <FormField label="Portfolio ID">
              <Input placeholder="e.g. PORT-001" value={eipPortfolioId} onChange={(e) => setEipPortfolioId(e.target.value)} />
            </FormField>
            <FormField label="Product ID">
              <Input placeholder="e.g. UITF-001" value={eipProductId} onChange={(e) => setEipProductId(e.target.value)} />
            </FormField>
            <FormField label="Amount (PHP)">
              <Input type="number" placeholder="e.g. 10000" value={eipAmount} onChange={(e) => setEipAmount(e.target.value)} />
            </FormField>
            <FormField label="Frequency">
              <Select value={eipFrequency} onValueChange={setEipFrequency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="WEEKLY">Weekly</SelectItem>
                  <SelectItem value="MONTHLY">Monthly</SelectItem>
                  <SelectItem value="QUARTERLY">Quarterly</SelectItem>
                  <SelectItem value="SEMI_ANNUAL">Semi-Annual</SelectItem>
                  <SelectItem value="ANNUAL">Annual</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="CA/SA Account">
              <Input placeholder="e.g. CA-12345" value={eipCaAccount} onChange={(e) => setEipCaAccount(e.target.value)} />
            </FormField>
            {(enrollEipMut.isError || modifyEipMut.isError) && (
              <p className="text-sm text-red-600">
                {((enrollEipMut.error ?? modifyEipMut.error) as Error)?.message}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { resetEipForm(); setEipDialogOpen(false); }}>Cancel</Button>
            <Button onClick={handleEipSubmit} disabled={enrollEipMut.isPending || modifyEipMut.isPending}>
              {(enrollEipMut.isPending || modifyEipMut.isPending)
                ? "Saving..."
                : eipEditId ? "Update Plan" : "Enroll Plan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ERP Enroll Dialog */}
      <Dialog open={erpDialogOpen} onOpenChange={setErpDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enroll ERP Plan</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <FormField label="Client ID">
              <Input placeholder="e.g. CLI-001" value={erpClientId} onChange={(e) => setErpClientId(e.target.value)} />
            </FormField>
            <FormField label="Portfolio ID">
              <Input placeholder="e.g. PORT-001" value={erpPortfolioId} onChange={(e) => setErpPortfolioId(e.target.value)} />
            </FormField>
            <FormField label="Amount (PHP)">
              <Input type="number" placeholder="e.g. 5000" value={erpAmount} onChange={(e) => setErpAmount(e.target.value)} />
            </FormField>
            <FormField label="Frequency">
              <Select value={erpFrequency} onValueChange={setErpFrequency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="WEEKLY">Weekly</SelectItem>
                  <SelectItem value="MONTHLY">Monthly</SelectItem>
                  <SelectItem value="QUARTERLY">Quarterly</SelectItem>
                  <SelectItem value="SEMI_ANNUAL">Semi-Annual</SelectItem>
                  <SelectItem value="ANNUAL">Annual</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="CA/SA Account">
              <Input placeholder="e.g. CA-12345" value={erpCaAccount} onChange={(e) => setErpCaAccount(e.target.value)} />
            </FormField>
            {enrollErpMut.isError && (
              <p className="text-sm text-red-600">{(enrollErpMut.error as Error).message}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { resetErpForm(); setErpDialogOpen(false); }}>Cancel</Button>
            <Button onClick={handleErpSubmit} disabled={enrollErpMut.isPending}>
              {enrollErpMut.isPending ? "Enrolling..." : "Enroll Plan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Standing Instruction Dialog */}
      <Dialog open={siDialogOpen} onOpenChange={setSiDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Standing Instruction</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <FormField label="Account ID">
              <Input placeholder="e.g. ACCT-001" value={siAccountId} onChange={(e) => setSiAccountId(e.target.value)} />
            </FormField>
            <FormField label="Portfolio ID">
              <Input placeholder="e.g. PORT-001" value={siPortfolioId} onChange={(e) => setSiPortfolioId(e.target.value)} />
            </FormField>
            <FormField label="Instruction Type">
              <Select value={siType} onValueChange={setSiType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="AUTO_ROLL">Auto Roll</SelectItem>
                  <SelectItem value="AUTO_CREDIT">Auto Credit</SelectItem>
                  <SelectItem value="AUTO_WITHDRAWAL">Auto Withdrawal</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Parameters (JSON)">
              <Input
                placeholder='e.g. {"amount": 10000, "tenor": 30}'
                value={siParams}
                onChange={(e) => setSiParams(e.target.value)}
                className="font-mono text-xs"
              />
            </FormField>
            {createSiMut.isError && (
              <p className="text-sm text-red-600">{(createSiMut.error as Error).message}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { resetSiForm(); setSiDialogOpen(false); }}>Cancel</Button>
            <Button onClick={handleSiSubmit} disabled={createSiMut.isPending}>
              {createSiMut.isPending ? "Creating..." : "Create Instruction"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unsubscribe Reason Dialog */}
      <Dialog open={unsubDialogOpen} onOpenChange={setUnsubDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unsubscribe from Plan</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Please provide a reason for unsubscribing from this {unsubTarget?.type === "eip" ? "EIP" : "ERP"} plan.
            </p>
            <FormField label="Reason">
              <Input placeholder="e.g. Client request" value={unsubReason} onChange={(e) => setUnsubReason(e.target.value)} />
            </FormField>
            {(unsubEipMut.isError || unsubErpMut.isError) && (
              <p className="text-sm text-red-600">
                {((unsubEipMut.error ?? unsubErpMut.error) as Error)?.message}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setUnsubDialogOpen(false); setUnsubReason(""); }}>Cancel</Button>
            <Button variant="destructive" onClick={handleUnsubscribe} disabled={unsubEipMut.isPending || unsubErpMut.isPending}>
              {(unsubEipMut.isPending || unsubErpMut.isPending) ? "Unsubscribing..." : "Unsubscribe"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
