/**
 * Eligibility Expression Library — TrustFees Pro Phase 3
 *
 * Visual expression builder with JSON mode toggle, approval lifecycle,
 * and live test evaluation with trace tree display.
 * Auto-refreshes every 30 seconds.
 */
import { useState, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@ui/lib/queryClient";
import { apiUrl } from "@ui/lib/api-url";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/ui/card";
import { Badge } from "@ui/components/ui/badge";
import { Button } from "@ui/components/ui/button";
import { Input } from "@ui/components/ui/input";
import { Textarea } from "@ui/components/ui/textarea";
import { Separator } from "@ui/components/ui/separator";
import { Skeleton } from "@ui/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import {
  Library,
  RefreshCw,
  Plus,
  MoreHorizontal,
  Pencil,
  Send,
  Archive,
  FlaskConical,
  CheckCircle2,
  XCircle,
  ChevronRight,
  ChevronDown,
  Trash2,
  PlusCircle,
  FolderPlus,
  Code2,
  Layers,
} from "lucide-react";

/* ========== Types ========== */

interface ASTNode {
  op: "AND" | "OR" | "NOT" | "EQ" | "NEQ" | "IN" | "BETWEEN";
  field?: string;
  value?: any;
  children?: ASTNode[];
}

interface TraceNode {
  op: string;
  field?: string;
  value?: any;
  result: boolean;
  children?: TraceNode[];
}

interface EligibilityExpression {
  id: number;
  eligibility_code: string;
  eligibility_name: string;
  expression: ASTNode;
  library_status: "DRAFT" | "PENDING_APPROVAL" | "ACTIVE" | "RETIRED";
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

/* ========== Constants ========== */

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  PENDING_APPROVAL: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  ACTIVE: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  RETIRED: "bg-muted text-muted-foreground",
};

const FIELD_OPTIONS = [
  { value: "asset_class", label: "Asset Class" },
  { value: "sub_asset_class", label: "Sub-Asset Class" },
  { value: "security_id", label: "Security ID" },
  { value: "security_type", label: "Security Type" },
  { value: "customer_id", label: "Customer ID" },
  { value: "customer_type", label: "Customer Type" },
  { value: "portfolio_id", label: "Portfolio ID" },
  { value: "portfolio_type", label: "Portfolio Type" },
  { value: "customer_domicile", label: "Customer Domicile" },
  { value: "market", label: "Market" },
  { value: "market_group", label: "Market Group" },
  { value: "broker_id", label: "Broker ID" },
  { value: "event_type", label: "Event Type" },
  { value: "txn_subtype", label: "Transaction Subtype" },
];

const OPERATOR_OPTIONS = [
  { value: "EQ", label: "Equals (=)" },
  { value: "NEQ", label: "Not Equals (!=)" },
  { value: "IN", label: "In List" },
  { value: "BETWEEN", label: "Between" },
];

/* ========== Helpers ========== */

const bc = (map: Record<string, string>, key: string) =>
  map[key] ?? "bg-muted text-foreground";

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

/** Summarize an AST node into a human-readable short string */
function summarizeExpression(node: ASTNode, maxLen = 80): string {
  if (!node || !node.op) return "(empty)";

  if (node.op === "AND" || node.op === "OR") {
    const parts = (node.children ?? []).map((c) => summarizeExpression(c, 40));
    const joined = parts.join(` ${node.op} `);
    return joined.length > maxLen ? joined.slice(0, maxLen - 3) + "..." : joined;
  }

  if (node.op === "NOT") {
    return `NOT(${summarizeExpression(node.children?.[0] ?? ({} as ASTNode), maxLen - 5)})`;
  }

  const f = node.field ?? "?";
  if (node.op === "EQ") return `${f} = ${JSON.stringify(node.value)}`;
  if (node.op === "NEQ") return `${f} != ${JSON.stringify(node.value)}`;
  if (node.op === "IN")
    return `${f} IN [${Array.isArray(node.value) ? node.value.join(", ") : "?"}]`;
  if (node.op === "BETWEEN")
    return `${f} BETWEEN ${Array.isArray(node.value) ? node.value.join(" AND ") : "?"}`;

  return node.op;
}

/** Create a blank condition */
function newCondition(): ASTNode {
  return { op: "EQ", field: "asset_class", value: "" };
}

/** Create a blank group */
function newGroup(): ASTNode {
  return { op: "AND", children: [newCondition()] };
}

/* ========== Summary Card ========== */

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
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-lg ${accent}`}
          >
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
      <TableCell
        colSpan={cols}
        className="py-8 text-center text-muted-foreground"
      >
        {msg}
      </TableCell>
    </TableRow>
  );
}

/* ========== Condition Row (visual builder) ========== */

function ConditionRow({
  node,
  onChange,
  onRemove,
}: {
  node: ASTNode;
  onChange: (updated: ASTNode) => void;
  onRemove: () => void;
}) {
  const handleFieldChange = (field: string) => {
    onChange({ ...node, field });
  };

  const handleOpChange = (op: string) => {
    const newNode: ASTNode = { ...node, op: op as ASTNode["op"] };
    if (op === "IN" && !Array.isArray(node.value)) {
      newNode.value = node.value ? [node.value] : [];
    } else if (op === "BETWEEN" && !Array.isArray(node.value)) {
      newNode.value = ["", ""];
    } else if ((op === "EQ" || op === "NEQ") && Array.isArray(node.value)) {
      newNode.value = node.value[0] ?? "";
    }
    onChange(newNode);
  };

  return (
    <div className="flex items-center gap-2 rounded-md border border-dashed p-2">
      <Select value={node.field ?? ""} onValueChange={handleFieldChange}>
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="Field" />
        </SelectTrigger>
        <SelectContent>
          {FIELD_OPTIONS.map((f) => (
            <SelectItem key={f.value} value={f.value}>
              {f.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={node.op} onValueChange={handleOpChange}>
        <SelectTrigger className="w-[130px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {OPERATOR_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {(node.op === "EQ" || node.op === "NEQ") && (
        <Input
          className="flex-1"
          placeholder="Value"
          value={typeof node.value === "string" ? node.value : JSON.stringify(node.value ?? "")}
          onChange={(e) => onChange({ ...node, value: e.target.value })}
        />
      )}

      {node.op === "IN" && (
        <Input
          className="flex-1"
          placeholder="Comma-separated values"
          value={Array.isArray(node.value) ? node.value.join(", ") : ""}
          onChange={(e) =>
            onChange({
              ...node,
              value: e.target.value.split(",").map((v) => v.trim()).filter(Boolean),
            })
          }
        />
      )}

      {node.op === "BETWEEN" && (
        <div className="flex flex-1 items-center gap-1">
          <Input
            placeholder="Min"
            value={Array.isArray(node.value) ? node.value[0] ?? "" : ""}
            onChange={(e) => {
              const arr = Array.isArray(node.value) ? [...node.value] : ["", ""];
              arr[0] = e.target.value;
              onChange({ ...node, value: arr });
            }}
          />
          <span className="text-xs text-muted-foreground">to</span>
          <Input
            placeholder="Max"
            value={Array.isArray(node.value) ? node.value[1] ?? "" : ""}
            onChange={(e) => {
              const arr = Array.isArray(node.value) ? [...node.value] : ["", ""];
              arr[1] = e.target.value;
              onChange({ ...node, value: arr });
            }}
          />
        </div>
      )}

      <Button variant="ghost" size="icon" onClick={onRemove} className="shrink-0">
        <Trash2 className="h-4 w-4 text-muted-foreground" />
      </Button>
    </div>
  );
}

/* ========== Expression Group (recursive visual builder) ========== */

function ExpressionGroup({
  node,
  onChange,
  onRemove,
  depth,
}: {
  node: ASTNode;
  onChange: (updated: ASTNode) => void;
  onRemove?: () => void;
  depth: number;
}) {
  const isLogical = node.op === "AND" || node.op === "OR";
  const [collapsed, setCollapsed] = useState(false);

  if (!isLogical) {
    return <ConditionRow node={node} onChange={onChange} onRemove={onRemove ?? (() => {})} />;
  }

  const children = node.children ?? [];

  const toggleOp = () => {
    onChange({ ...node, op: node.op === "AND" ? "OR" : "AND" });
  };

  const updateChild = (index: number, updated: ASTNode) => {
    const newChildren = [...children];
    newChildren[index] = updated;
    onChange({ ...node, children: newChildren });
  };

  const removeChild = (index: number) => {
    const newChildren = children.filter((_, i) => i !== index);
    if (newChildren.length === 0) {
      newChildren.push(newCondition());
    }
    onChange({ ...node, children: newChildren });
  };

  const addCondition = () => {
    onChange({ ...node, children: [...children, newCondition()] });
  };

  const addGroup = () => {
    onChange({ ...node, children: [...children, newGroup()] });
  };

  const depthColors = [
    "border-l-blue-400 dark:border-l-blue-600",
    "border-l-purple-400 dark:border-l-purple-600",
    "border-l-orange-400 dark:border-l-orange-600",
    "border-l-green-400 dark:border-l-green-600",
  ];

  return (
    <div
      className={`rounded-md border border-l-4 ${depthColors[depth % depthColors.length]} bg-muted/20 p-3 space-y-2`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="font-mono text-xs h-7 px-3"
            onClick={toggleOp}
          >
            {node.op}
          </Button>
          <span className="text-xs text-muted-foreground">
            ({children.length} condition{children.length !== 1 ? "s" : ""})
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={addCondition}>
            <PlusCircle className="mr-1 h-3 w-3" />
            Condition
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={addGroup}>
            <FolderPlus className="mr-1 h-3 w-3" />
            Group
          </Button>
          {onRemove && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onRemove}>
              <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          )}
        </div>
      </div>

      {!collapsed && (
        <div className="space-y-2 pl-4">
          {children.map((child, i) => (
            <div key={i}>
              {i > 0 && (
                <div className="flex items-center py-1">
                  <span className="text-xs font-mono text-muted-foreground">
                    {node.op}
                  </span>
                  <Separator className="ml-2 flex-1" />
                </div>
              )}
              <ExpressionGroup
                node={child}
                onChange={(updated) => updateChild(i, updated)}
                onRemove={() => removeChild(i)}
                depth={depth + 1}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ========== Trace Tree (test result visualization) ========== */

function TraceTree({ node, depth = 0 }: { node: TraceNode; depth?: number }) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children && node.children.length > 0;

  return (
    <div className="space-y-1" style={{ marginLeft: depth * 16 }}>
      <div className="flex items-center gap-2">
        {hasChildren && (
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </Button>
        )}
        {!hasChildren && <span className="w-5" />}
        {node.result ? (
          <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
        ) : (
          <XCircle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0" />
        )}
        <span className="font-mono text-sm">{node.op}</span>
        {node.field && (
          <span className="text-sm text-muted-foreground">
            {node.field}
            {node.value !== undefined && (
              <span className="ml-1">
                {node.op === "IN"
                  ? `[${Array.isArray(node.value) ? node.value.join(", ") : node.value}]`
                  : node.op === "BETWEEN"
                    ? `${Array.isArray(node.value) ? node.value.join(" - ") : node.value}`
                    : JSON.stringify(node.value)}
              </span>
            )}
          </span>
        )}
        <Badge
          variant="outline"
          className={
            node.result
              ? "text-green-700 border-green-300 dark:text-green-400 dark:border-green-700"
              : "text-red-700 border-red-300 dark:text-red-400 dark:border-red-700"
          }
        >
          {node.result ? "TRUE" : "FALSE"}
        </Badge>
      </div>
      {expanded &&
        hasChildren &&
        node.children!.map((child, i) => (
          <TraceTree key={i} node={child} depth={depth + 1} />
        ))}
    </div>
  );
}

/* ========== Main Component ========== */

export default function EligibilityLibrary() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formCode, setFormCode] = useState("");
  const [formName, setFormName] = useState("");
  const [formExpression, setFormExpression] = useState<ASTNode>(newGroup());
  const [editorMode, setEditorMode] = useState<"form" | "json">("form");
  const [jsonText, setJsonText] = useState("");
  const [jsonError, setJsonError] = useState("");

  // Test dialog state
  const [testOpen, setTestOpen] = useState(false);
  const [testId, setTestId] = useState<number | null>(null);
  const [testContext, setTestContext] = useState<Array<{ key: string; value: string }>>([
    { key: "", value: "" },
  ]);
  const [testResult, setTestResult] = useState<{
    result: boolean;
    trace: TraceNode[];
  } | null>(null);

  // --- Queries ---
  const listQ = useQuery<{
    data: EligibilityExpression[];
    total: number;
    page: number;
    pageSize: number;
  }>({
    queryKey: ["eligibility-expressions", statusFilter, search],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter && statusFilter !== "all") params.set("status", statusFilter);
      if (search) params.set("search", search);
      params.set("pageSize", "100");
      return apiRequest(
        "GET",
        apiUrl(`/api/v1/eligibility-expressions?${params.toString()}`),
      );
    },
    refetchInterval: 30_000,
  });

  const expressions = listQ.data?.data ?? [];

  const summary = useMemo(() => {
    const total = expressions.length;
    const active = expressions.filter((e) => e.library_status === "ACTIVE").length;
    const pending = expressions.filter(
      (e) => e.library_status === "PENDING_APPROVAL",
    ).length;
    return { total, active, pending };
  }, [expressions]);

  // --- Mutations ---
  const createMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiRequest("POST", apiUrl("/api/v1/eligibility-expressions"), body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["eligibility-expressions"] });
      closeDialog();
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      apiRequest("PUT", apiUrl(`/api/v1/eligibility-expressions/${id}`), body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["eligibility-expressions"] });
      closeDialog();
    },
  });

  const submitMut = useMutation({
    mutationFn: (id: number) =>
      apiRequest("POST", apiUrl(`/api/v1/eligibility-expressions/${id}/submit`), {}),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["eligibility-expressions"] }),
  });

  const retireMut = useMutation({
    mutationFn: (id: number) =>
      apiRequest("POST", apiUrl(`/api/v1/eligibility-expressions/${id}/retire`), {}),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["eligibility-expressions"] }),
  });

  const testMut = useMutation({
    mutationFn: ({ id, context }: { id: number; context: Record<string, any> }) =>
      apiRequest("POST", apiUrl(`/api/v1/eligibility-expressions/${id}/test`), {
        context,
      }),
    onSuccess: (data: any) => {
      setTestResult(data.data ?? data);
    },
  });

  // --- Dialog Handlers ---

  const openAddDialog = () => {
    setEditingId(null);
    setFormCode("");
    setFormName("");
    setFormExpression(newGroup());
    setEditorMode("form");
    setJsonText(JSON.stringify(newGroup(), null, 2));
    setJsonError("");
    setDialogOpen(true);
  };

  const openEditDialog = (expr: EligibilityExpression) => {
    setEditingId(expr.id);
    setFormCode(expr.eligibility_code);
    setFormName(expr.eligibility_name);
    setFormExpression(expr.expression);
    setEditorMode("form");
    setJsonText(JSON.stringify(expr.expression, null, 2));
    setJsonError("");
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingId(null);
    setJsonError("");
  };

  const openTestDialog = (expr: EligibilityExpression) => {
    setTestId(expr.id);
    setTestResult(null);
    // Pre-populate context keys from expression fields
    const fields = extractFields(expr.expression);
    setTestContext(
      fields.length > 0
        ? fields.map((f) => ({ key: f, value: "" }))
        : [{ key: "", value: "" }],
    );
    setTestOpen(true);
  };

  const switchToJsonMode = useCallback(() => {
    setJsonText(JSON.stringify(formExpression, null, 2));
    setJsonError("");
    setEditorMode("json");
  }, [formExpression]);

  const switchToFormMode = useCallback(() => {
    try {
      const parsed = JSON.parse(jsonText);
      setFormExpression(parsed);
      setJsonError("");
      setEditorMode("form");
    } catch (e: any) {
      setJsonError(`Invalid JSON: ${e.message}`);
    }
  }, [jsonText]);

  const handleSave = () => {
    let expression = formExpression;
    if (editorMode === "json") {
      try {
        expression = JSON.parse(jsonText);
      } catch (e: any) {
        setJsonError(`Invalid JSON: ${e.message}`);
        return;
      }
    }

    if (editingId) {
      updateMut.mutate({
        id: editingId,
        body: { eligibilityName: formName, expression },
      });
    } else {
      createMut.mutate({
        eligibilityCode: formCode,
        eligibilityName: formName,
        expression,
      });
    }
  };

  const handleRunTest = () => {
    if (!testId) return;
    const ctx: Record<string, any> = {};
    testContext.forEach(({ key, value }) => {
      if (key.trim()) {
        // Try to parse as number or keep as string
        const num = Number(value);
        ctx[key.trim()] = !isNaN(num) && value.trim() !== "" ? num : value;
      }
    });
    testMut.mutate({ id: testId, context: ctx });
  };

  const addTestContextRow = () => {
    setTestContext([...testContext, { key: "", value: "" }]);
  };

  const removeTestContextRow = (index: number) => {
    const newCtx = testContext.filter((_, i) => i !== index);
    setTestContext(newCtx.length > 0 ? newCtx : [{ key: "", value: "" }]);
  };

  const isSaving = createMut.isPending || updateMut.isPending;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Library className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Eligibility Expression Library
            </h1>
            <p className="text-sm text-muted-foreground">
              Define and manage boolean eligibility rules for fee plan assignment
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
          <Button size="sm" onClick={openAddDialog}>
            <Plus className="mr-1 h-3 w-3" /> Add Expression
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard
          title="Total Expressions"
          value={summary.total}
          icon={Library}
          accent="bg-blue-600"
        />
        <SummaryCard
          title="Active"
          value={summary.active}
          icon={CheckCircle2}
          accent="bg-green-600"
        />
        <SummaryCard
          title="Pending Approval"
          value={summary.pending}
          icon={Send}
          accent="bg-yellow-500"
        />
      </div>

      <Separator />

      {/* Filters */}
      <div className="flex items-center gap-3">
        <Input
          placeholder="Search by code or name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
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
          <CardTitle className="text-base">Expressions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Expression</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Updated</TableHead>
                  <TableHead className="w-[80px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listQ.isLoading ? (
                  <SkeletonRows cols={6} />
                ) : expressions.length === 0 ? (
                  <EmptyRow cols={6} msg="No eligibility expressions found" />
                ) : (
                  expressions.map((expr) => (
                    <TableRow key={expr.id}>
                      <TableCell className="font-mono text-sm font-medium">
                        {expr.eligibility_code}
                      </TableCell>
                      <TableCell>{expr.eligibility_name}</TableCell>
                      <TableCell className="max-w-[300px]">
                        <span className="text-xs text-muted-foreground font-mono truncate block">
                          {summarizeExpression(expr.expression)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge className={bc(STATUS_COLORS, expr.library_status)}>
                          {expr.library_status.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        {fmtDate(expr.updated_at)}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {expr.library_status === "DRAFT" && (
                              <DropdownMenuItem
                                onClick={() => openEditDialog(expr)}
                              >
                                <Pencil className="mr-2 h-4 w-4" /> Edit
                              </DropdownMenuItem>
                            )}
                            {expr.library_status === "DRAFT" && (
                              <DropdownMenuItem
                                onClick={() => submitMut.mutate(expr.id)}
                              >
                                <Send className="mr-2 h-4 w-4" /> Submit for
                                Approval
                              </DropdownMenuItem>
                            )}
                            {expr.library_status === "ACTIVE" && (
                              <DropdownMenuItem
                                onClick={() => retireMut.mutate(expr.id)}
                              >
                                <Archive className="mr-2 h-4 w-4" /> Retire
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              onClick={() => openTestDialog(expr)}
                            >
                              <FlaskConical className="mr-2 h-4 w-4" /> Test
                            </DropdownMenuItem>
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

      {/* ============================================================ */}
      {/* Add / Edit Dialog                                             */}
      {/* ============================================================ */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Edit Eligibility Expression" : "Add Eligibility Expression"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Code & Name */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium">Code</label>
                <Input
                  placeholder="ELIG-001"
                  value={formCode}
                  onChange={(e) => setFormCode(e.target.value)}
                  disabled={!!editingId}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Name</label>
                <Input
                  placeholder="Equity Buy Eligibility"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                />
              </div>
            </div>

            <Separator />

            {/* Mode Toggle */}
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Expression</label>
              <div className="flex items-center gap-1 rounded-lg border p-0.5">
                <Button
                  variant={editorMode === "form" ? "default" : "ghost"}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={editorMode === "json" ? switchToFormMode : undefined}
                >
                  <Layers className="mr-1 h-3 w-3" /> Form
                </Button>
                <Button
                  variant={editorMode === "json" ? "default" : "ghost"}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={editorMode === "form" ? switchToJsonMode : undefined}
                >
                  <Code2 className="mr-1 h-3 w-3" /> JSON
                </Button>
              </div>
            </div>

            {/* Form Mode */}
            {editorMode === "form" && (
              <ExpressionGroup
                node={formExpression}
                onChange={setFormExpression}
                depth={0}
              />
            )}

            {/* JSON Mode */}
            {editorMode === "json" && (
              <div className="space-y-2">
                <Textarea
                  className="font-mono text-sm min-h-[250px]"
                  value={jsonText}
                  onChange={(e) => {
                    setJsonText(e.target.value);
                    setJsonError("");
                  }}
                  placeholder='{"op": "AND", "children": [...]}'
                />
                {jsonError && (
                  <p className="text-sm text-destructive">{jsonError}</p>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={
                isSaving ||
                !formName.trim() ||
                (!editingId && !formCode.trim())
              }
            >
              {isSaving
                ? "Saving..."
                : editingId
                  ? "Update Expression"
                  : "Create Expression"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============================================================ */}
      {/* Test Dialog                                                   */}
      {/* ============================================================ */}
      <Dialog open={testOpen} onOpenChange={setTestOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Test Expression</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Sample Context (key-value pairs)
              </label>
              {testContext.map((row, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    placeholder="Field key (e.g. asset_class)"
                    value={row.key}
                    onChange={(e) => {
                      const newCtx = [...testContext];
                      newCtx[i] = { ...newCtx[i], key: e.target.value };
                      setTestContext(newCtx);
                    }}
                    className="flex-1"
                  />
                  <Input
                    placeholder="Value"
                    value={row.value}
                    onChange={(e) => {
                      const newCtx = [...testContext];
                      newCtx[i] = { ...newCtx[i], value: e.target.value };
                      setTestContext(newCtx);
                    }}
                    className="flex-1"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeTestContextRow(i)}
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addTestContextRow}>
                <Plus className="mr-1 h-3 w-3" /> Add Field
              </Button>
            </div>

            <Separator />

            <Button
              onClick={handleRunTest}
              disabled={testMut.isPending}
              className="w-full"
            >
              <FlaskConical className="mr-2 h-4 w-4" />
              {testMut.isPending ? "Evaluating..." : "Run Test"}
            </Button>

            {/* Result */}
            {testResult && (
              <div className="space-y-3">
                <div
                  className={`flex items-center gap-3 rounded-lg border p-4 ${
                    testResult.result
                      ? "border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-900/20"
                      : "border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-900/20"
                  }`}
                >
                  {testResult.result ? (
                    <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
                  ) : (
                    <XCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
                  )}
                  <div>
                    <p className="font-semibold">
                      Result: {testResult.result ? "ELIGIBLE" : "NOT ELIGIBLE"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Expression evaluated to{" "}
                      <span className="font-mono font-medium">
                        {String(testResult.result)}
                      </span>
                    </p>
                  </div>
                </div>

                {/* Trace tree */}
                <div className="space-y-1">
                  <label className="text-sm font-medium">Evaluation Trace</label>
                  <div className="rounded-md border p-3 bg-muted/30">
                    {testResult.trace.map((t, i) => (
                      <TraceTree key={i} node={t} />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ========== Utility: extract field names from an expression ========== */

function extractFields(node: ASTNode): string[] {
  const fields = new Set<string>();
  function walk(n: ASTNode) {
    if (n.field) fields.add(n.field);
    if (n.children) n.children.forEach(walk);
  }
  walk(node);
  return Array.from(fields);
}
