/**
 * Handover History / Audit Trail Page (Handover & Assignment Management)
 *
 * Searchable audit trail for all HAM events. Supports:
 *   - Filters: event_type, reference_type, date range, actor_id
 *   - Results table with event details (JSON formatted)
 *   - Server-side pagination (Previous / Next)
 *   - Loading, error, and empty states
 *
 * API: GET /api/v1/ham/history
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@ui/components/ui/card";
import { Button } from "@ui/components/ui/button";
import { Input } from "@ui/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ui/components/ui/table";
import { Badge } from "@ui/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ui/components/ui/select";
import { toast } from "sonner";
import { SkeletonRows } from '@/components/ui/skeleton-rows';

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

/* ---------- API base ---------- */

const API_BASE = "/api/v1/ham";

/* ---------- Types ---------- */

interface HistoryRecord {
  id: number;
  event_type: string;
  reference_type: string;
  reference_id: string;
  actor_id: string;
  actor_name: string;
  created_at: string;
  details: Record<string, unknown> | string | null;
}

interface HistoryListResponse {
  data: HistoryRecord[];
  total: number;
  page: number;
  pageSize: number;
}

/* ---------- Constants ---------- */

const EVENT_TYPE_OPTIONS = [
  { value: "ALL", label: "All Event Types" },
  { value: "HANDOVER_REQUESTED", label: "Handover Requested" },
  { value: "HANDOVER_AUTHORIZED", label: "Handover Authorized" },
  { value: "HANDOVER_REJECTED", label: "Handover Rejected" },
  { value: "HANDOVER_COMPLETED", label: "Handover Completed" },
  { value: "HANDOVER_CANCELLED", label: "Handover Cancelled" },
  { value: "DELEGATION_CREATED", label: "Delegation Created" },
  { value: "DELEGATION_REVOKED", label: "Delegation Revoked" },
  { value: "DELEGATION_EXPIRED", label: "Delegation Expired" },
  { value: "BULK_UPLOAD_STARTED", label: "Bulk Upload Started" },
  { value: "BULK_UPLOAD_COMPLETED", label: "Bulk Upload Completed" },
  { value: "BULK_UPLOAD_FAILED", label: "Bulk Upload Failed" },
] as const;

const REFERENCE_TYPE_OPTIONS = [
  { value: "ALL", label: "All Reference Types" },
  { value: "handover", label: "Handover" },
  { value: "delegation", label: "Delegation" },
  { value: "bulk_upload", label: "Bulk Upload" },
] as const;

const EVENT_TYPE_COLORS: Record<string, string> = {
  HANDOVER_REQUESTED:
    "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  HANDOVER_AUTHORIZED:
    "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  HANDOVER_REJECTED:
    "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  HANDOVER_COMPLETED:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  HANDOVER_CANCELLED:
    "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
  DELEGATION_CREATED:
    "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  DELEGATION_REVOKED:
    "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  DELEGATION_EXPIRED:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  BULK_UPLOAD_STARTED:
    "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
  BULK_UPLOAD_COMPLETED:
    "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",
  BULK_UPLOAD_FAILED:
    "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

const DEFAULT_PAGE_SIZE = 25;

/* ---------- Helpers ---------- */

async function apiFetch<T>(url: string): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${getToken()}`,
    "Content-Type": "application/json",
  };
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error ||
        `Request failed with status ${res.status}`
    );
  }
  return res.json() as Promise<T>;
}

function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  try {
    const d = new Date(dateStr);
    return (
      d.toLocaleDateString("en-PH", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }) +
      " " +
      d.toLocaleTimeString("en-PH", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    );
  } catch {
    return dateStr;
  }
}

function formatEventType(type: string): string {
  return type.replace(/_/g, " ");
}

function formatDetails(
  details: Record<string, unknown> | string | null
): string {
  if (!details) return "-";
  if (typeof details === "string") return details;
  try {
    return JSON.stringify(details, null, 2);
  } catch {
    return String(details);
  }
}

/* ---------- Component ---------- */

export default function HandoverHistoryPage() {
  // Filter state
  const [eventType, setEventType] = useState("ALL");
  const [referenceType, setReferenceType] = useState("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [actorId, setActorId] = useState("");

  // Pagination state
  const [page, setPage] = useState(1);
  const pageSize = DEFAULT_PAGE_SIZE;

  /* ---------- Build query params ---------- */

  function buildQueryString(): string {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    if (eventType !== "ALL") params.set("event_type", eventType);
    if (referenceType !== "ALL") params.set("reference_type", referenceType);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    if (actorId.trim()) params.set("actor_id", actorId.trim());
    return params.toString();
  }

  const queryString = buildQueryString();

  /* ---------- Query ---------- */

  const {
    data: historyResult,
    isPending,
    isError,
    error,
    refetch,
  } = useQuery<HistoryListResponse>({
    queryKey: ["ham-history", queryString],
    queryFn: () =>
      apiFetch<HistoryListResponse>(
        `${API_BASE}/history?${queryString}`
      ),
  });

  const records: HistoryRecord[] = historyResult?.data ?? [];
  const totalRecords = historyResult?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));

  /* ---------- Filter handlers ---------- */

  function handleSearch() {
    setPage(1);
    refetch();
  }

  function handleClearFilters() {
    setEventType("ALL");
    setReferenceType("ALL");
    setDateFrom("");
    setDateTo("");
    setActorId("");
    setPage(1);
  }

  /* ---------- Pagination handlers ---------- */

  function handlePrevPage() {
    setPage((p) => Math.max(1, p - 1));
  }

  function handleNextPage() {
    setPage((p) => Math.min(totalPages, p + 1));
  }

  /* ---------- Render ---------- */

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Handover History &amp; Audit Trail
        </h1>
        <p className="text-sm text-muted-foreground">
          Search and review the complete audit trail of handover, delegation, and
          bulk upload events
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {/* Event Type */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Event Type
              </label>
              <Select
                value={eventType}
                onValueChange={(v: string) => {
                  setEventType(v);
                  setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Event Types" />
                </SelectTrigger>
                <SelectContent>
                  {EVENT_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Reference Type */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Reference Type
              </label>
              <Select
                value={referenceType}
                onValueChange={(v: string) => {
                  setReferenceType(v);
                  setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Reference Types" />
                </SelectTrigger>
                <SelectContent>
                  {REFERENCE_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date From */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                From Date
              </label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  setDateFrom(e.target.value);
                  setPage(1);
                }}
              />
            </div>

            {/* Date To */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                To Date
              </label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  setDateTo(e.target.value);
                  setPage(1);
                }}
              />
            </div>

            {/* Actor ID */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Actor ID
              </label>
              <Input
                placeholder="e.g. RM-001"
                value={actorId}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  setActorId(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <Button size="sm" onClick={handleSearch}>
              Search
            </Button>
            <Button variant="ghost" size="sm" onClick={handleClearFilters}>
              Clear Filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results Table */}
      {isError ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-destructive">
            <p className="font-medium">Failed to load history</p>
            <p className="text-sm text-muted-foreground mt-1">
              {(error as Error)?.message ?? "Unknown error"}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => {
                refetch();
                toast.info("Retrying...");
              }}
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                Audit Records
                {totalRecords > 0 && (
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    ({totalRecords.toLocaleString()} total)
                  </span>
                )}
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  refetch();
                  toast.info("Refreshed");
                }}
              >
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event Type</TableHead>
                    <TableHead>Reference Type</TableHead>
                    <TableHead>Reference ID</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Date / Time</TableHead>
                    <TableHead className="min-w-[280px]">Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isPending ? (
                    <SkeletonRows cols={6} rows={8} />
                  ) : records.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="text-center text-muted-foreground py-12"
                      >
                        No audit records found matching the current filters
                      </TableCell>
                    </TableRow>
                  ) : (
                    records.map((record) => (
                      <TableRow key={record.id}>
                        <TableCell>
                          <Badge
                            className={
                              EVENT_TYPE_COLORS[record.event_type] ?? ""
                            }
                            variant="secondary"
                          >
                            {formatEventType(record.event_type)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {record.reference_type}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {record.reference_id}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <p className="font-medium">
                              {record.actor_name || record.actor_id}
                            </p>
                            {record.actor_name && (
                              <p className="text-xs text-muted-foreground">
                                {record.actor_id}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">
                          {formatDateTime(record.created_at)}
                        </TableCell>
                        <TableCell>
                          <pre className="max-h-24 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/50 p-2 text-xs font-mono">
                            {formatDetails(record.details)}
                          </pre>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pagination */}
      {!isError && totalPages > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {totalRecords > 0 ? (
              <>
                Showing {(page - 1) * pageSize + 1}
                {" - "}
                {Math.min(page * pageSize, totalRecords)} of {totalRecords}
              </>
            ) : (
              "No records"
            )}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={handlePrevPage}
            >
              Previous
            </Button>
            <span className="text-sm">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={handleNextPage}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
