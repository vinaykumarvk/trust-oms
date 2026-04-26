/**
 * Fee & Billing Desk — Phase 3C (BRD Screen #18)
 * Fee schedule management, daily accrual processing,
 * invoice generation, and UITF TER calculator. Auto-refreshes every 30s.
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
import { Receipt, CalendarClock, FileText, BarChart3, RefreshCw, Plus, Play, Ban, Calculator } from "lucide-react";

/* ---------- Types ---------- */
interface FeeSchedule { id: string; portfolio_name: string; fee_type: string; method: string; rate_percent: number; effective_from: string; effective_to?: string; }
interface AccrualStatus { last_run_date: string; total_accrued: number; pending_count: number; }
interface Invoice { id: string; portfolio_name: string; fee_type: string; period: string; gross_amount: number; tax_amount: number; net_amount: number; status: string; }
interface TERResult { portfolio_name: string; ter_percent: number; management_fee: number; trustee_fee: number; admin_fee: number; other_expenses: number; total_expense: number; avg_nav: number; }
interface FeeSummary { active_schedules: number; pending_invoices: number; accrued_today_php: number; uitf_avg_ter: number; }
interface PortfolioOption { id: string; name: string; }

/* ---------- Helpers ---------- */
const FEE_COLORS: Record<string, string> = {
  MANAGEMENT: "bg-blue-100 text-blue-800", TRUSTEE: "bg-purple-100 text-purple-800",
  CUSTODIAN: "bg-indigo-100 text-indigo-800", ADMIN: "bg-cyan-100 text-cyan-800",
  PERFORMANCE: "bg-green-100 text-green-800", AUDIT: "bg-orange-100 text-orange-800", OTHER: "bg-muted text-foreground",
};
const INV_COLORS: Record<string, string> = { DRAFT: "bg-yellow-100 text-yellow-800", ISSUED: "bg-blue-100 text-blue-800", PAID: "bg-green-100 text-green-800", WAIVED: "bg-muted text-foreground" };
const fmtPHP = (n: number) => n.toLocaleString("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2 });
const fmtDate = (d: string) => { try { return new Date(d).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }); } catch { return d; } };
const fmtPct = (v: number) => `${v.toFixed(4)}%`;
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
export default function FeeBillingDesk() {
  const qc = useQueryClient();
  const [tab, setTab] = useState("schedules");
  const [schedOpen, setSchedOpen] = useState(false);
  const [ns, setNs] = useState({ portfolio_id: "", fee_type: "MANAGEMENT", method: "AUM_BASED", rate_percent: "", effective_from: "", effective_to: "" });
  const [accrualDate, setAccrualDate] = useState("");
  const [billFrom, setBillFrom] = useState("");
  const [billTo, setBillTo] = useState("");
  const [waiveOpen, setWaiveOpen] = useState(false);
  const [waiveId, setWaiveId] = useState<string | null>(null);
  const [waiveReason, setWaiveReason] = useState("");
  const [terPid, setTerPid] = useState("");
  const [terFrom, setTerFrom] = useState("");
  const [terTo, setTerTo] = useState("");

  // --- Queries ---
  const summaryQ = useQuery<FeeSummary>({ queryKey: ["fee-summary"], queryFn: () => apiRequest("GET", apiUrl("/api/v1/fees/summary")), refetchInterval: 30_000 });
  const sum = summaryQ.data ?? { active_schedules: 0, pending_invoices: 0, accrued_today_php: 0, uitf_avg_ter: 0 };

  const schedQ = useQuery<{ data: FeeSchedule[] }>({ queryKey: ["fee-schedules"], queryFn: () => apiRequest("GET", apiUrl("/api/v1/fees/schedules")), refetchInterval: 30_000, enabled: tab === "schedules" });
  const schedules = schedQ.data?.data ?? [];

  const accrualQ = useQuery<AccrualStatus>({ queryKey: ["fee-accrual-status"], queryFn: () => apiRequest("GET", apiUrl("/api/v1/fees/accruals/status")), refetchInterval: 30_000, enabled: tab === "accruals" });

  const invQ = useQuery<{ data: Invoice[] }>({ queryKey: ["fee-invoices"], queryFn: () => apiRequest("GET", apiUrl("/api/v1/fees/invoices")), refetchInterval: 30_000, enabled: tab === "invoices" });
  const invoices = invQ.data?.data ?? [];

  const portQ = useQuery<{ data: PortfolioOption[] }>({ queryKey: ["portfolios-list"], queryFn: () => apiRequest("GET", apiUrl("/api/v1/portfolios?pageSize=200")), refetchInterval: 60_000 });
  const portfolios = portQ.data?.data ?? [];

  const terQ = useQuery<TERResult>({
    queryKey: ["fee-ter", terPid, terFrom, terTo],
    queryFn: () => { const p = new URLSearchParams(); if (terFrom) p.set("from", terFrom); if (terTo) p.set("to", terTo); return apiRequest("GET", apiUrl(`/api/v1/fees/ter/${terPid}${p.toString() ? `?${p}` : ""}`)); },
    enabled: tab === "ter" && !!terPid, refetchInterval: 30_000,
  });

  // --- Mutations ---
  const addSchedMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiRequest("POST", apiUrl("/api/v1/fees/schedules"), body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fee-schedules"] }); qc.invalidateQueries({ queryKey: ["fee-summary"] }); setSchedOpen(false); },
  });
  const accrualMut = useMutation({
    mutationFn: (date: string) => apiRequest("POST", apiUrl("/api/v1/fees/accruals/run"), { date }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fee-accrual-status"] }); qc.invalidateQueries({ queryKey: ["fee-summary"] }); },
  });
  const billingMut = useMutation({
    mutationFn: (body: { period_from: string; period_to: string }) => apiRequest("POST", apiUrl("/api/v1/fees/billing/run"), body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fee-invoices"] }); qc.invalidateQueries({ queryKey: ["fee-summary"] }); },
  });
  const waiveMut = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => apiRequest("POST", apiUrl(`/api/v1/fees/invoices/${id}/waive`), { reason }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fee-invoices"] }); qc.invalidateQueries({ queryKey: ["fee-summary"] }); setWaiveOpen(false); },
  });

  const openWaive = (id: string) => { setWaiveId(id); setWaiveReason(""); setWaiveOpen(true); };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10"><Receipt className="h-5 w-5 text-primary" /></div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Fee & Billing Desk</h1>
            <p className="text-sm text-muted-foreground">Fee schedules, accruals, invoicing, and UITF TER management</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => { summaryQ.refetch(); schedQ.refetch(); invQ.refetch(); }} disabled={summaryQ.isFetching}>
          <RefreshCw className={`h-4 w-4 ${summaryQ.isFetching ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard title="Active Schedules" value={sum.active_schedules} icon={CalendarClock} accent="bg-blue-600" />
        <SummaryCard title="Pending Invoices" value={sum.pending_invoices} icon={FileText} accent="bg-yellow-500" />
        <SummaryCard title="Accrued Today (PHP)" value={fmtPHP(sum.accrued_today_php)} icon={Receipt} accent="bg-green-600" />
        <SummaryCard title="UITF Avg TER" value={fmtPct(sum.uitf_avg_ter)} icon={BarChart3} accent="bg-indigo-600" />
      </div>

      <Separator />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="schedules"><CalendarClock className="mr-1 h-4 w-4" /> Schedules</TabsTrigger>
          <TabsTrigger value="accruals"><Calculator className="mr-1 h-4 w-4" /> Accruals</TabsTrigger>
          <TabsTrigger value="invoices"><FileText className="mr-1 h-4 w-4" /> Invoices</TabsTrigger>
          <TabsTrigger value="ter"><BarChart3 className="mr-1 h-4 w-4" /> TER</TabsTrigger>
        </TabsList>

        {/* Schedules */}
        <TabsContent value="schedules" className="mt-4">
          <Card><CardHeader className="pb-3"><div className="flex items-center justify-between">
            <CardTitle className="text-base">Fee Schedules</CardTitle>
            <Button size="sm" onClick={() => setSchedOpen(true)}><Plus className="mr-1 h-3 w-3" /> Add Schedule</Button>
          </div></CardHeader>
            <CardContent><div className="overflow-x-auto rounded-md border"><Table>
              <TableHeader><TableRow>
                {["Portfolio", "Fee Type", "Method", "Rate %", "Effective From", "Effective To"].map((h) => <TableHead key={h} className={h === "Rate %" ? "text-right" : ""}>{h}</TableHead>)}
              </TableRow></TableHeader>
              <TableBody>
                {schedQ.isLoading ? <SkeletonRows cols={6} /> : schedules.length === 0 ? <EmptyRow cols={6} msg="No fee schedules configured" /> :
                  schedules.map((s: FeeSchedule) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.portfolio_name}</TableCell>
                      <TableCell><Badge className={bc(FEE_COLORS, s.fee_type)}>{s.fee_type}</Badge></TableCell>
                      <TableCell className="text-sm">{s.method.replace(/_/g, " ")}</TableCell>
                      <TableCell className="text-right font-mono">{fmtPct(s.rate_percent)}</TableCell>
                      <TableCell className="text-xs">{fmtDate(s.effective_from)}</TableCell>
                      <TableCell className="text-xs">{s.effective_to ? fmtDate(s.effective_to) : "\u2014"}</TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table></div></CardContent>
          </Card>
        </TabsContent>

        {/* Accruals */}
        <TabsContent value="accruals" className="mt-4">
          <Card><CardHeader className="pb-3">
            <CardTitle className="text-base">Daily Fee Accruals</CardTitle>
            <CardDescription>Run daily accrual calculation for all active schedules</CardDescription>
          </CardHeader>
            <CardContent className="space-y-4">
              {accrualQ.isLoading ? <div className="space-y-2"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-3/4" /></div> :
                accrualQ.data ? (
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="rounded-lg border p-4"><p className="text-sm font-medium text-muted-foreground">Last Run Date</p><p className="mt-1 text-lg font-bold">{fmtDate(accrualQ.data.last_run_date)}</p></div>
                    <div className="rounded-lg border p-4"><p className="text-sm font-medium text-muted-foreground">Total Accrued</p><p className="mt-1 text-lg font-bold">{fmtPHP(accrualQ.data.total_accrued)}</p></div>
                    <div className="rounded-lg border p-4"><p className="text-sm font-medium text-muted-foreground">Pending Schedules</p><p className="mt-1 text-lg font-bold">{accrualQ.data.pending_count}</p></div>
                  </div>
                ) : <p className="text-sm text-muted-foreground">No accrual data available</p>}
              <Separator />
              <div className="flex items-end gap-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Accrual Date</label>
                  <Input type="date" value={accrualDate} onChange={(e) => setAccrualDate(e.target.value)} className="w-[200px]" />
                </div>
                <Button onClick={() => accrualMut.mutate(accrualDate)} disabled={!accrualDate || accrualMut.isPending}>
                  <Play className="mr-1 h-4 w-4" />{accrualMut.isPending ? "Running..." : "Run Daily Accrual"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Invoices */}
        <TabsContent value="invoices" className="mt-4">
          <Card><CardHeader className="pb-3"><div className="flex items-center justify-between">
            <CardTitle className="text-base">Fee Invoices</CardTitle>
            <div className="flex items-center gap-2">
              <Input type="date" value={billFrom} onChange={(e) => setBillFrom(e.target.value)} className="w-[140px]" />
              <Input type="date" value={billTo} onChange={(e) => setBillTo(e.target.value)} className="w-[140px]" />
              <Button size="sm" onClick={() => billingMut.mutate({ period_from: billFrom, period_to: billTo })} disabled={!billFrom || !billTo || billingMut.isPending}>
                <Play className="mr-1 h-3 w-3" />{billingMut.isPending ? "Running..." : "Run Billing"}
              </Button>
            </div>
          </div></CardHeader>
            <CardContent><div className="overflow-x-auto rounded-md border"><Table>
              <TableHeader><TableRow>
                {["Portfolio", "Fee Type", "Period", "Gross", "Tax", "Net", "Status", "Actions"].map((h) => (
                  <TableHead key={h} className={["Gross", "Tax", "Net"].includes(h) ? "text-right" : ""}>{h}</TableHead>
                ))}
              </TableRow></TableHeader>
              <TableBody>
                {invQ.isLoading ? <SkeletonRows cols={8} /> : invoices.length === 0 ? <EmptyRow cols={8} msg="No invoices found" /> :
                  invoices.map((inv: Invoice) => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-medium">{inv.portfolio_name}</TableCell>
                      <TableCell><Badge className={bc(FEE_COLORS, inv.fee_type)}>{inv.fee_type}</Badge></TableCell>
                      <TableCell className="text-xs">{inv.period}</TableCell>
                      <TableCell className="text-right font-mono">{fmtPHP(inv.gross_amount)}</TableCell>
                      <TableCell className="text-right font-mono">{fmtPHP(inv.tax_amount)}</TableCell>
                      <TableCell className="text-right font-mono">{fmtPHP(inv.net_amount)}</TableCell>
                      <TableCell><Badge className={bc(INV_COLORS, inv.status)}>{inv.status}</Badge></TableCell>
                      <TableCell>
                        {(inv.status === "DRAFT" || inv.status === "ISSUED") && (
                          <Button variant="outline" size="sm" onClick={() => openWaive(inv.id)}><Ban className="mr-1 h-3 w-3" />Waive</Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table></div></CardContent>
          </Card>
        </TabsContent>

        {/* TER */}
        <TabsContent value="ter" className="mt-4">
          <Card><CardHeader className="pb-3">
            <CardTitle className="text-base">UITF Total Expense Ratio (TER)</CardTitle>
            <CardDescription>Calculate and view TER breakdown for UITF portfolios</CardDescription>
          </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-end gap-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Portfolio</label>
                  <Select value={terPid} onValueChange={setTerPid}>
                    <SelectTrigger className="w-[250px]"><SelectValue placeholder="Select portfolio" /></SelectTrigger>
                    <SelectContent>{portfolios.map((p: PortfolioOption) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1"><label className="text-sm font-medium">From</label><Input type="date" value={terFrom} onChange={(e) => setTerFrom(e.target.value)} className="w-[150px]" /></div>
                <div className="space-y-1"><label className="text-sm font-medium">To</label><Input type="date" value={terTo} onChange={(e) => setTerTo(e.target.value)} className="w-[150px]" /></div>
              </div>
              {terQ.isLoading && terPid && <div className="space-y-2"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-3/4" /></div>}
              {terQ.data && (<>
                <Separator />
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-lg border p-4 text-center">
                    <p className="text-sm font-medium text-muted-foreground">Total Expense Ratio</p>
                    <p className="mt-2 text-4xl font-bold text-primary">{fmtPct(terQ.data.ter_percent)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{terQ.data.portfolio_name}</p>
                  </div>
                  <div className="rounded-lg border p-4">
                    <p className="text-sm font-medium mb-3">Breakdown</p>
                    <div className="space-y-2">
                      {([["Management Fee", terQ.data.management_fee], ["Trustee Fee", terQ.data.trustee_fee], ["Admin Fee", terQ.data.admin_fee], ["Other Expenses", terQ.data.other_expenses]] as const).map(([label, val]) => (
                        <div key={label} className="flex items-center justify-between"><span className="text-sm text-muted-foreground">{label}</span><span className="font-mono text-sm">{fmtPHP(val)}</span></div>
                      ))}
                      <Separator />
                      <div className="flex items-center justify-between font-medium"><span className="text-sm">Total Expense</span><span className="font-mono text-sm">{fmtPHP(terQ.data.total_expense)}</span></div>
                      <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Average NAV</span><span className="font-mono text-sm">{fmtPHP(terQ.data.avg_nav)}</span></div>
                    </div>
                  </div>
                </div>
              </>)}
              {!terQ.isLoading && !terQ.data && terPid && <p className="text-sm text-muted-foreground text-center py-4">No TER data available for the selected portfolio and period</p>}
              {!terPid && <p className="text-sm text-muted-foreground text-center py-4">Select a portfolio to view its TER breakdown</p>}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add Schedule Dialog */}
      <Dialog open={schedOpen} onOpenChange={setSchedOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Fee Schedule</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">Portfolio</label>
              <Select value={ns.portfolio_id} onValueChange={(v) => setNs((s) => ({ ...s, portfolio_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select portfolio" /></SelectTrigger>
                <SelectContent>{portfolios.map((p: PortfolioOption) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Fee Type</label>
              <Select value={ns.fee_type} onValueChange={(v) => setNs((s) => ({ ...s, fee_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["MANAGEMENT", "TRUSTEE", "CUSTODIAN", "ADMIN", "PERFORMANCE", "AUDIT", "OTHER"].map((t) => <SelectItem key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Calculation Method</label>
              <Select value={ns.method} onValueChange={(v) => setNs((s) => ({ ...s, method: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[["AUM_BASED", "AUM Based"], ["FLAT_RATE", "Flat Rate"], ["TIERED", "Tiered"], ["PERFORMANCE_BASED", "Performance Based"]].map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Rate (%)</label>
              <Input type="number" step="0.0001" placeholder="0.0000" value={ns.rate_percent} onChange={(e) => setNs((s) => ({ ...s, rate_percent: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><label className="text-sm font-medium">Effective From</label><Input type="date" value={ns.effective_from} onChange={(e) => setNs((s) => ({ ...s, effective_from: e.target.value }))} /></div>
              <div className="space-y-1"><label className="text-sm font-medium">Effective To (optional)</label><Input type="date" value={ns.effective_to} onChange={(e) => setNs((s) => ({ ...s, effective_to: e.target.value }))} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSchedOpen(false)}>Cancel</Button>
            <Button onClick={() => addSchedMut.mutate({ portfolio_id: ns.portfolio_id, fee_type: ns.fee_type, method: ns.method, rate_percent: parseFloat(ns.rate_percent) || 0, effective_from: ns.effective_from, ...(ns.effective_to ? { effective_to: ns.effective_to } : {}) })} disabled={addSchedMut.isPending || !ns.portfolio_id || !ns.rate_percent || !ns.effective_from}>
              {addSchedMut.isPending ? "Creating..." : "Create Schedule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Waive Invoice Dialog */}
      <Dialog open={waiveOpen} onOpenChange={setWaiveOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Waive Invoice</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1"><label className="text-sm font-medium">Reason for Waiver</label><Input value={waiveReason} onChange={(e) => setWaiveReason(e.target.value)} placeholder="Enter waiver reason..." /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWaiveOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => waiveId && waiveMut.mutate({ id: waiveId, reason: waiveReason })} disabled={waiveMut.isPending || !waiveReason.trim()}>
              {waiveMut.isPending ? "Processing..." : "Confirm Waive"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
