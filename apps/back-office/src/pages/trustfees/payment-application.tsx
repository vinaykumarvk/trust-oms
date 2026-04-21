/**
 * Payment Application -- TrustFees Pro Phase 7
 *
 * UI page for recording payments against trust fee invoices:
 *   - Invoice search by number or customer
 *   - Selected invoice details with remaining balance
 *   - Payment form with method selection
 *   - Payment history table for selected invoice
 *   - Progress bar showing paid vs remaining
 *   - Dark mode support
 */
import { useState, useEffect } from "react";
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
  CreditCard,
  Search,
  RefreshCw,
  CheckCircle,
  XCircle,
  RotateCcw,
} from "lucide-react";

/* ---------- Constants ---------- */

const PAYMENT_METHODS = [
  { value: "DEBIT_MEMO", label: "Debit Memo" },
  { value: "CHECK", label: "Check" },
  { value: "PESONET", label: "PESONet" },
  { value: "INSTAPAY", label: "InstaPay" },
  { value: "SWIFT", label: "SWIFT" },
  { value: "INTERNAL_JV", label: "Internal JV" },
];

const CURRENCIES = ["PHP", "USD", "EUR", "GBP", "JPY", "SGD", "HKD"];

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

const todayStr = () => new Date().toISOString().split("T")[0];

/* ---------- Types ---------- */

interface Invoice {
  id: number;
  invoice_number: string;
  customer_id: string;
  currency: string;
  total_amount: string;
  tax_amount: string;
  grand_total: string;
  invoice_date: string;
  due_date: string;
  invoice_status: string;
}

interface InvoiceDetail extends Invoice {
  lines: any[];
  payments: Payment[];
  paid_amount: number;
  remaining_balance: number;
}

interface Payment {
  id: number;
  amount: string;
  currency: string;
  payment_date: string;
  method: string;
  reference_no: string;
  payment_status: string;
  created_at: string;
}

interface PaymentResult {
  payment: Payment;
  invoice_status: string;
  total_paid: number;
  remaining_balance: number;
  over_payment: boolean;
}

/* ========== Main Component ========== */
export default function PaymentApplication() {
  const qc = useQueryClient();

  // Search
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  // Selected invoice
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(null);

  // Payment form
  const [payAmount, setPayAmount] = useState("");
  const [payCurrency, setPayCurrency] = useState("PHP");
  const [payDate, setPayDate] = useState(todayStr());
  const [payMethod, setPayMethod] = useState("");
  const [payReference, setPayReference] = useState("");
  const [payResult, setPayResult] = useState<PaymentResult | null>(null);

  // Reversal
  const [reversalId, setReversalId] = useState<number | null>(null);
  const [reversalReason, setReversalReason] = useState("");

  // Read invoice query param from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const invoiceParam = params.get("invoice");
    if (invoiceParam) {
      setSearchInput(invoiceParam);
      setSearchTerm(invoiceParam);
    }
  }, []);

  // --- Queries ---
  const searchQ = useQuery<{ data: Invoice[]; total: number }>({
    queryKey: ["tfp-invoices-search", searchTerm],
    queryFn: () =>
      apiRequest("GET", apiUrl(`/api/v1/tfp-invoices?search=${encodeURIComponent(searchTerm)}&pageSize=10`)),
    enabled: searchTerm.length > 0,
  });

  const detailQ = useQuery<{ data: InvoiceDetail }>({
    queryKey: ["tfp-invoice-detail", selectedInvoiceId],
    queryFn: () =>
      apiRequest("GET", apiUrl(`/api/v1/tfp-invoices/${selectedInvoiceId}`)),
    enabled: !!selectedInvoiceId,
  });

  const searchResults = searchQ.data?.data ?? [];
  const detail = detailQ.data?.data;

  // --- Mutations ---
  const payMut = useMutation({
    mutationFn: (body: {
      invoice_id: number;
      amount: number;
      currency: string;
      payment_date: string;
      payment_method: string;
      reference_no: string;
    }) => apiRequest("POST", apiUrl("/api/v1/tfp-payments"), body),
    onSuccess: (data: { data: PaymentResult }) => {
      setPayResult(data.data);
      setPayAmount("");
      setPayReference("");
      qc.invalidateQueries({ queryKey: ["tfp-invoice-detail", selectedInvoiceId] });
      qc.invalidateQueries({ queryKey: ["tfp-invoices-search"] });
    },
  });

  const reverseMut = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      apiRequest("POST", apiUrl(`/api/v1/tfp-payments/${id}/reverse`), { reason }),
    onSuccess: () => {
      setReversalId(null);
      setReversalReason("");
      qc.invalidateQueries({ queryKey: ["tfp-invoice-detail", selectedInvoiceId] });
    },
  });

  const handleSearch = () => {
    setSearchTerm(searchInput);
    setSelectedInvoiceId(null);
    setPayResult(null);
  };

  const handleSelectInvoice = (inv: Invoice) => {
    setSelectedInvoiceId(inv.id);
    setPayCurrency(inv.currency);
    setPayResult(null);
  };

  const handleSubmitPayment = () => {
    if (!selectedInvoiceId || !payAmount || !payMethod || !payReference) return;
    payMut.mutate({
      invoice_id: selectedInvoiceId,
      amount: parseFloat(payAmount),
      currency: payCurrency,
      payment_date: payDate,
      payment_method: payMethod,
      reference_no: payReference,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <CreditCard className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Payment Application</h1>
          <p className="text-sm text-muted-foreground">
            Record, view, and reverse payments against trust fee invoices
          </p>
        </div>
      </div>

      {/* Invoice Search */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Search Invoice</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <Input
              placeholder="Search by invoice number or customer ID..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="max-w-md"
            />
            <Button size="sm" onClick={handleSearch} disabled={searchQ.isFetching}>
              <Search className="mr-1 h-3 w-3" /> Search
            </Button>
          </div>

          {/* Search Results */}
          {searchTerm && searchResults.length > 0 && (
            <div className="mt-4 overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-right">Grand Total</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {searchResults.map((inv) => (
                    <TableRow
                      key={inv.id}
                      className={`cursor-pointer hover:bg-muted/50 ${selectedInvoiceId === inv.id ? "bg-muted/30" : ""}`}
                      onClick={() => handleSelectInvoice(inv)}
                    >
                      <TableCell className="font-mono text-sm font-medium">
                        {inv.invoice_number}
                      </TableCell>
                      <TableCell className="text-sm">{inv.customer_id}</TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {fmtCurrency(inv.grand_total, inv.currency)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {fmtDate(inv.due_date)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={
                            inv.invoice_status === "PAID"
                              ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
                              : inv.invoice_status === "OVERDUE"
                                ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
                                : "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300"
                          }
                        >
                          {inv.invoice_status.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectInvoice(inv);
                          }}
                        >
                          Select
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {searchTerm && searchResults.length === 0 && !searchQ.isLoading && (
            <p className="mt-4 text-sm text-muted-foreground">
              No invoices found matching "{searchTerm}"
            </p>
          )}
        </CardContent>
      </Card>

      {/* Selected Invoice Detail & Payment Form */}
      {selectedInvoiceId && detail && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Left: Invoice Details */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  {detail.invoice_number}
                </CardTitle>
                <Badge
                  className={
                    detail.invoice_status === "PAID"
                      ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
                      : detail.invoice_status === "OVERDUE"
                        ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
                        : "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300"
                  }
                >
                  {detail.invoice_status.replace("_", " ")}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Customer</p>
                  <p className="text-sm font-medium">{detail.customer_id}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Currency</p>
                  <p className="text-sm font-medium">{detail.currency}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Invoice Date</p>
                  <p className="text-sm">{fmtDate(detail.invoice_date)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Due Date</p>
                  <p className="text-sm">{fmtDate(detail.due_date)}</p>
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-3 gap-4">
                <div className="rounded border p-2 dark:border-gray-700">
                  <p className="text-xs text-muted-foreground">Grand Total</p>
                  <p className="font-mono text-lg font-bold">
                    {fmtCurrency(detail.grand_total, detail.currency)}
                  </p>
                </div>
                <div className="rounded border p-2 dark:border-gray-700">
                  <p className="text-xs text-muted-foreground">Paid</p>
                  <p className="font-mono text-lg font-bold text-green-600 dark:text-green-400">
                    {fmtCurrency(detail.paid_amount, detail.currency)}
                  </p>
                </div>
                <div className="rounded border p-2 dark:border-gray-700">
                  <p className="text-xs text-muted-foreground">Remaining</p>
                  <p
                    className={`font-mono text-lg font-bold ${
                      detail.remaining_balance > 0
                        ? "text-red-500 dark:text-red-400"
                        : "text-green-500 dark:text-green-400"
                    }`}
                  >
                    {fmtCurrency(detail.remaining_balance, detail.currency)}
                  </p>
                </div>
              </div>

              {/* Progress Bar */}
              {parseFloat(detail.grand_total) > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {Math.min(
                        100,
                        Math.round(
                          (detail.paid_amount / parseFloat(detail.grand_total)) * 100,
                        ),
                      )}
                      % paid
                    </span>
                    <span>{fmtCurrency(detail.grand_total, detail.currency)}</span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-green-500 transition-all"
                      style={{
                        width: `${Math.min(100, (detail.paid_amount / parseFloat(detail.grand_total)) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Right: Payment Form */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Record Payment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {detail.invoice_status === "PAID" ? (
                <div className="flex items-center gap-2 rounded-md border border-green-500/30 bg-green-50 p-4 dark:bg-green-900/20">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <p className="text-sm font-medium text-green-700 dark:text-green-400">
                    This invoice is fully paid.
                  </p>
                </div>
              ) : detail.invoice_status === "CANCELLED" ? (
                <div className="flex items-center gap-2 rounded-md border border-slate-500/30 bg-slate-50 p-4 dark:bg-slate-900/20">
                  <XCircle className="h-5 w-5 text-slate-600" />
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-400">
                    This invoice has been cancelled.
                  </p>
                </div>
              ) : detail.invoice_status === "DRAFT" ? (
                <div className="flex items-center gap-2 rounded-md border border-gray-500/30 bg-gray-50 p-4 dark:bg-gray-900/20">
                  <XCircle className="h-5 w-5 text-gray-600" />
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-400">
                    This invoice is still in DRAFT status. Issue it first before recording payments.
                  </p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Amount</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={payAmount}
                        onChange={(e) => setPayAmount(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Currency</Label>
                      <Select value={payCurrency} onValueChange={setPayCurrency}>
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

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Payment Date</Label>
                      <Input
                        type="date"
                        value={payDate}
                        onChange={(e) => setPayDate(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Payment Method</Label>
                      <Select value={payMethod} onValueChange={setPayMethod}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select method..." />
                        </SelectTrigger>
                        <SelectContent>
                          {PAYMENT_METHODS.map((m) => (
                            <SelectItem key={m.value} value={m.value}>
                              {m.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Reference No.</Label>
                    <Input
                      placeholder="Payment reference number"
                      value={payReference}
                      onChange={(e) => setPayReference(e.target.value)}
                    />
                  </div>

                  <Button
                    className="w-full"
                    onClick={handleSubmitPayment}
                    disabled={
                      payMut.isPending ||
                      !payAmount ||
                      !payMethod ||
                      !payReference ||
                      parseFloat(payAmount) <= 0
                    }
                  >
                    {payMut.isPending ? "Processing..." : "Record Payment"}
                  </Button>

                  {payMut.error && (
                    <div className="rounded-md border border-destructive p-3">
                      <p className="text-sm text-destructive">
                        {(payMut.error as any)?.message ?? "Payment failed"}
                      </p>
                    </div>
                  )}

                  {payResult && (
                    <div className="rounded-md border bg-muted/30 p-4 dark:bg-gray-800/50">
                      <h4 className="mb-2 text-sm font-semibold text-green-700 dark:text-green-400">
                        Payment Recorded
                      </h4>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <p className="text-xs text-muted-foreground">Invoice Status</p>
                          <p className="text-sm font-medium">{payResult.invoice_status}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Remaining</p>
                          <p className="text-sm font-medium">
                            {fmtCurrency(payResult.remaining_balance, payCurrency)}
                          </p>
                        </div>
                      </div>
                      {payResult.over_payment && (
                        <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                          Over-payment detected. An exception has been created for reconciliation.
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Payment History */}
      {selectedInvoiceId && detail && detail.payments.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Payment History ({detail.payments.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.payments.map((pmt) => (
                    <TableRow key={pmt.id}>
                      <TableCell className="font-mono text-sm">{pmt.id}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {fmtDate(pmt.payment_date)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm font-medium">
                        {fmtCurrency(pmt.amount, pmt.currency)}
                      </TableCell>
                      <TableCell className="text-sm">{pmt.method}</TableCell>
                      <TableCell className="font-mono text-sm">{pmt.reference_no}</TableCell>
                      <TableCell>
                        <Badge
                          className={
                            pmt.payment_status === "POSTED"
                              ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
                              : "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
                          }
                        >
                          {pmt.payment_status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {pmt.payment_status === "POSTED" && (
                          <>
                            {reversalId === pmt.id ? (
                              <div className="flex items-center gap-2">
                                <Input
                                  placeholder="Reason..."
                                  value={reversalReason}
                                  onChange={(e) => setReversalReason(e.target.value)}
                                  className="w-32"
                                />
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() =>
                                    reverseMut.mutate({
                                      id: pmt.id,
                                      reason: reversalReason,
                                    })
                                  }
                                  disabled={
                                    reverseMut.isPending || !reversalReason
                                  }
                                >
                                  Confirm
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setReversalId(null);
                                    setReversalReason("");
                                  }}
                                >
                                  Cancel
                                </Button>
                              </div>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setReversalId(pmt.id)}
                                title="Reverse Payment"
                              >
                                <RotateCcw className="h-3 w-3" />
                              </Button>
                            )}
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
