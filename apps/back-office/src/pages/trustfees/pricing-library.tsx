/**
 * Pricing Definition Library — TrustFees Pro Phase 2
 *
 * Manages the pricing definition library with full lifecycle:
 * DRAFT -> PENDING_APPROVAL -> ACTIVE -> RETIRED
 *
 * Supports pricing types: FIXED_AMOUNT, FIXED_RATE,
 * SLAB_CUMULATIVE_AMOUNT, SLAB_CUMULATIVE_RATE,
 * SLAB_INCREMENTAL_AMOUNT, SLAB_INCREMENTAL_RATE, STEP_FUNCTION.
 */
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@ui/lib/queryClient";
import { apiUrl } from "@ui/lib/api-url";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/ui/card";
import { Badge } from "@ui/components/ui/badge";
import { Button } from "@ui/components/ui/button";
import { Input } from "@ui/components/ui/input";
import { Label } from "@ui/components/ui/label";
import { Separator } from "@ui/components/ui/separator";
import { Skeleton } from "@ui/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@ui/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ui/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@ui/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@ui/components/ui/dropdown-menu";
import {
  Library,
  RefreshCw,
  Plus,
  MoreHorizontal,
  Pencil,
  SendHorizontal,
  Archive,
  CheckCircle2,
  Clock,
  FileText,
  Trash2,
  X,
} from "lucide-react";

/* ---------- Types ---------- */
interface PricingTier {
  from: number;
  to: number;
  rate: number;
  amount?: number;
}

interface StepWindow {
  from_month: number;
  to_month: number;
  amount: number;
}

interface PricingDefinition {
  id: number;
  pricing_code: string;
  pricing_name: string;
  pricing_type: string;
  currency: string;
  pricing_tiers: PricingTier[];
  step_windows: StepWindow[] | null;
  pricing_version: number;
  library_status: string;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

interface ListResponse {
  data: PricingDefinition[];
  total: number;
  page: number;
  pageSize: number;
}

/* ---------- Constants ---------- */
const PRICING_TYPES = [
  { value: "FIXED_AMOUNT", label: "Fixed Amount" },
  { value: "FIXED_RATE", label: "Fixed Rate" },
  { value: "SLAB_CUMULATIVE_AMOUNT", label: "Slab Cumulative Amount" },
  { value: "SLAB_CUMULATIVE_RATE", label: "Slab Cumulative Rate" },
  { value: "SLAB_INCREMENTAL_AMOUNT", label: "Slab Incremental Amount" },
  { value: "SLAB_INCREMENTAL_RATE", label: "Slab Incremental Rate" },
  { value: "STEP_FUNCTION", label: "Step Function" },
] as const;

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200",
  PENDING_APPROVAL: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  ACTIVE: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  RETIRED: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};

const STATUS_OPTIONS = ["ALL", "DRAFT", "PENDING_APPROVAL", "ACTIVE", "RETIRED"];

/* ---------- Helpers ---------- */
const fmtDate = (d: string) => {
  try {
    return new Date(d).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return d;
  }
};
const fmtPHP = (n: number) =>
  n.toLocaleString("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2 });
const fmtPct = (v: number) => `${v.toFixed(4)}%`;
const bc = (key: string) => STATUS_COLORS[key] ?? "bg-muted text-foreground";

const isSlabType = (t: string) =>
  t.startsWith("SLAB_CUMULATIVE") || t.startsWith("SLAB_INCREMENTAL");
const isFixedType = (t: string) => t === "FIXED_AMOUNT" || t === "FIXED_RATE";
const isStepFunction = (t: string) => t === "STEP_FUNCTION";

const pricingTypeLabel = (t: string) =>
  PRICING_TYPES.find((p) => p.value === t)?.label ?? t.replace(/_/g, " ");

function emptyFormState() {
  return {
    pricing_code: "",
    pricing_name: "",
    pricing_type: "FIXED_RATE" as string,
    currency: "PHP",
    pricing_tiers: [{ from: 0, to: 0, rate: 0, amount: 0 }] as PricingTier[],
    step_windows: [{ from_month: 0, to_month: 0, amount: 0 }] as StepWindow[],
  };
}

/* ---------- Sub-components ---------- */
function SummaryCard({
  title,
  value,
  icon: Icon,
  accent,
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  accent: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="mt-1 text-2xl font-bold">{value}</p>
          </div>
          <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${accent}`}>
            <Icon className="h-5 w-5 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SkeletonRows({ cols, rows = 5 }: { cols: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <TableRow key={i}>
          {Array.from({ length: cols }).map((_, j) => (
            <TableCell key={j}>
              <Skeleton className="h-4 w-16" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

function EmptyRow({ cols, msg }: { cols: number; msg: string }) {
  return (
    <TableRow>
      <TableCell colSpan={cols} className="py-8 text-center text-muted-foreground">
        {msg}
      </TableCell>
    </TableRow>
  );
}

/* ---------- Tier Editor ---------- */
function TierEditor({
  tiers,
  onChange,
  pricingType,
}: {
  tiers: PricingTier[];
  onChange: (t: PricingTier[]) => void;
  pricingType: string;
}) {
  const isRate = pricingType.includes("RATE");

  const addTier = () => {
    const lastTo = tiers.length > 0 ? tiers[tiers.length - 1].to : 0;
    onChange([...tiers, { from: lastTo, to: 0, rate: 0, amount: 0 }]);
  };

  const removeTier = (idx: number) => {
    onChange(tiers.filter((_, i) => i !== idx));
  };

  const updateTier = (idx: number, field: keyof PricingTier, value: number) => {
    const updated = [...tiers];
    updated[idx] = { ...updated[idx], [field]: value };
    onChange(updated);
  };

  if (isFixedType(pricingType)) {
    const tier = tiers[0] || { from: 0, to: 0, rate: 0, amount: 0 };
    return (
      <div className="space-y-3">
        <Label>{isRate ? "Rate (%)" : "Amount (PHP)"}</Label>
        <Input
          type="number"
          step={isRate ? "0.0001" : "0.01"}
          placeholder={isRate ? "0.0000" : "0.00"}
          value={isRate ? tier.rate || "" : tier.amount || ""}
          onChange={(e) => {
            const val = parseFloat(e.target.value) || 0;
            const updated = isRate
              ? { ...tier, rate: val }
              : { ...tier, amount: val };
            onChange([updated]);
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Slab Tiers</Label>
        <Button type="button" variant="outline" size="sm" onClick={addTier}>
          <Plus className="mr-1 h-3 w-3" /> Add Tier
        </Button>
      </div>
      <div className="space-y-2">
        {tiers.map((tier, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <div className="flex-1">
              <Input
                type="number"
                step="0.01"
                placeholder="From"
                value={tier.from || ""}
                onChange={(e) => updateTier(idx, "from", parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="flex-1">
              <Input
                type="number"
                step="0.01"
                placeholder="To"
                value={tier.to || ""}
                onChange={(e) => updateTier(idx, "to", parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="flex-1">
              <Input
                type="number"
                step={isRate ? "0.0001" : "0.01"}
                placeholder={isRate ? "Rate %" : "Amount"}
                value={isRate ? tier.rate || "" : tier.amount || ""}
                onChange={(e) =>
                  updateTier(
                    idx,
                    isRate ? "rate" : "amount",
                    parseFloat(e.target.value) || 0,
                  )
                }
              />
            </div>
            {tiers.length > 1 && (
              <Button type="button" variant="ghost" size="sm" onClick={() => removeTier(idx)}>
                <X className="h-4 w-4 text-destructive" />
              </Button>
            )}
          </div>
        ))}
        {tiers.length > 0 && (
          <div className="flex gap-2 text-xs text-muted-foreground px-1">
            <span className="flex-1">From</span>
            <span className="flex-1">To</span>
            <span className="flex-1">{isRate ? "Rate %" : "Amount"}</span>
            <span className="w-8" />
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Step Windows Editor ---------- */
function StepWindowsEditor({
  windows,
  onChange,
}: {
  windows: StepWindow[];
  onChange: (w: StepWindow[]) => void;
}) {
  const addWindow = () => {
    const lastTo = windows.length > 0 ? windows[windows.length - 1].to_month : 0;
    onChange([...windows, { from_month: lastTo, to_month: 0, amount: 0 }]);
  };

  const removeWindow = (idx: number) => {
    onChange(windows.filter((_, i) => i !== idx));
  };

  const updateWindow = (idx: number, field: keyof StepWindow, value: number) => {
    const updated = [...windows];
    updated[idx] = { ...updated[idx], [field]: value };
    onChange(updated);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Step Windows</Label>
        <Button type="button" variant="outline" size="sm" onClick={addWindow}>
          <Plus className="mr-1 h-3 w-3" /> Add Step
        </Button>
      </div>
      <div className="space-y-2">
        {windows.map((w, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <div className="flex-1">
              <Input
                type="number"
                step="1"
                placeholder="From Month"
                value={w.from_month || ""}
                onChange={(e) => updateWindow(idx, "from_month", parseInt(e.target.value) || 0)}
              />
            </div>
            <div className="flex-1">
              <Input
                type="number"
                step="1"
                placeholder="To Month"
                value={w.to_month || ""}
                onChange={(e) => updateWindow(idx, "to_month", parseInt(e.target.value) || 0)}
              />
            </div>
            <div className="flex-1">
              <Input
                type="number"
                step="0.01"
                placeholder="Amount"
                value={w.amount || ""}
                onChange={(e) => updateWindow(idx, "amount", parseFloat(e.target.value) || 0)}
              />
            </div>
            {windows.length > 1 && (
              <Button type="button" variant="ghost" size="sm" onClick={() => removeWindow(idx)}>
                <X className="h-4 w-4 text-destructive" />
              </Button>
            )}
          </div>
        ))}
        {windows.length > 0 && (
          <div className="flex gap-2 text-xs text-muted-foreground px-1">
            <span className="flex-1">From Month</span>
            <span className="flex-1">To Month</span>
            <span className="flex-1">Amount (PHP)</span>
            <span className="w-8" />
          </div>
        )}
      </div>
    </div>
  );
}

/* ========== Main Component ========== */
export default function PricingLibrary() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyFormState());

  // --- Queries ---
  const listQ = useQuery<ListResponse>({
    queryKey: [
      "pricing-definitions",
      statusFilter,
      typeFilter,
      search,
      page,
    ],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (typeFilter !== "ALL") params.set("pricing_type", typeFilter);
      if (search.trim()) params.set("search", search.trim());
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      return apiRequest(
        "GET",
        apiUrl(`/api/v1/pricing-definitions?${params.toString()}`),
      );
    },
    refetchInterval: 30_000,
  });

  const definitions = listQ.data?.data ?? [];
  const total = listQ.data?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  // --- Summary computed ---
  const summary = useMemo(() => {
    const all = definitions;
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    return {
      total,
      active: all.filter((d) => d.library_status === "ACTIVE").length,
      pending: all.filter((d) => d.library_status === "PENDING_APPROVAL").length,
      recentlyUpdated: all.filter(
        (d) => new Date(d.updated_at) >= sevenDaysAgo,
      ).length,
    };
  }, [definitions, total]);

  // --- Mutations ---
  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["pricing-definitions"] });
  };

  const createMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiRequest("POST", apiUrl("/api/v1/pricing-definitions"), body),
    onSuccess: () => {
      invalidateAll();
      closeDialog();
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      apiRequest("PUT", apiUrl(`/api/v1/pricing-definitions/${id}`), body),
    onSuccess: () => {
      invalidateAll();
      closeDialog();
    },
  });

  const submitMut = useMutation({
    mutationFn: (id: number) =>
      apiRequest("POST", apiUrl(`/api/v1/pricing-definitions/${id}/submit`)),
    onSuccess: invalidateAll,
  });

  const retireMut = useMutation({
    mutationFn: (id: number) =>
      apiRequest("POST", apiUrl(`/api/v1/pricing-definitions/${id}/retire`)),
    onSuccess: invalidateAll,
  });

  // --- Dialog handlers ---
  const openCreate = () => {
    setEditingId(null);
    setForm(emptyFormState());
    setDialogOpen(true);
  };

  const openEdit = (def: PricingDefinition) => {
    setEditingId(def.id);
    setForm({
      pricing_code: def.pricing_code,
      pricing_name: def.pricing_name,
      pricing_type: def.pricing_type,
      currency: def.currency,
      pricing_tiers:
        def.pricing_tiers && (def.pricing_tiers as PricingTier[]).length > 0
          ? (def.pricing_tiers as PricingTier[])
          : [{ from: 0, to: 0, rate: 0, amount: 0 }],
      step_windows:
        def.step_windows && (def.step_windows as StepWindow[]).length > 0
          ? (def.step_windows as StepWindow[])
          : [{ from_month: 0, to_month: 0, amount: 0 }],
    });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingId(null);
    setForm(emptyFormState());
  };

  const handleSave = () => {
    const body: Record<string, unknown> = {
      pricing_code: form.pricing_code,
      pricing_name: form.pricing_name,
      pricing_type: form.pricing_type,
      currency: form.currency,
    };

    if (isStepFunction(form.pricing_type)) {
      body.pricing_tiers = [];
      body.step_windows = form.step_windows;
    } else {
      body.pricing_tiers = form.pricing_tiers;
      body.step_windows = null;
    }

    if (editingId) {
      updateMut.mutate({ id: editingId, body });
    } else {
      createMut.mutate(body);
    }
  };

  const isSaving = createMut.isPending || updateMut.isPending;
  const canSave =
    form.pricing_code.trim() !== "" &&
    form.pricing_name.trim() !== "" &&
    form.pricing_type !== "";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Library className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Pricing Definition Library</h1>
            <p className="text-sm text-muted-foreground">
              Manage pricing definitions for fee plans — slab rates, fixed fees, and step functions
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => listQ.refetch()}
            disabled={listQ.isFetching}
          >
            <RefreshCw className={`h-4 w-4 ${listQ.isFetching ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-1 h-3 w-3" /> Add Pricing Definition
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard title="Total Definitions" value={summary.total} icon={FileText} accent="bg-blue-600" />
        <SummaryCard title="Active" value={summary.active} icon={CheckCircle2} accent="bg-green-600" />
        <SummaryCard title="Pending Approval" value={summary.pending} icon={Clock} accent="bg-amber-500" />
        <SummaryCard title="Recently Updated" value={summary.recentlyUpdated} icon={Pencil} accent="bg-indigo-600" />
      </div>

      <Separator />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Status</Label>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {s === "ALL" ? "All Statuses" : s.replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Pricing Type</Label>
          <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1); }}>
            <SelectTrigger className="w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Types</SelectItem>
              {PRICING_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Search</Label>
          <Input
            placeholder="Search code or name..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-[220px]"
          />
        </div>
      </div>

      {/* Data Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Pricing Definitions</CardTitle>
            <span className="text-sm text-muted-foreground">
              {total} record{total !== 1 ? "s" : ""}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Currency</TableHead>
                  <TableHead className="text-center">Version</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Updated</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listQ.isLoading ? (
                  <SkeletonRows cols={8} />
                ) : definitions.length === 0 ? (
                  <EmptyRow cols={8} msg="No pricing definitions found" />
                ) : (
                  definitions.map((def) => (
                    <TableRow key={def.id}>
                      <TableCell className="font-mono text-sm font-medium">
                        {def.pricing_code}
                      </TableCell>
                      <TableCell>{def.pricing_name}</TableCell>
                      <TableCell className="text-sm">
                        {pricingTypeLabel(def.pricing_type)}
                      </TableCell>
                      <TableCell className="text-sm">{def.currency}</TableCell>
                      <TableCell className="text-center font-mono text-sm">
                        v{def.pricing_version}
                      </TableCell>
                      <TableCell>
                        <Badge className={bc(def.library_status)}>
                          {def.library_status.replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {fmtDate(def.updated_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {def.library_status === "DRAFT" && (
                              <>
                                <DropdownMenuItem onClick={() => openEdit(def)}>
                                  <Pencil className="mr-2 h-4 w-4" /> Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => submitMut.mutate(def.id)}
                                  disabled={submitMut.isPending}
                                >
                                  <SendHorizontal className="mr-2 h-4 w-4" /> Submit for Approval
                                </DropdownMenuItem>
                              </>
                            )}
                            {def.library_status === "ACTIVE" && (
                              <DropdownMenuItem
                                onClick={() => retireMut.mutate(def.id)}
                                disabled={retireMut.isPending}
                                className="text-destructive focus:text-destructive"
                              >
                                <Archive className="mr-2 h-4 w-4" /> Retire
                              </DropdownMenuItem>
                            )}
                            {def.library_status === "PENDING_APPROVAL" && (
                              <DropdownMenuItem disabled>
                                <Clock className="mr-2 h-4 w-4" /> Awaiting Approval
                              </DropdownMenuItem>
                            )}
                            {def.library_status === "RETIRED" && (
                              <DropdownMenuItem disabled>
                                <Archive className="mr-2 h-4 w-4" /> Retired
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Error display for mutations */}
      {(submitMut.error || retireMut.error) && (
        <Card className="border-destructive">
          <CardContent className="pt-4">
            <p className="text-sm text-destructive">
              {(submitMut.error as any)?.message || (retireMut.error as any)?.message}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Edit Pricing Definition" : "Add Pricing Definition"}
            </DialogTitle>
            <DialogDescription>
              {editingId
                ? "Update the pricing definition details. Saving will increment the version."
                : "Create a new pricing definition. It will start as a DRAFT."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Pricing Code */}
            <div className="space-y-1">
              <Label>Pricing Code</Label>
              <Input
                value={form.pricing_code}
                onChange={(e) => setForm((f) => ({ ...f, pricing_code: e.target.value }))}
                placeholder="e.g. PRC-CUSTODY-SLAB-01"
                disabled={!!editingId}
              />
              {editingId && (
                <p className="text-xs text-muted-foreground">
                  Code cannot be changed after creation.
                </p>
              )}
            </div>

            {/* Pricing Name */}
            <div className="space-y-1">
              <Label>Pricing Name</Label>
              <Input
                value={form.pricing_name}
                onChange={(e) => setForm((f) => ({ ...f, pricing_name: e.target.value }))}
                placeholder="e.g. Custody Fee - Slab Rate"
              />
            </div>

            {/* Pricing Type */}
            <div className="space-y-1">
              <Label>Pricing Type</Label>
              <Select
                value={form.pricing_type}
                onValueChange={(v) => setForm((f) => ({ ...f, pricing_type: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRICING_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Currency */}
            <div className="space-y-1">
              <Label>Currency</Label>
              <Input
                value={form.currency}
                onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value.toUpperCase() }))}
                placeholder="PHP"
                className="w-[120px]"
              />
            </div>

            <Separator />

            {/* Dynamic Tier / Step editor based on pricing type */}
            {isStepFunction(form.pricing_type) ? (
              <StepWindowsEditor
                windows={form.step_windows}
                onChange={(w) => setForm((f) => ({ ...f, step_windows: w }))}
              />
            ) : (
              <TierEditor
                tiers={form.pricing_tiers}
                onChange={(t) => setForm((f) => ({ ...f, pricing_tiers: t }))}
                pricingType={form.pricing_type}
              />
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving || !canSave}>
              {isSaving
                ? "Saving..."
                : editingId
                  ? "Update Definition"
                  : "Create Definition"}
            </Button>
          </DialogFooter>

          {/* Show mutation errors in dialog */}
          {(createMut.error || updateMut.error) && (
            <div className="rounded-md border border-destructive p-3 mt-2">
              <p className="text-sm text-destructive">
                {(createMut.error as any)?.message || (updateMut.error as any)?.message}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
