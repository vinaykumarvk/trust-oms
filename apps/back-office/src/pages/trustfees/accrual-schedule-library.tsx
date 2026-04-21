/**
 * Accrual Schedule Library — TrustFees Pro Phase 4
 *
 * Full-featured library view for accrual schedule definitions.
 * Supports CRUD, lifecycle (Submit/Approve/Reject/Retire),
 * frequency validation, and dark mode.
 * Auto-refreshes every 30s.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@ui/lib/queryClient";
import { apiUrl } from "@ui/lib/api-url";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/ui/card";
import { Badge } from "@ui/components/ui/badge";
import { Button } from "@ui/components/ui/button";
import { Input } from "@ui/components/ui/input";
import { Separator } from "@ui/components/ui/separator";
import { Skeleton } from "@ui/components/ui/skeleton";
import { Switch } from "@ui/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@ui/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ui/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@ui/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@ui/components/ui/dropdown-menu";
import { CalendarClock, RefreshCw, Plus, MoreHorizontal, Send, CheckCircle, XCircle, Archive, Clock, Shield } from "lucide-react";

/* ---------- Types ---------- */
interface AccrualSchedule {
  id: number;
  schedule_code: string;
  schedule_name: string;
  accrual_enabled: boolean;
  accrual_frequency: string | null;
  accrual_method: string | null;
  basis_frequency: string | null;
  accounting_enabled: boolean;
  accounting_frequency: string | null;
  invoice_frequency: string | null;
  due_date_offset_days: number;
  reversal_enabled: boolean;
  reversal_age_days: number | null;
  recovery_mode: string | null;
  recovery_frequency: string | null;
  upfront_amortization: boolean;
  library_status: string;
  created_at: string;
  updated_at: string;
}

/* ---------- Constants ---------- */
const FREQUENCIES = ["DAILY", "MONTHLY", "QUARTERLY", "SEMI_ANNUAL", "ANNUAL"] as const;
const METHODS = ["ABSOLUTE", "AVERAGE", "ABSOLUTE_INCR", "AVERAGE_INCR"] as const;
const FREQ_ORDER: Record<string, number> = { DAILY: 0, MONTHLY: 1, QUARTERLY: 2, SEMI_ANNUAL: 3, ANNUAL: 4 };
const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  PENDING_APPROVAL: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  ACTIVE: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  RETIRED: "bg-gray-100 text-gray-600 dark:bg-gray-800/30 dark:text-gray-400",
};

const FREQ_LABELS: Record<string, string> = {
  DAILY: "Daily", MONTHLY: "Monthly", QUARTERLY: "Quarterly", SEMI_ANNUAL: "Semi-Annual", ANNUAL: "Annual",
};
const METHOD_LABELS: Record<string, string> = {
  ABSOLUTE: "Absolute", AVERAGE: "Average", ABSOLUTE_INCR: "Absolute Incremental", AVERAGE_INCR: "Average Incremental",
};

/* ---------- Helpers ---------- */
const bc = (map: Record<string, string>, key: string) => map[key] ?? "bg-muted text-foreground";

function SummaryCard({ title, value, icon: Icon, accent }: { title: string; value: string | number; icon: React.ElementType; accent: string }) {
  return (
    <Card><CardContent className="pt-6"><div className="flex items-center justify-between">
      <div><p className="text-sm font-medium text-muted-foreground">{title}</p><p className="mt-1 text-2xl font-bold">{value}</p></div>
      <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${accent}`}><Icon className="h-5 w-5 text-white" /></div>
    </div></CardContent></Card>
  );
}

function SkeletonRows({ cols, rows = 5 }: { cols: number; rows?: number }) {
  return <>{Array.from({ length: rows }).map((_, i) => (
    <TableRow key={i}>{Array.from({ length: cols }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-16" /></TableCell>)}</TableRow>
  ))}</>;
}

function EmptyRow({ cols, msg }: { cols: number; msg: string }) {
  return <TableRow><TableCell colSpan={cols} className="py-8 text-center text-muted-foreground">{msg}</TableCell></TableRow>;
}

/** Default empty form state */
const emptyForm = {
  schedule_code: "",
  schedule_name: "",
  accrual_enabled: true,
  accrual_frequency: "MONTHLY",
  accrual_method: "ABSOLUTE",
  basis_frequency: "",
  accounting_enabled: false,
  accounting_frequency: "",
  invoice_frequency: "MONTHLY",
  due_date_offset_days: 20,
  reversal_enabled: false,
  reversal_age_days: 0,
  recovery_mode: "USER",
  recovery_frequency: "",
  upfront_amortization: false,
};

/* ========== Main Component ========== */
export default function AccrualScheduleLibrary() {
  const qc = useQueryClient();
  const [dlgOpen, setDlgOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [search, setSearch] = useState("");

  // --- Queries ---
  const listQ = useQuery<{ data: AccrualSchedule[]; total: number }>({
    queryKey: ["accrual-schedules", statusFilter, search],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (search) params.set("search", search);
      params.set("pageSize", "100");
      return apiRequest("GET", apiUrl(`/api/v1/accrual-schedules?${params}`));
    },
    refetchInterval: 30_000,
  });

  const items = listQ.data?.data ?? [];
  const totalCount = listQ.data?.total ?? 0;
  const activeCount = items.filter((s) => s.library_status === "ACTIVE").length;
  const pendingCount = items.filter((s) => s.library_status === "PENDING_APPROVAL").length;

  // --- Mutations ---
  const createMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiRequest("POST", apiUrl("/api/v1/accrual-schedules"), body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["accrual-schedules"] }); closeDlg(); },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) => apiRequest("PUT", apiUrl(`/api/v1/accrual-schedules/${id}`), body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["accrual-schedules"] }); closeDlg(); },
  });

  const lifecycleMut = useMutation({
    mutationFn: ({ id, action }: { id: number; action: string }) => apiRequest("POST", apiUrl(`/api/v1/accrual-schedules/${id}/${action}`)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["accrual-schedules"] }); },
  });

  // --- Dialog helpers ---
  const openCreate = () => {
    setEditId(null);
    setForm({ ...emptyForm });
    setFormErrors([]);
    setDlgOpen(true);
  };

  const openEdit = (s: AccrualSchedule) => {
    setEditId(s.id);
    setForm({
      schedule_code: s.schedule_code,
      schedule_name: s.schedule_name,
      accrual_enabled: s.accrual_enabled,
      accrual_frequency: s.accrual_frequency ?? "MONTHLY",
      accrual_method: s.accrual_method ?? "ABSOLUTE",
      basis_frequency: s.basis_frequency ?? "",
      accounting_enabled: s.accounting_enabled,
      accounting_frequency: s.accounting_frequency ?? "",
      invoice_frequency: s.invoice_frequency ?? "MONTHLY",
      due_date_offset_days: s.due_date_offset_days,
      reversal_enabled: s.reversal_enabled,
      reversal_age_days: s.reversal_age_days ?? 0,
      recovery_mode: s.recovery_mode ?? "USER",
      recovery_frequency: s.recovery_frequency ?? "",
      upfront_amortization: s.upfront_amortization,
    });
    setFormErrors([]);
    setDlgOpen(true);
  };

  const closeDlg = () => { setDlgOpen(false); setEditId(null); setFormErrors([]); };

  /** Client-side frequency validation for inline errors */
  const validateForm = (): string[] => {
    const errors: string[] = [];
    if (form.accrual_enabled && !form.accrual_frequency) errors.push("Accrual frequency is required when accrual is enabled");
    if (form.accounting_enabled && !form.accounting_frequency) errors.push("Accounting frequency is required when accounting is enabled");
    if (form.reversal_enabled && !form.reversal_age_days) errors.push("Reversal age days is required when reversal is enabled");

    if (form.basis_frequency && form.accrual_frequency) {
      if ((FREQ_ORDER[form.basis_frequency] ?? -1) > (FREQ_ORDER[form.accrual_frequency] ?? -1)) {
        errors.push("Basis frequency must be more frequent than or equal to accrual frequency");
      }
    }

    if (form.accounting_enabled && form.accounting_frequency && form.accrual_frequency && form.invoice_frequency) {
      const acctRank = FREQ_ORDER[form.accounting_frequency] ?? -1;
      const accrualRank = FREQ_ORDER[form.accrual_frequency] ?? -1;
      const invoiceRank = FREQ_ORDER[form.invoice_frequency] ?? -1;
      if (acctRank < accrualRank || acctRank > invoiceRank) {
        errors.push("Accounting frequency must be between accrual and invoice frequencies");
      }
    }

    if (form.upfront_amortization && form.invoice_frequency !== "ANNUAL") {
      errors.push("Upfront amortization is only allowed when invoice frequency is Annual");
    }
    return errors;
  };

  const handleSave = () => {
    const errors = validateForm();
    if (errors.length > 0) { setFormErrors(errors); return; }
    setFormErrors([]);

    const body: Record<string, unknown> = {
      ...form,
      basis_frequency: form.basis_frequency || null,
      accounting_frequency: form.accounting_frequency || null,
      recovery_frequency: form.recovery_frequency || null,
      reversal_age_days: form.reversal_enabled ? form.reversal_age_days : null,
    };

    if (editId) {
      updateMut.mutate({ id: editId, body });
    } else {
      createMut.mutate(body);
    }
  };

  const isSaving = createMut.isPending || updateMut.isPending;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <CalendarClock className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Accrual Schedule Library</h1>
            <p className="text-sm text-muted-foreground">Define and manage accrual timing, frequency, and reversal rules</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => listQ.refetch()} disabled={listQ.isFetching}>
            <RefreshCw className={`h-4 w-4 ${listQ.isFetching ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" onClick={openCreate}><Plus className="mr-1 h-3 w-3" /> Add Schedule</Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard title="Total Schedules" value={totalCount} icon={CalendarClock} accent="bg-blue-600" />
        <SummaryCard title="Active" value={activeCount} icon={CheckCircle} accent="bg-green-600" />
        <SummaryCard title="Pending Approval" value={pendingCount} icon={Clock} accent="bg-yellow-500" />
      </div>

      <Separator />

      {/* Filters */}
      <div className="flex items-center gap-3">
        <Input placeholder="Search by code or name..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Filter by status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Statuses</SelectItem>
            <SelectItem value="DRAFT">Draft</SelectItem>
            <SelectItem value="PENDING_APPROVAL">Pending Approval</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="RETIRED">Retired</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Data Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Accrual Schedules</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  {["Code", "Name", "Accrual Freq", "Invoice Freq", "Method", "Reversal", "Status", "Actions"].map((h) => (
                    <TableHead key={h}>{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {listQ.isLoading ? <SkeletonRows cols={8} /> : items.length === 0 ? <EmptyRow cols={8} msg="No accrual schedules found" /> :
                  items.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono text-sm">{s.schedule_code}</TableCell>
                      <TableCell className="font-medium">{s.schedule_name}</TableCell>
                      <TableCell className="text-sm">{s.accrual_frequency ? FREQ_LABELS[s.accrual_frequency] ?? s.accrual_frequency : "\u2014"}</TableCell>
                      <TableCell className="text-sm">{s.invoice_frequency ? FREQ_LABELS[s.invoice_frequency] ?? s.invoice_frequency : "\u2014"}</TableCell>
                      <TableCell className="text-sm">{s.accrual_method ? METHOD_LABELS[s.accrual_method] ?? s.accrual_method : "\u2014"}</TableCell>
                      <TableCell>
                        {s.reversal_enabled ? (
                          <Badge variant="outline" className="text-xs">{s.reversal_age_days}d</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">Off</span>
                        )}
                      </TableCell>
                      <TableCell><Badge className={bc(STATUS_COLORS, s.library_status)}>{s.library_status.replace(/_/g, " ")}</Badge></TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm"><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {s.library_status === "DRAFT" && (
                              <>
                                <DropdownMenuItem onClick={() => openEdit(s)}>Edit</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => lifecycleMut.mutate({ id: s.id, action: "submit" })}>
                                  <Send className="mr-2 h-3 w-3" /> Submit for Approval
                                </DropdownMenuItem>
                              </>
                            )}
                            {s.library_status === "PENDING_APPROVAL" && (
                              <>
                                <DropdownMenuItem onClick={() => lifecycleMut.mutate({ id: s.id, action: "approve" })}>
                                  <CheckCircle className="mr-2 h-3 w-3" /> Approve
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => lifecycleMut.mutate({ id: s.id, action: "reject" })}>
                                  <XCircle className="mr-2 h-3 w-3" /> Reject
                                </DropdownMenuItem>
                              </>
                            )}
                            {s.library_status === "ACTIVE" && (
                              <DropdownMenuItem onClick={() => lifecycleMut.mutate({ id: s.id, action: "retire" })}>
                                <Archive className="mr-2 h-3 w-3" /> Retire
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Add / Edit Dialog */}
      <Dialog open={dlgOpen} onOpenChange={setDlgOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Accrual Schedule" : "Add Accrual Schedule"}</DialogTitle>
          </DialogHeader>

          {/* Validation Errors */}
          {formErrors.length > 0 && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950/30">
              <ul className="list-disc pl-4 text-sm text-red-700 dark:text-red-400">
                {formErrors.map((err, i) => <li key={i}>{err}</li>)}
              </ul>
            </div>
          )}

          <div className="space-y-4 py-2">
            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium">Schedule Code</label>
                <Input value={form.schedule_code} onChange={(e) => setForm((f) => ({ ...f, schedule_code: e.target.value }))} placeholder="e.g. ACCR-MONTHLY-01" disabled={!!editId} />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Schedule Name</label>
                <Input value={form.schedule_name} onChange={(e) => setForm((f) => ({ ...f, schedule_name: e.target.value }))} placeholder="e.g. Standard Monthly Accrual" />
              </div>
            </div>

            <Separator />

            {/* Accrual Settings */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Accrual Enabled</p>
                <p className="text-xs text-muted-foreground">Enable periodic fee accrual calculation</p>
              </div>
              <Switch checked={form.accrual_enabled} onCheckedChange={(v) => setForm((f) => ({ ...f, accrual_enabled: v }))} />
            </div>

            {form.accrual_enabled && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Accrual Frequency</label>
                  <Select value={form.accrual_frequency} onValueChange={(v) => setForm((f) => ({ ...f, accrual_frequency: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select frequency" /></SelectTrigger>
                    <SelectContent>
                      {FREQUENCIES.map((f) => <SelectItem key={f} value={f}>{FREQ_LABELS[f]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Accrual Method</label>
                  <Select value={form.accrual_method} onValueChange={(v) => setForm((f) => ({ ...f, accrual_method: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {METHODS.map((m) => <SelectItem key={m} value={m}>{METHOD_LABELS[m]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Basis Frequency */}
            <div className="space-y-1">
              <label className="text-sm font-medium">Basis Frequency <span className="text-xs text-muted-foreground">(must be &le; accrual frequency)</span></label>
              <Select value={form.basis_frequency} onValueChange={(v) => setForm((f) => ({ ...f, basis_frequency: v }))}>
                <SelectTrigger><SelectValue placeholder="Select basis frequency (optional)" /></SelectTrigger>
                <SelectContent>
                  {FREQUENCIES.filter((f) => !form.accrual_frequency || FREQ_ORDER[f] <= FREQ_ORDER[form.accrual_frequency]).map((f) => (
                    <SelectItem key={f} value={f}>{FREQ_LABELS[f]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Separator />

            {/* Accounting */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Accounting Enabled</p>
                <p className="text-xs text-muted-foreground">Post accrual entries to GL at a defined frequency</p>
              </div>
              <Switch checked={form.accounting_enabled} onCheckedChange={(v) => setForm((f) => ({ ...f, accounting_enabled: v }))} />
            </div>

            {form.accounting_enabled && (
              <div className="space-y-1">
                <label className="text-sm font-medium">Accounting Frequency <span className="text-xs text-muted-foreground">(between accrual and invoice)</span></label>
                <Select value={form.accounting_frequency} onValueChange={(v) => setForm((f) => ({ ...f, accounting_frequency: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select accounting frequency" /></SelectTrigger>
                  <SelectContent>
                    {FREQUENCIES.map((f) => <SelectItem key={f} value={f}>{FREQ_LABELS[f]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Invoice */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium">Invoice Frequency</label>
                <Select value={form.invoice_frequency} onValueChange={(v) => setForm((f) => ({ ...f, invoice_frequency: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FREQUENCIES.map((f) => <SelectItem key={f} value={f}>{FREQ_LABELS[f]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Due Date Offset (days)</label>
                <Input type="number" value={form.due_date_offset_days} onChange={(e) => setForm((f) => ({ ...f, due_date_offset_days: parseInt(e.target.value) || 0 }))} />
              </div>
            </div>

            <Separator />

            {/* Reversal */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Reversal Enabled</p>
                <p className="text-xs text-muted-foreground">Auto-reverse stale accruals after a defined age</p>
              </div>
              <Switch checked={form.reversal_enabled} onCheckedChange={(v) => setForm((f) => ({ ...f, reversal_enabled: v }))} />
            </div>

            {form.reversal_enabled && (
              <div className="space-y-1">
                <label className="text-sm font-medium">Reversal Age (days)</label>
                <Input type="number" value={form.reversal_age_days} onChange={(e) => setForm((f) => ({ ...f, reversal_age_days: parseInt(e.target.value) || 0 }))} />
              </div>
            )}

            {/* Upfront Amortization */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Upfront Amortization</p>
                <p className="text-xs text-muted-foreground">Only available when invoice frequency is Annual</p>
              </div>
              <Switch
                checked={form.upfront_amortization}
                onCheckedChange={(v) => setForm((f) => ({ ...f, upfront_amortization: v }))}
                disabled={form.invoice_frequency !== "ANNUAL"}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDlg}>Cancel</Button>
            <Button onClick={handleSave} disabled={isSaving || !form.schedule_code.trim() || !form.schedule_name.trim()}>
              {isSaving ? "Saving..." : editId ? "Update Schedule" : "Create Schedule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
