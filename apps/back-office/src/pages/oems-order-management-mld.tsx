import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@ui/lib/queryClient";
import { Badge } from "@ui/components/ui/badge";
import { Button } from "@ui/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
  Bell,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Download,
  Info,
  Send,
  XCircle,
} from "lucide-react";

// --------------- Types ---------------

interface MldTranche {
  tranche_id: string;
  tranche_code: string;
  tranche_name: string;
  counterparty?: string;
  treasury_counterparty?: string;
  treasury_dealing_id?: string;
  booked_amount: string;
  quota_amount: string;
  lifecycle: string;
  master_blotter_status?: string;
  orders?: MldOrder[];
}

interface MldOrder {
  order_id: string;
  customer_id: string;
  tranche_id: string;
  amount: string;
  ninety_day_average_balance?: string;
  available_balance?: string;
  cif_status?: string;
  callback_status?: string;
  risk_profile_match?: boolean;
  hold_instruction_status?: string;
  td_creation_status?: string;
  td_account_number?: string;
  maturity_credit_status?: string;
  lifecycle?: string;
  failure_reason?: string;
  fixing_level?: string;
  fixing_outcome?: string;
  gross_payout?: string;
  tax?: string;
  net_payout?: string;
  payload?: Record<string, unknown>;
  created_at?: string;
}

// --------------- Helpers ---------------

const formatMoney = (value: string | number | null | undefined): string => {
  if (value == null || value === "") return "-";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "-";
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
};

const lifecycleBadgeVariant = (
  lifecycle: string | undefined
): "default" | "outline" | "destructive" | "secondary" => {
  if (!lifecycle) return "default";
  const upper = lifecycle.toUpperCase();
  if (upper === "OFFERING" || upper === "TRADED") return "default";
  if (upper === "FIXING_PENDING" || upper === "MATURITY_PENDING") return "outline";
  if (upper === "CANCELLED" || upper === "TERMINATED" || upper === "EXCEPTION")
    return "destructive";
  if (upper === "MATURED") return "secondary";
  return "default";
};

const statusBadge = (status: string | undefined | null, variant?: "default" | "outline" | "destructive" | "secondary") => {
  if (!status) return <Badge variant="outline">-</Badge>;
  return <Badge variant={variant ?? "outline"}>{status}</Badge>;
};

const fillPercent = (booked: string | number, quota: string | number): number => {
  const b = typeof booked === "string" ? parseFloat(booked) : booked;
  const q = typeof quota === "string" ? parseFloat(quota) : quota;
  if (!q || isNaN(q) || isNaN(b)) return 0;
  return Math.min(Math.round((b / q) * 100), 100);
};

// --------------- Sub-components ---------------

function QuotaBar({ booked, quota }: { booked: string; quota: string }) {
  const pct = fillPercent(booked, quota);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground whitespace-nowrap">{pct}%</span>
    </div>
  );
}

function BalanceCheckBadge({ available, amount }: { available?: string; amount?: string }) {
  if (!available || !amount) return <Badge variant="outline">N/A</Badge>;
  const avail = parseFloat(available);
  const amt = parseFloat(amount);
  if (isNaN(avail) || isNaN(amt)) return <Badge variant="outline">N/A</Badge>;
  if (avail >= amt) return <Badge variant="default">PASS</Badge>;
  return <Badge variant="destructive">FAIL</Badge>;
}

function FilterRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-end gap-3 mb-4">{children}</div>;
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

// --------------- Tab A: Pending Approval ---------------

function PendingApprovalTab({ tranches }: { tranches: MldTranche[] }) {
  const queryClient = useQueryClient();
  const [trancheFilter, setTrancheFilter] = useState("");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [rejectDialog, setRejectDialog] = useState<{ open: boolean; orderId: string }>({
    open: false,
    orderId: "",
  });
  const [rejectReason, setRejectReason] = useState("");
  const [infoDialog, setInfoDialog] = useState<{ open: boolean; orderId: string }>({
    open: false,
    orderId: "",
  });
  const [infoComment, setInfoComment] = useState("");

  const { data, isLoading } = useQuery<{ orders: MldOrder[]; total: number }>({
    queryKey: ["mld-pending", trancheFilter, search, dateFrom, dateTo, page],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (trancheFilter) params.set("trancheId", trancheFilter);
      if (search) params.set("search", search);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      params.set("page", String(page));
      params.set("pageSize", "20");
      const res = await apiRequest("GET", `/api/v1/oems/mld/pending-approval?${params}`);
      return res.json();
    },
  });

  const approveMut = useMutation({
    mutationFn: (orderId: string) =>
      apiRequest("POST", `/api/v1/oems/mld/orders/${orderId}/approve-order`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mld-pending"] }),
  });

  const rejectMut = useMutation({
    mutationFn: ({ orderId, reason }: { orderId: string; reason: string }) =>
      apiRequest("POST", `/api/v1/oems/mld/orders/${orderId}/reject-order`, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mld-pending"] });
      setRejectDialog({ open: false, orderId: "" });
      setRejectReason("");
    },
  });

  const requestInfoMut = useMutation({
    mutationFn: ({ orderId, comment }: { orderId: string; comment: string }) =>
      apiRequest("POST", `/api/v1/oems/mld/orders/${orderId}/request-info`, { comment }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mld-pending"] });
      setInfoDialog({ open: false, orderId: "" });
      setInfoComment("");
    },
  });

  const orders = data?.orders ?? [];

  return (
    <div>
      <FilterRow>
        <FilterField label="Tranche">
          <Select value={trancheFilter} onValueChange={setTrancheFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All tranches" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All</SelectItem>
              {tranches.map((t) => (
                <SelectItem key={t.tranche_id} value={t.tranche_id}>
                  {t.tranche_code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField label="Customer">
          <Input
            className="w-[180px]"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </FilterField>
        <FilterField label="From">
          <Input type="date" className="w-[150px]" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </FilterField>
        <FilterField label="To">
          <Input type="date" className="w-[150px]" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </FilterField>
      </FilterRow>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading...</p>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order ID</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Tranche</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">90-Day Avg</TableHead>
                <TableHead>Balance Check</TableHead>
                <TableHead>CIF Status</TableHead>
                <TableHead>Callback</TableHead>
                <TableHead>Risk Match</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-muted-foreground">
                    No pending orders
                  </TableCell>
                </TableRow>
              )}
              {orders.map((o) => (
                <TableRow key={o.order_id}>
                  <TableCell className="font-mono text-xs">{o.order_id.slice(0, 8)}</TableCell>
                  <TableCell>{o.customer_id}</TableCell>
                  <TableCell>{o.tranche_id}</TableCell>
                  <TableCell className="text-right">{formatMoney(o.amount)}</TableCell>
                  <TableCell className="text-right">{formatMoney(o.ninety_day_average_balance)}</TableCell>
                  <TableCell>
                    <BalanceCheckBadge available={o.available_balance} amount={o.amount} />
                  </TableCell>
                  <TableCell>{statusBadge(o.cif_status)}</TableCell>
                  <TableCell>{o.callback_status ?? "-"}</TableCell>
                  <TableCell>
                    {o.risk_profile_match == null ? (
                      "-"
                    ) : o.risk_profile_match ? (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-yellow-600" />
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="default"
                        className="bg-green-600 hover:bg-green-700 h-7 px-2 text-xs"
                        disabled={approveMut.isPending}
                        onClick={() => approveMut.mutate(o.order_id)}
                      >
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-7 px-2 text-xs"
                        onClick={() => setRejectDialog({ open: true, orderId: o.order_id })}
                      >
                        <XCircle className="h-3 w-3 mr-1" />
                        Reject
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        onClick={() => setInfoDialog({ open: true, orderId: o.order_id })}
                      >
                        <Info className="h-3 w-3 mr-1" />
                        Info
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between mt-3">
            <span className="text-xs text-muted-foreground">
              {data?.total ?? 0} total orders
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Previous
              </Button>
              <Button size="sm" variant="outline" onClick={() => setPage(page + 1)}>
                Next
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Reject Dialog */}
      <Dialog open={rejectDialog.open} onOpenChange={(o) => setRejectDialog({ open: o, orderId: rejectDialog.orderId })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Order</DialogTitle>
            <DialogDescription>Provide a reason for rejection (min 10 characters).</DialogDescription>
          </DialogHeader>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Rejection reason..."
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialog({ open: false, orderId: "" })}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={rejectReason.trim().length < 10 || rejectMut.isPending}
              onClick={() =>
                rejectMut.mutate({ orderId: rejectDialog.orderId, reason: rejectReason.trim() })
              }
            >
              Confirm Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Request Info Dialog */}
      <Dialog open={infoDialog.open} onOpenChange={(o) => setInfoDialog({ open: o, orderId: infoDialog.orderId })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Information</DialogTitle>
            <DialogDescription>Add a comment requesting additional information.</DialogDescription>
          </DialogHeader>
          <Textarea
            value={infoComment}
            onChange={(e) => setInfoComment(e.target.value)}
            placeholder="What information is needed..."
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setInfoDialog({ open: false, orderId: "" })}>
              Cancel
            </Button>
            <Button
              disabled={!infoComment.trim() || requestInfoMut.isPending}
              onClick={() =>
                requestInfoMut.mutate({ orderId: infoDialog.orderId, comment: infoComment.trim() })
              }
            >
              <Send className="h-4 w-4 mr-1" />
              Send Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// --------------- Tab B: Live Blotter ---------------

function LiveBlotterTab({ tranches }: { tranches: MldTranche[] }) {
  const [trancheFilter, setTrancheFilter] = useState("");
  const [lifecycle, setLifecycle] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery<{ orders: MldOrder[]; total: number; trancheSummary?: MldTranche[] }>({
    queryKey: ["mld-blotter", trancheFilter, lifecycle, dateFrom, dateTo, page],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (trancheFilter) params.set("trancheId", trancheFilter);
      if (lifecycle) params.set("lifecycle", lifecycle);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      params.set("page", String(page));
      params.set("pageSize", "20");
      const res = await apiRequest("GET", `/api/v1/oems/mld/blotter/enhanced?${params}`);
      return res.json();
    },
  });

  const orders = data?.orders ?? [];
  const trancheSummary = data?.trancheSummary ?? [];

  return (
    <div>
      <FilterRow>
        <FilterField label="Tranche">
          <Select value={trancheFilter} onValueChange={setTrancheFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All tranches" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All</SelectItem>
              {tranches.map((t) => (
                <SelectItem key={t.tranche_id} value={t.tranche_id}>
                  {t.tranche_code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField label="Lifecycle">
          <Select value={lifecycle} onValueChange={setLifecycle}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All</SelectItem>
              <SelectItem value="OFFERING">Offering</SelectItem>
              <SelectItem value="TRADED">Traded</SelectItem>
              <SelectItem value="FIXING_PENDING">Fixing Pending</SelectItem>
              <SelectItem value="MATURITY_PENDING">Maturity Pending</SelectItem>
              <SelectItem value="MATURED">Matured</SelectItem>
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField label="From">
          <Input type="date" className="w-[150px]" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </FilterField>
        <FilterField label="To">
          <Input type="date" className="w-[150px]" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </FilterField>
      </FilterRow>

      {/* Quota fill bars per tranche */}
      {trancheSummary.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          {trancheSummary.map((t) => (
            <Card key={t.tranche_id} className="p-3">
              <div className="flex justify-between text-sm mb-1">
                <span className="font-medium">{t.tranche_code}</span>
                <span className="text-muted-foreground">
                  {formatMoney(t.booked_amount)} / {formatMoney(t.quota_amount)}
                </span>
              </div>
              <QuotaBar booked={t.booked_amount} quota={t.quota_amount} />
            </Card>
          ))}
        </div>
      )}

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading...</p>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Tranche</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Hold Status</TableHead>
                <TableHead>TD Status</TableHead>
                <TableHead>Callback</TableHead>
                <TableHead>Maturity Credit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    No orders found
                  </TableCell>
                </TableRow>
              )}
              {orders.map((o) => (
                <TableRow key={o.order_id}>
                  <TableCell className="font-mono text-xs">{o.order_id.slice(0, 8)}</TableCell>
                  <TableCell>{o.customer_id}</TableCell>
                  <TableCell>{o.tranche_id}</TableCell>
                  <TableCell className="text-right">{formatMoney(o.amount)}</TableCell>
                  <TableCell>
                    <Badge variant={o.hold_instruction_status === "COMPLETED" ? "default" : "outline"}>
                      {o.hold_instruction_status ?? "-"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={o.td_creation_status === "COMPLETED" ? "default" : "outline"}>
                      {o.td_creation_status ?? "-"}
                    </Badge>
                  </TableCell>
                  <TableCell>{o.callback_status ?? "-"}</TableCell>
                  <TableCell>
                    <Badge variant={o.maturity_credit_status === "COMPLETED" ? "default" : "outline"}>
                      {o.maturity_credit_status ?? "-"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between mt-3">
            <span className="text-xs text-muted-foreground">{data?.total ?? 0} total orders</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Previous
              </Button>
              <Button size="sm" variant="outline" onClick={() => setPage(page + 1)}>
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// --------------- Tab C: Treasury Summary ---------------

function TreasurySummaryTab({ tranches }: { tranches: MldTranche[] }) {
  const [trancheFilter, setTrancheFilter] = useState("");
  const [expandedTranches, setExpandedTranches] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery<{ tranches: MldTranche[] }>({
    queryKey: ["mld-tranches-enhanced", trancheFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (trancheFilter) params.set("trancheId", trancheFilter);
      const res = await apiRequest("GET", `/api/v1/oems/mld/tranches/enhanced?${params}`);
      return res.json();
    },
  });

  const toggleExpand = useCallback((trancheId: string) => {
    setExpandedTranches((prev) => {
      const next = new Set(prev);
      if (next.has(trancheId)) next.delete(trancheId);
      else next.add(trancheId);
      return next;
    });
  }, []);

  const trancheList = data?.tranches ?? [];

  const handleExport = useCallback(() => {
    const rows = trancheList.map((t) => ({
      tranche_code: t.tranche_code,
      tranche_name: t.tranche_name,
      counterparty: t.treasury_counterparty ?? "",
      dealing_id: t.treasury_dealing_id ?? "",
      booked_amount: t.booked_amount,
      quota_amount: t.quota_amount,
      fill_pct: fillPercent(t.booked_amount, t.quota_amount),
      master_blotter_status: t.master_blotter_status ?? "",
    }));
    const csv = [Object.keys(rows[0] ?? {}).join(","), ...rows.map((r) => Object.values(r).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mld-treasury-summary-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [trancheList]);

  return (
    <div>
      <FilterRow>
        <FilterField label="Tranche">
          <Select value={trancheFilter} onValueChange={setTrancheFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All tranches" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All</SelectItem>
              {tranches.map((t) => (
                <SelectItem key={t.tranche_id} value={t.tranche_id}>
                  {t.tranche_code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>
        <div className="ml-auto">
          <Button variant="outline" size="sm" onClick={handleExport} disabled={trancheList.length === 0}>
            <Download className="h-4 w-4 mr-1" />
            Export CSV
          </Button>
        </div>
      </FilterRow>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading...</p>
      ) : trancheList.length === 0 ? (
        <p className="text-muted-foreground text-sm">No tranches found</p>
      ) : (
        <div className="space-y-3">
          {trancheList.map((t) => {
            const isExpanded = expandedTranches.has(t.tranche_id);
            return (
              <Card key={t.tranche_id}>
                <CardHeader className="py-3 px-4 cursor-pointer" onClick={() => toggleExpand(t.tranche_id)}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                      <CardTitle className="text-sm font-medium">
                        {t.tranche_code} — {t.tranche_name}
                      </CardTitle>
                    </div>
                    <Badge variant={lifecycleBadgeVariant(t.lifecycle)}>{t.lifecycle}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="px-4 pb-3 pt-0">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div>
                      <span className="text-muted-foreground">Counterparty</span>
                      <p className="font-medium">{t.treasury_counterparty ?? "-"}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Dealing ID</span>
                      <p className="font-medium">{t.treasury_dealing_id ?? "-"}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Total Booked</span>
                      <p className="font-medium">{formatMoney(t.booked_amount)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Quota</span>
                      <p className="font-medium">{formatMoney(t.quota_amount)}</p>
                    </div>
                  </div>
                  <div className="mt-2">
                    <QuotaBar booked={t.booked_amount} quota={t.quota_amount} />
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">Master Blotter:</span>
                    {statusBadge(t.master_blotter_status)}
                  </div>

                  {isExpanded && t.orders && t.orders.length > 0 && (
                    <div className="mt-3 border-t pt-3">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Order ID</TableHead>
                            <TableHead>Customer</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead>TD Account</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {t.orders.map((o) => (
                            <TableRow key={o.order_id}>
                              <TableCell className="font-mono text-xs">{o.order_id.slice(0, 8)}</TableCell>
                              <TableCell>{o.customer_id}</TableCell>
                              <TableCell className="text-right">{formatMoney(o.amount)}</TableCell>
                              <TableCell>{o.td_account_number ?? "-"}</TableCell>
                              <TableCell>
                                <Badge variant={lifecycleBadgeVariant(o.lifecycle)}>{o.lifecycle ?? "-"}</Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                  {isExpanded && (!t.orders || t.orders.length === 0) && (
                    <p className="mt-3 text-xs text-muted-foreground">No individual orders for this tranche</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// --------------- Tab D: Fixing & Maturity ---------------

function FixingMaturityTab({ tranches }: { tranches: MldTranche[] }) {
  const queryClient = useQueryClient();
  const [trancheFilter, setTrancheFilter] = useState("");

  const fixingTranches = useMemo(
    () =>
      tranches.filter(
        (t) => t.lifecycle === "FIXING_PENDING" || t.lifecycle === "MATURITY_PENDING"
      ),
    [tranches]
  );

  const { data, isLoading } = useQuery<{ orders: MldOrder[]; total: number }>({
    queryKey: ["mld-blotter-fixing", trancheFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (trancheFilter) params.set("trancheId", trancheFilter);
      params.set("lifecycle", "FIXING_PENDING,MATURITY_PENDING");
      params.set("pageSize", "50");
      const res = await apiRequest("GET", `/api/v1/oems/mld/blotter/enhanced?${params}`);
      return res.json();
    },
  });

  const orders = data?.orders ?? [];

  // Local state for fixing form per order
  const [fixingForms, setFixingForms] = useState<
    Record<string, { fixing_level: string; outcome: string }>
  >({});

  const updateFixingForm = (orderId: string, field: string, value: string) => {
    setFixingForms((prev) => ({
      ...prev,
      [orderId]: { ...prev[orderId], [field]: value },
    }));
  };

  const computePayout = (amount: string, fixingLevel: string) => {
    const amt = parseFloat(amount);
    const level = parseFloat(fixingLevel);
    if (isNaN(amt) || isNaN(level)) return { gross: 0, tax: 0, net: 0 };
    const gross = amt * (1 + level / 100);
    const tax = gross * 0.2; // 20% WHT
    const net = gross - tax;
    return { gross, tax, net };
  };

  const settleMut = useMutation({
    mutationFn: (orderId: string) =>
      apiRequest("POST", `/api/v1/oems/mld/orders/${orderId}/approve-order`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mld-blotter-fixing"] }),
  });

  return (
    <div>
      <FilterRow>
        <FilterField label="Tranche (Fixing/Maturity)">
          <Select value={trancheFilter} onValueChange={setTrancheFilter}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="All fixing/maturity tranches" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All</SelectItem>
              {fixingTranches.map((t) => (
                <SelectItem key={t.tranche_id} value={t.tranche_id}>
                  {t.tranche_code} ({t.lifecycle})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>
      </FilterRow>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading...</p>
      ) : orders.length === 0 ? (
        <p className="text-muted-foreground text-sm">No orders in FIXING_PENDING or MATURITY_PENDING</p>
      ) : (
        <div className="space-y-3">
          {orders.map((o) => {
            const form = fixingForms[o.order_id] ?? { fixing_level: "", outcome: "" };
            const payout = computePayout(o.amount, form.fixing_level);
            const isMaturity = o.lifecycle === "MATURITY_PENDING";

            return (
              <Card key={o.order_id} className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-mono text-sm font-medium">{o.order_id.slice(0, 12)}</p>
                    <p className="text-xs text-muted-foreground">
                      Customer: {o.customer_id} | Tranche: {o.tranche_id} | Amount: {formatMoney(o.amount)}
                    </p>
                  </div>
                  <Badge variant={lifecycleBadgeVariant(o.lifecycle)}>{o.lifecycle}</Badge>
                </div>

                {!isMaturity && (
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
                    <div>
                      <Label className="text-xs">Fixing Level (%)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={form.fixing_level}
                        onChange={(e) => updateFixingForm(o.order_id, "fixing_level", e.target.value)}
                        placeholder="e.g. 5.25"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Outcome</Label>
                      <Select
                        value={form.outcome}
                        onValueChange={(v) => updateFixingForm(o.order_id, "outcome", v)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select outcome" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="MAX_RETURN">Max Return</SelectItem>
                          <SelectItem value="MIN_RETURN">Min Return</SelectItem>
                          <SelectItem value="TERMINATED">Terminated</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Gross Payout</Label>
                      <p className="text-sm font-medium mt-1">{formatMoney(payout.gross)}</p>
                    </div>
                    <div>
                      <Label className="text-xs">Tax (WHT 20%)</Label>
                      <p className="text-sm font-medium mt-1">{formatMoney(payout.tax)}</p>
                    </div>
                  </div>
                )}

                {!isMaturity && (
                  <div className="mb-3">
                    <Label className="text-xs">Net Payout</Label>
                    <p className="text-sm font-bold">{formatMoney(payout.net)}</p>
                  </div>
                )}

                {isMaturity && (
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-sm text-muted-foreground">Maturity Credit:</span>
                    <Badge variant={o.maturity_credit_status === "COMPLETED" ? "default" : "outline"}>
                      {o.maturity_credit_status ?? "PENDING"}
                    </Badge>
                    <Button
                      size="sm"
                      variant="default"
                      disabled={o.maturity_credit_status === "COMPLETED" || settleMut.isPending}
                      onClick={() => settleMut.mutate(o.order_id)}
                    >
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Settle
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// --------------- Tab E: Cancelled & Failed ---------------

function CancelledFailedTab() {
  const [lifecycle, setLifecycle] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery<{ orders: MldOrder[]; total: number }>({
    queryKey: ["mld-cancelled", lifecycle, dateFrom, dateTo, page],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (lifecycle) params.set("lifecycle", lifecycle);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      params.set("page", String(page));
      params.set("pageSize", "20");
      const res = await apiRequest("GET", `/api/v1/oems/mld/cancelled?${params}`);
      return res.json();
    },
  });

  const orders = data?.orders ?? [];

  return (
    <div>
      <FilterRow>
        <FilterField label="Lifecycle">
          <Select value={lifecycle} onValueChange={setLifecycle}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All</SelectItem>
              <SelectItem value="CANCELLED">Cancelled</SelectItem>
              <SelectItem value="TERMINATED">Terminated</SelectItem>
              <SelectItem value="EXCEPTION">Exception</SelectItem>
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField label="From">
          <Input type="date" className="w-[150px]" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </FilterField>
        <FilterField label="To">
          <Input type="date" className="w-[150px]" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </FilterField>
      </FilterRow>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading...</p>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Tranche</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Lifecycle</TableHead>
                <TableHead>Failure Reason</TableHead>
                <TableHead>Hold Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    No cancelled/failed orders
                  </TableCell>
                </TableRow>
              )}
              {orders.map((o) => (
                <TableRow key={o.order_id}>
                  <TableCell className="font-mono text-xs">{o.order_id.slice(0, 8)}</TableCell>
                  <TableCell>{o.customer_id}</TableCell>
                  <TableCell>{o.tranche_id}</TableCell>
                  <TableCell className="text-right">{formatMoney(o.amount)}</TableCell>
                  <TableCell>
                    <Badge variant={lifecycleBadgeVariant(o.lifecycle)}>{o.lifecycle ?? "-"}</Badge>
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate text-xs">
                    {o.failure_reason ?? (o.payload as Record<string, unknown>)?.failure_reason as string ?? "-"}
                  </TableCell>
                  <TableCell>{statusBadge(o.hold_instruction_status)}</TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" className="h-7 px-2 text-xs">
                      <Bell className="h-3 w-3 mr-1" />
                      Resend Notification
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between mt-3">
            <span className="text-xs text-muted-foreground">{data?.total ?? 0} total orders</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Previous
              </Button>
              <Button size="sm" variant="outline" onClick={() => setPage(page + 1)}>
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// --------------- Main Page Component ---------------

export default function OemsOrderManagementMld() {
  const [activeTab, setActiveTab] = useState("pending");

  // Fetch tranches for filter dropdowns across tabs
  const { data: tranchesData } = useQuery<{ tranches: MldTranche[] }>({
    queryKey: ["mld-tranches-list"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/v1/oems/mld/tranches/enhanced");
      return res.json();
    },
  });

  const tranches = tranchesData?.tranches ?? [];

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">MLD Order Management</h1>
          <p className="text-sm text-muted-foreground">
            Manage Market-Linked Deposit orders, approvals, treasury operations, and settlement
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="pending">Pending Approval</TabsTrigger>
          <TabsTrigger value="blotter">Live Blotter</TabsTrigger>
          <TabsTrigger value="treasury">Treasury Summary</TabsTrigger>
          <TabsTrigger value="fixing">Fixing & Maturity</TabsTrigger>
          <TabsTrigger value="cancelled">Cancelled & Failed</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-4">
          <PendingApprovalTab tranches={tranches} />
        </TabsContent>

        <TabsContent value="blotter" className="mt-4">
          <LiveBlotterTab tranches={tranches} />
        </TabsContent>

        <TabsContent value="treasury" className="mt-4">
          <TreasurySummaryTab tranches={tranches} />
        </TabsContent>

        <TabsContent value="fixing" className="mt-4">
          <FixingMaturityTab tranches={tranches} />
        </TabsContent>

        <TabsContent value="cancelled" className="mt-4">
          <CancelledFailedTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
