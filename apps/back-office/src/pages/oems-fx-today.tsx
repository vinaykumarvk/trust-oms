/**
 * FX Today Operations — OEMS Sub-Module
 *
 * Spot FX order management with live rate board, order entry,
 * settlement blotter, and EOD settlement checks.
 * Auto-refreshes live rates every 15 seconds.
 */
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import {
  CalendarDays,
  CheckCircle,
  CircleDollarSign,
  Clock,
  Plus,
  RefreshCcw,
  Shield,
  TrendingUp,
  AlertTriangle,
  PlayCircle,
  History,
} from "lucide-react";

// --- Types ---

interface LiveRate {
  id: number;
  currency_pair: string;
  bid_rate: string;
  ask_rate: string;
  spread: number;
  source: string;
  updated_at: string;
  within_tolerance: boolean;
}

interface FxOrder {
  order_id: string;
  customer_id: string;
  customer_name: string;
  currency_pair: string;
  direction: "BUY" | "SELL";
  amount: string;
  rate: string;
  nominal: string;
  status: string;
  lhbu_purpose_code: string | null;
  created_at: string;
}

interface SettlementEntry {
  settlement_id: string;
  order_id: string;
  customer_id: string;
  customer_name: string;
  currency_pair: string;
  direction: "BUY" | "SELL";
  amount: string;
  rate: string;
  settlement_amount: string;
  treasury_snd_status: string;
  created_at: string;
}

interface EodFinding {
  order_id: string;
  issue: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  resolution: string | null;
}

interface EodRun {
  id: number;
  run_date: string;
  status: string;
  findings_count: number;
  completed_at: string;
}

// --- Helpers ---

const moneyFmt = new Intl.NumberFormat("en-PH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const rateFmt = (val: string | number) => Number(val).toFixed(4);

function statusBadgeVariant(status: string): "secondary" | "outline" | "default" | "destructive" {
  switch (status) {
    case "DRAFT":
      return "secondary";
    case "PENDING_APPROVAL":
      return "outline";
    case "APPROVED":
      return "default";
    case "EXECUTED":
      return "default";
    case "CANCELLED":
      return "destructive";
    default:
      return "secondary";
  }
}

function treasuryBadgeVariant(status: string): "secondary" | "outline" | "default" | "destructive" {
  switch (status) {
    case "PENDING":
      return "outline";
    case "APPROVED":
      return "default";
    case "REJECTED":
      return "destructive";
    default:
      return "secondary";
  }
}

function severityBadgeVariant(severity: string): "secondary" | "outline" | "default" | "destructive" {
  switch (severity) {
    case "HIGH":
      return "destructive";
    case "MEDIUM":
      return "outline";
    case "LOW":
      return "secondary";
    default:
      return "secondary";
  }
}

// --- Component ---

export default function OemsFxTodayPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("live-rates");

  // Live Rates state
  const [rateDialogOpen, setRateDialogOpen] = useState(false);
  const [editingRate, setEditingRate] = useState<LiveRate | null>(null);
  const [rateBid, setRateBid] = useState("");
  const [rateAsk, setRateAsk] = useState("");
  const [rateSource, setRateSource] = useState("");
  const [ratePair, setRatePair] = useState("");

  // Order Entry state
  const [orderStatusFilter, setOrderStatusFilter] = useState("ALL");
  const [orderPairFilter, setOrderPairFilter] = useState("ALL");
  const [orderDateFrom, setOrderDateFrom] = useState("");
  const [orderDateTo, setOrderDateTo] = useState("");
  const [createOrderOpen, setCreateOrderOpen] = useState(false);
  const [newOrderCustomer, setNewOrderCustomer] = useState("");
  const [newOrderPair, setNewOrderPair] = useState("");
  const [newOrderDirection, setNewOrderDirection] = useState<"BUY" | "SELL">("BUY");
  const [newOrderAmount, setNewOrderAmount] = useState("");
  const [newOrderRate, setNewOrderRate] = useState("");

  // Settlement Blotter state
  const [blotterDate, setBlotterDate] = useState(
    new Date().toISOString().split("T")[0]
  );

  // EOD state
  const [eodFindings, setEodFindings] = useState<EodFinding[]>([]);

  // --- Queries ---

  const { data: liveRates = [] } = useQuery<LiveRate[]>({
    queryKey: ["/api/v1/oems/fx-today/live-rates"],
    queryFn: () => apiRequest("GET", "/api/v1/oems/fx-today/live-rates").then((r) => r.json()),
    refetchInterval: 15000,
  });

  const ordersQueryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (orderStatusFilter !== "ALL") params.set("status", orderStatusFilter);
    if (orderPairFilter !== "ALL") params.set("currencyPair", orderPairFilter);
    if (orderDateFrom) params.set("dateFrom", orderDateFrom);
    if (orderDateTo) params.set("dateTo", orderDateTo);
    return params.toString();
  }, [orderStatusFilter, orderPairFilter, orderDateFrom, orderDateTo]);

  const { data: orders = [] } = useQuery<FxOrder[]>({
    queryKey: ["/api/v1/oems/fx-today/orders", ordersQueryParams],
    queryFn: () =>
      apiRequest("GET", `/api/v1/oems/fx-today/orders?${ordersQueryParams}`).then((r) =>
        r.json()
      ),
    enabled: activeTab === "order-entry",
  });

  const { data: blotterEntries = [] } = useQuery<SettlementEntry[]>({
    queryKey: ["/api/v1/oems/fx-today/blotter", blotterDate],
    queryFn: () =>
      apiRequest("GET", `/api/v1/oems/fx-today/blotter?date=${blotterDate}`).then((r) =>
        r.json()
      ),
    enabled: activeTab === "blotter",
  });

  const { data: eodHistory = [] } = useQuery<EodRun[]>({
    queryKey: ["/api/v1/oems/fx-today/eod-history"],
    queryFn: () =>
      apiRequest("GET", "/api/v1/oems/fx-today/blotter?date=eod-history").then((r) => r.json()),
    enabled: activeTab === "eod",
  });

  // --- Mutations ---

  const upsertRateMutation = useMutation({
    mutationFn: (body: { currency_pair: string; bid_rate: string; ask_rate: string; source: string }) =>
      apiRequest("POST", "/api/v1/oems/fx-today/live-rates", body).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/oems/fx-today/live-rates"] });
      setRateDialogOpen(false);
      resetRateForm();
    },
  });

  const createOrderMutation = useMutation({
    mutationFn: (body: {
      customer_id: string;
      currency_pair: string;
      direction: string;
      amount: string;
      rate: string;
    }) => apiRequest("POST", "/api/v1/oems/fx-today/orders", body).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/oems/fx-today/orders"] });
      setCreateOrderOpen(false);
      resetOrderForm();
    },
  });

  const refreshRateMutation = useMutation({
    mutationFn: (orderId: string) =>
      apiRequest("POST", `/api/v1/oems/fx-today/orders/${orderId}/refresh-rate`).then((r) =>
        r.json()
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/oems/fx-today/orders"] });
    },
  });

  const confirmOrderMutation = useMutation({
    mutationFn: (orderId: string) =>
      apiRequest("POST", `/api/v1/oems/fx-today/orders/${orderId}/confirm`).then((r) =>
        r.json()
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/oems/fx-today/orders"] });
    },
  });

  const approveOrderMutation = useMutation({
    mutationFn: (orderId: string) =>
      apiRequest("POST", `/api/v1/oems/fx-today/orders/${orderId}/approve`).then((r) =>
        r.json()
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/oems/fx-today/orders"] });
    },
  });

  const approveTreasurySndMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/v1/oems/fx-today/blotter/treasury-snd/approve").then((r) =>
        r.json()
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/oems/fx-today/blotter"] });
    },
  });

  const runEodMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/v1/oems/fx-today/eod-settlement-check").then((r) => r.json()),
    onSuccess: (data: { findings: EodFinding[] }) => {
      setEodFindings(data.findings || []);
      queryClient.invalidateQueries({ queryKey: ["/api/v1/oems/fx-today/eod-history"] });
    },
  });

  // --- Form helpers ---

  function resetRateForm() {
    setEditingRate(null);
    setRateBid("");
    setRateAsk("");
    setRateSource("");
    setRatePair("");
  }

  function openEditRate(rate: LiveRate) {
    setEditingRate(rate);
    setRatePair(rate.currency_pair);
    setRateBid(rate.bid_rate);
    setRateAsk(rate.ask_rate);
    setRateSource(rate.source);
    setRateDialogOpen(true);
  }

  function openAddRate() {
    resetRateForm();
    setRateDialogOpen(true);
  }

  function handleSaveRate() {
    upsertRateMutation.mutate({
      currency_pair: ratePair,
      bid_rate: rateBid,
      ask_rate: rateAsk,
      source: rateSource,
    });
  }

  function resetOrderForm() {
    setNewOrderCustomer("");
    setNewOrderPair("");
    setNewOrderDirection("BUY");
    setNewOrderAmount("");
    setNewOrderRate("");
  }

  function handleCreateOrder() {
    createOrderMutation.mutate({
      customer_id: newOrderCustomer,
      currency_pair: newOrderPair,
      direction: newOrderDirection,
      amount: newOrderAmount,
      rate: newOrderRate,
    });
  }

  // Auto-fill rate when pair changes in create order dialog
  function handleNewOrderPairChange(pair: string) {
    setNewOrderPair(pair);
    const matchedRate = liveRates.find((r) => r.currency_pair === pair);
    if (matchedRate) {
      const rate = newOrderDirection === "BUY" ? matchedRate.ask_rate : matchedRate.bid_rate;
      setNewOrderRate(rate);
    }
  }

  // Settlement blotter summary
  const blotterSummary = useMemo(() => {
    const summary: Record<string, { buy: number; sell: number }> = {};
    for (const entry of blotterEntries) {
      if (!summary[entry.currency_pair]) {
        summary[entry.currency_pair] = { buy: 0, sell: 0 };
      }
      const amt = Number(entry.amount) || 0;
      if (entry.direction === "BUY") {
        summary[entry.currency_pair].buy += amt;
      } else {
        summary[entry.currency_pair].sell += amt;
      }
    }
    return summary;
  }, [blotterEntries]);

  // Unique pairs from live rates for filter
  const currencyPairs = useMemo(
    () => liveRates.map((r) => r.currency_pair),
    [liveRates]
  );

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">FX Today Operations</h1>
          <p className="text-muted-foreground text-sm">
            Spot FX order management, live rate board, and settlement
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCcw className="h-3.5 w-3.5 animate-spin" />
          Auto-refresh: 15s
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="live-rates" className="gap-1.5">
            <TrendingUp className="h-4 w-4" />
            Live Rates
          </TabsTrigger>
          <TabsTrigger value="order-entry" className="gap-1.5">
            <CircleDollarSign className="h-4 w-4" />
            Order Entry
          </TabsTrigger>
          <TabsTrigger value="blotter" className="gap-1.5">
            <CalendarDays className="h-4 w-4" />
            Settlement Blotter
          </TabsTrigger>
          <TabsTrigger value="eod" className="gap-1.5">
            <Shield className="h-4 w-4" />
            EOD
          </TabsTrigger>
        </TabsList>

        {/* Tab 1 — Live Rates */}
        <TabsContent value="live-rates" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={openAddRate} size="sm">
              <Plus className="mr-1.5 h-4 w-4" />
              Add Rate
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {liveRates.map((rate) => {
              const spread = (Number(rate.ask_rate) - Number(rate.bid_rate)).toFixed(4);
              const withinTolerance = rate.within_tolerance !== false;
              return (
                <Card
                  key={rate.id}
                  className={`border-2 ${
                    withinTolerance ? "border-green-500/40" : "border-red-500/40"
                  }`}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base font-semibold">
                        {rate.currency_pair}
                      </CardTitle>
                      <Badge variant="secondary" className="text-xs">
                        {rate.source}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">Bid</span>
                        <p className="font-mono font-medium">{rateFmt(rate.bid_rate)}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Ask</span>
                        <p className="font-mono font-medium">{rateFmt(rate.ask_rate)}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Spread: {spread}</span>
                      <span>
                        <Clock className="mr-0.5 inline h-3 w-3" />
                        {new Date(rate.updated_at).toLocaleTimeString()}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={() => openEditRate(rate)}
                    >
                      Update Rate
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
            {liveRates.length === 0 && (
              <p className="col-span-full text-center text-muted-foreground py-8">
                No live rates configured. Click "Add Rate" to begin.
              </p>
            )}
          </div>
        </TabsContent>

        {/* Tab 2 — Order Entry & Management */}
        <TabsContent value="order-entry" className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-44">
              <Label className="text-xs">Status</Label>
              <Select value={orderStatusFilter} onValueChange={setOrderStatusFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Statuses</SelectItem>
                  <SelectItem value="DRAFT">Draft</SelectItem>
                  <SelectItem value="PENDING_APPROVAL">Pending Approval</SelectItem>
                  <SelectItem value="APPROVED">Approved</SelectItem>
                  <SelectItem value="EXECUTED">Executed</SelectItem>
                  <SelectItem value="CANCELLED">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-44">
              <Label className="text-xs">Currency Pair</Label>
              <Select value={orderPairFilter} onValueChange={setOrderPairFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Pairs</SelectItem>
                  {currencyPairs.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-40">
              <Label className="text-xs">Date From</Label>
              <Input
                type="date"
                value={orderDateFrom}
                onChange={(e) => setOrderDateFrom(e.target.value)}
              />
            </div>
            <div className="w-40">
              <Label className="text-xs">Date To</Label>
              <Input
                type="date"
                value={orderDateTo}
                onChange={(e) => setOrderDateTo(e.target.value)}
              />
            </div>
            <Button onClick={() => setCreateOrderOpen(true)} size="sm">
              <Plus className="mr-1.5 h-4 w-4" />
              Create Order
            </Button>
          </div>

          {/* Orders Table */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order ID</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Pair</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="text-right">Nominal</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>LHBU Purpose</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => (
                  <TableRow key={order.order_id}>
                    <TableCell className="font-mono text-xs">{order.order_id}</TableCell>
                    <TableCell>{order.customer_name || order.customer_id}</TableCell>
                    <TableCell className="font-mono">{order.currency_pair}</TableCell>
                    <TableCell>
                      <Badge variant={order.direction === "BUY" ? "default" : "destructive"}>
                        {order.direction}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {moneyFmt.format(Number(order.amount))}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {rateFmt(order.rate)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {moneyFmt.format(Number(order.nominal))}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusBadgeVariant(order.status)}>{order.status}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {order.lhbu_purpose_code || "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {new Date(order.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {(order.status === "DRAFT" || order.status === "PENDING_APPROVAL") && (
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Refresh Rate"
                            onClick={() => refreshRateMutation.mutate(order.order_id)}
                            disabled={refreshRateMutation.isPending}
                          >
                            <RefreshCcw className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {order.status === "DRAFT" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Customer Confirm"
                            onClick={() => confirmOrderMutation.mutate(order.order_id)}
                            disabled={confirmOrderMutation.isPending}
                          >
                            <CheckCircle className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {order.status === "PENDING_APPROVAL" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Approve (LHBU)"
                            onClick={() => approveOrderMutation.mutate(order.order_id)}
                            disabled={approveOrderMutation.isPending}
                          >
                            <Shield className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {orders.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                      No FX orders found matching the selected filters.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* Tab 3 — Settlement Blotter */}
        <TabsContent value="blotter" className="space-y-4">
          <div className="flex items-end gap-3">
            <div className="w-44">
              <Label className="text-xs">Settlement Date</Label>
              <Input
                type="date"
                value={blotterDate}
                onChange={(e) => setBlotterDate(e.target.value)}
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => approveTreasurySndMutation.mutate()}
              disabled={approveTreasurySndMutation.isPending}
            >
              <CheckCircle className="mr-1.5 h-4 w-4" />
              Approve Treasury S&D
            </Button>
          </div>

          {/* Summary by pair */}
          {Object.keys(blotterSummary).length > 0 && (
            <div className="flex flex-wrap gap-3">
              {Object.entries(blotterSummary).map(([pair, totals]) => (
                <Card key={pair} className="w-56">
                  <CardContent className="py-3 px-4">
                    <p className="font-mono text-sm font-semibold">{pair}</p>
                    <div className="mt-1 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">Buy</span>
                        <p className="font-mono">{moneyFmt.format(totals.buy)}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Sell</span>
                        <p className="font-mono">{moneyFmt.format(totals.sell)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Blotter Table */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Settlement ID</TableHead>
                  <TableHead>Order ID</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Pair</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="text-right">Settlement Amt</TableHead>
                  <TableHead>Treasury S&D</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {blotterEntries.map((entry) => (
                  <TableRow key={entry.settlement_id}>
                    <TableCell className="font-mono text-xs">{entry.settlement_id}</TableCell>
                    <TableCell className="font-mono text-xs">{entry.order_id}</TableCell>
                    <TableCell>{entry.customer_name || entry.customer_id}</TableCell>
                    <TableCell className="font-mono">{entry.currency_pair}</TableCell>
                    <TableCell>
                      <Badge variant={entry.direction === "BUY" ? "default" : "destructive"}>
                        {entry.direction}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {moneyFmt.format(Number(entry.amount))}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {rateFmt(entry.rate)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {moneyFmt.format(Number(entry.settlement_amount))}
                    </TableCell>
                    <TableCell>
                      <Badge variant={treasuryBadgeVariant(entry.treasury_snd_status)}>
                        {entry.treasury_snd_status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {new Date(entry.created_at).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
                {blotterEntries.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                      No settlement entries for the selected date.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* Tab 4 — EOD */}
        <TabsContent value="eod" className="space-y-4">
          <div className="flex items-center gap-3">
            <Button
              onClick={() => runEodMutation.mutate()}
              disabled={runEodMutation.isPending}
            >
              <PlayCircle className="mr-1.5 h-4 w-4" />
              Run EOD Settlement Check
            </Button>
            {runEodMutation.isPending && (
              <span className="text-sm text-muted-foreground">Running checks...</span>
            )}
          </div>

          {/* EOD Findings */}
          {eodFindings.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Current Run Findings</h3>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order ID</TableHead>
                      <TableHead>Issue</TableHead>
                      <TableHead>Severity</TableHead>
                      <TableHead>Resolution</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {eodFindings.map((finding, idx) => (
                      <TableRow key={`${finding.order_id}-${idx}`}>
                        <TableCell className="font-mono text-xs">{finding.order_id}</TableCell>
                        <TableCell>{finding.issue}</TableCell>
                        <TableCell>
                          <Badge variant={severityBadgeVariant(finding.severity)}>
                            {finding.severity}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">
                          {finding.resolution || "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* EOD History */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold flex items-center gap-1.5">
              <History className="h-4 w-4" />
              Previous EOD Runs
            </h3>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Run Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Findings</TableHead>
                    <TableHead>Completed At</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {eodHistory.map((run) => (
                    <TableRow key={run.id}>
                      <TableCell className="text-xs">{run.run_date}</TableCell>
                      <TableCell>
                        <Badge variant={run.status === "PASS" ? "default" : "outline"}>
                          {run.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {run.findings_count > 0 ? (
                          <span className="flex items-center gap-1 text-xs">
                            <AlertTriangle className="h-3 w-3 text-yellow-500" />
                            {run.findings_count}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {new Date(run.completed_at).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                  {eodHistory.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                        No previous EOD runs found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Rate Dialog (Add / Update) */}
      <Dialog open={rateDialogOpen} onOpenChange={setRateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingRate ? "Update Rate" : "Add Rate"}</DialogTitle>
            <DialogDescription>
              {editingRate
                ? `Update bid/ask rates for ${editingRate.currency_pair}`
                : "Add a new currency pair with bid/ask rates"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {!editingRate && (
              <div className="space-y-1.5">
                <Label>Currency Pair</Label>
                <Input
                  placeholder="e.g. USD/PHP"
                  value={ratePair}
                  onChange={(e) => setRatePair(e.target.value)}
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Bid Rate</Label>
                <Input
                  type="number"
                  step="0.0001"
                  placeholder="0.0000"
                  value={rateBid}
                  onChange={(e) => setRateBid(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Ask Rate</Label>
                <Input
                  type="number"
                  step="0.0001"
                  placeholder="0.0000"
                  value={rateAsk}
                  onChange={(e) => setRateAsk(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Source</Label>
              <Input
                placeholder="e.g. REUTERS, BLOOMBERG, MANUAL"
                value={rateSource}
                onChange={(e) => setRateSource(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRateDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveRate}
              disabled={
                upsertRateMutation.isPending ||
                !rateBid ||
                !rateAsk ||
                !rateSource ||
                (!editingRate && !ratePair)
              }
            >
              {upsertRateMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Order Dialog */}
      <Dialog open={createOrderOpen} onOpenChange={setCreateOrderOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create FX Today Order</DialogTitle>
            <DialogDescription>
              Enter order details. Rate auto-fills from live rates when a pair is selected.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Customer ID</Label>
              <Input
                placeholder="Customer ID"
                value={newOrderCustomer}
                onChange={(e) => setNewOrderCustomer(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Currency Pair</Label>
              <Select value={newOrderPair} onValueChange={handleNewOrderPairChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select pair" />
                </SelectTrigger>
                <SelectContent>
                  {currencyPairs.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Direction</Label>
              <Select
                value={newOrderDirection}
                onValueChange={(v) => setNewOrderDirection(v as "BUY" | "SELL")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BUY">BUY</SelectItem>
                  <SelectItem value="SELL">SELL</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Amount</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={newOrderAmount}
                  onChange={(e) => setNewOrderAmount(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Rate</Label>
                <Input
                  type="number"
                  step="0.0001"
                  placeholder="Auto-filled from live"
                  value={newOrderRate}
                  onChange={(e) => setNewOrderRate(e.target.value)}
                />
              </div>
            </div>
            {newOrderAmount && newOrderRate && (
              <div className="rounded bg-muted p-2 text-sm">
                <span className="text-muted-foreground">Nominal: </span>
                <span className="font-mono font-medium">
                  {moneyFmt.format(Number(newOrderAmount) * Number(newOrderRate))}
                </span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOrderOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateOrder}
              disabled={
                createOrderMutation.isPending ||
                !newOrderCustomer ||
                !newOrderPair ||
                !newOrderAmount ||
                !newOrderRate
              }
            >
              {createOrderMutation.isPending ? "Creating..." : "Create Order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
