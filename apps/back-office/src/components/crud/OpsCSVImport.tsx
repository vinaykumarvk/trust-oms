/**
 * OpsCSVImport — Dialog-based CSV import wizard with 4 steps:
 *   1. Upload  — drag & drop / file picker (10 MB max, CSV only)
 *   2. Mapping — map CSV columns to entity fields, auto-detect by header name
 *   3. Preview — first 10 rows with validation errors highlighted
 *   4. Result  — success/error summary
 *
 * Custom CSV parser handles quoted values, commas within quotes, and CRLF.
 */

import { useState, useCallback, useMemo, useRef } from 'react';
import type { MergedEntityConfig, MergedFieldConfig } from '@shared/entity-configs/types';
import { apiRequest } from '@ui/lib/queryClient';
import { useToast } from '@ui/components/ui/toast';
import { Button } from '@ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ui/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ui/components/ui/table';
import { Badge } from '@ui/components/ui/badge';
import { Progress } from '@ui/components/ui/progress';
import { ScrollArea } from '@ui/components/ui/scroll-area';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OpsCSVImportProps {
  entityKey: string;
  config: MergedEntityConfig;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type Step = 'upload' | 'mapping' | 'preview' | 'result';

interface ColumnMapping {
  csvColumn: string;
  entityField: string; // fieldName or '' for unmapped
}

interface ValidationError {
  row: number;
  field: string;
  message: string;
}

interface ImportResult {
  total: number;
  success: number;
  failed: number;
  errors: Array<{ row: number; field: string; message: string }>;
}

// ---------------------------------------------------------------------------
// CSV Parser
// ---------------------------------------------------------------------------

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"') {
        if (next === '"') {
          // Escaped double quote
          cell += '"';
          i++;
        } else {
          // End of quoted field
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(cell);
        cell = '';
      } else if (ch === '\r') {
        // Handle CRLF
        if (next === '\n') i++;
        row.push(cell);
        cell = '';
        rows.push(row);
        row = [];
      } else if (ch === '\n') {
        row.push(cell);
        cell = '';
        rows.push(row);
        row = [];
      } else {
        cell += ch;
      }
    }
  }

  // Last cell/row
  if (cell || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

function getImportableFields(config: MergedEntityConfig): MergedFieldConfig[] {
  return config.fields
    .filter((f) => f.visibleInForm !== false)
    .sort((a, b) => (a.displayOrder ?? 999) - (b.displayOrder ?? 999));
}

/** Fuzzy match a CSV header to an entity field */
function autoMapColumn(
  csvHeader: string,
  fields: MergedFieldConfig[],
): string {
  const normalized = csvHeader.toLowerCase().replace(/[^a-z0-9]/g, '');

  // Exact match on fieldName or label
  for (const f of fields) {
    if (f.fieldName.toLowerCase().replace(/[^a-z0-9]/g, '') === normalized) return f.fieldName;
    if (f.label.toLowerCase().replace(/[^a-z0-9]/g, '') === normalized) return f.fieldName;
  }

  // Partial match
  for (const f of fields) {
    const fn = f.fieldName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const fl = f.label.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (fn.includes(normalized) || normalized.includes(fn)) return f.fieldName;
    if (fl.includes(normalized) || normalized.includes(fl)) return f.fieldName;
  }

  return '';
}

function validateRow(
  row: Record<string, string>,
  fields: MergedFieldConfig[],
  rowIdx: number,
): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const field of fields) {
    const value = row[field.fieldName];
    if (value === undefined) continue;

    // Required
    if (field.required && !value.trim()) {
      errors.push({
        row: rowIdx,
        field: field.fieldName,
        message: `${field.label} is required`,
      });
      continue;
    }

    if (!value.trim()) continue;

    // Number check
    if (
      field.inputType === 'number' ||
      field.inputType === 'currency' ||
      field.inputType === 'percentage'
    ) {
      if (isNaN(Number(value))) {
        errors.push({ row: rowIdx, field: field.fieldName, message: `Must be a number` });
      }
    }

    // Regex
    if (field.validationRegex) {
      try {
        if (!new RegExp(field.validationRegex).test(value)) {
          errors.push({ row: rowIdx, field: field.fieldName, message: `Invalid format` });
        }
      } catch {
        // skip
      }
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OpsCSVImport({
  entityKey,
  config,
  isOpen,
  onClose,
  onSuccess,
}: OpsCSVImportProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const importableFields = useMemo(() => getImportableFields(config), [config]);

  // ---- State
  const [step, setStep] = useState<Step>('upload');
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // ---- Reset on close
  const handleClose = useCallback(() => {
    setStep('upload');
    setCsvHeaders([]);
    setCsvRows([]);
    setMappings([]);
    setValidationErrors([]);
    setImporting(false);
    setImportResult(null);
    setDragOver(false);
    onClose();
  }, [onClose]);

  // ---- File processing
  const processFile = useCallback(
    (file: File) => {
      if (file.size > MAX_FILE_SIZE) {
        toast({
          title: 'File too large',
          description: 'Maximum file size is 10 MB.',
          variant: 'destructive',
        });
        return;
      }

      if (!file.name.toLowerCase().endsWith('.csv')) {
        toast({
          title: 'Invalid file type',
          description: 'Please upload a CSV file.',
          variant: 'destructive',
        });
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        const parsed = parseCSV(text);

        if (parsed.length < 2) {
          toast({
            title: 'Invalid CSV',
            description: 'The file must contain at least a header row and one data row.',
            variant: 'destructive',
          });
          return;
        }

        const headers = parsed[0];
        const dataRows = parsed.slice(1).filter((r) => r.some((c) => c.trim()));

        setCsvHeaders(headers);
        setCsvRows(dataRows);

        // Auto-map columns
        const autoMappings: ColumnMapping[] = headers.map((h) => ({
          csvColumn: h,
          entityField: autoMapColumn(h, importableFields),
        }));
        setMappings(autoMappings);

        setStep('mapping');
      };

      reader.readAsText(file);
    },
    [importableFields, toast],
  );

  // ---- Drag & drop handlers
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile],
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
    },
    [processFile],
  );

  // ---- Mapping change
  const handleMappingChange = useCallback(
    (csvColumn: string, entityField: string) => {
      setMappings((prev) =>
        prev.map((m) =>
          m.csvColumn === csvColumn ? { ...m, entityField } : m,
        ),
      );
    },
    [],
  );

  // ---- Proceed to preview
  const handlePreview = useCallback(() => {
    // Build mapped data and validate
    const errors: ValidationError[] = [];
    const previewRows = csvRows.slice(0, 10);

    for (let i = 0; i < previewRows.length; i++) {
      const row: Record<string, string> = {};
      for (const mapping of mappings) {
        if (!mapping.entityField) continue;
        const colIdx = csvHeaders.indexOf(mapping.csvColumn);
        row[mapping.entityField] = previewRows[i][colIdx] ?? '';
      }

      const rowErrors = validateRow(row, importableFields, i + 1);
      errors.push(...rowErrors);
    }

    setValidationErrors(errors);
    setStep('preview');
  }, [csvRows, csvHeaders, mappings, importableFields]);

  // ---- Import
  const handleImport = useCallback(async () => {
    setImporting(true);

    // Build all mapped rows
    const rows: Record<string, string>[] = csvRows.map((csvRow) => {
      const row: Record<string, string> = {};
      for (const mapping of mappings) {
        if (!mapping.entityField) continue;
        const colIdx = csvHeaders.indexOf(mapping.csvColumn);
        row[mapping.entityField] = csvRow[colIdx] ?? '';
      }
      return row;
    });

    try {
      const result = await apiRequest('POST', `/api/v1/${entityKey}/bulk-import`, {
        rows,
      });

      // Check for 202 maker-checker
      if (result && (result as Record<string, unknown>).__httpStatus === 202) {
        toast({
          title: 'Submitted for approval',
          description: 'The bulk import requires maker-checker approval.',
        });
        handleClose();
        onSuccess();
        return;
      }

      setImportResult(result as ImportResult);
      setStep('result');
    } catch (err) {
      const error = err as Error;
      toast({
        title: 'Import Failed',
        description: error.message || 'An unexpected error occurred during import.',
        variant: 'destructive',
      });
    } finally {
      setImporting(false);
    }
  }, [csvRows, csvHeaders, mappings, entityKey, toast, handleClose, onSuccess]);

  // ---- Mapped data for preview table
  const previewData = useMemo(() => {
    return csvRows.slice(0, 10).map((csvRow) => {
      const row: Record<string, string> = {};
      for (const mapping of mappings) {
        if (!mapping.entityField) continue;
        const colIdx = csvHeaders.indexOf(mapping.csvColumn);
        row[mapping.entityField] = csvRow[colIdx] ?? '';
      }
      return row;
    });
  }, [csvRows, csvHeaders, mappings]);

  const mappedFields = useMemo(
    () => mappings.filter((m) => m.entityField).map((m) => m.entityField),
    [mappings],
  );

  // ---- Render step content ----------------------------------------------

  function renderUpload() {
    return (
      <div
        className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 transition-colors ${
          dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <Upload className="mb-4 h-12 w-12 text-muted-foreground/50" />
        <p className="mb-2 text-sm font-medium">Drag and drop your CSV file here</p>
        <p className="mb-4 text-xs text-muted-foreground">or</p>
        <Button
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
        >
          <FileSpreadsheet className="mr-2 h-4 w-4" />
          Browse Files
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={handleFileInput}
        />
        <p className="mt-4 text-xs text-muted-foreground">
          CSV files only, max 10 MB
        </p>
      </div>
    );
  }

  function renderMapping() {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Map each CSV column to the corresponding field. Unmapped columns will be ignored.
        </p>
        <ScrollArea className="max-h-[400px]">
          <div className="space-y-3">
            {mappings.map((mapping) => (
              <div key={mapping.csvColumn} className="flex items-center gap-4">
                <div className="w-1/3 truncate text-sm font-medium">
                  {mapping.csvColumn}
                </div>
                <span className="text-muted-foreground">-&gt;</span>
                <div className="w-1/2">
                  <Select
                    value={mapping.entityField || '__unmapped'}
                    onValueChange={(v) =>
                      handleMappingChange(mapping.csvColumn, v === '__unmapped' ? '' : v)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Skip this column" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__unmapped">-- Skip --</SelectItem>
                      {importableFields.map((f) => (
                        <SelectItem key={f.fieldName} value={f.fieldName}>
                          {f.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
        <p className="text-xs text-muted-foreground">
          {csvRows.length} data rows detected
        </p>
      </div>
    );
  }

  function renderPreview() {
    const displayFields = importableFields.filter((f) => mappedFields.includes(f.fieldName));

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <p className="text-sm text-muted-foreground">
            Showing first {Math.min(10, csvRows.length)} of {csvRows.length} rows.
          </p>
          {validationErrors.length > 0 && (
            <Badge variant="destructive">
              <AlertTriangle className="mr-1 h-3 w-3" />
              {validationErrors.length} validation error{validationErrors.length !== 1 ? 's' : ''}
            </Badge>
          )}
        </div>

        <ScrollArea className="max-h-[350px]">
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[60px]">Row</TableHead>
                {displayFields.map((f) => (
                  <TableHead key={f.fieldName}>{f.label}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {previewData.map((row, i) => {
                const rowErrors = validationErrors.filter((e) => e.row === i + 1);
                return (
                  <TableRow key={i}>
                    <TableCell className="font-mono text-xs">{i + 1}</TableCell>
                    {displayFields.map((f) => {
                      const cellError = rowErrors.find((e) => e.field === f.fieldName);
                      return (
                        <TableCell
                          key={f.fieldName}
                          className={cellError ? 'bg-destructive/10' : undefined}
                          title={cellError?.message}
                        >
                          <span className="text-sm">{row[f.fieldName] || '-'}</span>
                          {cellError && (
                            <p className="text-xs text-destructive">{cellError.message}</p>
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          </div>
        </ScrollArea>
      </div>
    );
  }

  function renderResult() {
    if (!importResult) return null;

    return (
      <div className="space-y-6">
        {/* Summary */}
        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="rounded-lg border p-4">
            <p className="text-2xl font-bold">{importResult.total}</p>
            <p className="text-xs text-muted-foreground">Total Rows</p>
          </div>
          <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950">
            <p className="text-2xl font-bold text-green-700 dark:text-green-400">
              {importResult.success}
            </p>
            <p className="text-xs text-muted-foreground">Imported</p>
          </div>
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950">
            <p className="text-2xl font-bold text-red-700 dark:text-red-400">
              {importResult.failed}
            </p>
            <p className="text-xs text-muted-foreground">Failed</p>
          </div>
        </div>

        {/* Errors table */}
        {importResult.errors.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Error Details</p>
            <ScrollArea className="max-h-[250px]">
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[60px]">Row</TableHead>
                    <TableHead>Field</TableHead>
                    <TableHead>Error</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {importResult.errors.map((err, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-xs">{err.row}</TableCell>
                      <TableCell className="text-sm">{err.field}</TableCell>
                      <TableCell className="text-sm text-destructive">{err.message}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            </ScrollArea>
          </div>
        )}
      </div>
    );
  }

  // ---- Step indicator
  const steps: { key: Step; label: string }[] = [
    { key: 'upload', label: 'Upload' },
    { key: 'mapping', label: 'Mapping' },
    { key: 'preview', label: 'Preview' },
    { key: 'result', label: 'Result' },
  ];
  const stepIndex = steps.findIndex((s) => s.key === step);

  // ---- Render -----------------------------------------------------------

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            Import {config.displayNamePlural} from CSV
          </DialogTitle>
          <DialogDescription>
            Upload a CSV file to bulk-import {config.displayNamePlural.toLowerCase()}.
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-2 px-2">
          {steps.map((s, i) => (
            <div key={s.key} className="flex items-center gap-2">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium ${
                  i < stepIndex
                    ? 'bg-primary text-primary-foreground'
                    : i === stepIndex
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                }`}
              >
                {i < stepIndex ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  i + 1
                )}
              </div>
              <span
                className={`text-xs ${
                  i === stepIndex ? 'font-medium' : 'text-muted-foreground'
                }`}
              >
                {s.label}
              </span>
              {i < steps.length - 1 && (
                <div className="mx-1 h-px w-8 bg-muted" />
              )}
            </div>
          ))}
        </div>

        <Progress value={((stepIndex + 1) / steps.length) * 100} className="h-1" />

        {/* Step content */}
        <div className="min-h-[300px]">
          {step === 'upload' && renderUpload()}
          {step === 'mapping' && renderMapping()}
          {step === 'preview' && renderPreview()}
          {step === 'result' && renderResult()}
        </div>

        {/* Footer */}
        <DialogFooter>
          {step === 'mapping' && (
            <>
              <Button variant="outline" onClick={() => setStep('upload')}>
                Back
              </Button>
              <Button onClick={handlePreview} disabled={!mappings.some((m) => m.entityField)}>
                Preview
              </Button>
            </>
          )}
          {step === 'preview' && (
            <>
              <Button variant="outline" onClick={() => setStep('mapping')}>
                Back
              </Button>
              <Button onClick={handleImport} disabled={importing}>
                {importing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Import {csvRows.length} Rows
              </Button>
            </>
          )}
          {step === 'result' && (
            <Button
              onClick={() => {
                handleClose();
                if (importResult && importResult.success > 0) {
                  onSuccess();
                }
              }}
            >
              {importResult && importResult.success > 0 ? (
                <>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Done
                </>
              ) : (
                <>
                  <XCircle className="mr-2 h-4 w-4" />
                  Close
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
