/**
 * KYC Dashboard — Phase 1A
 *
 * Shows KYC health across the trust bank:
 * - Summary cards: Total Clients, Verified %, Pending, Expiring in 30 days, Expired
 * - Tabs: Expiring Soon, Pending Verification, All KYC Cases
 * - Each tab has a searchable/sortable table with action buttons
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@ui/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle } from '@ui/components/ui/card';
import { Badge } from '@ui/components/ui/badge';
import { Button } from '@ui/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@ui/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ui/components/ui/table';
import { Input } from '@ui/components/ui/input';
import { Skeleton } from '@ui/components/ui/skeleton';
import {
  UserCheck,
  Clock,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Search,
  RefreshCcw,
  ShieldCheck,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface KycSummary {
  total: number;
  verified: number;
  pending: number;
  expired: number;
  rejected: number;
  expiringIn30: number;
}

interface KycCase {
  id: number;
  client_id: string;
  risk_rating: string | null;
  kyc_status: string | null;
  id_type: string | null;
  id_number: string | null;
  expiry_date: string | null;
  next_review_date: string | null;
  refresh_cadence_years: number | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusBadge(status: string | null) {
  switch (status) {
    case 'VERIFIED':
      return <Badge className="bg-green-100 text-green-800">Verified</Badge>;
    case 'PENDING':
      return <Badge className="bg-yellow-100 text-yellow-800">Pending</Badge>;
    case 'EXPIRED':
      return <Badge className="bg-red-100 text-red-800">Expired</Badge>;
    case 'REJECTED':
      return <Badge className="bg-gray-100 text-gray-800">Rejected</Badge>;
    default:
      return <Badge variant="outline">{status ?? 'Unknown'}</Badge>;
  }
}

function riskBadge(risk: string | null) {
  switch (risk?.toUpperCase()) {
    case 'HIGH':
      return <Badge className="bg-red-100 text-red-800">High</Badge>;
    case 'MEDIUM':
      return <Badge className="bg-yellow-100 text-yellow-800">Medium</Badge>;
    case 'LOW':
      return <Badge className="bg-green-100 text-green-800">Low</Badge>;
    default:
      return <Badge variant="outline">{risk ?? '-'}</Badge>;
  }
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function KycDashboard() {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('expiring');
  const queryClient = useQueryClient();

  // Fetch summary
  const summaryQuery = useQuery<KycSummary>({
    queryKey: ['kyc', 'summary'],
    queryFn: () => apiRequest('GET', '/api/v1/kyc/summary'),
    refetchInterval: 60000, // refresh every 60s
  });

  // Fetch expiring cases
  const expiringQuery = useQuery<{ data: KycCase[]; total: number }>({
    queryKey: ['kyc', 'expiring'],
    queryFn: () => apiRequest('GET', '/api/v1/kyc/expiring?days=30'),
  });

  // Bulk renewal mutation
  const bulkRenewalMutation = useMutation({
    mutationFn: (clientIds: string[]) =>
      apiRequest('POST', '/api/v1/kyc/bulk-renewal', { clientIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kyc'] });
    },
  });

  const summary = summaryQuery.data;
  const verifiedPct =
    summary && summary.total > 0
      ? Math.round((summary.verified / summary.total) * 100)
      : 0;

  const expiringCases = expiringQuery.data?.data ?? [];
  const filteredCases = expiringCases.filter(
    (c) =>
      !searchTerm ||
      c.client_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.risk_rating?.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------

  if (summaryQuery.isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <ShieldCheck className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            KYC Dashboard
          </h1>
          <p className="text-sm text-muted-foreground">
            Monitor client KYC compliance and expiry
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Clients</CardTitle>
            <UserCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.total ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Verified %</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{verifiedPct}%</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Clock className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {summary?.pending ?? 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Expiring (30d)</CardTitle>
            <AlertTriangle className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {summary?.expiringIn30 ?? 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Expired</CardTitle>
            <XCircle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {summary?.expired ?? 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs: Expiring Soon, Pending */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="expiring">Expiring Soon</TabsTrigger>
          <TabsTrigger value="pending">Pending Verification</TabsTrigger>
        </TabsList>

        <TabsContent value="expiring" className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by client ID or risk..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const ids = filteredCases.map((c) => c.client_id);
                if (ids.length > 0) bulkRenewalMutation.mutate(ids);
              }}
              disabled={bulkRenewalMutation.isPending || filteredCases.length === 0}
            >
              <RefreshCcw className="h-4 w-4 mr-2" />
              Bulk Renew ({filteredCases.length})
            </Button>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client ID</TableHead>
                  <TableHead>Risk Rating</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>ID Type</TableHead>
                  <TableHead>Next Review</TableHead>
                  <TableHead>Cadence (yrs)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCases.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-center text-muted-foreground py-8"
                    >
                      No expiring KYC cases found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredCases.map((kycCase) => (
                    <TableRow key={kycCase.id}>
                      <TableCell className="font-medium">
                        {kycCase.client_id}
                      </TableCell>
                      <TableCell>{riskBadge(kycCase.risk_rating)}</TableCell>
                      <TableCell>{statusBadge(kycCase.kyc_status)}</TableCell>
                      <TableCell>{kycCase.id_type ?? '-'}</TableCell>
                      <TableCell>{kycCase.next_review_date ?? '-'}</TableCell>
                      <TableCell>{kycCase.refresh_cadence_years ?? '-'}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="pending" className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Pending verification queue — {summary?.pending ?? 0} case(s) awaiting
            review.
          </p>
          {/* Pending tab will be fully populated when we wire the full query */}
          <div className="rounded-md border p-8 text-center text-muted-foreground">
            Pending verification queue coming in Phase 1A integration
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
