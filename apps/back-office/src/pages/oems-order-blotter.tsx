import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@ui/lib/queryClient";
import { Badge } from "@ui/components/ui/badge";
import { Button } from "@ui/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@ui/components/ui/sheet";
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
  AlertTriangle,
  Ban,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  Filter,
  Layers,
  Plug,
  RefreshCcw,
  Search,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  XCircle,
} from "lucide-react";

// --- Types ---

type ProductFamily = "ODA" | "MLD" | "MUTUAL_FUND" | "BOND" | "FX_TODAY" | "WEALTH_LENDING";

type OrderStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "PLACED"
  | "OBSERVATION"
  | "EXECUTED"
  | "BOOKED"
  | "REJECTED"
  | "CANCELLED"
  | "MATURED"
  | "SETTLED";

type Channel =
  | "OEMS_DIRECT"
  | "CRM_MICROSITE"
  | "DBANK_PRO_MICROSITE"
  | "BRANCH"
  | "CRM"
  | "RM_MOBILE"
  | "SECURE_MICROSITE"
  | "BACK_OFFICE"
  | "TREASURY";

interface OemsOrder {
  order_id: string;
  order_no: string;
  product_family: ProductFamily;
  transaction_type: string;
  customer_id: string | null;
  portfolio_id: string | null;
  channel: Channel;
  assisted_by_user_id: string | null;
  branch_code: string | null;
  currency: string;
  amount: string | null;
  rate: string | null;
  tenor_days: number | null;
  trade_date: string | null;
  order_status: OrderStatus;
  document_status: string | null;
  verification_status: string | null;
  validation_summary: ValidationItem[] | null;
  processing_date: string | null;
  created_at: string;
  updated_at: string | null;
}

interface ValidationItem {
  code: string;
  message: string;
  severity: "INFO" | "WARNING" | "BLOCKING";
}

interface StatusTransition {
  id: number;
  order_id: string;
  from_status: string;
  to_status: string;
  transitioned_by: string | null;
  reason: string | null;
  transitioned_at: string;
}

interface WorkbenchSummary {
  openOrders: number;
  validationFailures: number;
  pendingIntegrations: number;
  activeParameters: number;
}

interface ListResponse<T> {
  data: T[];
  total: number;
}

// --- Helpers ---

const ALL_PRODUCT_FAMILIES: ProductFamily[] = [
  "ODA",
  "MLD",
  "MUTUAL_FUND",
  "BOND",
  "FX_TODAY",
  "WEALTH_LENDING",
];

const ALL_STATUSES: OrderStatus[] = [
  "DRAFT",
  "PENDING_APPROVAL",
  "APPROVED",
  "PLACED",
  "OBSERVATION",
  "EXECUTED",
  "BOOKED",
  "REJECTED",
  "CANCELLED",
  "MATURED",
  "SETTLED",
];

function getStatusBadgeVariant(
  status: string
): "default" | "secondary" | "outline" | "destructive" {
  switch (status) {
    case "DRAFT":
      return "secondary";
    case "PENDING_APPROVAL":
      return "outline";
    case "APPROVED":
      return "default";
    case "PLACED":
      return "outline";
    case "OBSERVATION":
      return "outline";
    case "EXECUTED":
      return "default";
    case "BOOKED":
      return "default";
    case "REJECTED":
      return "destructive";
    case "CANCELLED":
      return "destructive";
    case "MATURED":
      return "secondary";
    case "SETTLED":
      return "secondary";
    default:
      return "outline";
  }
}

function getProductFamilyLabel(pf: ProductFamily): string {
  switch (pf) {
    case "ODA":
      return "ODA";
    case "MLD":
      return "MLD";
    case "MUTUAL_FUND":
      return "Mutual Fund";
    case "BOND":
      return "Bond";
    case "FX_TODAY":
      return "FX Today";
    case "WEALTH_LENDING":
      return "Wealth Lending";
    default:
      return pf;
  }
}

function getSeverityBadgeVariant(
  severity: string
): "default" | "secondary" | "destructive" {
  switch (severity) {
    case "BLOCKING":
      return "destructive";
    case "WARNING":
      return "default";
    case "INFO":
      return "secondary";
    default:
      return "secondary";
  }
}

function formatAmount(amount: string | null, currency?: string): string {
  if (!amount) return "-";
  const num = parseFloat(amount);
  if (isNaN(num)) return amount;
  const formatted = num.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currency ? `${currency} ${formatted}` : formatted;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return "-";
  try {
    return new Date(dateStr).toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

function isTerminalStatus(status: string): boolean {
  return ["REJECTED", "CANCELLED", "MATURED", "SETTLED"].includes(status);
}

// --- Component ---

export default function OemsOrderBlotter() {
  const queryClient = useQueryClient();

  // Filter state
  const [productFamily, setProductFamily] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [customerId, setCustomerId] = useState("");
  const [searchText, setSearchText] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Detail sheet state
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState("summary");

  // Cancel dialog state
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelOrderId, setCancelOrderId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  // Build query params
  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (productFamily !== "ALL") params.set("productFamily", productFamily);
    if (statusFilter !== "ALL") params.set("status", statusFilter);
    if (customerId.trim()) params.set("customerId", customerId.trim());
    if (searchText.trim()) params.set("search", searchText.trim());
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    return params.toString();
  }, [productFamily, statusFilter, customerId, searchText, dateFrom, dateTo, page, pageSize]);

  // Queries
  const { data: summary } = useQuery<WorkbenchSummary>({
    queryKey: ["/api/v1/oems/summary"],
    queryFn: () => apiRequest("GET", "/api/v1/oems/summary"),
    refetchInterval: 30000,
  });

  const { data: ordersResponse, isLoading: ordersLoading } = useQuery<ListResponse<OemsOrder>>({
    queryKey: ["/api/v1/oems/orders", queryParams],
    queryFn: () => apiRequest("GET", `/api/v1/oems/orders?${queryParams}`),
  });

  const { data: selectedOrder } = useQuery<OemsOrder>({
    queryKey: ["/api/v1/oems/orders", selectedOrderId],
    queryFn: () => apiRequest("GET", `/api/v1/oems/orders/${selectedOrderId}`),
    enabled: !!selectedOrderId,
  });

  const { data: statusHistory } = useQuery<StatusTransition[]>({
    queryKey: ["/api/v1/oems/orders", selectedOrderId, "status-transitions"],
    queryFn: () =>
      apiRequest("GET", `/api/v1/oems/orders/${selectedOrderId}/status-transitions`),
    enabled: !!selectedOrderId && detailTab === "history",
  });

  // Mutations
  const submitMutation = useMutation({
    mutationFn: (orderId: string) =>
      apiRequest("POST", `/api/v1/oems/orders/${orderId}/submit`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/oems/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/oems/summary"] });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: ({ orderId, reason }: { orderId: string; reason: string }) =>
      apiRequest("POST", `/api/v1/oems/orders/${orderId}/cancel`, { reason }),
    onSuccess: () => {
      setCancelDialogOpen(false);
      setCancelReason("");
      setCancelOrderId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/v1/oems/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/oems/summary"] });
    },
  });

  const validateMutation = useMutation({
    mutationFn: (orderId: string) =>
      apiRequest("POST", `/api/v1/oems/orders/${orderId}/validate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/oems/orders"] });
    },
  });

  const acknowledgeWarningsMutation = useMutation({
    mutationFn: (orderId: string) =>
      apiRequest("POST", `/api/v1/oems/orders/${orderId}/acknowledge-warnings`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/oems/orders"] });
      if (selectedOrderId) {
        queryClient.invalidateQueries({
          queryKey: ["/api/v1/oems/orders", selectedOrderId],
        });
      }
    },
  });

  const orders = ordersResponse?.data ?? [];
  const totalCount = ordersResponse?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  // Handlers
  function handleRowClick(orderId: string) {
    setSelectedOrderId(orderId);
    setDetailTab("summary");
  }

  function handleCancelClick(orderId: string, e: React.MouseEvent) {
    e.stopPropagation();
    setCancelOrderId(orderId);
    setCancelDialogOpen(true);
  }

  function handleConfirmCancel() {
    if (cancelOrderId && cancelReason.trim()) {
      cancelMutation.mutate({ orderId: cancelOrderId, reason: cancelReason.trim() });
    }
  }

  function handleSubmitClick(orderId: string, e: React.MouseEvent) {
    e.stopPropagation();
    submitMutation.mutate(orderId);
  }

  function handleValidateClick(orderId: string, e: React.MouseEvent) {
    e.stopPropagation();
    validateMutation.mutate(orderId);
  }

  function resetFilters() {
    setProductFamily("ALL");
    setStatusFilter("ALL");
    setCustomerId("");
    setSearchText("");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">OEMS Order Blotter</h1>
          <p className="text-sm text-muted-foreground">
            Unified view of all orders across product families
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            queryClient.invalidateQueries({ queryKey: ["/api/v1/oems/orders"] });
            queryClient.invalidateQueries({ queryKey: ["/api/v1/oems/summary"] });
          }}
        >
          <RefreshCcw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Open Orders</CardTitle>
            <Layers className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.openOrders ?? "-"}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Validation Failures</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">
              {summary?.validationFailures ?? "-"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Integrations</CardTitle>
            <Plug className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.pendingIntegrations ?? "-"}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Parameters</CardTitle>
            <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.activeParameters ?? "-"}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filter Bar */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            {/* Product Family */}
            <div className="space-y-1">
              <Label className="text-xs">Product Family</Label>
              <Select value={productFamily} onValueChange={(v) => { setProductFamily(v); setPage(1); }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Families</SelectItem>
                  {ALL_PRODUCT_FAMILIES.map((pf) => (
                    <SelectItem key={pf} value={pf}>
                      {getProductFamilyLabel(pf)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Order Status */}
            <div className="space-y-1">
              <Label className="text-xs">Order Status</Label>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Statuses</SelectItem>
                  {ALL_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Customer ID */}
            <div className="space-y-1">
              <Label className="text-xs">Customer ID</Label>
              <Input
                placeholder="CIF / Customer ID"
                value={customerId}
                onChange={(e) => { setCustomerId(e.target.value); setPage(1); }}
              />
            </div>

            {/* Search */}
            <div className="space-y-1">
              <Label className="text-xs">Search</Label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Order no, customer..."
                  value={searchText}
                  onChange={(e) => { setSearchText(e.target.value); setPage(1); }}
                />
              </div>
            </div>

            {/* Date From */}
            <div className="space-y-1">
              <Label className="text-xs">From Date</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              />
            </div>

            {/* Date To */}
            <div className="space-y-1">
              <Label className="text-xs">To Date</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              />
            </div>

            {/* Page Size */}
            <div className="space-y-1">
              <Label className="text-xs">Page Size</Label>
              <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              <Filter className="mr-1 h-3 w-3" />
              Reset Filters
            </Button>
            <span className="text-xs text-muted-foreground">
              {totalCount} order{totalCount !== 1 ? "s" : ""} found
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Orders Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[120px]">Order No</TableHead>
                  <TableHead>Product Family</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead className="text-right">Currency</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="text-right">Tenor</TableHead>
                  <TableHead>Trade Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Verification</TableHead>
                  <TableHead>Documents</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ordersLoading ? (
                  <TableRow>
                    <TableCell colSpan={13} className="text-center py-8 text-muted-foreground">
                      Loading orders...
                    </TableCell>
                  </TableRow>
                ) : orders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={13} className="text-center py-8 text-muted-foreground">
                      No orders match the current filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  orders.map((order) => (
                    <TableRow
                      key={order.order_id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleRowClick(order.order_id)}
                    >
                      <TableCell className="font-mono text-xs">{order.order_no}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {getProductFamilyLabel(order.product_family)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{order.customer_id ?? "-"}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          {order.channel.replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-sm">{order.currency}</TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatAmount(order.amount)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {order.rate ?? "-"}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {order.tenor_days != null ? `${order.tenor_days}d` : "-"}
                      </TableCell>
                      <TableCell className="text-sm">{formatDate(order.trade_date)}</TableCell>
                      <TableCell>
                        <Badge variant={getStatusBadgeVariant(order.order_status)} className="text-xs">
                          {order.order_status.replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {order.verification_status ? (
                          <Badge
                            variant={
                              order.verification_status === "VERIFIED"
                                ? "default"
                                : order.verification_status === "FAILED"
                                  ? "destructive"
                                  : "outline"
                            }
                            className="text-xs"
                          >
                            {order.verification_status}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {order.document_status ? (
                          <Badge
                            variant={
                              order.document_status === "COMPLETE"
                                ? "default"
                                : order.document_status === "MISSING"
                                  ? "destructive"
                                  : "outline"
                            }
                            className="text-xs"
                          >
                            {order.document_status}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {order.order_status === "DRAFT" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              title="Submit"
                              disabled={submitMutation.isPending}
                              onClick={(e) => handleSubmitClick(order.order_id, e)}
                            >
                              <Send className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {!isTerminalStatus(order.order_status) && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive"
                              title="Cancel"
                              onClick={(e) => handleCancelClick(order.order_id, e)}
                            >
                              <Ban className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title="Validate"
                            disabled={validateMutation.isPending}
                            onClick={(e) => handleValidateClick(order.order_id, e)}
                          >
                            <ShieldCheck className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          Showing {orders.length > 0 ? (page - 1) * pageSize + 1 : 0} to{" "}
          {Math.min(page * pageSize, totalCount)} of {totalCount} orders
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft className="mr-1 h-4 w-4" />
            Previous
          </Button>
          <span className="text-sm">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Detail Sheet (right drawer) */}
      <Sheet open={!!selectedOrderId} onOpenChange={(open) => { if (!open) setSelectedOrderId(null); }}>
        <SheetContent className="w-[600px] sm:max-w-[600px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-3">
              <span className="font-mono">{selectedOrder?.order_no ?? "..."}</span>
              {selectedOrder && (
                <>
                  <Badge variant={getStatusBadgeVariant(selectedOrder.order_status)}>
                    {selectedOrder.order_status.replace(/_/g, " ")}
                  </Badge>
                  <Badge variant="outline">
                    {getProductFamilyLabel(selectedOrder.product_family)}
                  </Badge>
                </>
              )}
            </SheetTitle>
          </SheetHeader>

          <div className="mt-6">
            <Tabs value={detailTab} onValueChange={setDetailTab}>
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="summary">Summary</TabsTrigger>
                <TabsTrigger value="validation">Validation</TabsTrigger>
                <TabsTrigger value="documents">Documents</TabsTrigger>
                <TabsTrigger value="history">History</TabsTrigger>
              </TabsList>

              {/* Summary Tab */}
              <TabsContent value="summary" className="mt-4">
                {selectedOrder ? (
                  <div className="grid grid-cols-2 gap-4">
                    <DetailField label="Order ID" value={selectedOrder.order_id} />
                    <DetailField label="Order No" value={selectedOrder.order_no} />
                    <DetailField
                      label="Product Family"
                      value={getProductFamilyLabel(selectedOrder.product_family)}
                    />
                    <DetailField label="Transaction Type" value={selectedOrder.transaction_type} />
                    <DetailField label="Customer ID" value={selectedOrder.customer_id ?? "-"} />
                    <DetailField label="Portfolio ID" value={selectedOrder.portfolio_id ?? "-"} />
                    <DetailField
                      label="Channel"
                      value={selectedOrder.channel.replace(/_/g, " ")}
                    />
                    <DetailField
                      label="Assisted By"
                      value={selectedOrder.assisted_by_user_id ?? "-"}
                    />
                    <DetailField label="Branch Code" value={selectedOrder.branch_code ?? "-"} />
                    <DetailField label="Currency" value={selectedOrder.currency} />
                    <DetailField
                      label="Amount"
                      value={formatAmount(selectedOrder.amount, selectedOrder.currency)}
                    />
                    <DetailField label="Rate" value={selectedOrder.rate ?? "-"} />
                    <DetailField
                      label="Tenor"
                      value={selectedOrder.tenor_days != null ? `${selectedOrder.tenor_days} days` : "-"}
                    />
                    <DetailField label="Trade Date" value={formatDate(selectedOrder.trade_date)} />
                    <DetailField
                      label="Processing Date"
                      value={formatDate(selectedOrder.processing_date)}
                    />
                    <DetailField
                      label="Created At"
                      value={formatDateTime(selectedOrder.created_at)}
                    />
                    <DetailField
                      label="Updated At"
                      value={formatDateTime(selectedOrder.updated_at)}
                    />
                    <DetailField
                      label="Order Status"
                      value={selectedOrder.order_status.replace(/_/g, " ")}
                    />
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Loading...</p>
                )}
              </TabsContent>

              {/* Validation Tab */}
              <TabsContent value="validation" className="mt-4">
                {selectedOrder?.validation_summary &&
                selectedOrder.validation_summary.length > 0 ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">
                        {selectedOrder.validation_summary.length} validation item
                        {selectedOrder.validation_summary.length !== 1 ? "s" : ""}
                      </span>
                      {selectedOrder.validation_summary.some(
                        (v) => v.severity === "WARNING"
                      ) &&
                        !selectedOrder.validation_summary.some(
                          (v) => v.severity === "BLOCKING"
                        ) && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={acknowledgeWarningsMutation.isPending}
                            onClick={() =>
                              acknowledgeWarningsMutation.mutate(selectedOrder.order_id)
                            }
                          >
                            <CheckCircle className="mr-1 h-3 w-3" />
                            Acknowledge Warnings
                          </Button>
                        )}
                    </div>
                    <div className="space-y-2">
                      {selectedOrder.validation_summary.map((item, idx) => (
                        <div
                          key={idx}
                          className="flex items-start gap-3 rounded-md border p-3"
                        >
                          <Badge
                            variant={getSeverityBadgeVariant(item.severity)}
                            className="mt-0.5 text-xs"
                          >
                            {item.severity}
                          </Badge>
                          <div className="flex-1">
                            <p className="text-sm font-medium">{item.code}</p>
                            <p className="text-sm text-muted-foreground">{item.message}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center py-8 text-muted-foreground">
                    <CheckCircle className="mb-2 h-8 w-8" />
                    <p className="text-sm">No validation issues</p>
                  </div>
                )}
              </TabsContent>

              {/* Documents Tab */}
              <TabsContent value="documents" className="mt-4">
                {selectedOrder ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="rounded-md border p-4">
                        <div className="flex items-center gap-2 mb-1">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span className="text-xs font-medium uppercase text-muted-foreground">
                            Document Status
                          </span>
                        </div>
                        <Badge
                          variant={
                            selectedOrder.document_status === "COMPLETE"
                              ? "default"
                              : selectedOrder.document_status === "MISSING"
                                ? "destructive"
                                : "outline"
                          }
                        >
                          {selectedOrder.document_status ?? "N/A"}
                        </Badge>
                      </div>
                      <div className="rounded-md border p-4">
                        <div className="flex items-center gap-2 mb-1">
                          <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                          <span className="text-xs font-medium uppercase text-muted-foreground">
                            Verification Status
                          </span>
                        </div>
                        <Badge
                          variant={
                            selectedOrder.verification_status === "VERIFIED"
                              ? "default"
                              : selectedOrder.verification_status === "FAILED"
                                ? "destructive"
                                : "outline"
                          }
                        >
                          {selectedOrder.verification_status ?? "N/A"}
                        </Badge>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Loading...</p>
                )}
              </TabsContent>

              {/* Status History Tab */}
              <TabsContent value="history" className="mt-4">
                {statusHistory && statusHistory.length > 0 ? (
                  <div className="space-y-3">
                    {statusHistory.map((transition, idx) => (
                      <div
                        key={transition.id ?? idx}
                        className="flex items-start gap-3 border-l-2 border-muted pl-4 pb-4"
                      >
                        <Clock className="mt-0.5 h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge
                              variant={getStatusBadgeVariant(transition.from_status)}
                              className="text-xs"
                            >
                              {transition.from_status.replace(/_/g, " ")}
                            </Badge>
                            <span className="text-xs text-muted-foreground">→</span>
                            <Badge
                              variant={getStatusBadgeVariant(transition.to_status)}
                              className="text-xs"
                            >
                              {transition.to_status.replace(/_/g, " ")}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {formatDateTime(transition.transitioned_at)}
                            {transition.transitioned_by && (
                              <> by <span className="font-medium">{transition.transitioned_by}</span></>
                            )}
                          </p>
                          {transition.reason && (
                            <p className="text-xs text-muted-foreground italic">
                              Reason: {transition.reason}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : statusHistory && statusHistory.length === 0 ? (
                  <div className="flex flex-col items-center py-8 text-muted-foreground">
                    <Clock className="mb-2 h-8 w-8" />
                    <p className="text-sm">No status transitions recorded</p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Loading history...</p>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </SheetContent>
      </Sheet>

      {/* Cancel Confirmation Dialog */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Order</DialogTitle>
            <DialogDescription>
              Please provide a reason for cancelling this order. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label htmlFor="cancel-reason">Cancellation Reason</Label>
            <Textarea
              id="cancel-reason"
              placeholder="Enter the reason for cancellation..."
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCancelDialogOpen(false);
                setCancelReason("");
                setCancelOrderId(null);
              }}
            >
              Go Back
            </Button>
            <Button
              variant="destructive"
              disabled={!cancelReason.trim() || cancelMutation.isPending}
              onClick={handleConfirmCancel}
            >
              {cancelMutation.isPending ? "Cancelling..." : "Confirm Cancel"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// --- Sub-components ---

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
      <p className="text-sm">{value}</p>
    </div>
  );
}
