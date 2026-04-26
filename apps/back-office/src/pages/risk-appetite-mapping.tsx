/**
 * Risk Appetite Mapping — Risk Profiling Module
 *
 * Manages score-range-to-risk-category mappings with maker-checker workflow.
 * Each mapping contains bands that map numeric score ranges to one of six
 * standard risk categories (Conservative through Very Aggressive).
 */
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@ui/lib/queryClient";
import { apiUrl } from "@ui/lib/api-url";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/ui/card";
import { Badge } from "@ui/components/ui/badge";
import { Button } from "@ui/components/ui/button";
import { Input } from "@ui/components/ui/input";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ui/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@ui/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  ShieldCheck,
  RefreshCw,
  Plus,
  MoreHorizontal,
  Pencil,
  CheckCircle2,
  XCircle,
  Trash2,
} from "lucide-react";

/* ========== Types ========== */

interface RiskBand {
  score_from: number;
  score_to: number;
  risk_category: string;
  risk_code: number;
}

interface RiskAppetiteMapping {
  id: number;
  mapping_name: string;
  entity_id: string;
  effective_start_date: string;
  effective_end_date: string | null;
  status: "UNAUTHORIZED" | "MODIFIED" | "AUTHORIZED" | "REJECTED";
  version: number;
  bands: RiskBand[];
  created_at: string;
  updated_at: string;
}

/* ========== Constants ========== */

const STATUS_COLORS: Record<string, string> = {
  UNAUTHORIZED: "bg-yellow-100 text-yellow-800",
  MODIFIED: "bg-blue-100 text-blue-800",
  AUTHORIZED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
};

const DEFAULT_BANDS: RiskBand[] = [
  { score_from: 0, score_to: 16, risk_category: "Conservative", risk_code: 1 },
  { score_from: 17, score_to: 33, risk_category: "Low to Moderate", risk_code: 2 },
  { score_from: 34, score_to: 50, risk_category: "Moderate", risk_code: 3 },
  { score_from: 51, score_to: 67, risk_category: "Moderately High", risk_code: 4 },
  { score_from: 68, score_to: 84, risk_category: "Aggressive", risk_code: 5 },
  { score_from: 85, score_to: 100, risk_category: "Very Aggressive", risk_code: 6 },
];

const RISK_CATEGORIES: { code: number; label: string }[] = [
  { code: 1, label: "Conservative" },
  { code: 2, label: "Low to Moderate" },
  { code: 3, label: "Moderate" },
  { code: 4, label: "Moderately High" },
  { code: 5, label: "Aggressive" },
  { code: 6, label: "Very Aggressive" },
];

/* ========== Helpers ========== */

const bc = (key: string) => STATUS_COLORS[key] ?? "bg-muted text-foreground";

const fmtDate = (d: string | null) => {
  if (!d) return "--";
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

function validateBands(bands: RiskBand[]): string | null {
  for (let i = 0; i < bands.length; i++) {
    const b = bands[i];
    if (b.score_from < 0 || b.score_to < 0) return `Band ${i + 1}: scores must be non-negative`;
    if (b.score_from > b.score_to)
      return `Band ${i + 1}: score_from (${b.score_from}) must be <= score_to (${b.score_to})`;
    if (b.risk_code < 1 || b.risk_code > 6)
      return `Band ${i + 1}: risk_code must be between 1 and 6`;
  }
  // Check overlaps
  const sorted = [...bands].sort((a, b) => a.score_from - b.score_from);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].score_from <= sorted[i - 1].score_to) {
      return `Overlap detected between bands covering ${sorted[i - 1].score_from}-${sorted[i - 1].score_to} and ${sorted[i].score_from}-${sorted[i].score_to}`;
    }
  }
  return null;
}

/* ========== Main Component ========== */

export default function RiskAppetiteMapping() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formName, setFormName] = useState("");
  const [formStartDate, setFormStartDate] = useState("");
  const [formEndDate, setFormEndDate] = useState("");
  const [formBands, setFormBands] = useState<RiskBand[]>(DEFAULT_BANDS);
  const [entityFilter, setEntityFilter] = useState("default");

  // --- Queries ---
  const listQ = useQuery<RiskAppetiteMapping[]>({
    queryKey: ["risk-appetite-mappings", entityFilter],
    queryFn: () =>
      apiRequest("GET", apiUrl(`/api/v1/risk-profiling/risk-appetite?entity_id=${entityFilter}`)),
    refetchInterval: 30_000,
  });

  const mappings = useMemo(() => {
    const data = listQ.data;
    return Array.isArray(data) ? data : [];
  }, [listQ.data]);

  const summary = useMemo(() => {
    const total = mappings.length;
    const authorized = mappings.filter((m) => m.status === "AUTHORIZED").length;
    const pending = mappings.filter((m) => m.status === "UNAUTHORIZED" || m.status === "MODIFIED").length;
    return { total, authorized, pending };
  }, [mappings]);

  // --- Mutations ---
  const createMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiRequest("POST", apiUrl("/api/v1/risk-profiling/risk-appetite"), body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["risk-appetite-mappings"] });
      toast.success("Mapping created successfully");
      closeDialog();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      apiRequest("PUT", apiUrl(`/api/v1/risk-profiling/risk-appetite/${id}`), body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["risk-appetite-mappings"] });
      toast.success("Mapping updated successfully");
      closeDialog();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const authorizeMut = useMutation({
    mutationFn: (id: number) =>
      apiRequest("POST", apiUrl(`/api/v1/risk-profiling/risk-appetite/${id}/authorize`), {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["risk-appetite-mappings"] });
      toast.success("Mapping authorized");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const rejectMut = useMutation({
    mutationFn: (id: number) =>
      apiRequest("POST", apiUrl(`/api/v1/risk-profiling/risk-appetite/${id}/reject`), {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["risk-appetite-mappings"] });
      toast.success("Mapping rejected");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // --- Dialog Handlers ---

  const openAddDialog = () => {
    setEditingId(null);
    setFormName("");
    setFormStartDate("");
    setFormEndDate("");
    setFormBands(DEFAULT_BANDS.map((b) => ({ ...b })));
    setDialogOpen(true);
  };

  const openEditDialog = (mapping: RiskAppetiteMapping) => {
    setEditingId(mapping.id);
    setFormName(mapping.mapping_name);
    setFormStartDate(mapping.effective_start_date?.slice(0, 10) ?? "");
    setFormEndDate(mapping.effective_end_date?.slice(0, 10) ?? "");
    setFormBands(mapping.bands?.length ? mapping.bands.map((b) => ({ ...b })) : DEFAULT_BANDS.map((b) => ({ ...b })));
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingId(null);
  };

  const updateBand = (index: number, field: keyof RiskBand, value: string | number) => {
    setFormBands((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const addBand = () => {
    setFormBands((prev) => [
      ...prev,
      { score_from: 0, score_to: 0, risk_category: "Conservative", risk_code: 1 },
    ]);
  };

  const removeBand = (index: number) => {
    setFormBands((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    if (!formName.trim()) {
      toast.error("Mapping name is required");
      return;
    }
    if (!formStartDate) {
      toast.error("Effective start date is required");
      return;
    }
    if (formBands.length === 0) {
      toast.error("At least one band is required");
      return;
    }
    const validationError = validateBands(formBands);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    const body = {
      mapping_name: formName.trim(),
      effective_start_date: formStartDate,
      effective_end_date: formEndDate || null,
      bands: formBands,
    };

    if (editingId) {
      updateMut.mutate({ id: editingId, body });
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
            <ShieldCheck className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Risk Appetite Mapping</h1>
            <p className="text-sm text-muted-foreground">
              Map score ranges to risk categories with maker-checker approval
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
          <Button size="sm" onClick={openAddDialog}>
            <Plus className="mr-1 h-3 w-3" /> New Mapping
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm font-medium text-muted-foreground">Total Mappings</p>
            <p className="mt-1 text-2xl font-bold">{summary.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm font-medium text-muted-foreground">Authorized</p>
            <p className="mt-1 text-2xl font-bold text-green-600">{summary.authorized}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm font-medium text-muted-foreground">Pending Review</p>
            <p className="mt-1 text-2xl font-bold text-yellow-600">{summary.pending}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <Select value={entityFilter} onValueChange={setEntityFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Entity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="default">Default Entity</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Data Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Mappings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mapping Name</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Effective Dates</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead className="w-[80px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listQ.isLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 6 }).map((_, j) => (
                        <TableCell key={j}>
                          <div className="h-4 w-20 animate-pulse rounded bg-muted" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : mappings.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      No risk appetite mappings found
                    </TableCell>
                  </TableRow>
                ) : (
                  mappings.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">{m.mapping_name}</TableCell>
                      <TableCell className="text-sm">{m.entity_id}</TableCell>
                      <TableCell className="text-sm">
                        {fmtDate(m.effective_start_date)} - {fmtDate(m.effective_end_date)}
                      </TableCell>
                      <TableCell>
                        <Badge className={bc(m.status)}>{m.status}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">v{m.version ?? 1}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditDialog(m)}>
                              <Pencil className="mr-2 h-4 w-4" /> Edit
                            </DropdownMenuItem>
                            {(m.status === "UNAUTHORIZED" || m.status === "MODIFIED") && (
                              <>
                                <DropdownMenuItem onClick={() => authorizeMut.mutate(m.id)}>
                                  <CheckCircle2 className="mr-2 h-4 w-4" /> Authorize
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => rejectMut.mutate(m.id)}>
                                  <XCircle className="mr-2 h-4 w-4" /> Reject
                                </DropdownMenuItem>
                              </>
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
        </CardContent>
      </Card>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Edit Risk Appetite Mapping" : "Create Risk Appetite Mapping"}
            </DialogTitle>
            <DialogDescription>
              Configure the score-to-risk-category mapping bands.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Top-level fields */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium">Mapping Name</label>
                <Input
                  placeholder="e.g. Standard Risk Mapping 2026"
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

            {/* Bands Table */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Score Bands</label>
                <Button variant="outline" size="sm" onClick={addBand}>
                  <Plus className="mr-1 h-3 w-3" /> Add Band
                </Button>
              </div>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[100px]">Score From</TableHead>
                      <TableHead className="w-[100px]">Score To</TableHead>
                      <TableHead>Risk Category</TableHead>
                      <TableHead className="w-[100px]">Risk Code</TableHead>
                      <TableHead className="w-[60px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {formBands.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                          No bands defined. Click "Add Band" to start.
                        </TableCell>
                      </TableRow>
                    ) : (
                      formBands.map((band, idx) => (
                        <TableRow key={idx}>
                          <TableCell>
                            <Input
                              type="number"
                              min={0}
                              value={band.score_from}
                              onChange={(e) =>
                                updateBand(idx, "score_from", parseInt(e.target.value, 10) || 0)
                              }
                              className="w-20"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min={0}
                              value={band.score_to}
                              onChange={(e) =>
                                updateBand(idx, "score_to", parseInt(e.target.value, 10) || 0)
                              }
                              className="w-20"
                            />
                          </TableCell>
                          <TableCell>
                            <Select
                              value={String(band.risk_code)}
                              onValueChange={(val) => {
                                const code = parseInt(val, 10);
                                const cat = RISK_CATEGORIES.find((c) => c.code === code);
                                setFormBands((prev) => {
                                  const next = [...prev];
                                  next[idx] = {
                                    ...next[idx],
                                    risk_code: code,
                                    risk_category: cat?.label ?? next[idx].risk_category,
                                  };
                                  return next;
                                });
                              }}
                            >
                              <SelectTrigger className="w-[200px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {RISK_CATEGORIES.map((c) => (
                                  <SelectItem key={c.code} value={String(c.code)}>
                                    {c.code} - {c.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="text-center font-mono text-sm">
                            {band.risk_code}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeBand(idx)}
                              className="h-8 w-8"
                            >
                              <Trash2 className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving || !formName.trim() || !formStartDate}>
              {isSaving ? "Saving..." : editingId ? "Update Mapping" : "Create Mapping"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
