/**
 * Handover & Assignment Management (HAM) Dashboard
 *
 * Central overview page for the HAM module. Provides:
 *   - KPI cards: pending count by entity type, recent transfers (30 d),
 *     active delegations, expiring-soon delegations, total AUM pending
 *   - Recent Transfers table sourced from the dashboard endpoint
 *   - Quick-action links to key HAM pages
 *   - Auto-refresh every 30 seconds with loading/error skeleton states
 */

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@ui/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ui/components/ui/table";
import { Badge } from "@ui/components/ui/badge";
import { Button } from "@ui/components/ui/button";
import { Link } from "react-router-dom";
import { toast } from "sonner";

/* ---------- Auth helpers ---------- */

function getToken(): string {
  try {
    const stored = localStorage.getItem('trustoms-user');
    if (stored) {
      const parsed = JSON.parse(stored);
      return parsed.token || '';
    }
  } catch { /* ignored */ }
  return '';
}

function fetcher<T>(url: string): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${getToken()}`,
    "Content-Type": "application/json",
  };
  return fetch(url, { headers }).then((r) => {
    if (!r.ok) {
      return r.json().then((e: { error?: string }) => {
        throw new Error(e.error || `Request failed (${r.status})`);
      });
    }
    return r.json();
  });
}

/* ---------- Types ---------- */

interface PendingBreakdown {
  lead: number;
  prospect: number;
  client: number;
}

interface RecentTransfer {
  id: number;
  handover_number: string;
  entity_type: string;
  from_rm: string;
  to_rm: string;
  authorized_at: string;
  branch_code: string;
}

interface DashboardResponse {
  pending_breakdown: PendingBreakdown;
  recent_transfers_count: number;
  active_delegations: number;
  expiring_soon: number;
  total_aum_pending: number;
  recent_transfers: RecentTransfer[];
}

/* ---------- Constants ---------- */

const API = "/api/v1/ham";

const ENTITY_TYPE_COLORS: Record<string, string> = {
  lead: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  prospect: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300",
  client: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
};

/* ---------- Helpers ---------- */

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ---------- Skeleton sub-components ---------- */

function SkeletonKPICards() {
  return (
    <>
      {Array.from({ length: 7 }).map((_, i) => (
        <Card key={i}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          </CardHeader>
          <CardContent>
            <div className="h-8 w-16 animate-pulse rounded bg-muted" />
          </CardContent>
        </Card>
      ))}
    </>
  );
}

function SkeletonTableRows({ cols, rows = 5 }: { cols: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <TableRow key={i}>
          {Array.from({ length: cols }).map((_, j) => (
            <TableCell key={j}>
              <div className="h-4 w-full animate-pulse rounded bg-muted" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

/* ---------- Main Component ---------- */

export default function HandoverDashboardPage() {
  const {
    data: dashboard,
    isPending,
    isError,
    error,
  } = useQuery<DashboardResponse>({
    queryKey: ["ham-dashboard-overview"],
    queryFn: () => fetcher<DashboardResponse>(`${API}/dashboard`),
    refetchInterval: 30_000,
  });

  /* ---- Notify on error ---- */
  useEffect(() => {
    if (isError && error) {
      toast.error(error instanceof Error ? error.message : "Failed to load HAM dashboard");
    }
  }, [isError, error]);

  /* ---- Derived values ---- */
  const pending = dashboard?.pending_breakdown;
  const recentTransfers = dashboard?.recent_transfers ?? [];

  /* ---- KPI card definitions ---- */
  const kpiCards = [
    {
      label: "Pending Leads",
      value: pending?.lead ?? 0,
      description: "Lead handovers awaiting authorization",
      accent: "text-blue-600",
    },
    {
      label: "Pending Prospects",
      value: pending?.prospect ?? 0,
      description: "Prospect handovers awaiting authorization",
      accent: "text-orange-600",
    },
    {
      label: "Pending Clients",
      value: pending?.client ?? 0,
      description: "Client handovers awaiting authorization",
      accent: "text-green-600",
    },
    {
      label: "Recent Transfers",
      value: dashboard?.recent_transfers_count ?? 0,
      description: "Completed in the last 30 days",
      accent: "text-indigo-600",
    },
    {
      label: "Active Delegations",
      value: dashboard?.active_delegations ?? 0,
      description: "Currently active RM delegations",
      accent: "text-purple-600",
    },
    {
      label: "Expiring Soon",
      value: dashboard?.expiring_soon ?? 0,
      description: "Delegations expiring within 7 days",
      accent: "text-red-600",
    },
    {
      label: "Total AUM Pending",
      value: formatCurrency(dashboard?.total_aum_pending ?? 0),
      description: "Aggregate AUM of pending handovers",
      accent: "text-emerald-600",
      isFormatted: true,
    },
  ];

  /* ---- Quick action links ---- */
  const quickActions = [
    { label: "Create Handover", to: "/crm/handovers", variant: "default" as const },
    { label: "Authorization Queue", to: "/crm/handover-authorization", variant: "outline" as const },
    { label: "Delegation", to: "/crm/delegations", variant: "outline" as const },
    { label: "History", to: "/crm/handover-history", variant: "outline" as const },
  ];

  /* ---------- Render ---------- */

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">HAM Dashboard</h1>
          <p className="text-muted-foreground">
            Handover & Assignment Management overview and quick actions
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-7">
        {isPending ? (
          <SkeletonKPICards />
        ) : isError ? (
          <div className="col-span-full rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            Failed to load dashboard metrics. Please try refreshing the page.
          </div>
        ) : (
          kpiCards.map((card) => (
            <Card key={card.label}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">
                  {card.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${card.accent}`}>
                  {card.isFormatted ? card.value : (card.value as number).toLocaleString()}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {card.description}
                </p>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {quickActions.map((action) => (
              <Button
                key={action.to}
                variant={action.variant}
                size="sm"
                asChild
              >
                <Link to={action.to}>{action.label}</Link>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Recent Transfers Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Transfers</CardTitle>
        </CardHeader>
        <CardContent>
          {isPending ? (
            <div className="rounded-md border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Handover #</TableHead>
                    <TableHead>Entity Type</TableHead>
                    <TableHead>From RM</TableHead>
                    <TableHead>To RM</TableHead>
                    <TableHead>Authorized At</TableHead>
                    <TableHead>Branch</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <SkeletonTableRows cols={6} />
                </TableBody>
              </Table>
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
              <p>Failed to load recent transfers.</p>
              <p className="text-sm">Please try refreshing the page.</p>
            </div>
          ) : recentTransfers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
              <p className="text-lg">No recent transfers</p>
              <p className="text-sm">
                Completed handovers from the last 30 days will appear here.
              </p>
            </div>
          ) : (
            <div className="rounded-md border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Handover #</TableHead>
                    <TableHead>Entity Type</TableHead>
                    <TableHead>From RM</TableHead>
                    <TableHead>To RM</TableHead>
                    <TableHead>Authorized At</TableHead>
                    <TableHead>Branch</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentTransfers.map((transfer) => (
                    <TableRow key={transfer.id}>
                      <TableCell className="font-mono text-sm">
                        {transfer.handover_number}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={
                            ENTITY_TYPE_COLORS[transfer.entity_type.toLowerCase()] || ""
                          }
                        >
                          {transfer.entity_type.charAt(0).toUpperCase() +
                            transfer.entity_type.slice(1).toLowerCase()}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {transfer.from_rm}
                      </TableCell>
                      <TableCell className="text-sm">
                        {transfer.to_rm}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(transfer.authorized_at)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          {transfer.branch_code}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
