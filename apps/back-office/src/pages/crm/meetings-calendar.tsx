/**
 * Meetings Calendar — Multi-View (CRM PAD)
 *
 * Multi-view calendar for scheduling and tracking meetings:
 *   - KPI cards: This Week's Meetings, Pending MOM, Open Action Items, Overdue Items
 *   - Views: Month / Week / Day / List (with Upcoming/Past/Call Reports/Action Items tabs)
 *   - Schedule Meeting dialog with reason, mode, all-day, remarks
 *   - Mark as Completed flow (FR-018) with "File Call Report" link
 *   - Pulsing indicator for completed meetings with pending call report
 */

import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@ui/components/ui/card';
import { Button } from '@ui/components/ui/button';
import { Badge } from '@ui/components/ui/badge';
import { Input } from '@ui/components/ui/input';
import { Textarea } from '@ui/components/ui/textarea';
import { Checkbox } from '@ui/components/ui/checkbox';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@ui/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@ui/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@ui/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@ui/components/ui/tabs';
import { toast } from 'sonner';
import {
  Calendar, Clock, Plus, FileText, AlertTriangle,
  Video, Phone, Users, CheckCircle,
  Eye, EyeOff, ClipboardList, ChevronLeft, ChevronRight,
  MapPin, Link as LinkIcon, LayoutGrid, LayoutList, Columns, CalendarDays,
  Sparkles, Loader2,
} from 'lucide-react';
import { fetcher, mutationFn } from '@/lib/api';
import {
  MEETING_TYPES,
  MEETING_MODES,
  MEETING_PURPOSES,
  MEETING_REASONS,
  meetingStatusColors,
  meetingReasonBlockColors,
  callReportStatusColors,
  actionPriorityColors,
  actionStatusColors,
} from '@/lib/crm-constants';
import { SkeletonRows } from '@/components/ui/skeleton-rows';

/* ---------- Types ---------- */

type CalendarView = 'month' | 'week' | 'day' | 'list';

interface MeetingRecord {
  id: number;
  title: string;
  meeting_type: string;
  scheduled_start: string;
  scheduled_end: string;
  location: string | null;
  virtual_link: string | null;
  purpose: string;
  agenda: string | null;
  client_id: string | null;
  client_name: string | null;
  relationship_name: string | null;
  meeting_status: string;
  meeting_reason: string | null;
  meeting_reason_other: string | null;
  mode: string | null;
  is_all_day: boolean;
  remarks: string | null;
  mom_status: string | null;
  call_report_status: string | null;
  created_at: string;
  updated_at: string;
}

interface CallReportRecord {
  id: number;
  meeting_id: number | null;
  client_id: string | null;
  client_name: string | null;
  rm_name: string | null;
  report_status: string;
  report_date: string;
  created_at: string;
}

interface ActionItemRecord {
  id: number;
  description: string;
  due_date: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  action_status: 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  assigned_to_user_id: string | null;
  created_at: string;
}

interface MeetingListResult {
  data: MeetingRecord[];
  total: number;
}

interface CallReportListResult {
  data: CallReportRecord[];
  total: number;
}

interface NewMeetingForm {
  title: string;
  meeting_type: string;
  scheduled_start: string;
  scheduled_end: string;
  location: string;
  virtual_link: string;
  purpose: string;
  agenda: string;
  meeting_reason: string;
  meeting_reason_other: string;
  mode: string;
  is_all_day: boolean;
  remarks: string;
}

/* ---------- Date helpers ---------- */

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function endOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(23, 59, 59, 999);
  return r;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** Monday-based day-of-week: 0=Mon, 6=Sun */
function dayOfWeekMon(d: Date): number {
  return (d.getDay() + 6) % 7;
}

function getMonthStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function getMonthEnd(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function getWeekStart(d: Date): Date {
  const r = startOfDay(d);
  r.setDate(r.getDate() - dayOfWeekMon(r));
  return r;
}

function getWeekEnd(d: Date): Date {
  return addDays(getWeekStart(d), 6);
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function formatDateISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDateRange(start: Date, end: Date): string {
  const s = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const e = end.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  return `${s} - ${e}`;
}

function formatFullDate(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

/* ---------- Calendar block colors by meeting status ---------- */

const statusBlockColors: Record<string, string> = {
  SCHEDULED: 'bg-blue-200 dark:bg-blue-800 border-blue-400 dark:border-blue-600',
  COMPLETED: 'bg-green-200 dark:bg-green-800 border-green-400 dark:border-green-600',
  CANCELLED: 'bg-red-200 dark:bg-red-800 border-red-400 dark:border-red-600',
  RESCHEDULED: 'bg-yellow-200 dark:bg-yellow-800 border-yellow-400 dark:border-yellow-600',
  NO_SHOW: 'bg-gray-200 dark:bg-gray-700 border-gray-400 dark:border-gray-600',
};

/* ---------- Meeting mode icons ---------- */

const meetingModeIcon: Record<string, typeof Users> = {
  IN_PERSON: Users,
  VIDEO: Video,
  PHONE: Phone,
  BRANCH_VISIT: MapPin,
};

/* ---------- Skeleton helper ---------- */

// SkeletonRows imported from @/components/ui/skeleton-rows

/* ---------- Empty form state ---------- */

const emptyMeetingForm: NewMeetingForm = {
  title: '',
  meeting_type: '',
  scheduled_start: '',
  scheduled_end: '',
  location: '',
  virtual_link: '',
  purpose: '',
  agenda: '',
  meeting_reason: '',
  meeting_reason_other: '',
  mode: '',
  is_all_day: false,
  remarks: '',
};

/* ========== Component ========== */

export default function MeetingsCalendar() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // --- State ---
  const [calendarView, setCalendarView] = useState<CalendarView>('month');
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [listTab, setListTab] = useState('upcoming');
  const [listPage, setListPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [newMeeting, setNewMeeting] = useState<NewMeetingForm>({ ...emptyMeetingForm });
  // BR-011: toggle cancelled visibility in calendar views
  const [showCancelled, setShowCancelled] = useState(true);

  // --- Date range computation based on view ---
  const dateRange = useMemo(() => {
    if (calendarView === 'month') {
      const ms = getMonthStart(currentDate);
      const me = getMonthEnd(currentDate);
      const gridStart = addDays(ms, -dayOfWeekMon(ms));
      const gridEnd = addDays(me, 6 - dayOfWeekMon(me));
      return { start: gridStart, end: gridEnd };
    }
    if (calendarView === 'week') {
      return { start: getWeekStart(currentDate), end: getWeekEnd(currentDate) };
    }
    // day or list
    return { start: startOfDay(currentDate), end: endOfDay(currentDate) };
  }, [calendarView, currentDate]);

  // --- Calendar date label ---
  const dateLabel = useMemo(() => {
    if (calendarView === 'month') {
      return `${MONTH_NAMES[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
    }
    if (calendarView === 'week') {
      return formatDateRange(getWeekStart(currentDate), getWeekEnd(currentDate));
    }
    if (calendarView === 'day') {
      return formatFullDate(currentDate);
    }
    return `${MONTH_NAMES[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
  }, [calendarView, currentDate]);

  // --- Navigation ---
  const navigatePrev = useCallback(() => {
    setCurrentDate((prev) => {
      if (calendarView === 'month') return new Date(prev.getFullYear(), prev.getMonth() - 1, 1);
      if (calendarView === 'week') return addDays(prev, -7);
      if (calendarView === 'day') return addDays(prev, -1);
      return new Date(prev.getFullYear(), prev.getMonth() - 1, 1);
    });
    setSelectedDay(null);
  }, [calendarView]);

  const navigateNext = useCallback(() => {
    setCurrentDate((prev) => {
      if (calendarView === 'month') return new Date(prev.getFullYear(), prev.getMonth() + 1, 1);
      if (calendarView === 'week') return addDays(prev, 7);
      if (calendarView === 'day') return addDays(prev, 1);
      return new Date(prev.getFullYear(), prev.getMonth() + 1, 1);
    });
    setSelectedDay(null);
  }, [calendarView]);

  const navigateToday = useCallback(() => {
    setCurrentDate(new Date());
    setSelectedDay(null);
  }, []);

  // --- Data Fetching ---
  const calendarQueryStart = formatDateISO(dateRange.start);
  const calendarQueryEnd = formatDateISO(dateRange.end);

  const { data: calendarData, isPending: calendarPending } = useQuery<MeetingListResult>({
    queryKey: ['meetings-calendar', calendarView, calendarQueryStart, calendarQueryEnd],
    queryFn: () => fetcher(`/api/v1/meetings/calendar?startDate=${calendarQueryStart}&endDate=${calendarQueryEnd}`),
    refetchInterval: 15000,
  });

  const { data: meetingsData, isPending: meetingsPending } = useQuery<MeetingListResult>({
    queryKey: ['meetings-list'],
    queryFn: () => fetcher('/api/v1/meetings?pageSize=200'),
    refetchInterval: 15000,
  });

  const { data: callReportsData, isPending: callReportsPending } = useQuery<CallReportListResult>({
    queryKey: ['call-reports-list'],
    queryFn: () => fetcher('/api/v1/call-reports?pageSize=200'),
    refetchInterval: 30000,
  });

  const { data: actionItemsData, isPending: actionItemsPending } = useQuery<{ data: ActionItemRecord[] }>({
    queryKey: ['action-items'],
    queryFn: () => fetcher('/api/v1/action-items?pageSize=50'),
    refetchInterval: 30000,
  });

  // --- Derived data ---
  const calendarMeetings: MeetingRecord[] = calendarData?.data ?? [];
  const allMeetings: MeetingRecord[] = meetingsData?.data ?? [];
  const callReports: CallReportRecord[] = callReportsData?.data ?? [];
  const actionItems: ActionItemRecord[] = actionItemsData?.data ?? [];

  const now = new Date();
  const upcomingMeetings = allMeetings.filter(
    (m) => new Date(m.scheduled_start) >= now && m.meeting_status !== 'CANCELLED',
  );
  const pastMeetings = allMeetings.filter(
    (m) => new Date(m.scheduled_start) < now || m.meeting_status === 'CANCELLED',
  );

  // BR-011: filter cancelled from calendar blocks when toggle is off
  const visibleCalendarMeetings = useMemo(() => {
    if (showCancelled) return calendarMeetings;
    return calendarMeetings.filter((m) => m.meeting_status !== 'CANCELLED');
  }, [calendarMeetings, showCancelled]);

  // BR-014: subject auto-suggest from existing meeting titles
  const meetingTitleSuggestions = useMemo(() => {
    const seen = new Set<string>();
    const titles: string[] = [];
    for (const m of allMeetings) {
      if (m.title && !seen.has(m.title)) {
        seen.add(m.title);
        titles.push(m.title);
      }
    }
    return titles.slice(0, 30);
  }, [allMeetings]);

  // --- KPI Calculations ---
  const kpiStartOfWeek = new Date();
  kpiStartOfWeek.setDate(kpiStartOfWeek.getDate() - kpiStartOfWeek.getDay());
  kpiStartOfWeek.setHours(0, 0, 0, 0);
  const kpiEndOfWeek = new Date(kpiStartOfWeek);
  kpiEndOfWeek.setDate(kpiEndOfWeek.getDate() + 7);

  const thisWeekMeetings = allMeetings.filter((m) => {
    const d = new Date(m.scheduled_start);
    return d >= kpiStartOfWeek && d < kpiEndOfWeek;
  }).length;

  const pendingMom = allMeetings.filter(
    (m) => m.meeting_status === 'COMPLETED' && m.mom_status === 'PENDING',
  ).length;

  const openActions = actionItems.filter(
    (a) => a.action_status === 'OPEN' || a.action_status === 'IN_PROGRESS',
  ).length;

  const overdueItems = actionItems.filter((a) => {
    if (a.action_status === 'COMPLETED' || a.action_status === 'CANCELLED') return false;
    return new Date(a.due_date) < now;
  }).length;

  const kpiCards = [
    { label: "This Week's Meetings", value: thisWeekMeetings, icon: Calendar, color: 'text-blue-600' },
    { label: 'Pending MOM', value: pendingMom, icon: FileText, color: 'text-orange-600' },
    { label: 'Open Action Items', value: openActions, icon: ClipboardList, color: 'text-purple-600' },
    { label: 'Overdue Items', value: overdueItems, icon: AlertTriangle, color: 'text-red-600' },
  ];

  // --- Mutations ---
  const createMutation = useMutation({
    mutationFn: (data: NewMeetingForm) =>
      mutationFn('POST', '/api/v1/meetings', {
        title: data.title,
        meeting_type: data.meeting_type,
        scheduled_start: data.is_all_day ? data.scheduled_start.split('T')[0] : data.scheduled_start,
        scheduled_end: data.is_all_day ? data.scheduled_end.split('T')[0] : data.scheduled_end,
        location: data.location || undefined,
        virtual_link: data.virtual_link || undefined,
        purpose: data.purpose,
        agenda: data.agenda || undefined,
        meeting_reason: data.meeting_reason || undefined,
        meeting_reason_other: data.meeting_reason === 'OTHER' ? data.meeting_reason_other : undefined,
        mode: data.mode || undefined,
        is_all_day: data.is_all_day,
        remarks: data.remarks || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meetings-list'] });
      queryClient.invalidateQueries({ queryKey: ['meetings-calendar'] });
      setCreateOpen(false);
      setNewMeeting({ ...emptyMeetingForm });
      toast.success('Meeting scheduled successfully');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const completeMutation = useMutation({
    mutationFn: (meetingId: number) =>
      mutationFn('PATCH', `/api/v1/meetings/${meetingId}/complete`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meetings-list'] });
      queryClient.invalidateQueries({ queryKey: ['meetings-calendar'] });
      toast.success('Meeting marked as completed');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // --- Group meetings by date for calendar views ---
  const meetingsByDate = useMemo(() => {
    const map = new Map<string, MeetingRecord[]>();
    for (const m of visibleCalendarMeetings) {
      const key = formatDateISO(new Date(m.scheduled_start));
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    }
    return map;
  }, [visibleCalendarMeetings]);

  // --- Month grid cells ---
  const monthGridCells = useMemo(() => {
    if (calendarView !== 'month') return [];
    const ms = getMonthStart(currentDate);
    const gridStart = addDays(ms, -dayOfWeekMon(ms));
    const cells: Date[] = [];
    let day = new Date(gridStart);
    for (let i = 0; i < 42; i++) {
      cells.push(new Date(day));
      day = addDays(day, 1);
    }
    return cells;
  }, [calendarView, currentDate]);

  // --- Week view time slots (8AM-6PM, 30-min) ---
  const weekTimeSlots = useMemo(() => {
    const slots: string[] = [];
    for (let h = 8; h <= 18; h++) {
      slots.push(`${String(h).padStart(2, '0')}:00`);
      if (h < 18) slots.push(`${String(h).padStart(2, '0')}:30`);
    }
    return slots;
  }, []);

  // --- Day view time slots (7AM-7PM, 30-min) ---
  const dayTimeSlots = useMemo(() => {
    const slots: string[] = [];
    for (let h = 7; h <= 19; h++) {
      slots.push(`${String(h).padStart(2, '0')}:00`);
      if (h < 19) slots.push(`${String(h).padStart(2, '0')}:30`);
    }
    return slots;
  }, []);

  // --- Week days array ---
  const weekDays = useMemo(() => {
    if (calendarView !== 'week') return [];
    const ws = getWeekStart(currentDate);
    return Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  }, [calendarView, currentDate]);

  // --- Helper: meetings for a given day ---
  function getMeetingsForDay(d: Date): MeetingRecord[] {
    return meetingsByDate.get(formatDateISO(d)) ?? [];
  }

  // --- Helper: time to minutes from midnight ---
  function timeToMinutes(dateStr: string): number {
    const d = new Date(dateStr);
    return d.getHours() * 60 + d.getMinutes();
  }

  // --- Meeting Prep dialog ---
  const [prepMeeting, setPrepMeeting]   = useState<MeetingRecord | null>(null);
  const [prepLoading, setPrepLoading]   = useState(false);
  const [prepContent, setPrepContent]   = useState<{
    brief: string;
    talking_points: string[];
    compliance_notes: string[];
  } | null>(null);
  const [prepError, setPrepError]       = useState<string | null>(null);

  async function openMeetingPrep(meeting: MeetingRecord) {
    setPrepMeeting(meeting);
    setPrepContent(null);
    setPrepError(null);
    setPrepLoading(true);
    try {
      const clientParam = meeting.client_id ? `&client_id=${meeting.client_id}` : '';
      const res = await fetch(
        `/api/v1/intelligence/meeting-prep/${meeting.id}?${clientParam}`,
        { credentials: 'include' },
      );
      if (res.ok) {
        setPrepContent(await res.json());
      } else if (res.status === 503) {
        setPrepError('Platform intelligence service is not yet configured.');
      } else {
        setPrepError('Failed to load meeting prep brief.');
      }
    } catch {
      setPrepError('Connection error. Please try again.');
    } finally {
      setPrepLoading(false);
    }
  }

  // --- AC-007: Calendar block color (reason takes precedence over status) ---
  function getMeetingBlockColor(m: MeetingRecord): string {
    if (m.meeting_reason && meetingReasonBlockColors[m.meeting_reason]) {
      return meetingReasonBlockColors[m.meeting_reason];
    }
    return getMeetingBlockColor(m);
  }

  // --- BR-015: Warn if new meeting time overlaps an existing one ---
  function warnIfOverlapping(start: string, end: string) {
    if (!start || !end || start >= end) return;
    const newStart = new Date(start).getTime();
    const newEnd = new Date(end).getTime();
    const overlap = allMeetings.find((m) => {
      if (m.meeting_status === 'CANCELLED' || m.meeting_status === 'RESCHEDULED') return false;
      const mStart = new Date(m.scheduled_start).getTime();
      const mEnd = new Date(m.scheduled_end).getTime();
      return newStart < mEnd && newEnd > mStart;
    });
    if (overlap) {
      toast.warning(
        `Overlaps with "${overlap.title}" (${formatTime(overlap.scheduled_start)} – ${formatTime(overlap.scheduled_end)})`,
      );
    }
  }

  // --- Pulsing indicator for pending call reports ---
  function PulsingDot() {
    return (
      <span
        className="inline-block h-2 w-2 rounded-full bg-orange-500 animate-pulse shrink-0"
        title="Pending call report"
      />
    );
  }

  // --- Complete button / File Call Report link ---
  function MeetingActions({ meeting }: { meeting: MeetingRecord }) {
    const isPast      = new Date(meeting.scheduled_end) < new Date();
    const hasClient   = !!meeting.client_id;

    if (meeting.meeting_status === 'SCHEDULED' && isPast) {
      return (
        <div className="flex items-center gap-1">
          {hasClient && (
            <Button
              size="sm"
              variant="ghost"
              className="text-purple-600 hover:text-purple-700 h-7 px-2"
              onClick={(e) => { e.stopPropagation(); openMeetingPrep(meeting); }}
              title="AI meeting prep brief"
            >
              <Sparkles className="h-4 w-4 mr-1" />
              Prepare
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="text-green-600 hover:text-green-700 h-7 px-2"
            onClick={(e) => {
              e.stopPropagation();
              completeMutation.mutate(meeting.id);
            }}
            disabled={completeMutation.isPending}
            title="Mark as completed"
          >
            <CheckCircle className="h-4 w-4 mr-1" />
            Complete
          </Button>
        </div>
      );
    }
    if (meeting.meeting_status === 'SCHEDULED' && !isPast && hasClient) {
      return (
        <Button
          size="sm"
          variant="ghost"
          className="text-purple-600 hover:text-purple-700 h-7 px-2"
          onClick={(e) => { e.stopPropagation(); openMeetingPrep(meeting); }}
          title="AI meeting prep brief"
        >
          <Sparkles className="h-4 w-4 mr-1" />
          Prepare
        </Button>
      );
    }
    if (meeting.meeting_status === 'COMPLETED') {
      return (
        <div className="flex items-center gap-1">
          {hasClient && (
            <Button
              size="sm"
              variant="ghost"
              className="text-purple-600 hover:text-purple-700 h-7 px-2"
              onClick={(e) => { e.stopPropagation(); openMeetingPrep(meeting); }}
              title="AI meeting prep brief"
            >
              <Sparkles className="h-4 w-4 mr-1" />
              Prepare
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="text-blue-600 hover:text-blue-700 h-7 px-2"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/crm/call-reports/new?meetingId=${meeting.id}`);
            }}
            title="File call report"
          >
            <FileText className="h-4 w-4 mr-1" />
            File Call Report
          </Button>
        </div>
      );
    }
    return null;
  }

  // --- Meeting title with pulsing indicator and BR-007 strikethrough for cancelled ---
  function MeetingTitle({ meeting, truncate = false }: { meeting: MeetingRecord; truncate?: boolean }) {
    const showPulse = meeting.meeting_status === 'COMPLETED' && meeting.call_report_status === 'PENDING';
    const isCancelled = meeting.meeting_status === 'CANCELLED';
    return (
      <span className={`flex items-center gap-1 ${truncate ? 'truncate' : ''}`}>
        {showPulse && <PulsingDot />}
        <span className={[
          truncate ? 'truncate' : '',
          isCancelled ? 'line-through opacity-60' : '',
        ].filter(Boolean).join(' ')}>
          {meeting.title}
        </span>
      </span>
    );
  }

  /* ========== MONTH VIEW ========== */

  function renderMonthView() {
    const today = startOfDay(new Date());
    const ms = getMonthStart(currentDate);
    const me = getMonthEnd(currentDate);

    return (
      <div className="space-y-2">
        {/* Day headers */}
        <div className="grid grid-cols-7 gap-px">
          {DAY_NAMES.map((d) => (
            <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">
              {d}
            </div>
          ))}
        </div>

        {/* Grid cells */}
        <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
          {monthGridCells.map((cellDate, idx) => {
            const isCurrentMonth = cellDate >= ms && cellDate <= me;
            const isToday = isSameDay(cellDate, today);
            const isSelected = selectedDay !== null && isSameDay(cellDate, selectedDay);
            const meetings = getMeetingsForDay(cellDate);
            const maxVisible = 3;

            return (
              <div
                key={idx}
                onClick={() => setSelectedDay(cellDate)}
                className={[
                  'min-h-[100px] p-1.5 bg-background cursor-pointer transition-colors hover:bg-accent/50',
                  !isCurrentMonth && 'opacity-40',
                  isToday && 'ring-2 ring-blue-500 ring-inset',
                  isSelected && 'bg-accent',
                ].filter(Boolean).join(' ')}
              >
                <div className={[
                  'text-xs font-medium mb-1',
                  isToday ? 'text-blue-600 dark:text-blue-400 font-bold' : 'text-foreground',
                ].filter(Boolean).join(' ')}>
                  {cellDate.getDate()}
                </div>
                <div className="space-y-0.5">
                  {meetings.slice(0, maxVisible).map((m) => (
                    <div
                      key={m.id}
                      className={[
                        'text-[10px] leading-tight px-1 py-0.5 rounded truncate border-l-2',
                        getMeetingBlockColor(m),
                      ].join(' ')}
                      title={`${m.title} (${formatTime(m.scheduled_start)})`}
                    >
                      <MeetingTitle meeting={m} truncate />
                    </div>
                  ))}
                  {meetings.length > maxVisible && (
                    <div className="text-[10px] text-muted-foreground font-medium pl-1">
                      +{meetings.length - maxVisible} more
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Day detail panel */}
        {selectedDay && (
          <Card className="mt-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                {formatFullDate(selectedDay)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(() => {
                const dayMeetings = getMeetingsForDay(selectedDay);
                if (dayMeetings.length === 0) {
                  return (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                      No meetings scheduled for this day.
                    </p>
                  );
                }
                return (
                  <div className="space-y-3">
                    {dayMeetings.map((m) => (
                      <div
                        key={m.id}
                        className={[
                          'flex items-start justify-between p-3 rounded-lg border-l-4',
                          getMeetingBlockColor(m),
                        ].join(' ')}
                      >
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="font-medium text-sm">
                            <MeetingTitle meeting={m} />
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {m.is_all_day
                                ? 'All Day'
                                : `${formatTime(m.scheduled_start)} - ${formatTime(m.scheduled_end)}`}
                            </span>
                            {m.meeting_type && (
                              <span>{m.meeting_type.replace(/_/g, ' ')}</span>
                            )}
                            {(m.relationship_name || m.client_name) && (
                              <span>{m.relationship_name || m.client_name}</span>
                            )}
                          </div>
                          {(m.location || m.virtual_link) && (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              {m.location && (
                                <span className="flex items-center gap-1">
                                  <MapPin className="h-3 w-3" /> {m.location}
                                </span>
                              )}
                              {m.virtual_link && (
                                <a
                                  href={m.virtual_link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1 text-blue-600 hover:underline"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <LinkIcon className="h-3 w-3" /> Join
                                </a>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 ml-2 shrink-0">
                          <Badge className={meetingStatusColors[m.meeting_status] || ''} variant="secondary">
                            {m.meeting_status.replace(/_/g, ' ')}
                          </Badge>
                          <MeetingActions meeting={m} />
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  /* ========== WEEK VIEW ========== */

  function renderWeekView() {
    const today = startOfDay(new Date());
    const slotStartHour = 8;
    const slotEndHour = 18;
    const totalMinutes = (slotEndHour - slotStartHour) * 60;
    const rowHeight = 40;
    const totalHeight = (totalMinutes / 30) * rowHeight;

    return (
      <div className="border rounded-lg overflow-auto">
        {/* Header row */}
        <div className="grid grid-cols-[80px_repeat(7,1fr)] border-b sticky top-0 bg-background z-10">
          <div className="p-2 text-xs font-medium text-muted-foreground border-r" />
          {weekDays.map((d, i) => {
            const isToday = isSameDay(d, today);
            return (
              <div
                key={i}
                className={[
                  'p-2 text-center border-r last:border-r-0',
                  isToday && 'bg-blue-50 dark:bg-blue-950/30',
                ].filter(Boolean).join(' ')}
              >
                <div className="text-xs font-medium text-muted-foreground">{DAY_NAMES[i]}</div>
                <div className={[
                  'text-sm font-bold',
                  isToday ? 'text-blue-600 dark:text-blue-400' : '',
                ].filter(Boolean).join(' ')}>
                  {d.getDate()}
                </div>
              </div>
            );
          })}
        </div>

        {/* Time grid */}
        <div className="grid grid-cols-[80px_repeat(7,1fr)]">
          {/* Time labels */}
          <div className="border-r" style={{ height: totalHeight }}>
            {weekTimeSlots.map((slot, idx) => (
              <div
                key={idx}
                className="flex items-start justify-end pr-2 text-[10px] text-muted-foreground border-b"
                style={{ height: rowHeight }}
              >
                {slot}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {weekDays.map((d, dayIdx) => {
            const dayMeetings = getMeetingsForDay(d);
            return (
              <div key={dayIdx} className="border-r last:border-r-0 relative" style={{ height: totalHeight }}>
                {/* Background grid lines */}
                {weekTimeSlots.map((_, slotIdx) => (
                  <div
                    key={slotIdx}
                    className="border-b"
                    style={{ height: rowHeight }}
                  />
                ))}

                {/* Meeting blocks */}
                {dayMeetings.map((m) => {
                  const startMin = timeToMinutes(m.scheduled_start);
                  const endMin = timeToMinutes(m.scheduled_end);
                  const gridStartMin = slotStartHour * 60;
                  const gridEndMin = slotEndHour * 60;

                  const clampedStart = Math.max(startMin, gridStartMin);
                  const clampedEnd = Math.min(endMin, gridEndMin);
                  if (clampedStart >= clampedEnd) return null;

                  const topPx = ((clampedStart - gridStartMin) / totalMinutes) * totalHeight;
                  const heightPx = Math.max(
                    ((clampedEnd - clampedStart) / totalMinutes) * totalHeight,
                    20,
                  );

                  return (
                    <div
                      key={m.id}
                      className={[
                        'absolute left-0.5 right-0.5 rounded px-1 py-0.5 border-l-2 overflow-hidden cursor-pointer hover:opacity-90 transition-opacity',
                        getMeetingBlockColor(m),
                      ].join(' ')}
                      style={{ top: topPx, height: heightPx }}
                      title={`${m.title} (${formatTime(m.scheduled_start)} - ${formatTime(m.scheduled_end)})`}
                    >
                      <div className="text-[10px] font-medium truncate leading-tight">
                        <MeetingTitle meeting={m} truncate />
                      </div>
                      <div className="text-[9px] text-muted-foreground truncate">
                        {formatTime(m.scheduled_start)} - {formatTime(m.scheduled_end)}
                      </div>
                      {heightPx > 35 && (m.relationship_name || m.client_name) && (
                        <div className="text-[9px] text-muted-foreground truncate">
                          {m.relationship_name || m.client_name}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  /* ========== DAY VIEW ========== */

  function renderDayView() {
    const dayMeetings = getMeetingsForDay(currentDate);
    const slotStartHour = 7;
    const slotEndHour = 19;
    const totalMinutes = (slotEndHour - slotStartHour) * 60;
    const rowHeight = 60;
    const totalHeight = (totalMinutes / 30) * rowHeight;

    return (
      <div className="border rounded-lg overflow-auto">
        <div className="grid grid-cols-[80px_1fr]">
          {/* Time labels */}
          <div className="border-r" style={{ height: totalHeight }}>
            {dayTimeSlots.map((slot, idx) => (
              <div
                key={idx}
                className="flex items-start justify-end pr-2 text-xs text-muted-foreground border-b"
                style={{ height: rowHeight }}
              >
                {slot}
              </div>
            ))}
          </div>

          {/* Meeting area */}
          <div className="relative" style={{ height: totalHeight }}>
            {/* Grid lines */}
            {dayTimeSlots.map((_, slotIdx) => (
              <div
                key={slotIdx}
                className="border-b"
                style={{ height: rowHeight }}
              />
            ))}

            {/* Meeting cards */}
            {dayMeetings.map((m) => {
              const startMin = timeToMinutes(m.scheduled_start);
              const endMin = timeToMinutes(m.scheduled_end);
              const gridStartMin = slotStartHour * 60;
              const gridEndMin = slotEndHour * 60;

              const clampedStart = Math.max(startMin, gridStartMin);
              const clampedEnd = Math.min(endMin, gridEndMin);
              if (clampedStart >= clampedEnd) return null;

              const topPx = ((clampedStart - gridStartMin) / totalMinutes) * totalHeight;
              const heightPx = Math.max(
                ((clampedEnd - clampedStart) / totalMinutes) * totalHeight,
                60,
              );

              const ModeIcon = meetingModeIcon[m.mode ?? ''] || Users;

              return (
                <div
                  key={m.id}
                  className={[
                    'absolute left-2 right-2 rounded-lg p-3 border-l-4 overflow-hidden shadow-sm',
                    getMeetingBlockColor(m),
                  ].join(' ')}
                  style={{ top: topPx, height: heightPx }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="font-medium text-sm">
                        <MeetingTitle meeting={m} />
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {m.is_all_day
                            ? 'All Day'
                            : `${formatTime(m.scheduled_start)} - ${formatTime(m.scheduled_end)}`}
                        </span>
                        {m.meeting_type && (
                          <span className="flex items-center gap-1">
                            <ModeIcon className="h-3 w-3" />
                            {m.meeting_type.replace(/_/g, ' ')}
                          </span>
                        )}
                        {m.mode && (
                          <span>{m.mode.replace(/_/g, ' ')}</span>
                        )}
                      </div>
                      {(m.location || m.virtual_link) && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {m.location && (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" /> {m.location}
                            </span>
                          )}
                          {m.virtual_link && (
                            <a
                              href={m.virtual_link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-blue-600 hover:underline"
                            >
                              <LinkIcon className="h-3 w-3" /> Join
                            </a>
                          )}
                        </div>
                      )}
                      {(m.relationship_name || m.client_name) && (
                        <div className="text-xs text-muted-foreground">
                          {m.relationship_name || m.client_name}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <Badge className={meetingStatusColors[m.meeting_status] || ''} variant="secondary">
                        {m.meeting_status.replace(/_/g, ' ')}
                      </Badge>
                      <MeetingActions meeting={m} />
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Empty state */}
            {dayMeetings.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center">
                <p className="text-sm text-muted-foreground">No meetings scheduled for this day.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ========== LIST VIEW ========== */

  function renderListView() {
    return (
      <Tabs value={listTab} onValueChange={(v) => { setListTab(v); setListPage(1); }}>
        <TabsList>
          <TabsTrigger value="upcoming">
            Upcoming Meetings {upcomingMeetings.length > 0 ? `(${upcomingMeetings.length})` : ''}
          </TabsTrigger>
          <TabsTrigger value="past">
            Past Meetings {pastMeetings.length > 0 ? `(${pastMeetings.length})` : ''}
          </TabsTrigger>
          <TabsTrigger value="call-reports">
            Call Reports {callReports.length > 0 ? `(${callReports.length})` : ''}
          </TabsTrigger>
          <TabsTrigger value="action-items">
            Action Items {actionItems.length > 0 ? `(${actionItems.length})` : ''}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming" className="mt-4">
          {renderMeetingsTable(upcomingMeetings, meetingsPending)}
        </TabsContent>

        <TabsContent value="past" className="mt-4">
          {renderMeetingsTable(pastMeetings, meetingsPending)}
        </TabsContent>

        <TabsContent value="call-reports" className="mt-4">
          {renderCallReportsTable()}
        </TabsContent>

        <TabsContent value="action-items" className="mt-4">
          {renderActionItemsTable()}
        </TabsContent>
      </Tabs>
    );
  }

  /* ---------- List sub-renderers ---------- */

  function renderMeetingsTable(meetings: MeetingRecord[], loading: boolean) {
    if (loading) {
      return (
        <div className="rounded-md border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Date/Time</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <SkeletonRows cols={7} />
            </TableBody>
          </Table>
        </div>
      );
    }

    if (meetings.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
          <Calendar className="h-10 w-10 text-muted-foreground/50" />
          <p>No meetings found</p>
        </div>
      );
    }

    const LIST_PAGE_SIZE = 20;
    const totalPages = Math.max(1, Math.ceil(meetings.length / LIST_PAGE_SIZE));
    const safePage = Math.min(listPage, totalPages);
    const paginatedMeetings = meetings.slice(
      (safePage - 1) * LIST_PAGE_SIZE,
      safePage * LIST_PAGE_SIZE,
    );

    return (
      <div className="space-y-3">
        <div className="rounded-md border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Date/Time</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedMeetings.map((meeting) => {
                const ModeIcon = meetingModeIcon[meeting.mode ?? meeting.meeting_type] || Users;
                return (
                  <TableRow key={meeting.id}>
                    <TableCell className="font-medium">
                      <MeetingTitle meeting={meeting} />
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1 text-sm">
                        <ModeIcon className="h-3 w-3 text-muted-foreground" />
                        {meeting.meeting_type.replace(/_/g, ' ')}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">
                      {meeting.is_all_day ? (
                        <div>All Day - {new Date(meeting.scheduled_start).toLocaleDateString()}</div>
                      ) : (
                        <>
                          <div>{formatDateTime(meeting.scheduled_start)}</div>
                          <div className="text-muted-foreground text-xs">
                            to {formatDateTime(meeting.scheduled_end)}
                          </div>
                        </>
                      )}
                    </TableCell>
                    <TableCell>
                      {meeting.location ?? (
                        meeting.virtual_link ? (
                          <a
                            href={meeting.virtual_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline text-sm"
                          >
                            Virtual Link
                          </a>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )
                      )}
                    </TableCell>
                    <TableCell>
                      {meeting.relationship_name || meeting.client_name || (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className={meetingStatusColors[meeting.meeting_status] || ''} variant="secondary">
                        {meeting.meeting_status.replace(/_/g, ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <MeetingActions meeting={meeting} />
                        <Button size="sm" variant="ghost">
                          <Eye className="h-3 w-3 mr-1" /> View
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-2">
            <span className="text-sm text-muted-foreground">
              Page {safePage} of {totalPages} ({meetings.length} items)
            </span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={safePage <= 1}
                onClick={() => setListPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-4 w-4 mr-1" /> Previous
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={safePage >= totalPages}
                onClick={() => setListPage((p) => Math.min(totalPages, p + 1))}
              >
                Next <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderCallReportsTable() {
    if (callReportsPending) {
      return (
        <div className="rounded-md border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>RM</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <SkeletonRows cols={5} />
            </TableBody>
          </Table>
        </div>
      );
    }

    if (callReports.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
          <FileText className="h-10 w-10 text-muted-foreground/50" />
          <p>No call reports found</p>
        </div>
      );
    }

    return (
      <div className="rounded-md border overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>RM</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {callReports.map((report) => (
              <TableRow key={report.id}>
                <TableCell className="text-sm">
                  {new Date(report.report_date).toLocaleDateString()}
                </TableCell>
                <TableCell>{report.client_name ?? <span className="text-muted-foreground">-</span>}</TableCell>
                <TableCell>{report.rm_name ?? <span className="text-muted-foreground">-</span>}</TableCell>
                <TableCell>
                  <Badge className={callReportStatusColors[report.report_status] || ''} variant="secondary">
                    {report.report_status.replace(/_/g, ' ')}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {new Date(report.created_at).toLocaleDateString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  function renderActionItemsTable() {
    if (actionItemsPending) {
      return (
        <div className="rounded-md border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Assigned To</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <SkeletonRows cols={5} />
            </TableBody>
          </Table>
        </div>
      );
    }

    if (actionItems.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
          <ClipboardList className="h-10 w-10 text-muted-foreground/50" />
          <p>No action items found</p>
        </div>
      );
    }

    return (
      <div className="rounded-md border overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Description</TableHead>
              <TableHead>Due Date</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Assigned To</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {actionItems.map((item) => {
              const isOverdue =
                (item.action_status === 'OPEN' || item.action_status === 'IN_PROGRESS') &&
                new Date(item.due_date) < now;
              return (
                <TableRow key={item.id} className={isOverdue ? 'bg-red-50 dark:bg-red-950/20' : ''}>
                  <TableCell className="font-medium">{item.description}</TableCell>
                  <TableCell>
                    <span className={isOverdue ? 'text-red-600 font-medium' : 'text-sm'}>
                      {new Date(item.due_date).toLocaleDateString()}
                      {isOverdue && (
                        <Badge className="ml-2 bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" variant="secondary">
                          Overdue
                        </Badge>
                      )}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge className={actionPriorityColors[item.priority] || ''} variant="secondary">
                      {item.priority}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className={actionStatusColors[item.action_status] || ''} variant="secondary">
                      {item.action_status.replace(/_/g, ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell>{item.assigned_to_user_id ?? <span className="text-muted-foreground">Unassigned</span>}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    );
  }

  /* ========== SCHEDULE MEETING DIALOG ========== */

  function renderCreateDialog() {
    const isFormValid = newMeeting.title.trim() &&
      newMeeting.meeting_type &&
      newMeeting.purpose &&
      (newMeeting.is_all_day
        ? newMeeting.scheduled_start
        : (newMeeting.scheduled_start && newMeeting.scheduled_end &&
           newMeeting.scheduled_end > newMeeting.scheduled_start));

    return (
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogTrigger asChild>
          <Button size="sm">
            <Plus className="mr-2 h-4 w-4" /> New Meeting
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Schedule New Meeting</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Title — BR-014: auto-suggest from prior meeting subjects */}
            <div>
              <label className="text-sm font-medium">Title *</label>
              <Input
                list="meeting-title-suggestions"
                placeholder="e.g. Q2 Portfolio Review"
                value={newMeeting.title}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setNewMeeting({ ...newMeeting, title: e.target.value })
                }
              />
              <datalist id="meeting-title-suggestions">
                {meetingTitleSuggestions.map((t, i) => (
                  <option key={i} value={t} />
                ))}
              </datalist>
            </div>

            {/* Meeting Type + Purpose */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Meeting Type *</label>
                <Select
                  value={newMeeting.meeting_type}
                  onValueChange={(v: string) => setNewMeeting({ ...newMeeting, meeting_type: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {MEETING_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Purpose *</label>
                <Select
                  value={newMeeting.purpose}
                  onValueChange={(v: string) => setNewMeeting({ ...newMeeting, purpose: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select purpose" />
                  </SelectTrigger>
                  <SelectContent>
                    {MEETING_PURPOSES.map((p) => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Meeting Reason + Mode */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Meeting Reason</label>
                <Select
                  value={newMeeting.meeting_reason}
                  onValueChange={(v: string) => setNewMeeting({ ...newMeeting, meeting_reason: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select reason" />
                  </SelectTrigger>
                  <SelectContent>
                    {MEETING_REASONS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Mode</label>
                <Select
                  value={newMeeting.mode}
                  onValueChange={(v: string) => setNewMeeting({ ...newMeeting, mode: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select mode" />
                  </SelectTrigger>
                  <SelectContent>
                    {MEETING_MODES.map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Other reason text (conditional) */}
            {newMeeting.meeting_reason === 'OTHER' && (
              <div>
                <label className="text-sm font-medium">Reason (Other) *</label>
                <Input
                  placeholder="Please specify the reason"
                  value={newMeeting.meeting_reason_other}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setNewMeeting({ ...newMeeting, meeting_reason_other: e.target.value })
                  }
                />
              </div>
            )}

            {/* All-day checkbox */}
            <div className="flex items-center gap-2">
              <Checkbox
                id="is_all_day"
                checked={newMeeting.is_all_day}
                onCheckedChange={(checked: boolean) =>
                  setNewMeeting({ ...newMeeting, is_all_day: !!checked })
                }
              />
              <label htmlFor="is_all_day" className="text-sm font-medium cursor-pointer">
                All-day event
              </label>
            </div>

            {/* Date/Time */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">
                  {newMeeting.is_all_day ? 'Start Date *' : 'Start Date/Time *'}
                </label>
                <Input
                  type={newMeeting.is_all_day ? 'date' : 'datetime-local'}
                  value={newMeeting.scheduled_start}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setNewMeeting({ ...newMeeting, scheduled_start: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="text-sm font-medium">
                  {newMeeting.is_all_day ? 'End Date' : 'End Date/Time *'}
                </label>
                <Input
                  type={newMeeting.is_all_day ? 'date' : 'datetime-local'}
                  value={newMeeting.scheduled_end}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    const newEnd = e.target.value;
                    setNewMeeting({ ...newMeeting, scheduled_end: newEnd });
                    // BR-015: warn (non-blocking) if times overlap an existing meeting
                    if (!newMeeting.is_all_day) warnIfOverlapping(newMeeting.scheduled_start, newEnd);
                  }}
                />
              </div>
            </div>

            {/* Location + Virtual Link */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Location</label>
                <Input
                  placeholder="e.g. Conference Room A"
                  value={newMeeting.location}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setNewMeeting({ ...newMeeting, location: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="text-sm font-medium">Virtual Link</label>
                <Input
                  placeholder="e.g. https://zoom.us/..."
                  value={newMeeting.virtual_link}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setNewMeeting({ ...newMeeting, virtual_link: e.target.value })
                  }
                />
              </div>
            </div>

            {/* Agenda */}
            <div>
              <label className="text-sm font-medium">Agenda</label>
              <Input
                placeholder="Meeting agenda or key discussion points"
                value={newMeeting.agenda}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setNewMeeting({ ...newMeeting, agenda: e.target.value })
                }
              />
            </div>

            {/* Remarks */}
            <div>
              <label className="text-sm font-medium">Remarks</label>
              <Textarea
                placeholder="Additional notes or remarks"
                value={newMeeting.remarks}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  setNewMeeting({ ...newMeeting, remarks: e.target.value })
                }
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              onClick={() => createMutation.mutate(newMeeting)}
              disabled={!isFormValid || createMutation.isPending}
            >
              {createMutation.isPending ? 'Scheduling...' : 'Schedule Meeting'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  /* ========== VIEW SWITCHER TOOLBAR ========== */

  const viewButtons: { view: CalendarView; label: string; icon: typeof LayoutGrid }[] = [
    { view: 'month', label: 'Month', icon: LayoutGrid },
    { view: 'week', label: 'Week', icon: Columns },
    { view: 'day', label: 'Day', icon: CalendarDays },
    { view: 'list', label: 'List', icon: LayoutList },
  ];

  /* ========== MAIN RENDER ========== */

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Meetings & Call Reports</h1>
          <p className="text-muted-foreground">
            Schedule meetings, track call reports, and manage action items
          </p>
        </div>
        {renderCreateDialog()}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {meetingsPending
          ? Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                  <div className="h-4 w-4 animate-pulse rounded bg-muted" />
                </CardHeader>
                <CardContent>
                  <div className="h-8 w-16 animate-pulse rounded bg-muted" />
                </CardContent>
              </Card>
            ))
          : kpiCards.map((card) => (
              <Card key={card.label}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">{card.label}</CardTitle>
                  <card.icon className={`h-4 w-4 ${card.color}`} />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{card.value}</div>
                </CardContent>
              </Card>
            ))}
      </div>

      {/* View Switcher Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-muted/30 border rounded-lg p-3">
        {/* View toggle buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 rounded-md border bg-background p-1">
            {viewButtons.map(({ view, label, icon: Icon }) => (
              <Button
                key={view}
                size="sm"
                variant={calendarView === view ? 'default' : 'ghost'}
                className="h-8 px-3 text-xs"
                onClick={() => {
                  setCalendarView(view);
                  setSelectedDay(null);
                }}
              >
                <Icon className="h-3.5 w-3.5 mr-1.5" />
                {label}
              </Button>
            ))}
          </div>
          {/* BR-011: show/hide cancelled meetings in calendar views */}
          <Button
            size="sm"
            variant={showCancelled ? 'secondary' : 'outline'}
            className="h-8 px-3 text-xs"
            onClick={() => setShowCancelled((v) => !v)}
            title={showCancelled ? 'Hide cancelled meetings' : 'Show cancelled meetings'}
          >
            {showCancelled
              ? <Eye className="h-3.5 w-3.5 mr-1.5" />
              : <EyeOff className="h-3.5 w-3.5 mr-1.5" />}
            Cancelled
          </Button>
        </div>

        {/* Date label */}
        <div className="text-sm font-semibold text-center flex-1">
          {dateLabel}
        </div>

        {/* Calendar navigation */}
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" className="h-8" onClick={navigatePrev}>
            <ChevronLeft className="h-4 w-4" />
            Prev
          </Button>
          <Button size="sm" variant="outline" className="h-8" onClick={navigateToday}>
            Today
          </Button>
          <Button size="sm" variant="outline" className="h-8" onClick={navigateNext}>
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Calendar loading state */}
      {calendarPending && calendarView !== 'list' && (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="text-sm text-muted-foreground">Loading calendar...</p>
          </div>
        </div>
      )}

      {/* Calendar Views */}
      {!calendarPending && calendarView === 'month' && renderMonthView()}
      {!calendarPending && calendarView === 'week' && renderWeekView()}
      {!calendarPending && calendarView === 'day' && renderDayView()}
      {calendarView === 'list' && renderListView()}

      {/* Meeting Prep Dialog */}
      <Dialog open={!!prepMeeting} onOpenChange={(open) => { if (!open) { setPrepMeeting(null); setPrepContent(null); setPrepError(null); } }}>
        <DialogContent className="max-w-xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-purple-600" />
              Meeting Prep — {prepMeeting?.title}
            </DialogTitle>
          </DialogHeader>

          {prepLoading && (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Generating brief…</span>
            </div>
          )}

          {prepError && (
            <div className="rounded-md border border-orange-200 bg-orange-50 p-4 text-sm text-orange-800">
              {prepError}
            </div>
          )}

          {prepContent && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold mb-1">Brief</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{prepContent.brief}</p>
              </div>

              {prepContent.talking_points.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-1">Talking Points</h3>
                  <ul className="list-disc pl-4 space-y-1">
                    {prepContent.talking_points.map((pt, i) => (
                      <li key={i} className="text-sm text-muted-foreground">{pt}</li>
                    ))}
                  </ul>
                </div>
              )}

              {prepContent.compliance_notes.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-1 flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                    Compliance Notes
                  </h3>
                  <ul className="list-disc pl-4 space-y-1">
                    {prepContent.compliance_notes.map((note, i) => (
                      <li key={i} className="text-sm text-amber-700">{note}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setPrepMeeting(null); setPrepContent(null); setPrepError(null); }}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
