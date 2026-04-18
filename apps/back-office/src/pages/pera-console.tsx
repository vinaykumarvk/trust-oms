/**
 * PERA Administrator Console — Phase 3I (BRD Screen #26)
 *
 * Full PERA lifecycle management: account onboarding, contributions,
 * qualified/unqualified withdrawals, product/admin transfers, and
 * BSP regulatory reporting. Five-tab interface with summary cards.
 * Auto-refreshes every 30 seconds.
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
  Landmark, Users, TrendingUp, Clock, FileText,
  RefreshCw, Plus, Search, ArrowRightLeft, Download,
  CheckCircle, AlertTriangle, Send,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PeraAccount {
  id: string;
  contributorId: string;
  administrator: string;
  productId: string;
  balance: number;
  ytdContributions: number;
  maxContributionAnnual: number;
  tin: string;
  bspPeraId: string;
  status: string;
  createdAt: string;
}

interface PeraAccountsResponse {
  data: PeraAccount[];
  total: number;
  page: number;
  pageSize: number;
}

interface PeraTransaction {
  id: string;
  accountId: string;
  type: string;
  amount: number;
  penaltyAmount?: number;
  status: string;
  createdAt: string;
  description?: string;
}

interface PeraTransactionsResponse {
  data: PeraTransaction[];
  total: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-800",
  PENDING: "bg-yellow-100 text-yellow-800",
  SUSPENDED: "bg-red-100 text-red-800",
  CLOSED: "bg-muted text-foreground",
};

const TX_TYPE_COLORS: Record<string, string> = {
  CONTRIBUTION: "bg-blue-100 text-blue-800",
  QUALIFIED_WITHDRAWAL: "bg-green-100 text-green-800",
  UNQUALIFIED_WITHDRAWAL: "bg-orange-100 text-orange-800",
  PRODUCT_TRANSFER: "bg-purple-100 text-purple-800",
  ADMIN_TRANSFER: "bg-indigo-100 text-indigo-800",
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

export default function PeraConsole() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("accounts");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  // Onboard dialog
  const [onboardOpen, setOnboardOpen] = useState(false);
  const [obContributorId, setObContributorId] = useState("");
  const [obAdministrator, setObAdministrator] = useState("");
  const [obProductId, setObProductId] = useState("");
  const [obTin, setObTin] = useState("");
  const [obMaxAnnual, setObMaxAnnual] = useState("100000");

  // Contribution state
  const [contribAccountId, setContribAccountId] = useState("");
  const [contribAmount, setContribAmount] = useState("");

  // Withdrawal state
  const [wdAccountId, setWdAccountId] = useState("");
  const [wdType, setWdType] = useState<"qualified" | "unqualified">("qualified");
  const [wdPenaltyPct, setWdPenaltyPct] = useState("5");

  // Transfer state
  const [txAccountId, setTxAccountId] = useState("");
  const [txMode, setTxMode] = useState<"product" | "admin">("product");
  const [txTargetProductId, setTxTargetProductId] = useState("");
  const [txTargetAdmin, setTxTargetAdmin] = useState("");

  // BSP state
  const [bspReport, setBspReport] = useState<string | null>(null);
  const [tccContributorId, setTccContributorId] = useState("");
  const [tccRef, setTccRef] = useState("");

  // TIN / Duplicate check state
  const [tinCheck, setTinCheck] = useState("");
  const [tinResult, setTinResult] = useState<string | null>(null);
  const [dupCheck, setDupCheck] = useState("");
  const [dupResult, setDupResult] = useState<string | null>(null);

  // Selected account for transaction history
  const [selectedAccountId, setSelectedAccountId] = useState("");

  // --- Queries ---------------------------------------------------------------

  const accountsQuery = useQuery<PeraAccountsResponse>({
    queryKey: ["pera-accounts", { page }],
    queryFn: () => {
      const p = new URLSearchParams();
      p.set("page", String(page));
      p.set("pageSize", String(pageSize));
      return apiRequest("GET", apiUrl("/api/v1/pera/accounts") + "?" + p.toString());
    },
    refetchInterval: 30_000,
  });

  const accounts = accountsQuery.data?.data ?? [];
  const totalAccounts = accountsQuery.data?.total ?? 0;
  const totalPages = Math.ceil(totalAccounts / pageSize) || 1;

  const transactionsQuery = useQuery<PeraTransactionsResponse>({
    queryKey: ["pera-transactions", selectedAccountId],
    queryFn: () =>
      apiRequest("GET", apiUrl("/api/v1/pera/accounts/" + selectedAccountId + "/transactions")),
    enabled: !!selectedAccountId,
    refetchInterval: 30_000,
  });

  const transactions = transactionsQuery.data?.data ?? [];

  // Summary stats
  const activeCount = accounts.filter((a) => a.status === "ACTIVE").length;
  const ytdTotal = accounts.reduce((s, a) => s + (a.ytdContributions ?? 0), 0);
  const pendingTx = transactions.filter((t) => t.status === "PENDING").length;

  // --- Mutations -------------------------------------------------------------

  const onboardMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiRequest("POST", apiUrl("/api/v1/pera/accounts"), body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pera-accounts"] });
      resetOnboardForm();
      setOnboardOpen(false);
    },
  });

  const contributeMut = useMutation({
    mutationFn: ({ accountId, amount }: { accountId: string; amount: number }) =>
      apiRequest("POST", apiUrl("/api/v1/pera/accounts/" + accountId + "/contribute"), { amount }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pera-accounts"] });
      qc.invalidateQueries({ queryKey: ["pera-transactions"] });
      setContribAmount("");
    },
  });

  const qualifiedWdMut = useMutation({
    mutationFn: (accountId: string) =>
      apiRequest("POST", apiUrl("/api/v1/pera/accounts/" + accountId + "/withdraw/qualified")),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pera-accounts"] });
      qc.invalidateQueries({ queryKey: ["pera-transactions"] });
    },
  });

  const unqualifiedWdMut = useMutation({
    mutationFn: ({ accountId, penaltyPct }: { accountId: string; penaltyPct: number }) =>
      apiRequest("POST", apiUrl("/api/v1/pera/accounts/" + accountId + "/withdraw/unqualified"), { penaltyPct }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pera-accounts"] });
      qc.invalidateQueries({ queryKey: ["pera-transactions"] });
    },
  });

  const productTransferMut = useMutation({
    mutationFn: ({ accountId, targetProductId }: { accountId: string; targetProductId: string }) =>
      apiRequest("POST", apiUrl("/api/v1/pera/accounts/" + accountId + "/transfer/product"), { targetProductId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pera-accounts"] });
      qc.invalidateQueries({ queryKey: ["pera-transactions"] });
      setTxTargetProductId("");
    },
  });

  const adminTransferMut = useMutation({
    mutationFn: ({ accountId, targetAdmin }: { accountId: string; targetAdmin: string }) =>
      apiRequest("POST", apiUrl("/api/v1/pera/accounts/" + accountId + "/transfer/admin"), { targetAdmin }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pera-accounts"] });
      qc.invalidateQueries({ queryKey: ["pera-transactions"] });
      setTxTargetAdmin("");
    },
  });

  const bspContributorFileMut = useMutation({
    mutationFn: () =>
      apiRequest("POST", apiUrl("/api/v1/pera/bsp/contributor-file")),
    onSuccess: (data: unknown) => {
      setBspReport(JSON.stringify(data, null, 2));
    },
  });

  const bspTransactionFileMut = useMutation({
    mutationFn: () =>
      apiRequest("POST", apiUrl("/api/v1/pera/bsp/transaction-file")),
    onSuccess: (data: unknown) => {
      setBspReport(JSON.stringify(data, null, 2));
    },
  });

  const tccMut = useMutation({
    mutationFn: ({ contributorId, tccRef: ref }: { contributorId: string; tccRef: string }) =>
      apiRequest("POST", apiUrl("/api/v1/pera/tcc/" + contributorId), { tccRef: ref }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pera-accounts"] });
      setTccContributorId("");
      setTccRef("");
    },
  });

  const tinCheckMut = useMutation({
    mutationFn: (tin: string) =>
      apiRequest("GET", apiUrl("/api/v1/pera/bsp/tin-check/" + tin)),
    onSuccess: (data: unknown) => {
      setTinResult(JSON.stringify(data, null, 2));
    },
  });

  const dupCheckMut = useMutation({
    mutationFn: (contributorId: string) =>
      apiRequest("GET", apiUrl("/api/v1/pera/bsp/duplicate-check/" + contributorId)),
    onSuccess: (data: unknown) => {
      setDupResult(JSON.stringify(data, null, 2));
    },
  });

  // --- Handlers --------------------------------------------------------------

  function resetOnboardForm() {
    setObContributorId("");
    setObAdministrator("");
    setObProductId("");
    setObTin("");
    setObMaxAnnual("100000");
  }

  function handleOnboard() {
    if (!obContributorId || !obAdministrator || !obProductId || !obTin) return;
    onboardMut.mutate({
      contributorId: obContributorId,
      administrator: obAdministrator,
      productId: obProductId,
      tin: obTin,
      maxContributionAnnual: parseFloat(obMaxAnnual),
    });
  }

  function handleContribute() {
    if (!contribAccountId || !contribAmount) return;
    contributeMut.mutate({ accountId: contribAccountId, amount: parseFloat(contribAmount) });
  }

  function handleWithdraw() {
    if (!wdAccountId) return;
    if (wdType === "qualified") {
      qualifiedWdMut.mutate(wdAccountId);
    } else {
      unqualifiedWdMut.mutate({ accountId: wdAccountId, penaltyPct: parseFloat(wdPenaltyPct) });
    }
  }

  function handleTransfer() {
    if (!txAccountId) return;
    if (txMode === "product" && txTargetProductId) {
      productTransferMut.mutate({ accountId: txAccountId, targetProductId: txTargetProductId });
    } else if (txMode === "admin" && txTargetAdmin) {
      adminTransferMut.mutate({ accountId: txAccountId, targetAdmin: txTargetAdmin });
    }
  }

  // --- Render ----------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Landmark className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">PERA Administrator Console</h1>
            <p className="text-sm text-muted-foreground">
              Manage PERA accounts, contributions, withdrawals, transfers, and BSP reports
            </p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => accountsQuery.refetch()} disabled={accountsQuery.isFetching}>
          <RefreshCw className={`h-4 w-4 ${accountsQuery.isFetching ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard title="Active Accounts" value={activeCount} icon={Users} accent="bg-green-600" />
        <SummaryCard title="YTD Contributions (PHP)" value={formatPHP(ytdTotal)} icon={TrendingUp} accent="bg-blue-600" />
        <SummaryCard title="Pending Transactions" value={pendingTx} icon={Clock} accent="bg-yellow-500" />
        <SummaryCard title="BSP Reports Generated" value={bspReport ? 1 : 0} icon={FileText} accent="bg-indigo-600" />
      </div>

      <Separator />

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setPage(1); }}>
        <TabsList>
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
          <TabsTrigger value="contributions">Contributions</TabsTrigger>
          <TabsTrigger value="withdrawals">Withdrawals</TabsTrigger>
          <TabsTrigger value="transfers">Transfers</TabsTrigger>
          <TabsTrigger value="bsp">BSP Reports</TabsTrigger>
        </TabsList>

        {/* ============================================================== */}
        {/* Accounts Tab                                                    */}
        {/* ============================================================== */}
        <TabsContent value="accounts" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">PERA Accounts</h2>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={() => setOnboardOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />Onboard Contributor
              </Button>
            </div>
          </div>

          {/* TIN & Duplicate Check */}
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">TIN Check</label>
              <div className="flex items-center gap-2">
                <Input placeholder="Enter TIN" value={tinCheck} onChange={(e) => setTinCheck(e.target.value)} className="w-40" />
                <Button variant="outline" size="sm" onClick={() => tinCheck && tinCheckMut.mutate(tinCheck)} disabled={tinCheckMut.isPending}>
                  <Search className="h-4 w-4 mr-1" />Check
                </Button>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Duplicate Check</label>
              <div className="flex items-center gap-2">
                <Input placeholder="Contributor ID" value={dupCheck} onChange={(e) => setDupCheck(e.target.value)} className="w-40" />
                <Button variant="outline" size="sm" onClick={() => dupCheck && dupCheckMut.mutate(dupCheck)} disabled={dupCheckMut.isPending}>
                  <Search className="h-4 w-4 mr-1" />Check
                </Button>
              </div>
            </div>
          </div>

          {/* Check results */}
          {tinResult && (
            <div className="rounded-md border bg-muted/50 p-3">
              <p className="text-xs font-medium text-muted-foreground mb-1">TIN Check Result</p>
              <pre className="text-xs whitespace-pre-wrap">{tinResult}</pre>
            </div>
          )}
          {dupResult && (
            <div className="rounded-md border bg-muted/50 p-3">
              <p className="text-xs font-medium text-muted-foreground mb-1">Duplicate Check Result</p>
              <pre className="text-xs whitespace-pre-wrap">{dupResult}</pre>
            </div>
          )}

          {/* Accounts Table */}
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Contributor</TableHead>
                  <TableHead>Administrator</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="text-right">YTD Contributions</TableHead>
                  <TableHead className="text-right">Max Annual</TableHead>
                  <TableHead>TIN</TableHead>
                  <TableHead>BSP PERA ID</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accountsQuery.isLoading ? (
                  <SkeletonRows cols={10} />
                ) : accounts.length === 0 ? (
                  <EmptyRow cols={10} msg="No PERA accounts found" />
                ) : (
                  accounts.map((a) => (
                    <TableRow key={a.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedAccountId(a.id)}>
                      <TableCell className="font-mono text-xs">{a.id}</TableCell>
                      <TableCell className="text-xs">{a.contributorId}</TableCell>
                      <TableCell className="text-xs">{a.administrator}</TableCell>
                      <TableCell className="text-xs">{a.productId}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{formatPHP(a.balance)}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{formatPHP(a.ytdContributions)}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{formatPHP(a.maxContributionAnnual)}</TableCell>
                      <TableCell className="font-mono text-xs">{a.tin}</TableCell>
                      <TableCell className="font-mono text-xs">{a.bspPeraId}</TableCell>
                      <TableCell>
                        <Badge className={STATUS_COLORS[a.status] ?? "bg-muted text-foreground"}>
                          {a.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, totalAccounts)} of {totalAccounts}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ============================================================== */}
        {/* Contributions Tab                                               */}
        {/* ============================================================== */}
        <TabsContent value="contributions" className="mt-4 space-y-4">
          <h2 className="text-lg font-semibold">Process Contribution</h2>

          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label="Account ID">
              <Input
                placeholder="Select or enter account ID"
                value={contribAccountId}
                onChange={(e) => { setContribAccountId(e.target.value); setSelectedAccountId(e.target.value); }}
              />
            </FormField>
            <FormField label="Amount (PHP)">
              <Input type="number" placeholder="e.g. 50000" value={contribAmount} onChange={(e) => setContribAmount(e.target.value)} />
            </FormField>
            <div className="flex items-end">
              <Button onClick={handleContribute} disabled={contributeMut.isPending || !contribAccountId || !contribAmount}>
                {contributeMut.isPending ? "Processing..." : "Process Contribution"}
              </Button>
            </div>
          </div>

          {/* Annual max validation hint */}
          {contribAccountId && accounts.find((a) => a.id === contribAccountId) && (
            <div className="flex items-center gap-2 text-sm">
              {(() => {
                const acct = accounts.find((a) => a.id === contribAccountId);
                if (!acct) return null;
                const remaining = acct.maxContributionAnnual - acct.ytdContributions;
                const over = parseFloat(contribAmount || "0") > remaining;
                return (
                  <>
                    {over ? (
                      <AlertTriangle className="h-4 w-4 text-yellow-600" />
                    ) : (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    )}
                    <span className={over ? "text-yellow-700" : "text-muted-foreground"}>
                      Remaining annual capacity: {formatPHP(remaining)}
                      {over && " — Amount exceeds annual maximum!"}
                    </span>
                  </>
                );
              })()}
            </div>
          )}

          {contributeMut.isError && (
            <p className="text-sm text-red-600">{(contributeMut.error as Error).message}</p>
          )}
          {contributeMut.isSuccess && (
            <p className="text-sm text-green-600">Contribution processed successfully.</p>
          )}

          <Separator />

          {/* Contribution History */}
          <h3 className="text-base font-medium">Contribution History</h3>
          {!selectedAccountId ? (
            <p className="text-sm text-muted-foreground">Select an account to view contribution history.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactionsQuery.isLoading ? (
                    <SkeletonRows cols={6} />
                  ) : transactions.filter((t) => t.type === "CONTRIBUTION").length === 0 ? (
                    <EmptyRow cols={6} msg="No contribution history for this account" />
                  ) : (
                    transactions
                      .filter((t) => t.type === "CONTRIBUTION")
                      .map((t) => (
                        <TableRow key={t.id}>
                          <TableCell className="font-mono text-xs">{t.id}</TableCell>
                          <TableCell>
                            <Badge className={TX_TYPE_COLORS[t.type] ?? "bg-muted text-foreground"}>{t.type}</Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">{formatPHP(t.amount)}</TableCell>
                          <TableCell>
                            <Badge className={STATUS_COLORS[t.status] ?? "bg-muted text-foreground"}>{t.status}</Badge>
                          </TableCell>
                          <TableCell className="text-xs">{fmtDate(t.createdAt)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{t.description ?? "\u2014"}</TableCell>
                        </TableRow>
                      ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* ============================================================== */}
        {/* Withdrawals Tab                                                 */}
        {/* ============================================================== */}
        <TabsContent value="withdrawals" className="mt-4 space-y-4">
          <h2 className="text-lg font-semibold">Process Withdrawal</h2>

          <div className="grid gap-4 sm:grid-cols-4">
            <FormField label="Account ID">
              <Input
                placeholder="Enter account ID"
                value={wdAccountId}
                onChange={(e) => { setWdAccountId(e.target.value); setSelectedAccountId(e.target.value); }}
              />
            </FormField>
            <FormField label="Withdrawal Type">
              <Select value={wdType} onValueChange={(v) => setWdType(v as "qualified" | "unqualified")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="qualified">Qualified</SelectItem>
                  <SelectItem value="unqualified">Unqualified</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            {wdType === "unqualified" && (
              <FormField label="Penalty % (default 5%)">
                <Input type="number" value={wdPenaltyPct} onChange={(e) => setWdPenaltyPct(e.target.value)} />
              </FormField>
            )}
            <div className="flex items-end">
              <Button
                onClick={handleWithdraw}
                disabled={!wdAccountId || qualifiedWdMut.isPending || unqualifiedWdMut.isPending}
                variant={wdType === "unqualified" ? "destructive" : "default"}
              >
                {(qualifiedWdMut.isPending || unqualifiedWdMut.isPending) ? "Processing..." : "Process Withdrawal"}
              </Button>
            </div>
          </div>

          {wdType === "unqualified" && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="h-3 w-3 text-yellow-600" />
              Unqualified withdrawals incur a {wdPenaltyPct}% early withdrawal penalty.
            </p>
          )}

          {(qualifiedWdMut.isError || unqualifiedWdMut.isError) && (
            <p className="text-sm text-red-600">
              {((qualifiedWdMut.error ?? unqualifiedWdMut.error) as Error)?.message}
            </p>
          )}
          {(qualifiedWdMut.isSuccess || unqualifiedWdMut.isSuccess) && (
            <p className="text-sm text-green-600">Withdrawal processed successfully.</p>
          )}

          <Separator />

          {/* Withdrawal History */}
          <h3 className="text-base font-medium">Withdrawal History</h3>
          {!selectedAccountId ? (
            <p className="text-sm text-muted-foreground">Select an account to view withdrawal history.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Penalty</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactionsQuery.isLoading ? (
                    <SkeletonRows cols={6} />
                  ) : transactions.filter((t) => t.type.includes("WITHDRAWAL")).length === 0 ? (
                    <EmptyRow cols={6} msg="No withdrawal history for this account" />
                  ) : (
                    transactions
                      .filter((t) => t.type.includes("WITHDRAWAL"))
                      .map((t) => (
                        <TableRow key={t.id}>
                          <TableCell className="font-mono text-xs">{t.id}</TableCell>
                          <TableCell>
                            <Badge className={TX_TYPE_COLORS[t.type] ?? "bg-muted text-foreground"}>{t.type}</Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">{formatPHP(t.amount)}</TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {t.penaltyAmount != null ? formatPHP(t.penaltyAmount) : "\u2014"}
                          </TableCell>
                          <TableCell>
                            <Badge className={STATUS_COLORS[t.status] ?? "bg-muted text-foreground"}>{t.status}</Badge>
                          </TableCell>
                          <TableCell className="text-xs">{fmtDate(t.createdAt)}</TableCell>
                        </TableRow>
                      ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* ============================================================== */}
        {/* Transfers Tab                                                   */}
        {/* ============================================================== */}
        <TabsContent value="transfers" className="mt-4 space-y-4">
          <h2 className="text-lg font-semibold">PERA Transfers</h2>

          <div className="grid gap-4 sm:grid-cols-4">
            <FormField label="Account ID">
              <Input
                placeholder="Enter account ID"
                value={txAccountId}
                onChange={(e) => { setTxAccountId(e.target.value); setSelectedAccountId(e.target.value); }}
              />
            </FormField>
            <FormField label="Transfer Type">
              <Select value={txMode} onValueChange={(v) => setTxMode(v as "product" | "admin")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="product">Transfer to Product</SelectItem>
                  <SelectItem value="admin">Transfer to Administrator</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            {txMode === "product" ? (
              <FormField label="Target Product ID">
                <Input placeholder="e.g. PROD-002" value={txTargetProductId} onChange={(e) => setTxTargetProductId(e.target.value)} />
              </FormField>
            ) : (
              <FormField label="Target Administrator">
                <Input placeholder="e.g. Admin Corp" value={txTargetAdmin} onChange={(e) => setTxTargetAdmin(e.target.value)} />
              </FormField>
            )}
            <div className="flex items-end">
              <Button onClick={handleTransfer} disabled={productTransferMut.isPending || adminTransferMut.isPending || !txAccountId}>
                <ArrowRightLeft className="mr-2 h-4 w-4" />
                {(productTransferMut.isPending || adminTransferMut.isPending) ? "Processing..." : "Process Transfer"}
              </Button>
            </div>
          </div>

          {(productTransferMut.isError || adminTransferMut.isError) && (
            <p className="text-sm text-red-600">
              {((productTransferMut.error ?? adminTransferMut.error) as Error)?.message}
            </p>
          )}
          {(productTransferMut.isSuccess || adminTransferMut.isSuccess) && (
            <p className="text-sm text-green-600">Transfer processed successfully.</p>
          )}

          <Separator />

          {/* Transfer History */}
          <h3 className="text-base font-medium">Transfer History</h3>
          {!selectedAccountId ? (
            <p className="text-sm text-muted-foreground">Select an account to view transfer history.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactionsQuery.isLoading ? (
                    <SkeletonRows cols={6} />
                  ) : transactions.filter((t) => t.type.includes("TRANSFER")).length === 0 ? (
                    <EmptyRow cols={6} msg="No transfer history for this account" />
                  ) : (
                    transactions
                      .filter((t) => t.type.includes("TRANSFER"))
                      .map((t) => (
                        <TableRow key={t.id}>
                          <TableCell className="font-mono text-xs">{t.id}</TableCell>
                          <TableCell>
                            <Badge className={TX_TYPE_COLORS[t.type] ?? "bg-muted text-foreground"}>{t.type}</Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">{formatPHP(t.amount)}</TableCell>
                          <TableCell>
                            <Badge className={STATUS_COLORS[t.status] ?? "bg-muted text-foreground"}>{t.status}</Badge>
                          </TableCell>
                          <TableCell className="text-xs">{fmtDate(t.createdAt)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{t.description ?? "\u2014"}</TableCell>
                        </TableRow>
                      ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* ============================================================== */}
        {/* BSP Reports Tab                                                 */}
        {/* ============================================================== */}
        <TabsContent value="bsp" className="mt-4 space-y-4">
          <h2 className="text-lg font-semibold">BSP Regulatory Reports</h2>

          {/* Generate files */}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              onClick={() => bspContributorFileMut.mutate()}
              disabled={bspContributorFileMut.isPending}
            >
              <Download className="mr-2 h-4 w-4" />
              {bspContributorFileMut.isPending ? "Generating..." : "Generate Contributor File"}
            </Button>
            <Button
              variant="outline"
              onClick={() => bspTransactionFileMut.mutate()}
              disabled={bspTransactionFileMut.isPending}
            >
              <Download className="mr-2 h-4 w-4" />
              {bspTransactionFileMut.isPending ? "Generating..." : "Generate Transaction File"}
            </Button>
          </div>

          {(bspContributorFileMut.isError || bspTransactionFileMut.isError) && (
            <p className="text-sm text-red-600">
              {((bspContributorFileMut.error ?? bspTransactionFileMut.error) as Error)?.message}
            </p>
          )}

          {/* Report preview */}
          {bspReport && (
            <div className="rounded-md border bg-muted/50 p-4">
              <p className="text-xs font-medium text-muted-foreground mb-2">Generated Report Preview</p>
              <pre className="text-xs whitespace-pre-wrap max-h-96 overflow-auto">{bspReport}</pre>
            </div>
          )}

          <Separator />

          {/* TCC Processing */}
          <h3 className="text-base font-medium">TCC Processing (Tax Credit Certificate)</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label="Contributor ID">
              <Input placeholder="e.g. CONTR-001" value={tccContributorId} onChange={(e) => setTccContributorId(e.target.value)} />
            </FormField>
            <FormField label="TCC Reference">
              <Input placeholder="e.g. TCC-2024-001" value={tccRef} onChange={(e) => setTccRef(e.target.value)} />
            </FormField>
            <div className="flex items-end">
              <Button onClick={() => tccContributorId && tccRef && tccMut.mutate({ contributorId: tccContributorId, tccRef })} disabled={tccMut.isPending || !tccContributorId || !tccRef}>
                <Send className="mr-2 h-4 w-4" />
                {tccMut.isPending ? "Processing..." : "Process TCC"}
              </Button>
            </div>
          </div>

          {tccMut.isError && (
            <p className="text-sm text-red-600">{(tccMut.error as Error).message}</p>
          )}
          {tccMut.isSuccess && (
            <p className="text-sm text-green-600">TCC processed successfully.</p>
          )}
        </TabsContent>
      </Tabs>

      {/* Onboard Contributor Dialog */}
      <Dialog open={onboardOpen} onOpenChange={setOnboardOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Onboard PERA Contributor</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <FormField label="Contributor ID">
              <Input placeholder="e.g. CONTR-001" value={obContributorId} onChange={(e) => setObContributorId(e.target.value)} />
            </FormField>
            <FormField label="Administrator">
              <Input placeholder="e.g. Trust Admin Corp" value={obAdministrator} onChange={(e) => setObAdministrator(e.target.value)} />
            </FormField>
            <FormField label="Product ID">
              <Input placeholder="e.g. PROD-001" value={obProductId} onChange={(e) => setObProductId(e.target.value)} />
            </FormField>
            <FormField label="TIN">
              <Input placeholder="e.g. 123-456-789-000" value={obTin} onChange={(e) => setObTin(e.target.value)} />
            </FormField>
            <FormField label="Max Annual Contribution (PHP)">
              <Input type="number" value={obMaxAnnual} onChange={(e) => setObMaxAnnual(e.target.value)} />
            </FormField>
            {onboardMut.isError && (
              <p className="text-sm text-red-600">{(onboardMut.error as Error).message}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { resetOnboardForm(); setOnboardOpen(false); }}>Cancel</Button>
            <Button onClick={handleOnboard} disabled={onboardMut.isPending}>
              {onboardMut.isPending ? "Onboarding..." : "Onboard Contributor"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
