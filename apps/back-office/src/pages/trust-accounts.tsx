import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@ui/components/ui/badge";
import { Button } from "@ui/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/ui/card";
import { Checkbox } from "@ui/components/ui/checkbox";
import { Input } from "@ui/components/ui/input";
import { Label } from "@ui/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ui/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@ui/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/components/ui/tabs";
import { fetcher, mutationFn } from "@/lib/api";
import { CheckCircle2, Search, ShieldCheck, XCircle } from "lucide-react";

type TrustAccount = {
  account_id: string;
  client_id: string;
  primary_portfolio_id: string;
  product_type: string;
  account_name: string;
  base_currency: string;
  account_status: string;
};

type FoundationDetail = {
  trust_account: TrustAccount;
  holding_accounts: Record<string, unknown>[];
  security_accounts: Record<string, unknown>[];
  settlement_accounts: Record<string, unknown>[];
  mandates: Record<string, unknown>[];
  related_parties: Record<string, unknown>[];
  events: Record<string, unknown>[];
};

type AuthorityResult = {
  passed: boolean;
  required_signatories: number;
  provided_signatories: number;
  valid_signatories: number;
  failures: string[];
};

function text(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function DataTable({ rows, columns }: { rows: Record<string, unknown>[]; columns: string[] }) {
  if (rows.length === 0) {
    return <p className="py-4 text-sm text-muted-foreground">No records found.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead key={column}>{column.replaceAll("_", " ")}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow key={index}>
              {columns.map((column) => (
                <TableCell key={column} className="max-w-[280px] truncate">
                  {text(row[column])}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default function TrustAccountsPage() {
  const queryClient = useQueryClient();
  const [clientId, setClientId] = useState("");
  const [activeClientId, setActiveClientId] = useState("");
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [action, setAction] = useState("withdrawal");
  const [amount, setAmount] = useState("");
  const [selectedSignerIds, setSelectedSignerIds] = useState<number[]>([]);
  const [createForm, setCreateForm] = useState({
    client_id: "",
    portfolio_id: "",
    account_name: "",
    product_type: "IMA_DISCRETIONARY",
    base_currency: "PHP",
  });

  const accountsQuery = useQuery<{ data: TrustAccount[] }>({
    queryKey: ["trust-accounts", activeClientId],
    queryFn: () => fetcher(`/api/v1/trust-accounts?client_id=${encodeURIComponent(activeClientId)}`),
    enabled: activeClientId.length > 0,
  });

  const selectedAccount = selectedAccountId || accountsQuery.data?.data?.[0]?.account_id || "";

  const detailQuery = useQuery<{ data: FoundationDetail }>({
    queryKey: ["trust-account-detail", selectedAccount],
    queryFn: () => fetcher(`/api/v1/trust-accounts/${encodeURIComponent(selectedAccount)}`),
    enabled: selectedAccount.length > 0,
  });

  const authorityMutation = useMutation<{ data: AuthorityResult }>({
    mutationFn: () => mutationFn("POST", `/api/v1/trust-accounts/${encodeURIComponent(selectedAccount)}/authority-check`, {
      action,
      amount: amount || null,
      signer_party_ids: selectedSignerIds,
    }),
  });

  const createMutation = useMutation<{ data: { trust_account_id: string } }>({
    mutationFn: () => mutationFn("POST", "/api/v1/trust-accounts", {
      client_id: createForm.client_id,
      portfolio_id: createForm.portfolio_id || undefined,
      account_name: createForm.account_name || undefined,
      product_type: createForm.product_type,
      base_currency: createForm.base_currency,
    }),
    onSuccess: async (result) => {
      setActiveClientId(createForm.client_id);
      setClientId(createForm.client_id);
      setSelectedAccountId(result.data.trust_account_id);
      await queryClient.invalidateQueries({ queryKey: ["trust-accounts", createForm.client_id] });
    },
  });

  const detail = detailQuery.data?.data;
  const accountOptions = accountsQuery.data?.data ?? [];
  const authority = authorityMutation.data?.data;
  const signers = (detail?.related_parties ?? []).filter((party) => party.is_authorized_signatory === true);

  const latestEvents = useMemo(
    () => [...(detail?.events ?? [])].reverse().slice(0, 10),
    [detail?.events],
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Trust Accounts</h1>
          <p className="text-sm text-muted-foreground">Account foundation, mandates, related parties, settlement accounts, and authority evidence.</p>
        </div>
        <div className="flex w-full gap-2 md:w-auto">
          <div className="min-w-0 flex-1 md:w-72">
            <Label htmlFor="client-id">Client ID</Label>
            <Input id="client-id" value={clientId} onChange={(event) => setClientId(event.target.value)} placeholder="CLI-001" />
          </div>
          <Button className="mt-6 gap-2" onClick={() => setActiveClientId(clientId.trim())}>
            <Search className="h-4 w-4" />
            Search
          </Button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(260px,360px)_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Create Foundation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label htmlFor="create-client-id">Client ID</Label>
                <Input id="create-client-id" value={createForm.client_id} onChange={(event) => setCreateForm((form) => ({ ...form, client_id: event.target.value }))} placeholder="CLI-001" />
              </div>
              <div>
                <Label htmlFor="create-portfolio-id">Portfolio ID</Label>
                <Input id="create-portfolio-id" value={createForm.portfolio_id} onChange={(event) => setCreateForm((form) => ({ ...form, portfolio_id: event.target.value }))} placeholder="Auto if blank" />
              </div>
              <div>
                <Label htmlFor="create-account-name">Account Name</Label>
                <Input id="create-account-name" value={createForm.account_name} onChange={(event) => setCreateForm((form) => ({ ...form, account_name: event.target.value }))} placeholder="Auto if blank" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Product</Label>
                  <Select value={createForm.product_type} onValueChange={(value) => setCreateForm((form) => ({ ...form, product_type: value }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="IMA_DISCRETIONARY">IMA Discretionary</SelectItem>
                      <SelectItem value="IMA_DIRECTED">IMA Directed</SelectItem>
                      <SelectItem value="PMT">PMT</SelectItem>
                      <SelectItem value="ESCROW">Escrow</SelectItem>
                      <SelectItem value="AGENCY">Agency</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="create-currency">Currency</Label>
                  <Input id="create-currency" value={createForm.base_currency} onChange={(event) => setCreateForm((form) => ({ ...form, base_currency: event.target.value.toUpperCase() }))} />
                </div>
              </div>
              <Button className="w-full" disabled={!createForm.client_id || createMutation.isPending} onClick={() => createMutation.mutate()}>
                Create Account Stack
              </Button>
              {createMutation.error && <p className="text-sm text-red-600">{createMutation.error.message}</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Accounts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {accountsQuery.isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
              {!accountsQuery.isLoading && accountOptions.length === 0 && <p className="text-sm text-muted-foreground">No trust accounts loaded.</p>}
              {accountOptions.map((account) => (
                <button
                  key={account.account_id}
                  className={`w-full rounded-md border p-3 text-left text-sm hover:bg-muted ${selectedAccount === account.account_id ? "border-primary bg-muted" : ""}`}
                  onClick={() => {
                    setSelectedAccountId(account.account_id);
                    setSelectedSignerIds([]);
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{account.account_name}</span>
                    <Badge variant={account.account_status === "ACTIVE" ? "default" : "secondary"}>{account.account_status}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{account.account_id}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{account.product_type} / {account.base_currency}</p>
                </button>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Authority Check</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-[180px_160px_1fr_auto]">
              <div>
                <Label>Action</Label>
                <Select value={action} onValueChange={setAction}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="withdrawal">Withdrawal</SelectItem>
                    <SelectItem value="contribution">Contribution</SelectItem>
                    <SelectItem value="transfer">Transfer</SelectItem>
                    <SelectItem value="instructions">Instruction</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="amount">Amount</Label>
                <Input id="amount" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="100000" />
              </div>
              <div>
                <Label>Authorized Signers</Label>
                <div className="mt-2 grid gap-2 rounded-md border p-2">
                  {signers.length === 0 && <p className="text-xs text-muted-foreground">No authorized signers on this account.</p>}
                  {signers.map((party) => {
                    const partyId = Number(party.id);
                    const checked = selectedSignerIds.includes(partyId);
                    return (
                      <label key={partyId} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(value) => {
                            setSelectedSignerIds((current) => value
                              ? [...new Set([...current, partyId])]
                              : current.filter((id) => id !== partyId));
                          }}
                        />
                        <span>{text(party.legal_name)} <span className="text-xs text-muted-foreground">#{partyId}</span></span>
                      </label>
                    );
                  })}
                </div>
              </div>
              <Button className="mt-6 gap-2" disabled={!selectedAccount || authorityMutation.isPending} onClick={() => authorityMutation.mutate()}>
                <ShieldCheck className="h-4 w-4" />
                Check
              </Button>
              {authority && (
                <div className="md:col-span-4 rounded-md border p-3 text-sm">
                  <div className="flex items-center gap-2">
                    {authority.passed ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-red-600" />}
                    <span className="font-medium">{authority.passed ? "Authority satisfied" : "Authority failed"}</span>
                  </div>
                  <p className="mt-2 text-muted-foreground">
                    Required {authority.required_signatories}, provided {authority.provided_signatories}, valid {authority.valid_signatories}
                  </p>
                  {authority.failures.length > 0 && <p className="mt-2 text-red-600">{authority.failures.join("; ")}</p>}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              {detailQuery.isLoading && <p className="text-sm text-muted-foreground">Loading account detail...</p>}
              {!detailQuery.isLoading && !detail && <p className="text-sm text-muted-foreground">Select an account to view the foundation stack.</p>}
              {detail && (
                <Tabs defaultValue="settlement">
                  <TabsList className="grid w-full grid-cols-3 lg:grid-cols-6">
                    <TabsTrigger value="settlement">Settlement</TabsTrigger>
                    <TabsTrigger value="holding">Holding</TabsTrigger>
                    <TabsTrigger value="security">Security</TabsTrigger>
                    <TabsTrigger value="mandates">Mandates</TabsTrigger>
                    <TabsTrigger value="parties">Parties</TabsTrigger>
                    <TabsTrigger value="events">Events</TabsTrigger>
                  </TabsList>
                  <TabsContent value="settlement" className="mt-4">
                    <DataTable rows={detail.settlement_accounts} columns={["purpose", "account_no", "currency", "is_default", "account_status", "routing_bic"]} />
                  </TabsContent>
                  <TabsContent value="holding" className="mt-4">
                    <DataTable rows={detail.holding_accounts} columns={["account_type", "account_no", "currency", "balance_snapshot", "available_balance_snapshot", "account_status"]} />
                  </TabsContent>
                  <TabsContent value="security" className="mt-4">
                    <DataTable rows={detail.security_accounts} columns={["account_no", "depository", "currency", "account_status"]} />
                  </TabsContent>
                  <TabsContent value="mandates" className="mt-4">
                    <DataTable rows={detail.mandates} columns={["id", "mandate_type", "mandate_status", "effective_from", "signing_rule", "risk_limits"]} />
                  </TabsContent>
                  <TabsContent value="parties" className="mt-4">
                    <DataTable rows={detail.related_parties} columns={["id", "party_type", "legal_name", "is_authorized_signatory", "signing_limit", "authority_scope", "kyc_status"]} />
                  </TabsContent>
                  <TabsContent value="events" className="mt-4">
                    <DataTable rows={latestEvents} columns={["event_type", "event_at", "actor_id", "payload"]} />
                  </TabsContent>
                </Tabs>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
