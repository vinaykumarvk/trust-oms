/**
 * Lead Rule Builder (CRM-PAD Phase 6)
 *
 * Visual rule builder for defining lead list generation criteria.
 *
 * Features:
 *   - Criteria tree: nested groups with AND/OR/NOT operators
 *   - Recursive CriteriaGroup component for deep nesting (max 5 levels)
 *   - Condition fields: age, total_aum, risk_profile, branch, product_interest, nationality, occupation
 *   - Operators: EQ, GT, LT, GTE, LTE, CONTAINS, IN, BETWEEN
 *   - Preview panel showing the rule in plain English
 *   - "Preview Match Count" — POST /api/v1/lead-rules/preview
 *   - "Generate List" — POST /api/v1/lead-rules/:id/generate
 *   - Sidebar list for CRUD of saved rules
 *   - Max 20 conditions enforced with counter
 */

import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@ui/components/ui/card';
import { Button } from '@ui/components/ui/button';
import { Badge } from '@ui/components/ui/badge';
import { Input } from '@ui/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@ui/components/ui/select';
import { toast } from 'sonner';
import {
  Plus, Trash2, Eye, Play, Save, FolderTree,
  ChevronRight, ChevronDown, GitBranch, Layers, Search, Users,
} from 'lucide-react';

/* ---------- API helpers ---------- */

const API = '/api/v1/lead-rules';

function getToken(): string {
  try {
    const stored = localStorage.getItem('trustoms-user');
    if (stored) {
      const parsed = JSON.parse(stored);
      return parsed.token || '';
    }
  } catch {
    // ignore
  }
  return '';
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

function fetcher(url: string) {
  return fetch(url, { headers: authHeaders() }).then((r) => r.json());
}

/* ---------- Constants ---------- */

const FIELDS = [
  { value: 'age', label: 'Age' },
  { value: 'total_aum', label: 'Total AUM' },
  { value: 'risk_profile', label: 'Risk Profile' },
  { value: 'branch', label: 'Branch' },
  { value: 'product_interest', label: 'Product Interest' },
  { value: 'nationality', label: 'Nationality' },
  { value: 'occupation', label: 'Occupation' },
] as const;

const OPERATORS = [
  { value: 'EQ', label: 'Equals (=)' },
  { value: 'GT', label: 'Greater Than (>)' },
  { value: 'LT', label: 'Less Than (<)' },
  { value: 'GTE', label: 'Greater or Equal (>=)' },
  { value: 'LTE', label: 'Less or Equal (<=)' },
  { value: 'CONTAINS', label: 'Contains' },
  { value: 'IN', label: 'In List' },
  { value: 'BETWEEN', label: 'Between' },
] as const;

const MAX_DEPTH = 5;
const MAX_CONDITIONS = 20;

/* ---------- Types ---------- */

interface Condition {
  id: string;
  field: string;
  operator: string;
  value: string;
  value2: string; // for BETWEEN
}

interface CriteriaGroupType {
  id: string;
  logic: 'AND' | 'OR';
  not: boolean;
  conditions: Condition[];
  children: CriteriaGroupType[];
}

interface SavedRule {
  id: number;
  name: string;
  criteria_json: CriteriaGroupType;
  match_count: number | null;
  created_at: string;
  updated_at: string;
}

/* ---------- Helpers ---------- */

let idCounter = 0;
function genId(): string {
  return `node_${++idCounter}_${Date.now()}`;
}

function createCondition(): Condition {
  return { id: genId(), field: '', operator: 'EQ', value: '', value2: '' };
}

function createGroup(): CriteriaGroupType {
  return { id: genId(), logic: 'AND', not: false, conditions: [createCondition()], children: [] };
}

function countConditions(group: CriteriaGroupType): number {
  let count = group.conditions.length;
  for (const child of group.children) {
    count += countConditions(child);
  }
  return count;
}

function getDepth(group: CriteriaGroupType): number {
  if (group.children.length === 0) return 1;
  return 1 + Math.max(...group.children.map(getDepth));
}

/* ---------- Plain English Preview ---------- */

function fieldLabel(field: string): string {
  const f = FIELDS.find((x) => x.value === field);
  return f ? f.label : field || '(field)';
}

function operatorLabel(op: string): string {
  const map: Record<string, string> = {
    EQ: 'is', GT: 'is greater than', LT: 'is less than',
    GTE: 'is at least', LTE: 'is at most',
    CONTAINS: 'contains', IN: 'is one of', BETWEEN: 'is between',
  };
  return map[op] || op;
}

function conditionToEnglish(c: Condition): string {
  const f = fieldLabel(c.field);
  const op = operatorLabel(c.operator);
  if (c.operator === 'BETWEEN') {
    return `${f} ${op} ${c.value || '?'} and ${c.value2 || '?'}`;
  }
  return `${f} ${op} ${c.value || '?'}`;
}

function groupToEnglish(g: CriteriaGroupType, depth: number): string {
  const parts: string[] = [];
  for (const c of g.conditions) {
    parts.push(conditionToEnglish(c));
  }
  for (const child of g.children) {
    parts.push(`(${groupToEnglish(child, depth + 1)})`);
  }

  const joiner = g.logic === 'AND' ? ' AND ' : ' OR ';
  let result = parts.join(joiner);
  if (g.not) result = `NOT (${result})`;
  return result;
}

/* ---------- CriteriaGroup Component ---------- */

interface CriteriaGroupProps {
  group: CriteriaGroupType;
  depth: number;
  totalConditions: number;
  onChange: (updated: CriteriaGroupType) => void;
  onRemove: () => void;
  isRoot?: boolean;
}

function CriteriaGroup({ group, depth, totalConditions, onChange, onRemove, isRoot }: CriteriaGroupProps) {
  const canAddCondition = totalConditions < MAX_CONDITIONS;
  const canAddSubGroup = depth < MAX_DEPTH && totalConditions < MAX_CONDITIONS;

  function updateCondition(condId: string, field: keyof Condition, value: string) {
    const updated = { ...group, conditions: group.conditions.map((c) =>
      c.id === condId ? { ...c, [field]: value } : c
    )};
    onChange(updated);
  }

  function addCondition() {
    if (!canAddCondition) {
      toast.error(`Maximum ${MAX_CONDITIONS} conditions reached`);
      return;
    }
    onChange({ ...group, conditions: [...group.conditions, createCondition()] });
  }

  function removeCondition(condId: string) {
    const filtered = group.conditions.filter((c) => c.id !== condId);
    onChange({ ...group, conditions: filtered });
  }

  function addSubGroup() {
    if (!canAddSubGroup) {
      if (depth >= MAX_DEPTH) toast.error(`Maximum nesting depth of ${MAX_DEPTH} reached`);
      else toast.error(`Maximum ${MAX_CONDITIONS} conditions reached`);
      return;
    }
    onChange({ ...group, children: [...group.children, createGroup()] });
  }

  function updateChild(childId: string, updated: CriteriaGroupType) {
    onChange({
      ...group,
      children: group.children.map((c) => c.id === childId ? updated : c),
    });
  }

  function removeChild(childId: string) {
    onChange({ ...group, children: group.children.filter((c) => c.id !== childId) });
  }

  function toggleLogic() {
    onChange({ ...group, logic: group.logic === 'AND' ? 'OR' : 'AND' });
  }

  function toggleNot() {
    onChange({ ...group, not: !group.not });
  }

  const depthColors = [
    'border-l-blue-400 dark:border-l-blue-600',
    'border-l-green-400 dark:border-l-green-600',
    'border-l-purple-400 dark:border-l-purple-600',
    'border-l-orange-400 dark:border-l-orange-600',
    'border-l-pink-400 dark:border-l-pink-600',
  ];
  const borderColor = depthColors[depth % depthColors.length];

  return (
    <div className={`rounded-md border border-l-4 ${borderColor} p-3 space-y-3 bg-background`}>
      {/* Group Header */}
      <div className="flex items-center gap-2 flex-wrap">
        <Layers className="h-4 w-4 text-muted-foreground" />
        <Button
          variant="outline"
          size="sm"
          onClick={toggleLogic}
          className="font-mono text-xs"
        >
          {group.logic}
        </Button>
        <label className="flex items-center gap-1 text-xs">
          <input
            type="checkbox"
            checked={group.not}
            onChange={toggleNot}
            className="h-3.5 w-3.5 rounded border-gray-300"
          />
          NOT
        </label>
        <span className="text-xs text-muted-foreground">Depth: {depth + 1}/{MAX_DEPTH}</span>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={addCondition} disabled={!canAddCondition}>
            <Plus className="mr-1 h-3 w-3" /> Condition
          </Button>
          <Button variant="outline" size="sm" onClick={addSubGroup} disabled={!canAddSubGroup}>
            <FolderTree className="mr-1 h-3 w-3" /> Sub-Group
          </Button>
          {!isRoot && (
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={onRemove}>
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      {/* Conditions */}
      {group.conditions.map((cond, idx) => (
        <div key={cond.id} className="flex items-center gap-2 flex-wrap">
          {idx > 0 && (
            <span className="text-xs font-mono text-muted-foreground w-8 text-center">
              {group.logic}
            </span>
          )}
          {idx === 0 && <span className="w-8" />}

          <Select
            value={cond.field}
            onValueChange={(v: string) => updateCondition(cond.id, 'field', v)}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Field" />
            </SelectTrigger>
            <SelectContent>
              {FIELDS.map((f) => (
                <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={cond.operator}
            onValueChange={(v: string) => updateCondition(cond.id, 'operator', v)}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Operator" />
            </SelectTrigger>
            <SelectContent>
              {OPERATORS.map((op) => (
                <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            className="w-[160px]"
            placeholder={cond.operator === 'IN' ? 'val1, val2, ...' : 'Value'}
            value={cond.value}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateCondition(cond.id, 'value', e.target.value)}
          />

          {cond.operator === 'BETWEEN' && (
            <>
              <span className="text-xs text-muted-foreground">and</span>
              <Input
                className="w-[160px]"
                placeholder="Upper value"
                value={cond.value2}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateCondition(cond.id, 'value2', e.target.value)}
              />
            </>
          )}

          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => removeCondition(cond.id)}
            disabled={group.conditions.length <= 1 && group.children.length === 0}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      ))}

      {/* Child Groups */}
      {group.children.map((child) => (
        <CriteriaGroup
          key={child.id}
          group={child}
          depth={depth + 1}
          totalConditions={totalConditions}
          onChange={(updated) => updateChild(child.id, updated)}
          onRemove={() => removeChild(child.id)}
        />
      ))}
    </div>
  );
}

/* ---------- Main Component ---------- */

export default function LeadRuleBuilder() {
  const queryClient = useQueryClient();

  const [selectedRuleId, setSelectedRuleId] = useState<number | null>(null);
  const [ruleName, setRuleName] = useState('');
  const [rootGroup, setRootGroup] = useState<CriteriaGroupType>(createGroup());
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [sidebarExpanded, setSidebarExpanded] = useState(true);

  const totalConditions = useMemo(() => countConditions(rootGroup), [rootGroup]);
  const englishPreview = useMemo(() => groupToEnglish(rootGroup, 0), [rootGroup]);

  /* ---- Queries ---- */

  const { data: rulesData, isPending: rulesPending } = useQuery<{ data: SavedRule[] }>({
    queryKey: ['lead-rules'],
    queryFn: () => fetcher(API),
  });

  const savedRules: SavedRule[] = rulesData?.data ?? [];
  const filteredRules = sidebarSearch
    ? savedRules.filter((r: SavedRule) => r.name.toLowerCase().includes(sidebarSearch.toLowerCase()))
    : savedRules;

  /* ---- Mutations ---- */

  const saveMutation = useMutation({
    mutationFn: (payload: { name: string; criteria_json: CriteriaGroupType }) => {
      const url = selectedRuleId ? `${API}/${selectedRuleId}` : API;
      const method = selectedRuleId ? 'PUT' : 'POST';
      return fetch(url, {
        method,
        headers: authHeaders(),
        body: JSON.stringify(payload),
      }).then((r) => {
        if (!r.ok) return r.json().then((e: { error?: string }) => { throw new Error(e.error || 'Save failed'); });
        return r.json();
      });
    },
    onSuccess: (data: { id?: number }) => {
      queryClient.invalidateQueries({ queryKey: ['lead-rules'] });
      if (data.id) setSelectedRuleId(data.id);
      toast.success('Rule saved successfully');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const previewMutation = useMutation({
    mutationFn: (criteria_json: CriteriaGroupType) =>
      fetch(`${API}/preview`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ criteria_json }),
      }).then((r) => {
        if (!r.ok) return r.json().then((e: { error?: string }) => { throw new Error(e.error || 'Preview failed'); });
        return r.json();
      }),
    onSuccess: (data: { count: number }) => {
      setPreviewCount(data.count);
      toast.success(`Preview: ${data.count} matching leads`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const generateMutation = useMutation({
    mutationFn: (ruleId: number) =>
      fetch(`${API}/${ruleId}/generate`, {
        method: 'POST',
        headers: authHeaders(),
      }).then((r) => {
        if (!r.ok) return r.json().then((e: { error?: string }) => { throw new Error(e.error || 'Generate failed'); });
        return r.json();
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead-rules'] });
      queryClient.invalidateQueries({ queryKey: ['lead-lists'] });
      toast.success('Lead list generated successfully');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (ruleId: number) =>
      fetch(`${API}/${ruleId}`, {
        method: 'DELETE',
        headers: authHeaders(),
      }).then((r) => {
        if (!r.ok) return r.json().then((e: { error?: string }) => { throw new Error(e.error || 'Delete failed'); });
        return r.json();
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead-rules'] });
      handleNewRule();
      toast.success('Rule deleted');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  /* ---- Handlers ---- */

  function handleSave() {
    if (!ruleName.trim()) {
      toast.error('Rule name is required');
      return;
    }
    saveMutation.mutate({ name: ruleName.trim(), criteria_json: rootGroup });
  }

  function handlePreview() {
    previewMutation.mutate(rootGroup);
  }

  function handleGenerate() {
    if (!selectedRuleId) {
      toast.error('Please save the rule first before generating a list');
      return;
    }
    generateMutation.mutate(selectedRuleId);
  }

  function handleSelectRule(rule: SavedRule) {
    setSelectedRuleId(rule.id);
    setRuleName(rule.name);
    setRootGroup(rule.criteria_json);
    setPreviewCount(rule.match_count);
  }

  const handleNewRule = useCallback(() => {
    setSelectedRuleId(null);
    setRuleName('');
    setRootGroup(createGroup());
    setPreviewCount(null);
  }, []);

  function handleDeleteRule(ruleId: number) {
    if (window.confirm('Are you sure you want to delete this rule?')) {
      deleteMutation.mutate(ruleId);
    }
  }

  /* ---- Render ---- */

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Lead Rule Builder</h1>
          <p className="text-muted-foreground">
            Define criteria-based rules to automatically generate targeted lead lists
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleNewRule}>
            <Plus className="mr-1 h-4 w-4" /> New Rule
          </Button>
        </div>
      </div>

      <div className="flex gap-6">
        {/* Sidebar — Saved Rules */}
        <div className="w-72 flex-shrink-0">
          <Card>
            <CardHeader className="pb-2">
              <div
                className="flex items-center justify-between cursor-pointer"
                onClick={() => setSidebarExpanded(!sidebarExpanded)}
              >
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <GitBranch className="h-4 w-4" /> Saved Rules
                  {savedRules.length > 0 && (
                    <Badge variant="secondary" className="ml-1 text-xs">{savedRules.length}</Badge>
                  )}
                </CardTitle>
                {sidebarExpanded
                  ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                }
              </div>
            </CardHeader>
            {sidebarExpanded && (
              <CardContent className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    className="pl-8 h-8 text-sm"
                    placeholder="Search rules..."
                    value={sidebarSearch}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSidebarSearch(e.target.value)}
                  />
                </div>
                <div className="max-h-[400px] overflow-y-auto space-y-1">
                  {rulesPending ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="h-12 w-full animate-pulse rounded bg-muted" />
                    ))
                  ) : filteredRules.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">
                      No saved rules
                    </p>
                  ) : (
                    filteredRules.map((rule: SavedRule) => (
                      <div
                        key={rule.id}
                        className={`rounded-md border p-2 cursor-pointer transition-colors ${
                          selectedRuleId === rule.id
                            ? 'bg-primary/10 border-primary'
                            : 'hover:bg-muted/50'
                        }`}
                        onClick={() => handleSelectRule(rule)}
                      >
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium truncate">{rule.name}</p>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive h-6 w-6 p-0"
                            onClick={(e: React.MouseEvent) => {
                              e.stopPropagation();
                              handleDeleteRule(rule.id);
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          {rule.match_count !== null && (
                            <span className="text-xs text-muted-foreground">
                              {rule.match_count} matches
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {new Date(rule.updated_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            )}
          </Card>
        </div>

        {/* Main Builder Area */}
        <div className="flex-1 space-y-4 min-w-0">
          {/* Rule Name & Actions */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <Input
                    placeholder="Rule name (e.g. High-AUM NCR Clients)"
                    value={ruleName}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRuleName(e.target.value)}
                  />
                </div>
                <Button variant="outline" size="sm" onClick={handleSave} disabled={saveMutation.isPending}>
                  <Save className="mr-1 h-4 w-4" />
                  {saveMutation.isPending ? 'Saving...' : 'Save'}
                </Button>
                <Button variant="outline" size="sm" onClick={handlePreview} disabled={previewMutation.isPending}>
                  <Eye className="mr-1 h-4 w-4" />
                  {previewMutation.isPending ? 'Checking...' : 'Preview Match Count'}
                </Button>
                <Button
                  size="sm"
                  onClick={handleGenerate}
                  disabled={!selectedRuleId || generateMutation.isPending}
                >
                  <Play className="mr-1 h-4 w-4" />
                  {generateMutation.isPending ? 'Generating...' : 'Generate List'}
                </Button>
              </div>
              {/* Condition counter & preview count */}
              <div className="flex items-center gap-4 mt-3">
                <span className={`text-xs font-medium ${totalConditions >= MAX_CONDITIONS ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}>
                  Conditions: {totalConditions}/{MAX_CONDITIONS}
                </span>
                {previewCount !== null && (
                  <div className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5 text-green-600" />
                    <span className="text-xs font-medium text-green-700 dark:text-green-400">
                      {previewCount.toLocaleString()} matching leads
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Criteria Tree */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <FolderTree className="h-4 w-4" /> Criteria Tree
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CriteriaGroup
                group={rootGroup}
                depth={0}
                totalConditions={totalConditions}
                onChange={setRootGroup}
                onRemove={() => {}}
                isRoot
              />
            </CardContent>
          </Card>

          {/* Preview Panel */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Rule Preview (Plain English)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-md bg-muted/50 p-4 text-sm font-mono leading-relaxed break-words">
                {englishPreview || '(empty rule)'}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
