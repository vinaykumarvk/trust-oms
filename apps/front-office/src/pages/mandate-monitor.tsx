/**
 * Mandate Monitor — Phase 1C
 *
 * Shows compliance limit status across the RM's portfolios.
 *
 * Features:
 *   - Summary cards: Total Limits, Breached, Warning, OK
 *   - Table with utilization bar and status badges
 *   - Filterable by limit_type dropdown
 *   - Pagination
 *
 * Data source: GET /api/v1/compliance-limits?page=&pageSize=
 */

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@ui/components/ui/card";
import { Badge } from "@ui/components/ui/badge";
import { Button } from "@ui/components/ui/button";
import { Skeleton } from "@ui/components/ui/skeleton";
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
import { Shield, AlertTriangle, AlertCircle, CheckCircle } from "lucide-react";
import { apiUrl } from "@ui/lib/api-url";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ComplianceLimit {
  id: number;
  limit_type: string;
  dimension: string;
  dimension_id: string | null;
  limit_amount: string | null;
  current_exposure: string | null;
  warning_threshold_pct: number | null;
  is_active: boolean | null;
  effective_from: string | null;
  effective_to: string | null;
  created_at: string;
  updated_at: string;
}

interface ComplianceLimitListResponse {
  data: ComplianceLimit[];
  total: number;
  page: number;
  pageSize: number;
}

type LimitStatus = "BREACH" | "WARNING" | "OK";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeUtilization(limit: ComplianceLimit): {
  utilization: number;
  status: LimitStatus;
} {
  const maxValue = parseFloat(limit.limit_amount ?? "0");
  const currentValue = parseFloat(limit.current_exposure ?? "0");

  if (maxValue <= 0) {
    return { utilization: 0, status: "OK" };
  }

  const utilization = (currentValue / maxValue) * 100;
  const warningThreshold = limit.warning_threshold_pct ?? 80;

  if (utilization > 100) {
    return { utilization, status: "BREACH" };
  }
  if (utilization > warningThreshold) {
    return { utilization, status: "WARNING" };
  }
  return { utilization, status: "OK" };
}

const statusBadgeColors: Record<LimitStatus, string> = {
  BREACH: "bg-red-100 text-red-800",
  WARNING: "bg-yellow-100 text-yellow-800",
  OK: "bg-green-100 text-green-800",
};

const statusBarColors: Record<LimitStatus, string> = {
  BREACH: "bg-red-500",
  WARNING: "bg-yellow-500",
  OK: "bg-green-500",
};

const numberFormatter = new Intl.NumberFormat("en-PH", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

// ---------------------------------------------------------------------------
// Utilization Bar Component
// ---------------------------------------------------------------------------

function UtilizationBar({
  utilization,
  status,
}: {
  utilization: number;
  status: LimitStatus;
}) {
  const clampedWidth = Math.min(utilization, 100);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${statusBarColors[status]}`}
          style={{ width: `${clampedWidth}%` }}
        />
      </div>
      <span className="text-xs font-medium w-12 text-right">
        {utilization.toFixed(1)}%
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

const PAGE_SIZE = 25;

export default function MandateMonitor() {
  const [page, setPage] = useState(1);
  const [limitTypeFilter, setLimitTypeFilter] = useState("all");

  const limitsQuery = useQuery<ComplianceLimitListResponse>({
    queryKey: ["compliance-limits", { page, limitType: limitTypeFilter }],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(PAGE_SIZE));
      if (limitTypeFilter && limitTypeFilter !== "all") {
        params.set("search", limitTypeFilter);
      }
      const res = await fetch(apiUrl(`/api/v1/compliance-limits?${params}`));
      if (!res.ok) throw new Error("Failed to fetch compliance limits");
      return res.json();
    },
  });

  const limits = limitsQuery.data?.data ?? [];
  const total = limitsQuery.data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Compute statuses for all limits
  const limitsWithStatus = useMemo(
    () =>
      limits.map((limit) => {
        const { utilization, status } = computeUtilization(limit);
        return { ...limit, utilization, status };
      }),
    [limits],
  );

  // Summary counts
  const breachedCount = limitsWithStatus.filter(
    (l) => l.status === "BREACH",
  ).length;
  const warningCount = limitsWithStatus.filter(
    (l) => l.status === "WARNING",
  ).length;
  const okCount = limitsWithStatus.filter((l) => l.status === "OK").length;

  // Extract unique limit types for filter dropdown
  const uniqueLimitTypes = useMemo(() => {
    const types = new Set<string>();
    for (const l of limits) {
      if (l.limit_type) types.add(l.limit_type);
    }
    return Array.from(types).sort();
  }, [limits]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <Shield className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Mandate Monitor
          </h1>
          <p className="text-sm text-muted-foreground">
            Compliance limit status across portfolios
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Limits</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{total}</div>
            <p className="text-xs text-muted-foreground">
              Active compliance limits
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Breached</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {breachedCount}
            </div>
            <p className="text-xs text-muted-foreground">
              Exceeding limit amount
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Warning</CardTitle>
            <AlertCircle className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {warningCount}
            </div>
            <p className="text-xs text-muted-foreground">
              Above warning threshold
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">OK</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{okCount}</div>
            <p className="text-xs text-muted-foreground">
              Within acceptable range
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filter */}
      <div className="flex gap-4">
        <Select
          value={limitTypeFilter}
          onValueChange={(v) => {
            setLimitTypeFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-56">
            <SelectValue placeholder="All Limit Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Limit Types</SelectItem>
            {uniqueLimitTypes.map((type) => (
              <SelectItem key={type} value={type}>
                {type.replace(/_/g, " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Limits Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Limit Type</TableHead>
              <TableHead>Dimension</TableHead>
              <TableHead>Portfolio / Entity</TableHead>
              <TableHead className="text-right">Max Value</TableHead>
              <TableHead className="text-right">Current Value</TableHead>
              <TableHead className="w-[200px]">Utilization</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {limitsQuery.isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-20" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : limitsWithStatus.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center text-muted-foreground py-8"
                >
                  No compliance limits found
                </TableCell>
              </TableRow>
            ) : (
              limitsWithStatus.map((limit) => (
                <TableRow key={limit.id}>
                  <TableCell className="font-medium">
                    {limit.limit_type.replace(/_/g, " ")}
                  </TableCell>
                  <TableCell>{limit.dimension}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {limit.dimension_id ?? "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    {limit.limit_amount
                      ? numberFormatter.format(
                          parseFloat(limit.limit_amount),
                        )
                      : "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    {limit.current_exposure
                      ? numberFormatter.format(
                          parseFloat(limit.current_exposure),
                        )
                      : "-"}
                  </TableCell>
                  <TableCell>
                    <UtilizationBar
                      utilization={limit.utilization}
                      status={limit.status}
                    />
                  </TableCell>
                  <TableCell>
                    <Badge className={statusBadgeColors[limit.status]}>
                      {limit.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="flex justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </Button>
          <span className="flex items-center text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
