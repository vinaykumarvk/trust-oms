/**
 * ORE Case Manager — Phase 4C (Operational Risk Event Management)
 *
 * Basel II/III seven-category taxonomy for operational risk events.
 * Three-tab interface: Events listing, Record Event form, and
 * Quarterly Report generation. Summary cards surface aggregate
 * metrics. Dialogs for loss quantification and root-cause analysis.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@ui/lib/queryClient";
import { apiUrl } from "@ui/lib/api-url";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/ui/card";
import { Badge } from "@ui/components/ui/badge";
import { Button } from "@ui/components/ui/button";
import { Input } from "@ui/components/ui/input";
import { Textarea } from "@ui/components/ui/textarea";
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
  AlertTriangle, FileText, RefreshCw, Plus, CheckCircle,
  DollarSign, ClipboardList, Send, BarChart3,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface OreEvent {
  id: string;
  basel_category: string;
  description: string;
  gross_loss: number | null;
  net_loss: number | null;
  recovery: number | null;
  root_cause: string | null;
  corrective_action: string | null;
  bsp_reported: boolean;
  created_at: string;
  updated_at: string;
}

interface OreListResponse {
  data: OreEvent[];
  total: number;
  page: number;
  pageSize: number;
}

interface OreSummary {
  total_events: number;
  unquantified: number;
  pending_root_cause: number;
  reported_to_bsp: number;
  total_gross_loss: number;
  total_net_loss: number;
  total_recovery: number;
}

interface QuarterlyCategory {
  basel_category: string;
  event_count: number;
  gross_loss: number;
  net_loss: number;
  recovery: number;
}

interface QuarterlyReport {
  quarter: string;
  summary: QuarterlyCategory[];
  totals: {
    event_count: number;
    gross_loss: number;
    net_loss: number;
    recovery: number;
  };
  events: OreEvent[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const BASEL_CATEGORIES = [
  "Internal Fraud",
  "External Fraud",
  "Employment Practices",
  "Clients/Products",
  "Damage to Assets",
  "Business Disruption",
  "Execution/Delivery",
] as const;

type BaselCategory = (typeof BASEL_CATEGORIES)[number];

const BASEL_COLORS: Record<string, string> = {
  "Internal Fraud": "bg-red-100 text-red-800",
  "External Fraud": "bg-orange-100 text-orange-800",
  "Employment Practices": "bg-yellow-100 text-yellow-800",
  "Clients/Products": "bg-blue-100 text-blue-800",
  "Damage to Assets": "bg-purple-100 text-purple-800",
  "Business Disruption": "bg-muted text-foreground",
  "Execution/Delivery": "bg-teal-100 text-teal-800",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatDate(d: string | null): string {
  if (!d) return "-";
  try {
    return new Date(d).toLocaleDateString("en-PH", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return d;
  }
}

function formatCurrency(n: number | null): string {
  if (n === null || n === undefined) return "-";
  return n.toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatNumber(n: number): string {
  return n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function truncate(s: string, len: number = 60): string {
  if (!s) return "-";
  return s.length > len ? s.slice(0, len) + "..." : s;
}

function badgeColor(category: string): string {
  return BASEL_COLORS[category] ?? "bg-muted text-foreground";
}

// Reusable sub-components
function SummaryCard({
  title,
  value,
  icon: Icon,
  accent,
}: {
  title: string;
  value: string | number;
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

// Generate quarter options for the last 8 quarters
function getQuarterOptions(): string[] {
  const now = new Date();
  const quarters: string[] = [];
  let year = now.getFullYear();
  let q = Math.ceil((now.getMonth() + 1) / 3);
  for (let i = 0; i < 8; i++) {
    quarters.push(`${year}-Q${q}`);
    q--;
    if (q === 0) {
      q = 4;
      year--;
    }
  }
  return quarters;
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------
export default function OreCaseManager() {
  const qc = useQueryClient();
  const [tab, setTab] = useState("events");

  // Events tab state
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterBsp, setFilterBsp] = useState<string>("all");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  // Record event form state
  const [newCategory, setNewCategory] = useState<string>(BASEL_CATEGORIES[0]);
  const [newDescription, setNewDescription] = useState("");

  // Quarterly report state
  const [selectedQuarter, setSelectedQuarter] = useState<string>(getQuarterOptions()[0]);
  const [quarterlyData, setQuarterlyData] = useState<QuarterlyReport | null>(null);

  // Dialog states
  const [quantifyOpen, setQuantifyOpen] = useState(false);
  const [quantifyId, setQuantifyId] = useState<string | null>(null);
  const [quantifyForm, setQuantifyForm] = useState({ grossLoss: "", netLoss: "", recovery: "" });

  const [rootCauseOpen, setRootCauseOpen] = useState(false);
  const [rootCauseId, setRootCauseId] = useState<string | null>(null);
  const [rootCauseForm, setRootCauseForm] = useState({ rootCause: "", correctiveAction: "" });

  // --- Queries ---
  const eventsQ = useQuery<OreListResponse>({
    queryKey: ["ore-events", filterCategory, filterBsp, page],
    queryFn: () => {
      const p = new URLSearchParams();
      p.set("page", String(page));
      p.set("pageSize", String(pageSize));
      if (filterCategory !== "all") p.set("basel_category", filterCategory);
      if (filterBsp !== "all") p.set("bsp_reported", filterBsp);
      return apiRequest("GET", apiUrl(`/api/v1/ore?${p.toString()}`));
    },
    refetchInterval: 30_000,
  });
  const events = eventsQ.data?.data ?? [];
  const eventsTotal = eventsQ.data?.total ?? 0;
  const totalPages = Math.ceil(eventsTotal / pageSize);

  const summaryQ = useQuery<OreSummary>({
    queryKey: ["ore-summary"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/ore/summary")),
    refetchInterval: 30_000,
  });
  const summary = summaryQ.data;

  // --- Mutations ---
  const createMut = useMutation({
    mutationFn: (body: { basel_category: string; description: string }) =>
      apiRequest("POST", apiUrl("/api/v1/ore"), body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ore-events"] });
      qc.invalidateQueries({ queryKey: ["ore-summary"] });
      setNewDescription("");
      setTab("events");
    },
  });

  const quantifyMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      apiRequest("POST", apiUrl(`/api/v1/ore/${id}/quantify`), body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ore-events"] });
      qc.invalidateQueries({ queryKey: ["ore-summary"] });
      setQuantifyOpen(false);
      setQuantifyId(null);
      setQuantifyForm({ grossLoss: "", netLoss: "", recovery: "" });
    },
  });

  const rootCauseMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      apiRequest("POST", apiUrl(`/api/v1/ore/${id}/root-cause`), body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ore-events"] });
      qc.invalidateQueries({ queryKey: ["ore-summary"] });
      setRootCauseOpen(false);
      setRootCauseId(null);
      setRootCauseForm({ rootCause: "", correctiveAction: "" });
    },
  });

  const reportBspMut = useMutation({
    mutationFn: (id: string) =>
      apiRequest("POST", apiUrl(`/api/v1/ore/${id}/report-bsp`)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ore-events"] });
      qc.invalidateQueries({ queryKey: ["ore-summary"] });
    },
  });

  const quarterlyMut = useMutation({
    mutationFn: (quarter: string) =>
      apiRequest("GET", apiUrl(`/api/v1/ore/quarterly-report?quarter=${quarter}`)),
    onSuccess: (data: QuarterlyReport) => {
      setQuarterlyData(data);
    },
  });

  // --- Handlers ---
  const openQuantify = (ev: OreEvent) => {
    setQuantifyId(ev.id);
    setQuantifyForm({
      grossLoss: ev.gross_loss !== null ? String(ev.gross_loss) : "",
      netLoss: ev.net_loss !== null ? String(ev.net_loss) : "",
      recovery: ev.recovery !== null ? String(ev.recovery) : "",
    });
    setQuantifyOpen(true);
  };

  const submitQuantify = () => {
    if (!quantifyId) return;
    quantifyMut.mutate({
      id: quantifyId,
      body: {
        gross_loss: quantifyForm.grossLoss ? parseFloat(quantifyForm.grossLoss) : null,
        net_loss: quantifyForm.netLoss ? parseFloat(quantifyForm.netLoss) : null,
        recovery: quantifyForm.recovery ? parseFloat(quantifyForm.recovery) : null,
      },
    });
  };

  const openRootCause = (ev: OreEvent) => {
    setRootCauseId(ev.id);
    setRootCauseForm({
      rootCause: ev.root_cause ?? "",
      correctiveAction: ev.corrective_action ?? "",
    });
    setRootCauseOpen(true);
  };

  const submitRootCause = () => {
    if (!rootCauseId) return;
    rootCauseMut.mutate({
      id: rootCauseId,
      body: {
        root_cause: rootCauseForm.rootCause,
        corrective_action: rootCauseForm.correctiveAction,
      },
    });
  };

  const submitNewEvent = () => {
    if (!newDescription.trim()) return;
    createMut.mutate({ basel_category: newCategory, description: newDescription.trim() });
  };

  const generateReport = () => {
    if (!selectedQuarter) return;
    setQuarterlyData(null);
    quarterlyMut.mutate(selectedQuarter);
  };

  // --- Render ---
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <AlertTriangle className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">ORE Case Manager</h1>
            <p className="text-sm text-muted-foreground">
              Operational Risk Event management with Basel II/III taxonomy
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            eventsQ.refetch();
            summaryQ.refetch();
          }}
          disabled={eventsQ.isFetching}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${eventsQ.isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-7">
        <SummaryCard
          title="Total Events"
          value={summary?.total_events ?? 0}
          icon={ClipboardList}
          accent="bg-blue-600"
        />
        <SummaryCard
          title="Unquantified"
          value={summary?.unquantified ?? 0}
          icon={AlertTriangle}
          accent="bg-yellow-500"
        />
        <SummaryCard
          title="Pending Root Cause"
          value={summary?.pending_root_cause ?? 0}
          icon={FileText}
          accent="bg-orange-500"
        />
        <SummaryCard
          title="Reported to BSP"
          value={summary?.reported_to_bsp ?? 0}
          icon={Send}
          accent="bg-green-600"
        />
        <SummaryCard
          title="Total Gross Loss"
          value={formatCurrency(summary?.total_gross_loss ?? 0)}
          icon={DollarSign}
          accent="bg-red-600"
        />
        <SummaryCard
          title="Total Net Loss"
          value={formatCurrency(summary?.total_net_loss ?? 0)}
          icon={DollarSign}
          accent="bg-red-500"
        />
        <SummaryCard
          title="Total Recovery"
          value={formatCurrency(summary?.total_recovery ?? 0)}
          icon={DollarSign}
          accent="bg-emerald-600"
        />
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="events">Events</TabsTrigger>
          <TabsTrigger value="record">Record Event</TabsTrigger>
          <TabsTrigger value="quarterly">Quarterly Report</TabsTrigger>
        </TabsList>

        {/* ==================== EVENTS TAB ==================== */}
        <TabsContent value="events" className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <Select
              value={filterCategory}
              onValueChange={(v) => {
                setFilterCategory(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {BASEL_CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={filterBsp}
              onValueChange={(v) => {
                setFilterBsp(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="BSP Reported" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All BSP Status</SelectItem>
                <SelectItem value="true">Reported</SelectItem>
                <SelectItem value="false">Not Reported</SelectItem>
              </SelectContent>
            </Select>

            <span className="text-sm text-muted-foreground ml-auto">
              {eventsTotal} event{eventsTotal !== 1 ? "s" : ""} found
            </span>
          </div>

          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Basel Category</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Gross Loss</TableHead>
                  <TableHead className="text-right">Net Loss</TableHead>
                  <TableHead className="text-right">Recovery</TableHead>
                  <TableHead>Root Cause</TableHead>
                  <TableHead>BSP</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {eventsQ.isLoading ? (
                  <SkeletonRows cols={10} />
                ) : events.length === 0 ? (
                  <EmptyRow cols={10} msg="No operational risk events found" />
                ) : (
                  events.map((ev) => (
                    <TableRow key={ev.id}>
                      <TableCell className="font-mono text-xs">{ev.id.slice(0, 8)}</TableCell>
                      <TableCell>
                        <Badge className={badgeColor(ev.basel_category)}>
                          {ev.basel_category}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm max-w-xs truncate">
                        {truncate(ev.description)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatCurrency(ev.gross_loss)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatCurrency(ev.net_loss)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatCurrency(ev.recovery)}
                      </TableCell>
                      <TableCell className="text-center">
                        {ev.root_cause ? (
                          <CheckCircle className="h-4 w-4 text-green-600 mx-auto" />
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {ev.bsp_reported ? (
                          <Badge className="bg-green-100 text-green-800">Reported</Badge>
                        ) : (
                          <Badge className="bg-muted text-muted-foreground">Pending</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">{formatDate(ev.created_at)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Quantify Loss"
                            onClick={() => openQuantify(ev)}
                          >
                            <DollarSign className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Record Root Cause"
                            onClick={() => openRootCause(ev)}
                          >
                            <FileText className="h-4 w-4" />
                          </Button>
                          {!ev.bsp_reported && (
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Report to BSP"
                              className="text-blue-600 hover:text-blue-700"
                              onClick={() => reportBspMut.mutate(ev.id)}
                              disabled={reportBspMut.isPending}
                            >
                              <Send className="h-4 w-4" />
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
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, eventsTotal)} of{" "}
                {eventsTotal}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}

          {eventsQ.isError && (
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-red-600">
                  Failed to load operational risk events. Please try again.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ==================== RECORD EVENT TAB ==================== */}
        <TabsContent value="record" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Plus className="h-5 w-5" />
                Record New Operational Risk Event
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">Basel Category</label>
                <Select value={newCategory} onValueChange={setNewCategory}>
                  <SelectTrigger className="w-full max-w-md">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {BASEL_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Basel II/III Level 1 operational risk event category
                </p>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium">Event Description</label>
                <Textarea
                  placeholder="Describe the operational risk event in detail, including what happened, when it was discovered, affected systems or processes, and estimated impact..."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  rows={6}
                  className="max-w-2xl"
                />
              </div>

              <Separator />

              <div className="flex items-center gap-3">
                <Button
                  onClick={submitNewEvent}
                  disabled={createMut.isPending || !newDescription.trim()}
                >
                  {createMut.isPending ? "Submitting..." : "Submit Event"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setNewCategory(BASEL_CATEGORIES[0]);
                    setNewDescription("");
                  }}
                >
                  Clear
                </Button>
              </div>

              {createMut.isError && (
                <p className="text-sm text-red-600">Failed to create event. Please try again.</p>
              )}
              {createMut.isSuccess && (
                <p className="text-sm text-green-600">Event recorded successfully.</p>
              )}
            </CardContent>
          </Card>

          {/* Basel Category Reference */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Basel II/III Category Reference</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
                {BASEL_CATEGORIES.map((cat) => (
                  <div key={cat} className="flex items-center gap-2">
                    <Badge className={badgeColor(cat)}>{cat}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ==================== QUARTERLY REPORT TAB ==================== */}
        <TabsContent value="quarterly" className="space-y-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium">Quarter</label>
                  <Select value={selectedQuarter} onValueChange={setSelectedQuarter}>
                    <SelectTrigger className="w-[160px]">
                      <SelectValue placeholder="Select quarter" />
                    </SelectTrigger>
                    <SelectContent>
                      {getQuarterOptions().map((q) => (
                        <SelectItem key={q} value={q}>
                          {q}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button onClick={generateReport} disabled={quarterlyMut.isPending}>
                    <BarChart3 className="h-4 w-4 mr-2" />
                    {quarterlyMut.isPending ? "Generating..." : "Generate Report"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {quarterlyMut.isError && (
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-red-600">
                  Failed to generate quarterly report. Please try again.
                </p>
              </CardContent>
            </Card>
          )}

          {quarterlyData && (
            <>
              {/* Summary by Category */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">
                    Quarterly Summary: {quarterlyData.quarter}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Basel Category</TableHead>
                          <TableHead className="text-right">Events</TableHead>
                          <TableHead className="text-right">Gross Loss</TableHead>
                          <TableHead className="text-right">Net Loss</TableHead>
                          <TableHead className="text-right">Recovery</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {quarterlyData.summary.length === 0 ? (
                          <EmptyRow cols={5} msg="No events for this quarter" />
                        ) : (
                          <>
                            {quarterlyData.summary.map((row) => (
                              <TableRow key={row.basel_category}>
                                <TableCell>
                                  <Badge className={badgeColor(row.basel_category)}>
                                    {row.basel_category}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right font-mono">
                                  {row.event_count}
                                </TableCell>
                                <TableCell className="text-right font-mono text-sm">
                                  {formatNumber(row.gross_loss)}
                                </TableCell>
                                <TableCell className="text-right font-mono text-sm">
                                  {formatNumber(row.net_loss)}
                                </TableCell>
                                <TableCell className="text-right font-mono text-sm">
                                  {formatNumber(row.recovery)}
                                </TableCell>
                              </TableRow>
                            ))}
                            <TableRow className="bg-muted/50 font-semibold">
                              <TableCell>Totals</TableCell>
                              <TableCell className="text-right font-mono">
                                {quarterlyData.totals.event_count}
                              </TableCell>
                              <TableCell className="text-right font-mono text-sm">
                                {formatNumber(quarterlyData.totals.gross_loss)}
                              </TableCell>
                              <TableCell className="text-right font-mono text-sm">
                                {formatNumber(quarterlyData.totals.net_loss)}
                              </TableCell>
                              <TableCell className="text-right font-mono text-sm">
                                {formatNumber(quarterlyData.totals.recovery)}
                              </TableCell>
                            </TableRow>
                          </>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              {/* Event Listing */}
              {quarterlyData.events.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">
                      Event Details ({quarterlyData.events.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>ID</TableHead>
                            <TableHead>Category</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead className="text-right">Gross Loss</TableHead>
                            <TableHead className="text-right">Net Loss</TableHead>
                            <TableHead>BSP</TableHead>
                            <TableHead>Date</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {quarterlyData.events.map((ev) => (
                            <TableRow key={ev.id}>
                              <TableCell className="font-mono text-xs">
                                {ev.id.slice(0, 8)}
                              </TableCell>
                              <TableCell>
                                <Badge className={badgeColor(ev.basel_category)}>
                                  {ev.basel_category}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-sm max-w-xs truncate">
                                {truncate(ev.description, 50)}
                              </TableCell>
                              <TableCell className="text-right font-mono text-sm">
                                {formatCurrency(ev.gross_loss)}
                              </TableCell>
                              <TableCell className="text-right font-mono text-sm">
                                {formatCurrency(ev.net_loss)}
                              </TableCell>
                              <TableCell>
                                {ev.bsp_reported ? (
                                  <Badge className="bg-green-100 text-green-800">Yes</Badge>
                                ) : (
                                  <Badge className="bg-muted text-muted-foreground">No</Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-xs">
                                {formatDate(ev.created_at)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* ==================== QUANTIFY LOSS DIALOG ==================== */}
      <Dialog open={quantifyOpen} onOpenChange={setQuantifyOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Quantify Loss</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-1">
              <label className="text-xs font-medium">Gross Loss (PHP)</label>
              <Input
                type="number"
                placeholder="0.00"
                value={quantifyForm.grossLoss}
                onChange={(e) =>
                  setQuantifyForm((f) => ({ ...f, grossLoss: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Net Loss (PHP)</label>
              <Input
                type="number"
                placeholder="0.00"
                value={quantifyForm.netLoss}
                onChange={(e) =>
                  setQuantifyForm((f) => ({ ...f, netLoss: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Recovery (PHP)</label>
              <Input
                type="number"
                placeholder="0.00"
                value={quantifyForm.recovery}
                onChange={(e) =>
                  setQuantifyForm((f) => ({ ...f, recovery: e.target.value }))
                }
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Net Loss = Gross Loss - Recovery. Leave fields blank if not yet determined.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuantifyOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitQuantify} disabled={quantifyMut.isPending}>
              {quantifyMut.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================== ROOT CAUSE DIALOG ==================== */}
      <Dialog open={rootCauseOpen} onOpenChange={setRootCauseOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Record Root Cause</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-1">
              <label className="text-xs font-medium">Root Cause Analysis</label>
              <Textarea
                placeholder="Describe the root cause of this operational risk event..."
                value={rootCauseForm.rootCause}
                onChange={(e) =>
                  setRootCauseForm((f) => ({ ...f, rootCause: e.target.value }))
                }
                rows={4}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Corrective Action</label>
              <Textarea
                placeholder="Describe corrective actions taken or planned..."
                value={rootCauseForm.correctiveAction}
                onChange={(e) =>
                  setRootCauseForm((f) => ({ ...f, correctiveAction: e.target.value }))
                }
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRootCauseOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={submitRootCause}
              disabled={rootCauseMut.isPending || !rootCauseForm.rootCause.trim()}
            >
              {rootCauseMut.isPending ? "Saving..." : "Save Root Cause"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
