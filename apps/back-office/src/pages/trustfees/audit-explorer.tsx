/**
 * Audit Explorer -- TrustFees Pro Phase 9
 *
 * Full UI page for exploring the HMAC-chained audit trail:
 *   - Search panel with filters (aggregate_type, aggregate_id, event_type, actor, date range)
 *   - Timeline view with event cards showing type, aggregate, actor, timestamp, payload summary
 *   - "Verify Chain" button with progress display and result
 *   - Export button for JSON download
 *   - 30-second auto-refresh, dark mode support
 */
import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@ui/lib/queryClient";
import { apiUrl } from "@ui/lib/api-url";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/ui/card";
import { Badge } from "@ui/components/ui/badge";
import { Button } from "@ui/components/ui/button";
import { Input } from "@ui/components/ui/input";
import { Label } from "@ui/components/ui/label";
import { Separator } from "@ui/components/ui/separator";
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
import {
  Shield,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Download,
  Search,
  Clock,
  User,
  FileText,
  Activity,
  ChevronLeft,
  ChevronRight,
  Loader2,
  XCircle,
} from "lucide-react";

/* ---------- Constants ---------- */

const AGGREGATE_TYPES = [
  "ALL", "FEE_PLAN", "ACCRUAL", "INVOICE", "PAYMENT", "CREDIT_NOTE",
  "DISPUTE", "OVERRIDE", "EXCEPTION", "TAX_RULE",
];

const EVENT_TYPES = [
  "ALL", "CREATED", "UPDATED", "DELETED", "STATUS_CHANGE",
  "APPROVED", "REJECTED", "REVERSED", "EXPORTED",
];

/* ---------- Helpers ---------- */

function formatTimestamp(ts: string | null): string {
  if (!ts) return "--";
  const d = new Date(ts);
  return d.toLocaleString("en-US", {
    month: "short", day: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function truncate(str: string | null, maxLen: number): string {
  if (!str) return "--";
  return str.length > maxLen ? str.slice(0, maxLen) + "..." : str;
}

function payloadSummary(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "--";
  const keys = Object.keys(payload as Record<string, unknown>);
  if (keys.length === 0) return "--";
  return keys.slice(0, 4).join(", ") + (keys.length > 4 ? "..." : "");
}

/* ---------- Component ---------- */

export default function AuditExplorer() {
  // Filters
  const [aggregateType, setAggregateType] = useState("ALL");
  const [aggregateId, setAggregateId] = useState("");
  const [eventType, setEventType] = useState("ALL");
  const [actorId, setActorId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  // Build query params
  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (aggregateType !== "ALL") params.set("aggregate_type", aggregateType);
    if (aggregateId) params.set("aggregate_id", aggregateId);
    if (eventType !== "ALL") params.set("event_type", eventType);
    if (actorId) params.set("actor_id", actorId);
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    return params.toString();
  }, [aggregateType, aggregateId, eventType, actorId, dateFrom, dateTo, page]);

  // Fetch events
  const { data: eventsData, isLoading, refetch } = useQuery<any>({
    queryKey: ["/api/v1/tfp-audit/events", queryParams],
    queryFn: () => apiRequest("GET", apiUrl(`/api/v1/tfp-audit/events?${queryParams}`)),
    refetchInterval: 30_000,
  });

  const events = eventsData?.data ?? [];
  const total = eventsData?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  // Verify chain mutation
  const verifyMutation = useMutation<any, Error, void>({
    mutationFn: () => apiRequest("POST", apiUrl("/api/v1/tfp-audit/verify-chain"), {}),
  });

  // Flush mutation
  const flushMutation = useMutation<any, Error, void>({
    mutationFn: () => apiRequest("POST", apiUrl("/api/v1/tfp-audit/flush"), {}),
    onSuccess: () => refetch(),
  });

  // Export handler
  const handleExport = async () => {
    const params = new URLSearchParams();
    if (aggregateType !== "ALL") params.set("aggregate_type", aggregateType);
    if (aggregateId) params.set("aggregate_id", aggregateId);
    if (eventType !== "ALL") params.set("event_type", eventType);
    if (actorId) params.set("actor_id", actorId);
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    params.set("format", "json");

    try {
      const data = await apiRequest("GET", apiUrl(`/api/v1/tfp-audit/events/export?${params.toString()}`));
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-events-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Export failed silently
    }
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground dark:text-white">
            Audit Explorer
          </h1>
          <p className="text-sm text-muted-foreground dark:text-gray-400">
            HMAC-chained audit trail with tamper detection
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => flushMutation.mutate()}
            disabled={flushMutation.isPending}
          >
            {flushMutation.isPending ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Activity className="mr-1 h-4 w-4" />
            )}
            Flush Window
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => verifyMutation.mutate()}
            disabled={verifyMutation.isPending}
          >
            {verifyMutation.isPending ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Shield className="mr-1 h-4 w-4" />
            )}
            Verify Chain
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="mr-1 h-4 w-4" />
            Export JSON
          </Button>
          <Button variant="outline" size="icon" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Verification Result */}
      {verifyMutation.isSuccess && (
        <Card className={verifyMutation.data?.verified
          ? "border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-900/20"
          : "border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-900/20"
        }>
          <CardContent className="flex items-center gap-3 py-3">
            {verifyMutation.data?.verified ? (
              <>
                <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                <span className="text-green-800 dark:text-green-300 font-medium">
                  Chain verified: {verifyMutation.data.windows_checked} windows checked -- no tampering detected
                </span>
              </>
            ) : (
              <>
                <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                <div>
                  <span className="text-red-800 dark:text-red-300 font-medium">
                    Chain integrity broken at window {verifyMutation.data.first_broken_window?.window_id}
                  </span>
                  <p className="text-sm text-red-600 dark:text-red-400">
                    Expected: {verifyMutation.data.first_broken_window?.expected_hash?.slice(0, 16)}...
                    Got: {verifyMutation.data.first_broken_window?.actual_hash?.slice(0, 16)}...
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Flush Result */}
      {flushMutation.isSuccess && flushMutation.data?.flushed && (
        <Card className="border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-900/20">
          <CardContent className="flex items-center gap-3 py-3">
            <CheckCircle className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <span className="text-blue-800 dark:text-blue-300 font-medium">
              Window flushed: {flushMutation.data.event_count} events sealed (Window #{flushMutation.data.window_id})
            </span>
          </CardContent>
        </Card>
      )}

      {/* Search Panel */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Search className="h-4 w-4" /> Search Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
            <div className="space-y-1">
              <Label className="text-xs">Aggregate Type</Label>
              <Select value={aggregateType} onValueChange={(v) => { setAggregateType(v); setPage(1); }}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AGGREGATE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Aggregate ID</Label>
              <Input
                className="h-8 text-xs"
                placeholder="e.g. 42"
                value={aggregateId}
                onChange={(e) => { setAggregateId(e.target.value); setPage(1); }}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Event Type</Label>
              <Select value={eventType} onValueChange={(v) => { setEventType(v); setPage(1); }}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EVENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Actor</Label>
              <Input
                className="h-8 text-xs"
                placeholder="User ID"
                value={actorId}
                onChange={(e) => { setActorId(e.target.value); setPage(1); }}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">From</Label>
              <Input
                className="h-8 text-xs"
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To</Label>
              <Input
                className="h-8 text-xs"
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Timeline / Table View */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <Clock className="h-4 w-4" /> Audit Events
            </span>
            <span className="text-xs font-normal text-muted-foreground">
              {total} total events
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : events.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <FileText className="mb-2 h-8 w-8" />
              <p>No audit events found</p>
            </div>
          ) : (
            <>
              {/* Timeline View */}
              <div className="relative">
                {/* Timeline line */}
                <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border dark:bg-gray-700" />

                <div className="space-y-3">
                  {events.map((event: any) => (
                    <div key={event.id} className="relative pl-10">
                      {/* Timeline dot */}
                      <div className="absolute left-2.5 top-3 h-3 w-3 rounded-full border-2 border-primary bg-background dark:bg-gray-900" />

                      <div className="rounded-lg border p-3 transition-colors hover:bg-muted/50 dark:border-gray-700 dark:hover:bg-gray-800/50">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline" className="text-xs">
                                {event.event_type}
                              </Badge>
                              <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 text-xs">
                                {event.aggregate_type}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                #{event.aggregate_id}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Payload: {payloadSummary(event.payload)}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-1 text-right shrink-0">
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatTimestamp(event.created_at)}
                            </span>
                            {event.actor_id && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <User className="h-3 w-3" />
                                {event.actor_id}
                              </span>
                            )}
                            {event.window_id && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Shield className="h-3 w-3" />
                                Window #{event.window_id}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Pagination */}
              <div className="mt-4 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  Page {page} of {totalPages || 1}
                </span>
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
