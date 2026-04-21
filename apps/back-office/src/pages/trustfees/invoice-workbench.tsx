/**
 * Invoice Workbench -- TrustFees Pro Phase 7
 *
 * Full UI page for managing trust fee invoices:
 *   - Summary cards (Total Invoices, Outstanding Amount, Overdue Count, Monthly Revenue)
 *   - Tabs: All, Draft, Issued, Overdue, Paid
 *   - Data table with status badges and row actions
 *   - Generate Invoices dialog
 *   - Invoice detail panel with lines and payment history
 *   - Ageing report panel
 *   - 30-second auto-refresh, dark mode
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@ui/components/ui/dialog";
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
  FileText,
  DollarSign,
  AlertTriangle,
  TrendingUp,
  RefreshCw,
  Play,
  Send,
  CreditCard,
  ChevronDown,
  ChevronRight,
  Clock,
  BarChart3,
} from "lucide-react";

/* ---------- Constants ---------- */

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-800",
  ISSUED: "bg-blue-100 text-blue-800",
  PAID: "bg-green-100 text-green-800",
  PARTIALLY_PAID: "bg-amber-100 text-amber-800",
  OVERDUE: "bg-red-100 text-red-800",
  DISPUTED: "bg-orange-100 text-orange-800",
  CANCELLED: "bg-slate-100 text-slate-800",
};

const TABS = ["ALL", "DRAFT", "ISSUED", "OVERDUE", "PAID"];

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

const todayStr = () => new Date().toISOString().split("T")[0];

const firstOfMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
};

/* ---------- Sub-components ---------- */

function SummaryCard({
  title,
  value,
  subtitle,
  icon: Icon,
  accent,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
  accent: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="mt-1 text-2xl font-bold">{value}</p>
            {subtitle && (
              <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
          <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${accent}`}>
            <Icon className="h-5 w-5 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SkeletonRows({ cols, rows = 5 }: { cols: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <TableRow key={i}>
          {Array.from({ length: cols }).map((_, j) => (
            <TableCell key={j}>
              <Skeleton className="h-4 w-16" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

function EmptyRow({ cols, msg }: { cols: number; msg: string }) {
  return (
    <TableRow>
      <TableCell colSpan={cols} className="py-8 text-center text-muted-foreground">
        {msg}
      </TableCell>
    </TableRow>
  );
}

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
  created_at: string;
}

interface InvoiceDetail extends Invoice {
  lines: Array<{
    id: number;
    accrual_id: number;
    description: string;
    line_amount: string;
    tax_amount: string;
    tax_code: string | null;
  }>;
  payments: Array<{
    id: number;
    amount: string;
    currency: string;
    payment_date: string;
    method: string;
    reference_no: string;
    payment_status: string;
  }>;
  paid_amount: number;
  remaining_balance: number;
}

interface ListResponse {
  data: Invoice[];
  total: number;
  page: number;
  pageSize: number;
}

interface SummaryData {
  total_invoices: number;
  outstanding_amount: number;
  overdue_count: number;
  month_revenue: number;
}

interface AgeingData {
  buckets: {
    current: { count: number; amount: number };
    "1_30": { count: number; amount: number };
    "31_60": { count: number; amount: number };
    "61_90": { count: number; amount: number };
    "90_plus": { count: number; amount: number };
  };
  total_outstanding: number;
  total_invoices: number;
}

interface GenerateResult {
  invoices_created: number;
  total_amount: number;
  exceptions: string[];
}

/* ========== Main Component ========== */
export default function InvoiceWorkbench() {
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  // Generate dialog
  const [genDialogOpen, setGenDialogOpen] = useState(false);
  const [genFrom, setGenFrom] = useState(firstOfMonth());
  const [genTo, setGenTo] = useState(todayStr());
  const [genResult, setGenResult] = useState<GenerateResult | null>(null);

  // Detail panel
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showAgeing, setShowAgeing] = useState(false);

  // --- Queries ---
  const summaryQ = useQuery<{ data: SummaryData }>({
    queryKey: ["tfp-invoices-summary"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/tfp-invoices/summary")),
    refetchInterval: 30_000,
  });

  const listQ = useQuery<ListResponse>({
    queryKey: ["tfp-invoices", activeTab, searchTerm, page],
    queryFn: () => {
      const params = new URLSearchParams();
      if (activeTab !== "ALL") params.set("invoice_status", activeTab);
      if (searchTerm) params.set("search", searchTerm);
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      return apiRequest("GET", apiUrl(`/api/v1/tfp-invoices?${params.toString()}`));
    },
    refetchInterval: 30_000,
  });

  const detailQ = useQuery<{ data: InvoiceDetail }>({
    queryKey: ["tfp-invoice-detail", selectedId],
    queryFn: () => apiRequest("GET", apiUrl(`/api/v1/tfp-invoices/${selectedId}`)),
    enabled: !!selectedId,
  });

  const ageingQ = useQuery<{ data: AgeingData }>({
    queryKey: ["tfp-invoices-ageing"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/tfp-invoices/ageing")),
    enabled: showAgeing,
    refetchInterval: 30_000,
  });

  const invoices = listQ.data?.data ?? [];
  const total = listQ.data?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);
  const summary = summaryQ.data?.data;
  const detail = detailQ.data?.data;
  const ageing = ageingQ.data?.data;

  // --- Mutations ---
  const generateMut = useMutation({
    mutationFn: (body: { period_from: string; period_to: string }) =>
      apiRequest("POST", apiUrl("/api/v1/tfp-invoices/generate"), body),
    onSuccess: (data: { data: GenerateResult }) => {
      setGenResult(data.data);
      qc.invalidateQueries({ queryKey: ["tfp-invoices"] });
      qc.invalidateQueries({ queryKey: ["tfp-invoices-summary"] });
    },
  });

  const issueMut = useMutation({
    mutationFn: (id: number) =>
      apiRequest("POST", apiUrl(`/api/v1/tfp-invoices/${id}/issue`)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tfp-invoices"] });
      qc.invalidateQueries({ queryKey: ["tfp-invoices-summary"] });
      if (selectedId) qc.invalidateQueries({ queryKey: ["tfp-invoice-detail", selectedId] });
    },
  });

  const markOverdueMut = useMutation({
    mutationFn: () =>
      apiRequest("POST", apiUrl("/api/v1/tfp-invoices/mark-overdue")),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tfp-invoices"] });
      qc.invalidateQueries({ queryKey: ["tfp-invoices-summary"] });
    },
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Invoice Workbench</h1>
            <p className="text-sm text-muted-foreground">
              TrustFees Pro invoice generation, lifecycle, and ageing management
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              listQ.refetch();
              summaryQ.refetch();
            }}
            disabled={listQ.isFetching}
          >
            <RefreshCw className={`h-4 w-4 ${listQ.isFetching ? "animate-spin" : ""}`} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAgeing(!showAgeing)}
          >
            <BarChart3 className="mr-1 h-3 w-3" /> Ageing
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => markOverdueMut.mutate()}
            disabled={markOverdueMut.isPending}
          >
            <Clock className="mr-1 h-3 w-3" /> Mark Overdue
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setGenFrom(firstOfMonth());
              setGenTo(todayStr());
              setGenResult(null);
              setGenDialogOpen(true);
            }}
          >
            <Play className="mr-1 h-3 w-3" /> Generate Invoices
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          title="Total Invoices"
          value={summary?.total_invoices ?? 0}
          icon={FileText}
          accent="bg-blue-600"
        />
        <SummaryCard
          title="Outstanding Amount"
          value={summary ? fmtCurrency(summary.outstanding_amount) : "--"}
          subtitle="ISSUED + OVERDUE + PARTIAL"
          icon={DollarSign}
          accent="bg-green-600"
        />
        <SummaryCard
          title="Overdue Count"
          value={summary?.overdue_count ?? 0}
          icon={AlertTriangle}
          accent="bg-red-500"
        />
        <SummaryCard
          title="Monthly Revenue"
          value={summary ? fmtCurrency(summary.month_revenue) : "--"}
          subtitle="PAID this month"
          icon={TrendingUp}
          accent="bg-emerald-600"
        />
      </div>

      {/* Ageing Report Panel */}
      {showAgeing && ageing && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Ageing Report</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-5 gap-4">
              {[
                { label: "Current", data: ageing.buckets.current, color: "text-green-600" },
                { label: "1-30 Days", data: ageing.buckets["1_30"], color: "text-yellow-600" },
                { label: "31-60 Days", data: ageing.buckets["31_60"], color: "text-orange-600" },
                { label: "61-90 Days", data: ageing.buckets["61_90"], color: "text-red-500" },
                { label: "90+ Days", data: ageing.buckets["90_plus"], color: "text-red-700" },
              ].map((bucket) => (
                <div key={bucket.label} className="rounded-lg border p-3">
                  <p className="text-xs font-medium text-muted-foreground">{bucket.label}</p>
                  <p className={`text-lg font-bold ${bucket.color}`}>
                    {fmtCurrency(bucket.data.amount)}
                  </p>
                  <p className="text-xs text-muted-foreground">{bucket.data.count} invoice(s)</p>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-4">
              <p className="text-sm font-medium">
                Total Outstanding: <span className="text-primary">{fmtCurrency(ageing.total_outstanding)}</span>
              </p>
              <p className="text-sm text-muted-foreground">
                {ageing.total_invoices} open invoice(s)
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Separator />

      {/* Tabs & Search */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          {TABS.map((tab) => (
            <Button
              key={tab}
              variant={activeTab === tab ? "default" : "ghost"}
              size="sm"
              onClick={() => {
                setActiveTab(tab);
                setPage(1);
              }}
            >
              {tab === "ALL" ? "All" : tab.replace("_", " ")}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Search invoice # or customer..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setPage(1);
            }}
            className="w-[260px]"
          />
        </div>
      </div>

      {/* Data Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Invoices</CardTitle>
            <span className="text-sm text-muted-foreground">
              {total} record{total !== 1 ? "s" : ""}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Currency</TableHead>
                  <TableHead className="text-right">Total Amount</TableHead>
                  <TableHead className="text-right">Tax</TableHead>
                  <TableHead className="text-right">Grand Total</TableHead>
                  <TableHead>Invoice Date</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listQ.isLoading ? (
                  <SkeletonRows cols={10} />
                ) : invoices.length === 0 ? (
                  <EmptyRow cols={10} msg="No invoices found" />
                ) : (
                  invoices.map((inv) => (
                    <TableRow
                      key={inv.id}
                      className={`cursor-pointer hover:bg-muted/50 ${selectedId === inv.id ? "bg-muted/30" : ""}`}
                      onClick={() => setSelectedId(inv.id === selectedId ? null : inv.id)}
                    >
                      <TableCell className="font-mono text-sm font-medium">
                        {inv.invoice_number}
                      </TableCell>
                      <TableCell className="text-sm">{inv.customer_id}</TableCell>
                      <TableCell className="text-sm">{inv.currency}</TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {fmtCurrency(inv.total_amount, inv.currency)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {fmtCurrency(inv.tax_amount, inv.currency)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm font-medium">
                        {fmtCurrency(inv.grand_total, inv.currency)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {fmtDate(inv.invoice_date)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {fmtDate(inv.due_date)}
                      </TableCell>
                      <TableCell>
                        <Badge className={bc(inv.invoice_status)}>
                          {inv.invoice_status.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          {inv.invoice_status === "DRAFT" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => issueMut.mutate(inv.id)}
                              disabled={issueMut.isPending}
                              title="Issue Invoice"
                            >
                              <Send className="h-3 w-3" />
                            </Button>
                          )}
                          {(inv.invoice_status === "ISSUED" || inv.invoice_status === "OVERDUE") && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                window.location.href = `/operations/payment-application?invoice=${inv.invoice_number}`;
                              }}
                              title="Record Payment"
                            >
                              <CreditCard className="h-3 w-3" />
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

      {/* Invoice Detail Panel */}
      {selectedId && detail && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                Invoice Detail: {detail.invoice_number}
              </CardTitle>
              <Badge className={bc(detail.invoice_status)}>
                {detail.invoice_status.replace("_", " ")}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Invoice overview */}
            <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
              <div>
                <p className="text-xs text-muted-foreground">Customer</p>
                <p className="text-sm font-medium">{detail.customer_id}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Invoice Date</p>
                <p className="text-sm">{fmtDate(detail.invoice_date)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Due Date</p>
                <p className="text-sm">{fmtDate(detail.due_date)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Grand Total</p>
                <p className="font-mono text-lg font-bold text-primary">
                  {fmtCurrency(detail.grand_total, detail.currency)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Remaining Balance</p>
                <p className={`font-mono text-lg font-bold ${detail.remaining_balance > 0 ? "text-red-500" : "text-green-500"}`}>
                  {fmtCurrency(detail.remaining_balance, detail.currency)}
                </p>
              </div>
            </div>

            {/* Progress bar for paid vs remaining */}
            {parseFloat(detail.grand_total) > 0 && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Paid: {fmtCurrency(detail.paid_amount, detail.currency)}</span>
                  <span>Total: {fmtCurrency(detail.grand_total, detail.currency)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-green-500 transition-all"
                    style={{
                      width: `${Math.min(100, (detail.paid_amount / parseFloat(detail.grand_total)) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            )}

            <Separator />

            {/* Invoice Lines */}
            <div>
              <h4 className="mb-2 text-sm font-semibold">Invoice Lines ({detail.lines.length})</h4>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Line Amount</TableHead>
                      <TableHead>Tax Code</TableHead>
                      <TableHead className="text-right">Tax Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.lines.length === 0 ? (
                      <EmptyRow cols={4} msg="No line items" />
                    ) : (
                      detail.lines.map((line) => (
                        <TableRow key={line.id}>
                          <TableCell className="text-sm">{line.description}</TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {fmtCurrency(line.line_amount, detail.currency)}
                          </TableCell>
                          <TableCell className="text-sm">{line.tax_code ?? "--"}</TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {fmtCurrency(line.tax_amount, detail.currency)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Payment History */}
            <div>
              <h4 className="mb-2 text-sm font-semibold">
                Payment History ({detail.payments.length})
              </h4>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.payments.length === 0 ? (
                      <EmptyRow cols={5} msg="No payments recorded" />
                    ) : (
                      detail.payments.map((pmt) => (
                        <TableRow key={pmt.id}>
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
                                  ? "bg-green-100 text-green-800"
                                  : "bg-red-100 text-red-800"
                              }
                            >
                              {pmt.payment_status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Generate Invoices Dialog */}
      <Dialog open={genDialogOpen} onOpenChange={setGenDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Generate Invoices</DialogTitle>
            <DialogDescription>
              Aggregate OPEN accruals within the specified period into invoices.
              Accruals are grouped by customer and currency.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Period From</Label>
                <Input
                  type="date"
                  value={genFrom}
                  onChange={(e) => {
                    setGenFrom(e.target.value);
                    setGenResult(null);
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label>Period To</Label>
                <Input
                  type="date"
                  value={genTo}
                  onChange={(e) => {
                    setGenTo(e.target.value);
                    setGenResult(null);
                  }}
                />
              </div>
            </div>

            {/* Result summary */}
            {genResult && (
              <div className="rounded-md border bg-muted/30 p-4">
                <h4 className="mb-2 text-sm font-semibold text-green-700">
                  Generation Complete
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Invoices Created</p>
                    <p className="text-lg font-bold text-green-600">
                      {genResult.invoices_created}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total Amount</p>
                    <p className="text-lg font-bold">
                      {fmtCurrency(genResult.total_amount)}
                    </p>
                  </div>
                </div>
                {genResult.exceptions.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs font-medium text-amber-600">
                      Exceptions ({genResult.exceptions.length}):
                    </p>
                    <ul className="mt-1 text-xs text-muted-foreground">
                      {genResult.exceptions.slice(0, 5).map((ex, i) => (
                        <li key={i}>- {ex}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setGenDialogOpen(false)}>
              {genResult ? "Close" : "Cancel"}
            </Button>
            {!genResult && (
              <Button
                onClick={() =>
                  generateMut.mutate({ period_from: genFrom, period_to: genTo })
                }
                disabled={generateMut.isPending || !genFrom || !genTo}
              >
                {generateMut.isPending ? "Generating..." : "Generate"}
              </Button>
            )}
          </DialogFooter>

          {generateMut.error && (
            <div className="mt-2 rounded-md border border-destructive p-3">
              <p className="text-sm text-destructive">
                {(generateMut.error as any)?.message ?? "Invoice generation failed"}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
