/**
 * Fee Plan Template Library — TrustFees Pro Phase 4
 *
 * Manages reusable fee plan templates with JSONB default_payload.
 * Supports CRUD, toggle active, preview instantiated fields,
 * category filtering, and dark mode.
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@ui/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ui/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@ui/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@ui/components/ui/dropdown-menu";
import { FileStack, RefreshCw, Plus, MoreHorizontal, Eye, ToggleLeft, Pencil, CheckCircle, XCircle } from "lucide-react";

/* ---------- Types ---------- */
interface FeePlanTemplate {
  id: number;
  template_code: string;
  template_name: string;
  category: string;
  default_payload: Record<string, unknown>;
  jurisdiction_id: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/* ---------- Constants ---------- */
const CATEGORIES = ["TRUST_DISC", "TRUST_DIR", "RETIREMENT", "ESCROW", "TXN", "ADHOC"] as const;
const CATEGORY_LABELS: Record<string, string> = {
  TRUST_DISC: "Trust (Discretionary)",
  TRUST_DIR: "Trust (Directed)",
  RETIREMENT: "Retirement",
  ESCROW: "Escrow",
  TXN: "Transaction",
  ADHOC: "Ad Hoc",
};
const CATEGORY_COLORS: Record<string, string> = {
  TRUST_DISC: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  TRUST_DIR: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400",
  RETIREMENT: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  ESCROW: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400",
  TXN: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  ADHOC: "bg-gray-100 text-gray-600 dark:bg-gray-800/30 dark:text-gray-400",
};

/* ---------- Helpers ---------- */
const bc = (map: Record<string, string>, key: string) => map[key] ?? "bg-muted text-foreground";
const fmtDate = (d: string) => { try { return new Date(d).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }); } catch { return d; } };

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

/** Default skeleton for a new template payload */
const DEFAULT_PAYLOAD = {
  fee_plan_name: "",
  charge_basis: "AUM",
  fee_type: "TRUSTEE",
  source_party: "TRUSTEE",
  target_party: "CLIENT",
  comparison_basis: "MARKET_VALUE",
  value_basis: "AUM",
  rate_type: "FLAT",
  effective_date: "",
};

/** Default empty form state */
const emptyForm = {
  template_code: "",
  template_name: "",
  category: "TRUST_DISC" as string,
  default_payload_json: JSON.stringify(DEFAULT_PAYLOAD, null, 2),
  is_active: true,
};

/* ========== Main Component ========== */
export default function FeePlanTemplates() {
  const qc = useQueryClient();
  const [dlgOpen, setDlgOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [jsonError, setJsonError] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [dlgTab, setDlgTab] = useState<string>("edit");
  const [previewData, setPreviewData] = useState<Record<string, unknown> | null>(null);

  // --- Queries ---
  const listQ = useQuery<{ data: FeePlanTemplate[]; total: number }>({
    queryKey: ["fee-plan-templates", categoryFilter, search],
    queryFn: () => {
      const params = new URLSearchParams();
      if (categoryFilter !== "ALL") params.set("category", categoryFilter);
      if (search) params.set("search", search);
      params.set("pageSize", "100");
      return apiRequest("GET", apiUrl(`/api/v1/fee-plan-templates?${params}`));
    },
    refetchInterval: 30_000,
  });

  const items = listQ.data?.data ?? [];
  const totalCount = listQ.data?.total ?? 0;
  const activeCount = items.filter((t) => t.is_active).length;

  // Category breakdown
  const categoryCounts: Record<string, number> = {};
  items.forEach((t) => { categoryCounts[t.category] = (categoryCounts[t.category] ?? 0) + 1; });

  // --- Mutations ---
  const createMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiRequest("POST", apiUrl("/api/v1/fee-plan-templates"), body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fee-plan-templates"] }); closeDlg(); },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) => apiRequest("PUT", apiUrl(`/api/v1/fee-plan-templates/${id}`), body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fee-plan-templates"] }); closeDlg(); },
  });

  const toggleMut = useMutation({
    mutationFn: (id: number) => apiRequest("POST", apiUrl(`/api/v1/fee-plan-templates/${id}/toggle-active`)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fee-plan-templates"] }); },
  });

  // --- Dialog helpers ---
  const openCreate = () => {
    setEditId(null);
    setForm({ ...emptyForm });
    setJsonError("");
    setDlgTab("edit");
    setPreviewData(null);
    setDlgOpen(true);
  };

  const openEdit = (t: FeePlanTemplate) => {
    setEditId(t.id);
    setForm({
      template_code: t.template_code,
      template_name: t.template_name,
      category: t.category,
      default_payload_json: JSON.stringify(t.default_payload, null, 2),
      is_active: t.is_active,
    });
    setJsonError("");
    setDlgTab("edit");
    setPreviewData(null);
    setDlgOpen(true);
  };

  const closeDlg = () => { setDlgOpen(false); setEditId(null); setJsonError(""); setPreviewData(null); };

  const loadPreview = async (templateId: number) => {
    try {
      const result = await apiRequest("GET", apiUrl(`/api/v1/fee-plan-templates/${templateId}/instantiate`));
      setPreviewData(result.data ?? result);
    } catch {
      setPreviewData({ error: "Failed to load preview" });
    }
  };

  const handleSave = () => {
    let parsedPayload: Record<string, unknown>;
    try {
      parsedPayload = JSON.parse(form.default_payload_json);
    } catch {
      setJsonError("Invalid JSON in default payload");
      return;
    }
    setJsonError("");

    const body = {
      template_code: form.template_code,
      template_name: form.template_name,
      category: form.category,
      default_payload: parsedPayload,
      is_active: form.is_active,
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
            <FileStack className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Fee Plan Templates</h1>
            <p className="text-sm text-muted-foreground">Reusable templates for rapid fee plan creation</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => listQ.refetch()} disabled={listQ.isFetching}>
            <RefreshCw className={`h-4 w-4 ${listQ.isFetching ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" onClick={openCreate}><Plus className="mr-1 h-3 w-3" /> Add Template</Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard title="Total Templates" value={totalCount} icon={FileStack} accent="bg-blue-600" />
        <SummaryCard title="Active" value={activeCount} icon={CheckCircle} accent="bg-green-600" />
        <SummaryCard title="Categories Used" value={Object.keys(categoryCounts).length} icon={FileStack} accent="bg-indigo-600" />
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm font-medium text-muted-foreground mb-2">By Category</p>
            <div className="flex flex-wrap gap-1">
              {Object.entries(categoryCounts).map(([cat, count]) => (
                <Badge key={cat} variant="outline" className="text-xs">{CATEGORY_LABELS[cat] ?? cat}: {count}</Badge>
              ))}
              {Object.keys(categoryCounts).length === 0 && <span className="text-xs text-muted-foreground">No templates yet</span>}
            </div>
          </CardContent>
        </Card>
      </div>

      <Separator />

      {/* Filters */}
      <div className="flex items-center gap-3">
        <Input placeholder="Search by code or name..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[220px]"><SelectValue placeholder="Filter by category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Categories</SelectItem>
            {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Data Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Templates</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  {["Code", "Name", "Category", "Jurisdiction", "Active", "Last Updated", "Actions"].map((h) => (
                    <TableHead key={h}>{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {listQ.isLoading ? <SkeletonRows cols={7} /> : items.length === 0 ? <EmptyRow cols={7} msg="No fee plan templates found" /> :
                  items.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-mono text-sm">{t.template_code}</TableCell>
                      <TableCell className="font-medium">{t.template_name}</TableCell>
                      <TableCell><Badge className={bc(CATEGORY_COLORS, t.category)}>{CATEGORY_LABELS[t.category] ?? t.category}</Badge></TableCell>
                      <TableCell className="text-sm">{t.jurisdiction_id ?? "\u2014"}</TableCell>
                      <TableCell>
                        {t.is_active ? (
                          <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">Active</Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">Inactive</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">{fmtDate(t.updated_at)}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm"><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEdit(t)}>
                              <Pencil className="mr-2 h-3 w-3" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => toggleMut.mutate(t.id)}>
                              <ToggleLeft className="mr-2 h-3 w-3" /> {t.is_active ? "Deactivate" : "Activate"}
                            </DropdownMenuItem>
                            {t.is_active && (
                              <DropdownMenuItem onClick={() => { setEditId(t.id); setDlgTab("preview"); loadPreview(t.id); setDlgOpen(true); setForm({ ...emptyForm, template_code: t.template_code, template_name: t.template_name, category: t.category, default_payload_json: JSON.stringify(t.default_payload, null, 2), is_active: t.is_active }); }}>
                                <Eye className="mr-2 h-3 w-3" /> Preview Instantiate
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
            <DialogTitle>{editId ? "Edit Fee Plan Template" : "Add Fee Plan Template"}</DialogTitle>
          </DialogHeader>

          <Tabs value={dlgTab} onValueChange={setDlgTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="edit">Edit</TabsTrigger>
              {editId && <TabsTrigger value="preview" onClick={() => editId && loadPreview(editId)}>Preview</TabsTrigger>}
            </TabsList>

            <TabsContent value="edit">
              <div className="space-y-4 py-2">
                {/* Basic Info */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Template Code</label>
                    <Input value={form.template_code} onChange={(e) => setForm((f) => ({ ...f, template_code: e.target.value }))} placeholder="e.g. TPL-TRUST-DISC-01" disabled={!!editId} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Template Name</label>
                    <Input value={form.template_name} onChange={(e) => setForm((f) => ({ ...f, template_name: e.target.value }))} placeholder="e.g. Standard Trust Discretionary" />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium">Category</label>
                  <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <Separator />

                {/* JSON Editor */}
                <div className="space-y-1">
                  <label className="text-sm font-medium">Default Payload (FeePlan skeleton)</label>
                  <textarea
                    className="w-full min-h-[250px] rounded-md border border-input bg-background px-3 py-2 text-sm font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-muted/30"
                    value={form.default_payload_json}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, default_payload_json: e.target.value }));
                      setJsonError("");
                    }}
                    spellCheck={false}
                  />
                  {jsonError && <p className="text-sm text-red-600 dark:text-red-400">{jsonError}</p>}
                </div>

                {/* Active Toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Active</p>
                    <p className="text-xs text-muted-foreground">Only active templates can be instantiated</p>
                  </div>
                  <Switch checked={form.is_active} onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))} />
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={closeDlg}>Cancel</Button>
                <Button onClick={handleSave} disabled={isSaving || !form.template_code.trim() || !form.template_name.trim()}>
                  {isSaving ? "Saving..." : editId ? "Update Template" : "Create Template"}
                </Button>
              </DialogFooter>
            </TabsContent>

            <TabsContent value="preview">
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  This shows the pre-filled FeePlan fields that would be created when this template is instantiated.
                </p>
                {previewData ? (
                  <div className="rounded-md border bg-muted/20 p-4 dark:bg-muted/10">
                    <pre className="text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                      {JSON.stringify(previewData, null, 2)}
                    </pre>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                )}
              </div>
              <DialogFooter className="mt-4">
                <Button variant="outline" onClick={closeDlg}>Close</Button>
              </DialogFooter>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}
