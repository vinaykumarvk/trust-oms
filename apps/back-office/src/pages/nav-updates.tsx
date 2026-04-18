/**
 * NAV Updates — Back-Office Operations Monitor
 *
 * Monitoring view for NAV ingestion status and pricing staleness.
 * Shows summary cards with counts, a detailed table with staleness
 * indicators, and a "Refresh All" stub action.
 */

import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@ui/lib/queryClient";
import { apiUrl } from "@ui/lib/api-url";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@ui/components/ui/card";
import { Badge } from "@ui/components/ui/badge";
import { Button } from "@ui/components/ui/button";
import { Skeleton } from "@ui/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ui/components/ui/table";
import {
  Activity,
  CheckCircle,
  AlertTriangle,
  XCircle,
  RefreshCw,
  TrendingUp,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NavRecord {
  id?: string;
  portfolio_id: string;
  portfolio_type: string;
  nav_status: string;
  nav_per_unit: number | string | null;
  last_computed: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatNavpu(value: number | string | null): string {
  if (value === null || value === undefined) return "-";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "-";
  return num.toLocaleString("en-PH", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 6,
  });
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  try {
    return new Date(dateStr).toLocaleString("en-PH", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

type StalenessLevel = "current" | "1day" | "2plus" | "missing";

function getStaleness(lastComputed: string | null): StalenessLevel {
  if (!lastComputed) return "missing";
  const now = new Date();
  const last = new Date(lastComputed);
  const diffMs = now.getTime() - last.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  if (diffDays < 1) return "current";
  if (diffDays < 2) return "1day";
  return "2plus";
}

const STALENESS_CONFIG: Record<
  StalenessLevel,
  { label: string; color: string }
> = {
  current: { label: "Current", color: "bg-green-100 text-green-800" },
  "1day": { label: "1 Day", color: "bg-yellow-100 text-yellow-800" },
  "2plus": { label: "2+ Days", color: "bg-orange-100 text-orange-800" },
  missing: { label: "Missing", color: "bg-red-100 text-red-800" },
};

const STATUS_COLORS: Record<string, string> = {
  NOT_STARTED: "bg-muted text-foreground",
  DRAFT: "bg-yellow-100 text-yellow-800",
  VALIDATED: "bg-blue-100 text-blue-800",
  PUBLISHED: "bg-green-100 text-green-800",
};

// ---------------------------------------------------------------------------
// Summary Card
// ---------------------------------------------------------------------------

interface SummaryCardProps {
  title: string;
  value: number;
  icon: React.ElementType;
  accent: string;
}

function SummaryCard({ title, value, icon: Icon, accent }: SummaryCardProps) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              {title}
            </p>
            <p className="mt-1 text-3xl font-bold text-foreground">{value}</p>
          </div>
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-lg ${accent}`}
          >
            <Icon className="h-5 w-5 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function NavUpdates() {
  const navQuery = useQuery<NavRecord[]>({
    queryKey: ["nav-updates"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/nav/status")),
    refetchInterval: 60_000,
  });

  const records = navQuery.data ?? [];

  // Compute staleness for each record
  const withStaleness = records.map((r) => ({
    ...r,
    staleness: getStaleness(r.last_computed),
  }));

  // Summary counts
  const totalCount = withStaleness.length;
  const currentCount = withStaleness.filter(
    (r) => r.staleness === "current"
  ).length;
  const staleCount = withStaleness.filter(
    (r) => r.staleness === "1day" || r.staleness === "2plus"
  ).length;
  const missingCount = withStaleness.filter(
    (r) => r.staleness === "missing"
  ).length;

  const handleRefreshAll = () => {
    alert(
      "Pricing ingestion refresh triggered. This is a stub action - the actual ingestion pipeline will be connected in a future phase."
    );
  };

  const handleFundClick = (portfolioId: string) => {
    alert(`Fund detail for ${portfolioId} will be available in a future phase.`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <TrendingUp className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">NAV Updates</h1>
            <p className="text-sm text-muted-foreground">
              Monitor NAV ingestion and pricing staleness
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRefreshAll}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh All
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navQuery.refetch()}
            disabled={navQuery.isFetching}
          >
            <RefreshCw
              className={`h-4 w-4 ${navQuery.isFetching ? "animate-spin" : ""}`}
            />
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          title="Total Securities with Prices"
          value={totalCount}
          icon={Activity}
          accent="bg-indigo-600"
        />
        <SummaryCard
          title="Updated Today"
          value={currentCount}
          icon={CheckCircle}
          accent="bg-green-600"
        />
        <SummaryCard
          title="Stale (>1 Day)"
          value={staleCount}
          icon={AlertTriangle}
          accent="bg-yellow-600"
        />
        <SummaryCard
          title="Missing Prices"
          value={missingCount}
          icon={XCircle}
          accent="bg-red-600"
        />
      </div>

      {/* NAV Status Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Fund NAV Status</CardTitle>
          <CardDescription>
            Click a fund to view details
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto rounded-md border-t">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fund</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">NAVpu</TableHead>
                  <TableHead>Last Updated</TableHead>
                  <TableHead>Staleness</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {navQuery.isLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 5 }).map((_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-20" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : withStaleness.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center text-muted-foreground py-8"
                    >
                      No NAV records found
                    </TableCell>
                  </TableRow>
                ) : (
                  withStaleness.map((record) => {
                    const stalenessCfg = STALENESS_CONFIG[record.staleness];
                    const statusColor =
                      STATUS_COLORS[record.nav_status] ??
                      "bg-muted text-foreground";
                    return (
                      <TableRow
                        key={record.portfolio_id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => handleFundClick(record.portfolio_id)}
                      >
                        <TableCell className="font-medium">
                          {record.portfolio_id}
                        </TableCell>
                        <TableCell>
                          <Badge className={statusColor}>
                            {record.nav_status?.replace(/_/g, " ") ?? "-"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatNavpu(record.nav_per_unit)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(record.last_computed)}
                        </TableCell>
                        <TableCell>
                          <Badge className={stalenessCfg.color}>
                            {stalenessCfg.label}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
