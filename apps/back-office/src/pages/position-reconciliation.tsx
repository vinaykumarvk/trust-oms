/**
 * Position Reconciliation — Back-Office Operations
 *
 * Reconciliation of internal positions against external custodian records.
 * Simpler layout than transaction recon: summary cards, breaks table, run button.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import { Input } from "@ui/components/ui/input";
import { Skeleton } from "@ui/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@ui/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ui/components/ui/table";
import { Textarea } from "@ui/components/ui/textarea";
import {
  Layers,
  Play,
  AlertTriangle,
  CheckCircle,
  Clock,
  Loader2,
  CalendarClock,
  ArrowRight,
  Info,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PositionReconSummary {
  total_runs: number;
  last_run_date: string | null;
  open_breaks: number;
  aged_over_7d: number;
}

type BreakStatus = "OPEN" | "INVESTIGATING" | "RESOLVED" | "ESCALATED";

interface PositionBreak {
  id: string;
  portfolio: string;
  security: string;
  internal_qty: number | string;
  external_qty: number | string;
  difference: number | string;
  status: BreakStatus;
  age_days: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatNumber(val: number | string | null): string {
  if (val === null || val === undefined) return "-";
  const num = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(num)) return "-";
  return num.toLocaleString("en-PH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });
}

const BREAK_STATUS_CONFIG: Record<
  BreakStatus,
  { label: string; color: string }
> = {
  OPEN: { label: "Open", color: "bg-yellow-100 text-yellow-800" },
  INVESTIGATING: {
    label: "Investigating",
    color: "bg-blue-100 text-blue-800",
  },
  RESOLVED: { label: "Resolved", color: "bg-green-100 text-green-800" },
  ESCALATED: { label: "Escalated", color: "bg-red-100 text-red-800" },
};

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
    <Card>
      <CardContent className="pt-6">
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
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Run Position Recon Dialog
// ---------------------------------------------------------------------------

interface RunDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (date: string) => void;
  running: boolean;
}

function RunPositionReconDialog({
  open,
  onOpenChange,
  onConfirm,
  running,
}: RunDialogProps) {
  const today = new Date().toISOString().split("T")[0];
  const [date, setDate] = useState(today);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Run Position Reconciliation</DialogTitle>
          <DialogDescription>
            Compare internal position holdings against external custodian
            records for the selected date.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <label className="text-sm font-medium">Reconciliation Date</label>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={running}
          >
            Cancel
          </Button>
          <Button onClick={() => onConfirm(date)} disabled={!date || running}>
            {running && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Run Reconciliation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Resolve Break Dialog
// ---------------------------------------------------------------------------

interface ResolveDialogProps {
  open: boolean;
  breakId: string | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (notes: string) => void;
  resolving: boolean;
}

function ResolveDialog({
  open,
  breakId,
  onOpenChange,
  onConfirm,
  resolving,
}: ResolveDialogProps) {
  const [notes, setNotes] = useState("");

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setNotes("");
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Resolve Position Break</DialogTitle>
          <DialogDescription>
            Break ID: {breakId ?? "-"}. Provide resolution notes.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <label className="text-sm font-medium">Resolution Notes</label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Describe how this position break was resolved..."
            rows={4}
          />
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={resolving}
          >
            Cancel
          </Button>
          <Button
            onClick={() => onConfirm(notes)}
            disabled={!notes.trim() || resolving}
          >
            {resolving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Resolve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function PositionReconciliation() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [resolveTarget, setResolveTarget] = useState<string | null>(null);

  // Summary
  const summaryQuery = useQuery<PositionReconSummary>({
    queryKey: ["position-recon-summary"],
    queryFn: () =>
      apiRequest(
        "GET",
        apiUrl("/api/v1/reconciliation/position/summary"),
      ),
  });

  // Breaks
  const breaksQuery = useQuery<{ data: PositionBreak[] }>({
    queryKey: ["position-recon-breaks"],
    queryFn: () =>
      apiRequest(
        "GET",
        apiUrl("/api/v1/reconciliation/position/breaks"),
      ),
  });

  // Trigger run
  const runMutation = useMutation({
    mutationFn: (date: string) =>
      apiRequest("POST", apiUrl("/api/v1/reconciliation/runs/position"), {
        run_date: date,
      }),
    onSuccess: () => {
      setRunDialogOpen(false);
      qc.invalidateQueries({ queryKey: ["position-recon-summary"] });
      qc.invalidateQueries({ queryKey: ["position-recon-breaks"] });
    },
  });

  // Resolve break
  const resolveMutation = useMutation({
    mutationFn: ({ breakId, notes }: { breakId: string; notes: string }) =>
      apiRequest(
        "POST",
        apiUrl(`/api/v1/reconciliation/breaks/${breakId}/resolve`),
        { notes },
      ),
    onSuccess: () => {
      setResolveTarget(null);
      qc.invalidateQueries({ queryKey: ["position-recon-breaks"] });
      qc.invalidateQueries({ queryKey: ["position-recon-summary"] });
    },
  });

  const summary = summaryQuery.data;
  const breaks = breaksQuery.data?.data ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Layers className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Position Reconciliation
            </h1>
            <p className="text-sm text-muted-foreground">
              Reconcile internal positions vs. external custodian records
            </p>
          </div>
        </div>
        <Button onClick={() => setRunDialogOpen(true)}>
          <Play className="mr-2 h-4 w-4" />
          Run Position Recon
        </Button>
      </div>

      {/* Internal Triad Recon Banner */}
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="py-3 px-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-blue-600" />
              <p className="text-sm text-blue-800">
                Internal Triad Reconciliation (Custody vs. Accounting) is
                available on the Reconciliation page.
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-blue-700 hover:text-blue-900 hover:bg-blue-100"
              onClick={() => navigate("/back-office/reconciliation")}
            >
              View Internal Recon
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          title="Total Runs"
          value={summary?.total_runs ?? 0}
          icon={Clock}
          accent="bg-indigo-600"
        />
        <SummaryCard
          title="Last Run"
          value={summary?.last_run_date ?? "-"}
          icon={CalendarClock}
          accent="bg-blue-600"
        />
        <SummaryCard
          title="Open Position Breaks"
          value={summary?.open_breaks ?? 0}
          icon={AlertTriangle}
          accent="bg-yellow-600"
        />
        <SummaryCard
          title="Aged > 7d"
          value={summary?.aged_over_7d ?? 0}
          icon={CheckCircle}
          accent="bg-red-600"
        />
      </div>

      {/* Breaks Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Position Breaks</CardTitle>
          <CardDescription>
            Discrepancies between internal and external position records
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto rounded-md border-t">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Portfolio</TableHead>
                  <TableHead>Security</TableHead>
                  <TableHead className="text-right">Internal Qty</TableHead>
                  <TableHead className="text-right">External Qty</TableHead>
                  <TableHead className="text-right">Difference</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Age</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {breaksQuery.isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 8 }).map((_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-16" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : breaks.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="text-center text-muted-foreground py-8"
                    >
                      No position breaks found
                    </TableCell>
                  </TableRow>
                ) : (
                  breaks.map((brk) => {
                    const statusCfg =
                      BREAK_STATUS_CONFIG[brk.status] ??
                      BREAK_STATUS_CONFIG.OPEN;
                    return (
                      <TableRow key={brk.id}>
                        <TableCell className="font-medium">
                          {brk.portfolio}
                        </TableCell>
                        <TableCell>{brk.security}</TableCell>
                        <TableCell className="text-right font-mono">
                          {formatNumber(brk.internal_qty)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatNumber(brk.external_qty)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatNumber(brk.difference)}
                        </TableCell>
                        <TableCell>
                          <Badge className={statusCfg.color}>
                            {statusCfg.label}
                          </Badge>
                        </TableCell>
                        <TableCell>{brk.age_days}d</TableCell>
                        <TableCell>
                          {brk.status !== "RESOLVED" && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => setResolveTarget(brk.id)}
                            >
                              Resolve
                            </Button>
                          )}
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

      {/* Dialogs */}
      <RunPositionReconDialog
        open={runDialogOpen}
        onOpenChange={setRunDialogOpen}
        onConfirm={(date) => runMutation.mutate(date)}
        running={runMutation.isPending}
      />

      <ResolveDialog
        open={resolveTarget !== null}
        breakId={resolveTarget}
        onOpenChange={(o) => {
          if (!o) setResolveTarget(null);
        }}
        onConfirm={(notes) => {
          if (resolveTarget) {
            resolveMutation.mutate({ breakId: resolveTarget, notes });
          }
        }}
        resolving={resolveMutation.isPending}
      />
    </div>
  );
}
