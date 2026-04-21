/**
 * Ad-hoc Fee Capture -- TrustFees Pro Phase 7
 *
 * UI page for capturing one-off (ad-hoc) fee accruals:
 *   - Form: customer_id, portfolio_id, fee_type, amount, currency, reason
 *   - Recent ad-hoc fees table
 *   - Dark mode support
 */
import { useState } from "react";
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
import { Textarea } from "@ui/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ui/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ui/components/ui/table";
import {
  PlusCircle,
  RefreshCw,
  CheckCircle,
} from "lucide-react";

/* ---------- Constants ---------- */

const FEE_TYPES = [
  { value: "CUSTODY", label: "Custody" },
  { value: "MANAGEMENT", label: "Management" },
  { value: "PERFORMANCE", label: "Performance" },
  { value: "SUBSCRIPTION", label: "Subscription" },
  { value: "REDEMPTION", label: "Redemption" },
  { value: "COMMISSION", label: "Commission" },
  { value: "TAX", label: "Tax" },
  { value: "TRUST", label: "Trust" },
  { value: "ESCROW", label: "Escrow" },
  { value: "ADMIN", label: "Admin" },
  { value: "OTHER", label: "Other" },
];

const CURRENCIES = ["PHP", "USD", "EUR", "GBP", "JPY", "SGD", "HKD"];

const STATUS_COLORS: Record<string, string> = {
  OPEN: "bg-blue-100 text-blue-800",
  ACCOUNTED: "bg-green-100 text-green-800",
  INVOICED: "bg-purple-100 text-purple-800",
  REVERSED: "bg-red-100 text-red-800",
};

/* ---------- Helpers ---------- */

const fmtDate = (d: string | null) => {
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

const fmtCurrency = (amt: string | number | null, currency = "PHP") => {
  if (amt === null || amt === undefined) return "--";
  const n = typeof amt === "string" ? parseFloat(amt) : amt;
  if (isNaN(n)) return "--";
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(n);
};

const bc = (key: string) => STATUS_COLORS[key] ?? "bg-muted text-foreground";

/* ---------- Types ---------- */

interface AdhocFee {
  id: number;
  customer_id: string;
  portfolio_id: string | null;
  applied_fee: string;
  currency: string;
  accrual_date: string;
  accrual_status: string;
  fee_plan_code: string | null;
  fee_type: string | null;
  created_at: string;
}

interface AdhocListResponse {
  data: AdhocFee[];
  total: number;
  page: number;
  pageSize: number;
}

/* ========== Main Component ========== */
export default function AdhocFeeCapture() {
  const qc = useQueryClient();

  // Form state
  const [customerId, setCustomerId] = useState("");
  const [portfolioId, setPortfolioId] = useState("");
  const [feeType, setFeeType] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("PHP");
  const [reason, setReason] = useState("");
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // List
  const [page, setPage] = useState(1);
  const pageSize = 25;

  // --- Queries ---
  const listQ = useQuery<AdhocListResponse>({
    queryKey: ["tfp-adhoc-fees", page],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      return apiRequest("GET", apiUrl(`/api/v1/tfp-adhoc-fees?${params.toString()}`));
    },
    refetchInterval: 30_000,
  });

  const fees = listQ.data?.data ?? [];
  const total = listQ.data?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  // --- Mutations ---
  const captureMut = useMutation({
    mutationFn: (body: {
      customer_id: string;
      portfolio_id?: string;
      fee_type: string;
      amount: number;
      currency: string;
      reason: string;
    }) => apiRequest("POST", apiUrl("/api/v1/tfp-adhoc-fees"), body),
    onSuccess: (data: { data: { message: string } }) => {
      setSuccessMsg(data.data.message);
      setCustomerId("");
      setPortfolioId("");
      setFeeType("");
      setAmount("");
      setReason("");
      qc.invalidateQueries({ queryKey: ["tfp-adhoc-fees"] });
      // Auto-clear success message after 5 seconds
      setTimeout(() => setSuccessMsg(null), 5000);
    },
  });

  const handleSubmit = () => {
    if (!customerId || !feeType || !amount || !reason) return;
    setSuccessMsg(null);
    captureMut.mutate({
      customer_id: customerId,
      portfolio_id: portfolioId || undefined,
      fee_type: feeType,
      amount: parseFloat(amount),
      currency,
      reason,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <PlusCircle className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ad-hoc Fee Capture</h1>
          <p className="text-sm text-muted-foreground">
            Record one-off fee charges that will be included in the next invoice cycle
          </p>
        </div>
      </div>

      {/* Capture Form */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Capture Ad-hoc Fee</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label>Customer ID *</Label>
              <Input
                placeholder="e.g., CL-001"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Portfolio ID</Label>
              <Input
                placeholder="Optional"
                value={portfolioId}
                onChange={(e) => setPortfolioId(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Fee Type *</Label>
              <Select value={feeType} onValueChange={setFeeType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select fee type..." />
                </SelectTrigger>
                <SelectContent>
                  {FEE_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Amount *</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Currency *</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Reason *</Label>
            <Textarea
              placeholder="Describe the reason for this ad-hoc fee..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={handleSubmit}
              disabled={
                captureMut.isPending ||
                !customerId ||
                !feeType ||
                !amount ||
                !reason ||
                parseFloat(amount) <= 0
              }
            >
              {captureMut.isPending ? "Submitting..." : "Submit Ad-hoc Fee"}
            </Button>
          </div>

          {captureMut.error && (
            <div className="rounded-md border border-destructive p-3">
              <p className="text-sm text-destructive">
                {(captureMut.error as any)?.message ?? "Failed to capture ad-hoc fee"}
              </p>
            </div>
          )}

          {successMsg && (
            <div className="flex items-center gap-2 rounded-md border border-green-500/30 bg-green-50 p-3">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <p className="text-sm text-green-700">{successMsg}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Separator />

      {/* Recent Ad-hoc Fees Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Recent Ad-hoc Fees</CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {total} record{total !== 1 ? "s" : ""}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => listQ.refetch()}
                disabled={listQ.isFetching}
              >
                <RefreshCw className={`h-4 w-4 ${listQ.isFetching ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Portfolio</TableHead>
                  <TableHead>Fee Type</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Currency</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listQ.isLoading ? (
                  <>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 8 }).map((_, j) => (
                          <TableCell key={j}>
                            <Skeleton className="h-4 w-16" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </>
                ) : fees.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                      No ad-hoc fees found
                    </TableCell>
                  </TableRow>
                ) : (
                  fees.map((fee) => (
                    <TableRow key={fee.id}>
                      <TableCell className="font-mono text-sm">{fee.id}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {fmtDate(fee.accrual_date)}
                      </TableCell>
                      <TableCell className="text-sm">{fee.customer_id}</TableCell>
                      <TableCell className="text-sm">{fee.portfolio_id ?? "--"}</TableCell>
                      <TableCell className="text-sm">{fee.fee_type ?? "--"}</TableCell>
                      <TableCell className="text-right font-mono text-sm font-medium">
                        {fmtCurrency(fee.applied_fee, fee.currency)}
                      </TableCell>
                      <TableCell className="text-sm">{fee.currency}</TableCell>
                      <TableCell>
                        <Badge className={bc(fee.accrual_status)}>
                          {fee.accrual_status}
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
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
