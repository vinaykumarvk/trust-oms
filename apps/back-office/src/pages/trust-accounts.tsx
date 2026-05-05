/**
 * Trust Account Management — Enterprise Operational Page
 * Foundation stack lifecycle: accounts, settlement, holdings, securities,
 * mandates, related parties, events, and signatory authority validation.
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
import { Separator } from "@ui/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@ui/components/ui/sheet";
import { Skeleton } from "@ui/components/ui/skeleton";
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
  Building2,
  CheckCircle2,
  ChevronRight,
  Landmark,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Users,
  XCircle,
} from "lucide-react";

/* ---------- Types ---------- */

interface TrustAccount {
  account_id: string;
  client_id: string;
  client_name?: string;
  primary_portfolio_id: string;
  product_type: string;
  account_name: string;
  base_currency: string;
  account_status: string;
  inception_date?: string;
  created_at?: string;
  settlement_count?: number;
  holding_count?: number;
}

interface FoundationDetail {
  trust_account: TrustAccount;
  holding_accounts: Record<string, unknown>[];
  security_accounts: Record<string, unknown>[];
  settlement_accounts: Record<string, unknown>[];
  mandates: Record<string, unknown>[];
  related_parties: Record<string, unknown>[];
  events: Record<string, unknown>[];
}

interface AuthorityResult {
  passed: boolean;
  required_signatories: number;
  provided_signatories: number;
  valid_signatories: number;
  failures: string[];
}

interface RelatedPartyInput {
  local_id: string;
  party_type: string;
  legal_name: string;
  relationship_to_account: string;
  ownership_pct: string;
  is_authorized_signatory: boolean;
}

/* ---------- Helpers ---------- */

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "--";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function formatDate(value: unknown): string {
  if (!value || typeof value !== "string") return "--";
  try {
    return new Date(value).toLocaleDateString("en-PH", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return String(value);
  }
}

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  const s = status?.toUpperCase() ?? "";
  if (s === "ACTIVE" || s === "OPEN") return "default";
  if (s === "SUSPENDED" || s === "BLOCKED") return "destructive";
  return "secondary";
}

/* ---------- Sub-Components ---------- */

function TableSkeleton({ rows = 4, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-3">
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton key={j} className="h-5 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Landmark className="h-10 w-10 text-muted-foreground/40" />
      <p className="mt-3 text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

/* ---------- Main Component ---------- */

export default function TrustAccountManagement() {
  const queryClient = useQueryClient();

  // Search & filter state
  const [clientIdInput, setClientIdInput] = useState("");
  const [activeClientId, setActiveClientId] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [typeFilter, setTypeFilter] = useState("ALL");

  // Detail sheet
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [detailTab, setDetailTab] = useState("summary");

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    client_id: "",
    trust_type: "IMA_DISCRETIONARY",
    trust_name: "",
    currency: "PHP",
    inception_date: new Date().toISOString().slice(0, 10),
    related_parties: [] as RelatedPartyInput[],
    min_signatories: "1",
    mandate_notes: "",
  });

  // Authority check
  const [authAccount, setAuthAccount] = useState("");
  const [authAction, setAuthAction] = useState("WITHDRAWAL");
  const [authSignerIds, setAuthSignerIds] = useState<number[]>([]);

  /* ---------- Queries ---------- */

  const accountsQuery = useQuery<{ data: TrustAccount[] }>({
    queryKey: ["trust-accounts", activeClientId],
    queryFn: () => apiRequest("GET", `/api/v1/trust-accounts?client_id=${encodeURIComponent(activeClientId)}`),
    enabled: activeClientId.length > 0,
  });

  const detailQuery = useQuery<{ data: FoundationDetail }>({
    queryKey: ["trust-account-detail", selectedAccountId],
    queryFn: () => apiRequest("GET", `/api/v1/trust-accounts/${encodeURIComponent(selectedAccountId!)}`),
    enabled: !!selectedAccountId,
  });

  const authorityMutation = useMutation<{ data: AuthorityResult }>({
    mutationFn: () =>
      apiRequest("POST", `/api/v1/trust-accounts/${encodeURIComponent(authAccount)}/authority-check`, {
        action: authAction,
        signer_party_ids: authSignerIds,
      }),
  });

  const createMutation = useMutation<{ data: { trust_account_id: string } }>({
    mutationFn: () =>
      apiRequest("POST", "/api/v1/trust-accounts", {
        client_id: createForm.client_id,
        account_name: createForm.trust_name || undefined,
        product_type: createForm.trust_type,
        base_currency: createForm.currency,
        related_parties: createForm.related_parties.length > 0
          ? createForm.related_parties.map((p) => ({
              local_id: p.local_id,
              party_type: p.party_type,
              legal_name: p.legal_name,
              relationship_to_account: p.relationship_to_account || undefined,
              ownership_pct: p.ownership_pct || undefined,
              is_authorized_signatory: p.is_authorized_signatory,
              effective_from: new Date().toISOString().slice(0, 10),
            }))
          : undefined,
      }),
    onSuccess: (result) => {
      setCreateOpen(false);
      setActiveClientId(createForm.client_id);
      setClientIdInput(createForm.client_id);
      setSelectedAccountId(result.data.trust_account_id);
      setSheetOpen(true);
      queryClient.invalidateQueries({ queryKey: ["trust-accounts"] });
      resetCreateForm();
    },
  });

  /* ---------- Derived ---------- */

  const accounts = useMemo(() => {
    const raw = accountsQuery.data?.data ?? [];
    return raw.filter((a) => {
      if (statusFilter !== "ALL" && a.account_status?.toUpperCase() !== statusFilter) return false;
      if (typeFilter !== "ALL" && a.product_type !== typeFilter) return false;
      return true;
    });
  }, [accountsQuery.data, statusFilter, typeFilter]);

  const detail = detailQuery.data?.data;
  const authorityResult = authorityMutation.data?.data;
  const detailSigners = (detail?.related_parties ?? []).filter(
    (p) => p.is_authorized_signatory === true,
  );

  const accountTypes = useMemo(() => {
    const raw = accountsQuery.data?.data ?? [];
    const types = new Set(raw.map((a) => a.product_type).filter(Boolean));
    return Array.from(types).sort();
  }, [accountsQuery.data]);

  /* ---------- Handlers ---------- */

  function handleSearch() {
    const trimmed = clientIdInput.trim();
    if (trimmed) {
      setActiveClientId(trimmed);
      setSelectedAccountId(null);
    }
  }

  function handleRowClick(accountId: string) {
    setSelectedAccountId(accountId);
    setAuthAccount(accountId);
    setSheetOpen(true);
    setDetailTab("summary");
    setAuthSignerIds([]);
  }

  function resetCreateForm() {
    setCreateForm({
      client_id: "",
      trust_type: "IMA_DISCRETIONARY",
      trust_name: "",
      currency: "PHP",
      inception_date: new Date().toISOString().slice(0, 10),
      related_parties: [],
      min_signatories: "1",
      mandate_notes: "",
    });
  }

  function addParty() {
    setCreateForm((f) => ({
      ...f,
      related_parties: [
        ...f.related_parties,
        {
          local_id: `party-${f.related_parties.length + 1}`,
          party_type: "SETTLOR",
          legal_name: "",
          relationship_to_account: "",
          ownership_pct: "",
          is_authorized_signatory: false,
        },
      ],
    }));
  }

  function removeParty(index: number) {
    setCreateForm((f) => ({
      ...f,
      related_parties: f.related_parties.filter((_, i) => i !== index),
    }));
  }

  function updateParty(index: number, field: keyof RelatedPartyInput, value: string | boolean) {
    setCreateForm((f) => {
      const parties = [...f.related_parties];
      parties[index] = { ...parties[index], [field]: value };
      return { ...f, related_parties: parties };
    });
  }

  /* ---------- Render ---------- */

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Trust Account Management
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Foundation stack lifecycle, mandate governance, and signatory authority validation
          </p>
        </div>
        <Button className="gap-2" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          Create Foundation
        </Button>
      </div>

      {/* Search & Filter Bar */}
      <Card>
        <CardContent className="flex flex-col gap-4 pt-5 sm:flex-row sm:items-end">
          <div className="flex flex-1 gap-2">
            <div className="flex-1 sm:max-w-xs">
              <Label htmlFor="search-client">Client ID</Label>
              <Input
                id="search-client"
                value={clientIdInput}
                onChange={(e) => setClientIdInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="e.g. CLI-001"
              />
            </div>
            <Button className="mt-6 gap-2" onClick={handleSearch}>
              <Search className="h-4 w-4" />
              Search
            </Button>
          </div>
          <Separator orientation="vertical" className="hidden h-8 sm:block" />
          <div className="flex gap-3">
            <div className="w-40">
              <Label>Account Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Statuses</SelectItem>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="CLOSED">Closed</SelectItem>
                  <SelectItem value="SUSPENDED">Suspended</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-44">
              <Label>Account Type</Label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Types</SelectItem>
                  {accountTypes.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Account List Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4" />
            Trust Accounts
            {accounts.length > 0 && (
              <Badge variant="outline" className="ml-2 font-normal">
                {accounts.length} record{accounts.length !== 1 ? "s" : ""}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {accountsQuery.isLoading && <TableSkeleton rows={5} cols={7} />}
          {!accountsQuery.isLoading && !activeClientId && (
            <EmptyState message="Enter a Client ID and click Search to load trust accounts." />
          )}
          {!accountsQuery.isLoading && activeClientId && accounts.length === 0 && (
            <EmptyState message="No trust accounts found matching the current filters." />
          )}
          {!accountsQuery.isLoading && accounts.length > 0 && (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Account ID</TableHead>
                    <TableHead>Account Name</TableHead>
                    <TableHead>Trust Type</TableHead>
                    <TableHead>Currency</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-center">Settlement</TableHead>
                    <TableHead className="text-center">Holdings</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.map((acct) => (
                    <TableRow
                      key={acct.account_id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleRowClick(acct.account_id)}
                    >
                      <TableCell className="font-mono text-xs">{acct.account_id}</TableCell>
                      <TableCell className="font-medium">
                        {acct.account_name || acct.client_name || "--"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {acct.product_type?.replace(/_/g, " ") ?? "--"}
                      </TableCell>
                      <TableCell>{acct.base_currency}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(acct.account_status)}>
                          {acct.account_status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center text-sm">
                        {acct.settlement_count ?? "--"}
                      </TableCell>
                      <TableCell className="text-center text-sm">
                        {acct.holding_count ?? "--"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(acct.created_at || acct.inception_date)}
                      </TableCell>
                      <TableCell>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Authority Check Panel */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4" />
            Authority Check
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label>Account</Label>
              <Select value={authAccount} onValueChange={setAuthAccount}>
                <SelectTrigger>
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  {(accountsQuery.data?.data ?? []).map((a) => (
                    <SelectItem key={a.account_id} value={a.account_id}>
                      {a.account_name || a.account_id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Action Type</Label>
              <Select value={authAction} onValueChange={setAuthAction}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="WITHDRAWAL">Withdrawal</SelectItem>
                  <SelectItem value="TRANSFER">Transfer</SelectItem>
                  <SelectItem value="CLOSE">Close Account</SelectItem>
                  <SelectItem value="AMEND_MANDATE">Amend Mandate</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                className="gap-2"
                disabled={!authAccount || authorityMutation.isPending}
                onClick={() => authorityMutation.mutate()}
              >
                <ShieldCheck className="h-4 w-4" />
                Check Authority
              </Button>
            </div>
          </div>

          {/* Signatories selection */}
          {detailSigners.length > 0 && authAccount === selectedAccountId && (
            <div>
              <Label className="mb-2 block">Select Signatories</Label>
              <div className="grid gap-2 rounded-md border p-3 sm:grid-cols-2 lg:grid-cols-3">
                {detailSigners.map((p) => {
                  const pid = Number(p.id);
                  const checked = authSignerIds.includes(pid);
                  return (
                    <label key={pid} className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setAuthSignerIds((cur) =>
                            checked ? cur.filter((id) => id !== pid) : [...cur, pid],
                          )
                        }
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      <span>{formatValue(p.legal_name)}</span>
                      <span className="text-xs text-muted-foreground">#{pid}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Authority result */}
          {authorityResult && (
            <div className="rounded-lg border p-4">
              <div className="flex items-center gap-3">
                {authorityResult.passed ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                )}
                <Badge variant={authorityResult.passed ? "default" : "destructive"}>
                  {authorityResult.passed ? "PASS" : "FAIL"}
                </Badge>
                <span className="text-sm font-medium">
                  {authorityResult.passed
                    ? "Signatory authority satisfied"
                    : "Insufficient signatory authority"}
                </span>
              </div>
              <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                <div>
                  <span className="text-muted-foreground">Required:</span>{" "}
                  {authorityResult.required_signatories}
                </div>
                <div>
                  <span className="text-muted-foreground">Provided:</span>{" "}
                  {authorityResult.provided_signatories}
                </div>
                <div>
                  <span className="text-muted-foreground">Valid:</span>{" "}
                  {authorityResult.valid_signatories}
                </div>
              </div>
              {authorityResult.failures.length > 0 && (
                <div className="mt-3 rounded-md bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-400">
                  {authorityResult.failures.map((f, i) => (
                    <p key={i}>{f}</p>
                  ))}
                </div>
              )}
            </div>
          )}
          {authorityMutation.error && (
            <p className="text-sm text-red-600 dark:text-red-400">
              {(authorityMutation.error as Error).message}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Detail Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-3">
              <span className="font-mono text-sm">{selectedAccountId}</span>
              {detail?.trust_account?.account_status && (
                <Badge variant={statusVariant(detail.trust_account.account_status)}>
                  {detail.trust_account.account_status}
                </Badge>
              )}
            </SheetTitle>
          </SheetHeader>

          {detailQuery.isLoading && (
            <div className="mt-6 space-y-4">
              <TableSkeleton rows={6} cols={3} />
            </div>
          )}

          {!detailQuery.isLoading && !detail && (
            <EmptyState message="Unable to load account details." />
          )}

          {detail && (
            <Tabs value={detailTab} onValueChange={setDetailTab} className="mt-6">
              <TabsList className="grid w-full grid-cols-3 lg:grid-cols-7">
                <TabsTrigger value="summary">Summary</TabsTrigger>
                <TabsTrigger value="settlement">Settlement</TabsTrigger>
                <TabsTrigger value="holding">Holdings</TabsTrigger>
                <TabsTrigger value="security">Securities</TabsTrigger>
                <TabsTrigger value="mandates">Mandates</TabsTrigger>
                <TabsTrigger value="parties">Parties</TabsTrigger>
                <TabsTrigger value="events">Events</TabsTrigger>
              </TabsList>

              {/* Summary Tab */}
              <TabsContent value="summary" className="mt-4 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-3">
                    <InfoRow label="Account ID" value={detail.trust_account.account_id} />
                    <InfoRow label="Client ID" value={detail.trust_account.client_id} />
                    <InfoRow label="Account Name" value={detail.trust_account.account_name} />
                    <InfoRow label="Portfolio ID" value={detail.trust_account.primary_portfolio_id} />
                  </div>
                  <div className="space-y-3">
                    <InfoRow label="Product Type" value={detail.trust_account.product_type?.replace(/_/g, " ")} />
                    <InfoRow label="Currency" value={detail.trust_account.base_currency} />
                    <InfoRow label="Status" value={detail.trust_account.account_status} />
                    <InfoRow label="Created" value={formatDate(detail.trust_account.created_at || detail.trust_account.inception_date)} />
                  </div>
                </div>
                <Separator />
                <div className="grid grid-cols-3 gap-4 text-center">
                  <StatCard label="Settlement Accounts" value={detail.settlement_accounts.length} />
                  <StatCard label="Holding Accounts" value={detail.holding_accounts.length} />
                  <StatCard label="Related Parties" value={detail.related_parties.length} />
                </div>
              </TabsContent>

              {/* Settlement Accounts Tab */}
              <TabsContent value="settlement" className="mt-4">
                {detail.settlement_accounts.length === 0 ? (
                  <EmptyState message="No settlement accounts configured." />
                ) : (
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Purpose</TableHead>
                          <TableHead>Account No</TableHead>
                          <TableHead>Currency</TableHead>
                          <TableHead>Default</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Routing BIC</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detail.settlement_accounts.map((row, i) => (
                          <TableRow key={i}>
                            <TableCell>{formatValue(row.purpose)}</TableCell>
                            <TableCell className="font-mono text-xs">{formatValue(row.account_no)}</TableCell>
                            <TableCell>{formatValue(row.currency)}</TableCell>
                            <TableCell>
                              <Badge variant={row.is_default ? "default" : "outline"}>
                                {row.is_default ? "Yes" : "No"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant={statusVariant(String(row.account_status ?? ""))}>
                                {formatValue(row.account_status)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs">{formatValue(row.routing_bic)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>

              {/* Holding Accounts Tab */}
              <TabsContent value="holding" className="mt-4">
                {detail.holding_accounts.length === 0 ? (
                  <EmptyState message="No holding accounts found." />
                ) : (
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Type</TableHead>
                          <TableHead>Account No</TableHead>
                          <TableHead>Currency</TableHead>
                          <TableHead>Balance</TableHead>
                          <TableHead>Available</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detail.holding_accounts.map((row, i) => (
                          <TableRow key={i}>
                            <TableCell>{formatValue(row.account_type)}</TableCell>
                            <TableCell className="font-mono text-xs">{formatValue(row.account_no)}</TableCell>
                            <TableCell>{formatValue(row.currency)}</TableCell>
                            <TableCell className="text-right font-mono">
                              {formatValue(row.balance_snapshot)}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {formatValue(row.available_balance_snapshot)}
                            </TableCell>
                            <TableCell>
                              <Badge variant={statusVariant(String(row.account_status ?? ""))}>
                                {formatValue(row.account_status)}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>

              {/* Security Accounts Tab */}
              <TabsContent value="security" className="mt-4">
                {detail.security_accounts.length === 0 ? (
                  <EmptyState message="No security accounts found." />
                ) : (
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Account No</TableHead>
                          <TableHead>Depository</TableHead>
                          <TableHead>Currency</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detail.security_accounts.map((row, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-mono text-xs">{formatValue(row.account_no)}</TableCell>
                            <TableCell>{formatValue(row.depository)}</TableCell>
                            <TableCell>{formatValue(row.currency)}</TableCell>
                            <TableCell>
                              <Badge variant={statusVariant(String(row.account_status ?? ""))}>
                                {formatValue(row.account_status)}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>

              {/* Mandates Tab */}
              <TabsContent value="mandates" className="mt-4">
                {detail.mandates.length === 0 ? (
                  <EmptyState message="No mandates configured for this account." />
                ) : (
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Mandate Type</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Effective From</TableHead>
                          <TableHead>Signing Rule</TableHead>
                          <TableHead>Risk Limits</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detail.mandates.map((row, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-medium">{formatValue(row.mandate_type)}</TableCell>
                            <TableCell>
                              <Badge variant={statusVariant(String(row.mandate_status ?? ""))}>
                                {formatValue(row.mandate_status)}
                              </Badge>
                            </TableCell>
                            <TableCell>{formatDate(row.effective_from)}</TableCell>
                            <TableCell className="text-xs">{formatValue(row.signing_rule)}</TableCell>
                            <TableCell className="max-w-[200px] truncate text-xs">
                              {formatValue(row.risk_limits)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>

              {/* Related Parties Tab */}
              <TabsContent value="parties" className="mt-4">
                {detail.related_parties.length === 0 ? (
                  <EmptyState message="No related parties linked to this account." />
                ) : (
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Party Role</TableHead>
                          <TableHead>Legal Name</TableHead>
                          <TableHead>ID</TableHead>
                          <TableHead>Ownership %</TableHead>
                          <TableHead>Signatory</TableHead>
                          <TableHead>Verification</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detail.related_parties.map((row, i) => (
                          <TableRow key={i}>
                            <TableCell>
                              <Badge variant="outline">
                                {formatValue(row.party_type)}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-medium">{formatValue(row.legal_name)}</TableCell>
                            <TableCell className="font-mono text-xs">{formatValue(row.id)}</TableCell>
                            <TableCell>{formatValue(row.ownership_pct)}</TableCell>
                            <TableCell>
                              {row.is_authorized_signatory ? (
                                <Badge variant="default">Yes</Badge>
                              ) : (
                                <span className="text-muted-foreground">No</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge variant={statusVariant(String(row.verification_status ?? "PENDING"))}>
                                {formatValue(row.verification_status)}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>

              {/* Events Tab */}
              <TabsContent value="events" className="mt-4">
                {detail.events.length === 0 ? (
                  <EmptyState message="No lifecycle events recorded." />
                ) : (
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Event Type</TableHead>
                          <TableHead>Timestamp</TableHead>
                          <TableHead>Actor</TableHead>
                          <TableHead>Payload</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[...detail.events].reverse().slice(0, 20).map((row, i) => (
                          <TableRow key={i}>
                            <TableCell>
                              <Badge variant="outline">{formatValue(row.event_type)}</Badge>
                            </TableCell>
                            <TableCell className="text-xs">{formatDate(row.event_at)}</TableCell>
                            <TableCell className="text-sm">{formatValue(row.actor_id)}</TableCell>
                            <TableCell className="max-w-[250px] truncate text-xs text-muted-foreground">
                              {formatValue(row.payload)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </SheetContent>
      </Sheet>

      {/* Create Foundation Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Landmark className="h-5 w-5" />
              Create Trust Account Foundation
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Trust Details Section */}
            <div>
              <h3 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Trust Details
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="cf-client-id">Client ID *</Label>
                  <Input
                    id="cf-client-id"
                    value={createForm.client_id}
                    onChange={(e) => setCreateForm((f) => ({ ...f, client_id: e.target.value }))}
                    placeholder="CLI-001"
                  />
                </div>
                <div>
                  <Label htmlFor="cf-trust-name">Trust Name</Label>
                  <Input
                    id="cf-trust-name"
                    value={createForm.trust_name}
                    onChange={(e) => setCreateForm((f) => ({ ...f, trust_name: e.target.value }))}
                    placeholder="Auto-generated if blank"
                  />
                </div>
                <div>
                  <Label>Trust Type *</Label>
                  <Select
                    value={createForm.trust_type}
                    onValueChange={(v) => setCreateForm((f) => ({ ...f, trust_type: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="IMA_DISCRETIONARY">IMA Discretionary</SelectItem>
                      <SelectItem value="IMA_DIRECTED">IMA Directed</SelectItem>
                      <SelectItem value="PMT">Personal Management Trust</SelectItem>
                      <SelectItem value="ESCROW">Escrow</SelectItem>
                      <SelectItem value="AGENCY">Agency</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="cf-currency">Currency *</Label>
                  <Input
                    id="cf-currency"
                    value={createForm.currency}
                    onChange={(e) =>
                      setCreateForm((f) => ({ ...f, currency: e.target.value.toUpperCase() }))
                    }
                    placeholder="PHP"
                    maxLength={3}
                  />
                </div>
                <div>
                  <Label htmlFor="cf-inception">Inception Date</Label>
                  <Input
                    id="cf-inception"
                    type="date"
                    value={createForm.inception_date}
                    onChange={(e) => setCreateForm((f) => ({ ...f, inception_date: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Related Parties Section */}
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Related Parties
                </h3>
                <Button type="button" variant="outline" size="sm" className="gap-1" onClick={addParty}>
                  <Plus className="h-3.5 w-3.5" />
                  Add Party
                </Button>
              </div>
              {createForm.related_parties.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No parties added yet. Click "Add Party" to include settlors, beneficiaries, or other roles.
                </p>
              )}
              <div className="space-y-3">
                {createForm.related_parties.map((party, idx) => (
                  <div key={party.local_id} className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">
                        Party {idx + 1}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 text-red-600 hover:text-red-700 dark:text-red-400"
                        onClick={() => removeParty(idx)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Remove
                      </Button>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div>
                        <Label className="text-xs">Legal Name *</Label>
                        <Input
                          value={party.legal_name}
                          onChange={(e) => updateParty(idx, "legal_name", e.target.value)}
                          placeholder="Full legal name"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Role *</Label>
                        <Select
                          value={party.party_type}
                          onValueChange={(v) => updateParty(idx, "party_type", v)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="SETTLOR">Settlor</SelectItem>
                            <SelectItem value="BENEFICIARY">Beneficiary</SelectItem>
                            <SelectItem value="PROTECTOR">Protector</SelectItem>
                            <SelectItem value="INVESTMENT_ADVISOR">Investment Advisor</SelectItem>
                            <SelectItem value="AUTHORIZED_SIGNATORY">Authorized Signatory</SelectItem>
                            <SelectItem value="TRUSTEE">Trustee</SelectItem>
                            <SelectItem value="UBO">UBO</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">Ownership %</Label>
                        <Input
                          value={party.ownership_pct}
                          onChange={(e) => updateParty(idx, "ownership_pct", e.target.value)}
                          placeholder="e.g. 50"
                        />
                      </div>
                      <div className="flex items-end gap-2">
                        <label className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm">
                          <input
                            type="checkbox"
                            checked={party.is_authorized_signatory}
                            onChange={(e) =>
                              updateParty(idx, "is_authorized_signatory", e.target.checked)
                            }
                            className="h-4 w-4 rounded border-gray-300"
                          />
                          Authorized Signatory
                        </label>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Signatory Config */}
            <div>
              <h3 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Signatory Configuration
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="cf-min-sig">Minimum Signatories</Label>
                  <Input
                    id="cf-min-sig"
                    type="number"
                    min={1}
                    value={createForm.min_signatories}
                    onChange={(e) =>
                      setCreateForm((f) => ({ ...f, min_signatories: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="cf-mandate-notes">Mandate Rules / Notes</Label>
                  <Textarea
                    id="cf-mandate-notes"
                    value={createForm.mandate_notes}
                    onChange={(e) =>
                      setCreateForm((f) => ({ ...f, mandate_notes: e.target.value }))
                    }
                    placeholder="Optional mandate rules or notes"
                    rows={2}
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!createForm.client_id || createMutation.isPending}
              onClick={() => createMutation.mutate()}
              className="gap-2"
            >
              {createMutation.isPending ? "Creating..." : "Create Foundation"}
            </Button>
          </DialogFooter>
          {createMutation.error && (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">
              {(createMutation.error as Error).message}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------- Small Display Components ---------- */

function InfoRow({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">{formatValue(value)}</dd>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
