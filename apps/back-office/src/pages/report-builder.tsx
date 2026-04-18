/**
 * Ad-hoc Report Builder Page
 *
 * Features:
 *   - Table selector (whitelisted tables)
 *   - Column picker (multi-select checkboxes)
 *   - Filter builder (column + operator + value rows)
 *   - Sort configuration (column + direction)
 *   - Limit input
 *   - Results data table with CSV export
 *   - Save / Load query templates
 */

import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@ui/lib/queryClient";
import { apiUrl } from "@ui/lib/api-url";
import { useToast } from "@ui/components/ui/toast";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@ui/components/ui/card";
import { Badge } from "@ui/components/ui/badge";
import { Button } from "@ui/components/ui/button";
import { Input } from "@ui/components/ui/input";
import { Skeleton } from "@ui/components/ui/skeleton";
import { Separator } from "@ui/components/ui/separator";
import { Checkbox } from "@ui/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ui/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ui/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@ui/components/ui/dialog";
import {
  Play,
  Loader2,
  Plus,
  Trash2,
  Save,
  FolderOpen,
  FileSpreadsheet,
  Database,
  Columns3,
  Filter,
  ArrowUpDown,
  X,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FilterRow {
  id: string;
  column: string;
  operator: string;
  value: string;
}

interface SortConfig {
  column: string;
  direction: "asc" | "desc";
}

interface QueryTemplate {
  id: string;
  name: string;
  table: string;
  columns: string[];
  filters: FilterRow[];
  sort: SortConfig | null;
  limit: number;
  created_at: string;
}

interface AdHocResult {
  columns: string[];
  rows: Array<Record<string, string | number | boolean | null>>;
  row_count: number;
  execution_time_ms: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WHITELISTED_TABLES: Array<{ value: string; label: string }> = [
  { value: "clients", label: "Clients" },
  { value: "portfolios", label: "Portfolios" },
  { value: "securities", label: "Securities" },
  { value: "orders", label: "Orders" },
  { value: "positions", label: "Positions" },
  { value: "transactions", label: "Transactions" },
  { value: "nav_records", label: "NAV Records" },
  { value: "fee_billing", label: "Fee & Billing" },
];

/**
 * Column definitions per table. In production these would come from the API,
 * but we provide a reasonable static set for the builder UI.
 */
const TABLE_COLUMNS: Record<string, string[]> = {
  clients: [
    "id",
    "client_name",
    "client_type",
    "tin",
    "email",
    "phone",
    "status",
    "kyc_status",
    "risk_rating",
    "onboarding_date",
    "created_at",
    "updated_at",
  ],
  portfolios: [
    "id",
    "portfolio_name",
    "client_id",
    "portfolio_type",
    "currency",
    "inception_date",
    "status",
    "benchmark",
    "nav",
    "total_aum",
    "created_at",
    "updated_at",
  ],
  securities: [
    "id",
    "isin",
    "ticker",
    "security_name",
    "security_type",
    "currency",
    "exchange",
    "issuer",
    "maturity_date",
    "coupon_rate",
    "price",
    "status",
    "created_at",
  ],
  orders: [
    "id",
    "portfolio_id",
    "security_id",
    "order_type",
    "side",
    "quantity",
    "price",
    "amount",
    "status",
    "placed_at",
    "filled_at",
    "created_at",
  ],
  positions: [
    "id",
    "portfolio_id",
    "security_id",
    "quantity",
    "avg_cost",
    "market_value",
    "unrealized_pnl",
    "weight",
    "as_of_date",
    "created_at",
  ],
  transactions: [
    "id",
    "portfolio_id",
    "security_id",
    "transaction_type",
    "quantity",
    "price",
    "amount",
    "fees",
    "settlement_date",
    "status",
    "created_at",
  ],
  nav_records: [
    "id",
    "portfolio_id",
    "nav_date",
    "total_assets",
    "total_liabilities",
    "nav",
    "nav_per_unit",
    "units_outstanding",
    "status",
    "created_at",
  ],
  fee_billing: [
    "id",
    "portfolio_id",
    "fee_type",
    "period_start",
    "period_end",
    "basis_amount",
    "rate",
    "computed_fee",
    "status",
    "billed_at",
    "created_at",
  ],
};

const FILTER_OPERATORS = [
  { value: "eq", label: "= (equals)" },
  { value: "neq", label: "!= (not equal)" },
  { value: "gt", label: "> (greater than)" },
  { value: "gte", label: ">= (greater or equal)" },
  { value: "lt", label: "< (less than)" },
  { value: "lte", label: "<= (less or equal)" },
  { value: "like", label: "LIKE (contains)" },
  { value: "in", label: "IN (comma-separated)" },
  { value: "is_null", label: "IS NULL" },
  { value: "is_not_null", label: "IS NOT NULL" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let filterIdCounter = 0;
function nextFilterId(): string {
  filterIdCounter += 1;
  return `filter-${filterIdCounter}`;
}

function formatCellValue(val: string | number | boolean | null): string {
  if (val === null || val === undefined) return "-";
  if (typeof val === "boolean") return val ? "Yes" : "No";
  if (typeof val === "number") {
    return val.toLocaleString("en-PH", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 4,
    });
  }
  return String(val);
}

function downloadCsv(
  columns: string[],
  rows: Array<Record<string, string | number | boolean | null>>,
  filename: string
) {
  const header = columns.join(",");
  const csvRows = rows.map((row) =>
    columns
      .map((col) => {
        const val = row[col];
        if (val === null || val === undefined) return "";
        const str = String(val);
        return str.includes(",") || str.includes('"')
          ? `"${str.replace(/"/g, '""')}"`
          : str;
      })
      .join(",")
  );
  const csv = [header, ...csvRows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Column Picker
// ---------------------------------------------------------------------------

interface ColumnPickerProps {
  availableColumns: string[];
  selectedColumns: string[];
  onToggle: (col: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
}

function ColumnPicker({
  availableColumns,
  selectedColumns,
  onToggle,
  onSelectAll,
  onClearAll,
}: ColumnPickerProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium flex items-center gap-2">
          <Columns3 className="h-4 w-4" />
          Columns
        </label>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onSelectAll}>
            Select All
          </Button>
          <Button variant="ghost" size="sm" onClick={onClearAll}>
            Clear All
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 max-h-48 overflow-auto rounded-md border p-3">
        {availableColumns.map((col) => {
          const checked = selectedColumns.includes(col);
          return (
            <label
              key={col}
              className="flex items-center gap-2 cursor-pointer text-sm hover:bg-muted px-1.5 py-1 rounded"
            >
              <Checkbox
                checked={checked}
                onCheckedChange={() => onToggle(col)}
              />
              <span className={checked ? "font-medium" : "text-muted-foreground"}>
                {col.replace(/_/g, " ")}
              </span>
            </label>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        {selectedColumns.length} of {availableColumns.length} columns selected
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Filter Builder
// ---------------------------------------------------------------------------

interface FilterBuilderProps {
  filters: FilterRow[];
  availableColumns: string[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, field: keyof FilterRow, value: string) => void;
}

function FilterBuilder({
  filters,
  availableColumns,
  onAdd,
  onRemove,
  onUpdate,
}: FilterBuilderProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium flex items-center gap-2">
          <Filter className="h-4 w-4" />
          Filters
        </label>
        <Button variant="outline" size="sm" onClick={onAdd}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add Filter
        </Button>
      </div>

      {filters.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">
          No filters applied. Click &ldquo;Add Filter&rdquo; to narrow results.
        </p>
      ) : (
        <div className="space-y-2">
          {filters.map((f) => (
            <div key={f.id} className="flex items-center gap-2">
              {/* Column */}
              <Select
                value={f.column}
                onValueChange={(val) => onUpdate(f.id, "column", val)}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Column" />
                </SelectTrigger>
                <SelectContent>
                  {availableColumns.map((col) => (
                    <SelectItem key={col} value={col}>
                      {col.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Operator */}
              <Select
                value={f.operator}
                onValueChange={(val) => onUpdate(f.id, "operator", val)}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Operator" />
                </SelectTrigger>
                <SelectContent>
                  {FILTER_OPERATORS.map((op) => (
                    <SelectItem key={op.value} value={op.value}>
                      {op.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Value */}
              {f.operator !== "is_null" && f.operator !== "is_not_null" && (
                <Input
                  className="flex-1"
                  placeholder="Value"
                  value={f.value}
                  onChange={(e) => onUpdate(f.id, "value", e.target.value)}
                />
              )}

              {/* Remove */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onRemove(f.id)}
                className="shrink-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Save Template Dialog
// ---------------------------------------------------------------------------

interface SaveTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (name: string) => void;
  saving: boolean;
}

function SaveTemplateDialog({
  open,
  onOpenChange,
  onSave,
  saving,
}: SaveTemplateDialogProps) {
  const [name, setName] = useState("");

  const handleSave = () => {
    if (!name.trim()) return;
    onSave(name.trim());
    setName("");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setName("");
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save Query Template</DialogTitle>
          <DialogDescription>
            Save the current query configuration as a reusable template.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <label className="text-sm font-medium">Template Name</label>
          <Input
            placeholder="e.g. Monthly Client Summary"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
          />
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!name.trim() || saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function ReportBuilderPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Configuration state
  const [selectedTable, setSelectedTable] = useState("");
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [filters, setFilters] = useState<FilterRow[]>([]);
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
  const [limit, setLimit] = useState(100);

  // Template dialog
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);

  // Available columns for the selected table
  const availableColumns = useMemo(() => {
    return TABLE_COLUMNS[selectedTable] ?? [];
  }, [selectedTable]);

  // Handle table change — reset selections
  const handleTableChange = useCallback((table: string) => {
    setSelectedTable(table);
    const cols = TABLE_COLUMNS[table] ?? [];
    setSelectedColumns(cols); // default: select all
    setFilters([]);
    setSortConfig(null);
  }, []);

  // Column toggle
  const handleColumnToggle = useCallback(
    (col: string) => {
      setSelectedColumns((prev) =>
        prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]
      );
    },
    []
  );

  const handleSelectAllColumns = useCallback(() => {
    setSelectedColumns([...availableColumns]);
  }, [availableColumns]);

  const handleClearAllColumns = useCallback(() => {
    setSelectedColumns([]);
  }, []);

  // Filter management
  const handleAddFilter = useCallback(() => {
    const defaultCol = availableColumns[0] ?? "";
    setFilters((prev) => [
      ...prev,
      { id: nextFilterId(), column: defaultCol, operator: "eq", value: "" },
    ]);
  }, [availableColumns]);

  const handleRemoveFilter = useCallback((id: string) => {
    setFilters((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const handleUpdateFilter = useCallback(
    (id: string, field: keyof FilterRow, value: string) => {
      setFilters((prev) =>
        prev.map((f) => (f.id === id ? { ...f, [field]: value } : f))
      );
    },
    []
  );

  // Sort management
  const handleSortColumnChange = useCallback((col: string) => {
    setSortConfig((prev) => ({
      column: col,
      direction: prev?.direction ?? "asc",
    }));
  }, []);

  const handleSortDirectionChange = useCallback((dir: string) => {
    setSortConfig((prev) => ({
      column: prev?.column ?? "",
      direction: dir as "asc" | "desc",
    }));
  }, []);

  // Templates query
  const templatesQuery = useQuery<QueryTemplate[]>({
    queryKey: ["report-templates"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/reports/templates")),
    staleTime: 60 * 1000,
  });

  const templates = templatesQuery.data ?? [];

  // Run query mutation
  const runQueryMutation = useMutation<AdHocResult>({
    mutationFn: () =>
      apiRequest("POST", apiUrl("/api/v1/reports/ad-hoc"), {
        table: selectedTable,
        columns: selectedColumns,
        filters: filters
          .filter((f) => f.column && f.operator)
          .map((f) => ({
            column: f.column,
            operator: f.operator,
            value: f.value,
          })),
        sort: sortConfig?.column
          ? { column: sortConfig.column, direction: sortConfig.direction }
          : null,
        limit,
      }),
    onSuccess: (data) => {
      toast({
        title: "Query executed",
        description: `Returned ${data.row_count} rows in ${data.execution_time_ms}ms.`,
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Query failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  // Save template mutation
  const saveTemplateMutation = useMutation({
    mutationFn: (name: string) =>
      apiRequest("POST", apiUrl("/api/v1/reports/templates"), {
        name,
        table: selectedTable,
        columns: selectedColumns,
        filters: filters
          .filter((f) => f.column && f.operator)
          .map((f) => ({
            column: f.column,
            operator: f.operator,
            value: f.value,
          })),
        sort: sortConfig,
        limit,
      }),
    onSuccess: () => {
      setSaveDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["report-templates"] });
      toast({
        title: "Template saved",
        description: "Your query template has been saved successfully.",
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Save failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  // Load template
  const handleLoadTemplate = useCallback(
    (templateId: string) => {
      const tmpl = templates.find((t) => t.id === templateId);
      if (!tmpl) return;
      setSelectedTable(tmpl.table);
      setSelectedColumns(tmpl.columns);
      setFilters(
        tmpl.filters.map((f) => ({
          ...f,
          id: nextFilterId(),
        }))
      );
      setSortConfig(tmpl.sort);
      setLimit(tmpl.limit);
      toast({
        title: "Template loaded",
        description: `Loaded "${tmpl.name}" configuration.`,
      });
    },
    [templates, toast]
  );

  // Run query handler
  const handleRunQuery = useCallback(() => {
    if (!selectedTable) {
      toast({
        title: "No table selected",
        description: "Please select a table before running the query.",
        variant: "destructive",
      });
      return;
    }
    if (selectedColumns.length === 0) {
      toast({
        title: "No columns selected",
        description: "Please select at least one column.",
        variant: "destructive",
      });
      return;
    }
    runQueryMutation.mutate();
  }, [selectedTable, selectedColumns, runQueryMutation, toast]);

  // CSV Export
  const handleExportCsv = useCallback(() => {
    const result = runQueryMutation.data;
    if (!result) return;
    downloadCsv(
      result.columns,
      result.rows,
      `${selectedTable}_adhoc_${new Date().toISOString().split("T")[0]}.csv`
    );
    toast({
      title: "CSV exported",
      description: `Exported ${result.row_count} rows.`,
    });
  }, [runQueryMutation.data, selectedTable, toast]);

  const result = runQueryMutation.data;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Report Builder
          </h1>
          <p className="text-sm text-muted-foreground">
            Build ad-hoc queries against whitelisted tables. Save and reuse
            templates.
          </p>
        </div>
      </div>

      {/* Templates bar */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FolderOpen className="h-4 w-4" />
            Query Templates
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 flex-wrap">
            {/* Load template */}
            <div className="flex items-center gap-2">
              <Select onValueChange={handleLoadTemplate}>
                <SelectTrigger className="w-[260px]">
                  <SelectValue placeholder="Load a saved template..." />
                </SelectTrigger>
                <SelectContent>
                  {templates.length === 0 ? (
                    <SelectItem value="__none" disabled>
                      No templates saved yet
                    </SelectItem>
                  ) : (
                    templates.map((tmpl) => (
                      <SelectItem key={tmpl.id} value={tmpl.id}>
                        {tmpl.name}{" "}
                        <span className="text-muted-foreground">
                          ({tmpl.table})
                        </span>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Save current */}
            <Button
              variant="outline"
              size="sm"
              disabled={!selectedTable || selectedColumns.length === 0}
              onClick={() => setSaveDialogOpen(true)}
            >
              <Save className="mr-1.5 h-3.5 w-3.5" />
              Save Current as Template
            </Button>

            {templatesQuery.isLoading && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>
        </CardContent>
      </Card>

      {/* Configuration Panel */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Database className="h-4 w-4" />
            Query Configuration
          </CardTitle>
          <CardDescription>
            Select a table, pick columns, add filters, and configure sorting.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Table selector */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium flex items-center gap-2">
              <Database className="h-4 w-4" />
              Table
            </label>
            <Select value={selectedTable} onValueChange={handleTableChange}>
              <SelectTrigger className="w-[300px]">
                <SelectValue placeholder="Select a table..." />
              </SelectTrigger>
              <SelectContent>
                {WHITELISTED_TABLES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedTable && (
            <>
              <Separator />

              {/* Column picker */}
              <ColumnPicker
                availableColumns={availableColumns}
                selectedColumns={selectedColumns}
                onToggle={handleColumnToggle}
                onSelectAll={handleSelectAllColumns}
                onClearAll={handleClearAllColumns}
              />

              <Separator />

              {/* Filter builder */}
              <FilterBuilder
                filters={filters}
                availableColumns={availableColumns}
                onAdd={handleAddFilter}
                onRemove={handleRemoveFilter}
                onUpdate={handleUpdateFilter}
              />

              <Separator />

              {/* Sort configuration */}
              <div className="space-y-3">
                <label className="text-sm font-medium flex items-center gap-2">
                  <ArrowUpDown className="h-4 w-4" />
                  Sort
                </label>
                <div className="flex items-center gap-3">
                  <Select
                    value={sortConfig?.column ?? ""}
                    onValueChange={handleSortColumnChange}
                  >
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder="Sort column (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableColumns.map((col) => (
                        <SelectItem key={col} value={col}>
                          {col.replace(/_/g, " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={sortConfig?.direction ?? "asc"}
                    onValueChange={handleSortDirectionChange}
                  >
                    <SelectTrigger className="w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="asc">Ascending</SelectItem>
                      <SelectItem value="desc">Descending</SelectItem>
                    </SelectContent>
                  </Select>
                  {sortConfig && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSortConfig(null)}
                    >
                      <X className="h-4 w-4 mr-1" />
                      Clear
                    </Button>
                  )}
                </div>
              </div>

              <Separator />

              {/* Limit */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Row Limit</label>
                <div className="flex items-center gap-3">
                  <Input
                    type="number"
                    min={1}
                    max={10000}
                    value={limit}
                    onChange={(e) =>
                      setLimit(
                        Math.max(1, Math.min(10000, Number(e.target.value) || 100))
                      )
                    }
                    className="w-[140px]"
                  />
                  <p className="text-xs text-muted-foreground">
                    Maximum 10,000 rows per query
                  </p>
                </div>
              </div>
            </>
          )}

          <Separator />

          {/* Run button */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {selectedTable && (
                <Badge variant="secondary">
                  {WHITELISTED_TABLES.find((t) => t.value === selectedTable)
                    ?.label ?? selectedTable}
                </Badge>
              )}
              {selectedColumns.length > 0 && (
                <Badge variant="outline">
                  {selectedColumns.length} columns
                </Badge>
              )}
              {filters.length > 0 && (
                <Badge variant="outline">{filters.length} filters</Badge>
              )}
            </div>
            <Button
              onClick={handleRunQuery}
              disabled={
                runQueryMutation.isPending ||
                !selectedTable ||
                selectedColumns.length === 0
              }
            >
              {runQueryMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              Run Query
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Loading */}
      {runQueryMutation.isPending && (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">
                Executing query...
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {runQueryMutation.isError && (
        <Card className="border-destructive">
          <CardContent className="py-6">
            <div className="text-center">
              <p className="text-sm font-medium text-destructive">
                Query execution failed
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {runQueryMutation.error?.message ?? "Unknown error"}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={handleRunQuery}
              >
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {result && !runQueryMutation.isPending && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Query Results</CardTitle>
                <CardDescription>
                  {result.row_count.toLocaleString()} rows returned in{" "}
                  {result.execution_time_ms}ms
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={handleExportCsv}>
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                Export CSV
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-auto max-h-[500px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    {result.columns.map((col) => (
                      <TableHead key={col} className="whitespace-nowrap">
                        {col
                          .replace(/_/g, " ")
                          .replace(/\b\w/g, (c) => c.toUpperCase())}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.rows.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={result.columns.length}
                        className="text-center text-muted-foreground py-8"
                      >
                        No rows returned
                      </TableCell>
                    </TableRow>
                  ) : (
                    result.rows.map((row, idx) => (
                      <TableRow key={idx}>
                        {result.columns.map((col) => (
                          <TableCell key={col} className="whitespace-nowrap">
                            {formatCellValue(row[col])}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="mt-3 flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Showing {result.rows.length} of {result.row_count.toLocaleString()}{" "}
                rows (limit: {limit})
              </p>
              <Badge variant="outline" className="text-xs">
                {result.execution_time_ms}ms
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Save template dialog */}
      <SaveTemplateDialog
        open={saveDialogOpen}
        onOpenChange={setSaveDialogOpen}
        onSave={(name) => saveTemplateMutation.mutate(name)}
        saving={saveTemplateMutation.isPending}
      />
    </div>
  );
}
