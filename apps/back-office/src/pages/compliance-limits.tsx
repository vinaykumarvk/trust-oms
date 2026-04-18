/**
 * Compliance Limits — Phase 3G (Pre/Post-Trade Compliance Engine)
 *
 * Limit management, pre-trade order validation, post-trade breach
 * monitoring, and expiring-line tracking. Four-tab interface with
 * summary cards. Auto-refreshes every 30 seconds.
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@ui/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@ui/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ui/components/ui/select";
import { Skeleton } from "@ui/components/ui/skeleton";
import { Separator } from "@ui/components/ui/separator";
import {
  ShieldCheck, AlertTriangle, AlertOctagon, CalendarClock,
  RefreshCw, Plus, Search, Trash2, Play, CheckCircle, XCircle,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface ComplianceLimit {
  id: string;
  limit_type: string;
  dimension: string;
  dimension_value: string;
  limit_amount: number;
  current_exposure: number;
  warning_threshold: number;
  hard_threshold: number;
  effective_from: string;
  effective_to: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface LimitsResponse {
  data: ComplianceLimit[];
  total: number;
  page: number;
  pageSize: number;
}

interface ValidationResult {
  rule: string;
  passed: boolean;
  severity: "hard" | "soft";
  message: string;
  limit_id?: string;
}

interface ValidationResponse {
  order_id: string;
  passed: boolean;
  results: ValidationResult[];
}

interface BreachAgingBucket {
  bucket: string;
  count: number;
  severity: string;
}

interface ExpiringLine {
  id: string;
  limit_type: string;
  dimension_value: string;
  limit_amount: number;
  effective_to: string;
  days_until_expiry: number;
}

interface ExpiringLinesResponse {
  data: ExpiringLine[];
  total: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const LIMIT_TYPES = [
  "trader", "counterparty", "broker", "issuer",
  "sector", "sbl", "group", "outlet",
] as const;

const LIMIT_TYPE_COLORS: Record<string, string> = {
  trader: "bg-blue-100 text-blue-800",
  counterparty: "bg-purple-100 text-purple-800",
  broker: "bg-indigo-100 text-indigo-800",
  issuer: "bg-cyan-100 text-cyan-800",
  sector: "bg-green-100 text-green-800",
  sbl: "bg-orange-100 text-orange-800",
  group: "bg-pink-100 text-pink-800",
  outlet: "bg-yellow-100 text-yellow-800",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatDate(d: string | null): string {
  if (!d) return "-";
  try {
    return new Date(d).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return d;
  }
}

function formatNumber(n: number): string {
  return n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function utilizationPct(current: number, limit: number): number {
  if (!limit || limit === 0) return 0;
  return Math.min((current / limit) * 100, 100);
}

function utilizationColor(pct: number, warning: number, hard: number): string {
  if (pct >= hard) return "bg-red-500";
  if (pct >= warning) return "bg-yellow-500";
  return "bg-green-500";
}

function badgeColor(key: string, map: Record<string, string>): string {
  return map[key] ?? "bg-gray-100 text-gray-800";
}

// Reusable sub-components
function SummaryCard({ title, value, icon: Icon, accent }: { title: string; value: string | number; icon: React.ElementType; accent: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="mt-1 text-2xl font-bold">{value}</p>
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
            <TableCell key={j}><Skeleton className="h-4 w-16" /></TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

function EmptyRow({ cols, msg }: { cols: number; msg: string }) {
  return (
    <TableRow>
      <TableCell colSpan={cols} className="py-8 text-center text-muted-foreground">{msg}</TableCell>
    </TableRow>
  );
}

// ---------------------------------------------------------------------------
// Blank form
// ---------------------------------------------------------------------------
const BLANK_FORM = {
  limit_type: "trader",
  dimension: "",
  dimension_value: "",
  limit_amount: "",
  warning_threshold: "80",
  hard_threshold: "100",
  effective_from: "",
  effective_to: "",
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------
export default function ComplianceLimits() {
  const qc = useQueryClient();
  const [tab, setTab] = useState("limits");

  // Limits tab state
  const [filterType, setFilterType] = useState<string>("all");
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...BLANK_FORM });

  // Pre-trade tab state
  const [orderId, setOrderId] = useState("");
  const [validationData, setValidationData] = useState<ValidationResponse | null>(null);

  // --- Queries ---
  const limitsQ = useQuery<LimitsResponse>({
    queryKey: ["compliance-limits", filterType, page],
    queryFn: () => {
      const p = new URLSearchParams();
      p.set("page", String(page));
      p.set("pageSize", String(pageSize));
      if (filterType !== "all") p.set("limit_type", filterType);
      p.set("is_active", "true");
      return apiRequest("GET", apiUrl(`/api/v1/compliance-limits/limits?${p.toString()}`));
    },
    refetchInterval: 30_000,
  });
  const limits = limitsQ.data?.data ?? [];
  const limitsTotal = limitsQ.data?.total ?? 0;
  const limitsTotalPages = Math.ceil(limitsTotal / pageSize);

  const breachAgingQ = useQuery<BreachAgingBucket[]>({
    queryKey: ["breach-aging"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/compliance-limits/post-trade/breach-aging")),
    refetchInterval: 30_000,
    enabled: tab === "post-trade",
  });
  const breachBuckets = breachAgingQ.data ?? [];

  const expiringQ = useQuery<ExpiringLinesResponse>({
    queryKey: ["expiring-lines"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/compliance-limits/post-trade/expiring-lines")),
    refetchInterval: 30_000,
  });
  const expiringLines = expiringQ.data?.data ?? [];

  // Derived summary values
  const activeLimits = limitsTotal;
  const warningBreaches = limits.filter((l) => {
    const pct = utilizationPct(l.current_exposure, l.limit_amount);
    return pct >= l.warning_threshold && pct < l.hard_threshold;
  }).length;
  const hardBreaches = limits.filter((l) => {
    const pct = utilizationPct(l.current_exposure, l.limit_amount);
    return pct >= l.hard_threshold;
  }).length;
  const expiring30d = expiringLines.filter((l) => l.days_until_expiry <= 30).length;

  // --- Mutations ---
  const upsertMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiRequest("POST", apiUrl("/api/v1/compliance-limits/limits"), body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["compliance-limits"] });
      setDialogOpen(false);
      setEditingId(null);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) =>
      apiRequest("DELETE", apiUrl(`/api/v1/compliance-limits/limits/${id}`)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["compliance-limits"] });
    },
  });

  const validateMut = useMutation({
    mutationFn: (oid: string) =>
      apiRequest("POST", apiUrl(`/api/v1/compliance-limits/validate-order/${oid}`)),
    onSuccess: (data: ValidationResponse) => {
      setValidationData(data);
    },
  });

  const overrideMut = useMutation({
    mutationFn: (body: { order_id: string; rule: string; severity: string; justification: string }) =>
      apiRequest("POST", apiUrl("/api/v1/compliance-limits/overrides"), body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["compliance-limits"] });
    },
  });

  // --- Handlers ---
  const openAdd = () => {
    setEditingId(null);
    setForm({ ...BLANK_FORM });
    setDialogOpen(true);
  };

  const openEdit = (limit: ComplianceLimit) => {
    setEditingId(limit.id);
    setForm({
      limit_type: limit.limit_type,
      dimension: limit.dimension,
      dimension_value: limit.dimension_value,
      limit_amount: String(limit.limit_amount),
      warning_threshold: String(limit.warning_threshold),
      hard_threshold: String(limit.hard_threshold),
      effective_from: limit.effective_from?.substring(0, 10) ?? "",
      effective_to: limit.effective_to?.substring(0, 10) ?? "",
    });
    setDialogOpen(true);
  };

  const submitForm = () => {
    const body: Record<string, unknown> = {
      limit_type: form.limit_type,
      dimension: form.dimension,
      dimension_value: form.dimension_value,
      limit_amount: parseFloat(form.limit_amount),
      warning_threshold: parseFloat(form.warning_threshold),
      hard_threshold: parseFloat(form.hard_threshold),
      effective_from: form.effective_from,
    };
    if (form.effective_to) body.effective_to = form.effective_to;
    if (editingId) body.id = editingId;
    upsertMut.mutate(body);
  };

  const runValidation = () => {
    if (!orderId.trim()) return;
    setValidationData(null);
    validateMut.mutate(orderId.trim());
  };

  // --- Render ---
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <ShieldCheck className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Compliance Limits</h1>
            <p className="text-sm text-muted-foreground">Pre/post-trade compliance engine and limit management</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => { limitsQ.refetch(); breachAgingQ.refetch(); expiringQ.refetch(); }} disabled={limitsQ.isFetching}>
          <RefreshCw className={`h-4 w-4 mr-2 ${limitsQ.isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <SummaryCard title="Active Limits" value={activeLimits} icon={ShieldCheck} accent="bg-blue-600" />
        <SummaryCard title="Warning Breaches" value={warningBreaches} icon={AlertTriangle} accent="bg-yellow-500" />
        <SummaryCard title="Hard Breaches" value={hardBreaches} icon={AlertOctagon} accent="bg-red-600" />
        <SummaryCard title="Expiring Lines (30d)" value={expiring30d} icon={CalendarClock} accent="bg-orange-500" />
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="limits">Limits</TabsTrigger>
          <TabsTrigger value="pre-trade">Pre-Trade Validator</TabsTrigger>
          <TabsTrigger value="post-trade">Post-Trade Monitor</TabsTrigger>
          <TabsTrigger value="expiring">Expiring Lines</TabsTrigger>
        </TabsList>

        {/* ==================== LIMITS TAB ==================== */}
        <TabsContent value="limits" className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Select value={filterType} onValueChange={(v) => { setFilterType(v); setPage(1); }}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {LIMIT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" onClick={openAdd}>
              <Plus className="h-4 w-4 mr-2" />
              Add Limit
            </Button>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Dimension</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead className="text-right">Limit</TableHead>
                  <TableHead className="text-right">Exposure</TableHead>
                  <TableHead>Utilization</TableHead>
                  <TableHead>Effective</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {limitsQ.isLoading ? (
                  <SkeletonRows cols={8} />
                ) : limits.length === 0 ? (
                  <EmptyRow cols={8} msg="No limits found" />
                ) : (
                  limits.map((limit) => {
                    const pct = utilizationPct(limit.current_exposure, limit.limit_amount);
                    const barColor = utilizationColor(pct, limit.warning_threshold, limit.hard_threshold);
                    return (
                      <TableRow key={limit.id}>
                        <TableCell>
                          <Badge className={badgeColor(limit.limit_type, LIMIT_TYPE_COLORS)}>
                            {limit.limit_type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{limit.dimension}</TableCell>
                        <TableCell className="font-mono text-xs">{limit.dimension_value}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{formatNumber(limit.limit_amount)}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{formatNumber(limit.current_exposure)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-24 rounded-full bg-gray-200">
                              <div className={`h-2 rounded-full ${barColor}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                            </div>
                            <span className="text-xs font-medium">{pct.toFixed(1)}%</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">
                          {formatDate(limit.effective_from)}
                          {limit.effective_to ? ` - ${formatDate(limit.effective_to)}` : ""}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => openEdit(limit)}>Edit</Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-600 hover:text-red-700"
                              onClick={() => deleteMut.mutate(limit.id)}
                              disabled={deleteMut.isPending}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Limits Pagination */}
          {limitsTotalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, limitsTotal)} of {limitsTotal}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                <span className="text-sm text-muted-foreground">Page {page} of {limitsTotalPages}</span>
                <Button variant="outline" size="sm" disabled={page >= limitsTotalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ==================== PRE-TRADE VALIDATOR TAB ==================== */}
        <TabsContent value="pre-trade" className="space-y-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Enter Order ID..."
                    value={orderId}
                    onChange={(e) => setOrderId(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") runValidation(); }}
                    className="pl-9"
                  />
                </div>
                <Button onClick={runValidation} disabled={validateMut.isPending || !orderId.trim()}>
                  <Play className="h-4 w-4 mr-2" />
                  {validateMut.isPending ? "Validating..." : "Validate"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {validationData && (
            <>
              <div className="flex items-center gap-2">
                <Badge className={validationData.passed ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}>
                  {validationData.passed ? "PASSED" : "FAILED"}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  Order {validationData.order_id} — {validationData.results.length} rule(s) checked
                </span>
              </div>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Rule</TableHead>
                      <TableHead>Result</TableHead>
                      <TableHead>Severity</TableHead>
                      <TableHead>Message</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {validationData.results.length === 0 ? (
                      <EmptyRow cols={5} msg="No validation rules returned" />
                    ) : (
                      validationData.results.map((r, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="font-mono text-xs">{r.rule}</TableCell>
                          <TableCell>
                            {r.passed ? (
                              <Badge className="bg-green-100 text-green-800"><CheckCircle className="h-3 w-3 mr-1" />Pass</Badge>
                            ) : (
                              <Badge className="bg-red-100 text-red-800"><XCircle className="h-3 w-3 mr-1" />Fail</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge className={r.severity === "hard" ? "bg-red-100 text-red-800" : "bg-yellow-100 text-yellow-800"}>
                              {r.severity.toUpperCase()}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm max-w-xs truncate">{r.message}</TableCell>
                          <TableCell className="text-right">
                            {!r.passed && r.severity === "soft" && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  overrideMut.mutate({
                                    order_id: validationData.order_id,
                                    rule: r.rule,
                                    severity: r.severity,
                                    justification: "Override approved by compliance officer",
                                  })
                                }
                                disabled={overrideMut.isPending}
                              >
                                Override
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </>
          )}

          {validateMut.isError && (
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-red-600">Validation failed. Please check the Order ID and try again.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ==================== POST-TRADE MONITOR TAB ==================== */}
        <TabsContent value="post-trade" className="space-y-4">
          <Card>
            <CardContent className="pt-6">
              <h3 className="text-sm font-semibold mb-4">Breach Aging Distribution</h3>
              {breachAgingQ.isLoading ? (
                <div className="flex items-end gap-3 h-40">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="flex-1 h-full" />
                  ))}
                </div>
              ) : breachBuckets.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No breach data available</p>
              ) : (
                <div className="flex items-end gap-3 h-48">
                  {breachBuckets.map((bucket, idx) => {
                    const maxCount = Math.max(...breachBuckets.map((b) => b.count), 1);
                    const heightPct = (bucket.count / maxCount) * 100;
                    const barColor = bucket.severity === "hard" ? "bg-red-500" : "bg-yellow-500";
                    return (
                      <div key={idx} className="flex-1 flex flex-col items-center gap-1">
                        <span className="text-xs font-bold">{bucket.count}</span>
                        <div className="w-full flex items-end" style={{ height: "160px" }}>
                          <div
                            className={`w-full rounded-t ${barColor} transition-all`}
                            style={{ height: `${Math.max(heightPct, 4)}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground text-center">{bucket.bucket}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Separator />

          <h3 className="text-sm font-semibold">Active Breaches</h3>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Dimension</TableHead>
                  <TableHead className="text-right">Limit</TableHead>
                  <TableHead className="text-right">Exposure</TableHead>
                  <TableHead>Utilization</TableHead>
                  <TableHead>Severity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {limitsQ.isLoading ? (
                  <SkeletonRows cols={6} />
                ) : (() => {
                  const breached = limits.filter((l) => {
                    const pct = utilizationPct(l.current_exposure, l.limit_amount);
                    return pct >= l.warning_threshold;
                  });
                  if (breached.length === 0) return <EmptyRow cols={6} msg="No active breaches" />;
                  return breached.map((l) => {
                    const pct = utilizationPct(l.current_exposure, l.limit_amount);
                    const isHard = pct >= l.hard_threshold;
                    return (
                      <TableRow key={l.id}>
                        <TableCell>
                          <Badge className={badgeColor(l.limit_type, LIMIT_TYPE_COLORS)}>{l.limit_type}</Badge>
                        </TableCell>
                        <TableCell className="text-sm">{l.dimension_value}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{formatNumber(l.limit_amount)}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{formatNumber(l.current_exposure)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-20 rounded-full bg-gray-200">
                              <div className={`h-2 rounded-full ${isHard ? "bg-red-500" : "bg-yellow-500"}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                            </div>
                            <span className="text-xs font-medium">{pct.toFixed(1)}%</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={isHard ? "bg-red-100 text-red-800" : "bg-yellow-100 text-yellow-800"}>
                            {isHard ? "HARD" : "SOFT"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  });
                })()}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ==================== EXPIRING LINES TAB ==================== */}
        <TabsContent value="expiring" className="space-y-4">
          {[
            { label: "Expiring within 30 days", max: 30 },
            { label: "Expiring within 31-60 days", min: 31, max: 60 },
            { label: "Expiring within 61-90 days", min: 61, max: 90 },
          ].map((bucket) => {
            const filtered = expiringLines.filter((l) => {
              if (bucket.min) return l.days_until_expiry >= bucket.min && l.days_until_expiry <= bucket.max;
              return l.days_until_expiry <= bucket.max;
            });
            return (
              <div key={bucket.label}>
                <h3 className="text-sm font-semibold mb-2">{bucket.label} ({filtered.length})</h3>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead>Dimension Value</TableHead>
                        <TableHead className="text-right">Limit Amount</TableHead>
                        <TableHead>Expires</TableHead>
                        <TableHead className="text-right">Days Left</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {expiringQ.isLoading ? (
                        <SkeletonRows cols={5} rows={3} />
                      ) : filtered.length === 0 ? (
                        <EmptyRow cols={5} msg="No lines expiring in this period" />
                      ) : (
                        filtered.map((line) => (
                          <TableRow key={line.id}>
                            <TableCell>
                              <Badge className={badgeColor(line.limit_type, LIMIT_TYPE_COLORS)}>{line.limit_type}</Badge>
                            </TableCell>
                            <TableCell className="font-mono text-xs">{line.dimension_value}</TableCell>
                            <TableCell className="text-right font-mono text-sm">{formatNumber(line.limit_amount)}</TableCell>
                            <TableCell className="text-xs">{formatDate(line.effective_to)}</TableCell>
                            <TableCell className="text-right">
                              <Badge className={line.days_until_expiry <= 7 ? "bg-red-100 text-red-800" : line.days_until_expiry <= 30 ? "bg-yellow-100 text-yellow-800" : "bg-gray-100 text-gray-800"}>
                                {line.days_until_expiry}d
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
                <Separator className="mt-4" />
              </div>
            );
          })}
        </TabsContent>
      </Tabs>

      {/* ==================== ADD / EDIT DIALOG ==================== */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Limit" : "Add Compliance Limit"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-medium">Limit Type</label>
                <Select value={form.limit_type} onValueChange={(v) => setForm((f) => ({ ...f, limit_type: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LIMIT_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Dimension</label>
                <Input
                  placeholder="e.g., portfolio_id"
                  value={form.dimension}
                  onChange={(e) => setForm((f) => ({ ...f, dimension: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Dimension Value</label>
              <Input
                placeholder="e.g., TRADER-001"
                value={form.dimension_value}
                onChange={(e) => setForm((f) => ({ ...f, dimension_value: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-medium">Limit Amount</label>
                <Input
                  type="number"
                  placeholder="1000000"
                  value={form.limit_amount}
                  onChange={(e) => setForm((f) => ({ ...f, limit_amount: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Warning %</label>
                <Input
                  type="number"
                  placeholder="80"
                  value={form.warning_threshold}
                  onChange={(e) => setForm((f) => ({ ...f, warning_threshold: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Hard %</label>
                <Input
                  type="number"
                  placeholder="100"
                  value={form.hard_threshold}
                  onChange={(e) => setForm((f) => ({ ...f, hard_threshold: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-medium">Effective From</label>
                <Input
                  type="date"
                  value={form.effective_from}
                  onChange={(e) => setForm((f) => ({ ...f, effective_from: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Effective To (optional)</label>
                <Input
                  type="date"
                  value={form.effective_to}
                  onChange={(e) => setForm((f) => ({ ...f, effective_to: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={submitForm}
              disabled={upsertMut.isPending || !form.dimension_value || !form.limit_amount || !form.effective_from}
            >
              {upsertMut.isPending ? "Saving..." : editingId ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
