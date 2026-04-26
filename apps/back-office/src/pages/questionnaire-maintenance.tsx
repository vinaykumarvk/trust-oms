/**
 * Questionnaire Maintenance -- Risk Profiling Module
 *
 * CRUD management of questionnaires with maker-checker workflow,
 * nested question builder with answer options, score normalization,
 * and authorize/reject lifecycle.
 */

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/ui/card";
import { Badge } from "@ui/components/ui/badge";
import { Button } from "@ui/components/ui/button";
import { Input } from "@ui/components/ui/input";
import { Textarea } from "@ui/components/ui/textarea";
import { Checkbox } from "@ui/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@ui/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@ui/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@ui/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/components/ui/tabs";
import { toast } from "sonner";
import {
  Plus, Search, Pencil, Trash2, ShieldCheck, XCircle, ArrowLeft,
  ClipboardList, HelpCircle, ListOrdered, RefreshCw, ChevronDown, ChevronRight,
} from "lucide-react";

/* ---------- Constants ---------- */

const API = "/api/v1/risk-profiling";

const STATUS_COLORS: Record<string, string> = {
  UNAUTHORIZED: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
  MODIFIED: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  AUTHORIZED: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  REJECTED: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

const CUSTOMER_CATEGORIES = ["Individual", "Non-Individual", "Both"] as const;

const QUESTIONNAIRE_TYPES = [
  "FINANCIAL_PROFILING",
  "INVESTMENT_KNOWLEDGE",
  "SAF",
  "SURVEY",
  "FATCA",
  "PAMM_PRE_INVESTMENT",
] as const;

const SCORING_TYPES = ["WEIGHTED", "RANGE", "NONE"] as const;
const COMPUTATION_TYPES = ["SUM", "AVERAGE", "MAX", "MIN"] as const;

type QuestionnaireStatus = "UNAUTHORIZED" | "MODIFIED" | "AUTHORIZED" | "REJECTED";

/* ---------- Types ---------- */

interface AnswerOption {
  id?: number;
  answer_description: string;
  weightage: number;
}

interface NormalizationRange {
  min_score: number;
  max_score: number;
  normalized_value: number;
  label: string;
}

interface Question {
  id?: number;
  question_description: string;
  is_mandatory: boolean;
  is_multi_select: boolean;
  scoring_type: string;
  computation_type: string;
  display_order: number;
  options: AnswerOption[];
  normalization_ranges?: NormalizationRange[];
}

interface Questionnaire {
  id: number;
  questionnaire_name: string;
  customer_category: string;
  questionnaire_type: string;
  status: QuestionnaireStatus;
  effective_start_date: string | null;
  effective_end_date: string | null;
  valid_period_years: number | null;
  is_score: boolean;
  warning_text: string | null;
  acknowledgement_text: string | null;
  disclaimer_text: string | null;
  version: number;
  questions?: Question[];
  created_at: string;
  updated_at: string;
}

interface ListResponse {
  data: Questionnaire[];
  total: number;
  page: number;
  pageSize: number;
}

/* ---------- Auth Helper ---------- */

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

/* ---------- Helpers ---------- */

const fmtDate = (d: string | null | undefined) => {
  if (!d) return "--";
  try {
    return new Date(d).toLocaleDateString("en-PH", {
      month: "short", day: "numeric", year: "numeric",
    });
  } catch {
    return d;
  }
};

const bc = (key: string) => STATUS_COLORS[key] ?? "bg-muted text-foreground";

/* ---------- Empty Form Factories ---------- */

function emptyQuestionnaire() {
  return {
    questionnaire_name: "",
    customer_category: "Individual" as string,
    questionnaire_type: "FINANCIAL_PROFILING" as string,
    effective_start_date: new Date().toISOString().split('T')[0],
    effective_end_date: "",
    valid_period_years: 1,
    is_score: true,
    warning_text: "",
    acknowledgement_text: "",
    disclaimer_text: "",
  };
}

function emptyQuestion(order: number): Question {
  return {
    question_description: "",
    is_mandatory: true,
    is_multi_select: false,
    scoring_type: "WEIGHTED",
    computation_type: "SUM",
    display_order: order,
    options: [{ answer_description: "", weightage: 0 }],
  };
}

/* ========== Main Component ========== */

export default function QuestionnaireMaintenance() {
  const queryClient = useQueryClient();

  // View state
  const [activeView, setActiveView] = useState<"list" | "detail">("list");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // List filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortBy, setSortBy] = useState<string>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Dialog state
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [editingQuestionnaire, setEditingQuestionnaire] = useState<Questionnaire | null>(null);
  const [form, setForm] = useState(emptyQuestionnaire());

  // Delete confirmation
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);

  // Question builder dialog
  const [questionDialogOpen, setQuestionDialogOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [questionForm, setQuestionForm] = useState<Question>(emptyQuestion(1));

  // Normalization ranges dialog
  const [rangesDialogOpen, setRangesDialogOpen] = useState(false);
  const [rangesQuestionId, setRangesQuestionId] = useState<number | null>(null);
  const [normRanges, setNormRanges] = useState<NormalizationRange[]>([]);

  // ---- Queries ----

  const listQ = useQuery<ListResponse>({
    queryKey: ["questionnaires", search, statusFilter, categoryFilter, page, pageSize],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("entity_id", "default");
      params.set("page", String(page));
      params.set("page_size", String(pageSize));
      if (search) params.set("search", search);
      if (statusFilter !== "all") params.set("status", statusFilter);
      return apiFetch(`${API}/questionnaires?${params.toString()}`);
    },
    refetchInterval: 30_000,
  });

  const detailQ = useQuery<Questionnaire>({
    queryKey: ["questionnaire-detail", selectedId],
    queryFn: () => apiFetch(`${API}/questionnaires/${selectedId}`),
    enabled: !!selectedId && activeView === "detail",
    refetchInterval: 15_000,
  });

  const questionnaires = listQ.data?.data ?? [];
  const totalRecords = listQ.data?.total ?? 0;
  const detail = detailQ.data ?? null;

  // Client-side category filter
  const filtered = useMemo(() => {
    if (categoryFilter === "all") return questionnaires;
    return questionnaires.filter((q) => q.customer_category === categoryFilter);
  }, [questionnaires, categoryFilter]);

  const toggleSort = (col: string) => {
    if (sortBy === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(col);
      setSortDir("asc");
    }
  };

  const sortedQuestionnaires = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const aVal = (a as any)[sortBy] ?? "";
      const bVal = (b as any)[sortBy] ?? "";
      const cmp = String(aVal).localeCompare(String(bVal));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortBy, sortDir]);

  // ---- Mutations ----

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["questionnaires"] });
    queryClient.invalidateQueries({ queryKey: ["questionnaire-detail"] });
  };

  const createMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch(`${API}/questionnaires`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { invalidateAll(); setFormDialogOpen(false); toast.success("Record Modified Successfully"); },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      apiFetch(`${API}/questionnaires/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => { invalidateAll(); setFormDialogOpen(false); toast.success("Record Modified Successfully"); },
    onError: (err: Error) => toast.error(err.message),
  });

  const authorizeMut = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`${API}/questionnaires/${id}/authorize`, { method: "POST" }),
    onSuccess: () => { invalidateAll(); toast.success("Questionnaire authorized"); },
    onError: (err: Error) => toast.error(err.message),
  });

  const rejectMut = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`${API}/questionnaires/${id}/reject`, { method: "POST" }),
    onSuccess: () => { invalidateAll(); toast.success("Questionnaire rejected"); },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`${API}/questionnaires/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidateAll();
      setDeleteDialogOpen(false);
      if (selectedId === deleteTargetId) { setActiveView("list"); setSelectedId(null); }
      toast.success("Questionnaire deleted");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Question mutations
  const addQuestionMut = useMutation({
    mutationFn: ({ questionnaireId, body }: { questionnaireId: number; body: Record<string, unknown> }) =>
      apiFetch(`${API}/questionnaires/${questionnaireId}/questions`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { invalidateAll(); setQuestionDialogOpen(false); toast.success("Question added"); },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateQuestionMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      apiFetch(`${API}/questions/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => { invalidateAll(); setQuestionDialogOpen(false); toast.success("Question updated"); },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteQuestionMut = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`${API}/questions/${id}`, { method: "DELETE" }),
    onSuccess: () => { invalidateAll(); toast.success("Question deleted"); },
    onError: (err: Error) => toast.error(err.message),
  });

  // Option mutations
  const addOptionMut = useMutation({
    mutationFn: ({ questionId, body }: { questionId: number; body: Record<string, unknown> }) =>
      apiFetch(`${API}/questions/${questionId}/options`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { invalidateAll(); toast.success("Option added"); },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateOptionMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      apiFetch(`${API}/options/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => { invalidateAll(); toast.success("Option updated"); },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteOptionMut = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`${API}/options/${id}`, { method: "DELETE" }),
    onSuccess: () => { invalidateAll(); toast.success("Option deleted"); },
    onError: (err: Error) => toast.error(err.message),
  });

  // Normalization ranges mutation
  const setRangesMut = useMutation({
    mutationFn: ({ questionId, ranges }: { questionId: number; ranges: NormalizationRange[] }) =>
      apiFetch(`${API}/questions/${questionId}/normalization-ranges`, {
        method: "PUT", body: JSON.stringify({ ranges }),
      }),
    onSuccess: () => { invalidateAll(); setRangesDialogOpen(false); toast.success("Normalization ranges saved"); },
    onError: (err: Error) => toast.error(err.message),
  });

  // ---- Dialog Handlers ----

  const openCreateDialog = () => {
    setEditingQuestionnaire(null);
    setForm(emptyQuestionnaire());
    setFormDialogOpen(true);
  };

  const openEditDialog = (q: Questionnaire) => {
    setEditingQuestionnaire(q);
    setForm({
      questionnaire_name: q.questionnaire_name,
      customer_category: q.customer_category,
      questionnaire_type: q.questionnaire_type,
      effective_start_date: q.effective_start_date ?? "",
      effective_end_date: q.effective_end_date ?? "",
      valid_period_years: q.valid_period_years ?? 1,
      is_score: q.is_score,
      warning_text: q.warning_text ?? "",
      acknowledgement_text: q.acknowledgement_text ?? "",
      disclaimer_text: q.disclaimer_text ?? "",
    });
    setFormDialogOpen(true);
  };

  const handleSaveQuestionnaire = () => {
    const body = {
      questionnaire_name: form.questionnaire_name,
      customer_category: form.customer_category,
      questionnaire_type: form.questionnaire_type,
      effective_start_date: form.effective_start_date || null,
      effective_end_date: form.effective_end_date || null,
      valid_period_years: form.valid_period_years,
      is_score: form.is_score,
      warning_text: form.warning_text || null,
      acknowledgement_text: form.acknowledgement_text || null,
      disclaimer_text: form.disclaimer_text || null,
    };
    if (editingQuestionnaire) {
      updateMut.mutate({ id: editingQuestionnaire.id, body });
    } else {
      createMut.mutate(body);
    }
  };

  const openQuestionDialog = (q?: Question) => {
    if (q) {
      setEditingQuestion(q);
      setQuestionForm({ ...q });
    } else {
      setEditingQuestion(null);
      const nextOrder = (detail?.questions?.length ?? 0) + 1;
      setQuestionForm(emptyQuestion(nextOrder));
    }
    setQuestionDialogOpen(true);
  };

  const handleSaveQuestion = () => {
    const body = {
      question_description: questionForm.question_description,
      is_mandatory: questionForm.is_mandatory,
      is_multi_select: questionForm.is_multi_select,
      scoring_type: questionForm.scoring_type,
      computation_type: questionForm.computation_type,
      display_order: questionForm.display_order,
      options: questionForm.options,
    };
    if (editingQuestion?.id) {
      updateQuestionMut.mutate({ id: editingQuestion.id, body });
    } else if (selectedId) {
      addQuestionMut.mutate({ questionnaireId: selectedId, body });
    }
  };

  const openRangesDialog = (question: Question) => {
    if (!question.id) return;
    setRangesQuestionId(question.id);
    setNormRanges(
      question.normalization_ranges?.length
        ? [...question.normalization_ranges]
        : [{ min_score: 0, max_score: 0, normalized_value: 0, label: "" }],
    );
    setRangesDialogOpen(true);
  };

  const openDetailView = (q: Questionnaire) => {
    setSelectedId(q.id);
    setActiveView("detail");
  };

  const isSaving = createMut.isPending || updateMut.isPending;

  // ---- Render ----

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {activeView === "detail" && (
            <Button variant="ghost" size="sm" onClick={() => { setActiveView("list"); setSelectedId(null); }}>
              <ArrowLeft className="mr-1 h-4 w-4" /> Back
            </Button>
          )}
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <ClipboardList className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Questionnaire Maintenance</h1>
            <p className="text-sm text-muted-foreground">
              {activeView === "list"
                ? "Configure risk profiling questionnaires with maker-checker workflow"
                : detail?.questionnaire_name ?? "Questionnaire Detail"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => { listQ.refetch(); detailQ.refetch(); }} disabled={listQ.isFetching}>
            <RefreshCw className={`h-4 w-4 ${listQ.isFetching ? "animate-spin" : ""}`} />
          </Button>
          {activeView === "list" && (
            <Button size="sm" onClick={openCreateDialog}>
              <Plus className="mr-1 h-4 w-4" /> New Questionnaire
            </Button>
          )}
        </div>
      </div>

      {/* ============ LIST VIEW ============ */}
      {activeView === "list" && (
        <Tabs defaultValue="questionnaires">
          <TabsList>
            <TabsTrigger value="questionnaires">Questionnaires</TabsTrigger>
          </TabsList>
          <TabsContent value="questionnaires" className="space-y-4">
            {/* Filters */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative max-w-sm flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  className="pl-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="UNAUTHORIZED">Unauthorized</SelectItem>
                  <SelectItem value="MODIFIED">Modified</SelectItem>
                  <SelectItem value="AUTHORIZED">Authorized</SelectItem>
                  <SelectItem value="REJECTED">Rejected</SelectItem>
                </SelectContent>
              </Select>
              <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); setPage(1); }}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {CUSTOMER_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Data Table */}
            <Card>
              <CardContent className="pt-4">
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead
                          className="cursor-pointer hover:bg-muted/50 select-none"
                          onClick={() => toggleSort("questionnaire_name")}
                        >
                          Name {sortBy === "questionnaire_name" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                        </TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead
                          className="cursor-pointer hover:bg-muted/50 select-none"
                          onClick={() => toggleSort("status")}
                        >
                          Status {sortBy === "status" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                        </TableHead>
                        <TableHead>Effective Dates</TableHead>
                        <TableHead>Version</TableHead>
                        <TableHead className="w-[200px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {listQ.isLoading ? (
                        Array.from({ length: 5 }).map((_, i) => (
                          <TableRow key={i}>
                            {Array.from({ length: 7 }).map((_, j) => (
                              <TableCell key={j}><div className="h-4 w-full animate-pulse rounded bg-muted" /></TableCell>
                            ))}
                          </TableRow>
                        ))
                      ) : sortedQuestionnaires.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                            No questionnaires found
                          </TableCell>
                        </TableRow>
                      ) : (
                        sortedQuestionnaires.map((q) => (
                          <TableRow key={q.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openDetailView(q)}>
                            <TableCell className="font-medium">{q.questionnaire_name}</TableCell>
                            <TableCell>{q.customer_category}</TableCell>
                            <TableCell className="text-xs font-mono">{q.questionnaire_type.replace(/_/g, " ")}</TableCell>
                            <TableCell>
                              <Badge className={bc(q.status)}>{q.status}</Badge>
                            </TableCell>
                            <TableCell className="text-sm">
                              {fmtDate(q.effective_start_date)} - {fmtDate(q.effective_end_date)}
                            </TableCell>
                            <TableCell className="font-mono">v{q.version}</TableCell>
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <div className="flex gap-1 flex-wrap">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => openEditDialog(q)}
                                  disabled={q.status === 'AUTHORIZED' || q.status === 'REJECTED'}
                                  className={q.status === 'AUTHORIZED' || q.status === 'REJECTED' ? "opacity-40 cursor-not-allowed" : ""}
                                >
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                {(q.status === "UNAUTHORIZED" || q.status === "MODIFIED") && (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => authorizeMut.mutate(q.id)}
                                      disabled={authorizeMut.isPending}
                                    >
                                      <ShieldCheck className="mr-1 h-3 w-3" /> Authorize
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      onClick={() => rejectMut.mutate(q.id)}
                                      disabled={rejectMut.isPending}
                                    >
                                      <XCircle className="mr-1 h-3 w-3" /> Reject
                                    </Button>
                                  </>
                                )}
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-destructive hover:text-destructive"
                                  onClick={() => { setDeleteTargetId(q.id); setDeleteDialogOpen(true); }}
                                  disabled={q.status === 'AUTHORIZED'}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
                {/* Pagination */}
                {totalRecords > pageSize && (
                  <div className="flex items-center justify-between pt-4">
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-muted-foreground">
                        Page {page} of {Math.ceil(totalRecords / pageSize)}
                      </p>
                      <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(parseInt(v, 10)); setPage(1); }}>
                        <SelectTrigger className="w-[80px] h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="10">10</SelectItem>
                          <SelectItem value="25">25</SelectItem>
                          <SelectItem value="50">50</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                        Previous
                      </Button>
                      <Button size="sm" variant="outline" disabled={page * pageSize >= totalRecords} onClick={() => setPage(page + 1)}>
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {/* ============ DETAIL VIEW ============ */}
      {activeView === "detail" && detail && (
        <div className="space-y-6">
          {/* Questionnaire Header Card */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <ClipboardList className="h-5 w-5" />
                  {detail.questionnaire_name}
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Badge className={bc(detail.status)}>{detail.status}</Badge>
                  <Badge variant="outline">v{detail.version}</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Category</span>
                  <p className="font-medium">{detail.customer_category}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Type</span>
                  <p className="font-medium">{detail.questionnaire_type.replace(/_/g, " ")}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Effective Period</span>
                  <p className="font-medium">{fmtDate(detail.effective_start_date)} - {fmtDate(detail.effective_end_date)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Valid Period</span>
                  <p className="font-medium">{detail.valid_period_years ?? "--"} year(s)</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Scoring Enabled</span>
                  <p className="font-medium">{detail.is_score ? "Yes" : "No"}</p>
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <span className="text-muted-foreground">Warning Text</span>
                  <p className="font-medium text-xs">{detail.warning_text || "--"}</p>
                </div>
              </div>

              {/* Maker-checker actions */}
              {(detail.status === "UNAUTHORIZED" || detail.status === "MODIFIED") && (
                <div className="flex gap-2 mt-4 pt-4 border-t">
                  <Button size="sm" onClick={() => authorizeMut.mutate(detail.id)} disabled={authorizeMut.isPending}>
                    <ShieldCheck className="mr-1 h-3 w-3" />
                    {authorizeMut.isPending ? "Authorizing..." : "Authorize"}
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => rejectMut.mutate(detail.id)} disabled={rejectMut.isPending}>
                    <XCircle className="mr-1 h-3 w-3" />
                    {rejectMut.isPending ? "Rejecting..." : "Reject"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => openEditDialog(detail)}>
                    <Pencil className="mr-1 h-3 w-3" /> Edit
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Question Builder */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <HelpCircle className="h-4 w-4" /> Questions ({detail.questions?.length ?? 0})
                </CardTitle>
                <Button size="sm" onClick={() => openQuestionDialog()}>
                  <Plus className="mr-1 h-3 w-3" /> Add Question
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {!detail.questions || detail.questions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                  <ListOrdered className="h-10 w-10 text-muted-foreground/50" />
                  <p>No questions configured. Click "Add Question" to get started.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {detail.questions.map((question, idx) => (
                    <QuestionCard
                      key={question.id ?? idx}
                      question={question}
                      index={idx}
                      onEdit={() => openQuestionDialog(question)}
                      onDelete={() => { if (question.id) deleteQuestionMut.mutate(question.id); }}
                      onEditRanges={() => openRangesDialog(question)}
                      onAddOption={(questionId, body) => addOptionMut.mutate({ questionId, body })}
                      onUpdateOption={(id, body) => updateOptionMut.mutate({ id, body })}
                      onDeleteOption={(id) => deleteOptionMut.mutate(id)}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeView === "detail" && !detail && detailQ.isLoading && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="h-6 w-48 animate-pulse rounded bg-muted" />
            <div className="h-4 w-64 animate-pulse rounded bg-muted" />
            <div className="h-4 w-32 animate-pulse rounded bg-muted" />
          </CardContent>
        </Card>
      )}

      {/* ============ CREATE/EDIT DIALOG ============ */}
      <Dialog open={formDialogOpen} onOpenChange={setFormDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingQuestionnaire ? "Edit Questionnaire" : "Create Questionnaire"}
            </DialogTitle>
            <DialogDescription>
              {editingQuestionnaire
                ? "Update the questionnaire configuration. Changes will set status to MODIFIED."
                : "Create a new questionnaire. It will start in UNAUTHORIZED status."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label htmlFor="qm-name" className="text-sm font-medium">Questionnaire Name *</label>
              <Input
                id="qm-name"
                value={form.questionnaire_name}
                onChange={(e) => setForm({ ...form, questionnaire_name: e.target.value })}
                placeholder="e.g. Individual Risk Assessment"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Customer Category *</label>
                <Select value={form.customer_category} onValueChange={(v) => setForm({ ...form, customer_category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CUSTOMER_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Questionnaire Type *</label>
                <Select value={form.questionnaire_type} onValueChange={(v) => setForm({ ...form, questionnaire_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {QUESTIONNAIRE_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label htmlFor="qm-eff-start" className="text-sm font-medium">Effective Start</label>
                <Input
                  id="qm-eff-start"
                  type="date"
                  value={form.effective_start_date}
                  onChange={(e) => setForm({ ...form, effective_start_date: e.target.value })}
                />
              </div>
              <div>
                <label htmlFor="qm-eff-end" className="text-sm font-medium">Effective End</label>
                <Input
                  id="qm-eff-end"
                  type="date"
                  value={form.effective_end_date}
                  onChange={(e) => setForm({ ...form, effective_end_date: e.target.value })}
                />
              </div>
              <div>
                <label htmlFor="qm-valid-period" className="text-sm font-medium">Valid Period (years)</label>
                <Input
                  id="qm-valid-period"
                  type="number"
                  min={1}
                  value={form.valid_period_years}
                  onChange={(e) => setForm({ ...form, valid_period_years: parseInt(e.target.value, 10) || 1 })}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="is-score"
                checked={form.is_score}
                onCheckedChange={(checked) => setForm({ ...form, is_score: !!checked })}
              />
              <label htmlFor="is-score" className="text-sm font-medium">Enable Scoring</label>
            </div>
            <div>
              <label htmlFor="qm-warning" className="text-sm font-medium">Warning Text</label>
              <Textarea
                id="qm-warning"
                value={form.warning_text}
                onChange={(e) => setForm({ ...form, warning_text: e.target.value })}
                placeholder="Displayed as a warning to the user..."
                rows={2}
              />
            </div>
            <div>
              <label htmlFor="qm-ack" className="text-sm font-medium">Acknowledgement Text</label>
              <Textarea
                id="qm-ack"
                value={form.acknowledgement_text}
                onChange={(e) => setForm({ ...form, acknowledgement_text: e.target.value })}
                placeholder="User must acknowledge before submission..."
                rows={2}
              />
            </div>
            <div>
              <label htmlFor="qm-disclaimer" className="text-sm font-medium">Disclaimer Text</label>
              <Textarea
                id="qm-disclaimer"
                value={form.disclaimer_text}
                onChange={(e) => setForm({ ...form, disclaimer_text: e.target.value })}
                placeholder="Legal disclaimer shown on questionnaire..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveQuestionnaire} disabled={isSaving || !form.questionnaire_name.trim()}>
              {isSaving ? "Saving..." : editingQuestionnaire ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ DELETE CONFIRMATION ============ */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Delete Questionnaire</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this questionnaire? This is a soft delete and can be reversed by an administrator.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => { if (deleteTargetId) deleteMut.mutate(deleteTargetId); }}
              disabled={deleteMut.isPending}
            >
              {deleteMut.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ QUESTION DIALOG ============ */}
      <Dialog open={questionDialogOpen} onOpenChange={setQuestionDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingQuestion?.id ? "Edit Question" : "Add Question"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label htmlFor="qm-q-desc" className="text-sm font-medium">Question Description *</label>
              <Textarea
                id="qm-q-desc"
                value={questionForm.question_description}
                onChange={(e) => setQuestionForm({ ...questionForm, question_description: e.target.value })}
                placeholder="Enter the question text..."
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Scoring Type</label>
                <Select
                  value={questionForm.scoring_type}
                  onValueChange={(v) => setQuestionForm({ ...questionForm, scoring_type: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SCORING_TYPES.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Computation Type</label>
                <Select
                  value={questionForm.computation_type}
                  onValueChange={(v) => setQuestionForm({ ...questionForm, computation_type: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COMPUTATION_TYPES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label htmlFor="qm-q-order" className="text-sm font-medium">Display Order</label>
                <Input
                  id="qm-q-order"
                  type="number"
                  min={1}
                  value={questionForm.display_order}
                  onChange={(e) => setQuestionForm({ ...questionForm, display_order: parseInt(e.target.value, 10) || 1 })}
                />
              </div>
              <div className="flex items-center gap-2 pt-6">
                <Checkbox
                  id="q-mandatory"
                  checked={questionForm.is_mandatory}
                  onCheckedChange={(checked) => setQuestionForm({ ...questionForm, is_mandatory: !!checked })}
                />
                <label htmlFor="q-mandatory" className="text-sm">Mandatory</label>
              </div>
              <div className="flex items-center gap-2 pt-6">
                <Checkbox
                  id="q-multi"
                  checked={questionForm.is_multi_select}
                  onCheckedChange={(checked) => setQuestionForm({ ...questionForm, is_multi_select: !!checked })}
                />
                <label htmlFor="q-multi" className="text-sm">Multi-Select</label>
              </div>
            </div>

            {/* Inline Answer Options */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Answer Options</label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setQuestionForm({
                      ...questionForm,
                      options: [...questionForm.options, { answer_description: "", weightage: 0 }],
                    })
                  }
                >
                  <Plus className="mr-1 h-3 w-3" /> Add Option
                </Button>
              </div>
              {questionForm.options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    placeholder="Answer description"
                    className="flex-1"
                    value={opt.answer_description}
                    onChange={(e) => {
                      const newOpts = [...questionForm.options];
                      newOpts[i] = { ...newOpts[i], answer_description: e.target.value };
                      setQuestionForm({ ...questionForm, options: newOpts });
                    }}
                  />
                  <Input
                    type="number"
                    placeholder="Weightage"
                    className="w-24"
                    value={opt.weightage}
                    onChange={(e) => {
                      const newOpts = [...questionForm.options];
                      newOpts[i] = { ...newOpts[i], weightage: parseFloat(e.target.value) || 0 };
                      setQuestionForm({ ...questionForm, options: newOpts });
                    }}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      const newOpts = questionForm.options.filter((_, j) => j !== i);
                      setQuestionForm({ ...questionForm, options: newOpts.length ? newOpts : [{ answer_description: "", weightage: 0 }] });
                    }}
                  >
                    <Trash2 className="h-3 w-3 text-muted-foreground" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuestionDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleSaveQuestion}
              disabled={addQuestionMut.isPending || updateQuestionMut.isPending || !questionForm.question_description.trim()}
            >
              {(addQuestionMut.isPending || updateQuestionMut.isPending)
                ? "Saving..."
                : editingQuestion?.id ? "Update Question" : "Add Question"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ NORMALIZATION RANGES DIALOG ============ */}
      <Dialog open={rangesDialogOpen} onOpenChange={setRangesDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Score Normalization Ranges</DialogTitle>
            <DialogDescription>
              Define score ranges and their normalized values for RANGE scoring type.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {normRanges.map((range, i) => (
              <div key={i} className="grid grid-cols-5 gap-2 items-end">
                <div>
                  <label className="text-xs text-muted-foreground">Min</label>
                  <Input
                    type="number"
                    value={range.min_score}
                    onChange={(e) => {
                      const updated = [...normRanges];
                      updated[i] = { ...updated[i], min_score: parseFloat(e.target.value) || 0 };
                      setNormRanges(updated);
                    }}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Max</label>
                  <Input
                    type="number"
                    value={range.max_score}
                    onChange={(e) => {
                      const updated = [...normRanges];
                      updated[i] = { ...updated[i], max_score: parseFloat(e.target.value) || 0 };
                      setNormRanges(updated);
                    }}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Normalized</label>
                  <Input
                    type="number"
                    value={range.normalized_value}
                    onChange={(e) => {
                      const updated = [...normRanges];
                      updated[i] = { ...updated[i], normalized_value: parseFloat(e.target.value) || 0 };
                      setNormRanges(updated);
                    }}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Label</label>
                  <Input
                    value={range.label}
                    onChange={(e) => {
                      const updated = [...normRanges];
                      updated[i] = { ...updated[i], label: e.target.value };
                      setNormRanges(updated);
                    }}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    const updated = normRanges.filter((_, j) => j !== i);
                    setNormRanges(updated.length ? updated : [{ min_score: 0, max_score: 0, normalized_value: 0, label: "" }]);
                  }}
                >
                  <Trash2 className="h-3 w-3 text-muted-foreground" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setNormRanges([...normRanges, { min_score: 0, max_score: 0, normalized_value: 0, label: "" }])}
            >
              <Plus className="mr-1 h-3 w-3" /> Add Range
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRangesDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => { if (rangesQuestionId) setRangesMut.mutate({ questionId: rangesQuestionId, ranges: normRanges }); }}
              disabled={setRangesMut.isPending}
            >
              {setRangesMut.isPending ? "Saving..." : "Save Ranges"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ========== QuestionCard Sub-component ========== */

function QuestionCard({
  question,
  index,
  onEdit,
  onDelete,
  onEditRanges,
  onAddOption,
  onUpdateOption,
  onDeleteOption,
}: {
  question: Question;
  index: number;
  onEdit: () => void;
  onDelete: () => void;
  onEditRanges: () => void;
  onAddOption: (questionId: number, body: Record<string, unknown>) => void;
  onUpdateOption: (id: number, body: Record<string, unknown>) => void;
  onDeleteOption: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [newOptDesc, setNewOptDesc] = useState("");
  const [newOptWeight, setNewOptWeight] = useState(0);

  return (
    <div className="rounded-md border p-3 space-y-2">
      {/* Question Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 flex-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 mt-0.5 shrink-0"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
          <div className="flex-1">
            <p className="text-sm font-medium">
              <span className="text-muted-foreground mr-1">Q{index + 1}.</span>
              {question.question_description}
            </p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {question.is_mandatory && <Badge variant="outline" className="text-xs">Mandatory</Badge>}
              {question.is_multi_select && <Badge variant="outline" className="text-xs">Multi-Select</Badge>}
              <Badge variant="secondary" className="text-xs">{question.scoring_type}</Badge>
              <Badge variant="secondary" className="text-xs">{question.computation_type}</Badge>
              <span className="text-xs text-muted-foreground">{question.options.length} option(s)</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {question.scoring_type === "RANGE" && (
            <Button variant="outline" size="sm" className="text-xs h-7" onClick={onEditRanges}>
              Ranges
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
            <Pencil className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={onDelete}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Expanded: Options */}
      {expanded && (
        <div className="ml-8 space-y-2 pt-2 border-t">
          <p className="text-xs font-medium text-muted-foreground">Answer Options</p>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Description</TableHead>
                  <TableHead className="text-xs w-24">Weightage</TableHead>
                  <TableHead className="text-xs w-20">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {question.options.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-xs text-muted-foreground py-4">
                      No options defined
                    </TableCell>
                  </TableRow>
                ) : (
                  question.options.map((opt, oi) => (
                    <TableRow key={opt.id ?? oi}>
                      <TableCell className="text-sm">{opt.answer_description}</TableCell>
                      <TableCell className="font-mono text-sm">{opt.weightage}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {opt.id && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-destructive hover:text-destructive"
                              onClick={() => onDeleteOption(opt.id!)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Add option inline */}
          {question.id && (
            <div className="flex items-center gap-2">
              <Input
                placeholder="New option description"
                className="flex-1 text-sm"
                value={newOptDesc}
                onChange={(e) => setNewOptDesc(e.target.value)}
              />
              <Input
                type="number"
                placeholder="Weight"
                className="w-20 text-sm"
                value={newOptWeight}
                onChange={(e) => setNewOptWeight(parseFloat(e.target.value) || 0)}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={!newOptDesc.trim()}
                onClick={() => {
                  onAddOption(question.id!, { answer_description: newOptDesc, weightage: newOptWeight });
                  setNewOptDesc("");
                  setNewOptWeight(0);
                }}
              >
                <Plus className="mr-1 h-3 w-3" /> Add
              </Button>
            </div>
          )}

          {/* Normalization Ranges display (if RANGE scoring) */}
          {question.scoring_type === "RANGE" && question.normalization_ranges && question.normalization_ranges.length > 0 && (
            <div className="pt-2">
              <p className="text-xs font-medium text-muted-foreground mb-1">Normalization Ranges</p>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Min Score</TableHead>
                      <TableHead className="text-xs">Max Score</TableHead>
                      <TableHead className="text-xs">Normalized Value</TableHead>
                      <TableHead className="text-xs">Label</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {question.normalization_ranges.map((range, ri) => (
                      <TableRow key={ri}>
                        <TableCell className="text-xs font-mono">{range.min_score}</TableCell>
                        <TableCell className="text-xs font-mono">{range.max_score}</TableCell>
                        <TableCell className="text-xs font-mono">{range.normalized_value}</TableCell>
                        <TableCell className="text-xs">{range.label}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
