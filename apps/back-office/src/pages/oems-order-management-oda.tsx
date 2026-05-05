import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@ui/lib/queryClient";
import { Badge } from "@ui/components/ui/badge";
import { Button } from "@ui/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@ui/components/ui/dialog";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/components/ui/tabs";
import { Textarea } from "@ui/components/ui/textarea";
import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Clock,
  Download,
  FileCheck,
  RefreshCcw,
  Send,
  ShieldCheck,
  XCircle,
} from "lucide-react";

// ---------- Constants ----------

const CURRENCY_PAIRS = [
  "USD/IDR",
  "EUR/IDR",
  "GBP/IDR",
  "JPY/IDR",
  "SGD/IDR",
  "AUD/IDR",
  "CHF/IDR",
  "CNY/IDR",
] as const;

const LIFECYCLE_OPTIONS = [
  "AUTHORIZED",
  "HELD",
  "COLLECTED",
  "PLACED",
  "OBSERVATION",
  "EXECUTED",
  "BOOKED",
] as const;

// ---------- Helpers ----------

const fmtMoney = (val: number | string | null | undefined): string => {
  if (val == null) return "-";
  const n = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(n)) return "-";
  return new Intl.NumberFormat("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
};

function statusBadgeVariant(status: string): "default" | "outline" | "destructive" | "secondary" {
  const upper = (status ?? "").toUpperCase();
  if (["CANCELLED", "REJECTED", "EXPIRED", "EXCEPTION", "FAILED"].includes(upper)) return "destructive";
  if (["OBSERVATION", "PLACED"].includes(upper)) return "outline";
  if (["AUTHORIZED", "HELD", "BOOKED", "APPROVED", "EXECUTED"].includes(upper)) return "default";
  return "secondary";
}

function StatusBadge({ status }: { status: string }) {
  return <Badge variant={statusBadgeVariant(status)}>{status}</Badge>;
}

function ProgressBar({ value }: { value: number }) {
  const pct = Math.min(100, Math.max(0, value));
  const color = pct > 80 ? "bg-green-500" : pct >= 50 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="w-24 h-2 rounded bg-muted overflow-hidden">
      <div className={`h-full rounded ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function CotCountdown({ cutoffAt }: { cutoffAt: string | null | undefined }) {
  if (!cutoffAt) return null;
  const diff = new Date(cutoffAt).getTime() - Date.now();
  if (diff <= 0) return <span className="text-destructive text-xs font-semibold">COT Expired</span>;
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return (
    <span className="text-xs text-orange-600 font-medium flex items-center gap-1">
      <Clock className="h-3 w-3" />
      {hrs > 0 ? `${hrs}h ${rem}m` : `${rem}m`}
    </span>
  );
}

// ---------- Tab A: Pending Approval Queue ----------

function PendingApprovalTab() {
  const qc = useQueryClient();
  const [branch, setBranch] = useState("");
  const [pair, setPair] = useState("");
  const [orderType, setOrderType] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  const [rejectDialog, setRejectDialog] = useState<{ id: string } | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [infoDialog, setInfoDialog] = useState<{ id: string } | null>(null);
  const [infoComment, setInfoComment] = useState("");

  const { data, isLoading } = useQuery<{ items: any[]; total: number }>({
    queryKey: ["oda-pending", branch, pair, orderType, dateFrom, dateTo, page],
    queryFn: () => {
      const params = new URLSearchParams();
      if (branch) params.set("branch", branch);
      if (pair) params.set("currencyPair", pair);
      if (orderType) params.set("orderType", orderType);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      params.set("page", String(page));
      params.set("pageSize", "20");
      return apiRequest("GET", `/api/v1/oems/oda/pending-approval?${params}`);
    },
  });

  const approveMut = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/v1/oems/oda/recommendations/${id}/approve-order`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["oda-pending"] }),
  });

  const rejectMut = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiRequest("POST", `/api/v1/oems/oda/recommendations/${id}/reject-order`, { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["oda-pending"] });
      setRejectDialog(null);
      setRejectReason("");
    },
  });

  const infoMut = useMutation({
    mutationFn: ({ id, comment }: { id: string; comment: string }) =>
      apiRequest("POST", `/api/v1/oems/oda/recommendations/${id}/request-info`, { comment }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["oda-pending"] });
      setInfoDialog(null);
      setInfoComment("");
    },
  });

  const items = data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <Label>Branch</Label>
          <Input className="w-28" value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="Branch" />
        </div>
        <div className="space-y-1">
          <Label>Currency Pair</Label>
          <Select value={pair} onValueChange={setPair}>
            <SelectTrigger className="w-32"><SelectValue placeholder="All" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">All</SelectItem>
              {CURRENCY_PAIRS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Order Type</Label>
          <Select value={orderType} onValueChange={setOrderType}>
            <SelectTrigger className="w-28"><SelectValue placeholder="All" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">All</SelectItem>
              <SelectItem value="BUY">BUY</SelectItem>
              <SelectItem value="SELL">SELL</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>From</Label>
          <Input type="date" className="w-36" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>To</Label>
          <Input type="date" className="w-36" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ID</TableHead>
            <TableHead>CIF</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Pair</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Eff. Type</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead className="text-right">Target Rate</TableHead>
            <TableHead>Submitted</TableHead>
            <TableHead>Balance</TableHead>
            <TableHead>PFE</TableHead>
            <TableHead>SKU</TableHead>
            <TableHead>COT</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && (
            <TableRow><TableCell colSpan={14} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
          )}
          {!isLoading && items.length === 0 && (
            <TableRow><TableCell colSpan={14} className="text-center py-8 text-muted-foreground">No pending orders</TableCell></TableRow>
          )}
          {items.map((row: any) => (
            <TableRow key={row.id ?? row.recommendation_id}>
              <TableCell className="font-mono text-xs">{row.recommendation_id ?? row.id}</TableCell>
              <TableCell>{row.customer_cif ?? "-"}</TableCell>
              <TableCell>{row.payload?.customer_name ?? row.customer_name ?? "-"}</TableCell>
              <TableCell>{row.currency_pair}</TableCell>
              <TableCell>{row.order_type}</TableCell>
              <TableCell>{row.effective_type ?? "-"}</TableCell>
              <TableCell className="text-right font-mono">{fmtMoney(row.amount)}</TableCell>
              <TableCell className="text-right font-mono">{fmtMoney(row.target_rate)}</TableCell>
              <TableCell className="text-xs">{row.submission_time ? new Date(row.submission_time).toLocaleString() : "-"}</TableCell>
              <TableCell>{row.balance_check ? <CheckCircle className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-red-500" />}</TableCell>
              <TableCell>{row.pfe_check ? <CheckCircle className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-red-500" />}</TableCell>
              <TableCell>{row.sku_check ? <CheckCircle className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-red-500" />}</TableCell>
              <TableCell><CotCountdown cutoffAt={row.payload?.cutoff_at ?? row.cutoff_at} /></TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button size="sm" variant="default" className="bg-green-600 hover:bg-green-700 h-7 px-2 text-xs" onClick={() => approveMut.mutate(row.recommendation_id ?? row.id)}>
                    <ShieldCheck className="h-3 w-3 mr-1" />Approve
                  </Button>
                  <Button size="sm" variant="destructive" className="h-7 px-2 text-xs" onClick={() => setRejectDialog({ id: row.recommendation_id ?? row.id })}>
                    <XCircle className="h-3 w-3 mr-1" />Reject
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setInfoDialog({ id: row.recommendation_id ?? row.id })}>
                    <AlertTriangle className="h-3 w-3 mr-1" />Info
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {(data?.total ?? 0) > 20 && (
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</Button>
          <Button size="sm" variant="outline" onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      )}

      {/* Reject Dialog */}
      <Dialog open={!!rejectDialog} onOpenChange={() => setRejectDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject Order</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>Reason (min 10 characters)</Label>
            <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Provide rejection reason..." />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialog(null)}>Cancel</Button>
            <Button variant="destructive" disabled={rejectReason.trim().length < 10 || rejectMut.isPending} onClick={() => rejectDialog && rejectMut.mutate({ id: rejectDialog.id, reason: rejectReason.trim() })}>
              Confirm Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Request Info Dialog */}
      <Dialog open={!!infoDialog} onOpenChange={() => setInfoDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Request Information</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>Comment</Label>
            <Textarea value={infoComment} onChange={(e) => setInfoComment(e.target.value)} placeholder="What additional information is needed?" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInfoDialog(null)}>Cancel</Button>
            <Button disabled={!infoComment.trim() || infoMut.isPending} onClick={() => infoDialog && infoMut.mutate({ id: infoDialog.id, comment: infoComment.trim() })}>
              Send Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------- Tab B: Live ODA Blotter ----------

function LiveBlotterTab() {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [pair, setPair] = useState("");
  const [lifecycle, setLifecycle] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery<{ items: any[]; total: number }>({
    queryKey: ["oda-blotter", dateFrom, dateTo, pair, lifecycle, page],
    queryFn: () => {
      const params = new URLSearchParams();
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      if (pair) params.set("currencyPair", pair);
      if (lifecycle) params.set("lifecycle", lifecycle);
      params.set("page", String(page));
      params.set("pageSize", "20");
      return apiRequest("GET", `/api/v1/oems/oda/blotter/enhanced?${params}`);
    },
  });

  const items = useMemo(() => {
    const list = data?.items ?? [];
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter((r: any) =>
      (r.customer_name ?? "").toLowerCase().includes(q) ||
      (r.customer_cif ?? "").toLowerCase().includes(q) ||
      (r.order_id ?? "").toLowerCase().includes(q)
    );
  }, [data, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <Label>From</Label>
          <Input type="date" className="w-36" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>To</Label>
          <Input type="date" className="w-36" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Currency Pair</Label>
          <Select value={pair} onValueChange={setPair}>
            <SelectTrigger className="w-32"><SelectValue placeholder="All" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">All</SelectItem>
              {CURRENCY_PAIRS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Lifecycle</Label>
          <Select value={lifecycle} onValueChange={setLifecycle}>
            <SelectTrigger className="w-40"><SelectValue placeholder="All" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">All</SelectItem>
              {LIFECYCLE_OPTIONS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Search</Label>
          <Input className="w-40" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Customer/ID..." />
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ID</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Pair</TableHead>
            <TableHead>Dir</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Eff. Type</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead className="text-right">Rate</TableHead>
            <TableHead className="text-right">Nominal</TableHead>
            <TableHead>CBS Hold</TableHead>
            <TableHead>Progress</TableHead>
            <TableHead>Lifecycle</TableHead>
            <TableHead className="text-right">Settle Rate</TableHead>
            <TableHead>Approved By</TableHead>
            <TableHead>Notif.</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && (
            <TableRow><TableCell colSpan={15} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
          )}
          {!isLoading && items.length === 0 && (
            <TableRow><TableCell colSpan={15} className="text-center py-8 text-muted-foreground">No blotter entries</TableCell></TableRow>
          )}
          {items.map((row: any) => {
            const nominal = row.amount && row.rate ? parseFloat(row.amount) * parseFloat(row.rate) : null;
            return (
              <TableRow key={row.order_id ?? row.id}>
                <TableCell className="font-mono text-xs">{row.order_id ?? row.id}</TableCell>
                <TableCell>{row.customer_name ?? row.customer_cif ?? "-"}</TableCell>
                <TableCell>{row.currency_pair}</TableCell>
                <TableCell>{row.direction}</TableCell>
                <TableCell>{row.order_type ?? "-"}</TableCell>
                <TableCell>{row.effective_type ?? "-"}</TableCell>
                <TableCell className="text-right font-mono">{fmtMoney(row.amount)}</TableCell>
                <TableCell className="text-right font-mono">{fmtMoney(row.rate)}</TableCell>
                <TableCell className="text-right font-mono">{fmtMoney(nominal)}</TableCell>
                <TableCell><StatusBadge status={row.cbs_hold_status ?? "N/A"} /></TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <ProgressBar value={row.collective_progress ?? 0} />
                    <span className="text-xs">{row.collective_progress ?? 0}%</span>
                  </div>
                </TableCell>
                <TableCell><StatusBadge status={row.lifecycle ?? row.status ?? "-"} /></TableCell>
                <TableCell className="text-right font-mono">{fmtMoney(row.settlement_rate)}</TableCell>
                <TableCell className="text-xs">{row.approved_by ?? "-"}</TableCell>
                <TableCell><StatusBadge status={row.notification_status ?? "N/A"} /></TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {(data?.total ?? 0) > 20 && (
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</Button>
          <Button size="sm" variant="outline" onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}

// ---------- Tab C: Treasury Summary ----------

function TreasurySummaryTab() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [pair, setPair] = useState("");
  const [direction, setDirection] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery<{ groups: any[] }>({
    queryKey: ["oda-treasury", date, pair, direction],
    queryFn: () => {
      const params = new URLSearchParams();
      if (date) params.set("date", date);
      if (pair) params.set("currencyPair", pair);
      if (direction) params.set("direction", direction);
      return apiRequest("GET", `/api/v1/oems/oda/treasury-summary/detailed?${params}`);
    },
  });

  const toggleGroup = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const groups = data?.groups ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <Label>Date</Label>
          <Input type="date" className="w-36" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Currency Pair</Label>
          <Select value={pair} onValueChange={setPair}>
            <SelectTrigger className="w-32"><SelectValue placeholder="All" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">All</SelectItem>
              {CURRENCY_PAIRS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Direction</Label>
          <Select value={direction} onValueChange={setDirection}>
            <SelectTrigger className="w-28"><SelectValue placeholder="All" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">All</SelectItem>
              <SelectItem value="BUY">BUY</SelectItem>
              <SelectItem value="SELL">SELL</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" className="ml-auto">
          <Download className="h-4 w-4 mr-1" />Export
        </Button>
      </div>

      {isLoading && <p className="text-muted-foreground text-sm py-4">Loading treasury summary...</p>}

      {!isLoading && groups.length === 0 && (
        <p className="text-muted-foreground text-sm py-4">No treasury groups for selected filters.</p>
      )}

      <div className="space-y-3">
        {groups.map((g: any, idx: number) => {
          const key = `${g.currency_pair}-${g.direction}-${idx}`;
          const isOpen = expanded.has(key);
          return (
            <Card key={key}>
              <CardHeader className="py-3 px-4 cursor-pointer" onClick={() => toggleGroup(key)}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    <CardTitle className="text-sm font-medium">
                      {g.currency_pair} - {g.direction}
                    </CardTitle>
                    <StatusBadge status={g.group_status ?? "OPEN"} />
                  </div>
                  <div className="flex gap-6 text-xs text-muted-foreground">
                    <span>Orders: <strong>{g.order_count ?? 0}</strong></span>
                    <span>Total: <strong>{fmtMoney(g.total_amount)}</strong></span>
                    <span>Target: <strong>{fmtMoney(g.target_rate)}</strong></span>
                    <span>Final Settle: <strong>{fmtMoney(g.final_settlement_rate)}</strong></span>
                  </div>
                </div>
              </CardHeader>
              {isOpen && (
                <CardContent className="pt-0 px-4 pb-3">
                  <div className="grid grid-cols-4 gap-4 text-xs mb-3">
                    <div><span className="text-muted-foreground">Cost Before Swap:</span> {fmtMoney(g.cost_before_swap)}</div>
                    <div><span className="text-muted-foreground">Reference Rate:</span> {fmtMoney(g.reference_rate)}</div>
                    <div><span className="text-muted-foreground">Swap Points:</span> {g.swap_points ?? "-"}</div>
                    <div><span className="text-muted-foreground">Final Settlement:</span> {fmtMoney(g.final_settlement_rate)}</div>
                  </div>
                  {g.orders && g.orders.length > 0 && (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Order ID</TableHead>
                          <TableHead>Customer</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead className="text-right">Target Rate</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {g.orders.map((o: any) => (
                          <TableRow key={o.order_id ?? o.id}>
                            <TableCell className="font-mono text-xs">{o.order_id ?? o.id}</TableCell>
                            <TableCell>{o.customer_name ?? o.customer_cif ?? "-"}</TableCell>
                            <TableCell className="text-right font-mono">{fmtMoney(o.amount)}</TableCell>
                            <TableCell className="text-right font-mono">{fmtMoney(o.target_rate)}</TableCell>
                            <TableCell><StatusBadge status={o.status ?? "-"} /></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Tab D: Trade Confirmation Entry ----------

function TradeConfirmationTab() {
  const qc = useQueryClient();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [pair, setPair] = useState("");
  const [confStatus, setConfStatus] = useState("");
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);

  // Form state
  const [formRecId, setFormRecId] = useState("");
  const [formExecStatus, setFormExecStatus] = useState("EXECUTED");
  const [formDealRef, setFormDealRef] = useState("");
  const [formExecDate, setFormExecDate] = useState("");
  const [formExecTime, setFormExecTime] = useState("");
  const [formAutoSettle, setFormAutoSettle] = useState(false);
  const [formExpiryReason, setFormExpiryReason] = useState("");
  const [formObsNotes, setFormObsNotes] = useState("");

  // Approve/reject dialog
  const [actionDialog, setActionDialog] = useState<{ id: string; action: "APPROVE" | "REJECT" } | null>(null);
  const [actionReason, setActionReason] = useState("");

  const { data, isLoading } = useQuery<{ items: any[]; total: number }>({
    queryKey: ["oda-confirmations", date, pair, confStatus, page],
    queryFn: () => {
      const params = new URLSearchParams();
      if (date) params.set("date", date);
      if (confStatus) params.set("status", confStatus);
      params.set("page", String(page));
      params.set("pageSize", "20");
      return apiRequest("GET", `/api/v1/oems/oda/trade-confirmations?${params}`);
    },
  });

  const createMut = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/v1/oems/oda/trade-confirmations", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["oda-confirmations"] });
      setShowCreate(false);
      resetForm();
    },
  });

  const approveMut = useMutation({
    mutationFn: ({ id, action, reason }: { id: string; action: string; reason?: string }) =>
      apiRequest("POST", `/api/v1/oems/oda/trade-confirmations/${id}/approve`, { action, reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["oda-confirmations"] });
      setActionDialog(null);
      setActionReason("");
    },
  });

  function resetForm() {
    setFormRecId("");
    setFormExecStatus("EXECUTED");
    setFormDealRef("");
    setFormExecDate("");
    setFormExecTime("");
    setFormAutoSettle(false);
    setFormExpiryReason("");
    setFormObsNotes("");
  }

  function handleSubmitCreate() {
    const body: any = {
      recommendation_id: formRecId,
      execution_status: formExecStatus,
      execution_date: formExecDate || undefined,
      execution_time: formExecTime || undefined,
      auto_settle_flag: formAutoSettle,
    };
    if (formExecStatus === "EXECUTED") body.deal_reference = formDealRef;
    if (formExecStatus === "EXPIRED") body.expiry_reason = formExpiryReason;
    if (formExecStatus === "REMAIN_IN_OBSERVATION") body.observation_notes = formObsNotes;
    createMut.mutate(body);
  }

  const isCreateValid = useMemo(() => {
    if (!formRecId) return false;
    if (formExecStatus === "EXECUTED" && !formDealRef) return false;
    if (formExecStatus === "EXPIRED" && !formExpiryReason.trim()) return false;
    return true;
  }, [formRecId, formExecStatus, formDealRef, formExpiryReason]);

  const items = data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <Label>Date</Label>
          <Input type="date" className="w-36" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Currency Pair</Label>
          <Select value={pair} onValueChange={setPair}>
            <SelectTrigger className="w-32"><SelectValue placeholder="All" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">All</SelectItem>
              {CURRENCY_PAIRS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Status</Label>
          <Select value={confStatus} onValueChange={setConfStatus}>
            <SelectTrigger className="w-32"><SelectValue placeholder="All" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">All</SelectItem>
              <SelectItem value="DRAFT">DRAFT</SelectItem>
              <SelectItem value="APPROVED">APPROVED</SelectItem>
              <SelectItem value="REJECTED">REJECTED</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button className="ml-auto" onClick={() => setShowCreate(true)}>
          <FileCheck className="h-4 w-4 mr-1" />New Confirmation
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Conf. No</TableHead>
            <TableHead>Rec ID</TableHead>
            <TableHead>Exec Status</TableHead>
            <TableHead>Deal Ref</TableHead>
            <TableHead>Date/Time</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Maker</TableHead>
            <TableHead>Checker</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && (
            <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
          )}
          {!isLoading && items.length === 0 && (
            <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No confirmations found</TableCell></TableRow>
          )}
          {items.map((row: any) => (
            <TableRow key={row.confirmation_no ?? row.id}>
              <TableCell className="font-mono text-xs">{row.confirmation_no ?? row.id}</TableCell>
              <TableCell className="font-mono text-xs">{row.recommendation_id ?? "-"}</TableCell>
              <TableCell><StatusBadge status={row.execution_status ?? "-"} /></TableCell>
              <TableCell>{row.deal_reference ?? "-"}</TableCell>
              <TableCell className="text-xs">
                {row.execution_date ?? "-"}{row.execution_time ? ` ${row.execution_time}` : ""}
              </TableCell>
              <TableCell><StatusBadge status={row.status ?? "DRAFT"} /></TableCell>
              <TableCell className="text-xs">{row.maker ?? "-"}</TableCell>
              <TableCell className="text-xs">{row.checker ?? "-"}</TableCell>
              <TableCell>
                {(row.status === "DRAFT" || !row.status) && (
                  <div className="flex gap-1">
                    <Button size="sm" variant="default" className="h-7 px-2 text-xs" onClick={() => setActionDialog({ id: row.id ?? row.confirmation_no, action: "APPROVE" })}>
                      Approve
                    </Button>
                    <Button size="sm" variant="destructive" className="h-7 px-2 text-xs" onClick={() => setActionDialog({ id: row.id ?? row.confirmation_no, action: "REJECT" })}>
                      Reject
                    </Button>
                  </div>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {(data?.total ?? 0) > 20 && (
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</Button>
          <Button size="sm" variant="outline" onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      )}

      {/* Create Confirmation Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>New Trade Confirmation</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Recommendation ID *</Label>
              <Input value={formRecId} onChange={(e) => setFormRecId(e.target.value)} placeholder="REC-..." />
            </div>
            <div className="space-y-1">
              <Label>Execution Status *</Label>
              <Select value={formExecStatus} onValueChange={setFormExecStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="EXECUTED">EXECUTED</SelectItem>
                  <SelectItem value="EXPIRED">EXPIRED</SelectItem>
                  <SelectItem value="REMAIN_IN_OBSERVATION">REMAIN IN OBSERVATION</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {formExecStatus === "EXECUTED" && (
              <>
                <div className="space-y-1">
                  <Label>Deal Reference *</Label>
                  <Input value={formDealRef} onChange={(e) => setFormDealRef(e.target.value)} placeholder="Deal reference number" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Execution Date</Label>
                    <Input type="date" value={formExecDate} onChange={(e) => setFormExecDate(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>Execution Time</Label>
                    <Input type="time" value={formExecTime} onChange={(e) => setFormExecTime(e.target.value)} />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="auto-settle" checked={formAutoSettle} onChange={(e) => setFormAutoSettle(e.target.checked)} className="h-4 w-4" />
                  <Label htmlFor="auto-settle">Auto-settle flag</Label>
                </div>
              </>
            )}
            {formExecStatus === "EXPIRED" && (
              <div className="space-y-1">
                <Label>Expiry Reason *</Label>
                <Textarea value={formExpiryReason} onChange={(e) => setFormExpiryReason(e.target.value)} placeholder="Reason for expiry..." />
              </div>
            )}
            {formExecStatus === "REMAIN_IN_OBSERVATION" && (
              <div className="space-y-1">
                <Label>Observation Notes</Label>
                <Textarea value={formObsNotes} onChange={(e) => setFormObsNotes(e.target.value)} placeholder="Notes for observation period..." />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreate(false); resetForm(); }}>Cancel</Button>
            <Button disabled={!isCreateValid || createMut.isPending} onClick={handleSubmitCreate}>
              Create Confirmation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve/Reject Confirmation Dialog */}
      <Dialog open={!!actionDialog} onOpenChange={() => setActionDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{actionDialog?.action === "APPROVE" ? "Approve" : "Reject"} Confirmation</DialogTitle></DialogHeader>
          {actionDialog?.action === "REJECT" && (
            <div className="space-y-2">
              <Label>Reason</Label>
              <Textarea value={actionReason} onChange={(e) => setActionReason(e.target.value)} placeholder="Rejection reason..." />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialog(null)}>Cancel</Button>
            <Button
              variant={actionDialog?.action === "REJECT" ? "destructive" : "default"}
              disabled={approveMut.isPending || (actionDialog?.action === "REJECT" && !actionReason.trim())}
              onClick={() => actionDialog && approveMut.mutate({ id: actionDialog.id, action: actionDialog.action, reason: actionReason.trim() || undefined })}
            >
              Confirm {actionDialog?.action === "APPROVE" ? "Approval" : "Rejection"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------- Tab E: Cancelled & Failed ----------

function CancelledFailedTab() {
  const qc = useQueryClient();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [pair, setPair] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery<{ items: any[]; total: number }>({
    queryKey: ["oda-cancelled", dateFrom, dateTo, pair, page],
    queryFn: () => {
      const params = new URLSearchParams();
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      if (pair) params.set("currencyPair", pair);
      params.set("page", String(page));
      params.set("pageSize", "20");
      return apiRequest("GET", `/api/v1/oems/oda/cancelled?${params}`);
    },
  });

  const retryMut = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/v1/oems/oda/cancelled/${id}/retry-unhold`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["oda-cancelled"] }),
  });

  const resendMut = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/v1/oems/oda/cancelled/${id}/resend-notification`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["oda-cancelled"] }),
  });

  const items = data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <Label>From</Label>
          <Input type="date" className="w-36" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>To</Label>
          <Input type="date" className="w-36" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Currency Pair</Label>
          <Select value={pair} onValueChange={setPair}>
            <SelectTrigger className="w-32"><SelectValue placeholder="All" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">All</SelectItem>
              {CURRENCY_PAIRS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ID</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Pair / Dir</TableHead>
            <TableHead>Reason</TableHead>
            <TableHead>CBS Unhold</TableHead>
            <TableHead>Notification</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Cancelled By</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && (
            <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
          )}
          {!isLoading && items.length === 0 && (
            <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">No cancelled/failed orders</TableCell></TableRow>
          )}
          {items.map((row: any) => (
            <TableRow key={row.id}>
              <TableCell className="font-mono text-xs">{row.id}</TableCell>
              <TableCell>{row.customer_name ?? row.customer_cif ?? "-"}</TableCell>
              <TableCell className="text-right font-mono">{fmtMoney(row.amount)}</TableCell>
              <TableCell>{row.currency_pair} / {row.direction ?? "-"}</TableCell>
              <TableCell className="max-w-[200px] truncate text-xs">{row.payload?.reason ?? row.reason ?? "-"}</TableCell>
              <TableCell><StatusBadge status={row.cbs_unhold_status ?? "PENDING"} /></TableCell>
              <TableCell><StatusBadge status={row.notification_status ?? "PENDING"} /></TableCell>
              <TableCell className="text-xs">{row.cancelled_at ? new Date(row.cancelled_at).toLocaleDateString() : "-"}</TableCell>
              <TableCell className="text-xs">{row.cancelled_by ?? "-"}</TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => retryMut.mutate(row.id)} disabled={retryMut.isPending}>
                    <RefreshCcw className="h-3 w-3 mr-1" />Unhold
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => resendMut.mutate(row.id)} disabled={resendMut.isPending}>
                    <Send className="h-3 w-3 mr-1" />Notify
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {(data?.total ?? 0) > 20 && (
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</Button>
          <Button size="sm" variant="outline" onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}

// ---------- Main Page Component ----------

export default function OemsOrderManagementOda() {
  const [activeTab, setActiveTab] = useState("pending");

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">FX ODA Order Management</h1>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="pending">Pending Approval</TabsTrigger>
          <TabsTrigger value="blotter">Live ODA Blotter</TabsTrigger>
          <TabsTrigger value="treasury">Treasury Summary</TabsTrigger>
          <TabsTrigger value="confirmations">Trade Confirmations</TabsTrigger>
          <TabsTrigger value="cancelled">Cancelled & Failed</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-4">
          <Card>
            <CardContent className="pt-4">
              <PendingApprovalTab />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="blotter" className="mt-4">
          <Card>
            <CardContent className="pt-4">
              <LiveBlotterTab />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="treasury" className="mt-4">
          <TreasurySummaryTab />
        </TabsContent>

        <TabsContent value="confirmations" className="mt-4">
          <Card>
            <CardContent className="pt-4">
              <TradeConfirmationTab />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cancelled" className="mt-4">
          <Card>
            <CardContent className="pt-4">
              <CancelledFailedTab />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
