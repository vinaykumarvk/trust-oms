/**
 * Corporate Actions Desk — Phase 3C (BRD Screen #19)
 * Calendar of upcoming CAs, entitlement calculations,
 * election processing, and CA history. Auto-refreshes every 30s.
 */
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@ui/lib/queryClient";
import { apiUrl } from "@ui/lib/api-url";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/ui/card";
import { Badge } from "@ui/components/ui/badge";
import { Button } from "@ui/components/ui/button";
import { Input } from "@ui/components/ui/input";
import { Separator } from "@ui/components/ui/separator";
import { Skeleton } from "@ui/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@ui/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ui/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@ui/components/ui/table";
import { CalendarDays, ListChecks, History, RefreshCw, Calculator, FileCheck, TrendingUp, Layers } from "lucide-react";

/* ---------- Types ---------- */
interface CorporateAction {
  id: string; security_name: string; security_code: string; type: string;
  ex_date: string; record_date: string; payment_date: string;
  ratio?: string; amount?: number; status: string;
}
interface Entitlement {
  id: string; corporate_action_id: string; ca_type: string; security_name: string;
  portfolio_name: string; entitled_qty: number; elected_option?: string;
  tax_amount: number; net_amount: number; status: string;
  position_change?: number; cash_change?: number;
}
interface CASummary { pending_count: number; upcoming_30d: number; processed_today: number; total_entitlements: number; }

/* ---------- Helpers ---------- */
const CA_TYPE_COLORS: Record<string, string> = {
  DIVIDEND: "bg-green-100 text-green-800", STOCK_SPLIT: "bg-blue-100 text-blue-800",
  RIGHTS: "bg-orange-100 text-orange-800", BONUS: "bg-purple-100 text-purple-800", MERGER: "bg-red-100 text-red-800",
};
const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-800", CALCULATED: "bg-blue-100 text-blue-800",
  ELECTED: "bg-indigo-100 text-indigo-800", POSTED: "bg-green-100 text-green-800", CANCELLED: "bg-muted text-foreground",
};
const fmtDate = (d: string) => { try { return new Date(d).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }); } catch { return d; } };
const fmtPHP = (n: number) => n.toLocaleString("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2 });
const fmtQty = (n: number) => n.toLocaleString("en-PH", { maximumFractionDigits: 4 });
const badgeCls = (map: Record<string, string>, key: string) => map[key] ?? "bg-muted text-foreground";

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
    <TableRow key={i}>{Array.from({ length: cols }).map((_, j) => (<TableCell key={j}><Skeleton className="h-4 w-16" /></TableCell>))}</TableRow>
  ))}</>;
}

function EmptyRow({ cols, msg }: { cols: number; msg: string }) {
  return <TableRow><TableCell colSpan={cols} className="py-8 text-center text-muted-foreground">{msg}</TableCell></TableRow>;
}

/* ---------- CA Row (Calendar + History) ---------- */
function CARow({ ca, showActions, onCalc, calcPending }: { ca: CorporateAction; showActions?: boolean; onCalc?: (id: string) => void; calcPending?: boolean }) {
  return (
    <TableRow>
      <TableCell><span className="font-medium">{ca.security_name}</span> <span className="text-xs text-muted-foreground">({ca.security_code})</span></TableCell>
      <TableCell><Badge className={badgeCls(CA_TYPE_COLORS, ca.type)}>{ca.type.replace("_", " ")}</Badge></TableCell>
      <TableCell className="text-xs">{fmtDate(ca.ex_date)}</TableCell>
      <TableCell className="text-xs">{fmtDate(ca.record_date)}</TableCell>
      <TableCell className="text-xs">{fmtDate(ca.payment_date)}</TableCell>
      <TableCell className="font-mono text-sm">{ca.ratio ?? (ca.amount != null ? fmtPHP(ca.amount) : "\u2014")}</TableCell>
      <TableCell><Badge className={badgeCls(STATUS_COLORS, ca.status)}>{ca.status}</Badge></TableCell>
      {showActions && (
        <TableCell>
          <Button variant="outline" size="sm" onClick={() => onCalc?.(ca.id)} disabled={calcPending || ca.status === "POSTED"}>
            <Calculator className="mr-1 h-3 w-3" />Calculate
          </Button>
        </TableCell>
      )}
    </TableRow>
  );
}

/* ========== Main Component ========== */
export default function CorporateActions() {
  const qc = useQueryClient();
  const [tab, setTab] = useState("calendar");
  const [selectedCaId, setSelectedCaId] = useState<string | null>(null);
  const [electOpen, setElectOpen] = useState(false);
  const [electEntId, setElectEntId] = useState<string | null>(null);
  const [electOption, setElectOption] = useState("CASH");
  const [historyFrom, setHistoryFrom] = useState("");
  const [historyTo, setHistoryTo] = useState("");

  // --- Queries ---
  const summaryQ = useQuery<CASummary>({ queryKey: ["ca-summary"], queryFn: () => apiRequest("GET", apiUrl("/api/v1/corporate-actions/summary")), refetchInterval: 30_000 });
  const summary = summaryQ.data ?? { pending_count: 0, upcoming_30d: 0, processed_today: 0, total_entitlements: 0 };

  const upcomingQ = useQuery<CorporateAction[]>({ queryKey: ["ca-upcoming"], queryFn: () => apiRequest("GET", apiUrl("/api/v1/corporate-actions/upcoming?days=30")), refetchInterval: 30_000 });
  const upcomingCAs = upcomingQ.data ?? [];

  const entQ = useQuery<Entitlement[]>({
    queryKey: ["ca-entitlements", selectedCaId],
    queryFn: () => { const u = selectedCaId ? `/api/v1/corporate-actions/${selectedCaId}/entitlements` : "/api/v1/corporate-actions/entitlements"; return apiRequest("GET", apiUrl(u)); },
    refetchInterval: 30_000, enabled: tab === "entitlements",
  });
  const entitlements = entQ.data ?? [];

  const historyParams = useMemo(() => { const p = new URLSearchParams(); if (historyFrom) p.set("from", historyFrom); if (historyTo) p.set("to", historyTo); return p.toString(); }, [historyFrom, historyTo]);
  const historyQ = useQuery<CorporateAction[]>({
    queryKey: ["ca-history", historyParams],
    queryFn: () => apiRequest("GET", apiUrl(`/api/v1/corporate-actions/history${historyParams ? `?${historyParams}` : ""}`)),
    refetchInterval: 30_000, enabled: tab === "history",
  });
  const historyCAs = historyQ.data ?? [];

  // --- Mutations ---
  const invalidateCA = () => { qc.invalidateQueries({ queryKey: ["ca-upcoming"] }); qc.invalidateQueries({ queryKey: ["ca-entitlements"] }); qc.invalidateQueries({ queryKey: ["ca-summary"] }); };
  const calcMut = useMutation({ mutationFn: (id: string) => apiRequest("POST", apiUrl(`/api/v1/corporate-actions/${id}/calculate`)), onSuccess: invalidateCA });
  const electMut = useMutation({
    mutationFn: ({ entId, option }: { entId: string; option: string }) => apiRequest("POST", apiUrl(`/api/v1/corporate-actions/entitlements/${entId}/elect`), { option }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ca-entitlements"] }); qc.invalidateQueries({ queryKey: ["ca-summary"] }); setElectOpen(false); },
  });
  const postMut = useMutation({
    mutationFn: (id: string) => apiRequest("POST", apiUrl(`/api/v1/corporate-actions/entitlements/${id}/post`)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ca-entitlements"] }); qc.invalidateQueries({ queryKey: ["ca-summary"] }); },
  });

  const openElect = (id: string) => { setElectEntId(id); setElectOption("CASH"); setElectOpen(true); };

  const ELECT_DESC: Record<string, string> = {
    CASH: "Cash proceeds credited to portfolio cash account on the payment date.",
    REINVEST: "Dividend proceeds reinvested into additional shares of the same security.",
    TENDER: "Shares tendered and removed from holdings. Cash proceeds credited on settlement.",
    RIGHTS: "Rights exercised at subscription price. New shares added on settlement.",
  };

  const caHeaders = ["Security", "Type", "Ex-Date", "Record Date", "Payment Date", "Ratio/Amount", "Status"];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10"><CalendarDays className="h-5 w-5 text-primary" /></div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Corporate Actions Desk</h1>
            <p className="text-sm text-muted-foreground">Manage dividends, splits, rights issues, and other corporate events</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => { upcomingQ.refetch(); entQ.refetch(); summaryQ.refetch(); }} disabled={upcomingQ.isFetching}>
          <RefreshCw className={`h-4 w-4 ${upcomingQ.isFetching ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard title="Pending CAs" value={summary.pending_count} icon={ListChecks} accent="bg-yellow-500" />
        <SummaryCard title="Upcoming (30d)" value={summary.upcoming_30d} icon={CalendarDays} accent="bg-blue-600" />
        <SummaryCard title="Processed Today" value={summary.processed_today} icon={FileCheck} accent="bg-green-600" />
        <SummaryCard title="Total Entitlements" value={summary.total_entitlements} icon={Layers} accent="bg-indigo-600" />
      </div>

      <Separator />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="calendar"><CalendarDays className="mr-1 h-4 w-4" /> Calendar</TabsTrigger>
          <TabsTrigger value="entitlements"><ListChecks className="mr-1 h-4 w-4" /> Entitlements</TabsTrigger>
          <TabsTrigger value="history"><History className="mr-1 h-4 w-4" /> History</TabsTrigger>
        </TabsList>

        {/* Calendar */}
        <TabsContent value="calendar" className="mt-4">
          <Card><CardHeader className="pb-3"><CardTitle className="text-base">Upcoming Corporate Actions (30 days)</CardTitle></CardHeader>
            <CardContent><div className="overflow-x-auto rounded-md border"><Table>
              <TableHeader><TableRow>{[...caHeaders, "Actions"].map((h) => <TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader>
              <TableBody>
                {upcomingQ.isLoading ? <SkeletonRows cols={8} /> : upcomingCAs.length === 0 ? <EmptyRow cols={8} msg="No upcoming corporate actions" /> :
                  upcomingCAs.map((ca) => <CARow key={ca.id} ca={ca} showActions onCalc={(id) => calcMut.mutate(id)} calcPending={calcMut.isPending} />)}
              </TableBody>
            </Table></div></CardContent>
          </Card>
        </TabsContent>

        {/* Entitlements */}
        <TabsContent value="entitlements" className="mt-4">
          <Card><CardHeader className="pb-3"><div className="flex items-center justify-between">
            <CardTitle className="text-base">Entitlements</CardTitle>
            <Select value={selectedCaId ?? "all"} onValueChange={(v) => setSelectedCaId(v === "all" ? null : v)}>
              <SelectTrigger className="w-[200px]"><SelectValue placeholder="Filter by CA" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Entitlements</SelectItem>
                {upcomingCAs.map((ca) => <SelectItem key={ca.id} value={ca.id}>{ca.security_name} — {ca.type}</SelectItem>)}
              </SelectContent>
            </Select>
          </div></CardHeader>
            <CardContent><div className="overflow-x-auto rounded-md border"><Table>
              <TableHeader><TableRow>
                {["CA Type", "Security", "Portfolio", "Entitled Qty", "Elected", "Tax", "Net Amount", "Status", "Impact", "Actions"].map((h) => (
                  <TableHead key={h} className={["Entitled Qty", "Tax", "Net Amount"].includes(h) ? "text-right" : ""}>{h}</TableHead>
                ))}
              </TableRow></TableHeader>
              <TableBody>
                {entQ.isLoading ? <SkeletonRows cols={10} /> : entitlements.length === 0 ? <EmptyRow cols={10} msg="No entitlements found" /> :
                  entitlements.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell><Badge className={badgeCls(CA_TYPE_COLORS, e.ca_type)}>{e.ca_type.replace("_", " ")}</Badge></TableCell>
                      <TableCell className="font-medium">{e.security_name}</TableCell>
                      <TableCell>{e.portfolio_name}</TableCell>
                      <TableCell className="text-right font-mono">{fmtQty(e.entitled_qty)}</TableCell>
                      <TableCell>{e.elected_option ? <Badge variant="outline">{e.elected_option}</Badge> : <span className="text-xs text-muted-foreground">Not elected</span>}</TableCell>
                      <TableCell className="text-right font-mono">{fmtPHP(e.tax_amount)}</TableCell>
                      <TableCell className="text-right font-mono">{fmtPHP(e.net_amount)}</TableCell>
                      <TableCell><Badge className={badgeCls(STATUS_COLORS, e.status)}>{e.status}</Badge></TableCell>
                      <TableCell>
                        {(e.position_change != null || e.cash_change != null) && (
                          <div className="text-xs space-y-0.5">
                            {e.position_change != null && <div className="flex items-center gap-1"><TrendingUp className="h-3 w-3 text-muted-foreground" /><span className={e.position_change >= 0 ? "text-green-700" : "text-red-700"}>{e.position_change >= 0 ? "+" : ""}{fmtQty(e.position_change)} shares</span></div>}
                            {e.cash_change != null && <div><span className={e.cash_change >= 0 ? "text-green-700" : "text-red-700"}>{e.cash_change >= 0 ? "+" : ""}{fmtPHP(e.cash_change)}</span></div>}
                          </div>
                        )}
                      </TableCell>
                      <TableCell><div className="flex gap-1">
                        {e.status === "CALCULATED" && !e.elected_option && <Button variant="outline" size="sm" onClick={() => openElect(e.id)}>Elect</Button>}
                        {e.status === "ELECTED" && <Button size="sm" onClick={() => postMut.mutate(e.id)} disabled={postMut.isPending}>Post</Button>}
                      </div></TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table></div></CardContent>
          </Card>
        </TabsContent>

        {/* History */}
        <TabsContent value="history" className="mt-4">
          <Card><CardHeader className="pb-3"><div className="flex items-center justify-between">
            <CardTitle className="text-base">Processed Corporate Actions</CardTitle>
            <div className="flex gap-2">
              <Input type="date" value={historyFrom} onChange={(e) => setHistoryFrom(e.target.value)} className="w-[150px]" />
              <Input type="date" value={historyTo} onChange={(e) => setHistoryTo(e.target.value)} className="w-[150px]" />
            </div>
          </div></CardHeader>
            <CardContent><div className="overflow-x-auto rounded-md border"><Table>
              <TableHeader><TableRow>{caHeaders.map((h) => <TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader>
              <TableBody>
                {historyQ.isLoading ? <SkeletonRows cols={7} /> : historyCAs.length === 0 ? <EmptyRow cols={7} msg="No processed corporate actions found" /> :
                  historyCAs.map((ca) => <CARow key={ca.id} ca={ca} />)}
              </TableBody>
            </Table></div></CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Election Dialog */}
      <Dialog open={electOpen} onOpenChange={setElectOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Elect Entitlement Option</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">Election Option</label>
              <Select value={electOption} onValueChange={setElectOption}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CASH">Cash Dividend</SelectItem>
                  <SelectItem value="REINVEST">Reinvest (DRIP)</SelectItem>
                  <SelectItem value="TENDER">Tender</SelectItem>
                  <SelectItem value="RIGHTS">Exercise Rights</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="rounded-lg border bg-muted/50 p-3">
              <p className="text-sm font-medium mb-1">Impact Preview</p>
              <p className="text-xs text-muted-foreground">{ELECT_DESC[electOption]}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setElectOpen(false)}>Cancel</Button>
            <Button onClick={() => electEntId && electMut.mutate({ entId: electEntId, option: electOption })} disabled={electMut.isPending}>
              {electMut.isPending ? "Processing..." : "Confirm Election"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
