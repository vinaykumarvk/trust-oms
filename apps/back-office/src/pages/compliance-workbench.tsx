/**
 * Compliance Workbench — Phase 4A (BRD Screen #7)
 *
 * CCO / Compliance Officer's centralized command centre. Five-tab layout:
 *   1. Breaches — active compliance breaches with severity, filtering, resolve action
 *   2. AML/KYC  — flagged KYC entries with link to KYC dashboard
 *   3. Surveillance — trade surveillance alerts by pattern type
 *   4. STR Queue — pending suspicious transaction reports with file action
 *   5. Reversals — quick summary / link to reversals desk
 *
 * Top row shows five summary cards: Compliance Score, Active Breaches,
 * AML Alerts, Pending STRs, and Surveillance Hits. Auto-refreshes every
 * 30 seconds.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@ui/lib/queryClient";
import { apiUrl } from "@ui/lib/api-url";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/ui/card";
import { Badge } from "@ui/components/ui/badge";
import { Button } from "@ui/components/ui/button";
import { Input } from "@ui/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@ui/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@ui/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@ui/components/ui/select";
import { Textarea } from "@ui/components/ui/textarea";
import { Skeleton } from "@ui/components/ui/skeleton";
import {
  ShieldCheck, AlertTriangle, AlertOctagon, Search, RefreshCw,
  CheckCircle, XCircle, Eye, FileText, RotateCcw, Activity,
  Shield, Ban, TrendingUp,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ComplianceSummary {
  compliance_score: number;
  active_breaches: number;
  aml_alerts: number;
  pending_strs: number;
  surveillance_hits: number;
}

interface Breach {
  id: string;
  portfolio_id: string;
  portfolio_name: string;
  rule_type: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  description: string;
  detected_at: string;
  status: "OPEN" | "RESOLVED";
  resolved_at: string | null;
  resolution_note: string | null;
}

interface BreachesResponse {
  data: Breach[];
  total: number;
}

interface AmlFlag {
  id: string;
  client_id: string;
  client_name: string;
  flag_reason: string;
  risk_rating: string;
  status: "FLAGGED" | "CLEARED" | "UNDER_REVIEW";
  flagged_at: string;
}

interface AmlResponse {
  data: AmlFlag[];
  total: number;
}

interface SurveillanceAlert {
  id: string;
  pattern_type: "LAYERING" | "SPOOFING" | "WASH_TRADING" | "FRONT_RUNNING" | "INSIDER_TRADING";
  score: number;
  order_ids: string[];
  account_id: string;
  disposition: "PENDING" | "ESCALATED" | "DISMISSED" | "CONFIRMED";
  detected_at: string;
  description: string;
}

interface SurveillanceResponse {
  data: SurveillanceAlert[];
  total: number;
}

interface StrReport {
  id: string;
  client_id: string;
  client_name: string;
  report_type: string;
  reason: string;
  amount: number;
  currency: string;
  status: "PENDING" | "FILED" | "REJECTED";
  created_at: string;
  filed_at: string | null;
}

interface StrResponse {
  data: StrReport[];
  total: number;
}

interface ReversalSummary {
  pending: number;
  approved: number;
  rejected: number;
  total: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SEVERITY_COLORS: Record<string, string> = {
  HIGH: "bg-red-100 text-red-800",
  MEDIUM: "bg-yellow-100 text-yellow-800",
  LOW: "bg-green-100 text-green-800",
};

const PATTERN_COLORS: Record<string, string> = {
  LAYERING: "bg-red-100 text-red-800",
  SPOOFING: "bg-orange-100 text-orange-800",
  WASH_TRADING: "bg-red-100 text-red-800",
  FRONT_RUNNING: "bg-purple-100 text-purple-800",
  INSIDER_TRADING: "bg-rose-100 text-rose-800",
};

const DISPOSITION_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  ESCALATED: "bg-red-100 text-red-800",
  DISMISSED: "bg-muted text-foreground",
  CONFIRMED: "bg-blue-100 text-blue-800",
};

const STR_STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  FILED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(d: string | null): string {
  if (!d) return "-";
  try {
    return new Date(d).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return d;
  }
}

function formatCurrency(n: number, currency: string): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: currency || "USD",
    minimumFractionDigits: 2,
  });
}

function scoreColor(score: number): string {
  if (score >= 80) return "text-green-600";
  if (score >= 60) return "text-yellow-600";
  return "text-red-600";
}

function scoreBg(score: number): string {
  if (score >= 80) return "bg-green-600";
  if (score >= 60) return "bg-yellow-500";
  return "bg-red-600";
}

function badgeClass(key: string, map: Record<string, string>): string {
  return map[key] ?? "bg-muted text-foreground";
}

// Reusable sub-components
function SummaryCard({
  title,
  value,
  icon: Icon,
  accent,
  subtitle,
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  accent: string;
  subtitle?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className={`mt-1 text-2xl font-bold ${accent.startsWith("text-") ? accent : ""}`}>
              {value}
            </p>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
            )}
          </div>
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-lg ${
              accent.startsWith("text-") ? "bg-primary/10" : accent
            }`}
          >
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

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function ComplianceWorkbench() {
  const qc = useQueryClient();
  const [tab, setTab] = useState("breaches");

  // -- Breach tab state --
  const [breachSeverityFilter, setBreachSeverityFilter] = useState<string>("all");
  const [breachStatusFilter, setBreachStatusFilter] = useState<string>("all");
  const [breachPortfolioSearch, setBreachPortfolioSearch] = useState("");
  const [resolveDialogOpen, setResolveDialogOpen] = useState(false);
  const [resolvingBreach, setResolvingBreach] = useState<Breach | null>(null);
  const [resolutionNote, setResolutionNote] = useState("");

  // -- AML tab state --
  const [amlSearch, setAmlSearch] = useState("");

  // -- Surveillance tab state --
  const [survPatternFilter, setSurvPatternFilter] = useState<string>("all");

  // -- STR tab state --
  const [strStatusFilter, setStrStatusFilter] = useState<string>("all");

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  const summaryQ = useQuery<ComplianceSummary>({
    queryKey: ["compliance", "summary"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/compliance/summary")),
    refetchInterval: 30_000,
  });

  const breachesQ = useQuery<BreachesResponse>({
    queryKey: ["compliance", "breaches"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/compliance/breaches")),
    refetchInterval: 30_000,
  });

  const amlQ = useQuery<AmlResponse>({
    queryKey: ["compliance", "aml-flags"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/compliance/aml-flags")),
    refetchInterval: 30_000,
    enabled: tab === "aml",
  });

  const surveillanceQ = useQuery<SurveillanceResponse>({
    queryKey: ["compliance", "surveillance"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/compliance/surveillance")),
    refetchInterval: 30_000,
    enabled: tab === "surveillance",
  });

  const strQ = useQuery<StrResponse>({
    queryKey: ["compliance", "str-queue"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/compliance/str-queue")),
    refetchInterval: 30_000,
    enabled: tab === "str",
  });

  const reversalSummaryQ = useQuery<ReversalSummary>({
    queryKey: ["compliance", "reversals-summary"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/compliance/reversals/summary")),
    refetchInterval: 30_000,
    enabled: tab === "reversals",
  });

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------

  const resolveMut = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      apiRequest("POST", apiUrl(`/api/v1/compliance/breaches/${id}/resolve`), {
        resolution_note: note,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["compliance"] });
      setResolveDialogOpen(false);
      setResolvingBreach(null);
      setResolutionNote("");
    },
  });

  const fileStrMut = useMutation({
    mutationFn: (id: string) =>
      apiRequest("POST", apiUrl(`/api/v1/compliance/str-queue/${id}/file`)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["compliance", "str-queue"] });
      qc.invalidateQueries({ queryKey: ["compliance", "summary"] });
    },
  });

  // ---------------------------------------------------------------------------
  // Derived Data
  // ---------------------------------------------------------------------------

  const summary = summaryQ.data;
  const breaches = breachesQ.data?.data ?? [];
  const amlFlags = amlQ.data?.data ?? [];
  const surveillanceAlerts = surveillanceQ.data?.data ?? [];
  const strReports = strQ.data?.data ?? [];
  const reversalSummary = reversalSummaryQ.data;

  // Breach filtering
  const filteredBreaches = breaches.filter((b) => {
    if (breachSeverityFilter !== "all" && b.severity !== breachSeverityFilter) return false;
    if (breachStatusFilter !== "all" && b.status !== breachStatusFilter) return false;
    if (
      breachPortfolioSearch &&
      !b.portfolio_name.toLowerCase().includes(breachPortfolioSearch.toLowerCase()) &&
      !b.portfolio_id.toLowerCase().includes(breachPortfolioSearch.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  // AML filtering
  const filteredAml = amlFlags.filter((f) => {
    if (!amlSearch) return true;
    const term = amlSearch.toLowerCase();
    return (
      f.client_name.toLowerCase().includes(term) ||
      f.client_id.toLowerCase().includes(term) ||
      f.flag_reason.toLowerCase().includes(term)
    );
  });

  // Surveillance filtering
  const filteredSurveillance = surveillanceAlerts.filter((a) => {
    if (survPatternFilter !== "all" && a.pattern_type !== survPatternFilter) return false;
    return true;
  });

  // STR filtering
  const filteredStr = strReports.filter((s) => {
    if (strStatusFilter !== "all" && s.status !== strStatusFilter) return false;
    return true;
  });

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const openResolve = (breach: Breach) => {
    setResolvingBreach(breach);
    setResolutionNote("");
    setResolveDialogOpen(true);
  };

  const submitResolve = () => {
    if (!resolvingBreach || !resolutionNote.trim()) return;
    resolveMut.mutate({ id: resolvingBreach.id, note: resolutionNote.trim() });
  };

  const refreshAll = () => {
    summaryQ.refetch();
    breachesQ.refetch();
    if (tab === "aml") amlQ.refetch();
    if (tab === "surveillance") surveillanceQ.refetch();
    if (tab === "str") strQ.refetch();
    if (tab === "reversals") reversalSummaryQ.refetch();
  };

  // ---------------------------------------------------------------------------
  // Loading skeleton
  // ---------------------------------------------------------------------------

  if (summaryQ.isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-56" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const complianceScore = summary?.compliance_score ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <ShieldCheck className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Compliance Workbench</h1>
            <p className="text-sm text-muted-foreground">
              CCO command centre — breaches, AML, surveillance, and STR management
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={refreshAll}
          disabled={summaryQ.isFetching}
        >
          <RefreshCw
            className={`h-4 w-4 mr-2 ${summaryQ.isFetching ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </div>

      {/* ====================== SUMMARY CARDS ====================== */}
      <div className="grid gap-4 md:grid-cols-5">
        {/* Compliance Score */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Compliance Score
                </p>
                <p className={`mt-1 text-3xl font-bold ${scoreColor(complianceScore)}`}>
                  {complianceScore}
                </p>
                <div className="mt-2 h-2 w-full rounded-full bg-muted">
                  <div
                    className={`h-2 rounded-full ${scoreBg(complianceScore)} transition-all`}
                    style={{ width: `${Math.min(complianceScore, 100)}%` }}
                  />
                </div>
              </div>
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-lg ${scoreBg(complianceScore)}`}
              >
                <Shield className="h-5 w-5 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Active Breaches */}
        <SummaryCard
          title="Active Breaches"
          value={summary?.active_breaches ?? 0}
          icon={AlertOctagon}
          accent="bg-red-600"
          subtitle="Requiring attention"
        />

        {/* AML Alerts */}
        <SummaryCard
          title="AML Alerts"
          value={summary?.aml_alerts ?? 0}
          icon={AlertTriangle}
          accent="bg-orange-500"
          subtitle="Flagged accounts"
        />

        {/* Pending STRs */}
        <SummaryCard
          title="Pending STRs"
          value={summary?.pending_strs ?? 0}
          icon={FileText}
          accent="bg-blue-600"
          subtitle="Awaiting filing"
        />

        {/* Surveillance Hits */}
        <SummaryCard
          title="Surveillance Hits"
          value={summary?.surveillance_hits ?? 0}
          icon={Activity}
          accent="bg-purple-600"
          subtitle="Trade patterns detected"
        />
      </div>

      {/* ====================== TABS ====================== */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="breaches">
            Breaches
            {(summary?.active_breaches ?? 0) > 0 && (
              <Badge className="ml-2 bg-red-100 text-red-800 text-xs">
                {summary?.active_breaches}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="aml">AML/KYC</TabsTrigger>
          <TabsTrigger value="surveillance">Surveillance</TabsTrigger>
          <TabsTrigger value="str">
            STR Queue
            {(summary?.pending_strs ?? 0) > 0 && (
              <Badge className="ml-2 bg-blue-100 text-blue-800 text-xs">
                {summary?.pending_strs}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="reversals">Reversals</TabsTrigger>
        </TabsList>

        {/* ==================== TAB 1: BREACHES ==================== */}
        <TabsContent value="breaches" className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search portfolio..."
                value={breachPortfolioSearch}
                onChange={(e) => setBreachPortfolioSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select
              value={breachSeverityFilter}
              onValueChange={setBreachSeverityFilter}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Severity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Severities</SelectItem>
                <SelectItem value="HIGH">High</SelectItem>
                <SelectItem value="MEDIUM">Medium</SelectItem>
                <SelectItem value="LOW">Low</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={breachStatusFilter}
              onValueChange={setBreachStatusFilter}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="OPEN">Open</SelectItem>
                <SelectItem value="RESOLVED">Resolved</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground">
              {filteredBreaches.length} breach(es)
            </span>
          </div>

          {/* Breaches Table */}
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Portfolio</TableHead>
                  <TableHead>Rule Type</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead className="max-w-[250px]">Description</TableHead>
                  <TableHead>Detected At</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {breachesQ.isLoading ? (
                  <SkeletonRows cols={8} />
                ) : filteredBreaches.length === 0 ? (
                  <EmptyRow cols={8} msg="No breaches match current filters" />
                ) : (
                  filteredBreaches.map((breach) => (
                    <TableRow key={breach.id}>
                      <TableCell className="font-mono text-xs">
                        {breach.id}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium">
                            {breach.portfolio_name}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {breach.portfolio_id}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{breach.rule_type}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={badgeClass(breach.severity, SEVERITY_COLORS)}>
                          {breach.severity}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[250px] truncate text-sm">
                        {breach.description}
                      </TableCell>
                      <TableCell className="text-xs">
                        {formatDate(breach.detected_at)}
                      </TableCell>
                      <TableCell>
                        {breach.status === "OPEN" ? (
                          <Badge className="bg-red-100 text-red-800">Open</Badge>
                        ) : (
                          <Badge className="bg-green-100 text-green-800">Resolved</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {breach.status === "OPEN" ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openResolve(breach)}
                          >
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Resolve
                          </Button>
                        ) : (
                          <Button variant="ghost" size="sm" disabled>
                            <Eye className="h-3 w-3 mr-1" />
                            View
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {breachesQ.isError && (
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-red-600">
                  Failed to load breaches. Please try refreshing.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ==================== TAB 2: AML/KYC ==================== */}
        <TabsContent value="aml" className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search client name, ID, or reason..."
                value={amlSearch}
                onChange={(e) => setAmlSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button variant="outline" size="sm" asChild>
              <a href="/kyc-dashboard">
                <ShieldCheck className="h-4 w-4 mr-2" />
                Open KYC Dashboard
              </a>
            </Button>
          </div>

          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Flag Reason</TableHead>
                  <TableHead>Risk Rating</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Flagged At</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {amlQ.isLoading ? (
                  <SkeletonRows cols={6} />
                ) : filteredAml.length === 0 ? (
                  <EmptyRow cols={6} msg="No AML/KYC flags found" />
                ) : (
                  filteredAml.map((flag) => (
                    <TableRow key={flag.id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium">
                            {flag.client_name}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {flag.client_id}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm max-w-[200px] truncate">
                        {flag.flag_reason}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={badgeClass(flag.risk_rating?.toUpperCase(), {
                            HIGH: "bg-red-100 text-red-800",
                            MEDIUM: "bg-yellow-100 text-yellow-800",
                            LOW: "bg-green-100 text-green-800",
                          })}
                        >
                          {flag.risk_rating}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={badgeClass(flag.status, {
                            FLAGGED: "bg-red-100 text-red-800",
                            CLEARED: "bg-green-100 text-green-800",
                            UNDER_REVIEW: "bg-yellow-100 text-yellow-800",
                          })}
                        >
                          {flag.status.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        {formatDate(flag.flagged_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" asChild>
                          <a href={`/kyc-dashboard?client=${flag.client_id}`}>
                            <Eye className="h-3 w-3 mr-1" />
                            Detail
                          </a>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {amlQ.isError && (
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-red-600">
                  Failed to load AML flags. Please try refreshing.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ==================== TAB 3: SURVEILLANCE ==================== */}
        <TabsContent value="surveillance" className="space-y-4">
          <div className="flex items-center gap-3">
            <Select
              value={survPatternFilter}
              onValueChange={setSurvPatternFilter}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Pattern Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Patterns</SelectItem>
                <SelectItem value="LAYERING">Layering</SelectItem>
                <SelectItem value="SPOOFING">Spoofing</SelectItem>
                <SelectItem value="WASH_TRADING">Wash Trading</SelectItem>
                <SelectItem value="FRONT_RUNNING">Front Running</SelectItem>
                <SelectItem value="INSIDER_TRADING">Insider Trading</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground">
              {filteredSurveillance.length} alert(s)
            </span>
          </div>

          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Pattern Type</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Order IDs</TableHead>
                  <TableHead>Disposition</TableHead>
                  <TableHead>Detected</TableHead>
                  <TableHead className="max-w-[200px]">Description</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {surveillanceQ.isLoading ? (
                  <SkeletonRows cols={8} />
                ) : filteredSurveillance.length === 0 ? (
                  <EmptyRow cols={8} msg="No surveillance alerts found" />
                ) : (
                  filteredSurveillance.map((alert) => (
                    <TableRow key={alert.id}>
                      <TableCell className="font-mono text-xs">
                        {alert.id}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={badgeClass(alert.pattern_type, PATTERN_COLORS)}
                        >
                          {alert.pattern_type.replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-16 rounded-full bg-muted">
                            <div
                              className={`h-2 rounded-full ${
                                alert.score >= 80
                                  ? "bg-red-500"
                                  : alert.score >= 50
                                    ? "bg-yellow-500"
                                    : "bg-green-500"
                              }`}
                              style={{
                                width: `${Math.min(alert.score, 100)}%`,
                              }}
                            />
                          </div>
                          <span className="text-xs font-mono font-medium">
                            {alert.score}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {alert.account_id}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {alert.order_ids.slice(0, 3).map((oid) => (
                            <Badge
                              key={oid}
                              variant="outline"
                              className="text-xs font-mono"
                            >
                              {oid}
                            </Badge>
                          ))}
                          {alert.order_ids.length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{alert.order_ids.length - 3}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={badgeClass(
                            alert.disposition,
                            DISPOSITION_COLORS,
                          )}
                        >
                          {alert.disposition}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        {formatDate(alert.detected_at)}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm">
                        {alert.description}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {surveillanceQ.isError && (
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-red-600">
                  Failed to load surveillance alerts. Please try refreshing.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ==================== TAB 4: STR QUEUE ==================== */}
        <TabsContent value="str" className="space-y-4">
          <div className="flex items-center gap-3">
            <Select value={strStatusFilter} onValueChange={setStrStatusFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="FILED">Filed</SelectItem>
                <SelectItem value="REJECTED">Rejected</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground">
              {filteredStr.length} report(s)
            </span>
          </div>

          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Report Type</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Filed</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {strQ.isLoading ? (
                  <SkeletonRows cols={9} />
                ) : filteredStr.length === 0 ? (
                  <EmptyRow cols={9} msg="No suspicious transaction reports found" />
                ) : (
                  filteredStr.map((report) => (
                    <TableRow key={report.id}>
                      <TableCell className="font-mono text-xs">
                        {report.id}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium">
                            {report.client_name}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {report.client_id}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{report.report_type}</Badge>
                      </TableCell>
                      <TableCell className="text-sm max-w-[180px] truncate">
                        {report.reason}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatCurrency(report.amount, report.currency)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={badgeClass(report.status, STR_STATUS_COLORS)}
                        >
                          {report.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        {formatDate(report.created_at)}
                      </TableCell>
                      <TableCell className="text-xs">
                        {report.filed_at ? formatDate(report.filed_at) : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        {report.status === "PENDING" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => fileStrMut.mutate(report.id)}
                            disabled={fileStrMut.isPending}
                          >
                            <FileText className="h-3 w-3 mr-1" />
                            File
                          </Button>
                        )}
                        {report.status === "FILED" && (
                          <Badge className="bg-green-100 text-green-800">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Filed
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {strQ.isError && (
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-red-600">
                  Failed to load STR queue. Please try refreshing.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ==================== TAB 5: REVERSALS ==================== */}
        <TabsContent value="reversals" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Pending
                    </p>
                    <p className="mt-1 text-2xl font-bold text-yellow-600">
                      {reversalSummary?.pending ?? 0}
                    </p>
                  </div>
                  <RotateCcw className="h-5 w-5 text-yellow-600" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Approved
                    </p>
                    <p className="mt-1 text-2xl font-bold text-green-600">
                      {reversalSummary?.approved ?? 0}
                    </p>
                  </div>
                  <CheckCircle className="h-5 w-5 text-green-600" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Rejected
                    </p>
                    <p className="mt-1 text-2xl font-bold text-red-600">
                      {reversalSummary?.rejected ?? 0}
                    </p>
                  </div>
                  <XCircle className="h-5 w-5 text-red-600" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Total
                    </p>
                    <p className="mt-1 text-2xl font-bold">
                      {reversalSummary?.total ?? 0}
                    </p>
                  </div>
                  <TrendingUp className="h-5 w-5 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold">Reversal Management</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    View the full reversal queue with approval workflow, execution
                    tracking, and history.
                  </p>
                </div>
                <Button asChild>
                  <a href="/reversals">
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Open Reversals Desk
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>

          {reversalSummaryQ.isLoading && (
            <div className="space-y-4">
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          )}

          {reversalSummaryQ.isError && (
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-red-600">
                  Failed to load reversal summary. Please try refreshing.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* ==================== RESOLVE BREACH DIALOG ==================== */}
      <Dialog open={resolveDialogOpen} onOpenChange={setResolveDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Resolve Breach</DialogTitle>
            <DialogDescription>
              Provide a resolution note for breach{" "}
              <span className="font-mono">{resolvingBreach?.id}</span> on
              portfolio {resolvingBreach?.portfolio_name}.
            </DialogDescription>
          </DialogHeader>

          {resolvingBreach && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Rule Type</p>
                  <p className="font-medium">{resolvingBreach.rule_type}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Severity</p>
                  <Badge
                    className={badgeClass(
                      resolvingBreach.severity,
                      SEVERITY_COLORS,
                    )}
                  >
                    {resolvingBreach.severity}
                  </Badge>
                </div>
                <div className="col-span-2">
                  <p className="text-muted-foreground text-xs">Description</p>
                  <p className="text-sm">{resolvingBreach.description}</p>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium">Resolution Note</label>
                <Textarea
                  placeholder="Describe the resolution action taken..."
                  value={resolutionNote}
                  onChange={(e) => setResolutionNote(e.target.value)}
                  rows={4}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setResolveDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={submitResolve}
              disabled={resolveMut.isPending || !resolutionNote.trim()}
            >
              {resolveMut.isPending ? "Resolving..." : "Mark Resolved"}
            </Button>
          </DialogFooter>

          {resolveMut.isError && (
            <p className="text-sm text-red-600 mt-2">
              Failed to resolve breach. Please try again.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
