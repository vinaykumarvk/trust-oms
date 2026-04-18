/**
 * Portfolios Page — Enhanced portfolio master with detail view
 *
 * Features:
 *   - OpsDataTable for portfolio list
 *   - Detail view in Sheet with tabs: Mandates, Positions, Fees, Audit History
 *   - Full CRUD operations
 */

import { useState, useCallback } from 'react';
import { useOpsCrud } from '@/hooks/useOpsCrud';
import { useEntityConfig } from '@/hooks/use-entity-config';
import {
  OpsDataTable,
  OpsMaintenanceForm,
  OpsDeleteConfirm,
  OpsCSVImport,
  EntityAuditHistory,
} from '@/components/crud';
import { Skeleton } from '@ui/components/ui/skeleton';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ui/components/ui/table';
import { Badge } from '@ui/components/ui/badge';
import { Briefcase, AlertTriangle } from 'lucide-react';

type FormMode = 'create' | 'edit' | 'view';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

// ---------------------------------------------------------------------------
// Sub-entity Tab Components
// ---------------------------------------------------------------------------

function MandatesTab({ portfolioId }: { portfolioId: string }) {
  const { listQuery } = useOpsCrud({
    entityKey: 'mandates',
    apiPath: `/api/v1/portfolios/${portfolioId}/mandates`,
    enabled: !!portfolioId,
  });

  const data = (listQuery.data?.data ?? []) as Record<string, unknown>[];

  if (listQuery.isLoading) return <Skeleton className="h-32 w-full" />;

  if (data.length === 0) {
    return <p className="py-4 text-center text-sm text-muted-foreground">No mandates configured.</p>;
  }

  return (
    <div className="overflow-x-auto">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Benchmark</TableHead>
          <TableHead>Max Issuer %</TableHead>
          <TableHead>Max Sector %</TableHead>
          <TableHead>Duration Band</TableHead>
          <TableHead>Credit Floor</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((row, idx) => (
          <TableRow key={idx}>
            <TableCell>{formatCellValue(row.benchmark_id)}</TableCell>
            <TableCell>{formatCellValue(row.max_single_issuer_pct)}</TableCell>
            <TableCell>{formatCellValue(row.max_sector_pct)}</TableCell>
            <TableCell>{formatCellValue(row.duration_band)}</TableCell>
            <TableCell>{formatCellValue(row.credit_floor)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
    </div>
  );
}

function PositionsTab({ portfolioId }: { portfolioId: string }) {
  const { listQuery } = useOpsCrud({
    entityKey: 'positions',
    apiPath: `/api/v1/portfolios/${portfolioId}/positions`,
    enabled: !!portfolioId,
  });

  const data = (listQuery.data?.data ?? []) as Record<string, unknown>[];

  if (listQuery.isLoading) return <Skeleton className="h-32 w-full" />;

  if (data.length === 0) {
    return <p className="py-4 text-center text-sm text-muted-foreground">No positions found.</p>;
  }

  return (
    <div className="overflow-x-auto">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Security ID</TableHead>
          <TableHead>Quantity</TableHead>
          <TableHead>Cost Basis</TableHead>
          <TableHead>Market Value</TableHead>
          <TableHead>Unrealized P&L</TableHead>
          <TableHead>As Of</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((row, idx) => (
          <TableRow key={idx}>
            <TableCell>{formatCellValue(row.security_id)}</TableCell>
            <TableCell>{formatCellValue(row.quantity)}</TableCell>
            <TableCell>{formatCellValue(row.cost_basis)}</TableCell>
            <TableCell>{formatCellValue(row.market_value)}</TableCell>
            <TableCell>{formatCellValue(row.unrealized_pnl)}</TableCell>
            <TableCell>{formatCellValue(row.as_of_date)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
    </div>
  );
}

function FeesTab({ portfolioId }: { portfolioId: string }) {
  const { listQuery } = useOpsCrud({
    entityKey: 'fee-schedules',
    apiPath: `/api/v1/portfolios/${portfolioId}/fee-schedules`,
    enabled: !!portfolioId,
  });

  const data = (listQuery.data?.data ?? []) as Record<string, unknown>[];

  if (listQuery.isLoading) return <Skeleton className="h-32 w-full" />;

  if (data.length === 0) {
    return <p className="py-4 text-center text-sm text-muted-foreground">No fee schedules configured.</p>;
  }

  return (
    <div className="overflow-x-auto">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Fee Type</TableHead>
          <TableHead>Method</TableHead>
          <TableHead>Rate %</TableHead>
          <TableHead>Effective From</TableHead>
          <TableHead>Effective To</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((row, idx) => (
          <TableRow key={idx}>
            <TableCell>{formatCellValue(row.fee_type)}</TableCell>
            <TableCell>{formatCellValue(row.calculation_method)}</TableCell>
            <TableCell>{formatCellValue(row.rate_pct)}</TableCell>
            <TableCell>{formatCellValue(row.effective_from)}</TableCell>
            <TableCell>{formatCellValue(row.effective_to)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function PortfoliosPage() {
  const entityKey = 'portfolios';

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
  const [detailPortfolio, setDetailPortfolio] = useState<Record<string, unknown> | null>(null);

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
    setDetailPortfolio(record);
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
        const id = (selectedRecord.portfolio_id as string) ?? (selectedRecord.id as string) ?? '';
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
    const id = (deleteRecord.portfolio_id as string) ?? (deleteRecord.id as string) ?? '';
    deleteMutation.mutate(id, {
      onSuccess: () => {
        setDeleteOpen(false);
        setDeleteRecord(null);
      },
    });
  }, [deleteRecord, deleteMutation]);

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
        <p className="text-destructive">Failed to load portfolio configuration.</p>
      </div>
    );
  }

  const listData = listQuery.data?.data ?? [];
  const listTotal = listQuery.data?.total ?? 0;

  const deleteRecordName = deleteRecord
    ? (deleteRecord.portfolio_id as string) ?? 'this portfolio'
    : '';

  const detailPortfolioId = detailPortfolio
    ? (detailPortfolio.portfolio_id as string) ?? ''
    : '';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <Briefcase className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Portfolios</h1>
          <p className="text-sm text-muted-foreground">Manage trust portfolio accounts</p>
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
        entityName="Portfolio"
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

      {/* Portfolio Detail Sheet */}
      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent className="w-[640px] overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>
              Portfolio: {detailPortfolioId || 'Details'}
            </SheetTitle>
          </SheetHeader>

          {detailPortfolio && (
            <div className="mt-4 space-y-4">
              {/* Portfolio Summary */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{detailPortfolioId}</CardTitle>
                  <CardDescription>
                    Client: {String(detailPortfolio.client_id ?? '-')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Type</p>
                    <Badge>{String(detailPortfolio.type ?? '-')}</Badge>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Base Currency</p>
                    <p className="text-sm font-medium">{String(detailPortfolio.base_currency ?? '-')}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">AUM</p>
                    <p className="text-sm font-medium">{String(detailPortfolio.aum ?? '-')}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Inception Date</p>
                    <p className="text-sm font-medium">{String(detailPortfolio.inception_date ?? '-')}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Status</p>
                    <Badge variant={detailPortfolio.portfolio_status === 'ACTIVE' ? 'default' : 'secondary'}>
                      {String(detailPortfolio.portfolio_status ?? '-')}
                    </Badge>
                  </div>
                </CardContent>
              </Card>

              {/* Tabbed Sub-Entities */}
              <Tabs defaultValue="mandates">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="mandates">Mandates</TabsTrigger>
                  <TabsTrigger value="positions">Positions</TabsTrigger>
                  <TabsTrigger value="fees">Fees</TabsTrigger>
                  <TabsTrigger value="audit">Audit</TabsTrigger>
                </TabsList>

                <TabsContent value="mandates" className="mt-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Investment Mandates</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <MandatesTab portfolioId={detailPortfolioId} />
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="positions" className="mt-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Current Positions</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <PositionsTab portfolioId={detailPortfolioId} />
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="fees" className="mt-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Fee Schedules</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <FeesTab portfolioId={detailPortfolioId} />
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="audit" className="mt-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Audit History</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <EntityAuditHistory
                        entityType="portfolios"
                        entityId={detailPortfolioId}
                      />
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
