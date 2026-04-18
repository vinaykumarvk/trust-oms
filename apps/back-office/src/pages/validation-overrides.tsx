/**
 * Validation Overrides — Phase 3G (Pre/Post-Trade Compliance Engine)
 *
 * Lists all compliance validation overrides with filtering by order ID
 * and pagination. Summary cards show total, hard, soft, and pending counts.
 * Auto-refreshes every 30 seconds.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@ui/lib/queryClient";
import { apiUrl } from "@ui/lib/api-url";
import { Card, CardContent } from "@ui/components/ui/card";
import { Badge } from "@ui/components/ui/badge";
import { Button } from "@ui/components/ui/button";
import { Input } from "@ui/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@ui/components/ui/table";
import { Skeleton } from "@ui/components/ui/skeleton";
import { Separator } from "@ui/components/ui/separator";
import {
  ShieldAlert, AlertOctagon, AlertTriangle, Clock,
  RefreshCw, Search,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Override {
  id: string;
  order_id: string;
  rule: string;
  severity: "hard" | "soft";
  breach_description: string;
  justification: string;
  overridden_by: string;
  approved_by: string | null;
  status: string;
  created_at: string;
}

interface OverridesResponse {
  data: Override[];
  total: number;
  page: number;
  pageSize: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatDateTime(d: string | null): string {
  if (!d) return "-";
  try {
    return new Date(d).toLocaleString("en-PH", {
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
// Main Component
// ---------------------------------------------------------------------------
export default function ValidationOverrides() {
  const [orderFilter, setOrderFilter] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  // --- Query ---
  const overridesQ = useQuery<OverridesResponse>({
    queryKey: ["validation-overrides", orderFilter, page],
    queryFn: () => {
      const p = new URLSearchParams();
      p.set("page", String(page));
      p.set("pageSize", String(pageSize));
      if (orderFilter.trim()) p.set("order_id", orderFilter.trim());
      return apiRequest("GET", apiUrl(`/api/v1/compliance-limits/overrides?${p.toString()}`));
    },
    refetchInterval: 30_000,
  });

  const overrides = overridesQ.data?.data ?? [];
  const total = overridesQ.data?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  // --- Derived summaries ---
  const hardCount = overrides.filter((o) => o.severity === "hard").length;
  const softCount = overrides.filter((o) => o.severity === "soft").length;
  const pendingCount = overrides.filter((o) => o.status === "PENDING").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <ShieldAlert className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Validation Overrides</h1>
            <p className="text-sm text-muted-foreground">
              Compliance rule override history and audit trail
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => overridesQ.refetch()}
          disabled={overridesQ.isFetching}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${overridesQ.isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <SummaryCard title="Total Overrides" value={total} icon={ShieldAlert} accent="bg-blue-600" />
        <SummaryCard title="Hard Overrides" value={hardCount} icon={AlertOctagon} accent="bg-red-600" />
        <SummaryCard title="Soft Overrides" value={softCount} icon={AlertTriangle} accent="bg-yellow-500" />
        <SummaryCard title="Pending Approval" value={pendingCount} icon={Clock} accent="bg-orange-500" />
      </div>

      <Separator />

      {/* Filter */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Filter by Order ID..."
            value={orderFilter}
            onChange={(e) => { setOrderFilter(e.target.value); setPage(1); }}
            className="pl-9"
          />
        </div>
        {orderFilter && (
          <Button variant="outline" size="sm" onClick={() => { setOrderFilter(""); setPage(1); }}>
            Clear
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order ID</TableHead>
              <TableHead>Rule</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Breach Description</TableHead>
              <TableHead>Justification</TableHead>
              <TableHead>Overridden By</TableHead>
              <TableHead>Approved By</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {overridesQ.isLoading ? (
              <SkeletonRows cols={9} />
            ) : overrides.length === 0 ? (
              <EmptyRow cols={9} msg="No overrides found" />
            ) : (
              overrides.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-mono text-xs">{o.order_id}</TableCell>
                  <TableCell className="font-mono text-xs">{o.rule}</TableCell>
                  <TableCell>
                    <Badge className={o.severity === "hard" ? "bg-red-100 text-red-800" : "bg-yellow-100 text-yellow-800"}>
                      {o.severity.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm max-w-xs truncate">{o.breach_description}</TableCell>
                  <TableCell className="text-sm max-w-xs truncate">{o.justification}</TableCell>
                  <TableCell className="text-sm">{o.overridden_by}</TableCell>
                  <TableCell className="text-sm">{o.approved_by ?? "-"}</TableCell>
                  <TableCell>
                    <Badge className={
                      o.status === "APPROVED" ? "bg-green-100 text-green-800" :
                      o.status === "PENDING" ? "bg-yellow-100 text-yellow-800" :
                      o.status === "REJECTED" ? "bg-red-100 text-red-800" :
                      "bg-gray-100 text-gray-800"
                    }>
                      {o.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{formatDateTime(o.created_at)}</TableCell>
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
            Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, total)} of {total}
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
    </div>
  );
}
