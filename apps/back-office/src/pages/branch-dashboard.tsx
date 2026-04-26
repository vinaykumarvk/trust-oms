/**
 * Branch Operations Dashboard
 *
 * Displays branch-level metrics in a responsive grid: AUM, client count,
 * pending orders, compliance alerts, settlement pipeline, and NAV status.
 * Includes a filterable data table of all branches.
 * Auto-refreshes every 30 seconds.
 */
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@ui/lib/queryClient";
import { apiUrl } from "@ui/lib/api-url";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@ui/components/ui/card";
import { Badge } from "@ui/components/ui/badge";
import { Button } from "@ui/components/ui/button";
import { Input } from "@ui/components/ui/input";
import { Skeleton } from "@ui/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ui/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@ui/components/ui/table";
import { Separator } from "@ui/components/ui/separator";
import {
  Building2,
  Users,
  ClipboardList,
  AlertTriangle,
  ArrowRightLeft,
  TrendingUp,
  Search,
  RefreshCw,
  ChevronUp,
  ChevronDown,
  Download,
  Filter,
} from "lucide-react";
import { tableAriaLabel, statusAriaLabel } from "@/lib/accessibility";

/* ---------- Types ---------- */

interface BranchMetrics {
  total_aum: number;
  total_clients: number;
  total_pending_orders: number;
  total_compliance_alerts: number;
  settlement_pipeline: {
    pending: number;
    in_progress: number;
    completed: number;
    failed: number;
  };
  nav_computation: {
    computed: number;
    pending: number;
    stale: number;
  };
}

interface BranchRow {
  id: string;
  name: string;
  code: string;
  region: string;
  aum: number;
  clients: number;
  pending_orders: number;
  compliance_alerts: number;
  status: string;
}

interface BranchMetricsResponse {
  summary: BranchMetrics;
  branches: BranchRow[];
}

/* ---------- Helpers ---------- */

const fmtPHP = (n: number) =>
  n.toLocaleString("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2 });

const fmtNum = (n: number) =>
  n.toLocaleString("en-PH");

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  INACTIVE: "bg-muted text-muted-foreground",
  SUSPENDED: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  UNDER_REVIEW: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
};

const REGION_OPTIONS = ["ALL", "NCR", "Luzon", "Visayas", "Mindanao", "International"];
const STATUS_OPTIONS = ["ALL", "ACTIVE", "INACTIVE", "SUSPENDED", "UNDER_REVIEW"];

type SortField = "name" | "region" | "aum" | "clients" | "pending_orders" | "compliance_alerts" | "status";
type SortDir = "asc" | "desc";

const bc = (map: Record<string, string>, key: string) => map[key] ?? "bg-muted text-muted-foreground";

/* ---------- Sub-components ---------- */

function MetricCard({
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
            <p className="mt-1 text-2xl font-bold">{value}</p>
            {subtitle && (
              <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-lg ${accent}`}
            aria-hidden="true"
          >
            <Icon className="h-5 w-5 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MetricCardSkeleton() {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-7 w-32" />
          </div>
          <Skeleton className="h-10 w-10 rounded-lg" />
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

function PipelineBadge({ label, count, variant }: { label: string; count: number; variant: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${variant}`}
      aria-label={`${label}: ${count}`}
    >
      {label}: {count}
    </span>
  );
}

/* ========== Main Component ========== */

export default function BranchDashboard() {
  const [search, setSearch] = useState("");
  const [regionFilter, setRegionFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  /* ---------- Data Fetching ---------- */

  const {
    data: metricsData,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<BranchMetricsResponse>({
    queryKey: ["/api/back-office/branches/metrics"],
    queryFn: async () => {
      const res = await apiRequest("GET", apiUrl("/api/back-office/branches/metrics"));
      return res.json();
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const summary = metricsData?.summary;
  const branches = metricsData?.branches ?? [];

  /* ---------- Filtering & Sorting ---------- */

  const filtered = useMemo(() => {
    let result = [...branches];

    // Text search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (b) =>
          b.name.toLowerCase().includes(q) ||
          b.code.toLowerCase().includes(q) ||
          b.region.toLowerCase().includes(q),
      );
    }

    // Region filter
    if (regionFilter !== "ALL") {
      result = result.filter((b) => b.region === regionFilter);
    }

    // Status filter
    if (statusFilter !== "ALL") {
      result = result.filter((b) => b.status === statusFilter);
    }

    // Sort
    result.sort((a, b) => {
      let cmp = 0;
      const aVal = a[sortField];
      const bVal = b[sortField];
      if (typeof aVal === "string" && typeof bVal === "string") {
        cmp = aVal.localeCompare(bVal);
      } else if (typeof aVal === "number" && typeof bVal === "number") {
        cmp = aVal - bVal;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [branches, search, regionFilter, statusFilter, sortField, sortDir]);

  /* ---------- Sort handler ---------- */

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return null;
    return sortDir === "asc" ? (
      <ChevronUp className="ml-1 inline h-3 w-3" />
    ) : (
      <ChevronDown className="ml-1 inline h-3 w-3" />
    );
  }

  /* ---------- Render ---------- */

  return (
    <div className="space-y-6" role="main" aria-label="Branch Operations Dashboard">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Branch Operations</h1>
          <p className="text-sm text-muted-foreground">
            Monitor branch-level metrics, pipeline status, and compliance health
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            aria-label="Refresh branch metrics"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button variant="outline" size="sm" aria-label="Export branch data to CSV">
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      <Separator />

      {/* Error State */}
      {isError && (
        <Card className="border-destructive">
          <CardContent className="py-6">
            <div className="flex items-center gap-3 text-destructive" role="alert">
              <AlertTriangle className="h-5 w-5 flex-shrink-0" />
              <div>
                <p className="font-medium">Failed to load branch metrics</p>
                <p className="text-sm text-muted-foreground">
                  {(error as Error)?.message || "An unexpected error occurred. Please try again."}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="ml-auto"
                onClick={() => refetch()}
              >
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary Metric Cards */}
      <section aria-label="Branch summary metrics">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {isLoading ? (
            <>
              <MetricCardSkeleton />
              <MetricCardSkeleton />
              <MetricCardSkeleton />
              <MetricCardSkeleton />
              <MetricCardSkeleton />
              <MetricCardSkeleton />
            </>
          ) : (
            <>
              <MetricCard
                title="Total AUM"
                value={fmtPHP(summary?.total_aum ?? 0)}
                icon={TrendingUp}
                accent="bg-blue-600 dark:bg-blue-700"
                subtitle="Across all branches"
              />
              <MetricCard
                title="Total Clients"
                value={fmtNum(summary?.total_clients ?? 0)}
                icon={Users}
                accent="bg-emerald-600 dark:bg-emerald-700"
                subtitle="Active client accounts"
              />
              <MetricCard
                title="Pending Orders"
                value={fmtNum(summary?.total_pending_orders ?? 0)}
                icon={ClipboardList}
                accent="bg-amber-600 dark:bg-amber-700"
                subtitle="Awaiting processing"
              />
              <MetricCard
                title="Compliance Alerts"
                value={fmtNum(summary?.total_compliance_alerts ?? 0)}
                icon={AlertTriangle}
                accent="bg-red-600 dark:bg-red-700"
                subtitle="Requires attention"
              />

              {/* Settlement Pipeline Card */}
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-muted-foreground">Settlement Pipeline</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <PipelineBadge
                          label="Pending"
                          count={summary?.settlement_pipeline?.pending ?? 0}
                          variant="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
                        />
                        <PipelineBadge
                          label="In Progress"
                          count={summary?.settlement_pipeline?.in_progress ?? 0}
                          variant="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                        />
                        <PipelineBadge
                          label="Completed"
                          count={summary?.settlement_pipeline?.completed ?? 0}
                          variant="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                        />
                        <PipelineBadge
                          label="Failed"
                          count={summary?.settlement_pipeline?.failed ?? 0}
                          variant="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                        />
                      </div>
                    </div>
                    <div
                      className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-purple-600 dark:bg-purple-700"
                      aria-hidden="true"
                    >
                      <ArrowRightLeft className="h-5 w-5 text-white" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* NAV Computation Card */}
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-muted-foreground">NAV Computation</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <PipelineBadge
                          label="Computed"
                          count={summary?.nav_computation?.computed ?? 0}
                          variant="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                        />
                        <PipelineBadge
                          label="Pending"
                          count={summary?.nav_computation?.pending ?? 0}
                          variant="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
                        />
                        <PipelineBadge
                          label="Stale"
                          count={summary?.nav_computation?.stale ?? 0}
                          variant="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                        />
                      </div>
                    </div>
                    <div
                      className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-600 dark:bg-indigo-700"
                      aria-hidden="true"
                    >
                      <TrendingUp className="h-5 w-5 text-white" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </section>

      {/* Branch Data Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Branches</CardTitle>
              <CardDescription>
                {isLoading
                  ? "Loading branch data..."
                  : `${filtered.length} of ${branches.length} branches`}
              </CardDescription>
            </div>
          </div>

          {/* Filters Row */}
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                placeholder="Search branches by name, code, or region..."
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search branches"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <Select value={regionFilter} onValueChange={setRegionFilter}>
                <SelectTrigger className="w-[140px]" aria-label="Filter by region">
                  <SelectValue placeholder="Region" />
                </SelectTrigger>
                <SelectContent>
                  {REGION_OPTIONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r === "ALL" ? "All Regions" : r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[150px]" aria-label="Filter by status">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s === "ALL" ? "All Statuses" : s.replace("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div className="overflow-x-auto">
            <Table aria-label={tableAriaLabel("Branches", filtered.length, 1, 1)}>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <button
                      type="button"
                      className="inline-flex items-center font-medium hover:text-foreground"
                      onClick={() => handleSort("name")}
                      aria-label="Sort by branch name"
                    >
                      Branch Name
                      <SortIcon field="name" />
                    </button>
                  </TableHead>
                  <TableHead>
                    <button
                      type="button"
                      className="inline-flex items-center font-medium hover:text-foreground"
                      onClick={() => handleSort("region")}
                      aria-label="Sort by region"
                    >
                      Region
                      <SortIcon field="region" />
                    </button>
                  </TableHead>
                  <TableHead className="text-right">
                    <button
                      type="button"
                      className="inline-flex items-center font-medium hover:text-foreground"
                      onClick={() => handleSort("aum")}
                      aria-label="Sort by AUM"
                    >
                      AUM
                      <SortIcon field="aum" />
                    </button>
                  </TableHead>
                  <TableHead className="text-right">
                    <button
                      type="button"
                      className="inline-flex items-center font-medium hover:text-foreground"
                      onClick={() => handleSort("clients")}
                      aria-label="Sort by clients"
                    >
                      Clients
                      <SortIcon field="clients" />
                    </button>
                  </TableHead>
                  <TableHead className="text-right">
                    <button
                      type="button"
                      className="inline-flex items-center font-medium hover:text-foreground"
                      onClick={() => handleSort("pending_orders")}
                      aria-label="Sort by pending orders"
                    >
                      Pending Orders
                      <SortIcon field="pending_orders" />
                    </button>
                  </TableHead>
                  <TableHead className="text-right">
                    <button
                      type="button"
                      className="inline-flex items-center font-medium hover:text-foreground"
                      onClick={() => handleSort("compliance_alerts")}
                      aria-label="Sort by alerts"
                    >
                      Alerts
                      <SortIcon field="compliance_alerts" />
                    </button>
                  </TableHead>
                  <TableHead>
                    <button
                      type="button"
                      className="inline-flex items-center font-medium hover:text-foreground"
                      onClick={() => handleSort("status")}
                      aria-label="Sort by status"
                    >
                      Status
                      <SortIcon field="status" />
                    </button>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <SkeletonRows cols={7} rows={8} />
                ) : filtered.length === 0 ? (
                  <EmptyRow
                    cols={7}
                    msg={
                      branches.length === 0
                        ? "No branches found. Branch data will appear once configured."
                        : "No branches match the current filters."
                    }
                  />
                ) : (
                  filtered.map((branch) => (
                    <TableRow key={branch.id} className="hover:bg-muted/50 dark:hover:bg-muted/20">
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                          <div>
                            <p>{branch.name}</p>
                            <p className="text-xs text-muted-foreground">{branch.code}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{branch.region}</TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {fmtPHP(branch.aum)}
                      </TableCell>
                      <TableCell className="text-right">{fmtNum(branch.clients)}</TableCell>
                      <TableCell className="text-right">
                        {branch.pending_orders > 0 ? (
                          <span className="font-medium text-amber-600 dark:text-amber-400">
                            {fmtNum(branch.pending_orders)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {branch.compliance_alerts > 0 ? (
                          <span className="font-medium text-red-600 dark:text-red-400">
                            {fmtNum(branch.compliance_alerts)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={bc(STATUS_COLORS, branch.status)}
                          aria-label={statusAriaLabel("Branch", branch.status)}
                        >
                          {branch.status.replace("_", " ")}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
