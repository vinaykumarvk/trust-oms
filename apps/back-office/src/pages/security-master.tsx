/**
 * Security Master Page — Enhanced securities management
 *
 * Features:
 *   - OpsDataTable with ISIN/CUSIP/SEDOL search
 *   - Detail view in Sheet with pricing source hierarchy and asset class info
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
} from '@/components/crud';
import { Skeleton } from '@ui/components/ui/skeleton';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@ui/components/ui/sheet';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@ui/components/ui/card';
import { Badge } from '@ui/components/ui/badge';
import { Landmark, AlertTriangle } from 'lucide-react';

type FormMode = 'create' | 'edit' | 'view';

export default function SecurityMasterPage() {
  const entityKey = 'securities';

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
  const [detailSecurity, setDetailSecurity] = useState<Record<string, unknown> | null>(null);

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
    setDetailSecurity(record);
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
        const id = (selectedRecord.id as string | number) ?? '';
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
    const id = (deleteRecord.id as string | number) ?? '';
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
        <p className="text-destructive">Failed to load security configuration.</p>
      </div>
    );
  }

  const listData = listQuery.data?.data ?? [];
  const listTotal = listQuery.data?.total ?? 0;

  const deleteRecordName = deleteRecord
    ? (deleteRecord.name as string) ?? (deleteRecord.isin as string) ?? 'this security'
    : '';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <Landmark className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Securities</h1>
          <p className="text-sm text-muted-foreground">
            Security master data — search by ISIN, CUSIP, SEDOL, or name
          </p>
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
        entityName="Security"
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

      {/* Security Detail Sheet */}
      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent className="w-[600px] overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>
              {detailSecurity
                ? String(detailSecurity.name ?? 'Security Details')
                : 'Security Details'}
            </SheetTitle>
          </SheetHeader>

          {detailSecurity && (
            <div className="mt-4 space-y-4">
              {/* Identifiers */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Identifiers</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-2">
                  <div>
                    <p className="text-xs text-muted-foreground">ISIN</p>
                    <p className="font-mono text-sm font-medium">
                      {String(detailSecurity.isin ?? '-')}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">CUSIP</p>
                    <p className="font-mono text-sm font-medium">
                      {String(detailSecurity.cusip ?? '-')}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">SEDOL</p>
                    <p className="font-mono text-sm font-medium">
                      {String(detailSecurity.sedol ?? '-')}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Bloomberg Ticker</p>
                    <p className="font-mono text-sm font-medium">
                      {String(detailSecurity.bloomberg_ticker ?? '-')}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Local Code</p>
                    <p className="font-mono text-sm font-medium">
                      {String(detailSecurity.local_code ?? '-')}
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Classification */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Classification</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Asset Class</p>
                    <Badge>{String(detailSecurity.asset_class ?? '-')}</Badge>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Sector</p>
                    <p className="text-sm font-medium">{String(detailSecurity.sector ?? '-')}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Exchange</p>
                    <p className="text-sm font-medium">{String(detailSecurity.exchange ?? '-')}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Currency</p>
                    <p className="text-sm font-medium">{String(detailSecurity.currency ?? '-')}</p>
                  </div>
                </CardContent>
              </Card>

              {/* Pricing Source Hierarchy */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Pricing Source Hierarchy</CardTitle>
                </CardHeader>
                <CardContent>
                  {detailSecurity.pricing_source_hierarchy ? (
                    <pre className="rounded-md bg-muted p-3 text-xs">
                      {JSON.stringify(detailSecurity.pricing_source_hierarchy, null, 2)}
                    </pre>
                  ) : (
                    <p className="text-sm text-muted-foreground">No pricing hierarchy configured.</p>
                  )}
                </CardContent>
              </Card>

              {/* Status */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Status</CardTitle>
                </CardHeader>
                <CardContent>
                  <Badge variant={detailSecurity.is_active ? 'default' : 'secondary'}>
                    {detailSecurity.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </CardContent>
              </Card>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
