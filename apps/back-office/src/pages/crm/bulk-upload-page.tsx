/**
 * Bulk Upload Page (Handover & Assignment Management)
 *
 * CSV-driven bulk handover creation workflow. Supports:
 *   - CSV file selection and parsing
 *   - Preview step: POST /api/v1/ham/bulk-upload/preview with parsed rows
 *     Shows validation results (valid/invalid badges, errors, delegation warnings)
 *   - Submit step: POST /api/v1/ham/bulk-upload with validated rows
 *     Shows success/failure counts
 *   - Upload log lookup: GET /api/v1/ham/upload-log/:id
 *   - Loading, error, and success states throughout
 *
 * API base: /api/v1/ham
 */

import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@ui/components/ui/card";
import { Button } from "@ui/components/ui/button";
import { Input } from "@ui/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ui/components/ui/table";
import { Badge } from "@ui/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ui/components/ui/select";
import { toast } from "sonner";
import { SkeletonRows } from '@/components/ui/skeleton-rows';

/* ---------- Auth helpers ---------- */

function getToken(): string {
  try {
    const stored = localStorage.getItem('trustoms-user');
    if (stored) {
      const parsed = JSON.parse(stored);
      return parsed.token || '';
    }
  } catch { /* ignored */ }
  return '';
}

/* ---------- API base ---------- */

const API_BASE = "/api/v1/ham";

/* ---------- Types ---------- */

/** A single row parsed from the CSV file. */
interface CsvRow {
  entity_id: string;
  entity_name: string;
  entity_type: string;
  incoming_rm_id: string;
  reason: string;
  [key: string]: string;
}

/** A row returned from the preview endpoint with validation results. */
interface PreviewRow {
  row_number: number;
  entity_id: string;
  entity_name: string;
  valid: boolean;
  errors: string[];
  has_active_delegation: boolean;
}

interface PreviewResponse {
  rows: PreviewRow[];
  total: number;
  valid_count: number;
  error_count: number;
}

interface SubmitResponse {
  upload_id: string;
  success_count: number;
  failure_count: number;
  errors: Array<{ row_number: number; error: string }>;
}

/** Upload log record returned from the lookup endpoint. */
interface UploadLogRecord {
  id: string;
  uploaded_by: string;
  uploaded_at: string;
  filename: string;
  total_rows: number;
  success_count: number;
  failure_count: number;
  status: string;
  rows: Array<{
    row_number: number;
    entity_id: string;
    entity_name: string;
    status: string;
    error: string | null;
  }>;
}

/* ---------- Helpers ---------- */

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${getToken()}`,
    "Content-Type": "application/json",
  };
  const res = await fetch(url, { headers, ...options });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error ||
        `Request failed with status ${res.status}`
    );
  }
  return res.json() as Promise<T>;
}

function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  try {
    const d = new Date(dateStr);
    return (
      d.toLocaleDateString("en-PH", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }) +
      " " +
      d.toLocaleTimeString("en-PH", {
        hour: "2-digit",
        minute: "2-digit",
      })
    );
  } catch {
    return dateStr;
  }
}

/**
 * Parse a CSV string into an array of objects.
 * Expects the first row to be a header row.
 */
function parseCsv(text: string): CsvRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) return [];

  const headerLine = lines[0];
  const columnHeaders = headerLine.split(",").map((h) => h.trim());

  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map((v) => v.trim());
    const row: Record<string, string> = {};
    for (let j = 0; j < columnHeaders.length; j++) {
      row[columnHeaders[j]] = values[j] ?? "";
    }
    rows.push(row as CsvRow);
  }

  return rows;
}

/* ---------- Step type ---------- */

type WorkflowStep = "upload" | "preview" | "submitted";

/* ---------- Component ---------- */

export default function BulkUploadPage() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Workflow state
  const [step, setStep] = useState<WorkflowStep>("upload");

  // Upload step state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<CsvRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);

  // Preview step state
  const [previewData, setPreviewData] = useState<PreviewResponse | null>(null);

  // Submit step state
  const [submitResult, setSubmitResult] = useState<SubmitResponse | null>(null);

  // Upload log lookup state
  const [logId, setLogId] = useState("");
  const [logLookupEnabled, setLogLookupEnabled] = useState(false);

  /* ---------- File handling ---------- */

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
    setParsedRows([]);
    setParseError(null);
    setPreviewData(null);
    setSubmitResult(null);
    setStep("upload");
  }

  function handleParse() {
    if (!selectedFile) {
      toast.error("Please select a CSV file first");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const rows = parseCsv(text);
        if (rows.length === 0) {
          setParseError(
            "No data rows found in the CSV. Ensure the file has a header row and at least one data row."
          );
          setParsedRows([]);
          return;
        }
        setParsedRows(rows);
        setParseError(null);
        toast.success(`Parsed ${rows.length} row(s) from CSV`);
      } catch (err) {
        setParseError(
          err instanceof Error ? err.message : "Failed to parse CSV"
        );
        setParsedRows([]);
      }
    };
    reader.onerror = () => {
      setParseError("Failed to read the file");
      setParsedRows([]);
    };
    reader.readAsText(selectedFile);
  }

  /* ---------- Preview mutation ---------- */

  const previewMutation = useMutation({
    mutationFn: (rows: CsvRow[]) =>
      apiFetch<PreviewResponse>(`${API_BASE}/bulk-upload/preview`, {
        method: "POST",
        body: JSON.stringify({ rows }),
      }),
    onSuccess: (data) => {
      setPreviewData(data);
      setStep("preview");
      toast.success("Preview generated successfully");
    },
    onError: (err: Error) => {
      toast.error(`Preview failed: ${err.message}`);
    },
  });

  function handlePreview() {
    if (parsedRows.length === 0) {
      toast.error("No parsed rows to preview. Please parse a CSV file first.");
      return;
    }
    previewMutation.mutate(parsedRows);
  }

  /* ---------- Submit mutation ---------- */

  const submitMutation = useMutation({
    mutationFn: (rows: CsvRow[]) =>
      apiFetch<SubmitResponse>(`${API_BASE}/bulk-upload`, {
        method: "POST",
        body: JSON.stringify({ rows }),
      }),
    onSuccess: (data) => {
      setSubmitResult(data);
      setStep("submitted");
      queryClient.invalidateQueries({ queryKey: ["ham-history"] });
      if (data.failure_count === 0) {
        toast.success(
          `Bulk upload complete: ${data.success_count} handover(s) created`
        );
      } else {
        toast.warning(
          `Bulk upload complete: ${data.success_count} succeeded, ${data.failure_count} failed`
        );
      }
    },
    onError: (err: Error) => {
      toast.error(`Bulk upload failed: ${err.message}`);
    },
  });

  function handleSubmit() {
    if (parsedRows.length === 0) return;
    submitMutation.mutate(parsedRows);
  }

  /* ---------- Reset ---------- */

  function handleReset() {
    setSelectedFile(null);
    setParsedRows([]);
    setParseError(null);
    setPreviewData(null);
    setSubmitResult(null);
    setStep("upload");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  /* ---------- Upload log lookup ---------- */

  const {
    data: logData,
    isPending: logPending,
    isError: logError,
    error: logErrorObj,
  } = useQuery<UploadLogRecord>({
    queryKey: ["ham-upload-log", logId],
    queryFn: () => apiFetch<UploadLogRecord>(`${API_BASE}/upload-log/${logId}`),
    enabled: logLookupEnabled && logId.trim().length > 0,
  });

  function handleLogLookup() {
    if (!logId.trim()) {
      toast.error("Please enter an upload log ID");
      return;
    }
    setLogLookupEnabled(true);
  }

  /* ---------- Render ---------- */

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Bulk Handover Upload
        </h1>
        <p className="text-sm text-muted-foreground">
          Upload a CSV file to create multiple handover requests at once
        </p>
      </div>

      {/* Step 1: Upload Area */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            Step 1: Select &amp; Parse CSV
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                CSV File
              </label>
              <Input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileChange}
                className="max-w-sm"
              />
            </div>
            <Button
              size="sm"
              onClick={handleParse}
              disabled={!selectedFile}
            >
              Parse CSV
            </Button>
          </div>

          {parseError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {parseError}
            </div>
          )}

          {parsedRows.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Parsed <span className="font-medium">{parsedRows.length}</span>{" "}
                row(s) from{" "}
                <span className="font-mono">{selectedFile?.name}</span>
              </p>
              <div className="flex items-center gap-3">
                <Button
                  size="sm"
                  onClick={handlePreview}
                  disabled={previewMutation.isPending}
                >
                  {previewMutation.isPending
                    ? "Validating..."
                    : "Validate & Preview"}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 2: Preview Results */}
      {step === "preview" && previewData && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Step 2: Preview &amp; Validate
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-md border bg-muted/30 p-4 text-center">
                <p className="text-sm text-muted-foreground">Total Rows</p>
                <p className="text-2xl font-bold">{previewData.total}</p>
              </div>
              <div className="rounded-md border bg-green-50 dark:bg-green-950 p-4 text-center">
                <p className="text-sm text-green-700 dark:text-green-300">
                  Valid
                </p>
                <p className="text-2xl font-bold text-green-700 dark:text-green-300">
                  {previewData.valid_count}
                </p>
              </div>
              <div className="rounded-md border bg-red-50 dark:bg-red-950 p-4 text-center">
                <p className="text-sm text-red-700 dark:text-red-300">
                  Errors
                </p>
                <p className="text-2xl font-bold text-red-700 dark:text-red-300">
                  {previewData.error_count}
                </p>
              </div>
            </div>

            {/* Preview Table */}
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Row #</TableHead>
                    <TableHead>Entity ID</TableHead>
                    <TableHead>Entity Name</TableHead>
                    <TableHead className="w-20">Valid</TableHead>
                    <TableHead>Errors</TableHead>
                    <TableHead className="w-28">Delegation</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewData.rows.map((row) => (
                    <TableRow key={row.row_number}>
                      <TableCell className="font-mono text-sm">
                        {row.row_number}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {row.entity_id}
                      </TableCell>
                      <TableCell className="text-sm">
                        {row.entity_name}
                      </TableCell>
                      <TableCell>
                        {row.valid ? (
                          <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                            Valid
                          </Badge>
                        ) : (
                          <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                            Invalid
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {row.errors.length > 0 ? (
                          <ul className="list-disc list-inside text-xs text-destructive space-y-0.5">
                            {row.errors.map((err, idx) => (
                              <li key={idx}>{err}</li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            -
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {row.has_active_delegation && (
                          <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                            Active
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Submit / Reset actions */}
            <div className="flex items-center gap-3">
              <Button
                onClick={handleSubmit}
                disabled={
                  submitMutation.isPending || previewData.valid_count === 0
                }
              >
                {submitMutation.isPending
                  ? "Submitting..."
                  : `Submit ${previewData.valid_count} Valid Row(s)`}
              </Button>
              <Button variant="outline" onClick={handleReset}>
                Start Over
              </Button>
            </div>
            {previewData.error_count > 0 && previewData.valid_count > 0 && (
              <p className="text-xs text-muted-foreground">
                Only the {previewData.valid_count} valid row(s) will be
                submitted. Rows with errors will be skipped.
              </p>
            )}
            {previewData.valid_count === 0 && (
              <p className="text-sm text-destructive">
                No valid rows to submit. Please fix the errors in your CSV and
                try again.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 3: Submission Results */}
      {step === "submitted" && submitResult && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Step 3: Upload Results
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-md border bg-muted/30 p-4 text-center">
                <p className="text-sm text-muted-foreground">Upload ID</p>
                <p className="text-lg font-bold font-mono">
                  {submitResult.upload_id}
                </p>
              </div>
              <div className="rounded-md border bg-green-50 dark:bg-green-950 p-4 text-center">
                <p className="text-sm text-green-700 dark:text-green-300">
                  Succeeded
                </p>
                <p className="text-2xl font-bold text-green-700 dark:text-green-300">
                  {submitResult.success_count}
                </p>
              </div>
              <div className="rounded-md border bg-red-50 dark:bg-red-950 p-4 text-center">
                <p className="text-sm text-red-700 dark:text-red-300">
                  Failed
                </p>
                <p className="text-2xl font-bold text-red-700 dark:text-red-300">
                  {submitResult.failure_count}
                </p>
              </div>
            </div>

            {/* Errors list */}
            {submitResult.errors.length > 0 && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4">
                <p className="text-sm font-medium text-destructive mb-2">
                  Errors ({submitResult.errors.length})
                </p>
                <ul className="list-disc list-inside text-xs text-destructive space-y-1">
                  {submitResult.errors.map((err, idx) => (
                    <li key={idx}>
                      Row {err.row_number}: {err.error}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <Button variant="outline" onClick={handleReset}>
              Upload Another File
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Upload Log Lookup */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Upload Log Lookup</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Upload Log ID
              </label>
              <Input
                placeholder="e.g. UPL-20260423-001"
                value={logId}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  setLogId(e.target.value);
                  setLogLookupEnabled(false);
                }}
                className="w-[280px]"
              />
            </div>
            <Button
              size="sm"
              onClick={handleLogLookup}
              disabled={!logId.trim()}
            >
              Look Up
            </Button>
          </div>

          {/* Log lookup results */}
          {logLookupEnabled && logId.trim() && (
            <>
              {logPending && (
                <div className="space-y-3">
                  <div className="h-5 w-48 animate-pulse rounded bg-muted" />
                  <div className="rounded-md border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Row #</TableHead>
                          <TableHead>Entity ID</TableHead>
                          <TableHead>Entity Name</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Error</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <SkeletonRows cols={5} rows={4} />
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {logError && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                  Failed to load upload log:{" "}
                  {(logErrorObj as Error)?.message ?? "Unknown error"}
                </div>
              )}

              {logData && !logPending && !logError && (
                <div className="space-y-4">
                  {/* Log metadata */}
                  <div className="grid grid-cols-2 gap-4 rounded-md border bg-muted/30 p-4 text-sm sm:grid-cols-3 lg:grid-cols-6">
                    <div>
                      <p className="text-muted-foreground">Log ID</p>
                      <p className="font-mono font-medium">{logData.id}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Uploaded By</p>
                      <p className="font-medium">{logData.uploaded_by}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Date</p>
                      <p className="font-medium">
                        {formatDateTime(logData.uploaded_at)}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Filename</p>
                      <p className="font-mono text-xs">{logData.filename}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Status</p>
                      <Badge
                        variant="secondary"
                        className={
                          logData.status === "COMPLETED"
                            ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                            : logData.status === "FAILED"
                              ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                              : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                        }
                      >
                        {logData.status}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Results</p>
                      <p className="font-medium">
                        {logData.success_count} OK / {logData.failure_count}{" "}
                        Failed / {logData.total_rows} Total
                      </p>
                    </div>
                  </div>

                  {/* Log rows table */}
                  {logData.rows && logData.rows.length > 0 && (
                    <div className="rounded-md border overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-16">Row #</TableHead>
                            <TableHead>Entity ID</TableHead>
                            <TableHead>Entity Name</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Error</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {logData.rows.map((row) => (
                            <TableRow key={row.row_number}>
                              <TableCell className="font-mono text-sm">
                                {row.row_number}
                              </TableCell>
                              <TableCell className="font-mono text-sm">
                                {row.entity_id}
                              </TableCell>
                              <TableCell className="text-sm">
                                {row.entity_name}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant="secondary"
                                  className={
                                    row.status === "SUCCESS"
                                      ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                                      : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                                  }
                                >
                                  {row.status}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs text-destructive">
                                {row.error ?? (
                                  <span className="text-muted-foreground">
                                    -
                                  </span>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
