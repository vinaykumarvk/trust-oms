/**
 * Client Detail Page — Full client view with tabbed sub-entities
 *
 * Route: /master-data/clients/:clientId
 *
 * Features:
 *   - Header card with client info summary
 *   - Tabs for sub-entities:
 *     Profile, KYC Cases, Beneficial Owners, FATCA/CRS, Portfolios
 *   - Each tab has its own data display
 */

import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@ui/lib/queryClient';
import { useOpsCrud } from '@/hooks/useOpsCrud';
import { EntityAuditHistory } from '@/components/crud';
import { Skeleton } from '@ui/components/ui/skeleton';
import { Button } from '@ui/components/ui/button';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@ui/components/ui/tabs';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@ui/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ui/components/ui/table';
import { Badge } from '@ui/components/ui/badge';
import { ArrowLeft, Users, AlertTriangle } from 'lucide-react';
import { EntityFeaturePanel } from '@/components/features/EntityFeaturePanel';

// ---------------------------------------------------------------------------
// Sub-entity list component
// ---------------------------------------------------------------------------

function SubEntityTable({
  columns,
  data,
  isLoading,
  emptyMessage,
}: {
  columns: { key: string; label: string }[];
  data: Record<string, unknown>[];
  isLoading: boolean;
  emptyMessage: string;
}) {
  if (isLoading) return <Skeleton className="h-32 w-full" />;

  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <div className="overflow-x-auto">
    <Table>
      <TableHeader>
        <TableRow>
          {columns.map((col) => (
            <TableHead key={col.key}>{col.label}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((row, idx) => (
          <TableRow key={idx}>
            {columns.map((col) => (
              <TableCell key={col.key}>
                {formatCellValue(row[col.key])}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
    </div>
  );
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function ClientDetailPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();

  // Fetch client record
  const clientQuery = useQuery({
    queryKey: ['clients', 'detail', clientId],
    queryFn: () => apiRequest('GET', `/api/v1/clients/${clientId}`),
    enabled: !!clientId,
  });

  // Sub-entity queries
  const profilesCrud = useOpsCrud({
    entityKey: 'client-profiles',
    apiPath: `/api/v1/clients/${clientId}/profiles`,
    enabled: !!clientId,
  });

  const kycCrud = useOpsCrud({
    entityKey: 'kyc-cases',
    apiPath: `/api/v1/clients/${clientId}/kyc-cases`,
    enabled: !!clientId,
  });

  const uboCrud = useOpsCrud({
    entityKey: 'beneficial-owners',
    apiPath: `/api/v1/clients/${clientId}/beneficial-owners`,
    enabled: !!clientId,
  });

  const fatcaCrud = useOpsCrud({
    entityKey: 'fatca-crs',
    apiPath: `/api/v1/clients/${clientId}/fatca-crs`,
    enabled: !!clientId,
  });

  const portfolioCrud = useOpsCrud({
    entityKey: 'client-portfolios-view',
    apiPath: `/api/v1/portfolios`,
    search: clientId ?? '',
    enabled: !!clientId,
  });

  // Loading
  if (clientQuery.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // Error
  if (clientQuery.error || !clientQuery.data) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate('/master-data/clients')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Clients
        </Button>
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          <p className="text-destructive">
            Client not found or failed to load.
          </p>
        </div>
      </div>
    );
  }

  const client = clientQuery.data as Record<string, unknown>;

  return (
    <div className="space-y-6">
      {/* Back button and header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/master-data/clients')}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back
        </Button>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <Users className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {String(client.legal_name ?? clientId)}
          </h1>
          <p className="text-sm text-muted-foreground">Client ID: {clientId}</p>
        </div>
      </div>

      {/* Summary Card */}
      <Card>
        <CardHeader>
          <CardTitle>Client Summary</CardTitle>
          <CardDescription>Core client information</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">Client Type</p>
            <p className="text-sm font-medium">{String(client.type ?? '-')}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Risk Profile</p>
            <Badge>{String(client.risk_profile ?? '-')}</Badge>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Status</p>
            <Badge variant={client.client_status === 'ACTIVE' ? 'default' : 'secondary'}>
              {String(client.client_status ?? '-')}
            </Badge>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Date of Birth</p>
            <p className="text-sm font-medium">{String(client.birth_date ?? '-')}</p>
          </div>
        </CardContent>
      </Card>

      <EntityFeaturePanel
        entityType="client"
        entityId={clientId}
        title="Client Feature Signals"
        description="Computed wealth, risk, service, and engagement features"
        featureIds={[
          'client.aum_php',
          'client.risk_score',
          'client.kyc_days_to_expiry',
          'client.open_service_requests',
          'client.last_contact_age_days',
          'client.next_best_action_score',
        ]}
      />

      {/* Tabbed Sub-Entity Views */}
      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="kyc">KYC Cases</TabsTrigger>
          <TabsTrigger value="ubo">Beneficial Owners</TabsTrigger>
          <TabsTrigger value="fatca">FATCA/CRS</TabsTrigger>
          <TabsTrigger value="portfolios">Portfolios</TabsTrigger>
          <TabsTrigger value="audit">Audit History</TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Suitability Profile</CardTitle>
            </CardHeader>
            <CardContent>
              <SubEntityTable
                columns={[
                  { key: 'risk_tolerance', label: 'Risk Tolerance' },
                  { key: 'investment_horizon', label: 'Investment Horizon' },
                  { key: 'knowledge_level', label: 'Knowledge Level' },
                  { key: 'source_of_wealth', label: 'Source of Wealth' },
                  { key: 'income', label: 'Income' },
                  { key: 'net_worth', label: 'Net Worth' },
                ]}
                data={(profilesCrud.listQuery.data?.data ?? []) as Record<string, unknown>[]}
                isLoading={profilesCrud.listQuery.isLoading}
                emptyMessage="No suitability profile found."
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* KYC Tab */}
        <TabsContent value="kyc" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>KYC Cases</CardTitle>
            </CardHeader>
            <CardContent>
              <SubEntityTable
                columns={[
                  { key: 'kyc_status', label: 'Status' },
                  { key: 'risk_rating', label: 'Risk Rating' },
                  { key: 'id_type', label: 'ID Type' },
                  { key: 'id_number', label: 'ID Number' },
                  { key: 'expiry_date', label: 'Expiry Date' },
                  { key: 'next_review_date', label: 'Next Review' },
                ]}
                data={(kycCrud.listQuery.data?.data ?? []) as Record<string, unknown>[]}
                isLoading={kycCrud.listQuery.isLoading}
                emptyMessage="No KYC cases found."
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Beneficial Owners Tab */}
        <TabsContent value="ubo" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Beneficial Owners</CardTitle>
            </CardHeader>
            <CardContent>
              <SubEntityTable
                columns={[
                  { key: 'ubo_name', label: 'Name' },
                  { key: 'ubo_tin', label: 'TIN' },
                  { key: 'ownership_pct', label: 'Ownership %' },
                  { key: 'verified', label: 'Verified' },
                ]}
                data={(uboCrud.listQuery.data?.data ?? []) as Record<string, unknown>[]}
                isLoading={uboCrud.listQuery.isLoading}
                emptyMessage="No beneficial owners recorded."
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* FATCA/CRS Tab */}
        <TabsContent value="fatca" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>FATCA/CRS</CardTitle>
            </CardHeader>
            <CardContent>
              <SubEntityTable
                columns={[
                  { key: 'us_person', label: 'US Person' },
                  { key: 'reporting_jurisdictions', label: 'Reporting Jurisdictions' },
                  { key: 'tin_foreign', label: 'Foreign TIN' },
                ]}
                data={(fatcaCrud.listQuery.data?.data ?? []) as Record<string, unknown>[]}
                isLoading={fatcaCrud.listQuery.isLoading}
                emptyMessage="No FATCA/CRS records found."
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Portfolios Tab */}
        <TabsContent value="portfolios" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Portfolios</CardTitle>
            </CardHeader>
            <CardContent>
              <SubEntityTable
                columns={[
                  { key: 'portfolio_id', label: 'Portfolio ID' },
                  { key: 'type', label: 'Type' },
                  { key: 'base_currency', label: 'Currency' },
                  { key: 'aum', label: 'AUM' },
                  { key: 'inception_date', label: 'Inception Date' },
                  { key: 'portfolio_status', label: 'Status' },
                ]}
                data={(portfolioCrud.listQuery.data?.data ?? []) as Record<string, unknown>[]}
                isLoading={portfolioCrud.listQuery.isLoading}
                emptyMessage="No portfolios found for this client."
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Audit History Tab */}
        <TabsContent value="audit" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Audit History</CardTitle>
            </CardHeader>
            <CardContent>
              <EntityAuditHistory
                entityType="clients"
                entityId={clientId ?? ''}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
