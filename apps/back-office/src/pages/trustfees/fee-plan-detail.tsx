/**
 * Fee Plan Detail -- TrustFees Pro Phase 5
 *
 * Full detail view with all fields resolved, pricing binding section,
 * lifecycle timeline, tabbed future placeholder areas, and action buttons.
 */
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@ui/lib/queryClient";
import { apiUrl } from "@ui/lib/api-url";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/ui/card";
import { Badge } from "@ui/components/ui/badge";
import { Button } from "@ui/components/ui/button";
import { Input } from "@ui/components/ui/input";
import { Label } from "@ui/components/ui/label";
import { Separator } from "@ui/components/ui/separator";
import { Skeleton } from "@ui/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@ui/components/ui/dialog";
import { Textarea } from "@ui/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ui/components/ui/table";
import {
  ArrowLeft,
  Pencil,
  SendHorizontal,
  ShieldCheck,
  XCircle,
  Pause,
  ArrowRightLeft,
  Timer,
  Link2,
  Calculator,
  FileText,
  Layers,
  Receipt,
  Settings2,
} from "lucide-react";

/* ---------- Constants ---------- */
const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-800",
  PENDING_APPROVAL: "bg-amber-100 text-amber-800",
  ACTIVE: "bg-green-100 text-green-800",
  EXPIRED: "bg-red-100 text-red-800",
  SUSPENDED: "bg-orange-100 text-orange-800",
  SUPERSEDED: "bg-blue-100 text-blue-800",
};

/* ---------- Helpers ---------- */
const fmtDate = (d: string | null | undefined) => {
  if (!d) return "--";
  try {
    return new Date(d).toLocaleDateString("en-PH", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return d;
  }
};

const fmtDateTime = (d: string | null | undefined) => {
  if (!d) return "--";
  try {
    return new Date(d).toLocaleString("en-PH", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return d;
  }
};

const fmtPHP = (n: number | string | null | undefined) => {
  if (n == null) return "--";
  const num = typeof n === "string" ? parseFloat(n) : n;
  if (isNaN(num)) return "--";
  return num.toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  });
};

const bc = (key: string) => STATUS_COLORS[key] ?? "bg-muted text-foreground";

/* ========== Main Component ========== */
export default function FeePlanDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();

  // Dialogs
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rebindDialogOpen, setRebindDialogOpen] = useState(false);
  const [rejectComment, setRejectComment] = useState("");
  const [rebindVersion, setRebindVersion] = useState("");

  // Preview state
  const [previewAum, setPreviewAum] = useState("");
  const [previewTxn, setPreviewTxn] = useState("");
  const [previewResult, setPreviewResult] = useState<any>(null);

  // --- Query ---
  const planQ = useQuery<any>({
    queryKey: ["fee-plan-detail", id],
    queryFn: () => apiRequest("GET", apiUrl(`/api/v1/fee-plans/${id}`)),
    enabled: !!id,
    refetchInterval: 30_000,
  });

  const plan = planQ.data?.data;
  const isLoading = planQ.isLoading;

  // --- Mutations ---
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["fee-plan-detail", id] });
    qc.invalidateQueries({ queryKey: ["fee-plans"] });
  };

  const submitMut = useMutation({
    mutationFn: () => apiRequest("POST", apiUrl(`/api/v1/fee-plans/${id}/submit`)),
    onSuccess: invalidate,
  });

  const approveMut = useMutation({
    mutationFn: () =>
      apiRequest("POST", apiUrl(`/api/v1/fee-plans/${id}/approve`), {
        approverId: "system-approver",
      }),
    onSuccess: () => {
      invalidate();
      setApproveDialogOpen(false);
    },
  });

  const rejectMut = useMutation({
    mutationFn: (comment: string) =>
      apiRequest("POST", apiUrl(`/api/v1/fee-plans/${id}/reject`), {
        approverId: "system-approver",
        comment,
      }),
    onSuccess: () => {
      invalidate();
      setRejectDialogOpen(false);
      setRejectComment("");
    },
  });

  const suspendMut = useMutation({
    mutationFn: () => apiRequest("POST", apiUrl(`/api/v1/fee-plans/${id}/suspend`)),
    onSuccess: invalidate,
  });

  const supersedeMut = useMutation({
    mutationFn: () => apiRequest("POST", apiUrl(`/api/v1/fee-plans/${id}/supersede`)),
    onSuccess: invalidate,
  });

  const rebindMut = useMutation({
    mutationFn: (version: number) =>
      apiRequest("POST", apiUrl(`/api/v1/fee-plans/${id}/rebind-pricing`), {
        pricing_version_id: version,
      }),
    onSuccess: () => {
      invalidate();
      setRebindDialogOpen(false);
      setRebindVersion("");
    },
  });

  const previewMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiRequest("POST", apiUrl("/api/v1/fee-plans/compute-preview"), body),
    onSuccess: (data: any) => {
      setPreviewResult(data?.data ?? data);
    },
  });

  const handlePreview = () => {
    if (!id) return;
    previewMut.mutate({
      fee_plan_id: parseInt(id, 10),
      aum_value: previewAum ? parseFloat(previewAum) : undefined,
      transaction_amount: previewTxn ? parseFloat(previewTxn) : undefined,
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/operations/fee-plans")}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Back to Fee Plans
        </Button>
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">Fee plan not found.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/operations/fee-plans")}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Back
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{plan.fee_plan_code}</h1>
              <Badge className={bc(plan.plan_status)}>
                {plan.plan_status.replace(/_/g, " ")}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">{plan.fee_plan_name}</p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {plan.plan_status === "DRAFT" && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`/operations/fee-plans/${id}/edit`)}
              >
                <Pencil className="mr-1 h-3 w-3" /> Edit
              </Button>
              <Button
                size="sm"
                onClick={() => submitMut.mutate()}
                disabled={submitMut.isPending}
              >
                <SendHorizontal className="mr-1 h-3 w-3" />
                {submitMut.isPending ? "Submitting..." : "Submit for Approval"}
              </Button>
            </>
          )}

          {plan.plan_status === "PENDING_APPROVAL" && (
            <>
              <Button
                size="sm"
                onClick={() => setApproveDialogOpen(true)}
              >
                <ShieldCheck className="mr-1 h-3 w-3" /> Approve
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setRejectDialogOpen(true)}
              >
                <XCircle className="mr-1 h-3 w-3" /> Reject
              </Button>
            </>
          )}

          {plan.plan_status === "ACTIVE" && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => suspendMut.mutate()}
                disabled={suspendMut.isPending}
              >
                <Pause className="mr-1 h-3 w-3" />
                {suspendMut.isPending ? "Suspending..." : "Suspend"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => supersedeMut.mutate()}
                disabled={supersedeMut.isPending}
              >
                <ArrowRightLeft className="mr-1 h-3 w-3" />
                {supersedeMut.isPending ? "Superseding..." : "Supersede"}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Mutation errors */}
      {(submitMut.error || suspendMut.error || supersedeMut.error) && (
        <Card className="border-destructive">
          <CardContent className="pt-4">
            <p className="text-sm text-destructive">
              {(submitMut.error as any)?.message ||
                (suspendMut.error as any)?.message ||
                (supersedeMut.error as any)?.message}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Detail Cards */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Basic Info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="h-4 w-4" /> Basic Information
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <DetailRow label="Fee Plan Code" value={plan.fee_plan_code} />
              <DetailRow label="Fee Plan Name" value={plan.fee_plan_name} />
              <DetailRow label="Description" value={plan.description ?? "--"} />
              <DetailRow label="Charge Basis" value={plan.charge_basis} />
              <DetailRow label="Fee Type" value={plan.fee_type} />
              <DetailRow label="Source Party" value={plan.source_party?.replace(/_/g, " ")} />
              <DetailRow label="Target Party" value={plan.target_party?.replace(/_/g, " ")} />
              <DetailRow label="Comparison Basis" value={plan.comparison_basis?.replace(/_/g, " ")} />
              <DetailRow label="Value Basis" value={plan.value_basis?.replace(/_/g, " ")} />
              {plan.event_type && <DetailRow label="Event Type" value={plan.event_type} />}
              <DetailRow label="Jurisdiction" value={plan.jurisdiction_name ?? "--"} />
              {plan.template_name && <DetailRow label="Template" value={plan.template_name} />}
            </div>
          </CardContent>
        </Card>

        {/* Pricing Binding */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Link2 className="h-4 w-4" /> Pricing Binding
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2 text-sm">
              <DetailRow label="Pricing Definition" value={plan.pricing_definition_name ?? "None"} />
              <DetailRow label="Pricing Type" value={plan.pricing_type?.replace(/_/g, " ") ?? "--"} />
              <DetailRow label="Binding Mode" value={plan.pricing_binding_mode?.replace(/_/g, " ")} />
              <DetailRow
                label="Bound Version"
                value={plan.pricing_binding_version ? `v${plan.pricing_binding_version}` : "N/A (LATEST)"}
              />
            </div>

            {/* Pricing tiers preview */}
            {plan.pricing_tiers && (plan.pricing_tiers as any[]).length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Pricing Tiers:</p>
                <div className="overflow-x-auto rounded border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">From</TableHead>
                        <TableHead className="text-xs">To</TableHead>
                        <TableHead className="text-xs">Rate/Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(plan.pricing_tiers as any[]).map((tier: any, i: number) => (
                        <TableRow key={i}>
                          <TableCell className="text-xs">{fmtPHP(tier.from ?? 0)}</TableCell>
                          <TableCell className="text-xs">{tier.to ? fmtPHP(tier.to) : "Unlimited"}</TableCell>
                          <TableCell className="text-xs font-mono">
                            {tier.rate != null ? `${tier.rate}%` : fmtPHP(tier.amount ?? 0)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {plan.pricing_binding_mode === "STRICT" && plan.pricing_definition_id && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRebindDialogOpen(true)}
              >
                <Link2 className="mr-1 h-3 w-3" /> Re-bind Pricing Version
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Schedule & Thresholds */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Settings2 className="h-4 w-4" /> Schedule & Thresholds
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <DetailRow label="Eligibility" value={plan.eligibility_expression_name ?? "None (all eligible)"} />
              <DetailRow label="Accrual Schedule" value={plan.accrual_schedule_name ?? "None"} />
              <DetailRow label="Rate Type" value={plan.rate_type} />
              <DetailRow label="Min Charge" value={fmtPHP(plan.min_charge_amount)} />
              <DetailRow label="Max Charge" value={plan.max_charge_amount ? fmtPHP(plan.max_charge_amount) : "No max"} />
              <DetailRow label="Lower Threshold" value={plan.lower_threshold_pct ? `${plan.lower_threshold_pct}%` : "--"} />
              <DetailRow label="Upper Threshold" value={plan.upper_threshold_pct ? `${plan.upper_threshold_pct}%` : "--"} />
              <Separator />
              <DetailRow label="Include UITF" value={plan.aum_basis_include_uitf ? "Yes" : "No"} />
              <DetailRow label="Include 3P Funds" value={plan.aum_basis_include_3p_funds ? "Yes" : "No"} />
              <DetailRow label="MV Includes Accruals" value={plan.market_value_includes_accruals_override ? "Yes" : "No"} />
            </div>
          </CardContent>
        </Card>

        {/* Lifecycle Timeline */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Timer className="h-4 w-4" /> Lifecycle Timeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <DetailRow label="Effective Date" value={fmtDate(plan.effective_date)} />
              <DetailRow label="Expiry Date" value={fmtDate(plan.expiry_date)} />
              <Separator />
              <DetailRow label="Created" value={fmtDateTime(plan.created_at)} />
              <DetailRow label="Created By" value={plan.created_by ?? "--"} />
              <DetailRow label="Last Updated" value={fmtDateTime(plan.updated_at)} />
              <DetailRow label="Updated By" value={plan.updated_by ?? "--"} />
              <Separator />
              <DetailRow label="Current Status" value={plan.plan_status.replace(/_/g, " ")} />
            </div>

            {/* Status timeline visualization */}
            <div className="mt-4 flex items-center gap-1 flex-wrap">
              {["DRAFT", "PENDING_APPROVAL", "ACTIVE"].map((status, i) => {
                const isCurrent = plan.plan_status === status;
                const isPast =
                  (status === "DRAFT" && ["PENDING_APPROVAL", "ACTIVE", "EXPIRED", "SUSPENDED", "SUPERSEDED"].includes(plan.plan_status)) ||
                  (status === "PENDING_APPROVAL" && ["ACTIVE", "EXPIRED", "SUSPENDED", "SUPERSEDED"].includes(plan.plan_status));
                return (
                  <div key={status} className="flex items-center gap-1">
                    {i > 0 && (
                      <div
                        className={`h-0.5 w-6 ${
                          isPast || isCurrent ? "bg-primary" : "bg-muted"
                        }`}
                      />
                    )}
                    <div
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        isCurrent
                          ? bc(status)
                          : isPast
                            ? "bg-primary/20 text-primary"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {status.replace(/_/g, " ")}
                    </div>
                  </div>
                );
              })}
              {["EXPIRED", "SUSPENDED", "SUPERSEDED"].includes(plan.plan_status) && (
                <div className="flex items-center gap-1">
                  <div className="h-0.5 w-6 bg-muted" />
                  <Badge className={bc(plan.plan_status)}>
                    {plan.plan_status.replace(/_/g, " ")}
                  </Badge>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Live Calculation Preview */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Calculator className="h-4 w-4" /> Live Fee Calculation Preview
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-xs">AUM Value (PHP)</Label>
              <Input
                type="number"
                step="0.01"
                value={previewAum}
                onChange={(e) => setPreviewAum(e.target.value)}
                placeholder="e.g. 10000000"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Transaction Amount (PHP)</Label>
              <Input
                type="number"
                step="0.01"
                value={previewTxn}
                onChange={(e) => setPreviewTxn(e.target.value)}
                placeholder="e.g. 500000"
              />
            </div>
            <div className="flex items-end">
              <Button size="sm" onClick={handlePreview} disabled={previewMut.isPending}>
                <Calculator className="mr-1 h-3 w-3" />
                {previewMut.isPending ? "Calculating..." : "Calculate Preview"}
              </Button>
            </div>
          </div>

          {previewResult && (
            <div className="space-y-3">
              <div className="flex items-center gap-4">
                <div className="rounded-lg bg-primary/10 px-4 py-3">
                  <p className="text-xs text-muted-foreground">Computed Fee</p>
                  <p className="text-2xl font-bold text-primary">
                    {fmtPHP(previewResult.computed_fee)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Pricing Type</p>
                  <Badge variant="outline">
                    {previewResult.pricing_type?.replace(/_/g, " ")}
                  </Badge>
                </div>
              </div>

              {previewResult.breakdown && previewResult.breakdown.length > 0 && (
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Tier</TableHead>
                        <TableHead className="text-xs">From</TableHead>
                        <TableHead className="text-xs">To</TableHead>
                        <TableHead className="text-xs">Rate/Amount</TableHead>
                        <TableHead className="text-xs text-right">Computed</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewResult.breakdown.map((b: any, i: number) => (
                        <TableRow key={i}>
                          <TableCell className="text-xs font-mono">{b.tier}</TableCell>
                          <TableCell className="text-xs">{fmtPHP(b.from)}</TableCell>
                          <TableCell className="text-xs">{fmtPHP(b.to)}</TableCell>
                          <TableCell className="text-xs font-mono">
                            {previewResult.pricing_type?.includes("RATE") || previewResult.pricing_type === "FIXED_RATE"
                              ? `${b.rate_or_amount}%`
                              : fmtPHP(b.rate_or_amount)}
                          </TableCell>
                          <TableCell className="text-xs text-right font-mono">
                            {fmtPHP(b.computed)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}

          {previewMut.error && (
            <div className="rounded-md border border-destructive p-3">
              <p className="text-sm text-destructive">
                {(previewMut.error as any)?.message ?? "Preview calculation failed"}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bottom Tabs */}
      <Tabs defaultValue="accruals">
        <TabsList>
          <TabsTrigger value="accruals" className="flex items-center gap-1">
            <Layers className="h-3 w-3" /> Accruals
          </TabsTrigger>
          <TabsTrigger value="invoices" className="flex items-center gap-1">
            <Receipt className="h-3 w-3" /> Invoices
          </TabsTrigger>
          <TabsTrigger value="overrides" className="flex items-center gap-1">
            <Settings2 className="h-3 w-3" /> Overrides
          </TabsTrigger>
        </TabsList>
        <TabsContent value="accruals">
          <Card>
            <CardContent className="pt-6">
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Accrual Date</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Base Amount</TableHead>
                      <TableHead>Computed Fee</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                        No accruals generated yet. Accrual data will appear here once the plan is active and the accrual engine runs.
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="invoices">
          <Card>
            <CardContent className="pt-6">
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                        No invoices generated yet. Invoice data will appear here once accruals are aggregated into invoices.
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="overrides">
          <Card>
            <CardContent className="pt-6">
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Override ID</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Field</TableHead>
                      <TableHead>Original</TableHead>
                      <TableHead>Override Value</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                        No overrides configured. Per-client overrides will appear here once created.
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Approve Dialog */}
      <Dialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Fee Plan</DialogTitle>
            <DialogDescription>
              Are you sure you want to approve fee plan{" "}
              <span className="font-mono font-semibold">{plan.fee_plan_code}</span>?
              This will transition it to ACTIVE status.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => approveMut.mutate()} disabled={approveMut.isPending}>
              {approveMut.isPending ? "Approving..." : "Approve"}
            </Button>
          </DialogFooter>
          {approveMut.error && (
            <div className="rounded-md border border-destructive p-3 mt-2">
              <p className="text-sm text-destructive">
                {(approveMut.error as any)?.message ?? "Approval failed"}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Fee Plan</DialogTitle>
            <DialogDescription>
              Provide a reason for rejecting fee plan{" "}
              <span className="font-mono font-semibold">{plan.fee_plan_code}</span>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Rejection Comment *</Label>
            <Textarea
              value={rejectComment}
              onChange={(e) => setRejectComment(e.target.value)}
              placeholder="Reason for rejection..."
              rows={3}
            />
            {/* GAP-C02: 10-char minimum validation */}
            {rejectComment.length > 0 && rejectComment.trim().length < 10 && (
              <p className="text-xs text-destructive">
                Minimum 10 characters required ({rejectComment.trim().length}/10)
              </p>
            )}
            {rejectComment.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Minimum 10 characters required
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => rejectMut.mutate(rejectComment)}
              disabled={rejectMut.isPending || rejectComment.trim().length < 10}
            >
              {rejectMut.isPending ? "Rejecting..." : "Reject"}
            </Button>
          </DialogFooter>
          {rejectMut.error && (
            <div className="rounded-md border border-destructive p-3 mt-2">
              <p className="text-sm text-destructive">
                {(rejectMut.error as any)?.message ?? "Rejection failed"}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Re-bind Pricing Dialog */}
      <Dialog open={rebindDialogOpen} onOpenChange={setRebindDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Re-bind Pricing Version</DialogTitle>
            <DialogDescription>
              Enter the new pricing version number to bind this fee plan to.
              Current version: {plan.pricing_binding_version ? `v${plan.pricing_binding_version}` : "N/A"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>New Pricing Version</Label>
            <Input
              type="number"
              step="1"
              value={rebindVersion}
              onChange={(e) => setRebindVersion(e.target.value)}
              placeholder="e.g. 3"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRebindDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => rebindMut.mutate(parseInt(rebindVersion, 10))}
              disabled={rebindMut.isPending || !rebindVersion}
            >
              {rebindMut.isPending ? "Re-binding..." : "Re-bind"}
            </Button>
          </DialogFooter>
          {rebindMut.error && (
            <div className="rounded-md border border-destructive p-3 mt-2">
              <p className="text-sm text-destructive">
                {(rebindMut.error as any)?.message ?? "Re-bind failed"}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------- Helper sub-component ---------- */
function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
