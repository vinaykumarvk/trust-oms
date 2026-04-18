/**
 * Portfolio Transfers — Phase 3F
 *
 * Two-tab interface (Transfer Queue | History) with summary cards,
 * new transfer dialog, and action table for approval/execution workflow.
 * Auto-refreshes every 15 seconds.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@ui/lib/queryClient";
import { apiUrl } from "@ui/lib/api-url";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/ui/card";
import { Badge } from "@ui/components/ui/badge";
import { Button } from "@ui/components/ui/button";
import { Input } from "@ui/components/ui/input";
import { Skeleton } from "@ui/components/ui/skeleton";
import { Separator } from "@ui/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@ui/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@ui/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@ui/components/ui/table";
import {
  ArrowLeftRight, Clock, CheckCircle, ShieldCheck, TrendingUp, RefreshCw, Plus,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Transfer {
  id: number;
  fromPortfolioId: string;
  toPortfolioId: string;
  securityId: number;
  quantity: number;
  type: string;
  status: string;
  createdAt: string;
  approvedBy?: string | null;
  executedAt?: string | null;
}

interface TransferListResponse {
  data: Transfer[];
  total: number;
  page: number;
  pageSize: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  APPROVED: "bg-blue-100 text-blue-800",
  EXECUTED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
};

const TYPE_LABELS: Record<string, string> = {
  INTERNAL: "Internal", EXTERNAL: "External", REBALANCE: "Rebalance",
};

function fmtDate(d: string): string {
  try { return new Date(d).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }); }
  catch { return d; }
}

function fmtQty(n: number): string {
  return n.toLocaleString("en-PH", { minimumFractionDigits: 2 });
}

function isToday(d: string): boolean {
  try { return d.startsWith(new Date().toISOString().split("T")[0]); }
  catch { return false; }
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

function SkeletonRows({ cols, rows = 5 }: { cols: number; rows?: number }) {
  return <>{Array.from({ length: rows }).map((_, i) => (
    <TableRow key={i}>{Array.from({ length: cols }).map((_, j) => (
      <TableCell key={j}><Skeleton className="h-4 w-16" /></TableCell>
    ))}</TableRow>
  ))}</>;
}

function EmptyRow({ cols, msg }: { cols: number; msg: string }) {
  return <TableRow><TableCell colSpan={cols} className="py-8 text-center text-muted-foreground">{msg}</TableCell></TableRow>;
}

function Pagination({ page, totalPages, total, pageSize, onPageChange }: {
  page: number; totalPages: number; total: number; pageSize: number;
  onPageChange: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-between">
      <p className="text-sm text-muted-foreground">
        Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, total)} of {total}
      </p>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Previous</Button>
        <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
        <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>Next</Button>
      </div>
    </div>
  );
}

/** Shared base columns rendered for both tabs */
function TransferBaseCells({ t }: { t: Transfer }) {
  return (
    <>
      <TableCell className="font-mono text-xs">{t.id}</TableCell>
      <TableCell className="text-xs">{t.fromPortfolioId}</TableCell>
      <TableCell className="text-xs">{t.toPortfolioId}</TableCell>
      <TableCell className="text-xs">{t.securityId}</TableCell>
      <TableCell className="text-right font-mono">{fmtQty(t.quantity)}</TableCell>
      <TableCell><Badge variant="outline">{TYPE_LABELS[t.type] ?? t.type}</Badge></TableCell>
      <TableCell>
        <Badge className={STATUS_COLORS[t.status] ?? "bg-muted text-foreground"}>
          {t.status}
        </Badge>
      </TableCell>
      <TableCell className="text-xs">{fmtDate(t.createdAt)}</TableCell>
    </>
  );
}

const TABLE_HEADS = ["ID", "From Portfolio", "To Portfolio", "Security", "Quantity", "Type", "Status", "Date"];

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function TransfersPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState("queue");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const pageSize = 25;

  // New-transfer form state
  const [fromPortfolioId, setFromPortfolioId] = useState("");
  const [toPortfolioId, setToPortfolioId] = useState("");
  const [securityId, setSecurityId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [transferType, setTransferType] = useState("INTERNAL");

  // --- Queries ---
  const statusFilter = tab === "queue" ? "PENDING" : undefined;

  const transfersQuery = useQuery<TransferListResponse>({
    queryKey: ["transfers", { status: statusFilter, page }],
    queryFn: () => {
      const p = new URLSearchParams();
      p.set("page", String(page));
      p.set("pageSize", String(pageSize));
      if (statusFilter) p.set("status", statusFilter);
      return apiRequest("GET", apiUrl(`/api/v1/transfers?${p.toString()}`));
    },
    refetchInterval: 15_000,
  });

  const transfers = transfersQuery.data?.data ?? [];
  const total = transfersQuery.data?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize) || 1;

  // Summary query for card counts (all statuses)
  const summaryQuery = useQuery<TransferListResponse>({
    queryKey: ["transfers", { status: undefined, page: 1 }],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/transfers?page=1&pageSize=500")),
    refetchInterval: 15_000,
  });

  const all = summaryQuery.data?.data ?? [];
  const pendingCount = all.filter((t) => t.status === "PENDING").length;
  const approvedCount = all.filter((t) => t.status === "APPROVED").length;
  const executedToday = all.filter((t) => t.status === "EXECUTED" && isToday(t.createdAt)).length;
  const totalValue = all.reduce((s, t) => s + (t.quantity ?? 0), 0);

  // --- Mutations ---
  const initiateMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiRequest("POST", apiUrl("/api/v1/transfers"), body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["transfers"] }); resetForm(); setDialogOpen(false); },
  });

  const approveMut = useMutation({
    mutationFn: (id: number) =>
      apiRequest("POST", apiUrl(`/api/v1/transfers/${id}/approve`), { approvedBy: "back-office-user" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["transfers"] }),
  });

  const executeMut = useMutation({
    mutationFn: (id: number) =>
      apiRequest("POST", apiUrl(`/api/v1/transfers/${id}/execute`)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["transfers"] }),
  });

  // --- Handlers ---
  function resetForm() {
    setFromPortfolioId(""); setToPortfolioId(""); setSecurityId(""); setQuantity(""); setTransferType("INTERNAL");
  }

  function handleInitiate() {
    if (!fromPortfolioId || !toPortfolioId || !securityId || !quantity) return;
    initiateMut.mutate({
      fromPortfolioId, toPortfolioId, securityId: Number(securityId),
      quantity: Number(quantity), type: transferType,
    });
  }

  const canSubmit = [fromPortfolioId, toPortfolioId, securityId, quantity].every((v) => v.trim() !== "");

  // --- Render ---
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <ArrowLeftRight className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Portfolio Transfers</h1>
            <p className="text-sm text-muted-foreground">Manage security transfers between portfolios</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />New Transfer
          </Button>
          <Button variant="ghost" size="sm" onClick={() => transfersQuery.refetch()} disabled={transfersQuery.isFetching}>
            <RefreshCw className={`h-4 w-4 ${transfersQuery.isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard title="Pending Approval" value={pendingCount} icon={Clock} accent="bg-yellow-500" />
        <SummaryCard title="Approved (Ready)" value={approvedCount} icon={ShieldCheck} accent="bg-blue-600" />
        <SummaryCard title="Executed Today" value={executedToday} icon={CheckCircle} accent="bg-green-600" />
        <SummaryCard title="Total Value" value={fmtQty(totalValue)} icon={TrendingUp} accent="bg-indigo-600" />
      </div>

      <Separator />

      {/* Tabs */}
      <Tabs value={tab} onValueChange={(v) => { setTab(v); setPage(1); }}>
        <TabsList>
          <TabsTrigger value="queue">Transfer Queue</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        {/* Transfer Queue */}
        <TabsContent value="queue" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Pending and Approved Transfers</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {TABLE_HEADS.map((h) => (
                        <TableHead key={h} className={h === "Quantity" ? "text-right" : ""}>{h}</TableHead>
                      ))}
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transfersQuery.isLoading ? <SkeletonRows cols={9} /> :
                     transfers.length === 0 ? <EmptyRow cols={9} msg="No pending transfers" /> :
                     transfers.map((t) => (
                      <TableRow key={t.id}>
                        <TransferBaseCells t={t} />
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {t.status === "PENDING" && (
                              <Button variant="outline" size="sm" onClick={() => approveMut.mutate(t.id)} disabled={approveMut.isPending}>
                                Approve
                              </Button>
                            )}
                            {t.status === "APPROVED" && (
                              <Button variant="default" size="sm" onClick={() => executeMut.mutate(t.id)} disabled={executeMut.isPending}>
                                Execute
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <Pagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} onPageChange={setPage} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* History */}
        <TabsContent value="history" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Transfer History</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {TABLE_HEADS.map((h) => (
                        <TableHead key={h} className={h === "Quantity" ? "text-right" : ""}>{h}</TableHead>
                      ))}
                      <TableHead>Approved By</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transfersQuery.isLoading ? <SkeletonRows cols={9} /> :
                     transfers.length === 0 ? <EmptyRow cols={9} msg="No transfer history found" /> :
                     transfers.map((t) => (
                      <TableRow key={t.id}>
                        <TransferBaseCells t={t} />
                        <TableCell className="text-xs text-muted-foreground">
                          {t.approvedBy ?? "\u2014"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <Pagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} onPageChange={setPage} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* New Transfer Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Initiate New Transfer</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">From Portfolio ID</label>
              <Input placeholder="e.g. PORT-001" value={fromPortfolioId} onChange={(e) => setFromPortfolioId(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">To Portfolio ID</label>
              <Input placeholder="e.g. PORT-002" value={toPortfolioId} onChange={(e) => setToPortfolioId(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Security ID</label>
              <Input type="number" placeholder="e.g. 1" value={securityId} onChange={(e) => setSecurityId(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Quantity</label>
              <Input type="number" placeholder="e.g. 1000" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Transfer Type</label>
              <Select value={transferType} onValueChange={setTransferType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="INTERNAL">Internal</SelectItem>
                  <SelectItem value="EXTERNAL">External</SelectItem>
                  <SelectItem value="REBALANCE">Rebalance</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {initiateMut.isError && (
              <p className="text-sm text-red-600">{(initiateMut.error as Error).message}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>Cancel</Button>
            <Button onClick={handleInitiate} disabled={!canSubmit || initiateMut.isPending}>
              {initiateMut.isPending ? "Submitting..." : "Initiate Transfer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
