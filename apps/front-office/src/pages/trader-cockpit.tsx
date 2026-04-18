/**
 * Trader Cockpit — Phase 2A (BRD Screen #3)
 * Full-page view for traders: working orders, blocks, fills & P&L.
 */
import { useState, Fragment } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { apiRequest } from "@ui/lib/queryClient";
import { apiUrl } from "@ui/lib/api-url";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/ui/card";
import { Badge } from "@ui/components/ui/badge";
import { Button } from "@ui/components/ui/button";
import { Skeleton } from "@ui/components/ui/skeleton";
import { Separator } from "@ui/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@ui/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@ui/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@ui/components/ui/tooltip";
import { Activity, ChevronDown, ChevronRight, Layers, BarChart3, Send, XCircle, Eye, Zap } from "lucide-react";

// -- Types ------------------------------------------------------------------

interface Order {
  order_id: string;
  transaction_ref_no: string | null;
  portfolio_id: string | null;
  side: string;
  quantity: string;
  limit_price: string | null;
  currency: string | null;
  created_at: string;
}

interface OrderGroup {
  security_id: number;
  security_name: string;
  side: string;
  orders: Order[];
  total_qty: number;
  order_count: number;
}

interface BlockSuggestion {
  security_id: number;
  security_name?: string;
  side: string;
  orders: Order[];
  total_qty: number;
}

interface Block {
  block_id: string;
  security_id: number;
  security_name: string;
  side: string;
  total_qty: number;
  status: string;
  broker_id: number | null;
  broker_name: string | null;
  fill_qty: number;
  fill_pct: number;
  created_at: string;
}

interface BrokerComparison {
  broker_id: number;
  broker_name: string;
  fill_rate: number;
  avg_slippage: number;
  trade_count: number;
}

interface Fill {
  trade_id: string;
  block_id: string;
  order_id: string | null;
  security_name: string;
  side: string;
  execution_price: number;
  execution_qty: number;
  slippage_bps: number;
  executed_at: string;
}

type AggregationRes = { groups: OrderGroup[] };
type SuggestionsRes = { suggestions: BlockSuggestion[] };
type BlocksRes = { data: Block[] };
type BrokersRes = { data: BrokerComparison[] };
type FillsRes = { data: Fill[] };

// -- Helpers ----------------------------------------------------------------

const PH = "en-PH";
const fmtQty = (n: number) => n.toLocaleString(PH);
const fmtPct = (n: number) => `${n.toFixed(1)}%`;
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString(PH, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

const STATUS_COLOR: Record<string, string> = {
  OPEN: "bg-blue-100 text-blue-800",
  PLACED: "bg-yellow-100 text-yellow-800",
  PARTIALLY_FILLED: "bg-orange-100 text-orange-800",
  FILLED: "bg-green-100 text-green-800",
};

const SideBadge = ({ side }: { side: string }) => (
  <Badge variant={side === "BUY" ? "default" : "destructive"}>{side}</Badge>
);

const LoadingSkeleton = ({ rows = 4 }: { rows?: number }) => (
  <div className="space-y-3">
    {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
  </div>
);

function MetricCard({ title, value, icon: Icon }: { title: string; value: string | number; icon: React.ElementType }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent><div className="text-2xl font-bold">{value}</div></CardContent>
    </Card>
  );
}

function SlippageBadge({ bps, side }: { bps: number; side: string }) {
  const favorable = (side === "BUY" && bps < 0) || (side === "SELL" && bps > 0);
  const color = favorable ? "text-green-600" : bps === 0 ? "text-muted-foreground" : "text-red-600";
  return <span className={`font-mono text-xs font-semibold ${color}`}>{bps.toFixed(1)}</span>;
}

const shortId = (id: string) => id.slice(0, 10);

// -- Working Orders Tab -----------------------------------------------------

function WorkingOrdersTab() {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const aggQuery = useQuery<AggregationRes>({
    queryKey: ["/api/v1/trades/aggregation-view"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/trades/aggregation-view")),
    refetchInterval: 10_000,
  });
  const sugQuery = useQuery<SuggestionsRes>({
    queryKey: ["/api/v1/trades/blocks/suggestions"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/trades/blocks/suggestions")),
    refetchInterval: 10_000,
  });
  const createBlock = useMutation({
    mutationFn: (orderIds: string[]) =>
      apiRequest("POST", apiUrl("/api/v1/trades/blocks"), { orderIds, traderId: 1 }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/v1/trades/aggregation-view"] });
      qc.invalidateQueries({ queryKey: ["/api/v1/trades/blocks/suggestions"] });
      qc.invalidateQueries({ queryKey: ["/api/v1/trades/blocks"] });
    },
  });

  const toggle = (key: string) =>
    setExpanded((prev) => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s; });

  const groups = aggQuery.data?.groups ?? [];
  const suggestions = sugQuery.data?.suggestions ?? [];

  if (aggQuery.isLoading) return <LoadingSkeleton />;

  return (
    <div className="space-y-6">
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Security</TableHead>
              <TableHead>Side</TableHead>
              <TableHead className="text-right">Orders</TableHead>
              <TableHead className="text-right">Total Qty</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">No authorized orders ready for aggregation</TableCell>
              </TableRow>
            ) : groups.map((g) => {
              const key = `${g.security_id}-${g.side}`;
              const open = expanded.has(key);
              return (
                <Fragment key={key}>
                  <TableRow className="cursor-pointer hover:bg-muted/50" onClick={() => toggle(key)}>
                    <TableCell>{open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</TableCell>
                    <TableCell className="font-medium">{g.security_name}</TableCell>
                    <TableCell><SideBadge side={g.side} /></TableCell>
                    <TableCell className="text-right">{g.order_count}</TableCell>
                    <TableCell className="text-right">{fmtQty(g.total_qty)}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" disabled={createBlock.isPending} onClick={(e) => { e.stopPropagation(); createBlock.mutate(g.orders.map((o) => o.order_id)); }}>
                        <Layers className="h-4 w-4 mr-1" />Create Block
                      </Button>
                    </TableCell>
                  </TableRow>
                  {open && g.orders.map((o) => (
                    <TableRow key={o.order_id} className="bg-muted/30">
                      <TableCell />
                      <TableCell className="pl-10 font-mono text-xs">{o.transaction_ref_no ?? o.order_id.slice(0, 12)}</TableCell>
                      <TableCell><SideBadge side={o.side} /></TableCell>
                      <TableCell className="text-right text-xs">{o.portfolio_id}</TableCell>
                      <TableCell className="text-right">{fmtQty(parseFloat(o.quantity))}</TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">{fmtDate(o.created_at)}</TableCell>
                    </TableRow>
                  ))}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {suggestions.length > 0 && (
        <>
          <Separator />
          <div>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Zap className="h-4 w-4 text-yellow-500" />Suggested Blocks
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {suggestions.map((s, i) => (
                <Card key={i} className="border-dashed">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{s.security_name ?? `Security #${s.security_id}`}</p>
                      <p className="text-xs text-muted-foreground">{s.side} &middot; {s.orders.length} orders &middot; {fmtQty(s.total_qty)} units</p>
                    </div>
                    <Button size="sm" variant="outline" disabled={createBlock.isPending} onClick={() => createBlock.mutate(s.orders.map((o) => o.order_id))}>
                      <Layers className="h-4 w-4 mr-1" />Build
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </>
      )}
      {createBlock.isError && <p className="text-sm text-red-600">{createBlock.error?.message ?? "Failed to create block"}</p>}
    </div>
  );
}

// -- Block Fills (inline) ---------------------------------------------------

function BlockFillsRow({ blockId }: { blockId: string }) {
  const q = useQuery<FillsRes>({
    queryKey: ["/api/v1/trades/blocks", blockId, "fills"],
    queryFn: () => apiRequest("GET", apiUrl(`/api/v1/trades/blocks/${blockId}/fills`)),
  });
  if (q.isLoading) return <div className="p-4"><Skeleton className="h-8 w-full" /></div>;
  const fills = q.data?.data ?? [];
  if (fills.length === 0) return <div className="p-4 text-sm text-muted-foreground text-center">No fills yet</div>;
  return (
    <div className="bg-muted/20 p-3 overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Trade ID</TableHead>
            <TableHead className="text-right">Exec Price</TableHead>
            <TableHead className="text-right">Exec Qty</TableHead>
            <TableHead className="text-right">Slippage (bps)</TableHead>
            <TableHead>Time</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {fills.map((f) => (
            <TableRow key={f.trade_id}>
              <TableCell className="font-mono text-xs">{shortId(f.trade_id)}</TableCell>
              <TableCell className="text-right">{f.execution_price.toLocaleString(PH)}</TableCell>
              <TableCell className="text-right">{fmtQty(f.execution_qty)}</TableCell>
              <TableCell className="text-right"><SlippageBadge bps={f.slippage_bps} side={f.side} /></TableCell>
              <TableCell className="text-xs">{fmtDate(f.executed_at)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// -- Blocks Tab -------------------------------------------------------------

function BlocksTab() {
  const qc = useQueryClient();
  const [placeDialog, setPlaceDialog] = useState<Block | null>(null);
  const [expandedFills, setExpandedFills] = useState<Set<string>>(new Set());

  const blocksQ = useQuery<BlocksRes>({
    queryKey: ["/api/v1/trades/blocks"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/trades/blocks")),
    refetchInterval: 10_000,
  });
  const brokersQ = useQuery<BrokersRes>({
    queryKey: ["/api/v1/trades/brokers/compare", placeDialog?.security_id],
    queryFn: () => apiRequest("GET", apiUrl(`/api/v1/trades/brokers/compare?securityId=${placeDialog!.security_id}`)),
    enabled: placeDialog !== null,
  });
  const placeMut = useMutation({
    mutationFn: ({ blockId, brokerId }: { blockId: string; brokerId: number }) =>
      apiRequest("POST", apiUrl(`/api/v1/trades/blocks/${blockId}/place`), { brokerId }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/v1/trades/blocks"] }); setPlaceDialog(null); },
  });
  const cancelMut = useMutation({
    mutationFn: (blockId: string) => apiRequest("POST", apiUrl(`/api/v1/trades/blocks/${blockId}/cancel`), {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/v1/trades/blocks"] }); },
  });

  const toggleFills = (id: string) =>
    setExpandedFills((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const blocks = blocksQ.data?.data ?? [];
  if (blocksQ.isLoading) return <LoadingSkeleton />;

  return (
    <>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Block ID</TableHead>
              <TableHead>Security</TableHead>
              <TableHead>Side</TableHead>
              <TableHead className="text-right">Total Qty</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Broker</TableHead>
              <TableHead className="text-right">Fill %</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {blocks.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">No blocks found</TableCell></TableRow>
            ) : blocks.map((b) => (
              <Fragment key={b.block_id}>
                <TableRow>
                  <TableCell className="font-mono text-xs">{shortId(b.block_id)}</TableCell>
                  <TableCell className="font-medium">{b.security_name}</TableCell>
                  <TableCell><SideBadge side={b.side} /></TableCell>
                  <TableCell className="text-right">{fmtQty(b.total_qty)}</TableCell>
                  <TableCell><Badge className={STATUS_COLOR[b.status] ?? "bg-muted text-foreground"}>{b.status.replace(/_/g, " ")}</Badge></TableCell>
                  <TableCell>{b.broker_name ?? "-"}</TableCell>
                  <TableCell className="text-right">{fmtPct(b.fill_pct)}</TableCell>
                  <TableCell className="text-xs">{fmtDate(b.created_at)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {b.status === "OPEN" && (
                        <>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button size="sm" variant="outline" onClick={() => setPlaceDialog(b)}><Send className="h-4 w-4" /></Button>
                              </TooltipTrigger>
                              <TooltipContent>Place with broker</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button size="sm" variant="ghost" className="text-red-600" disabled={cancelMut.isPending} onClick={() => cancelMut.mutate(b.block_id)}>
                                  <XCircle className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Cancel block</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </>
                      )}
                      {(b.status === "PLACED" || b.status === "PARTIALLY_FILLED") && (
                        <Button size="sm" variant="ghost" onClick={() => toggleFills(b.block_id)}>
                          <Eye className="h-4 w-4 mr-1" />Fills
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
                {expandedFills.has(b.block_id) && (
                  <TableRow><TableCell colSpan={9} className="p-0"><BlockFillsRow blockId={b.block_id} /></TableCell></TableRow>
                )}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Broker placement dialog */}
      <Dialog open={placeDialog !== null} onOpenChange={() => setPlaceDialog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Place Block with Broker</DialogTitle>
            <DialogDescription>
              {placeDialog?.security_name} &mdash; {placeDialog?.side} {placeDialog ? fmtQty(placeDialog.total_qty) : ""} units
            </DialogDescription>
          </DialogHeader>
          {brokersQ.isLoading ? <LoadingSkeleton rows={3} /> : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Broker</TableHead>
                    <TableHead className="text-right">Fill Rate</TableHead>
                    <TableHead className="text-right">Avg Slippage (bps)</TableHead>
                    <TableHead className="text-right">Trades</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(brokersQ.data?.data ?? []).map((br) => (
                    <TableRow key={br.broker_id}>
                      <TableCell className="font-medium">{br.broker_name}</TableCell>
                      <TableCell className="text-right">{fmtPct(br.fill_rate)}</TableCell>
                      <TableCell className="text-right">{br.avg_slippage.toFixed(1)}</TableCell>
                      <TableCell className="text-right">{br.trade_count}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" disabled={placeMut.isPending} onClick={() => placeDialog && placeMut.mutate({ blockId: placeDialog.block_id, brokerId: br.broker_id })}>
                          Select
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {placeMut.isError && <p className="text-sm text-red-600">{placeMut.error?.message ?? "Placement failed"}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPlaceDialog(null)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// -- Fills & P&L Tab --------------------------------------------------------

function FillsPnlTab() {
  const fillsQ = useQuery<FillsRes>({
    queryKey: ["/api/v1/trades/fills"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/trades/fills")),
    refetchInterval: 10_000,
  });
  const fills = fillsQ.data?.data ?? [];
  const totalVolume = fills.reduce((a, f) => a + f.execution_qty, 0);
  const avgSlippage = fills.length > 0 ? fills.reduce((a, f) => a + f.slippage_bps, 0) / fills.length : 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard title="Total Fills Today" value={fills.length} icon={BarChart3} />
        <MetricCard title="Total Volume" value={fmtQty(totalVolume)} icon={Layers} />
        <MetricCard title="Avg Slippage" value={`${avgSlippage.toFixed(1)} bps`} icon={Activity} />
      </div>
      {fillsQ.isLoading ? <LoadingSkeleton rows={5} /> : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Trade ID</TableHead>
                <TableHead>Block</TableHead>
                <TableHead>Order</TableHead>
                <TableHead>Security</TableHead>
                <TableHead>Side</TableHead>
                <TableHead className="text-right">Exec Price</TableHead>
                <TableHead className="text-right">Exec Qty</TableHead>
                <TableHead className="text-right">Slippage (bps)</TableHead>
                <TableHead>Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fills.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">No fills recorded today</TableCell></TableRow>
              ) : fills.map((f) => (
                <TableRow key={f.trade_id}>
                  <TableCell className="font-mono text-xs">{shortId(f.trade_id)}</TableCell>
                  <TableCell className="font-mono text-xs">{shortId(f.block_id)}</TableCell>
                  <TableCell className="font-mono text-xs">{f.order_id ? shortId(f.order_id) : "-"}</TableCell>
                  <TableCell className="font-medium">{f.security_name}</TableCell>
                  <TableCell><SideBadge side={f.side} /></TableCell>
                  <TableCell className="text-right">{f.execution_price.toLocaleString(PH)}</TableCell>
                  <TableCell className="text-right">{fmtQty(f.execution_qty)}</TableCell>
                  <TableCell className="text-right"><SlippageBadge bps={f.slippage_bps} side={f.side} /></TableCell>
                  <TableCell className="text-xs">{fmtDate(f.executed_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// -- Main Component ---------------------------------------------------------

export default function TraderCockpit() {
  const location = useLocation();
  const defaultTab = location.pathname.includes("/trading/blocks") ? "blocks" : "working-orders";

  const aggQ = useQuery<AggregationRes>({
    queryKey: ["/api/v1/trades/aggregation-view"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/trades/aggregation-view")),
    refetchInterval: 10_000,
  });
  const blocksQ = useQuery<BlocksRes>({
    queryKey: ["/api/v1/trades/blocks"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/trades/blocks")),
    refetchInterval: 10_000,
  });
  const fillsQ = useQuery<FillsRes>({
    queryKey: ["/api/v1/trades/fills"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/trades/fills")),
    refetchInterval: 10_000,
  });

  const ordersReady = (aggQ.data?.groups ?? []).reduce((a, g) => a + g.order_count, 0);
  const activeBlocks = (blocksQ.data?.data ?? []).filter((b) => b.status !== "FILLED" && b.status !== "CANCELLED").length;
  const fills = fillsQ.data?.data ?? [];
  const avgSlippage = fills.length > 0 ? fills.reduce((a, f) => a + Math.abs(f.slippage_bps), 0) / fills.length : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <Activity className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Trader Cockpit</h1>
          <p className="text-sm text-muted-foreground">Aggregate orders, manage blocks, and monitor fills</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard title="Orders Ready" value={ordersReady} icon={Layers} />
        <MetricCard title="Active Blocks" value={activeBlocks} icon={Activity} />
        <MetricCard title="Fills Today" value={fills.length} icon={BarChart3} />
        <MetricCard title="Avg Slippage" value={`${avgSlippage.toFixed(1)} bps`} icon={Activity} />
      </div>

      <Tabs defaultValue={defaultTab}>
        <TabsList>
          <TabsTrigger value="working-orders">Working Orders</TabsTrigger>
          <TabsTrigger value="blocks">Blocks</TabsTrigger>
          <TabsTrigger value="fills">Fills &amp; P&amp;L</TabsTrigger>
        </TabsList>
        <TabsContent value="working-orders" className="mt-4"><WorkingOrdersTab /></TabsContent>
        <TabsContent value="blocks" className="mt-4"><BlocksTab /></TabsContent>
        <TabsContent value="fills" className="mt-4"><FillsPnlTab /></TabsContent>
      </Tabs>
    </div>
  );
}
