/**
 * OpsDataTable — Generic, config-driven data table for TrustOMS entities.
 *
 * Auto-generates columns from MergedEntityConfig, supports search, sort,
 * pagination, row actions, CSV export/import, and loading/empty states.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { MergedEntityConfig, MergedFieldConfig } from '@shared/entity-configs/types';
import { Button } from '@ui/components/ui/button';
import { Input } from '@ui/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ui/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@ui/components/ui/dropdown-menu';
import { Skeleton } from '@ui/components/ui/skeleton';
import { Badge } from '@ui/components/ui/badge';
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  Download,
  Upload,
  MoreHorizontal,
  Eye,
  Pencil,
  Trash2,
  Plus,
  Search,
  Lock,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OpsDataTableProps {
  entityKey: string;
  config: MergedEntityConfig;
  data: Record<string, unknown>[];
  total: number;
  page: number;
  pageSize: number;
  isLoading: boolean;
  search: string;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  onSearchChange: (search: string) => void;
  onSortChange: (field: string) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onAddNew: () => void;
  onEdit: (record: Record<string, unknown>) => void;
  onDelete: (record: Record<string, unknown>) => void;
  onView?: (record: Record<string, unknown>) => void;
  onExportCsv?: () => void;
  onImportCsv?: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PAGE_SIZES = [10, 25, 50, 100] as const;
const DEBOUNCE_MS = 300;

/** Columns derived from config (only visibleInTable) */
function getVisibleColumns(config: MergedEntityConfig): MergedFieldConfig[] {
  return config.fields
    .filter((f) => f.visibleInTable !== false)
    .sort((a, b) => (a.displayOrder ?? 999) - (b.displayOrder ?? 999));
}

/** Format a cell value for display */
function formatCellValue(
  value: unknown,
  field: MergedFieldConfig,
): string {
  if (value === null || value === undefined) return '-';

  if (field.piiSensitive) {
    const str = String(value);
    if (str.length <= 4) return '****';
    return str.slice(0, 2) + '*'.repeat(str.length - 4) + str.slice(-2);
  }

  if (field.inputType === 'switch' || field.inputType === undefined && typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }

  if (field.inputType === 'date') {
    try {
      return new Date(String(value)).toLocaleDateString();
    } catch {
      return String(value);
    }
  }

  if (field.inputType === 'currency') {
    return Number(value).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  if (field.inputType === 'percentage') {
    return `${Number(value).toFixed(2)}%`;
  }

  return String(value);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OpsDataTable({
  entityKey,
  config,
  data,
  total,
  page,
  pageSize,
  isLoading,
  search,
  sortBy,
  sortOrder,
  onSearchChange,
  onSortChange,
  onPageChange,
  onPageSizeChange,
  onAddNew,
  onEdit,
  onDelete,
  onView,
  onExportCsv,
  onImportCsv,
}: OpsDataTableProps) {
  // Debounced search
  const [localSearch, setLocalSearch] = useState(search);

  useEffect(() => {
    setLocalSearch(search);
  }, [search]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (localSearch !== search) {
        onSearchChange(localSearch);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [localSearch, search, onSearchChange]);

  const columns = useMemo(() => getVisibleColumns(config), [config]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const handleSort = useCallback(
    (fieldName: string) => {
      onSortChange(fieldName);
    },
    [onSortChange],
  );

  // CSV export — generate client-side
  const handleExportCsv = useCallback(() => {
    if (onExportCsv) {
      onExportCsv();
      return;
    }

    // Fallback: export currently visible data
    const headers = columns.map((c) => c.label);
    const rows = data.map((row) =>
      columns.map((c) => {
        const val = row[c.fieldName];
        const str = val === null || val === undefined ? '' : String(val);
        // Escape double quotes
        return `"${str.replace(/"/g, '""')}"`;
      }),
    );

    const csv = [headers.map((h) => `"${h}"`).join(','), ...rows.map((r) => r.join(','))].join(
      '\n',
    );
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${entityKey}-export.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [columns, data, entityKey, onExportCsv]);

  // ---- Sort icon --------------------------------------------------------

  function SortIcon({ field }: { field: string }) {
    if (sortBy !== field) return <ArrowUpDown className="ml-1 h-3 w-3" />;
    return sortOrder === 'asc' ? (
      <ArrowUp className="ml-1 h-3 w-3" />
    ) : (
      <ArrowDown className="ml-1 h-3 w-3" />
    );
  }

  // ---- Render -----------------------------------------------------------

  return (
    <div className="space-y-4">
      {/* ---- Toolbar ---- */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Search */}
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={`Search ${config.displayNamePlural.toLowerCase()}...`}
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {onImportCsv && (
            <Button variant="outline" size="sm" onClick={onImportCsv}>
              <Upload className="mr-2 h-4 w-4" />
              Import
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleExportCsv}>
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          <Button size="sm" onClick={onAddNew}>
            <Plus className="mr-2 h-4 w-4" />
            Add {config.displayName}
          </Button>
        </div>
      </div>

      {/* ---- Table ---- */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead
                  key={col.fieldName}
                  style={col.columnWidth ? { width: col.columnWidth } : undefined}
                  className={col.sortable !== false ? 'cursor-pointer select-none' : undefined}
                  onClick={col.sortable !== false ? () => handleSort(col.fieldName) : undefined}
                >
                  <div className="flex items-center">
                    {col.label}
                    {col.piiSensitive && <Lock className="ml-1 h-3 w-3 text-muted-foreground" />}
                    {col.sortable !== false && <SortIcon field={col.fieldName} />}
                  </div>
                </TableHead>
              ))}
              <TableHead className="w-[70px]">Actions</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {/* Loading state */}
            {isLoading &&
              Array.from({ length: pageSize > 5 ? 5 : pageSize }).map((_, i) => (
                <TableRow key={`skeleton-${i}`}>
                  {columns.map((col) => (
                    <TableCell key={col.fieldName}>
                      <Skeleton className="h-5 w-full" />
                    </TableCell>
                  ))}
                  <TableCell>
                    <Skeleton className="h-5 w-8" />
                  </TableCell>
                </TableRow>
              ))}

            {/* Empty state */}
            {!isLoading && data.length === 0 && (
              <TableRow>
                <TableCell colSpan={columns.length + 1} className="h-32 text-center">
                  <p className="text-muted-foreground">
                    {search
                      ? `No ${config.displayNamePlural.toLowerCase()} matching "${search}".`
                      : `No ${config.displayNamePlural.toLowerCase()} found.`}
                  </p>
                </TableCell>
              </TableRow>
            )}

            {/* Data rows */}
            {!isLoading &&
              data.map((row, rowIdx) => (
                <TableRow key={(row.id as string | number) ?? rowIdx}>
                  {columns.map((col) => (
                    <TableCell key={col.fieldName}>
                      {col.inputType === 'switch' || typeof row[col.fieldName] === 'boolean' ? (
                        <Badge variant={row[col.fieldName] ? 'default' : 'secondary'}>
                          {row[col.fieldName] ? 'Yes' : 'No'}
                        </Badge>
                      ) : (
                        formatCellValue(row[col.fieldName], col)
                      )}
                    </TableCell>
                  ))}

                  {/* Row actions */}
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                          <span className="sr-only">Open menu</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {onView && (
                          <DropdownMenuItem onClick={() => onView(row)}>
                            <Eye className="mr-2 h-4 w-4" />
                            View
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => onEdit(row)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => onDelete(row)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      {/* ---- Pagination ---- */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Page size selector */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Rows per page</span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => onPageSizeChange(Number(v))}
          >
            <SelectTrigger className="h-8 w-[70px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Page info + navigation */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages} ({total} total)
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={page <= 1}
              onClick={() => onPageChange(1)}
            >
              <ChevronFirst className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={page >= totalPages}
              onClick={() => onPageChange(totalPages)}
            >
              <ChevronLast className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
