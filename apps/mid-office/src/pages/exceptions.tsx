/**
 * Exception Queue Page
 *
 * Focused view of unresolved trade exceptions with aging analysis.
 * Shows summary cards by aging bucket, a detailed table with color-coded ages,
 * and resolution / escalation actions.
 */

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@ui/lib/queryClient";
import { apiUrl } from "@ui/lib/api-url";
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
import { Skeleton } from "@ui/components/ui/skeleton";
import { Separator } from "@ui/components/ui/separator";
import { Textarea } from "@ui/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@ui/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ui/components/ui/select";
import {
  AlertTriangle,
  Clock,
  AlertOctagon,
  ShieldAlert,
  RefreshCw,
  ArrowUpRight,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExceptionItem {
  id: number;
  trade_id: string;
  exception_reason: string;
  created_at: string;
  age_days: number;
  deviation_pct: number | null;
  match_status: string;
  execution_price: number;
  execution_qty: number;
  cp_price: number | null;
  cp_qty: number | null;
}

interface ExceptionsSummary {
  total: number;
  age_0_1: number;
  age_2_3: number;
  age_7_plus: number;
}

interface ExceptionsResponse {
  data: ExceptionItem[];
  summary: ExceptionsSummary;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ageBadgeClass(days: number): string {
  if (days <= 1) return "bg-green-500/15 text-green-700 border-green-300";
  if (days <= 3) return "bg-yellow-500/15 text-yellow-700 border-yellow-300";
  if (days <= 7) return "bg-orange-500/15 text-orange-700 border-orange-300";
  return "bg-red-500/15 text-red-700 border-red-300";
}

function ageBadgeLabel(days: number): string {
  if (days <= 1) return "0-1d";
  if (days <= 3) return "2-3d";
  if (days <= 7) return "4-7d";
  return "7+d";
}

// ---------------------------------------------------------------------------
// Summary Card
// ---------------------------------------------------------------------------

interface SummaryCardProps {
  title: string;
  value: number | string;
  icon: React.ElementType;
  accent: string;
}

function SummaryCard({ title, value, icon: Icon, accent }: SummaryCardProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="mt-1 text-3xl font-bold text-foreground">{value}</p>
        </div>
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-lg ${accent}`}
        >
          <Icon className="h-5 w-5 text-white" />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Aging Chart (badge/bar visualization)
// ---------------------------------------------------------------------------

function AgingChart({ summary }: { summary: ExceptionsSummary }) {
  const total = summary.total || 1; // avoid div-by-zero
  const buckets = [
    { label: "0-1 Days", count: summary.age_0_1, color: "bg-green-500" },
    { label: "2-3 Days", count: summary.age_2_3, color: "bg-yellow-500" },
    {
      label: "7+ Days",
      count: summary.age_7_plus,
      color: "bg-red-500",
    },
  ];

  return (
    <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
      <p className="mb-3 text-sm font-semibold text-foreground">
        Exception Aging Distribution
      </p>
      <div className="space-y-3">
        {buckets.map((b) => {
          const pct = Math.round((b.count / total) * 100);
          return (
            <div key={b.label}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{b.label}</span>
                <span className="font-mono font-medium">
                  {b.count} ({pct}%)
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full ${b.color}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Resolve Dialog
// ---------------------------------------------------------------------------

function ResolveDialog({
  open,
  onOpenChange,
  exception,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  exception: ExceptionItem | null;
  onSubmit: (data: { action: string; notes: string }) => void;
  isPending: boolean;
}) {
  const [action, setAction] = useState<string>("");
  const [notes, setNotes] = useState("");

  const resetForm = useCallback(() => {
    setAction("");
    setNotes("");
  }, []);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) resetForm();
        onOpenChange(v);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Resolve Exception — {exception?.trade_id}
          </DialogTitle>
          <DialogDescription>
            Choose a resolution action for this trade exception.
          </DialogDescription>
        </DialogHeader>

        {/* Side-by-side comparison */}
        {exception && (
          <div className="rounded-md border p-4">
            <p className="mb-3 text-sm font-semibold">
              Internal vs Counterparty Comparison
            </p>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                  Internal
                </p>
                <div className="space-y-1 text-sm">
                  <p>
                    Price:{" "}
                    <span className="font-mono">
                      {exception.execution_price?.toFixed(4)}
                    </span>
                  </p>
                  <p>
                    Qty:{" "}
                    <span className="font-mono">
                      {exception.execution_qty?.toLocaleString()}
                    </span>
                  </p>
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                  Counterparty
                </p>
                <div className="space-y-1 text-sm">
                  <p>
                    Price:{" "}
                    <span className="font-mono">
                      {exception.cp_price?.toFixed(4) ?? "—"}
                    </span>
                  </p>
                  <p>
                    Qty:{" "}
                    <span className="font-mono">
                      {exception.cp_qty?.toLocaleString() ?? "—"}
                    </span>
                  </p>
                </div>
              </div>
            </div>
            <p className="mt-3 text-sm">
              Deviation:{" "}
              <span
                className={`font-mono font-semibold ${
                  (exception.deviation_pct ?? 0) > 1
                    ? "text-red-600"
                    : "text-foreground"
                }`}
              >
                {exception.deviation_pct != null
                  ? `${exception.deviation_pct.toFixed(2)}%`
                  : "—"}
              </span>
            </p>
          </div>
        )}

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <label className="text-sm font-medium">Action</label>
            <Select value={action} onValueChange={setAction}>
              <SelectTrigger>
                <SelectValue placeholder="Select action..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CONFIRM">Confirm</SelectItem>
                <SelectItem value="REJECT">Reject</SelectItem>
                <SelectItem value="REMATCH">Rematch</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium">Notes</label>
            <Textarea
              placeholder="Reason for resolution..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => onSubmit({ action, notes })}
            disabled={isPending || !action}
          >
            {isPending ? "Submitting..." : "Submit Resolution"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function Exceptions() {
  const queryClient = useQueryClient();

  const [resolveDialogOpen, setResolveDialogOpen] = useState(false);
  const [selectedEx, setSelectedEx] = useState<ExceptionItem | null>(null);

  // Query
  const exceptionsQuery = useQuery<ExceptionsResponse>({
    queryKey: ["/api/v1/confirmations/exceptions"],
    queryFn: () =>
      apiRequest("GET", apiUrl("/api/v1/confirmations/exceptions")),
    refetchInterval: 15_000,
  });

  // Mutations
  const invalidateAll = () => {
    queryClient.invalidateQueries({
      queryKey: ["/api/v1/confirmations/exceptions"],
    });
    queryClient.invalidateQueries({
      queryKey: ["/api/v1/confirmations/summary"],
    });
    queryClient.invalidateQueries({ queryKey: ["/api/v1/confirmations"] });
  };

  const resolveMutation = useMutation({
    mutationFn: (payload: {
      id: number;
      data: { action: string; notes: string };
    }) =>
      apiRequest(
        "POST",
        apiUrl(`/api/v1/confirmations/${payload.id}/resolve`),
        payload.data
      ),
    onSuccess: () => {
      setResolveDialogOpen(false);
      setSelectedEx(null);
      invalidateAll();
    },
  });

  const escalateMutation = useMutation({
    mutationFn: (item: ExceptionItem) =>
      apiRequest(
        "POST",
        apiUrl(`/api/v1/confirmations/${item.id}/resolve`),
        {
          action: "REMATCH",
          notes: `ESCALATED: ${item.exception_reason}`,
        }
      ),
    onSuccess: () => {
      invalidateAll();
    },
  });

  // Handlers
  const handleResolveOpen = (item: ExceptionItem) => {
    setSelectedEx(item);
    setResolveDialogOpen(true);
  };

  const handleEscalate = (item: ExceptionItem) => {
    escalateMutation.mutate(item);
  };

  const summary = exceptionsQuery.data?.summary;
  const rows = exceptionsQuery.data?.data ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Exception Queue
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Unresolved trade exceptions and aging analysis
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => invalidateAll()}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Summary Cards + Aging Chart */}
      {exceptionsQuery.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard
              title="Total Exceptions"
              value={summary?.total ?? 0}
              icon={AlertTriangle}
              accent="bg-red-600"
            />
            <SummaryCard
              title="0-1 Days"
              value={summary?.age_0_1 ?? 0}
              icon={Clock}
              accent="bg-green-600"
            />
            <SummaryCard
              title="2-3 Days"
              value={summary?.age_2_3 ?? 0}
              icon={AlertOctagon}
              accent="bg-yellow-600"
            />
            <SummaryCard
              title="7+ Days"
              value={summary?.age_7_plus ?? 0}
              icon={ShieldAlert}
              accent={
                (summary?.age_7_plus ?? 0) > 0
                  ? "bg-red-600"
                  : "bg-slate-600"
              }
            />
          </div>

          {summary && <AgingChart summary={summary} />}
        </>
      )}

      {/* Exceptions Table */}
      {exceptionsQuery.isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : rows.length === 0 ? (
        <div className="flex h-48 items-center justify-center rounded-lg border border-dashed text-muted-foreground">
          No outstanding exceptions. All clear.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Trade ID</TableHead>
                <TableHead>Exception Reason</TableHead>
                <TableHead>Created At</TableHead>
                <TableHead>Age</TableHead>
                <TableHead className="text-right">Deviation %</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.trade_id}</TableCell>
                  <TableCell className="max-w-[200px] truncate">
                    {row.exception_reason}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(row.created_at).toLocaleDateString("en-PH", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={ageBadgeClass(row.age_days)}
                    >
                      {ageBadgeLabel(row.age_days)} ({row.age_days}d)
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {row.deviation_pct != null
                      ? `${row.deviation_pct.toFixed(2)}%`
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className="bg-red-500/15 text-red-700 border-red-300"
                    >
                      EXCEPTION
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleResolveOpen(row)}
                      >
                        Resolve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleEscalate(row)}
                        disabled={escalateMutation.isPending}
                      >
                        <ArrowUpRight className="mr-1 h-3 w-3" />
                        Escalate
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Resolve Dialog */}
      <ResolveDialog
        open={resolveDialogOpen}
        onOpenChange={setResolveDialogOpen}
        exception={selectedEx}
        isPending={resolveMutation.isPending}
        onSubmit={(data) => {
          if (!selectedEx) return;
          resolveMutation.mutate({ id: selectedEx.id, data });
        }}
      />
    </div>
  );
}
