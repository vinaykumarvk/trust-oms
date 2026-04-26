/**
 * Conversion History (CRM-PAD Phase 6)
 *
 * Tracks all conversions across the CRM pipeline:
 *   - Lead -> Prospect
 *   - Prospect -> Customer
 *
 * Features:
 *   - Table: conversion type, source entity name, target entity name,
 *            campaign, RM, date
 *   - Filters: date range (start/end), conversion type selector
 *   - Funnel visualization: Leads -> Qualified -> Client Accepted
 *     -> Converted to Prospect -> Recommended -> Customer
 *   - Fetches from /api/v1/conversion-history and
 *     /api/v1/conversion-history/funnel
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Card, CardContent, CardHeader, CardTitle,
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
import {
  ArrowRight, Filter, TrendingUp, Users, UserCheck, UserPlus,
  Briefcase, Award, ChevronDown,
} from 'lucide-react';
import { SkeletonRows } from '@/components/ui/skeleton-rows';

/* ---------- API helpers ---------- */

const API = '/api/v1/conversion-history';

function getToken(): string {
  try {
    const stored = localStorage.getItem('trustoms-user');
    if (stored) {
      const parsed = JSON.parse(stored);
      return parsed.token || '';
    }
  } catch {
    // ignore
  }
  return '';
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

function fetcher(url: string) {
  return fetch(url, { headers: authHeaders() }).then((r) => r.json());
}

/* ---------- Types ---------- */

interface ConversionRecord {
  id: number;
  conversion_type: string;
  source_entity_name: string;
  target_entity_name: string;
  campaign_name: string | null;
  rm_name: string | null;
  converted_at: string;
}

interface ConversionListResult {
  data: ConversionRecord[];
  total: number;
}

interface FunnelData {
  leads: number;
  qualified: number;
  client_accepted: number;
  converted_to_prospect: number;
  recommended: number;
  customer: number;
}

/* ---------- Constants ---------- */

const CONVERSION_TYPES = [
  { value: '', label: 'All Types' },
  { value: 'LEAD_TO_PROSPECT', label: 'Lead -> Prospect' },
  { value: 'PROSPECT_TO_CUSTOMER', label: 'Prospect -> Customer' },
] as const;

const conversionBadgeColors: Record<string, string> = {
  LEAD_TO_PROSPECT: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  PROSPECT_TO_CUSTOMER: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
};

/* ---------- Funnel Stage Config ---------- */

const FUNNEL_STAGES: Array<{
  key: keyof FunnelData;
  label: string;
  color: string;
  bgColor: string;
  icon: typeof Users;
}> = [
  { key: 'leads', label: 'Leads', color: 'text-blue-700 dark:text-blue-300', bgColor: 'bg-blue-500', icon: Users },
  { key: 'qualified', label: 'Qualified', color: 'text-cyan-700 dark:text-cyan-300', bgColor: 'bg-cyan-500', icon: UserCheck },
  { key: 'client_accepted', label: 'Client Accepted', color: 'text-indigo-700 dark:text-indigo-300', bgColor: 'bg-indigo-500', icon: UserPlus },
  { key: 'converted_to_prospect', label: 'Converted to Prospect', color: 'text-purple-700 dark:text-purple-300', bgColor: 'bg-purple-500', icon: ArrowRight },
  { key: 'recommended', label: 'Recommended', color: 'text-amber-700 dark:text-amber-300', bgColor: 'bg-amber-500', icon: Award },
  { key: 'customer', label: 'Customer', color: 'text-green-700 dark:text-green-300', bgColor: 'bg-green-600', icon: Briefcase },
];

/* ---------- Component ---------- */

export default function ConversionHistory() {
  // Filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [conversionType, setConversionType] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(true);

  // Build query params
  const queryParams = new URLSearchParams();
  if (startDate) queryParams.set('start_date', startDate);
  if (endDate) queryParams.set('end_date', endDate);
  if (conversionType) queryParams.set('conversion_type', conversionType);
  const queryString = queryParams.toString();

  /* ---- Queries ---- */

  const { data: historyResult, isPending: historyPending } = useQuery<ConversionListResult>({
    queryKey: ['conversion-history', queryString],
    queryFn: () => fetcher(`${API}?${queryString}`),
    refetchInterval: 30_000,
  });

  const { data: funnelData, isPending: funnelPending } = useQuery<FunnelData>({
    queryKey: ['conversion-funnel', queryString],
    queryFn: () => fetcher(`${API}/funnel?${queryString}`),
    refetchInterval: 30_000,
  });

  const conversions: ConversionRecord[] = historyResult?.data ?? [];
  const totalRecords = historyResult?.total ?? 0;

  /* ---- Helpers ---- */

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString();
  }

  function formatDateTime(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function formatConversionType(type: string): string {
    if (type === 'LEAD_TO_PROSPECT') return 'Lead -> Prospect';
    if (type === 'PROSPECT_TO_CUSTOMER') return 'Prospect -> Customer';
    return type.replace(/_/g, ' ');
  }

  function clearFilters() {
    setStartDate('');
    setEndDate('');
    setConversionType('');
  }

  /* ---- Funnel Bar Width ---- */

  function getFunnelBarWidth(funnel: FunnelData, stageKey: keyof FunnelData): number {
    const maxVal = Math.max(
      funnel.leads, funnel.qualified, funnel.client_accepted,
      funnel.converted_to_prospect, funnel.recommended, funnel.customer,
      1,
    );
    return Math.max((funnel[stageKey] / maxVal) * 100, 2);
  }

  function getConversionRate(funnel: FunnelData, stageKey: keyof FunnelData): string {
    if (funnel.leads === 0) return '0%';
    return `${((funnel[stageKey] / funnel.leads) * 100).toFixed(1)}%`;
  }

  /* ---- Render ---- */

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Conversion History</h1>
        <p className="text-muted-foreground">
          Track lead-to-prospect and prospect-to-customer conversions across campaigns
        </p>
      </div>

      {/* Funnel Visualization */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4" /> Conversion Funnel
          </CardTitle>
        </CardHeader>
        <CardContent>
          {funnelPending ? (
            <div className="space-y-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <div className="w-48 h-4 animate-pulse rounded bg-muted" />
                  <div className="flex-1 h-8 animate-pulse rounded bg-muted" />
                </div>
              ))}
            </div>
          ) : funnelData ? (
            <div className="space-y-3">
              {FUNNEL_STAGES.map((stage, idx) => {
                const count = funnelData[stage.key] ?? 0;
                const width = getFunnelBarWidth(funnelData, stage.key);
                const rate = getConversionRate(funnelData, stage.key);
                const StageIcon = stage.icon;
                return (
                  <div key={stage.key}>
                    <div className="flex items-center gap-3 mb-1">
                      <div className="w-52 flex items-center gap-2">
                        <StageIcon className={`h-4 w-4 ${stage.color}`} />
                        <span className={`text-sm font-medium ${stage.color}`}>{stage.label}</span>
                      </div>
                      <div className="flex-1">
                        <div className="relative h-8 rounded-md bg-muted/40 overflow-hidden">
                          <div
                            className={`absolute top-0 left-0 h-full ${stage.bgColor} rounded-md transition-all duration-500 opacity-80`}
                            style={{ width: `${width}%` }}
                          />
                          <div className="absolute inset-0 flex items-center px-3">
                            <span className="text-sm font-bold text-foreground z-10">
                              {count.toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="w-16 text-right">
                        <span className="text-xs text-muted-foreground">{rate}</span>
                      </div>
                    </div>
                    {idx < FUNNEL_STAGES.length - 1 && (
                      <div className="flex items-center ml-[216px] text-muted-foreground">
                        <ChevronDown className="h-3 w-3" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2">
              <TrendingUp className="h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm">No funnel data available</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-2">
          <div
            className="flex items-center justify-between cursor-pointer"
            onClick={() => setFiltersOpen(!filtersOpen)}
          >
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Filter className="h-4 w-4" /> Filters
            </CardTitle>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${filtersOpen ? '' : '-rotate-90'}`} />
          </div>
        </CardHeader>
        {filtersOpen && (
          <CardContent>
            <div className="flex items-end gap-4 flex-wrap">
              <div>
                <label className="text-sm font-medium">Start Date</label>
                <Input
                  type="date"
                  className="w-[160px]"
                  value={startDate}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setStartDate(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium">End Date</label>
                <Input
                  type="date"
                  className="w-[160px]"
                  value={endDate}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEndDate(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Conversion Type</label>
                <Select
                  value={conversionType}
                  onValueChange={(v: string) => setConversionType(v === 'ALL' ? '' : v)}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="All Types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Types</SelectItem>
                    <SelectItem value="LEAD_TO_PROSPECT">Lead -&gt; Prospect</SelectItem>
                    <SelectItem value="PROSPECT_TO_CUSTOMER">Prospect -&gt; Customer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Clear
              </Button>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Conversions Table */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              Conversion Records
              {totalRecords > 0 && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({totalRecords.toLocaleString()} total)
                </span>
              )}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {historyPending ? (
            <div className="rounded-md border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Conversion Type</TableHead>
                    <TableHead>Source Entity</TableHead>
                    <TableHead>Target Entity</TableHead>
                    <TableHead>Campaign</TableHead>
                    <TableHead>RM</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <SkeletonRows cols={6} />
                </TableBody>
              </Table>
            </div>
          ) : conversions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
              <ArrowRight className="h-10 w-10 text-muted-foreground/50" />
              <p>No conversion records found</p>
              <p className="text-sm">Conversions will appear here as leads progress through the pipeline</p>
            </div>
          ) : (
            <div className="rounded-md border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Conversion Type</TableHead>
                    <TableHead>Source Entity</TableHead>
                    <TableHead>Target Entity</TableHead>
                    <TableHead>Campaign</TableHead>
                    <TableHead>RM</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {conversions.map((record: ConversionRecord) => (
                    <TableRow key={record.id}>
                      <TableCell>
                        <Badge
                          className={conversionBadgeColors[record.conversion_type] || ''}
                          variant="secondary"
                        >
                          {formatConversionType(record.conversion_type)}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">
                        {record.source_entity_name}
                      </TableCell>
                      <TableCell className="font-medium">
                        {record.target_entity_name}
                      </TableCell>
                      <TableCell className="text-sm">
                        {record.campaign_name ?? (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {record.rm_name ?? (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDateTime(record.converted_at)}
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
