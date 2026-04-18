/**
 * Data Quality Dashboard Page
 *
 * Features:
 *   - Overall quality score (large number, color-coded)
 *   - 6 domain cards in a 2x3 grid (Clients, Portfolios, Positions, Prices, Transactions, Securities)
 *   - Expandable issues table per domain
 *   - Run Checks button to trigger fresh quality check
 */

import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@ui/lib/queryClient";
import { apiUrl } from "@ui/lib/api-url";
import { useToast } from "@ui/components/ui/toast";

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
import { Progress } from "@ui/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ui/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@ui/components/ui/collapsible";

import {
  RefreshCw,
  Loader2,
  ChevronDown,
  ChevronUp,
  Users,
  Briefcase,
  BarChart3,
  DollarSign,
  ArrowLeftRight,
  Shield,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Activity,
  TrendingUp,
  TrendingDown,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DataQualityIssue {
  id: string;
  issue_type: string;
  severity: "critical" | "high" | "medium" | "low";
  description: string;
  affected_count: number;
  sample_ids: string[];
  detected_at: string;
}

interface DomainScore {
  domain: string;
  score: number;
  issue_count: number;
  issues: DataQualityIssue[];
  last_checked: string;
  trend: "up" | "down" | "stable";
  previous_score: number | null;
}

interface DataQualityResponse {
  overall_score: number;
  overall_trend: "up" | "down" | "stable";
  previous_overall_score: number | null;
  domains: DomainScore[];
  last_run_at: string;
  total_issues: number;
  critical_issues: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

interface DomainMeta {
  key: string;
  label: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
}

const DOMAIN_META: Record<string, DomainMeta> = {
  clients: {
    key: "clients",
    label: "Clients",
    icon: Users,
    color: "text-blue-600",
    bgColor: "bg-blue-100",
  },
  portfolios: {
    key: "portfolios",
    label: "Portfolios",
    icon: Briefcase,
    color: "text-purple-600",
    bgColor: "bg-purple-100",
  },
  positions: {
    key: "positions",
    label: "Positions",
    icon: BarChart3,
    color: "text-green-600",
    bgColor: "bg-green-100",
  },
  prices: {
    key: "prices",
    label: "Prices",
    icon: DollarSign,
    color: "text-amber-600",
    bgColor: "bg-amber-100",
  },
  transactions: {
    key: "transactions",
    label: "Transactions",
    icon: ArrowLeftRight,
    color: "text-teal-600",
    bgColor: "bg-teal-100",
  },
  securities: {
    key: "securities",
    label: "Securities",
    icon: Shield,
    color: "text-red-600",
    bgColor: "bg-red-100",
  },
};

const SEVERITY_CONFIG: Record<
  string,
  { label: string; color: string; badgeVariant: "default" | "secondary" | "destructive" | "outline" }
> = {
  critical: {
    label: "Critical",
    color: "bg-red-100 text-red-800",
    badgeVariant: "destructive",
  },
  high: {
    label: "High",
    color: "bg-orange-100 text-orange-800",
    badgeVariant: "destructive",
  },
  medium: {
    label: "Medium",
    color: "bg-yellow-100 text-yellow-800",
    badgeVariant: "secondary",
  },
  low: {
    label: "Low",
    color: "bg-blue-100 text-blue-800",
    badgeVariant: "outline",
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scoreColor(score: number): string {
  if (score >= 90) return "text-green-600";
  if (score >= 70) return "text-yellow-600";
  return "text-red-600";
}

function scoreBgColor(score: number): string {
  if (score >= 90) return "bg-green-50 border-green-200";
  if (score >= 70) return "bg-yellow-50 border-yellow-200";
  return "bg-red-50 border-red-200";
}

function progressColor(score: number): string {
  if (score >= 90) return "[&>div]:bg-green-500";
  if (score >= 70) return "[&>div]:bg-yellow-500";
  return "[&>div]:bg-red-500";
}

function formatDateTime(dateStr: string | null): string {
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

function TrendIndicator({ trend, className }: { trend: string; className?: string }) {
  if (trend === "up") {
    return <TrendingUp className={`h-4 w-4 text-green-600 ${className ?? ""}`} />;
  }
  if (trend === "down") {
    return <TrendingDown className={`h-4 w-4 text-red-600 ${className ?? ""}`} />;
  }
  return <Activity className={`h-4 w-4 text-muted-foreground ${className ?? ""}`} />;
}

// ---------------------------------------------------------------------------
// Overall Score Card
// ---------------------------------------------------------------------------

interface OverallScoreProps {
  score: number;
  trend: string;
  previousScore: number | null;
  totalIssues: number;
  criticalIssues: number;
  lastRunAt: string;
  isLoading: boolean;
}

function OverallScoreCard({
  score,
  trend,
  previousScore,
  totalIssues,
  criticalIssues,
  lastRunAt,
  isLoading,
}: OverallScoreProps) {
  const delta =
    previousScore !== null ? score - previousScore : null;

  return (
    <Card className={`border-2 ${isLoading ? "" : scoreBgColor(score)}`}>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Overall Data Quality Score
            </p>
            {isLoading ? (
              <Skeleton className="h-16 w-32 mt-2" />
            ) : (
              <div className="flex items-end gap-3 mt-2">
                <span
                  className={`text-6xl font-bold tabular-nums ${scoreColor(score)}`}
                >
                  {score}
                </span>
                <span className="text-2xl text-muted-foreground mb-1">
                  / 100
                </span>
                <div className="flex items-center gap-1 mb-2">
                  <TrendIndicator trend={trend} />
                  {delta !== null && (
                    <span
                      className={`text-sm font-medium ${
                        delta > 0
                          ? "text-green-600"
                          : delta < 0
                          ? "text-red-600"
                          : "text-muted-foreground"
                      }`}
                    >
                      {delta > 0 ? "+" : ""}
                      {delta.toFixed(1)}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="text-right space-y-2">
            <div className="flex items-center gap-2 justify-end">
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
              <span className="text-sm font-medium">
                {isLoading ? (
                  <Skeleton className="h-4 w-8 inline-block" />
                ) : (
                  totalIssues
                )}{" "}
                total issues
              </span>
            </div>
            {criticalIssues > 0 && (
              <div className="flex items-center gap-2 justify-end">
                <XCircle className="h-4 w-4 text-red-600" />
                <span className="text-sm font-medium text-red-600">
                  {criticalIssues} critical
                </span>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Last check: {isLoading ? "..." : formatDateTime(lastRunAt)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Domain Card
// ---------------------------------------------------------------------------

interface DomainCardProps {
  domain: DomainScore;
  meta: DomainMeta;
  isExpanded: boolean;
  onToggle: () => void;
}

function DomainCard({ domain, meta, isExpanded, onToggle }: DomainCardProps) {
  const Icon = meta.icon;

  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <Card className="overflow-hidden">
        <CollapsibleTrigger asChild>
          <button type="button" className="w-full text-left">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-lg ${meta.bgColor}`}
                  >
                    <Icon className={`h-5 w-5 ${meta.color}`} />
                  </div>
                  <div>
                    <CardTitle className="text-base">{meta.label}</CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Last checked {formatDateTime(domain.last_checked)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {domain.issue_count > 0 && (
                    <Badge
                      variant={
                        domain.issue_count > 5 ? "destructive" : "secondary"
                      }
                    >
                      {domain.issue_count} issue{domain.issue_count !== 1 ? "s" : ""}
                    </Badge>
                  )}
                  {domain.issue_count === 0 && (
                    <Badge
                      variant="outline"
                      className="text-green-700 border-green-300"
                    >
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Clean
                    </Badge>
                  )}
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="pb-4">
              <div className="flex items-center gap-4">
                <span
                  className={`text-3xl font-bold tabular-nums ${scoreColor(
                    domain.score
                  )}`}
                >
                  {domain.score}
                </span>
                <div className="flex-1 space-y-1">
                  <Progress
                    value={domain.score}
                    className={`h-2 ${progressColor(domain.score)}`}
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      Quality score
                    </span>
                    <div className="flex items-center gap-1">
                      <TrendIndicator trend={domain.trend} className="h-3 w-3" />
                      {domain.previous_score !== null && (
                        <span className="text-xs text-muted-foreground">
                          prev: {domain.previous_score}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-t px-6 pb-4 pt-3">
            {domain.issues.length === 0 ? (
              <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 mr-2 text-green-500" />
                No issues detected for this domain
              </div>
            ) : (
              <div className="rounded-md border overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Issue Type</TableHead>
                      <TableHead>Severity</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">
                        Affected Records
                      </TableHead>
                      <TableHead>Sample IDs</TableHead>
                      <TableHead>Detected</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {domain.issues.map((issue) => {
                      const sevConfig =
                        SEVERITY_CONFIG[issue.severity] ??
                        SEVERITY_CONFIG.low;
                      return (
                        <TableRow key={issue.id}>
                          <TableCell className="font-medium whitespace-nowrap">
                            {issue.issue_type
                              .replace(/_/g, " ")
                              .replace(/\b\w/g, (c) => c.toUpperCase())}
                          </TableCell>
                          <TableCell>
                            <Badge variant={sevConfig.badgeVariant}>
                              {sevConfig.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-[250px] truncate">
                            {issue.description}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {issue.affected_count.toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1 max-w-[200px]">
                              {issue.sample_ids.slice(0, 3).map((id) => (
                                <Badge
                                  key={id}
                                  variant="outline"
                                  className="text-xs font-mono"
                                >
                                  {id}
                                </Badge>
                              ))}
                              {issue.sample_ids.length > 3 && (
                                <Badge variant="outline" className="text-xs">
                                  +{issue.sample_ids.length - 3} more
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                            {formatDateTime(issue.detected_at)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

// ---------------------------------------------------------------------------
// Domain Cards Grid
// ---------------------------------------------------------------------------

interface DomainGridProps {
  domains: DomainScore[];
  expandedDomains: Set<string>;
  onToggleDomain: (domain: string) => void;
}

function DomainGrid({
  domains,
  expandedDomains,
  onToggleDomain,
}: DomainGridProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {domains.map((domain) => {
        const meta = DOMAIN_META[domain.domain.toLowerCase()] ?? {
          key: domain.domain,
          label: domain.domain,
          icon: Activity,
          color: "text-gray-600",
          bgColor: "bg-gray-100",
        };
        return (
          <DomainCard
            key={domain.domain}
            domain={domain}
            meta={meta}
            isExpanded={expandedDomains.has(domain.domain)}
            onToggle={() => onToggleDomain(domain.domain)}
          />
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Summary Statistics
// ---------------------------------------------------------------------------

interface SummaryStatsProps {
  data: DataQualityResponse;
}

function SummaryStats({ data }: SummaryStatsProps) {
  const severityCounts = useMemo(() => {
    const counts = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const domain of data.domains) {
      for (const issue of domain.issues) {
        const sev = issue.severity as keyof typeof counts;
        if (sev in counts) counts[sev] += 1;
      }
    }
    return counts;
  }, [data]);

  const cleanDomains = data.domains.filter((d) => d.issue_count === 0).length;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                Domains Checked
              </p>
              <p className="text-2xl font-bold mt-1">{data.domains.length}</p>
            </div>
            <Activity className="h-5 w-5 text-blue-500" />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                Clean Domains
              </p>
              <p className="text-2xl font-bold mt-1 text-green-600">
                {cleanDomains}
              </p>
            </div>
            <CheckCircle2 className="h-5 w-5 text-green-500" />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                Critical Issues
              </p>
              <p className="text-2xl font-bold mt-1 text-red-600">
                {severityCounts.critical}
              </p>
            </div>
            <XCircle className="h-5 w-5 text-red-500" />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                High Issues
              </p>
              <p className="text-2xl font-bold mt-1 text-orange-600">
                {severityCounts.high}
              </p>
            </div>
            <AlertTriangle className="h-5 w-5 text-orange-500" />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                Medium / Low
              </p>
              <p className="text-2xl font-bold mt-1 text-yellow-600">
                {severityCounts.medium + severityCounts.low}
              </p>
            </div>
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading Skeleton
// ---------------------------------------------------------------------------

function DataQualitySkeleton() {
  return (
    <div className="space-y-6">
      {/* Overall score skeleton */}
      <Card className="border-2">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-16 w-32 mt-2" />
            </div>
            <div className="text-right space-y-2">
              <Skeleton className="h-4 w-24 ml-auto" />
              <Skeleton className="h-4 w-32 ml-auto" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats skeleton */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-8 w-12 mt-2" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Domain cards skeleton */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-lg" />
                <div>
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-3 w-32 mt-1" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="pb-4">
              <div className="flex items-center gap-4">
                <Skeleton className="h-8 w-12" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-2 w-full" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function DataQualityDashboardPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Expanded domain cards
  const [expandedDomains, setExpandedDomains] = useState<Set<string>>(
    new Set()
  );

  const handleToggleDomain = useCallback((domain: string) => {
    setExpandedDomains((prev) => {
      const next = new Set(prev);
      if (next.has(domain)) {
        next.delete(domain);
      } else {
        next.add(domain);
      }
      return next;
    });
  }, []);

  // Fetch data quality
  const qualityQuery = useQuery<DataQualityResponse>({
    queryKey: ["data-quality"],
    queryFn: () =>
      apiRequest("GET", apiUrl("/api/v1/reports/data-quality")),
    refetchInterval: 5 * 60 * 1000, // Auto-refresh every 5 minutes
  });

  const data = qualityQuery.data;

  // Run checks mutation
  const runChecksMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", apiUrl("/api/v1/reports/data-quality/run")),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["data-quality"] });
      toast({
        title: "Quality checks completed",
        description: "Data quality scores have been refreshed.",
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Quality check failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const handleRunChecks = useCallback(() => {
    runChecksMutation.mutate();
  }, [runChecksMutation]);

  // Expand / collapse all
  const handleExpandAll = useCallback(() => {
    if (!data) return;
    setExpandedDomains(new Set(data.domains.map((d) => d.domain)));
  }, [data]);

  const handleCollapseAll = useCallback(() => {
    setExpandedDomains(new Set());
  }, []);

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Data Quality Dashboard
          </h1>
          <p className="text-sm text-muted-foreground">
            Monitor data integrity across all domains. Identify and resolve
            quality issues.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {data && (
            <>
              <Button variant="ghost" size="sm" onClick={handleExpandAll}>
                Expand All
              </Button>
              <Button variant="ghost" size="sm" onClick={handleCollapseAll}>
                Collapse All
              </Button>
            </>
          )}
          <Button
            onClick={handleRunChecks}
            disabled={runChecksMutation.isPending}
          >
            {runChecksMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Run Checks
          </Button>
        </div>
      </div>

      {/* Loading state */}
      {qualityQuery.isLoading && <DataQualitySkeleton />}

      {/* Error state */}
      {qualityQuery.isError && (
        <Card className="border-destructive">
          <CardContent className="py-8">
            <div className="text-center">
              <XCircle className="h-10 w-10 text-destructive mx-auto mb-3" />
              <p className="text-sm font-medium text-destructive">
                Failed to load data quality metrics
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {qualityQuery.error?.message ?? "Unknown error"}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => qualityQuery.refetch()}
              >
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Data loaded */}
      {data && (
        <>
          {/* Overall Score */}
          <OverallScoreCard
            score={data.overall_score}
            trend={data.overall_trend}
            previousScore={data.previous_overall_score}
            totalIssues={data.total_issues}
            criticalIssues={data.critical_issues}
            lastRunAt={data.last_run_at}
            isLoading={false}
          />

          {/* Summary statistics */}
          <SummaryStats data={data} />

          {/* Domain cards grid */}
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-4">
              Domain Scores
            </h2>
            <DomainGrid
              domains={data.domains}
              expandedDomains={expandedDomains}
              onToggleDomain={handleToggleDomain}
            />
          </div>

          {/* Run checks in progress overlay */}
          {runChecksMutation.isPending && (
            <Card>
              <CardContent className="py-8">
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">
                    Running data quality checks across all domains...
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
