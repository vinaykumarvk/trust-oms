/**
 * Withdrawals Page — Phase 3F
 *
 * Cash withdrawal management for trust portfolios with summary cards,
 * two-tab interface (Active / History), new withdrawal dialog, and
 * action table for calculate-tax / approve / execute workflow.
 * Auto-refreshes every 15 seconds.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@ui/lib/queryClient";
import { apiUrl } from "@ui/lib/api-url";
import { Card, CardContent } from "@ui/components/ui/card";
import { Badge } from "@ui/components/ui/badge";
import { Button } from "@ui/components/ui/button";
import { Input } from "@ui/components/ui/input";
import { Label } from "@ui/components/ui/label";
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
  ArrowDownCircle, Clock, Calculator, CheckCircle, DollarSign,
  RefreshCw, PlusCircle,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Withdrawal {
  id: number;
  portfolio_id: string | null;
  amount: string | null;
  currency: string | null;
  destination_account: string | null;
  type: string | null;
  wht_amount: string | null;
  net_amount: string | null;
  withdrawal_status: string | null;
  created_at: string;
}

interface WithdrawalListResponse {
  data: Withdrawal[];
  total: number;
  page: number;
  pageSize: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, string> = {
  REQUESTED: "bg-yellow-100 text-yellow-800",
  TAX_CALCULATED: "bg-cyan-100 text-cyan-800",
  APPROVED: "bg-blue-100 text-blue-800",
  EXECUTED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
};

const ACTIVE_STATUSES = ["REQUESTED", "TAX_CALCULATED", "APPROVED"];
const HISTORY_STATUSES = ["EXECUTED", "REJECTED"];

function formatAmount(amount: string | null, currency: string | null): string {
  const num = parseFloat(amount ?? "0");
  const code = currency ?? "PHP";
  try {
    return num.toLocaleString("en-PH", {
      style: "currency",
      currency: code,
      minimumFractionDigits: 2,
    });
  } catch {
    return `${code} ${num.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;
  }
}

function formatPHP(amount: number): string {
  return amount.toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  });
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("en-PH", {
      month: "short", day: "numeric", year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function WithdrawalsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState("active");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const pageSize = 25;

  // Dialog form state
  const [formPortfolioId, setFormPortfolioId] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formCurrency, setFormCurrency] = useState("PHP");
  const [formDestAccount, setFormDestAccount] = useState("");
  const [formType, setFormType] = useState("PARTIAL");

  // --- Queries ---

  const withdrawalsQuery = useQuery<WithdrawalListResponse>({
    queryKey: ["withdrawals", { page }],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      return apiRequest("GET", apiUrl(`/api/v1/withdrawals?${params.toString()}`));
    },
    refetchInterval: 15_000,
  });

  const allWithdrawals = withdrawalsQuery.data?.data ?? [];
  const total = withdrawalsQuery.data?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize) || 1;

  // Split withdrawals into active vs history based on status
  const activeWithdrawals = allWithdrawals.filter(
    (w) => ACTIVE_STATUSES.includes(w.withdrawal_status ?? "")
  );
  const historyWithdrawals = allWithdrawals.filter(
    (w) => HISTORY_STATUSES.includes(w.withdrawal_status ?? "")
  );

  // Summary metrics
  const pendingApprovalCount = allWithdrawals.filter(
    (w) => w.withdrawal_status === "REQUESTED"
  ).length;

  const taxCalculatedCount = allWithdrawals.filter(
    (w) => w.withdrawal_status === "TAX_CALCULATED"
  ).length;

  const executedTodayCount = allWithdrawals.filter((w) => {
    if (w.withdrawal_status !== "EXECUTED") return false;
    const today = new Date().toISOString().split("T")[0];
    return w.created_at?.startsWith(today);
  }).length;

  const totalOutflows = allWithdrawals
    .filter((w) => w.withdrawal_status === "EXECUTED")
    .reduce((sum, w) => sum + parseFloat(w.net_amount ?? w.amount ?? "0"), 0);

  // --- Mutations ---

  const requestMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiRequest("POST", apiUrl("/api/v1/withdrawals"), body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["withdrawals"] });
      resetForm();
      setDialogOpen(false);
    },
  });

  const calcTaxMut = useMutation({
    mutationFn: (id: number) =>
      apiRequest("POST", apiUrl(`/api/v1/withdrawals/${id}/calculate-tax`)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["withdrawals"] }),
  });

  const approveMut = useMutation({
    mutationFn: (id: number) =>
      apiRequest("POST", apiUrl(`/api/v1/withdrawals/${id}/approve`), {
        approvedBy: "back-office-user",
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["withdrawals"] }),
  });

  const executeMut = useMutation({
    mutationFn: (id: number) =>
      apiRequest("POST", apiUrl(`/api/v1/withdrawals/${id}/execute`)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["withdrawals"] }),
  });

  // --- Handlers ---

  function resetForm() {
    setFormPortfolioId("");
    setFormAmount("");
    setFormCurrency("PHP");
    setFormDestAccount("");
    setFormType("PARTIAL");
  }

  function handleRequestWithdrawal() {
    if (!formPortfolioId || !formAmount || !formDestAccount) return;
    requestMut.mutate({
      portfolioId: formPortfolioId,
      amount: parseFloat(formAmount),
      currency: formCurrency,
      destinationAccount: formDestAccount,
      type: formType,
    });
  }

  // --- Render ---

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <ArrowDownCircle className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Withdrawals</h1>
            <p className="text-sm text-muted-foreground">
              Manage withdrawal requests, withholding tax, and execution
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="default" size="sm" onClick={() => setDialogOpen(true)}>
            <PlusCircle className="h-4 w-4 mr-2" />
            New Withdrawal
          </Button>
          <Button
            variant="ghost" size="sm"
            onClick={() => withdrawalsQuery.refetch()}
            disabled={withdrawalsQuery.isFetching}
          >
            <RefreshCw className={`h-4 w-4 ${withdrawalsQuery.isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Pending Approval</p>
                <p className="mt-1 text-2xl font-bold">{pendingApprovalCount}</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-yellow-500">
                <Clock className="h-5 w-5 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Tax Calculated</p>
                <p className="mt-1 text-2xl font-bold">{taxCalculatedCount}</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-600">
                <Calculator className="h-5 w-5 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Executed Today</p>
                <p className="mt-1 text-2xl font-bold">{executedTodayCount}</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-600">
                <CheckCircle className="h-5 w-5 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Outflows (PHP)</p>
                <p className="mt-1 text-2xl font-bold">{formatPHP(totalOutflows)}</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-600">
                <DollarSign className="h-5 w-5 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Separator />

      {/* Tabs: Active / History */}
      <Tabs value={tab} onValueChange={(v) => { setTab(v); setPage(1); }}>
        <TabsList>
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        {/* Active Tab */}
        <TabsContent value="active" className="mt-4">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Portfolio</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Currency</TableHead>
                  <TableHead>Destination</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">WHT Amount</TableHead>
                  <TableHead className="text-right">Net Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {withdrawalsQuery.isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 11 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-16" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : activeWithdrawals.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                      No active withdrawals
                    </TableCell>
                  </TableRow>
                ) : (
                  activeWithdrawals.map((w) => (
                    <TableRow key={w.id}>
                      <TableCell className="font-mono text-xs">{w.id}</TableCell>
                      <TableCell className="text-xs">{w.portfolio_id}</TableCell>
                      <TableCell className="text-right font-mono">
                        {formatAmount(w.amount, w.currency)}
                      </TableCell>
                      <TableCell>{w.currency}</TableCell>
                      <TableCell className="text-xs">{w.destination_account}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{w.type}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {w.wht_amount ? formatAmount(w.wht_amount, w.currency) : "--"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {w.net_amount ? formatAmount(w.net_amount, w.currency) : "--"}
                      </TableCell>
                      <TableCell>
                        <Badge className={STATUS_COLORS[w.withdrawal_status ?? ""] ?? "bg-gray-100 text-gray-800"}>
                          {w.withdrawal_status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{formatDate(w.created_at)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {w.withdrawal_status === "REQUESTED" && (
                            <Button
                              variant="outline" size="sm"
                              onClick={() => calcTaxMut.mutate(w.id)}
                              disabled={calcTaxMut.isPending}
                            >
                              Calc Tax
                            </Button>
                          )}
                          {w.withdrawal_status === "TAX_CALCULATED" && (
                            <Button
                              variant="outline" size="sm"
                              onClick={() => approveMut.mutate(w.id)}
                              disabled={approveMut.isPending}
                            >
                              Approve
                            </Button>
                          )}
                          {w.withdrawal_status === "APPROVED" && (
                            <Button
                              variant="default" size="sm"
                              onClick={() => executeMut.mutate(w.id)}
                              disabled={executeMut.isPending}
                            >
                              Execute
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
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="mt-4">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Portfolio</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Currency</TableHead>
                  <TableHead>Destination</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">WHT Amount</TableHead>
                  <TableHead className="text-right">Net Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {withdrawalsQuery.isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 10 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-16" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : historyWithdrawals.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                      No withdrawal history
                    </TableCell>
                  </TableRow>
                ) : (
                  historyWithdrawals.map((w) => (
                    <TableRow key={w.id}>
                      <TableCell className="font-mono text-xs">{w.id}</TableCell>
                      <TableCell className="text-xs">{w.portfolio_id}</TableCell>
                      <TableCell className="text-right font-mono">
                        {formatAmount(w.amount, w.currency)}
                      </TableCell>
                      <TableCell>{w.currency}</TableCell>
                      <TableCell className="text-xs">{w.destination_account}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{w.type}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {w.wht_amount ? formatAmount(w.wht_amount, w.currency) : "--"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {w.net_amount ? formatAmount(w.net_amount, w.currency) : "--"}
                      </TableCell>
                      <TableCell>
                        <Badge className={STATUS_COLORS[w.withdrawal_status ?? ""] ?? "bg-gray-100 text-gray-800"}>
                          {w.withdrawal_status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{formatDate(w.created_at)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, total)} of {total}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}

      {/* New Withdrawal Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Withdrawal Request</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Portfolio ID</Label>
              <Input
                placeholder="e.g. PORT-001"
                value={formPortfolioId}
                onChange={(e) => setFormPortfolioId(e.target.value)}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Amount</Label>
                <Input
                  type="number"
                  placeholder="e.g. 500000"
                  value={formAmount}
                  onChange={(e) => setFormAmount(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Currency</Label>
                <Select value={formCurrency} onValueChange={setFormCurrency}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PHP">PHP</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Destination Account</Label>
              <Input
                placeholder="e.g. DA-98765"
                value={formDestAccount}
                onChange={(e) => setFormDestAccount(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Withdrawal Type</Label>
              <Select value={formType} onValueChange={setFormType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PARTIAL">Partial</SelectItem>
                  <SelectItem value="FULL">Full</SelectItem>
                  <SelectItem value="TERMINATION">Termination</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {requestMut.isError && (
            <p className="text-sm text-red-600">{(requestMut.error as Error).message}</p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { resetForm(); setDialogOpen(false); }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleRequestWithdrawal}
              disabled={requestMut.isPending || !formPortfolioId || !formAmount || !formDestAccount}
            >
              {requestMut.isPending ? "Submitting..." : "Submit Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
