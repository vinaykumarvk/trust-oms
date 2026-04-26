/**
 * Call Report List (CRM — Call Report Module)
 *
 * Server-paginated data table of call reports with:
 *   - Filterable by status, search term, and date range
 *   - Columns: Report Code, Subject, Meeting Date, Relationship, Status, Days Since Meeting, Actions
 *   - Status badges using callReportStatusColors
 *   - View / Edit actions per row (Edit only for DRAFT/RETURNED)
 *   - "New Call Report" dropdown with "From Meeting" and "Standalone" options
 *   - Prev / Next server-side pagination
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Card, CardContent,
} from '@ui/components/ui/card';
import { Button } from '@ui/components/ui/button';
import { Badge } from '@ui/components/ui/badge';
import { Input } from '@ui/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@ui/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@ui/components/ui/select';
import { toast } from 'sonner';
import {
  Eye, Pencil, Plus, FileText, ChevronLeft, ChevronRight, Search,
} from 'lucide-react';
import { fetcher } from '@/lib/api';
import { callReportStatusColors, daysSinceMeeting } from '@/lib/crm-constants';
import { SkeletonRows } from '@/components/ui/skeleton-rows';

/* ---------- Types ---------- */

interface CallReport {
  id: number;
  report_code: string;
  subject: string;
  meeting_date: string;
  relationship_name: string | null;
  report_status: string;
  created_at: string;
}

interface CallReportListResult {
  data: CallReport[];
  total: number;
  page: number;
  pageSize: number;
}

/* ---------- Constants ---------- */

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'RETURNED', label: 'Returned' },
  { value: 'PENDING_APPROVAL', label: 'Pending Approval' },
] as const;

const PAGE_SIZE = 20;

/* ---------- Helpers ---------- */

/* ---------- Component ---------- */

export default function CallReportList() {
  const navigate = useNavigate();

  // Filter state
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [newReportMenuOpen, setNewReportMenuOpen] = useState(false);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  // Reset page on filter change
  useEffect(() => {
    setPage(1);
  }, [status, startDate, endDate]);

  // Build query URL
  const queryUrl = (() => {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('pageSize', String(PAGE_SIZE));
    if (status) params.set('reportStatus', status);
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    return `/api/v1/call-reports?${params.toString()}`;
  })();

  const { data, isPending } = useQuery<CallReportListResult>({
    queryKey: ['call-reports-list', page, status, debouncedSearch, startDate, endDate],
    queryFn: () => fetcher(queryUrl),
    refetchInterval: 30_000,
  });

  const reports = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleView = useCallback((id: number) => {
    navigate(`/crm/call-reports/${id}`);
  }, [navigate]);

  const handleEdit = useCallback((id: number) => {
    navigate(`/crm/call-reports/${id}/edit`);
  }, [navigate]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Call Reports</h1>
          <p className="text-muted-foreground">
            Browse, filter, and manage call reports
          </p>
        </div>
        <div className="relative">
          <Button size="sm" onClick={() => setNewReportMenuOpen(!newReportMenuOpen)}>
            <Plus className="mr-2 h-4 w-4" /> New Call Report
          </Button>
          {newReportMenuOpen && (
            <>
              {/* Backdrop to close menu */}
              <div
                className="fixed inset-0 z-10"
                onClick={() => setNewReportMenuOpen(false)}
              />
              <div className="absolute right-0 top-full mt-1 z-20 w-48 rounded-md border bg-popover shadow-md">
                <button
                  className="w-full px-4 py-2 text-left text-sm hover:bg-muted transition-colors rounded-t-md"
                  onClick={() => {
                    setNewReportMenuOpen(false);
                    navigate('/crm/call-reports/new');
                    toast.info('Select a meeting to create a scheduled report, or proceed as standalone.');
                  }}
                >
                  From Meeting
                </button>
                <button
                  className="w-full px-4 py-2 text-left text-sm hover:bg-muted transition-colors rounded-b-md"
                  onClick={() => {
                    setNewReportMenuOpen(false);
                    navigate('/crm/call-reports/new');
                  }}
                >
                  Standalone
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end gap-4">
            {/* Status */}
            <div className="min-w-[180px]">
              <label className="text-sm font-medium mb-1 block">Status</label>
              <Select value={status} onValueChange={(v: string) => setStatus(v === 'all' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value || 'all'} value={opt.value || 'all'}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Search */}
            <div className="flex-1 min-w-[220px]">
              <label className="text-sm font-medium mb-1 block">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search subject or summary..."
                  value={search}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            {/* Date Range */}
            <div className="min-w-[150px]">
              <label className="text-sm font-medium mb-1 block">Start Date</label>
              <Input
                type="date"
                value={startDate}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setStartDate(e.target.value)}
              />
            </div>
            <div className="min-w-[150px]">
              <label className="text-sm font-medium mb-1 block">End Date</label>
              <Input
                type="date"
                value={endDate}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEndDate(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Data Table */}
      <div className="rounded-md border overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Report Code</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Meeting Date</TableHead>
              <TableHead>Relationship</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Days Since Meeting</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending ? (
              <SkeletonRows cols={7} />
            ) : reports.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7}>
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                    <FileText className="h-10 w-10 text-muted-foreground/50" />
                    <p>No call reports found</p>
                    <p className="text-xs">Try adjusting your filters or create a new report</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              reports.map((report) => {
                const days = daysSinceMeeting(report.meeting_date);
                const canEdit =
                  report.report_status === 'DRAFT' || report.report_status === 'RETURNED';
                return (
                  <TableRow key={report.id}>
                    <TableCell className="font-mono text-sm">
                      {report.report_code || `CR-${report.id}`}
                    </TableCell>
                    <TableCell className="font-medium max-w-[240px] truncate">
                      {report.subject}
                    </TableCell>
                    <TableCell className="text-sm">
                      {report.meeting_date
                        ? new Date(report.meeting_date).toLocaleDateString()
                        : '-'}
                    </TableCell>
                    <TableCell>
                      {report.relationship_name || (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={callReportStatusColors[report.report_status] || ''}
                      >
                        {report.report_status.replace(/_/g, ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      <span className={days > 5 ? 'text-orange-600 font-medium' : ''}>
                        {days}d
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleView(report.id)}
                          title="View"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {canEdit && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleEdit(report.id)}
                            title="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {!isPending && total > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages} ({total} total reports)
          </p>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="mr-1 h-4 w-4" /> Prev
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
