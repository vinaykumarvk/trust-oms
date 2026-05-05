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
  PlusCircle, Clock, CheckCircle, ArrowUpCircle, RefreshCw,
  AlertTriangle, Link2, Play, XCircle,
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
  external_reference?: string | null;
  type: string | null;
  contribution_status: string | null;
  match_status?: string | null;
  created_at: string;
}

interface ContributionListResponse {
  data: Contribution[];
  total: number;
  page: number;
  pageSize: number;
}

interface MatchItem {
  id: number;
  item_type: string;
  portfolio_id: string | null;
  currency: string | null;
  amount: string | null;
  security_id: number | null;
  quantity: string | null;
  source_account: string | null;
  external_reference: string;
  source_system: string | null;
  received_at: string;
  match_status: string;
  match_confidence: string | null;
  match_method: string | null;
  exception_id: number | null;
  age_days: number;
}

interface MatchInventoryResponse {
  data: MatchItem[];
  total: number;
  page: number;
  pageSize: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200",
  PENDING_APPROVAL: "bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200",
  APPROVED: "bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200",
  POSTED: "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200",
  REJECTED: "bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200",
};

const ACTIVE_STATUS_SET = new Set(["PENDING", "PENDING_APPROVAL", "APPROVED"]);
const HISTORY_STATUSES = ["POSTED", "REJECTED"];

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
  const [matchPage, setMatchPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [matchDialogOpen, setMatchDialogOpen] = useState(false);
  const [linkDialog, setLinkDialog] = useState<{ itemId: number; contributionId: string; notes: string } | null>(null);
  const [resolveDialog, setResolveDialog] = useState<{ itemId: number; resolutionCode: string; resolutionNotes: string } | null>(null);
  const pageSize = 25;

  // New-contribution form state
  const [portfolioId, setPortfolioId] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("PHP");
  const [sourceAccount, setSourceAccount] = useState("");
  const [contribType, setContribType] = useState("INITIAL");
  const [externalReference, setExternalReference] = useState("");

  const [matchPortfolioId, setMatchPortfolioId] = useState("");
  const [matchAmount, setMatchAmount] = useState("");
  const [matchCurrency, setMatchCurrency] = useState("PHP");
  const [matchSourceAccount, setMatchSourceAccount] = useState("");
  const [matchExternalReference, setMatchExternalReference] = useState("");
  const [matchSourceSystem, setMatchSourceSystem] = useState("BANK_FEED");

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

  const matchQuery = useQuery<MatchInventoryResponse>({
    queryKey: ["contribution-match-items", { matchPage }],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("page", String(matchPage));
      params.set("pageSize", String(pageSize));
      return apiRequest("GET", apiUrl("/api/v1/contributions/matching/unmatched") + "?" + params.toString());
    },
    refetchInterval: 15_000,
  });

  const all = contribQuery.data?.data ?? [];
  const total = contribQuery.data?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize) || 1;

  const activeRows = all.filter((c) => ACTIVE_STATUS_SET.has(c.contribution_status ?? ""));
  const historyRows = all.filter((c) => HISTORY_STATUSES.includes(c.contribution_status ?? ""));
  const matchRows = matchQuery.data?.data ?? [];
  const matchTotal = matchQuery.data?.total ?? 0;
  const matchTotalPages = Math.ceil(matchTotal / pageSize) || 1;

  // Summary
  const pendingCount = all.filter((c) => c.contribution_status === "PENDING" || c.contribution_status === "PENDING_APPROVAL").length;
  const approvedCount = all.filter((c) => c.contribution_status === "APPROVED").length;
  const postedToday = all.filter((c) => {
    if (c.contribution_status !== "POSTED") return false;
    const today = new Date().toISOString().split("T")[0];
    return c.created_at?.startsWith(today);
  }).length;
  const agedUnmatched = matchRows.filter((item) => item.age_days >= 2).length;

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

  const ingestMatchMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiRequest("POST", apiUrl("/api/v1/contributions/matching/items"), body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contribution-match-items"] });
      qc.invalidateQueries({ queryKey: ["contributions"] });
      resetMatchForm();
      setMatchDialogOpen(false);
    },
  });

  const runMatchMut = useMutation({
    mutationFn: () => apiRequest("POST", apiUrl("/api/v1/contributions/matching/run"), { limit: 100 }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contribution-match-items"] });
      qc.invalidateQueries({ queryKey: ["contributions"] });
    },
  });

  const linkMatchMut = useMutation({
    mutationFn: (body: { itemId: number; contributionId: number; notes?: string }) =>
      apiRequest("POST", apiUrl(`/api/v1/contributions/matching/items/${body.itemId}/link`), {
        contributionId: body.contributionId,
        notes: body.notes,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contribution-match-items"] });
      qc.invalidateQueries({ queryKey: ["contributions"] });
      setLinkDialog(null);
    },
  });

  const resolveMatchMut = useMutation({
    mutationFn: (body: { itemId: number; resolutionCode: string; resolutionNotes?: string }) =>
      apiRequest("POST", apiUrl(`/api/v1/contributions/matching/items/${body.itemId}/resolve`), {
        resolutionCode: body.resolutionCode,
        resolutionNotes: body.resolutionNotes,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contribution-match-items"] });
      setResolveDialog(null);
    },
  });

  // --- Handlers ------------------------------------------------------------

  function resetForm() {
    setPortfolioId(""); setAmount(""); setCurrency("PHP");
    setSourceAccount(""); setContribType("INITIAL"); setExternalReference("");
  }

  function resetMatchForm() {
    setMatchPortfolioId(""); setMatchAmount(""); setMatchCurrency("PHP");
    setMatchSourceAccount(""); setMatchExternalReference(""); setMatchSourceSystem("BANK_FEED");
  }

  function handleRecord() {
    if (!portfolioId || !amount || !sourceAccount) return;
    recordMut.mutate({
      portfolioId, amount: parseFloat(amount), currency, sourceAccount, type: contribType,
      externalReference: externalReference || undefined,
    });
  }

  function handleIngestMatchItem() {
    if (!matchPortfolioId || !matchAmount || !matchExternalReference) return;
    ingestMatchMut.mutate({
      itemType: "CASH",
      portfolioId: matchPortfolioId,
      amount: parseFloat(matchAmount),
      currency: matchCurrency,
      sourceAccount: matchSourceAccount || undefined,
      externalReference: matchExternalReference,
      sourceSystem: matchSourceSystem,
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
          <Button variant="outline" size="sm" onClick={() => runMatchMut.mutate()} disabled={runMatchMut.isPending}>
            <Play className="h-4 w-4 mr-2" />
            Run Matching
          </Button>
          <Button variant="outline" size="sm" onClick={() => setMatchDialogOpen(true)}>
            <AlertTriangle className="h-4 w-4 mr-2" />
            Ingest Item
          </Button>
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
        <SummaryCard label="Aged Unmatched" value={agedUnmatched} icon={<AlertTriangle className="h-5 w-5 text-white" />} accent="bg-red-600" />
      </div>

      <Separator />

      {/* Tabs: Active | History */}
      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setPage(1); }}>
        <TabsList>
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="matching">Matching</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="mt-4">
          <ContributionTable
            rows={activeRows} loading={contribQuery.isLoading}
            onApprove={(id) => approveMut.mutate(id)} onPost={(id) => postMut.mutate(id)}
            approving={approveMut.isPending} posting={postMut.isPending} showActions
          />
        </TabsContent>

        <TabsContent value="matching" className="mt-4 space-y-4">
          <MatchInventoryTable
            rows={matchRows}
            loading={matchQuery.isLoading}
            onLink={(itemId) => setLinkDialog({ itemId, contributionId: "", notes: "" })}
            onResolve={(itemId) => setResolveDialog({ itemId, resolutionCode: "RETURNED_TO_REMITTER", resolutionNotes: "" })}
            actionPending={linkMatchMut.isPending || resolveMatchMut.isPending}
          />
          {matchTotalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {(matchPage - 1) * pageSize + 1}-{Math.min(matchPage * pageSize, matchTotal)} of {matchTotal}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={matchPage <= 1} onClick={() => setMatchPage((p) => p - 1)}>Previous</Button>
                <span className="text-sm text-muted-foreground">Page {matchPage} of {matchTotalPages}</span>
                <Button variant="outline" size="sm" disabled={matchPage >= matchTotalPages} onClick={() => setMatchPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <ContributionTable
            rows={historyRows} loading={contribQuery.isLoading}
            onApprove={() => {}} onPost={() => {}} approving={false} posting={false} showActions={false}
          />
        </TabsContent>
      </Tabs>

      {/* Pagination */}
      {activeTab !== "matching" && totalPages > 1 && (
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
            <FormField label="External Reference">
              <Input placeholder="e.g. BNK-REF-001" value={externalReference} onChange={(e) => setExternalReference(e.target.value)} />
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
              <p className="text-sm text-red-600 dark:text-red-400" role="alert">{(recordMut.error as Error).message}</p>
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

      <Dialog open={matchDialogOpen} onOpenChange={setMatchDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ingest Contribution Match Item</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <FormField label="Portfolio ID">
              <Input placeholder="e.g. PORT-001" value={matchPortfolioId} onChange={(e) => setMatchPortfolioId(e.target.value)} />
            </FormField>
            <FormField label="Amount">
              <Input type="number" placeholder="e.g. 500000" value={matchAmount} onChange={(e) => setMatchAmount(e.target.value)} />
            </FormField>
            <FormField label="Currency">
              <Select value={matchCurrency} onValueChange={setMatchCurrency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PHP">PHP</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Source Account">
              <Input placeholder="e.g. SA-12345" value={matchSourceAccount} onChange={(e) => setMatchSourceAccount(e.target.value)} />
            </FormField>
            <FormField label="External Reference">
              <Input placeholder="e.g. BNK-REF-001" value={matchExternalReference} onChange={(e) => setMatchExternalReference(e.target.value)} />
            </FormField>
            <FormField label="Source System">
              <Input value={matchSourceSystem} onChange={(e) => setMatchSourceSystem(e.target.value)} />
            </FormField>
            {ingestMatchMut.isError && (
              <p className="text-sm text-red-600 dark:text-red-400" role="alert">{(ingestMatchMut.error as Error).message}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { resetMatchForm(); setMatchDialogOpen(false); }}>Cancel</Button>
            <Button onClick={handleIngestMatchItem} disabled={ingestMatchMut.isPending}>
              {ingestMatchMut.isPending ? "Ingesting..." : "Ingest Item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(linkDialog)} onOpenChange={(open) => { if (!open) setLinkDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link Match Item</DialogTitle>
          </DialogHeader>
          {linkDialog && (
            <div className="space-y-4 py-2">
              <FormField label="Contribution ID">
                <Input
                  type="number"
                  value={linkDialog.contributionId}
                  onChange={(e) => setLinkDialog({ ...linkDialog, contributionId: e.target.value })}
                />
              </FormField>
              <FormField label="Notes">
                <Input
                  value={linkDialog.notes}
                  onChange={(e) => setLinkDialog({ ...linkDialog, notes: e.target.value })}
                />
              </FormField>
              {linkMatchMut.isError && (
                <p className="text-sm text-red-600 dark:text-red-400" role="alert">{(linkMatchMut.error as Error).message}</p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkDialog(null)}>Cancel</Button>
            <Button
              onClick={() => linkDialog && linkMatchMut.mutate({
                itemId: linkDialog.itemId,
                contributionId: parseInt(linkDialog.contributionId, 10),
                notes: linkDialog.notes || undefined,
              })}
              disabled={linkMatchMut.isPending || !linkDialog?.contributionId}
            >
              {linkMatchMut.isPending ? "Linking..." : "Link"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(resolveDialog)} onOpenChange={(open) => { if (!open) setResolveDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve Match Item</DialogTitle>
          </DialogHeader>
          {resolveDialog && (
            <div className="space-y-4 py-2">
              <FormField label="Resolution Code">
                <Input
                  value={resolveDialog.resolutionCode}
                  onChange={(e) => setResolveDialog({ ...resolveDialog, resolutionCode: e.target.value })}
                />
              </FormField>
              <FormField label="Notes">
                <Input
                  value={resolveDialog.resolutionNotes}
                  onChange={(e) => setResolveDialog({ ...resolveDialog, resolutionNotes: e.target.value })}
                />
              </FormField>
              {resolveMatchMut.isError && (
                <p className="text-sm text-red-600 dark:text-red-400" role="alert">{(resolveMatchMut.error as Error).message}</p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveDialog(null)}>Cancel</Button>
            <Button
              onClick={() => resolveDialog && resolveMatchMut.mutate({
                itemId: resolveDialog.itemId,
                resolutionCode: resolveDialog.resolutionCode,
                resolutionNotes: resolveDialog.resolutionNotes || undefined,
              })}
              disabled={resolveMatchMut.isPending || !resolveDialog?.resolutionCode}
            >
              {resolveMatchMut.isPending ? "Resolving..." : "Resolve"}
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

function MatchInventoryTable({ rows, loading, onLink, onResolve, actionPending }: {
  rows: MatchItem[];
  loading: boolean;
  onLink: (itemId: number) => void;
  onResolve: (itemId: number) => void;
  actionPending: boolean;
}) {
  const cols = 11;

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ID</TableHead>
            <TableHead>Reference</TableHead>
            <TableHead>Portfolio</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Currency</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Age</TableHead>
            <TableHead>Confidence</TableHead>
            <TableHead>Exception</TableHead>
            <TableHead>Actions</TableHead>
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
                No unmatched contribution items
              </TableCell>
            </TableRow>
          ) : (
            rows.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-mono text-xs">{item.id}</TableCell>
                <TableCell className="font-mono text-xs">{item.external_reference}</TableCell>
                <TableCell className="text-xs">{item.portfolio_id}</TableCell>
                <TableCell className="text-right font-mono">{fmtAmount(item.amount)}</TableCell>
                <TableCell>{item.currency}</TableCell>
                <TableCell className="text-xs">{item.source_system}</TableCell>
                <TableCell>
                  <Badge variant="outline">{item.match_status}</Badge>
                </TableCell>
                <TableCell>
                  <Badge className={item.age_days >= 2 ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" : "bg-muted text-foreground"}>
                    {item.age_days}d
                  </Badge>
                </TableCell>
                <TableCell>{item.match_confidence ? `${Math.round(parseFloat(item.match_confidence) * 100)}%` : "-"}</TableCell>
                <TableCell className="font-mono text-xs">{item.exception_id ?? "-"}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="sm" onClick={() => onLink(item.id)} disabled={actionPending}>
                      <Link2 className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => onResolve(item.id)} disabled={actionPending}>
                      <XCircle className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
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
                      {(c.contribution_status === "PENDING" || c.contribution_status === "PENDING_APPROVAL") && (
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
