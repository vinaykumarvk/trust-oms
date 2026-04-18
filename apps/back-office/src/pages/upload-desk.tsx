/**
 * Bulk Upload Desk — Phase 3E (BRD Screen #23)
 *
 * Three-tab interface for managing bulk upload batches:
 *   1. Active Batches — live table with lifecycle actions
 *   2. Upload New — create batch and validate rows
 *   3. History — completed and rolled-back batches
 *
 * Auto-refreshes every 15 seconds.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@ui/lib/queryClient";
import { apiUrl } from "@ui/lib/api-url";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@ui/components/ui/card";
import { Badge } from "@ui/components/ui/badge";
import { Button } from "@ui/components/ui/button";
import { Input } from "@ui/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@ui/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from "@ui/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@ui/components/ui/select";
import { Skeleton } from "@ui/components/ui/skeleton";
import { Separator } from "@ui/components/ui/separator";
import {
  Upload, FileUp, Clock, Loader2, CheckCircle, AlertTriangle,
  RotateCcw, FileSearch, RefreshCw, ShieldCheck, History,
} from "lucide-react";

// -- Types --
interface UploadBatch {
  id: number; filename: string | null; row_count: number | null;
  accepted_rows: number | null; rejected_rows: number | null;
  error_report_url: string | null; upload_status: string | null;
  uploaded_by: number | null; authorized_by: number | null;
  rollback_status: string | null; created_at: string; updated_at: string;
}
interface BatchListResponse { data: UploadBatch[]; total: number; page: number; pageSize: number }
interface BatchStatusResponse { batchId: number; status: string; rowCount: number; acceptedRows: number; rejectedRows: number }
interface ErrorReportResponse { data: { batchId: number; filename: string | null; totalErrors: number; errors: Array<{ row: number; field: string; message: string }> } }

// -- Constants & Helpers --
const STATUS_CFG: Record<string, { label: string; color: string }> = {
  CREATED: { label: "Created", color: "bg-muted text-foreground" },
  VALIDATING: { label: "Validating", color: "bg-blue-100 text-blue-800" },
  VALIDATED: { label: "Validated", color: "bg-cyan-100 text-cyan-800" },
  SUBMITTED: { label: "Submitted", color: "bg-yellow-100 text-yellow-800" },
  AUTHORIZED: { label: "Authorized", color: "bg-green-100 text-green-800" },
  ROLLED_BACK: { label: "Rolled Back", color: "bg-red-100 text-red-800" },
  ERROR: { label: "Error", color: "bg-red-100 text-red-800" },
};
const ACTIVE_STATUSES = ["CREATED", "VALIDATING", "VALIDATED", "SUBMITTED"];
const HISTORY_STATUSES = ["AUTHORIZED", "ROLLED_BACK", "ERROR"];
const ENTITY_TYPES = [
  { value: "TRADE", label: "Trade Orders" },
  { value: "CLIENT", label: "Client Records" },
  { value: "PORTFOLIO", label: "Portfolio Holdings" },
  { value: "SECURITY", label: "Security Master" },
  { value: "CASH", label: "Cash Movements" },
];

function fmtDateTime(d: string | null): string {
  if (!d) return "-";
  try {
    return new Date(d).toLocaleString("en-PH", {
      month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch { return d; }
}

function StatusBadge({ s }: { s: string }) {
  const c = STATUS_CFG[s] ?? { label: s, color: "bg-muted text-foreground" };
  return <Badge className={c.color}>{c.label}</Badge>;
}

function SummaryCard({ title, value, icon: Icon, accent }: {
  title: string; value: number | string; icon: React.ElementType; accent: string;
}) {
  return (
    <Card><CardContent className="pt-6"><div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <p className="mt-1 text-3xl font-bold text-foreground">{value}</p>
      </div>
      <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${accent}`}>
        <Icon className="h-5 w-5 text-white" />
      </div>
    </div></CardContent></Card>
  );
}

// -- Error Report Dialog --
function ErrorReportDialog({ open, batchId, onClose }: {
  open: boolean; batchId: number | null; onClose: () => void;
}) {
  const q = useQuery<ErrorReportResponse>({
    queryKey: ["batch-errors", batchId],
    queryFn: () => apiRequest("GET", apiUrl(`/api/v1/uploads/${batchId}/errors`)),
    enabled: open && batchId !== null,
  });
  const r = q.data?.data;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Error Report — Batch #{batchId}</DialogTitle>
          <DialogDescription>
            {r ? `${r.totalErrors} error(s) in ${r.filename ?? "unknown file"}` : "Loading..."}
          </DialogDescription>
        </DialogHeader>
        {q.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}
          </div>
        ) : !r || r.errors.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No errors found.</p>
        ) : (
          <div className="max-h-80 overflow-y-auto overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Row</TableHead>
                  <TableHead className="w-32">Field</TableHead>
                  <TableHead>Message</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {r.errors.map((e, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono text-xs">{e.row}</TableCell>
                    <TableCell className="font-mono text-xs">{e.field}</TableCell>
                    <TableCell className="text-xs">{e.message}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// -- Main Component --
export default function UploadDesk() {
  const qc = useQueryClient();
  const [tab, setTab] = useState("active");
  const [page, setPage] = useState(1);
  const [hPage, setHPage] = useState(1);
  const pageSize = 25;
  const [rollbackId, setRollbackId] = useState<number | null>(null);
  const [errorId, setErrorId] = useState<number | null>(null);

  // Upload New form
  const [fname, setFname] = useState("");
  const [rowCnt, setRowCnt] = useState("");
  const [entType, setEntType] = useState("TRADE");
  const [createdId, setCreatedId] = useState<number | null>(null);

  // --- Queries ---
  const activeQ = useQuery<BatchListResponse>({
    queryKey: ["upload-batches", "active", page],
    queryFn: () => {
      const p = new URLSearchParams();
      p.set("status", ACTIVE_STATUSES.join(","));
      p.set("page", String(page));
      p.set("pageSize", String(pageSize));
      return apiRequest("GET", apiUrl(`/api/v1/uploads?${p.toString()}`));
    },
    refetchInterval: 15_000,
  });

  const historyQ = useQuery<BatchListResponse>({
    queryKey: ["upload-batches", "history", hPage],
    queryFn: () => {
      const p = new URLSearchParams();
      p.set("status", HISTORY_STATUSES.join(","));
      p.set("page", String(hPage));
      p.set("pageSize", String(pageSize));
      return apiRequest("GET", apiUrl(`/api/v1/uploads?${p.toString()}`));
    },
    refetchInterval: 15_000,
    enabled: tab === "history",
  });

  const statusQ = useQuery<BatchStatusResponse>({
    queryKey: ["batch-status", createdId],
    queryFn: () => apiRequest("GET", apiUrl(`/api/v1/uploads/${createdId}/status`)),
    enabled: createdId !== null,
    refetchInterval: 15_000,
  });

  const active = activeQ.data?.data ?? [];
  const aTotal = activeQ.data?.total ?? 0;
  const hist = historyQ.data?.data ?? [];
  const hTotal = historyQ.data?.total ?? 0;
  const aTotalPg = Math.ceil(aTotal / pageSize) || 1;
  const hTotalPg = Math.ceil(hTotal / pageSize) || 1;

  const pendingVal = active.filter((b) => b.upload_status === "CREATED").length;
  const awaitAuth = active.filter((b) => b.upload_status === "SUBMITTED").length;
  const doneToday = hist.filter((b) => {
    try {
      return b.upload_status === "AUTHORIZED" &&
        new Date(b.updated_at).toDateString() === new Date().toDateString();
    } catch { return false; }
  }).length;

  // --- Mutations ---
  const createM = useMutation({
    mutationFn: (d: { filename: string; rowCount: number; uploadedBy: number }) =>
      apiRequest("POST", apiUrl("/api/v1/uploads"), d),
    onSuccess: (r: { id: number }) => {
      setCreatedId(r.id ?? null);
      qc.invalidateQueries({ queryKey: ["upload-batches"] });
    },
  });

  const validateM = useMutation({
    mutationFn: (id: number) =>
      apiRequest("POST", apiUrl(`/api/v1/uploads/${id}/validate`), {
        rows: Array.from({ length: 5 }, (_, i) => ({
          row_number: i + 1,
          account_id: `ACC-${String(i + 1).padStart(4, "0")}`,
          amount: String((i + 1) * 1000),
          currency: "PHP",
          entity_type: entType,
        })),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["upload-batches"] });
      qc.invalidateQueries({ queryKey: ["batch-status"] });
    },
  });

  const submitM = useMutation({
    mutationFn: (id: number) =>
      apiRequest("POST", apiUrl(`/api/v1/uploads/${id}/submit`)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["upload-batches"] }),
  });

  const authM = useMutation({
    mutationFn: (id: number) =>
      apiRequest("POST", apiUrl(`/api/v1/uploads/${id}/authorize`), { authorizedBy: 2 }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["upload-batches"] }),
  });

  const rollM = useMutation({
    mutationFn: (id: number) =>
      apiRequest("POST", apiUrl(`/api/v1/uploads/${id}/rollback`)),
    onSuccess: () => {
      setRollbackId(null);
      qc.invalidateQueries({ queryKey: ["upload-batches"] });
    },
  });

  // --- Inline helpers ---
  function renderActions(b: UploadBatch) {
    const s = b.upload_status ?? "CREATED";
    return (
      <div className="flex items-center gap-1">
        {s === "CREATED" && <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => validateM.mutate(b.id)} disabled={validateM.isPending}><CheckCircle className="mr-1 h-3 w-3" />Validate</Button>}
        {s === "VALIDATED" && <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => submitM.mutate(b.id)} disabled={submitM.isPending}><FileUp className="mr-1 h-3 w-3" />Submit</Button>}
        {s === "SUBMITTED" && <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => authM.mutate(b.id)} disabled={authM.isPending}><ShieldCheck className="mr-1 h-3 w-3" />Authorize</Button>}
        {(s === "AUTHORIZED" || s === "SUBMITTED") && !b.rollback_status && <Button variant="destructive" size="sm" className="h-7 text-xs" onClick={() => setRollbackId(b.id)}><RotateCcw className="mr-1 h-3 w-3" />Rollback</Button>}
        {(s === "ERROR" || (b.rejected_rows ?? 0) > 0) && <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setErrorId(b.id)}><FileSearch className="mr-1 h-3 w-3" />Errors</Button>}
      </div>
    );
  }

  function renderBatchTable(batches: UploadBatch[], loading: boolean) {
    return (
      <div className="overflow-x-auto rounded-md border"><Table>
        <TableHeader><TableRow>
          <TableHead className="w-16">ID</TableHead><TableHead>Filename</TableHead>
          <TableHead className="w-20">Rows</TableHead><TableHead>Status</TableHead>
          <TableHead>Uploaded By</TableHead><TableHead>Date</TableHead>
          <TableHead className="w-56">Actions</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {loading ? Array.from({ length: 5 }).map((_, i) => (
            <TableRow key={i}>{Array.from({ length: 7 }).map((_, j) => (
              <TableCell key={j}><Skeleton className="h-4 w-16" /></TableCell>
            ))}</TableRow>
          )) : batches.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground py-8">No batches found</TableCell>
            </TableRow>
          ) : batches.map((b) => (
            <TableRow key={b.id}>
              <TableCell className="font-mono text-xs">{b.id}</TableCell>
              <TableCell className="text-sm">{b.filename ?? "-"}</TableCell>
              <TableCell className="font-mono text-sm">{b.row_count ?? 0}</TableCell>
              <TableCell>
                <StatusBadge s={b.upload_status ?? "CREATED"} />
                {b.rollback_status && <Badge className="ml-1 bg-orange-100 text-orange-800">{b.rollback_status}</Badge>}
              </TableCell>
              <TableCell className="text-sm">{b.uploaded_by ? `User #${b.uploaded_by}` : "-"}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{fmtDateTime(b.created_at)}</TableCell>
              <TableCell>{renderActions(b)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table></div>
    );
  }

  function renderPager(cur: number, total: number, pages: number, set: (fn: (p: number) => number) => void) {
    if (pages <= 1) return null;
    return (
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Showing {(cur - 1) * pageSize + 1}-{Math.min(cur * pageSize, total)} of {total}</p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={cur <= 1} onClick={() => set((p) => p - 1)}>Previous</Button>
          <span className="text-sm text-muted-foreground">Page {cur} of {pages}</span>
          <Button variant="outline" size="sm" disabled={cur >= pages} onClick={() => set((p) => p + 1)}>Next</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Upload className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Bulk Upload Desk</h1>
            <p className="text-sm text-muted-foreground">Manage bulk upload batches with validation and authorization</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => { activeQ.refetch(); historyQ.refetch(); }} disabled={activeQ.isFetching}>
          <RefreshCw className={`h-4 w-4 ${activeQ.isFetching ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard title="Total Batches" value={aTotal + hTotal} icon={FileUp} accent="bg-indigo-600" />
        <SummaryCard title="Pending Validation" value={pendingVal} icon={Clock} accent="bg-blue-600" />
        <SummaryCard title="Awaiting Auth" value={awaitAuth} icon={ShieldCheck} accent="bg-yellow-500" />
        <SummaryCard title="Completed Today" value={doneToday} icon={CheckCircle} accent="bg-green-600" />
      </div>

      <Separator />

      {/* Tabs */}
      <Tabs value={tab} onValueChange={(v) => { setTab(v); setPage(1); setHPage(1); }}>
        <TabsList>
          <TabsTrigger value="active"><FileUp className="mr-1 h-4 w-4" />Active Batches</TabsTrigger>
          <TabsTrigger value="upload"><Upload className="mr-1 h-4 w-4" />Upload New</TabsTrigger>
          <TabsTrigger value="history"><History className="mr-1 h-4 w-4" />History</TabsTrigger>
        </TabsList>

        {/* Active Batches Tab */}
        <TabsContent value="active" className="mt-4 space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground">Active Batches ({aTotal} total)</h3>
          {renderBatchTable(active, activeQ.isLoading)}
          {renderPager(page, aTotal, aTotalPg, setPage)}
        </TabsContent>

        {/* Upload New Tab */}
        <TabsContent value="upload" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Create New Batch</CardTitle>
              <CardDescription>Provide file details to register a new upload batch</CardDescription>
            </CardHeader>
            <CardContent>
              {!createdId ? (
                <div className="flex flex-col items-center justify-center py-8 border-2 border-dashed rounded-lg">
                  <FileUp className="h-10 w-10 mb-3 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground mb-6">Drag and drop files here, or fill in details below</p>
                  <div className="flex flex-wrap items-end justify-center gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-medium">Filename</label>
                      <Input value={fname} onChange={(e) => setFname(e.target.value)}
                        placeholder="e.g. batch_2026_q1.csv" className="w-56" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium">Row Count</label>
                      <Input value={rowCnt} onChange={(e) => setRowCnt(e.target.value)}
                        placeholder="e.g. 500" type="number" min={1} className="w-28" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium">Entity Type</label>
                      <Select value={entType} onValueChange={setEntType}>
                        <SelectTrigger className="w-44"><SelectValue placeholder="Select type" /></SelectTrigger>
                        <SelectContent>
                          {ENTITY_TYPES.map((t) => (
                            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      onClick={() => {
                        const n = parseInt(rowCnt, 10);
                        if (fname.trim() && n > 0)
                          createM.mutate({ filename: fname.trim(), rowCount: n, uploadedBy: 1 });
                      }}
                      disabled={!fname.trim() || !rowCnt.trim() || createM.isPending}
                    >
                      {createM.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Create Batch
                    </Button>
                  </div>
                  {createM.isError && (
                    <p className="mt-3 text-sm text-red-600 flex items-center gap-1">
                      <AlertTriangle className="h-4 w-4" />Failed to create batch.
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Success banner */}
                  <div className="flex items-center justify-between rounded-lg border p-4 bg-green-50">
                    <div className="flex items-center gap-3">
                      <CheckCircle className="h-5 w-5 text-green-600" />
                      <div>
                        <p className="text-sm font-medium">Batch #{createdId} created</p>
                        <p className="text-xs text-muted-foreground">{fname} — {rowCnt} rows — {entType}</p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => {
                      setFname(""); setRowCnt(""); setEntType("TRADE"); setCreatedId(null);
                    }}>New Batch</Button>
                  </div>

                  {/* Batch status */}
                  {statusQ.data && (
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-lg border p-3">
                        <p className="text-xs text-muted-foreground">Status</p>
                        <StatusBadge s={statusQ.data.status} />
                      </div>
                      <div className="rounded-lg border p-3">
                        <p className="text-xs text-muted-foreground">Accepted</p>
                        <p className="text-lg font-bold text-green-700">{statusQ.data.acceptedRows}</p>
                      </div>
                      <div className="rounded-lg border p-3">
                        <p className="text-xs text-muted-foreground">Rejected</p>
                        <p className="text-lg font-bold text-red-700">{statusQ.data.rejectedRows}</p>
                      </div>
                    </div>
                  )}

                  {/* Row preview & validate */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm">Simulated Row Preview</CardTitle>
                      <CardDescription>Sample rows sent for validation</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto rounded-md border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Row</TableHead><TableHead>Account ID</TableHead>
                              <TableHead>Amount</TableHead><TableHead>Currency</TableHead>
                              <TableHead>Entity Type</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {Array.from({ length: 5 }, (_, i) => (
                              <TableRow key={i}>
                                <TableCell className="font-mono text-xs">{i + 1}</TableCell>
                                <TableCell className="font-mono text-xs">ACC-{String(i + 1).padStart(4, "0")}</TableCell>
                                <TableCell className="font-mono text-xs">{((i + 1) * 1000).toLocaleString("en-PH")}</TableCell>
                                <TableCell className="text-xs">PHP</TableCell>
                                <TableCell className="text-xs">{entType}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                      <div className="mt-4 flex items-center gap-2">
                        <Button onClick={() => validateM.mutate(createdId!)} disabled={validateM.isPending}>
                          {validateM.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          <CheckCircle className="mr-2 h-4 w-4" />Validate Batch
                        </Button>
                        {validateM.isSuccess && <span className="text-sm text-green-600 flex items-center gap-1"><CheckCircle className="h-4 w-4" />Validation submitted</span>}
                        {validateM.isError && <span className="text-sm text-red-600 flex items-center gap-1"><AlertTriangle className="h-4 w-4" />Validation failed</span>}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="mt-4 space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground">Completed & Rolled-Back Batches ({hTotal} total)</h3>
          {renderBatchTable(hist, historyQ.isLoading)}
          {renderPager(hPage, hTotal, hTotalPg, setHPage)}
        </TabsContent>
      </Tabs>

      {/* Rollback Dialog */}
      <Dialog open={rollbackId !== null} onOpenChange={(o) => { if (!o) setRollbackId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Rollback</DialogTitle>
            <DialogDescription>
              Are you sure you want to rollback batch #{rollbackId}? This will undo all processed records.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRollbackId(null)} disabled={rollM.isPending}>Cancel</Button>
            <Button variant="destructive" disabled={rollM.isPending}
              onClick={() => { if (rollbackId !== null) rollM.mutate(rollbackId); }}>
              {rollM.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Rollback
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Error Report Dialog */}
      <ErrorReportDialog open={errorId !== null} batchId={errorId} onClose={() => setErrorId(null)} />
    </div>
  );
}
