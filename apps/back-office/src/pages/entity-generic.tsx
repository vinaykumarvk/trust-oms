/**
 * Generic Entity Page — Phase 0C
 *
 * Reads :entityKey from the URL params and wires up:
 *   - useEntityConfig to load the config
 *   - useOpsCrud for data operations
 *   - OpsDataTable for display
 *   - OpsMaintenanceForm for create/edit/view
 *   - OpsDeleteConfirm for delete confirmation
 *   - OpsCSVImport for bulk import
 */

import { useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useOpsCrud } from '@/hooks/useOpsCrud';
import { useEntityConfig } from '@/hooks/use-entity-config';
import {
  OpsDataTable,
  OpsMaintenanceForm,
  OpsDeleteConfirm,
  OpsCSVImport,
} from '@/components/crud';
import { Skeleton } from '@ui/components/ui/skeleton';
import { Database, AlertTriangle } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FormMode = 'create' | 'edit' | 'view';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

/** Convert kebab-case entity key to a human-readable title */
function formatEntityName(key: string): string {
  return key
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function EntityGenericPage() {
  const { entityKey } = useParams<{ entityKey: string }>();
  const entityName = entityKey ? formatEntityName(entityKey) : 'Unknown Entity';

  // ---- Config
  const { config, crossValidationRules, isLoading: configLoading, error: configError } =
    useEntityConfig(entityKey ?? '');

  // ---- CRUD state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // ---- Form state
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>('create');
  const [selectedRecord, setSelectedRecord] = useState<Record<string, unknown> | null>(null);

  // ---- Delete state
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteRecord, setDeleteRecord] = useState<Record<string, unknown> | null>(null);

  // ---- CSV Import state
  const [csvImportOpen, setCsvImportOpen] = useState(false);

  // ---- CRUD hook
  const { listQuery, createMutation, updateMutation, deleteMutation } = useOpsCrud({
    entityKey: entityKey ?? '',
    page,
    pageSize,
    search,
    sortBy,
    sortOrder,
    enabled: !!entityKey && !!config,
  });

  // ---- Handlers ---------------------------------------------------------

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    setPage(1); // reset to first page on search
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

  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
  }, []);

  const handlePageSizeChange = useCallback((newSize: number) => {
    setPageSize(newSize);
    setPage(1);
  }, []);

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
    setFormMode('view');
    setSelectedRecord(record);
    setFormOpen(true);
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

  const handleCsvImportSuccess = useCallback(() => {
    setCsvImportOpen(false);
    // Refresh list
    listQuery.refetch();
  }, [listQuery]);

  // ---- Loading state for config
  if (configLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  // ---- Error state
  if (configError || !config) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10">
            <AlertTriangle className="h-5 w-5 text-destructive" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {entityName}
            </h1>
            <p className="text-sm text-destructive">
              {configError
                ? `Failed to load configuration: ${configError.message}`
                : 'Entity configuration not found.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ---- Extract data from query
  const listData = listQuery.data?.data ?? [];
  const listTotal = listQuery.data?.total ?? 0;

  // ---- Compute record identifier for delete dialog
  const deleteRecordName = deleteRecord
    ? (deleteRecord.name as string) ??
      (deleteRecord.code as string) ??
      (deleteRecord.id as string) ??
      'this record'
    : '';

  // ---- Render -----------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <Database className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {config.displayNamePlural}
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage {config.displayNamePlural.toLowerCase()} records
          </p>
        </div>
      </div>

      {/* Data Table */}
      <OpsDataTable
        entityKey={entityKey ?? ''}
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
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
        onAddNew={handleAddNew}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onView={handleView}
        onImportCsv={() => setCsvImportOpen(true)}
      />

      {/* Maintenance Form (create/edit/view) */}
      <OpsMaintenanceForm
        entityKey={entityKey ?? ''}
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
        onClose={() => {
          setDeleteOpen(false);
          setDeleteRecord(null);
        }}
        onConfirm={handleDeleteConfirm}
        entityName={config.displayName}
        recordIdentifier={String(deleteRecordName)}
        isDeleting={deleteMutation.isPending}
      />

      {/* CSV Import */}
      <OpsCSVImport
        entityKey={entityKey ?? ''}
        config={config}
        isOpen={csvImportOpen}
        onClose={() => setCsvImportOpen(false)}
        onSuccess={handleCsvImportSuccess}
      />
    </div>
  );
}
