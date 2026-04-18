/**
 * Clients Page — Enhanced client master with detail sheet
 *
 * Features:
 *   - OpsDataTable for client list
 *   - Client detail view in a Sheet with tabs:
 *     Profile, KYC, Beneficiaries, FATCA/CRS, Portfolios, Audit History
 *   - Each tab uses useOpsCrud for its own sub-entity data
 */

import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOpsCrud } from '@/hooks/useOpsCrud';
import { useEntityConfig } from '@/hooks/use-entity-config';
import {
  OpsDataTable,
  OpsMaintenanceForm,
  OpsDeleteConfirm,
  OpsCSVImport,
} from '@/components/crud';
import { Skeleton } from '@ui/components/ui/skeleton';
import { Button } from '@ui/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@ui/components/ui/sheet';
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
import { Badge } from '@ui/components/ui/badge';
import { Users, AlertTriangle, ExternalLink } from 'lucide-react';

type FormMode = 'create' | 'edit' | 'view';

// ---------------------------------------------------------------------------
// Sub-entity Tab Components
// ---------------------------------------------------------------------------

function ClientProfileTab({ clientId }: { clientId: string }) {
  const { listQuery } = useOpsCrud({
    entityKey: 'client-profiles',
    apiPath: `/api/v1/clients/${clientId}/profiles`,
    enabled: !!clientId,
  });

  const profiles = (listQuery.data?.data ?? []) as Record<string, unknown>[];

  if (listQuery.isLoading) return <Skeleton className="h-32 w-full" />;

  if (profiles.length === 0) {
    return <p className="text-sm text-muted-foreground">No profile data available.</p>;
  }

  const profile = profiles[0];

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <p className="text-xs text-muted-foreground">Risk Tolerance</p>
        <p className="text-sm font-medium">{String(profile.risk_tolerance ?? '-')}</p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Investment Horizon</p>
        <p className="text-sm font-medium">{String(profile.investment_horizon ?? '-')}</p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Knowledge Level</p>
        <p className="text-sm font-medium">{String(profile.knowledge_level ?? '-')}</p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Source of Wealth</p>
        <p className="text-sm font-medium">{String(profile.source_of_wealth ?? '-')}</p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Income</p>
        <p className="text-sm font-medium">{String(profile.income ?? '-')}</p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Net Worth</p>
        <p className="text-sm font-medium">{String(profile.net_worth ?? '-')}</p>
      </div>
    </div>
  );
}

function ClientKycTab({ clientId }: { clientId: string }) {
  const { listQuery } = useOpsCrud({
    entityKey: 'kyc-cases',
    apiPath: `/api/v1/clients/${clientId}/kyc-cases`,
    enabled: !!clientId,
  });

  const cases = (listQuery.data?.data ?? []) as Record<string, unknown>[];

  if (listQuery.isLoading) return <Skeleton className="h-32 w-full" />;

  if (cases.length === 0) {
    return <p className="text-sm text-muted-foreground">No KYC cases found.</p>;
  }

  return (
    <div className="space-y-3">
      {cases.map((kycCase, idx) => (
        <Card key={idx}>
          <CardContent className="grid gap-2 pt-4 md:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">Status</p>
              <Badge variant={kycCase.kyc_status === 'VERIFIED' ? 'default' : 'secondary'}>
                {String(kycCase.kyc_status ?? 'UNKNOWN')}
              </Badge>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Risk Rating</p>
              <p className="text-sm font-medium">{String(kycCase.risk_rating ?? '-')}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">ID Type</p>
              <p className="text-sm font-medium">{String(kycCase.id_type ?? '-')}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Expiry Date</p>
              <p className="text-sm font-medium">{String(kycCase.expiry_date ?? '-')}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Next Review</p>
              <p className="text-sm font-medium">{String(kycCase.next_review_date ?? '-')}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ClientBeneficiariesTab({ clientId }: { clientId: string }) {
  const { listQuery } = useOpsCrud({
    entityKey: 'beneficial-owners',
    apiPath: `/api/v1/clients/${clientId}/beneficial-owners`,
    enabled: !!clientId,
  });

  const owners = (listQuery.data?.data ?? []) as Record<string, unknown>[];

  if (listQuery.isLoading) return <Skeleton className="h-32 w-full" />;

  if (owners.length === 0) {
    return <p className="text-sm text-muted-foreground">No beneficial owners recorded.</p>;
  }

  return (
    <div className="space-y-3">
      {owners.map((owner, idx) => (
        <Card key={idx}>
          <CardContent className="grid gap-2 pt-4 md:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">Name</p>
              <p className="text-sm font-medium">{String(owner.ubo_name ?? '-')}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Ownership %</p>
              <p className="text-sm font-medium">{String(owner.ownership_pct ?? '-')}%</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Verified</p>
              <Badge variant={owner.verified ? 'default' : 'secondary'}>
                {owner.verified ? 'Yes' : 'No'}
              </Badge>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ClientFatcaCrsTab({ clientId }: { clientId: string }) {
  const { listQuery } = useOpsCrud({
    entityKey: 'fatca-crs',
    apiPath: `/api/v1/clients/${clientId}/fatca-crs`,
    enabled: !!clientId,
  });

  const records = (listQuery.data?.data ?? []) as Record<string, unknown>[];

  if (listQuery.isLoading) return <Skeleton className="h-32 w-full" />;

  if (records.length === 0) {
    return <p className="text-sm text-muted-foreground">No FATCA/CRS records found.</p>;
  }

  return (
    <div className="space-y-3">
      {records.map((record, idx) => (
        <Card key={idx}>
          <CardContent className="grid gap-2 pt-4 md:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">US Person</p>
              <Badge variant={record.us_person ? 'destructive' : 'default'}>
                {record.us_person ? 'Yes' : 'No'}
              </Badge>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Foreign TIN</p>
              <p className="text-sm font-medium">{String(record.tin_foreign ?? '-')}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Reporting Jurisdictions</p>
              <p className="text-sm font-medium">
                {Array.isArray(record.reporting_jurisdictions)
                  ? (record.reporting_jurisdictions as string[]).join(', ')
                  : '-'}
              </p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ClientPortfoliosTab({ clientId }: { clientId: string }) {
  const { listQuery } = useOpsCrud({
    entityKey: 'portfolios',
    apiPath: `/api/v1/portfolios`,
    search: clientId,
    enabled: !!clientId,
  });

  const portfolios = (listQuery.data?.data ?? []) as Record<string, unknown>[];

  if (listQuery.isLoading) return <Skeleton className="h-32 w-full" />;

  if (portfolios.length === 0) {
    return <p className="text-sm text-muted-foreground">No portfolios found for this client.</p>;
  }

  return (
    <div className="space-y-3">
      {portfolios.map((portfolio, idx) => (
        <Card key={idx}>
          <CardContent className="grid gap-2 pt-4 md:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">Portfolio ID</p>
              <p className="text-sm font-medium">{String(portfolio.portfolio_id ?? '-')}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Type</p>
              <p className="text-sm font-medium">{String(portfolio.type ?? '-')}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Base Currency</p>
              <p className="text-sm font-medium">{String(portfolio.base_currency ?? '-')}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">AUM</p>
              <p className="text-sm font-medium">{String(portfolio.aum ?? '-')}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Inception Date</p>
              <p className="text-sm font-medium">{String(portfolio.inception_date ?? '-')}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Status</p>
              <p className="text-sm font-medium">{String(portfolio.portfolio_status ?? '-')}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function ClientsPage() {
  const navigate = useNavigate();
  const entityKey = 'clients';

  // Config
  const { config, crossValidationRules, isLoading: configLoading, error: configError } =
    useEntityConfig(entityKey);

  // CRUD state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Form state
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>('create');
  const [selectedRecord, setSelectedRecord] = useState<Record<string, unknown> | null>(null);

  // Delete state
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteRecord, setDeleteRecord] = useState<Record<string, unknown> | null>(null);

  // CSV Import state
  const [csvImportOpen, setCsvImportOpen] = useState(false);

  // Detail sheet state
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailClient, setDetailClient] = useState<Record<string, unknown> | null>(null);

  // CRUD hook
  const { listQuery, createMutation, updateMutation, deleteMutation } = useOpsCrud({
    entityKey,
    page,
    pageSize,
    search,
    sortBy,
    sortOrder,
    enabled: !!config,
  });

  // Handlers
  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    setPage(1);
  }, []);

  const handleSortChange = useCallback(
    (field: string) => {
      if (sortBy === field) {
        setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortBy(field);
        setSortOrder('asc');
      }
    },
    [sortBy],
  );

  const handleAddNew = useCallback(() => {
    setFormMode('create');
    setSelectedRecord(null);
    setFormOpen(true);
  }, []);

  const handleEdit = useCallback((record: Record<string, unknown>) => {
    setFormMode('edit');
    setSelectedRecord(record);
    setFormOpen(true);
  }, []);

  const handleView = useCallback((record: Record<string, unknown>) => {
    // Open detail sheet instead of form
    setDetailClient(record);
    setDetailOpen(true);
  }, []);

  const handleDelete = useCallback((record: Record<string, unknown>) => {
    setDeleteRecord(record);
    setDeleteOpen(true);
  }, []);

  const handleFormClose = useCallback(() => {
    setFormOpen(false);
    setSelectedRecord(null);
  }, []);

  const handleFormSubmit = useCallback(
    (data: Record<string, unknown>) => {
      if (formMode === 'create') {
        createMutation.mutate(data, {
          onSuccess: () => handleFormClose(),
        });
      } else if (formMode === 'edit' && selectedRecord) {
        const id = (selectedRecord.client_id as string) ?? (selectedRecord.id as string) ?? '';
        updateMutation.mutate(
          { id, data },
          { onSuccess: () => handleFormClose() },
        );
      }
    },
    [formMode, selectedRecord, createMutation, updateMutation, handleFormClose],
  );

  const handleDeleteConfirm = useCallback(() => {
    if (!deleteRecord) return;
    const id = (deleteRecord.client_id as string) ?? (deleteRecord.id as string) ?? '';
    deleteMutation.mutate(id, {
      onSuccess: () => {
        setDeleteOpen(false);
        setDeleteRecord(null);
      },
    });
  }, [deleteRecord, deleteMutation]);

  const handleOpenFullDetail = useCallback(() => {
    if (detailClient) {
      const clientId = (detailClient.client_id as string) ?? '';
      navigate(`/master-data/clients/${clientId}`);
    }
  }, [detailClient, navigate]);

  // Loading state
  if (configLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (configError || !config) {
    return (
      <div className="flex items-center gap-3">
        <AlertTriangle className="h-5 w-5 text-destructive" />
        <p className="text-destructive">Failed to load client configuration.</p>
      </div>
    );
  }

  const listData = listQuery.data?.data ?? [];
  const listTotal = listQuery.data?.total ?? 0;

  const deleteRecordName = deleteRecord
    ? (deleteRecord.legal_name as string) ?? (deleteRecord.client_id as string) ?? 'this client'
    : '';

  const detailClientId = detailClient
    ? (detailClient.client_id as string) ?? ''
    : '';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <Users className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Clients</h1>
          <p className="text-sm text-muted-foreground">Manage client master records</p>
        </div>
      </div>

      {/* Data Table */}
      <OpsDataTable
        entityKey={entityKey}
        config={config}
        data={listData}
        total={listTotal}
        page={page}
        pageSize={pageSize}
        isLoading={listQuery.isLoading}
        search={search}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSearchChange={handleSearchChange}
        onSortChange={handleSortChange}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
        onAddNew={handleAddNew}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onView={handleView}
        onImportCsv={() => setCsvImportOpen(true)}
      />

      {/* Maintenance Form */}
      <OpsMaintenanceForm
        entityKey={entityKey}
        config={config}
        mode={formMode}
        initialData={selectedRecord ?? undefined}
        isOpen={formOpen}
        onClose={handleFormClose}
        onSubmit={handleFormSubmit}
        isSubmitting={createMutation.isPending || updateMutation.isPending}
        crossValidationRules={crossValidationRules}
      />

      {/* Delete Confirmation */}
      <OpsDeleteConfirm
        isOpen={deleteOpen}
        onClose={() => { setDeleteOpen(false); setDeleteRecord(null); }}
        onConfirm={handleDeleteConfirm}
        entityName="Client"
        recordIdentifier={String(deleteRecordName)}
        isDeleting={deleteMutation.isPending}
      />

      {/* CSV Import */}
      <OpsCSVImport
        entityKey={entityKey}
        config={config}
        isOpen={csvImportOpen}
        onClose={() => setCsvImportOpen(false)}
        onSuccess={() => { setCsvImportOpen(false); listQuery.refetch(); }}
      />

      {/* Client Detail Sheet */}
      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent className="w-[600px] overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              {detailClient
                ? String(detailClient.legal_name ?? detailClient.client_id ?? 'Client')
                : 'Client Details'}
              <Button
                variant="ghost"
                size="sm"
                onClick={handleOpenFullDetail}
                className="ml-auto"
              >
                <ExternalLink className="mr-1 h-4 w-4" />
                Full View
              </Button>
            </SheetTitle>
          </SheetHeader>

          {detailClient && (
            <div className="mt-4 space-y-4">
              {/* Client Summary Card */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    {String(detailClient.legal_name ?? '-')}
                  </CardTitle>
                  <CardDescription>{detailClientId}</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-2 md:grid-cols-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Client Type</p>
                    <p className="text-sm font-medium">{String(detailClient.type ?? '-')}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Risk Profile</p>
                    <Badge>{String(detailClient.risk_profile ?? '-')}</Badge>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Status</p>
                    <Badge variant={detailClient.client_status === 'ACTIVE' ? 'default' : 'secondary'}>
                      {String(detailClient.client_status ?? '-')}
                    </Badge>
                  </div>
                </CardContent>
              </Card>

              {/* Tabbed Sub-Entity Data */}
              <Tabs defaultValue="profile">
                <TabsList className="grid w-full grid-cols-5">
                  <TabsTrigger value="profile">Profile</TabsTrigger>
                  <TabsTrigger value="kyc">KYC</TabsTrigger>
                  <TabsTrigger value="ubo">UBOs</TabsTrigger>
                  <TabsTrigger value="fatca">FATCA</TabsTrigger>
                  <TabsTrigger value="portfolios">Portfolios</TabsTrigger>
                </TabsList>

                <TabsContent value="profile" className="mt-4">
                  <ClientProfileTab clientId={detailClientId} />
                </TabsContent>
                <TabsContent value="kyc" className="mt-4">
                  <ClientKycTab clientId={detailClientId} />
                </TabsContent>
                <TabsContent value="ubo" className="mt-4">
                  <ClientBeneficiariesTab clientId={detailClientId} />
                </TabsContent>
                <TabsContent value="fatca" className="mt-4">
                  <ClientFatcaCrsTab clientId={detailClientId} />
                </TabsContent>
                <TabsContent value="portfolios" className="mt-4">
                  <ClientPortfoliosTab clientId={detailClientId} />
                </TabsContent>
              </Tabs>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
