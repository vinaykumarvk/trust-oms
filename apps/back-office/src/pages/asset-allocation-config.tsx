/**
 * Asset Allocation Configuration — Risk Profiling Module
 *
 * Manages asset allocation configs per risk category with maker-checker workflow.
 * Each config defines allocation percentages across asset classes for risk
 * categories from Conservative through Very Aggressive.
 */
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/ui/card";
import { Badge } from "@ui/components/ui/badge";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@ui/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ui/components/ui/select";
import { toast } from "sonner";
import {
  PieChart,
  RefreshCw,
  Plus,
  Pencil,
  CheckCircle2,
  XCircle,
  Trash2,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";

/* ========== Types ========== */

interface AllocationLine {
  risk_category: string;
  asset_class: string;
  allocation_percentage: string;
  expected_return_pct: string;
  standard_deviation_pct: string;
}

interface AssetAllocationConfig {
  id: number;
  config_name: string;
  entity_id: string;
  effective_start_date: string;
  effective_end_date: string;
  authorization_status: string;
  version: number;
  maker_id: number | null;
  checker_id: number | null;
  created_at: string;
  updated_at: string;
  lines?: AllocationLine[];
}

/* ========== Constants ========== */

const API_BASE = "/api/v1/risk-profiling/asset-allocation";

const STATUS_COLORS: Record<string, string> = {
  UNAUTHORIZED: "bg-yellow-100 text-yellow-800",
  MODIFIED: "bg-blue-100 text-blue-800",
  AUTHORIZED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
};

const RISK_CATEGORIES = [
  "Conservative",
  "Moderately Conservative",
  "Moderate",
  "Moderately Aggressive",
  "Very Aggressive",
];

const ASSET_CLASSES = [
  "Equity",
  "Fixed Income",
  "Cash/Money Market",
  "Alternatives",
  "Real Estate",
  "Commodities",
];

/* ========== Helpers ========== */

async function apiFetch<T = unknown>(
  url: string,
  opts?: RequestInit,
): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as Record<string, string>).error || `Request failed (${res.status})`);
  }
  return res.json();
}

const bc = (key: string) => STATUS_COLORS[key] ?? "bg-muted text-foreground";

const fmtDate = (d: string) => {
  try {
    return new Date(d).toLocaleDateString("en-PH", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return d;
  }
};

function emptyLine(riskCategory: string): AllocationLine {
  return {
    risk_category: riskCategory,
    asset_class: ASSET_CLASSES[0],
    allocation_percentage: "",
    expected_return_pct: "",
    standard_deviation_pct: "",
  };
}

function buildInitialLines(): AllocationLine[] {
  return RISK_CATEGORIES.map((cat) => emptyLine(cat));
}

function computeCategoryTotal(lines: AllocationLine[], category: string): number {
  return lines
    .filter((l) => l.risk_category === category)
    .reduce((sum, l) => sum + (parseFloat(l.allocation_percentage) || 0), 0);
}

/* ========== Main Component ========== */

export default function AssetAllocationConfigPage() {
  const qc = useQueryClient();

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formName, setFormName] = useState("");
  const [formStartDate, setFormStartDate] = useState("");
  const [formEndDate, setFormEndDate] = useState("");
  const [formLines, setFormLines] = useState<AllocationLine[]>(buildInitialLines());

  // --- Query ---
  const listQ = useQuery<AssetAllocationConfig[]>({
    queryKey: ["asset-allocation-configs"],
    queryFn: () => apiFetch(`${API_BASE}?entity_id=default`),
    refetchInterval: 30_000,
  });

  const configs = listQ.data ?? [];

  const summary = useMemo(() => {
    const total = configs.length;
    const authorized = configs.filter((c) => c.authorization_status === "AUTHORIZED").length;
    const pending = configs.filter(
      (c) => c.authorization_status === "UNAUTHORIZED" || c.authorization_status === "MODIFIED",
    ).length;
    return { total, authorized, pending };
  }, [configs]);

  // --- Mutations ---
  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["asset-allocation-configs"] });
  };

  const createMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch(API_BASE, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      invalidateAll();
      closeDialog();
      toast.success("Asset allocation config created");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      apiFetch(`${API_BASE}/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => {
      invalidateAll();
      closeDialog();
      toast.success("Asset allocation config updated");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const authorizeMut = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`${API_BASE}/${id}/authorize`, { method: "POST" }),
    onSuccess: () => {
      invalidateAll();
      toast.success("Config authorized");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const rejectMut = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`${API_BASE}/${id}/reject`, { method: "POST" }),
    onSuccess: () => {
      invalidateAll();
      toast.success("Config rejected");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // --- Dialog handlers ---
  const openCreate = () => {
    setEditingId(null);
    setFormName("");
    setFormStartDate("");
    setFormEndDate("");
    setFormLines(buildInitialLines());
    setDialogOpen(true);
  };

  const openEdit = (cfg: AssetAllocationConfig) => {
    setEditingId(cfg.id);
    setFormName(cfg.config_name);
    setFormStartDate(cfg.effective_start_date?.slice(0, 10) ?? "");
    setFormEndDate(cfg.effective_end_date?.slice(0, 10) ?? "");
    setFormLines(
      cfg.lines && cfg.lines.length > 0
        ? cfg.lines.map((l) => ({ ...l }))
        : buildInitialLines(),
    );
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingId(null);
  };

  // --- Line management ---
  const addLineForCategory = (category: string) => {
    setFormLines((prev) => [...prev, emptyLine(category)]);
  };

  const removeLine = (index: number) => {
    setFormLines((prev) => prev.filter((_, i) => i !== index));
  };

  const updateLine = (index: number, field: keyof AllocationLine, value: string) => {
    setFormLines((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  // --- Validation ---
  const categoryWarnings = useMemo(() => {
    const warnings: Record<string, string> = {};
    RISK_CATEGORIES.forEach((cat) => {
      const total = computeCategoryTotal(formLines, cat);
      const catLines = formLines.filter((l) => l.risk_category === cat && l.allocation_percentage);
      if (catLines.length > 0 && Math.abs(total - 100) > 0.01) {
        warnings[cat] = `Sum is ${total.toFixed(2)}% (must be 100%)`;
      }
    });
    return warnings;
  }, [formLines]);

  const hasWarnings = Object.keys(categoryWarnings).length > 0;

  const handleSave = () => {
    const cleanLines = formLines.filter(
      (l) => l.allocation_percentage && parseFloat(l.allocation_percentage) > 0,
    );
    const body = {
      config_name: formName,
      entity_id: "default",
      effective_start_date: formStartDate,
      effective_end_date: formEndDate,
      maker_id: 1,
      lines: cleanLines,
    };
    if (editingId) {
      updateMut.mutate({ id: editingId, body });
    } else {
      createMut.mutate(body);
    }
  };

  const isSaving = createMut.isPending || updateMut.isPending;
  const canSave = formName.trim() !== "" && formStartDate !== "" && formEndDate !== "";

  // --- Grouped lines for the dialog ---
  const groupedLines = useMemo(() => {
    const grouped: Record<string, { lines: AllocationLine[]; indices: number[] }> = {};
    RISK_CATEGORIES.forEach((cat) => {
      grouped[cat] = { lines: [], indices: [] };
    });
    formLines.forEach((line, idx) => {
      if (grouped[line.risk_category]) {
        grouped[line.risk_category].lines.push(line);
        grouped[line.risk_category].indices.push(idx);
      }
    });
    return grouped;
  }, [formLines]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <PieChart className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Asset Allocation Configuration
            </h1>
            <p className="text-sm text-muted-foreground">
              Define target allocations per risk category with maker-checker approval
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
            <RefreshCw
              className={`h-4 w-4 ${listQ.isFetching ? "animate-spin" : ""}`}
            />
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-1 h-3 w-3" /> New Config
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Configs</p>
                <p className="mt-1 text-2xl font-bold">{summary.total}</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600">
                <PieChart className="h-5 w-5 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Authorized</p>
                <p className="mt-1 text-2xl font-bold">{summary.authorized}</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-600">
                <CheckCircle2 className="h-5 w-5 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Pending Approval</p>
                <p className="mt-1 text-2xl font-bold">{summary.pending}</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-yellow-500">
                <ShieldCheck className="h-5 w-5 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Data Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Configurations</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Config Name</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Effective From</TableHead>
                  <TableHead>Effective To</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center">Version</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listQ.isLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 7 }).map((_, j) => (
                        <TableCell key={j}>
                          <div className="h-4 w-20 animate-pulse rounded bg-muted" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : configs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                      No asset allocation configs found
                    </TableCell>
                  </TableRow>
                ) : (
                  configs.map((cfg) => (
                    <TableRow key={cfg.id}>
                      <TableCell className="font-medium">{cfg.config_name}</TableCell>
                      <TableCell className="text-sm">{cfg.entity_id}</TableCell>
                      <TableCell className="text-sm">
                        {cfg.effective_start_date ? fmtDate(cfg.effective_start_date) : "-"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {cfg.effective_end_date ? fmtDate(cfg.effective_end_date) : "-"}
                      </TableCell>
                      <TableCell>
                        <Badge className={bc(cfg.authorization_status)}>
                          {cfg.authorization_status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center font-mono text-sm">
                        v{cfg.version}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {(cfg.authorization_status === "UNAUTHORIZED" ||
                            cfg.authorization_status === "MODIFIED") && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openEdit(cfg)}
                                title="Edit"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => authorizeMut.mutate(cfg.id)}
                                disabled={authorizeMut.isPending}
                                title="Authorize"
                                className="text-green-700 hover:text-green-800"
                              >
                                <CheckCircle2 className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => rejectMut.mutate(cfg.id)}
                                disabled={rejectMut.isPending}
                                title="Reject"
                                className="text-red-700 hover:text-red-800"
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          {cfg.authorization_status === "REJECTED" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEdit(cfg)}
                              title="Edit & Resubmit"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {cfg.authorization_status === "AUTHORIZED" && (
                            <span className="text-xs text-muted-foreground px-2">
                              Authorized
                            </span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ============================================================ */}
      {/* Create / Edit Dialog                                          */}
      {/* ============================================================ */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Edit Asset Allocation Config" : "New Asset Allocation Config"}
            </DialogTitle>
            <DialogDescription>
              Define target allocation percentages across asset classes for each risk category.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Top-level fields */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium">Config Name</label>
                <Input
                  placeholder="e.g. Standard 2026"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Effective Start</label>
                <Input
                  type="date"
                  value={formStartDate}
                  onChange={(e) => setFormStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Effective End</label>
                <Input
                  type="date"
                  value={formEndDate}
                  onChange={(e) => setFormEndDate(e.target.value)}
                />
              </div>
            </div>

            {/* Allocation lines grouped by risk category */}
            {RISK_CATEGORIES.map((category) => {
              const group = groupedLines[category];
              const total = computeCategoryTotal(formLines, category);
              const warning = categoryWarnings[category];
              const isValid = group.lines.some(
                (l) => l.allocation_percentage && parseFloat(l.allocation_percentage) > 0,
              )
                ? Math.abs(total - 100) <= 0.01
                : true;

              return (
                <div key={category} className="space-y-2 rounded-md border p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold">{category}</h3>
                      {group.lines.some((l) => l.allocation_percentage) && (
                        <Badge
                          variant="outline"
                          className={
                            isValid
                              ? "border-green-300 text-green-700"
                              : "border-red-300 text-red-700"
                          }
                        >
                          {total.toFixed(1)}%
                        </Badge>
                      )}
                      {warning && (
                        <span className="flex items-center gap-1 text-xs text-red-600">
                          <AlertTriangle className="h-3 w-3" />
                          {warning}
                        </span>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => addLineForCategory(category)}
                    >
                      <Plus className="mr-1 h-3 w-3" /> Add Line
                    </Button>
                  </div>

                  {group.lines.length > 0 && (
                    <div className="overflow-x-auto rounded border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[180px]">Asset Class</TableHead>
                            <TableHead className="w-[120px]">Allocation %</TableHead>
                            <TableHead className="w-[120px]">Expected Return %</TableHead>
                            <TableHead className="w-[120px]">Std Deviation %</TableHead>
                            <TableHead className="w-[50px]" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {group.lines.map((line, localIdx) => {
                            const globalIdx = group.indices[localIdx];
                            return (
                              <TableRow key={globalIdx}>
                                <TableCell>
                                  <Select
                                    value={line.asset_class}
                                    onValueChange={(v) =>
                                      updateLine(globalIdx, "asset_class", v)
                                    }
                                  >
                                    <SelectTrigger className="h-8 text-sm">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {ASSET_CLASSES.map((ac) => (
                                        <SelectItem key={ac} value={ac}>
                                          {ac}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </TableCell>
                                <TableCell>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    max="100"
                                    placeholder="0.00"
                                    className="h-8 text-sm"
                                    value={line.allocation_percentage}
                                    onChange={(e) =>
                                      updateLine(globalIdx, "allocation_percentage", e.target.value)
                                    }
                                  />
                                </TableCell>
                                <TableCell>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    placeholder="0.00"
                                    className="h-8 text-sm"
                                    value={line.expected_return_pct}
                                    onChange={(e) =>
                                      updateLine(globalIdx, "expected_return_pct", e.target.value)
                                    }
                                  />
                                </TableCell>
                                <TableCell>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    placeholder="0.00"
                                    className="h-8 text-sm"
                                    value={line.standard_deviation_pct}
                                    onChange={(e) =>
                                      updateLine(
                                        globalIdx,
                                        "standard_deviation_pct",
                                        e.target.value,
                                      )
                                    }
                                  />
                                </TableCell>
                                <TableCell>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => removeLine(globalIdx)}
                                  >
                                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}

                  {group.lines.length === 0 && (
                    <p className="text-xs text-muted-foreground py-2 text-center">
                      No allocation lines. Click "Add Line" to define allocations.
                    </p>
                  )}
                </div>
              );
            })}

            {hasWarnings && (
              <div className="flex items-center gap-2 rounded-md border border-yellow-300 bg-yellow-50 p-3">
                <AlertTriangle className="h-4 w-4 text-yellow-600 shrink-0" />
                <p className="text-sm text-yellow-800">
                  Some risk categories do not sum to 100%. Please review before saving.
                </p>
              </div>
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
                  ? "Update Config"
                  : "Create Config"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
