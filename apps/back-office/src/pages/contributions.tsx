/**
 * Contributions Page — Phase 3F
 *
 * Cash contribution management for trust portfolios with summary cards,
 * two-tab interface (Active / History), a dialog-based recording form,
 * and action table for approval / posting workflow.
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@ui/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@ui/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@ui/components/ui/select";
import { Skeleton } from "@ui/components/ui/skeleton";
import { Separator } from "@ui/components/ui/separator";
import {
  PlusCircle, Clock, CheckCircle, ArrowUpCircle, DollarSign, RefreshCw,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Contribution {
  id: number;
  portfolio_id: string | null;
  amount: string | null;
  currency: string | null;
  source_account: string | null;
  type: string | null;
  contribution_status: string | null;
  created_at: string;
}

interface ContributionListResponse {
  data: Contribution[];
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
  POSTED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
};

const ACTIVE_STATUSES = ["PENDING", "APPROVED"];
const HISTORY_STATUSES = ["POSTED", "REJECTED"];

function formatPHP(amount: number): string {
  return amount.toLocaleString("en-PH", {
    style: "currency", currency: "PHP", minimumFractionDigits: 2,
  });
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("en-PH", {
      month: "short", day: "numeric", year: "numeric",
    });
  } catch { return dateStr; }
}

function fmtAmount(raw: string | null): string {
  return parseFloat(raw ?? "0").toLocaleString("en-PH", { minimumFractionDigits: 2 });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ContributionsPage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<string>("active");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const pageSize = 25;

  // New-contribution form state
  const [portfolioId, setPortfolioId] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("PHP");
  const [sourceAccount, setSourceAccount] = useState("");
  const [contribType, setContribType] = useState("INITIAL");

  // --- Query ---------------------------------------------------------------

  const contribQuery = useQuery<ContributionListResponse>({
    queryKey: ["contributions", { page }],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      return apiRequest("GET", apiUrl("/api/v1/contributions") + "?" + params.toString());
    },
    refetchInterval: 15_000,
  });

  const all = contribQuery.data?.data ?? [];
  const total = contribQuery.data?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize) || 1;

  const activeRows = all.filter((c) => ACTIVE_STATUSES.includes(c.contribution_status ?? ""));
  const historyRows = all.filter((c) => HISTORY_STATUSES.includes(c.contribution_status ?? ""));

  // Summary
  const pendingCount = all.filter((c) => c.contribution_status === "PENDING").length;
  const approvedCount = all.filter((c) => c.contribution_status === "APPROVED").length;
  const postedToday = all.filter((c) => {
    if (c.contribution_status !== "POSTED") return false;
    const today = new Date().toISOString().split("T")[0];
    return c.created_at?.startsWith(today);
  }).length;
  const totalInflows = all
    .filter((c) => c.currency === "PHP")
    .reduce((sum, c) => sum + parseFloat(c.amount ?? "0"), 0);

  // --- Mutations -----------------------------------------------------------

  const recordMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiRequest("POST", apiUrl("/api/v1/contributions"), body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contributions"] });
      resetForm();
      setDialogOpen(false);
    },
  });

  const approveMut = useMutation({
    mutationFn: (id: number) =>
      apiRequest("POST", apiUrl("/api/v1/contributions/" + id + "/approve"), {
        approvedBy: "back-office-user",
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contributions"] }),
  });

  const postMut = useMutation({
    mutationFn: (id: number) =>
      apiRequest("POST", apiUrl("/api/v1/contributions/" + id + "/post")),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contributions"] }),
  });

  // --- Handlers ------------------------------------------------------------

  function resetForm() {
    setPortfolioId(""); setAmount(""); setCurrency("PHP");
    setSourceAccount(""); setContribType("INITIAL");
  }

  function handleRecord() {
    if (!portfolioId || !amount || !sourceAccount) return;
    recordMut.mutate({
      portfolioId, amount: parseFloat(amount), currency, sourceAccount, type: contribType,
    });
  }

  // --- Render --------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <PlusCircle className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Contributions</h1>
            <p className="text-sm text-muted-foreground">
              Record and manage cash contributions to trust portfolios
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="default" size="sm" onClick={() => setDialogOpen(true)}>
            <PlusCircle className="h-4 w-4 mr-2" />
            New Contribution
          </Button>
          <Button variant="ghost" size="sm" onClick={() => contribQuery.refetch()} disabled={contribQuery.isFetching}>
            <RefreshCw className={`h-4 w-4 ${contribQuery.isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="Pending Approval" value={pendingCount} icon={<Clock className="h-5 w-5 text-white" />} accent="bg-yellow-500" />
        <SummaryCard label="Approved (Ready to Post)" value={approvedCount} icon={<ArrowUpCircle className="h-5 w-5 text-white" />} accent="bg-blue-600" />
        <SummaryCard label="Posted Today" value={postedToday} icon={<CheckCircle className="h-5 w-5 text-white" />} accent="bg-green-600" />
        <SummaryCard label="Total Inflows (PHP)" value={formatPHP(totalInflows)} icon={<DollarSign className="h-5 w-5 text-white" />} accent="bg-indigo-600" />
      </div>

      <Separator />

      {/* Tabs: Active | History */}
      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setPage(1); }}>
        <TabsList>
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="mt-4">
          <ContributionTable
            rows={activeRows} loading={contribQuery.isLoading}
            onApprove={(id) => approveMut.mutate(id)} onPost={(id) => postMut.mutate(id)}
            approving={approveMut.isPending} posting={postMut.isPending} showActions
          />
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <ContributionTable
            rows={historyRows} loading={contribQuery.isLoading}
            onApprove={() => {}} onPost={() => {}} approving={false} posting={false} showActions={false}
          />
        </TabsContent>
      </Tabs>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, total)} of {total}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      )}

      {/* New Contribution Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record New Contribution</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <FormField label="Portfolio ID">
              <Input placeholder="e.g. PORT-001" value={portfolioId} onChange={(e) => setPortfolioId(e.target.value)} />
            </FormField>
            <FormField label="Amount">
              <Input type="number" placeholder="e.g. 500000" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </FormField>
            <FormField label="Currency">
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PHP">PHP</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Source Account">
              <Input placeholder="e.g. SA-12345" value={sourceAccount} onChange={(e) => setSourceAccount(e.target.value)} />
            </FormField>
            <FormField label="Type">
              <Select value={contribType} onValueChange={setContribType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="INITIAL">Initial</SelectItem>
                  <SelectItem value="ADDITIONAL">Additional</SelectItem>
                  <SelectItem value="REGULAR">Regular</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            {recordMut.isError && (
              <p className="text-sm text-red-600">{(recordMut.error as Error).message}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { resetForm(); setDialogOpen(false); }}>Cancel</Button>
            <Button onClick={handleRecord} disabled={recordMut.isPending}>
              {recordMut.isPending ? "Recording..." : "Record Contribution"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SummaryCard({ label, value, icon, accent }: {
  label: string; value: string | number; icon: React.ReactNode; accent: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-bold">{value}</p>
          </div>
          <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${accent}`}>
            {icon}
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

interface ContributionTableProps {
  rows: Contribution[];
  loading: boolean;
  onApprove: (id: number) => void;
  onPost: (id: number) => void;
  approving: boolean;
  posting: boolean;
  showActions: boolean;
}

function ContributionTable({ rows, loading, onApprove, onPost, approving, posting, showActions }: ContributionTableProps) {
  const cols = showActions ? 9 : 8;

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ID</TableHead>
            <TableHead>Portfolio</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Currency</TableHead>
            <TableHead>Source Account</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Date</TableHead>
            {showActions && <TableHead>Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: cols }).map((_, j) => (
                  <TableCell key={j}><Skeleton className="h-4 w-16" /></TableCell>
                ))}
              </TableRow>
            ))
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={cols} className="text-center text-muted-foreground py-8">
                No contributions found
              </TableCell>
            </TableRow>
          ) : (
            rows.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-mono text-xs">{c.id}</TableCell>
                <TableCell className="text-xs">{c.portfolio_id}</TableCell>
                <TableCell className="text-right font-mono">{fmtAmount(c.amount)}</TableCell>
                <TableCell>{c.currency}</TableCell>
                <TableCell className="text-xs">{c.source_account}</TableCell>
                <TableCell><Badge variant="outline">{c.type}</Badge></TableCell>
                <TableCell>
                  <Badge className={STATUS_COLORS[c.contribution_status ?? ""] ?? "bg-muted text-foreground"}>
                    {c.contribution_status}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs">{formatDate(c.created_at)}</TableCell>
                {showActions && (
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {c.contribution_status === "PENDING" && (
                        <Button variant="outline" size="sm" onClick={() => onApprove(c.id)} disabled={approving}>Approve</Button>
                      )}
                      {c.contribution_status === "APPROVED" && (
                        <Button variant="default" size="sm" onClick={() => onPost(c.id)} disabled={posting}>Post</Button>
                      )}
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
