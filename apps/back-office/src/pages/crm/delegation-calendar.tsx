/**
 * Delegation Calendar — HAM Module
 *
 * Calendar-style view for delegation periods within the Handover &
 * Assignment Management module. Features:
 *   - Month grid with horizontal bars spanning each delegation's date range
 *   - Color-coded bars by delegation_type (lead/prospect/client) and status
 *   - Previous/Next month navigation with current month/year display
 *   - Clickable bars to view delegation detail summary
 *   - Optional RM ID filter
 *   - Legend for delegation_type and status colour mapping
 */

import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/ui/card";
import { Badge } from "@ui/components/ui/badge";
import { Button } from "@ui/components/ui/button";
import { Input } from "@ui/components/ui/input";
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

async function fetcher<T>(url: string): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${getToken()}`,
    "Content-Type": "application/json",
  };
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error || `Request failed (${res.status})`,
    );
  }
  return res.json() as Promise<T>;
}

/* ---------- Types ---------- */

interface DelegationEntry {
  id: number | string;
  outgoing_rm_id: string;
  outgoing_rm_name: string;
  delegate_rm_id: string;
  delegate_rm_name: string;
  delegation_type: "lead" | "prospect" | "client";
  status: "active" | "expired";
  start_date: string;
  end_date: string;
}

interface CalendarResponse {
  data: DelegationEntry[];
}

/* ---------- Constants ---------- */

const API = "/api/v1/ham";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** Bar colours by delegation_type */
const TYPE_COLORS: Record<
  string,
  { bg: string; border: string; text: string; label: string }
> = {
  lead: {
    bg: "bg-blue-500",
    border: "border-blue-600",
    text: "text-white",
    label: "Lead",
  },
  prospect: {
    bg: "bg-amber-500",
    border: "border-amber-600",
    text: "text-white",
    label: "Prospect",
  },
  client: {
    bg: "bg-green-500",
    border: "border-green-600",
    text: "text-white",
    label: "Client",
  },
};

/** Status modifier styles */
const STATUS_STYLES: Record<string, { modifier: string; label: string }> = {
  active: { modifier: "opacity-100", label: "Active (solid)" },
  expired: { modifier: "opacity-40", label: "Expired (muted)" },
};

/* ---------- Date helpers ---------- */

function formatDateISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatDisplayDate(s: string): string {
  try {
    const d = parseDate(s);
    return d.toLocaleDateString("en-PH", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return s;
  }
}

/** Monday-based day-of-week: 0=Mon ... 6=Sun */
function dayOfWeekMon(d: Date): number {
  return (d.getDay() + 6) % 7;
}

function getMonthStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function getMonthEnd(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/* ---------- Grid computation helpers ---------- */

/**
 * For each delegation, compute the set of "row segments" it occupies
 * in the month grid. A delegation that spans across multiple calendar
 * weeks needs to be rendered as separate bars per week row.
 */
interface BarSegment {
  delegation: DelegationEntry;
  /** 0-based row index (week row in the grid) */
  row: number;
  /** 0-based column start (Mon=0 .. Sun=6) */
  colStart: number;
  /** 0-based column end (inclusive) */
  colEnd: number;
}

function computeBarSegments(
  delegations: DelegationEntry[],
  gridStart: Date,
  gridEnd: Date,
  totalRows: number,
): BarSegment[] {
  const segments: BarSegment[] = [];

  for (const del of delegations) {
    const delStart = parseDate(del.start_date);
    const delEnd = parseDate(del.end_date);

    // Clamp to visible grid range
    const visStart = delStart < gridStart ? gridStart : delStart;
    const visEnd = delEnd > gridEnd ? gridEnd : delEnd;

    if (visStart > gridEnd || visEnd < gridStart) continue;

    // Walk through each week row and determine if the delegation is visible
    for (let row = 0; row < totalRows; row++) {
      const rowStart = addDays(gridStart, row * 7);
      const rowEnd = addDays(rowStart, 6);

      // Does the delegation intersect this row?
      if (visStart > rowEnd || visEnd < rowStart) continue;

      const segStart = visStart > rowStart ? visStart : rowStart;
      const segEnd = visEnd < rowEnd ? visEnd : rowEnd;

      const colStart = dayOfWeekMon(segStart);
      const colEnd = dayOfWeekMon(segEnd);

      segments.push({
        delegation: del,
        row,
        colStart,
        colEnd,
      });
    }
  }

  return segments;
}

/* ---------- Sub-components ---------- */

function SkeletonCalendar() {
  return (
    <div className="space-y-3">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="h-5 w-40 animate-pulse rounded bg-muted" />
        <div className="flex gap-2">
          <div className="h-9 w-9 animate-pulse rounded bg-muted" />
          <div className="h-9 w-9 animate-pulse rounded bg-muted" />
        </div>
      </div>
      {/* Day headers */}
      <div className="grid grid-cols-7 gap-px">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="h-5 animate-pulse rounded bg-muted" />
        ))}
      </div>
      {/* Grid cells */}
      {Array.from({ length: 6 }).map((_, r) => (
        <div key={r} className="grid grid-cols-7 gap-px">
          {Array.from({ length: 7 }).map((_, c) => (
            <div
              key={c}
              className="h-20 animate-pulse rounded bg-muted/50"
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/* ========== Main Component ========== */

export default function DelegationCalendarPage() {
  /* ---------- State ---------- */

  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [rmFilter, setRmFilter] = useState("");
  const [selectedDelegation, setSelectedDelegation] =
    useState<DelegationEntry | null>(null);

  /* ---------- Derived dates ---------- */

  const monthStart = useMemo(() => getMonthStart(currentDate), [currentDate]);
  const monthEnd = useMemo(() => getMonthEnd(currentDate), [currentDate]);

  // Grid always starts on a Monday and includes 6 rows (42 cells)
  const gridStart = useMemo(
    () => addDays(monthStart, -dayOfWeekMon(monthStart)),
    [monthStart],
  );
  const TOTAL_ROWS = 6;
  const gridEnd = useMemo(() => addDays(gridStart, TOTAL_ROWS * 7 - 1), [gridStart]);

  const queryFromDate = formatDateISO(gridStart);
  const queryToDate = formatDateISO(gridEnd);

  const monthLabel = `${MONTH_NAMES[currentDate.getMonth()]} ${currentDate.getFullYear()}`;

  /* ---------- Navigation ---------- */

  const navigatePrev = useCallback(() => {
    setCurrentDate(
      (prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1),
    );
    setSelectedDelegation(null);
  }, []);

  const navigateNext = useCallback(() => {
    setCurrentDate(
      (prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1),
    );
    setSelectedDelegation(null);
  }, []);

  const navigateToday = useCallback(() => {
    setCurrentDate(new Date());
    setSelectedDelegation(null);
  }, []);

  /* ---------- Data fetching ---------- */

  const {
    data: calendarResult,
    isPending,
    isError,
    error: fetchError,
  } = useQuery<CalendarResponse>({
    queryKey: [
      "delegation-calendar",
      queryFromDate,
      queryToDate,
      rmFilter.trim(),
    ],
    queryFn: () => {
      const params = new URLSearchParams({
        from_date: queryFromDate,
        to_date: queryToDate,
      });
      if (rmFilter.trim()) {
        params.set("rm_id", rmFilter.trim());
      }
      return fetcher<CalendarResponse>(
        `${API}/delegation/calendar?${params.toString()}`,
      );
    },
    refetchInterval: 30_000,
  });

  const delegations: DelegationEntry[] = calendarResult?.data ?? [];

  /* ---------- Bar segments ---------- */

  const barSegments = useMemo(
    () => computeBarSegments(delegations, gridStart, gridEnd, TOTAL_ROWS),
    [delegations, gridStart, gridEnd],
  );

  // Group segments by row for rendering
  const segmentsByRow = useMemo(() => {
    const map = new Map<number, BarSegment[]>();
    for (let r = 0; r < TOTAL_ROWS; r++) {
      map.set(r, []);
    }
    for (const seg of barSegments) {
      map.get(seg.row)?.push(seg);
    }
    return map;
  }, [barSegments]);

  /* ---------- Grid cells ---------- */

  const gridCells = useMemo(() => {
    const cells: Date[] = [];
    let d = new Date(gridStart);
    for (let i = 0; i < TOTAL_ROWS * 7; i++) {
      cells.push(new Date(d));
      d = addDays(d, 1);
    }
    return cells;
  }, [gridStart]);

  const today = useMemo(() => new Date(), []);

  /* ---------- Event handlers ---------- */

  function handleBarClick(delegation: DelegationEntry) {
    setSelectedDelegation(
      selectedDelegation?.id === delegation.id ? null : delegation,
    );
    toast.info(
      `Delegation: ${delegation.outgoing_rm_name} to ${delegation.delegate_rm_name}`,
    );
  }

  /* ---------- Render ---------- */

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold">Delegation Calendar</h1>
        <p className="text-muted-foreground">
          View active and expired delegation periods across relationship
          managers
        </p>
      </div>

      {/* Controls row */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Month navigation */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={navigatePrev}>
            <span aria-hidden="true">&larr;</span>
            <span className="sr-only">Previous month</span>
          </Button>
          <Button variant="outline" size="sm" onClick={navigateToday}>
            Today
          </Button>
          <Button variant="outline" size="sm" onClick={navigateNext}>
            <span aria-hidden="true">&rarr;</span>
            <span className="sr-only">Next month</span>
          </Button>
          <h2 className="ml-2 text-lg font-semibold">{monthLabel}</h2>
        </div>

        {/* RM filter */}
        <div className="flex items-center gap-2">
          <label htmlFor="rm-filter" className="text-sm text-muted-foreground whitespace-nowrap">
            RM ID:
          </label>
          <Input
            id="rm-filter"
            placeholder="Filter by RM ID..."
            className="w-48"
            value={rmFilter}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setRmFilter(e.target.value)
            }
          />
          {rmFilter.trim() && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setRmFilter("")}
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Calendar Card */}
      <Card>
        <CardContent className="pt-6">
          {isPending ? (
            <SkeletonCalendar />
          ) : isError ? (
            <div className="flex min-h-[300px] flex-col items-center justify-center gap-3 text-center">
              <div className="rounded-full bg-destructive/10 p-3">
                <svg
                  className="h-6 w-6 text-destructive"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <p className="text-sm font-medium text-destructive">
                Failed to load delegation calendar
              </p>
              <p className="text-xs text-muted-foreground">
                {fetchError instanceof Error
                  ? fetchError.message
                  : "Please check your connection and try again."}
              </p>
            </div>
          ) : (
            <div>
              {/* Day-of-week headers */}
              <div className="grid grid-cols-7 gap-px border-b pb-2 mb-1">
                {DAY_NAMES.map((day) => (
                  <div
                    key={day}
                    className="text-center text-xs font-medium text-muted-foreground"
                  >
                    {day}
                  </div>
                ))}
              </div>

              {/* Calendar grid: one visual row per week */}
              <div className="border rounded-md overflow-hidden">
                {Array.from({ length: TOTAL_ROWS }).map((_, rowIdx) => {
                  const rowCells = gridCells.slice(rowIdx * 7, rowIdx * 7 + 7);
                  const rowSegments = segmentsByRow.get(rowIdx) ?? [];

                  return (
                    <div key={rowIdx} className="relative">
                      {/* Day number cells */}
                      <div className="grid grid-cols-7 gap-px">
                        {rowCells.map((cellDate, colIdx) => {
                          const isCurrentMonth =
                            cellDate.getMonth() === currentDate.getMonth() &&
                            cellDate.getFullYear() ===
                              currentDate.getFullYear();
                          const isToday = isSameDay(cellDate, today);

                          return (
                            <div
                              key={colIdx}
                              className={`min-h-[80px] border-b border-r p-1 ${
                                isCurrentMonth
                                  ? "bg-background"
                                  : "bg-muted/30"
                              }`}
                            >
                              <span
                                className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                                  isToday
                                    ? "bg-primary text-primary-foreground font-bold"
                                    : isCurrentMonth
                                      ? "text-foreground"
                                      : "text-muted-foreground"
                                }`}
                              >
                                {cellDate.getDate()}
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      {/* Delegation bar overlays */}
                      {rowSegments.length > 0 && (
                        <div className="absolute inset-x-0 top-7 pointer-events-none">
                          {rowSegments.map((seg, segIdx) => {
                            const typeStyle =
                              TYPE_COLORS[seg.delegation.delegation_type] ??
                              TYPE_COLORS.lead;
                            const statusStyle =
                              STATUS_STYLES[seg.delegation.status] ??
                              STATUS_STYLES.active;
                            const isExpired =
                              seg.delegation.status === "expired";
                            const isSelected =
                              selectedDelegation?.id === seg.delegation.id;

                            // Calculate CSS positioning via percentage of 7-column grid
                            const leftPct =
                              (seg.colStart / 7) * 100;
                            const widthPct =
                              ((seg.colEnd - seg.colStart + 1) / 7) * 100;

                            return (
                              <div
                                key={`${seg.delegation.id}-${rowIdx}-${segIdx}`}
                                className="pointer-events-auto"
                                style={{
                                  position: "absolute",
                                  left: `calc(${leftPct}% + 4px)`,
                                  width: `calc(${widthPct}% - 8px)`,
                                  top: `${segIdx * 22}px`,
                                }}
                              >
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleBarClick(seg.delegation)
                                  }
                                  className={`
                                    w-full h-5 rounded-sm border text-[10px] leading-tight
                                    font-medium truncate px-1 text-left
                                    transition-shadow cursor-pointer
                                    ${typeStyle.bg} ${typeStyle.border} ${typeStyle.text}
                                    ${statusStyle.modifier}
                                    ${isExpired ? "bg-[length:8px_8px] bg-[repeating-linear-gradient(45deg,transparent,transparent_2px,rgba(255,255,255,0.3)_2px,rgba(255,255,255,0.3)_4px)]" : ""}
                                    ${isSelected ? "ring-2 ring-ring ring-offset-1" : ""}
                                    hover:shadow-md
                                  `}
                                  title={`${seg.delegation.outgoing_rm_name} -> ${seg.delegation.delegate_rm_name} (${seg.delegation.delegation_type})`}
                                >
                                  {seg.delegation.delegate_rm_name}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Empty state */}
              {delegations.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                  <p className="text-sm font-medium">
                    No delegations found for this period
                  </p>
                  <p className="text-xs">
                    {rmFilter.trim()
                      ? "Try clearing the RM filter or selecting a different month."
                      : "Navigate to a different month to see delegation periods."}
                  </p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Legend */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Legend</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-6">
            {/* Delegation type colors */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Delegation Type
              </p>
              <div className="flex flex-wrap gap-3">
                {Object.entries(TYPE_COLORS).map(([key, style]) => (
                  <div key={key} className="flex items-center gap-2">
                    <span
                      className={`inline-block h-3 w-6 rounded-sm ${style.bg}`}
                    />
                    <span className="text-xs capitalize">{style.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Status styles */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Status
              </p>
              <div className="flex flex-wrap gap-3">
                <div className="flex items-center gap-2">
                  <span className="inline-block h-3 w-6 rounded-sm bg-blue-500 opacity-100" />
                  <span className="text-xs">Active (solid)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-block h-3 w-6 rounded-sm bg-blue-500 opacity-40" />
                  <span className="text-xs">Expired (muted)</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Delegation detail summary */}
      {selectedDelegation && (
        <Card className="border-primary/30">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">
                Delegation Details
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedDelegation(null)}
              >
                Close
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <DetailItem
                label="Outgoing RM"
                value={selectedDelegation.outgoing_rm_name}
              />
              <DetailItem
                label="Delegate RM"
                value={selectedDelegation.delegate_rm_name}
              />
              <DetailItem
                label="Delegation Type"
                value={
                  <Badge
                    variant="secondary"
                    className={`capitalize ${
                      TYPE_COLORS[selectedDelegation.delegation_type]
                        ? `${TYPE_COLORS[selectedDelegation.delegation_type].bg} ${TYPE_COLORS[selectedDelegation.delegation_type].text} border-0`
                        : ""
                    }`}
                  >
                    {selectedDelegation.delegation_type}
                  </Badge>
                }
              />
              <DetailItem
                label="Status"
                value={
                  <Badge
                    variant="secondary"
                    className={`capitalize ${
                      selectedDelegation.status === "active"
                        ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                        : "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200"
                    }`}
                  >
                    {selectedDelegation.status}
                  </Badge>
                }
              />
              <DetailItem
                label="Start Date"
                value={formatDisplayDate(selectedDelegation.start_date)}
              />
              <DetailItem
                label="End Date"
                value={formatDisplayDate(selectedDelegation.end_date)}
              />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ---------- Helper sub-component ---------- */

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}
