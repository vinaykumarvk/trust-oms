/**
 * loan-detail.tsx — Loan Facility Detail Page
 *
 * Tabbed view: Overview, Payments, Amortization, Collateral, MPCs,
 * Documents, Amendments, Receivables.
 */

import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/ui/card";
import { Button } from "@ui/components/ui/button";
import { Badge } from "@ui/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@ui/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@ui/components/ui/sheet";
import { Input } from "@ui/components/ui/input";
import { Label } from "@ui/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ui/components/ui/select";
import { Skeleton } from "@ui/components/ui/skeleton";
import { useToast } from "@ui/hooks/use-toast";
import {
  ArrowLeft, CheckCircle, Play, XCircle, DollarSign,
  Plus, RefreshCw, FileText, Shield, Receipt,
} from "lucide-react";

const API = "/api/v1/loans";

function fmt(v: string | number | null | undefined): string {
  const n = typeof v === "string" ? parseFloat(v) : (v ?? 0);
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 2 }).format(n);
}

function statusColor(s: string) {
  const m: Record<string, string> = {
    DRAFT: "bg-gray-100 text-gray-800", PENDING_APPROVAL: "bg-yellow-100 text-yellow-800",
    APPROVED: "bg-blue-100 text-blue-800", ACTIVE: "bg-green-100 text-green-800",
    MATURED: "bg-purple-100 text-purple-800", DEFAULTED: "bg-red-100 text-red-800",
    CLOSED: "bg-gray-200 text-gray-600", SCHEDULED: "bg-gray-100 text-gray-700",
    DUE: "bg-yellow-100 text-yellow-700", OVERDUE: "bg-red-100 text-red-700",
    PAID: "bg-green-100 text-green-700", CANCELLED: "bg-gray-200 text-gray-500",
  };
  return <Badge className={m[s] ?? "bg-gray-100"}>{s.replace(/_/g, " ")}</Badge>;
}

export default function LoanDetail() {
  const { facilityId } = useParams<{ facilityId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState("overview");
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentForm, setPaymentForm] = useState<Record<string, any>>({
    payment_type: "PRINCIPAL_AND_INTEREST", principal_amount: "", interest_amount: "",
    scheduled_date: "", actual_date: new Date().toISOString().split("T")[0],
  });

  // ── Queries ─────────────────────────────────────────────────────────────────
  const facilityQ = useQuery({
    queryKey: ["loans", "detail", facilityId],
    queryFn: () => fetch(`${API}/${facilityId}`).then((r) => r.json()),
    enabled: !!facilityId,
  });

  const paymentsQ = useQuery({
    queryKey: ["loans", "payments", facilityId],
    queryFn: () => fetch(`${API}/${facilityId}/payments`).then((r) => r.json()),
    enabled: !!facilityId && tab === "payments",
  });

  const amortQ = useQuery({
    queryKey: ["loans", "amortization", facilityId],
    queryFn: () => fetch(`${API}/${facilityId}/amortization`).then((r) => r.json()),
    enabled: !!facilityId && tab === "amortization",
  });

  const collateralQ = useQuery({
    queryKey: ["loans", "collaterals", facilityId],
    queryFn: () => fetch(`${API}/${facilityId}/collaterals`).then((r) => r.json()),
    enabled: !!facilityId && tab === "collateral",
  });

  const mpcQ = useQuery({
    queryKey: ["loans", "mpcs", facilityId],
    queryFn: () => fetch(`${API}/${facilityId}/mpcs`).then((r) => r.json()),
    enabled: !!facilityId && tab === "mpcs",
  });

  const amendQ = useQuery({
    queryKey: ["loans", "amendments", facilityId],
    queryFn: () => fetch(`${API}/${facilityId}/amendments`).then((r) => r.json()),
    enabled: !!facilityId && tab === "amendments",
  });

  const docsQ = useQuery({
    queryKey: ["loans", "documents", facilityId],
    queryFn: () => fetch(`${API}/${facilityId}/documents`).then((r) => r.json()),
    enabled: !!facilityId && tab === "documents",
  });

  // ── Mutations ───────────────────────────────────────────────────────────────
  const action = (path: string, method = "POST") =>
    useMutation({
      mutationFn: (body?: any) =>
        fetch(`${API}/${facilityId}${path}`, {
          method, headers: { "Content-Type": "application/json" },
          body: body ? JSON.stringify(body) : undefined,
        }).then((r) => { if (!r.ok) throw new Error("Failed"); return r.json(); }),
      onSuccess: () => { qc.invalidateQueries({ queryKey: ["loans"] }); toast({ title: "Success" }); },
      onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
    });

  const submitM = action("/submit");
  const approveM = action("/approve");
  const activateM = action("/activate");
  const closeM = action("/close");
  const genAmortM = action("/amortization/generate");
  const recordPayM = useMutation({
    mutationFn: (body: any) =>
      fetch(`${API}/${facilityId}/payments`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      }).then((r) => { if (!r.ok) throw new Error("Failed"); return r.json(); }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["loans"] });
      toast({ title: "Payment recorded" });
      setPaymentOpen(false);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const f = facilityQ.data;

  if (facilityQ.isLoading) return <div className="space-y-4 p-6">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>;
  if (!f || f.error) return <div className="p-6 text-red-600">Facility not found</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/corporate-trust/loans")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{f.facility_name}</h1>
            {statusColor(f.loan_status)}
          </div>
          <p className="text-sm text-muted-foreground font-mono">{f.facility_id} | {f.loan_type?.replace(/_/g, " ")} | {f.currency}</p>
        </div>
        <div className="flex gap-2">
          {f.loan_status === "DRAFT" && (
            <Button size="sm" onClick={() => submitM.mutate()}>
              <CheckCircle className="h-4 w-4 mr-1" /> Submit
            </Button>
          )}
          {f.loan_status === "PENDING_APPROVAL" && (
            <Button size="sm" onClick={() => approveM.mutate()}>
              <CheckCircle className="h-4 w-4 mr-1" /> Approve
            </Button>
          )}
          {f.loan_status === "APPROVED" && (
            <Button size="sm" onClick={() => activateM.mutate()}>
              <Play className="h-4 w-4 mr-1" /> Activate
            </Button>
          )}
          {f.loan_status === "ACTIVE" && (
            <>
              <Button size="sm" variant="outline" onClick={() => setPaymentOpen(true)}>
                <DollarSign className="h-4 w-4 mr-1" /> Record Payment
              </Button>
              <Button size="sm" variant="outline" onClick={() => closeM.mutate()}>
                <XCircle className="h-4 w-4 mr-1" /> Close
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Facility Amount</CardTitle></CardHeader>
          <CardContent><div className="text-xl font-bold">{fmt(f.facility_amount)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Outstanding Principal</CardTitle></CardHeader>
          <CardContent><div className="text-xl font-bold">{fmt(f.outstanding_principal)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Available</CardTitle></CardHeader>
          <CardContent><div className="text-xl font-bold">{fmt(f.available_amount)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Interest Rate</CardTitle></CardHeader>
          <CardContent><div className="text-xl font-bold">{parseFloat(f.interest_rate).toFixed(2)}% {f.interest_type}</div></CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="amortization">Amortization</TabsTrigger>
          <TabsTrigger value="collateral">Collateral</TabsTrigger>
          <TabsTrigger value="mpcs">MPCs</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="amendments">Amendments</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview">
          <Card>
            <CardContent className="pt-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <h3 className="font-semibold">Facility Details</h3>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <span className="text-muted-foreground">Amortization</span><span>{f.amortization_type?.replace(/_/g, " ")}</span>
                    <span className="text-muted-foreground">Payment Freq.</span><span>{f.payment_frequency?.replace(/_/g, " ")}</span>
                    <span className="text-muted-foreground">Day Count</span><span>{f.interest_basis?.replace(/_/g, "/")}</span>
                    <span className="text-muted-foreground">Effective Date</span><span>{f.effective_date}</span>
                    <span className="text-muted-foreground">Maturity Date</span><span>{f.maturity_date}</span>
                    <span className="text-muted-foreground">Trustee Role</span><span>{f.trustee_role ?? "—"}</span>
                    <span className="text-muted-foreground">Syndicated</span><span>{f.syndication_flag ? "Yes" : "No"}</span>
                  </div>
                </div>
                <div className="space-y-3">
                  <h3 className="font-semibold">Financial Summary</h3>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <span className="text-muted-foreground">Disbursed</span><span>{fmt(f.disbursed_amount)}</span>
                    <span className="text-muted-foreground">Penalty Rate</span><span>{f.penalty_rate ? `${parseFloat(f.penalty_rate).toFixed(2)}%` : "—"}</span>
                    <span className="text-muted-foreground">Pretermination</span><span>{f.pretermination_penalty_rate ? `${parseFloat(f.pretermination_penalty_rate).toFixed(2)}%` : "—"}</span>
                    <span className="text-muted-foreground">Grace Period</span><span>{f.grace_period_days ? `${f.grace_period_days} days` : "—"}</span>
                    <span className="text-muted-foreground">Benchmark</span><span>{f.benchmark_rate ?? "—"}</span>
                    <span className="text-muted-foreground">Spread</span><span>{f.spread ? `${parseFloat(f.spread).toFixed(2)}%` : "—"}</span>
                  </div>
                </div>
              </div>
              {f.purpose && (
                <div className="mt-4">
                  <h3 className="font-semibold mb-1">Purpose</h3>
                  <p className="text-sm text-muted-foreground">{f.purpose}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Payments Tab */}
        <TabsContent value="payments">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Payment History</CardTitle>
              <Button size="sm" onClick={() => setPaymentOpen(true)}><Plus className="h-4 w-4 mr-1" /> Record Payment</Button>
            </CardHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Payment ID</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Scheduled</TableHead>
                  <TableHead>Actual</TableHead>
                  <TableHead className="text-right">Principal</TableHead>
                  <TableHead className="text-right">Interest</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(paymentsQ.data?.data ?? []).map((p: any) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-sm">{p.payment_id}</TableCell>
                    <TableCell>{p.payment_type}</TableCell>
                    <TableCell>{statusColor(p.payment_status)}</TableCell>
                    <TableCell>{p.scheduled_date ?? "—"}</TableCell>
                    <TableCell>{p.actual_date ?? "—"}</TableCell>
                    <TableCell className="text-right">{fmt(p.principal_amount)}</TableCell>
                    <TableCell className="text-right">{fmt(p.interest_amount)}</TableCell>
                    <TableCell className="text-right font-medium">{fmt(p.total_amount)}</TableCell>
                  </TableRow>
                ))}
                {paymentsQ.isLoading && <TableRow><TableCell colSpan={8}><Skeleton className="h-4" /></TableCell></TableRow>}
                {!paymentsQ.isLoading && (paymentsQ.data?.data ?? []).length === 0 && (
                  <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground">No payments recorded</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* Amortization Tab */}
        <TabsContent value="amortization">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Amortization Schedule</CardTitle>
              <Button size="sm" onClick={() => genAmortM.mutate()} disabled={genAmortM.isPending}>
                <RefreshCw className="h-4 w-4 mr-1" /> {genAmortM.isPending ? "Generating..." : "Generate Schedule"}
              </Button>
            </CardHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Payment Date</TableHead>
                  <TableHead className="text-right">Opening Bal.</TableHead>
                  <TableHead className="text-right">Principal</TableHead>
                  <TableHead className="text-right">Interest</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Closing Bal.</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(amortQ.data ?? []).map((a: any) => (
                  <TableRow key={a.id}>
                    <TableCell>{a.period_number}</TableCell>
                    <TableCell>{a.payment_date}</TableCell>
                    <TableCell className="text-right">{fmt(a.beginning_balance)}</TableCell>
                    <TableCell className="text-right">{fmt(a.principal_payment)}</TableCell>
                    <TableCell className="text-right">{fmt(a.interest_payment)}</TableCell>
                    <TableCell className="text-right font-medium">{fmt(a.total_payment)}</TableCell>
                    <TableCell className="text-right">{fmt(a.ending_balance)}</TableCell>
                    <TableCell>{statusColor(a.payment_status ?? a.amort_payment_status ?? "SCHEDULED")}</TableCell>
                  </TableRow>
                ))}
                {amortQ.isLoading && <TableRow><TableCell colSpan={8}><Skeleton className="h-4" /></TableCell></TableRow>}
                {!amortQ.isLoading && (amortQ.data ?? []).length === 0 && (
                  <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground">No schedule generated yet. Click "Generate Schedule" to create one.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* Collateral Tab */}
        <TabsContent value="collateral">
          <Card>
            <CardHeader><CardTitle><Shield className="inline h-5 w-5 mr-1" /> Collateral Registry</CardTitle></CardHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Appraised Value</TableHead>
                  <TableHead className="text-right">Market Value</TableHead>
                  <TableHead>LTV</TableHead>
                  <TableHead>Location</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(collateralQ.data ?? []).map((c: any) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono text-sm">{c.collateral_id}</TableCell>
                    <TableCell>{c.collateral_type?.replace(/_/g, " ")}</TableCell>
                    <TableCell>{c.description ?? "—"}</TableCell>
                    <TableCell className="text-right">{fmt(c.appraised_value)}</TableCell>
                    <TableCell className="text-right">{fmt(c.market_value)}</TableCell>
                    <TableCell>{c.ltv_ratio ? `${parseFloat(c.ltv_ratio).toFixed(1)}%` : "—"}</TableCell>
                    <TableCell>{c.custodian ?? c.location ?? "—"}</TableCell>
                  </TableRow>
                ))}
                {!collateralQ.isLoading && (collateralQ.data ?? []).length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">No collaterals registered</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* MPCs Tab */}
        <TabsContent value="mpcs">
          <Card>
            <CardHeader><CardTitle><Receipt className="inline h-5 w-5 mr-1" /> Mortgage Participation Certificates</CardTitle></CardHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>MPC ID</TableHead>
                  <TableHead>Certificate #</TableHead>
                  <TableHead>Holder</TableHead>
                  <TableHead className="text-right">Face Value</TableHead>
                  <TableHead>Rate</TableHead>
                  <TableHead>Issue Date</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(mpcQ.data ?? []).map((m: any) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-mono text-sm">{m.mpc_id}</TableCell>
                    <TableCell>{m.certificate_number}</TableCell>
                    <TableCell>{m.holder_client_id ?? "—"}</TableCell>
                    <TableCell className="text-right">{fmt(m.face_value)}</TableCell>
                    <TableCell>{m.interest_rate ? `${parseFloat(m.interest_rate).toFixed(2)}%` : "—"}</TableCell>
                    <TableCell>{m.issue_date}</TableCell>
                    <TableCell>{statusColor(m.mpc_status)}</TableCell>
                  </TableRow>
                ))}
                {!mpcQ.isLoading && (mpcQ.data ?? []).length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">No MPCs issued</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* Documents Tab */}
        <TabsContent value="documents">
          <Card>
            <CardHeader><CardTitle><FileText className="inline h-5 w-5 mr-1" /> Document Registry</CardTitle></CardHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Document</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Received</TableHead>
                  <TableHead>Expiry</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Original</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(docsQ.data ?? []).map((d: any) => (
                  <TableRow key={d.id}>
                    <TableCell>{d.document_name}</TableCell>
                    <TableCell>{d.document_type?.replace(/_/g, " ")}</TableCell>
                    <TableCell>{d.received_date ?? "—"}</TableCell>
                    <TableCell>{d.expiry_date ?? "—"}</TableCell>
                    <TableCell>{d.custodian_location ?? d.vault_reference ?? "—"}</TableCell>
                    <TableCell>{d.is_original ? "Yes" : "Copy"}</TableCell>
                  </TableRow>
                ))}
                {!docsQ.isLoading && (docsQ.data ?? []).length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">No documents tracked</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* Amendments Tab */}
        <TabsContent value="amendments">
          <Card>
            <CardHeader><CardTitle>Term Amendments</CardTitle></CardHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Field</TableHead>
                  <TableHead>Old Value</TableHead>
                  <TableHead>New Value</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(amendQ.data ?? []).map((a: any) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-mono text-sm">{a.amendment_id}</TableCell>
                    <TableCell>{a.amendment_date}</TableCell>
                    <TableCell>{a.amendment_type?.replace(/_/g, " ")}</TableCell>
                    <TableCell>{a.field_changed ?? "—"}</TableCell>
                    <TableCell>{a.old_value ?? "—"}</TableCell>
                    <TableCell>{a.new_value ?? "—"}</TableCell>
                    <TableCell>{a.reason ?? "—"}</TableCell>
                  </TableRow>
                ))}
                {!amendQ.isLoading && (amendQ.data ?? []).length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">No amendments recorded</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Record Payment Sheet */}
      <Sheet open={paymentOpen} onOpenChange={setPaymentOpen}>
        <SheetContent className="sm:max-w-md">
          <SheetHeader><SheetTitle>Record Payment</SheetTitle></SheetHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label>Payment Type</Label>
              <Select value={paymentForm.payment_type} onValueChange={(v) => setPaymentForm({ ...paymentForm, payment_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PRINCIPAL_AND_INTEREST">Principal + Interest</SelectItem>
                  <SelectItem value="PRINCIPAL">Principal Only</SelectItem>
                  <SelectItem value="INTEREST">Interest Only</SelectItem>
                  <SelectItem value="PREPAYMENT">Prepayment</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Principal Amount</Label><Input type="number" value={paymentForm.principal_amount} onChange={(e) => setPaymentForm({ ...paymentForm, principal_amount: e.target.value })} /></div>
              <div><Label>Interest Amount</Label><Input type="number" value={paymentForm.interest_amount} onChange={(e) => setPaymentForm({ ...paymentForm, interest_amount: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Scheduled Date</Label><Input type="date" value={paymentForm.scheduled_date} onChange={(e) => setPaymentForm({ ...paymentForm, scheduled_date: e.target.value })} /></div>
              <div><Label>Actual Date</Label><Input type="date" value={paymentForm.actual_date} onChange={(e) => setPaymentForm({ ...paymentForm, actual_date: e.target.value })} /></div>
            </div>
            <Button className="w-full" onClick={() => recordPayM.mutate(paymentForm)} disabled={recordPayM.isPending}>
              {recordPayM.isPending ? "Recording..." : "Record Payment"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
