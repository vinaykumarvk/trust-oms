/**
 * Compliance Rules — Phase 4A
 *
 * CRUD management for four compliance rule types:
 *   1. RESTRICTED_LIST — restricted securities / entities
 *   2. POLICY_LIMIT   — portfolio or account-level policy limits
 *   3. SUITABILITY    — client suitability checks
 *   4. IPS            — investment policy statement rules
 *
 * Each tab shows a table of rules with add/edit/delete/toggle actions.
 * An evaluate section at the bottom supports order and position evaluation.
 * Auto-refreshes every 30 seconds.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@ui/lib/queryClient";
import { apiUrl } from "@ui/lib/api-url";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/ui/card";
import { Badge } from "@ui/components/ui/badge";
import { Button } from "@ui/components/ui/button";
import { Input } from "@ui/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@ui/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@ui/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@ui/components/ui/select";
import { Textarea } from "@ui/components/ui/textarea";
import { Skeleton } from "@ui/components/ui/skeleton";
import { Separator } from "@ui/components/ui/separator";
import {
  ShieldCheck, Plus, Trash2, Pencil, Play, Power, PowerOff,
  RefreshCw, CheckCircle, XCircle, Search, AlertTriangle,
  BookOpen, Scale, FileText, Ban,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RuleType = "RESTRICTED_LIST" | "POLICY_LIMIT" | "SUITABILITY" | "IPS";

interface ComplianceRule {
  id: string;
  rule_type: RuleType;
  entity_type: string;
  condition: Record<string, unknown>;
  action: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  is_active: boolean;
  description: string | null;
  created_at: string;
  updated_at: string;
}

interface RulesResponse {
  data: ComplianceRule[];
  total: number;
}

interface OrderEvalResult {
  order_id: string;
  passed: boolean;
  results: {
    rule_id: string;
    rule_type: string;
    passed: boolean;
    severity: string;
    message: string;
  }[];
}

interface PositionEvalResult {
  portfolio_id: string;
  passed: boolean;
  results: {
    rule_id: string;
    rule_type: string;
    passed: boolean;
    severity: string;
    message: string;
    details?: Record<string, unknown>;
  }[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RULE_TYPES: { value: RuleType; label: string; icon: React.ElementType }[] = [
  { value: "RESTRICTED_LIST", label: "Restricted List", icon: Ban },
  { value: "POLICY_LIMIT", label: "Policy Limit", icon: Scale },
  { value: "SUITABILITY", label: "Suitability", icon: BookOpen },
  { value: "IPS", label: "IPS", icon: FileText },
];

const RULE_TYPE_COLORS: Record<string, string> = {
  RESTRICTED_LIST: "bg-red-100 text-red-800",
  POLICY_LIMIT: "bg-blue-100 text-blue-800",
  SUITABILITY: "bg-purple-100 text-purple-800",
  IPS: "bg-green-100 text-green-800",
};

const SEVERITY_COLORS: Record<string, string> = {
  HIGH: "bg-red-100 text-red-800",
  MEDIUM: "bg-yellow-100 text-yellow-800",
  LOW: "bg-green-100 text-green-800",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(d: string | null): string {
  if (!d) return "-";
  try {
    return new Date(d).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return d;
  }
}

function badgeClass(key: string, map: Record<string, string>): string {
  return map[key] ?? "bg-muted text-foreground";
}

function truncateJson(obj: Record<string, unknown>, maxLen = 80): string {
  const str = JSON.stringify(obj);
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen) + "...";
}

function isValidJson(str: string): boolean {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}

// Reusable sub-components
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

// ---------------------------------------------------------------------------
// Blank form state
// ---------------------------------------------------------------------------

const BLANK_FORM = {
  entity_type: "",
  condition: "{}",
  action: "",
  severity: "MEDIUM" as "HIGH" | "MEDIUM" | "LOW",
  description: "",
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function ComplianceRules() {
  const qc = useQueryClient();
  const [activeRuleType, setActiveRuleType] = useState<RuleType>("RESTRICTED_LIST");

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<ComplianceRule | null>(null);
  const [form, setForm] = useState({ ...BLANK_FORM });
  const [conditionError, setConditionError] = useState<string | null>(null);

  // Delete confirmation state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingRule, setDeletingRule] = useState<ComplianceRule | null>(null);

  // Search
  const [searchTerm, setSearchTerm] = useState("");

  // Evaluate state
  const [evalOrderId, setEvalOrderId] = useState("");
  const [evalPortfolioId, setEvalPortfolioId] = useState("");
  const [orderEvalResult, setOrderEvalResult] = useState<OrderEvalResult | null>(null);
  const [positionEvalResult, setPositionEvalResult] = useState<PositionEvalResult | null>(null);

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  const rulesQ = useQuery<RulesResponse>({
    queryKey: ["compliance-rules", activeRuleType],
    queryFn: () => {
      const p = new URLSearchParams();
      p.set("rule_type", activeRuleType);
      return apiRequest("GET", apiUrl(`/api/v1/compliance/rules?${p.toString()}`));
    },
    refetchInterval: 30_000,
  });

  const rules = rulesQ.data?.data ?? [];

  // Filtered rules
  const filteredRules = rules.filter((r) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      r.entity_type.toLowerCase().includes(term) ||
      r.action.toLowerCase().includes(term) ||
      r.id.toLowerCase().includes(term) ||
      (r.description?.toLowerCase().includes(term) ?? false)
    );
  });

  // Count summaries per rule type
  const allRulesQ = useQuery<RulesResponse>({
    queryKey: ["compliance-rules", "all"],
    queryFn: () => apiRequest("GET", apiUrl("/api/v1/compliance/rules")),
    refetchInterval: 30_000,
  });
  const allRules = allRulesQ.data?.data ?? [];
  const countByType = (type: RuleType) =>
    allRules.filter((r) => r.rule_type === type).length;

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------

  const createMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiRequest("POST", apiUrl("/api/v1/compliance/rules"), body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["compliance-rules"] });
      closeDialog();
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      apiRequest("PUT", apiUrl(`/api/v1/compliance/rules/${id}`), body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["compliance-rules"] });
      closeDialog();
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) =>
      apiRequest("DELETE", apiUrl(`/api/v1/compliance/rules/${id}`)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["compliance-rules"] });
      setDeleteDialogOpen(false);
      setDeletingRule(null);
    },
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      apiRequest("PUT", apiUrl(`/api/v1/compliance/rules/${id}`), { is_active }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["compliance-rules"] });
    },
  });

  const evalOrderMut = useMutation({
    mutationFn: (orderId: string) =>
      apiRequest("POST", apiUrl("/api/v1/compliance/rules/evaluate-order"), {
        order_id: orderId,
      }),
    onSuccess: (data: OrderEvalResult) => {
      setOrderEvalResult(data);
    },
  });

  const evalPositionMut = useMutation({
    mutationFn: (portfolioId: string) =>
      apiRequest("POST", apiUrl("/api/v1/compliance/rules/evaluate-position"), {
        portfolio_id: portfolioId,
      }),
    onSuccess: (data: PositionEvalResult) => {
      setPositionEvalResult(data);
    },
  });

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const openAdd = () => {
    setEditingRule(null);
    setForm({ ...BLANK_FORM });
    setConditionError(null);
    setDialogOpen(true);
  };

  const openEdit = (rule: ComplianceRule) => {
    setEditingRule(rule);
    setForm({
      entity_type: rule.entity_type,
      condition: JSON.stringify(rule.condition, null, 2),
      action: rule.action,
      severity: rule.severity,
      description: rule.description ?? "",
    });
    setConditionError(null);
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingRule(null);
    setForm({ ...BLANK_FORM });
    setConditionError(null);
  };

  const openDelete = (rule: ComplianceRule) => {
    setDeletingRule(rule);
    setDeleteDialogOpen(true);
  };

  const submitForm = () => {
    // Validate JSON
    if (!isValidJson(form.condition)) {
      setConditionError("Condition must be valid JSON");
      return;
    }
    setConditionError(null);

    const body: Record<string, unknown> = {
      rule_type: activeRuleType,
      entity_type: form.entity_type,
      condition: JSON.parse(form.condition),
      action: form.action,
      severity: form.severity,
      description: form.description || null,
    };

    if (editingRule) {
      updateMut.mutate({ id: editingRule.id, body });
    } else {
      createMut.mutate(body);
    }
  };

  const confirmDelete = () => {
    if (deletingRule) {
      deleteMut.mutate(deletingRule.id);
    }
  };

  const runOrderEval = () => {
    if (!evalOrderId.trim()) return;
    setOrderEvalResult(null);
    evalOrderMut.mutate(evalOrderId.trim());
  };

  const runPositionEval = () => {
    if (!evalPortfolioId.trim()) return;
    setPositionEvalResult(null);
    evalPositionMut.mutate(evalPortfolioId.trim());
  };

  // ---------------------------------------------------------------------------
  // Loading skeleton
  // ---------------------------------------------------------------------------

  if (rulesQ.isLoading && allRulesQ.isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-36" />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const isMutating = createMut.isPending || updateMut.isPending;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <ShieldCheck className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Compliance Rules</h1>
            <p className="text-sm text-muted-foreground">
              Manage restricted lists, policy limits, suitability, and IPS rules
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            rulesQ.refetch();
            allRulesQ.refetch();
          }}
          disabled={rulesQ.isFetching}
        >
          <RefreshCw
            className={`h-4 w-4 mr-2 ${rulesQ.isFetching ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        {RULE_TYPES.map(({ value, label, icon: Icon }) => {
          const count = countByType(value);
          const activeCount = allRules.filter(
            (r) => r.rule_type === value && r.is_active,
          ).length;
          return (
            <Card
              key={value}
              className={`cursor-pointer transition-colors ${
                activeRuleType === value
                  ? "border-primary ring-1 ring-primary"
                  : "hover:border-muted-foreground/30"
              }`}
              onClick={() => setActiveRuleType(value)}
            >
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      {label}
                    </p>
                    <p className="mt-1 text-2xl font-bold">{count}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {activeCount} active
                    </p>
                  </div>
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-lg ${badgeClass(value, RULE_TYPE_COLORS)}`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ====================== RULE TABS ====================== */}
      <Tabs
        value={activeRuleType}
        onValueChange={(v) => setActiveRuleType(v as RuleType)}
      >
        <TabsList>
          {RULE_TYPES.map(({ value, label }) => (
            <TabsTrigger key={value} value={value}>
              {label}
              <Badge variant="outline" className="ml-2 text-xs">
                {countByType(value)}
              </Badge>
            </TabsTrigger>
          ))}
        </TabsList>

        {RULE_TYPES.map(({ value }) => (
          <TabsContent key={value} value={value} className="space-y-4">
            {/* Toolbar */}
            <div className="flex items-center justify-between">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search rules..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Button size="sm" onClick={openAdd}>
                <Plus className="h-4 w-4 mr-2" />
                Add Rule
              </Button>
            </div>

            {/* Rules Table */}
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Entity Type</TableHead>
                    <TableHead className="max-w-[200px]">Condition</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rulesQ.isLoading ? (
                    <SkeletonRows cols={8} />
                  ) : filteredRules.length === 0 ? (
                    <EmptyRow
                      cols={8}
                      msg={`No ${value.replace(/_/g, " ").toLowerCase()} rules found`}
                    />
                  ) : (
                    filteredRules.map((rule) => (
                      <TableRow key={rule.id}>
                        <TableCell className="font-mono text-xs">
                          {rule.id.length > 12
                            ? `${rule.id.substring(0, 12)}...`
                            : rule.id}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{rule.entity_type}</Badge>
                        </TableCell>
                        <TableCell className="max-w-[200px]">
                          <code className="text-xs bg-muted px-1.5 py-0.5 rounded block truncate">
                            {truncateJson(rule.condition)}
                          </code>
                        </TableCell>
                        <TableCell className="text-sm">{rule.action}</TableCell>
                        <TableCell>
                          <Badge
                            className={badgeClass(
                              rule.severity,
                              SEVERITY_COLORS,
                            )}
                          >
                            {rule.severity}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              toggleMut.mutate({
                                id: rule.id,
                                is_active: !rule.is_active,
                              })
                            }
                            disabled={toggleMut.isPending}
                            className={
                              rule.is_active
                                ? "text-green-600 hover:text-green-700"
                                : "text-muted-foreground hover:text-muted-foreground"
                            }
                          >
                            {rule.is_active ? (
                              <>
                                <Power className="h-3 w-3 mr-1" />
                                On
                              </>
                            ) : (
                              <>
                                <PowerOff className="h-3 w-3 mr-1" />
                                Off
                              </>
                            )}
                          </Button>
                        </TableCell>
                        <TableCell className="text-xs">
                          {formatDate(rule.updated_at)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEdit(rule)}
                            >
                              <Pencil className="h-3 w-3 mr-1" />
                              Edit
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-600 hover:text-red-700"
                              onClick={() => openDelete(rule)}
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

            {rulesQ.isError && (
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-red-600">
                    Failed to load rules. Please try refreshing.
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        ))}
      </Tabs>

      {/* ====================== EVALUATE SECTION ====================== */}
      <Separator />

      <div>
        <h2 className="text-lg font-semibold mb-4">Rule Evaluation</h2>
        <div className="grid gap-6 md:grid-cols-2">
          {/* Evaluate Order */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                Evaluate Order
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Enter Order ID..."
                    value={evalOrderId}
                    onChange={(e) => setEvalOrderId(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") runOrderEval();
                    }}
                    className="pl-9"
                  />
                </div>
                <Button
                  onClick={runOrderEval}
                  disabled={evalOrderMut.isPending || !evalOrderId.trim()}
                  size="sm"
                >
                  <Play className="h-4 w-4 mr-1" />
                  {evalOrderMut.isPending ? "Running..." : "Evaluate"}
                </Button>
              </div>

              {/* Order Eval Results */}
              {orderEvalResult && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Badge
                      className={
                        orderEvalResult.passed
                          ? "bg-green-100 text-green-800"
                          : "bg-red-100 text-red-800"
                      }
                    >
                      {orderEvalResult.passed ? (
                        <>
                          <CheckCircle className="h-3 w-3 mr-1" /> PASSED
                        </>
                      ) : (
                        <>
                          <XCircle className="h-3 w-3 mr-1" /> FAILED
                        </>
                      )}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      Order {orderEvalResult.order_id} —{" "}
                      {orderEvalResult.results.length} rule(s) checked
                    </span>
                  </div>
                  <div className="overflow-x-auto rounded-md border max-h-[300px] overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Rule</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Result</TableHead>
                          <TableHead>Severity</TableHead>
                          <TableHead>Message</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {orderEvalResult.results.length === 0 ? (
                          <EmptyRow
                            cols={5}
                            msg="No rules were evaluated"
                          />
                        ) : (
                          orderEvalResult.results.map((r, idx) => (
                            <TableRow key={idx}>
                              <TableCell className="font-mono text-xs">
                                {r.rule_id.length > 12
                                  ? `${r.rule_id.substring(0, 12)}...`
                                  : r.rule_id}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  className={badgeClass(
                                    r.rule_type,
                                    RULE_TYPE_COLORS,
                                  )}
                                >
                                  {r.rule_type.replace(/_/g, " ")}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {r.passed ? (
                                  <Badge className="bg-green-100 text-green-800">
                                    <CheckCircle className="h-3 w-3 mr-1" />
                                    Pass
                                  </Badge>
                                ) : (
                                  <Badge className="bg-red-100 text-red-800">
                                    <XCircle className="h-3 w-3 mr-1" />
                                    Fail
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  className={badgeClass(
                                    r.severity,
                                    SEVERITY_COLORS,
                                  )}
                                >
                                  {r.severity}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-sm max-w-[200px] truncate">
                                {r.message}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {evalOrderMut.isError && (
                <p className="text-sm text-red-600">
                  Order evaluation failed. Please check the Order ID and try
                  again.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Evaluate Position */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                Evaluate Position
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Enter Portfolio ID..."
                    value={evalPortfolioId}
                    onChange={(e) => setEvalPortfolioId(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") runPositionEval();
                    }}
                    className="pl-9"
                  />
                </div>
                <Button
                  onClick={runPositionEval}
                  disabled={
                    evalPositionMut.isPending || !evalPortfolioId.trim()
                  }
                  size="sm"
                >
                  <Play className="h-4 w-4 mr-1" />
                  {evalPositionMut.isPending ? "Running..." : "Evaluate"}
                </Button>
              </div>

              {/* Position Eval Results */}
              {positionEvalResult && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Badge
                      className={
                        positionEvalResult.passed
                          ? "bg-green-100 text-green-800"
                          : "bg-red-100 text-red-800"
                      }
                    >
                      {positionEvalResult.passed ? (
                        <>
                          <CheckCircle className="h-3 w-3 mr-1" /> PASSED
                        </>
                      ) : (
                        <>
                          <XCircle className="h-3 w-3 mr-1" /> FAILED
                        </>
                      )}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      Portfolio {positionEvalResult.portfolio_id} —{" "}
                      {positionEvalResult.results.length} rule(s) checked
                    </span>
                  </div>
                  <div className="overflow-x-auto rounded-md border max-h-[300px] overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Rule</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Result</TableHead>
                          <TableHead>Severity</TableHead>
                          <TableHead>Message</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {positionEvalResult.results.length === 0 ? (
                          <EmptyRow
                            cols={5}
                            msg="No rules were evaluated"
                          />
                        ) : (
                          positionEvalResult.results.map((r, idx) => (
                            <TableRow key={idx}>
                              <TableCell className="font-mono text-xs">
                                {r.rule_id.length > 12
                                  ? `${r.rule_id.substring(0, 12)}...`
                                  : r.rule_id}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  className={badgeClass(
                                    r.rule_type,
                                    RULE_TYPE_COLORS,
                                  )}
                                >
                                  {r.rule_type.replace(/_/g, " ")}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {r.passed ? (
                                  <Badge className="bg-green-100 text-green-800">
                                    <CheckCircle className="h-3 w-3 mr-1" />
                                    Pass
                                  </Badge>
                                ) : (
                                  <Badge className="bg-red-100 text-red-800">
                                    <XCircle className="h-3 w-3 mr-1" />
                                    Fail
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  className={badgeClass(
                                    r.severity,
                                    SEVERITY_COLORS,
                                  )}
                                >
                                  {r.severity}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-sm max-w-[200px] truncate">
                                {r.message}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {evalPositionMut.isError && (
                <p className="text-sm text-red-600">
                  Position evaluation failed. Please check the Portfolio ID and
                  try again.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ==================== ADD / EDIT RULE DIALOG ==================== */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); else setDialogOpen(true); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingRule ? "Edit Rule" : "Add Compliance Rule"}
            </DialogTitle>
            <DialogDescription>
              {editingRule
                ? `Editing ${activeRuleType.replace(/_/g, " ")} rule ${editingRule.id}`
                : `Create a new ${activeRuleType.replace(/_/g, " ").toLowerCase()} rule`}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Entity Type */}
            <div className="space-y-1">
              <label className="text-xs font-medium">Entity Type</label>
              <Input
                placeholder="e.g., SECURITY, ISSUER, SECTOR..."
                value={form.entity_type}
                onChange={(e) =>
                  setForm((f) => ({ ...f, entity_type: e.target.value }))
                }
              />
            </div>

            {/* Condition JSON */}
            <div className="space-y-1">
              <label className="text-xs font-medium">Condition (JSON)</label>
              <Textarea
                placeholder='{"field": "value", "operator": "gt", "threshold": 100}'
                value={form.condition}
                onChange={(e) => {
                  setForm((f) => ({ ...f, condition: e.target.value }));
                  if (conditionError && isValidJson(e.target.value)) {
                    setConditionError(null);
                  }
                }}
                rows={5}
                className="font-mono text-sm"
              />
              {conditionError && (
                <p className="text-xs text-red-600">{conditionError}</p>
              )}
            </div>

            {/* Action */}
            <div className="space-y-1">
              <label className="text-xs font-medium">Action</label>
              <Input
                placeholder="e.g., BLOCK, WARN, REQUIRE_APPROVAL..."
                value={form.action}
                onChange={(e) =>
                  setForm((f) => ({ ...f, action: e.target.value }))
                }
              />
            </div>

            {/* Severity + Description */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-medium">Severity</label>
                <Select
                  value={form.severity}
                  onValueChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      severity: v as "HIGH" | "MEDIUM" | "LOW",
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="HIGH">High</SelectItem>
                    <SelectItem value="MEDIUM">Medium</SelectItem>
                    <SelectItem value="LOW">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">
                  Description (optional)
                </label>
                <Input
                  placeholder="Brief description..."
                  value={form.description}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, description: e.target.value }))
                  }
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button
              onClick={submitForm}
              disabled={
                isMutating ||
                !form.entity_type.trim() ||
                !form.action.trim() ||
                !form.condition.trim()
              }
            >
              {isMutating
                ? "Saving..."
                : editingRule
                  ? "Update Rule"
                  : "Create Rule"}
            </Button>
          </DialogFooter>

          {(createMut.isError || updateMut.isError) && (
            <p className="text-sm text-red-600 mt-2">
              Failed to save rule. Please check your input and try again.
            </p>
          )}
        </DialogContent>
      </Dialog>

      {/* ==================== DELETE CONFIRMATION DIALOG ==================== */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Rule</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this compliance rule? This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>

          {deletingRule && (
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Rule ID</p>
                  <p className="font-mono text-xs">{deletingRule.id}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Type</p>
                  <Badge
                    className={badgeClass(
                      deletingRule.rule_type,
                      RULE_TYPE_COLORS,
                    )}
                  >
                    {deletingRule.rule_type.replace(/_/g, " ")}
                  </Badge>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Entity</p>
                  <p className="text-sm">{deletingRule.entity_type}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Severity</p>
                  <Badge
                    className={badgeClass(
                      deletingRule.severity,
                      SEVERITY_COLORS,
                    )}
                  >
                    {deletingRule.severity}
                  </Badge>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleteMut.isPending}
            >
              {deleteMut.isPending ? "Deleting..." : "Delete Rule"}
            </Button>
          </DialogFooter>

          {deleteMut.isError && (
            <p className="text-sm text-red-600 mt-2">
              Failed to delete rule. Please try again.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
