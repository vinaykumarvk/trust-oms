/**
 * Rule Builder Modal (CRM-PAD)
 *
 * A visual rule builder component for defining targeting rules.
 * Features:
 *   - Condition rows with field/operator/value inputs
 *   - AND/OR toggle between condition groups
 *   - Preview button showing count of matching leads
 *   - Outputs JSON rule definition
 *   - Uses shadcn Dialog component
 */

import { useState, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@ui/components/ui/button';
import { Badge } from '@ui/components/ui/badge';
import { Input } from '@ui/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@ui/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@ui/components/ui/select';
import { toast } from 'sonner';
import {
  Plus, Trash2, Eye, Filter, Layers,
} from 'lucide-react';

/* ---------- API helpers ---------- */

function authHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json' };
}

/* ---------- Types ---------- */

export interface RuleCondition {
  id: string;
  field: string;
  operator: string;
  value: string;
}

export interface ConditionGroup {
  id: string;
  conditions: RuleCondition[];
}

export type GroupOperator = 'AND' | 'OR';

export interface RuleDefinition {
  operator: GroupOperator;
  groups: {
    conditions: {
      field: string;
      operator: string;
      value: string;
    }[];
  }[];
}

interface RuleBuilderModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (rule: RuleDefinition) => void;
  initialRule?: RuleDefinition | null;
  title?: string;
}

/* ---------- Constants ---------- */

const FIELD_OPTIONS = [
  { value: 'client_category', label: 'Client Category' },
  { value: 'risk_profile', label: 'Risk Profile' },
  { value: 'total_aum', label: 'Total AUM' },
  { value: 'age', label: 'Age' },
  { value: 'region', label: 'Region' },
  { value: 'product_type', label: 'Product Type' },
  { value: 'account_type', label: 'Account Type' },
  { value: 'days_since_last_contact', label: 'Days Since Last Contact' },
] as const;

const OPERATOR_OPTIONS = [
  { value: 'equals', label: 'Equals' },
  { value: 'not_equals', label: 'Not Equals' },
  { value: 'greater_than', label: 'Greater Than' },
  { value: 'less_than', label: 'Less Than' },
  { value: 'contains', label: 'Contains' },
  { value: 'in', label: 'In (comma-separated)' },
] as const;

// Fields that accept numeric operators
const NUMERIC_FIELDS = ['total_aum', 'age', 'days_since_last_contact'];

// Filter operators based on field type
function getOperatorsForField(field: string): typeof OPERATOR_OPTIONS[number][] {
  if (NUMERIC_FIELDS.includes(field)) {
    return [...OPERATOR_OPTIONS];
  }
  // Non-numeric fields should not use greater_than / less_than
  return OPERATOR_OPTIONS.filter(
    (op: typeof OPERATOR_OPTIONS[number]) => op.value !== 'greater_than' && op.value !== 'less_than',
  );
}

let idCounter = 0;
function newId(): string {
  idCounter++;
  return `rule-${Date.now()}-${idCounter}`;
}

function createEmptyCondition(): RuleCondition {
  return { id: newId(), field: '', operator: '', value: '' };
}

function createEmptyGroup(): ConditionGroup {
  return { id: newId(), conditions: [createEmptyCondition()] };
}

/* ---------- Component ---------- */

export default function RuleBuilderModal({
  open,
  onOpenChange,
  onSave,
  initialRule,
  title = 'Rule Builder',
}: RuleBuilderModalProps) {
  // Initialize from initial rule or start with one empty group
  const [groups, setGroups] = useState<ConditionGroup[]>(() => {
    if (initialRule && initialRule.groups.length > 0) {
      return initialRule.groups.map((g: RuleDefinition['groups'][number]) => ({
        id: newId(),
        conditions: g.conditions.map((c: RuleDefinition['groups'][number]['conditions'][number]) => ({
          id: newId(),
          field: c.field,
          operator: c.operator,
          value: c.value,
        })),
      }));
    }
    return [createEmptyGroup()];
  });
  const [groupOperator, setGroupOperator] = useState<GroupOperator>(
    initialRule?.operator ?? 'AND',
  );
  const [previewCount, setPreviewCount] = useState<number | null>(null);

  /* ---- Group management ---- */

  const addGroup = useCallback(() => {
    setGroups((prev: ConditionGroup[]) => [...prev, createEmptyGroup()]);
  }, []);

  const removeGroup = useCallback((groupId: string) => {
    setGroups((prev: ConditionGroup[]) => {
      if (prev.length <= 1) return prev;
      return prev.filter((g: ConditionGroup) => g.id !== groupId);
    });
  }, []);

  /* ---- Condition management ---- */

  const addCondition = useCallback((groupId: string) => {
    setGroups((prev: ConditionGroup[]) =>
      prev.map((g: ConditionGroup) =>
        g.id === groupId
          ? { ...g, conditions: [...g.conditions, createEmptyCondition()] }
          : g,
      ),
    );
  }, []);

  const removeCondition = useCallback((groupId: string, conditionId: string) => {
    setGroups((prev: ConditionGroup[]) =>
      prev.map((g: ConditionGroup) => {
        if (g.id !== groupId) return g;
        if (g.conditions.length <= 1) return g;
        return {
          ...g,
          conditions: g.conditions.filter((c: RuleCondition) => c.id !== conditionId),
        };
      }),
    );
  }, []);

  const updateCondition = useCallback(
    (groupId: string, conditionId: string, field: keyof RuleCondition, value: string) => {
      setGroups((prev: ConditionGroup[]) =>
        prev.map((g: ConditionGroup) => {
          if (g.id !== groupId) return g;
          return {
            ...g,
            conditions: g.conditions.map((c: RuleCondition) =>
              c.id === conditionId ? { ...c, [field]: value } : c,
            ),
          };
        }),
      );
      setPreviewCount(null); // Reset preview on change
    },
    [],
  );

  /* ---- Build rule definition ---- */

  function buildRuleDefinition(): RuleDefinition {
    return {
      operator: groupOperator,
      groups: groups.map((g: ConditionGroup) => ({
        conditions: g.conditions
          .filter((c: RuleCondition) => c.field && c.operator && c.value)
          .map((c: RuleCondition) => ({
            field: c.field,
            operator: c.operator,
            value: c.value,
          })),
      })).filter((g: RuleDefinition['groups'][number]) => g.conditions.length > 0),
    };
  }

  /* ---- Preview mutation ---- */

  const previewMutation = useMutation({
    mutationFn: (rule: RuleDefinition) =>
      fetch('/api/v1/campaign-mgmt/rules/preview', {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
        body: JSON.stringify(rule),
      }).then((r) => {
        if (!r.ok) return r.json().then((e: { error?: string }) => { throw new Error(e.error || 'Preview failed'); });
        return r.json() as Promise<{ count: number }>;
      }),
    onSuccess: (data: { count: number }) => {
      setPreviewCount(data.count);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function handlePreview() {
    const rule = buildRuleDefinition();
    if (rule.groups.length === 0) {
      toast.error('Please add at least one condition before previewing');
      return;
    }
    previewMutation.mutate(rule);
  }

  function handleSave() {
    const rule = buildRuleDefinition();
    if (rule.groups.length === 0) {
      toast.error('Please add at least one valid condition');
      return;
    }
    onSave(rule);
    onOpenChange(false);
  }

  /* ---- Validation ---- */

  const hasValidConditions = groups.some((g: ConditionGroup) =>
    g.conditions.some((c: RuleCondition) => c.field && c.operator && c.value),
  );

  /* ---- Render ---- */

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" /> {title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Group Operator Toggle */}
          {groups.length > 1 && (
            <div className="flex items-center gap-2 pb-2">
              <span className="text-sm text-muted-foreground">Match</span>
              <div className="flex rounded-md border overflow-hidden">
                <button
                  type="button"
                  className={`px-3 py-1 text-sm font-medium transition-colors ${
                    groupOperator === 'AND'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-background text-muted-foreground hover:bg-muted'
                  }`}
                  onClick={() => {
                    setGroupOperator('AND');
                    setPreviewCount(null);
                  }}
                >
                  ALL groups (AND)
                </button>
                <button
                  type="button"
                  className={`px-3 py-1 text-sm font-medium transition-colors ${
                    groupOperator === 'OR'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-background text-muted-foreground hover:bg-muted'
                  }`}
                  onClick={() => {
                    setGroupOperator('OR');
                    setPreviewCount(null);
                  }}
                >
                  ANY group (OR)
                </button>
              </div>
            </div>
          )}

          {/* Condition Groups */}
          {groups.map((group: ConditionGroup, groupIndex: number) => (
            <div key={group.id} className="space-y-3">
              {/* Group separator with AND/OR label */}
              {groupIndex > 0 && (
                <div className="flex items-center gap-2 py-1">
                  <div className="flex-1 border-t" />
                  <Badge variant="outline" className="text-xs px-3">
                    {groupOperator}
                  </Badge>
                  <div className="flex-1 border-t" />
                </div>
              )}

              <div className="rounded-md border p-4 bg-muted/30 dark:bg-muted/10 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Condition Group {groupIndex + 1}
                  </span>
                  {groups.length > 1 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                      onClick={() => removeGroup(group.id)}
                    >
                      <Trash2 className="h-3 w-3 mr-1" /> Remove Group
                    </Button>
                  )}
                </div>

                {/* Conditions */}
                {group.conditions.map((condition: RuleCondition, condIndex: number) => {
                  const availableOperators = condition.field
                    ? getOperatorsForField(condition.field)
                    : [...OPERATOR_OPTIONS];

                  return (
                    <div key={condition.id} className="space-y-2">
                      {condIndex > 0 && (
                        <span className="text-xs text-muted-foreground pl-1">AND</span>
                      )}
                      <div className="flex items-center gap-2">
                        {/* Field selector */}
                        <Select
                          value={condition.field}
                          onValueChange={(v: string) =>
                            updateCondition(group.id, condition.id, 'field', v)
                          }
                        >
                          <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Select field" />
                          </SelectTrigger>
                          <SelectContent>
                            {FIELD_OPTIONS.map((f: typeof FIELD_OPTIONS[number]) => (
                              <SelectItem key={f.value} value={f.value}>
                                {f.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        {/* Operator selector */}
                        <Select
                          value={condition.operator}
                          onValueChange={(v: string) =>
                            updateCondition(group.id, condition.id, 'operator', v)
                          }
                        >
                          <SelectTrigger className="w-[160px]">
                            <SelectValue placeholder="Operator" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableOperators.map((op: typeof OPERATOR_OPTIONS[number]) => (
                              <SelectItem key={op.value} value={op.value}>
                                {op.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        {/* Value input */}
                        <Input
                          placeholder={
                            condition.operator === 'in'
                              ? 'e.g. value1,value2'
                              : 'Value'
                          }
                          value={condition.value}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            updateCondition(group.id, condition.id, 'value', e.target.value)
                          }
                          className="flex-1"
                        />

                        {/* Remove condition */}
                        {group.conditions.length > 1 && (
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label="Remove condition"
                            className="h-8 w-8 p-0 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                            onClick={() => removeCondition(group.id, condition.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Add condition button */}
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs"
                  onClick={() => addCondition(group.id)}
                >
                  <Plus className="h-3 w-3 mr-1" /> Add Condition
                </Button>
              </div>
            </div>
          ))}

          {/* Add Group button */}
          <Button size="sm" variant="outline" onClick={addGroup}>
            <Layers className="h-4 w-4 mr-1" /> Add Condition Group
          </Button>

          {/* Preview result */}
          {previewCount !== null && (
            <div className="flex items-center gap-3 rounded-md border border-blue-300 bg-blue-50 px-4 py-3 dark:border-blue-800 dark:bg-blue-950/30">
              <Eye className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
                  Preview Result
                </p>
                <p className="text-sm text-blue-700 dark:text-blue-400">
                  <span className="font-bold">{previewCount.toLocaleString()}</span> matching leads found
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            disabled={!hasValidConditions || previewMutation.isPending}
            onClick={handlePreview}
          >
            <Eye className="mr-1 h-4 w-4" />
            {previewMutation.isPending ? 'Previewing...' : 'Preview'}
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              disabled={!hasValidConditions}
              onClick={handleSave}
            >
              <Filter className="mr-1 h-4 w-4" /> Apply Rule
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
