/**
 * Eligibility Expression AST Evaluation Engine (TrustFees Pro — Phase 3)
 *
 * Provides a composable boolean expression language for determining
 * fee-plan eligibility based on contextual attributes (asset class,
 * customer type, portfolio type, market, etc.).
 *
 * AST operators: AND, OR, NOT, EQ, NEQ, IN, BETWEEN
 */

/* ---------- Types ---------- */

export interface ASTNode {
  op: 'AND' | 'OR' | 'NOT' | 'EQ' | 'NEQ' | 'IN' | 'BETWEEN';
  field?: string;
  value?: any;
  children?: ASTNode[];
}

export interface TraceNode {
  op: string;
  field?: string;
  value?: any;
  result: boolean;
  children?: TraceNode[];
}

export interface EvaluationResult {
  result: boolean;
  trace: TraceNode[];
}

/* ---------- Validation ---------- */

function validateNode(node: any, path: string): string[] {
  const errors: string[] = [];

  if (!node || typeof node !== 'object') {
    errors.push(`${path}: node must be an object`);
    return errors;
  }

  const validOps = ['AND', 'OR', 'NOT', 'EQ', 'NEQ', 'IN', 'BETWEEN'];
  if (!validOps.includes(node.op)) {
    errors.push(`${path}.op: must be one of ${validOps.join(', ')}, got "${node.op}"`);
    return errors;
  }

  // Logical operators require children
  if (node.op === 'AND' || node.op === 'OR') {
    if (!Array.isArray(node.children) || node.children.length === 0) {
      errors.push(`${path}: ${node.op} requires a non-empty children array`);
    } else {
      node.children.forEach((child: any, i: number) => {
        errors.push(...validateNode(child, `${path}.children[${i}]`));
      });
    }
  }

  if (node.op === 'NOT') {
    if (!Array.isArray(node.children) || node.children.length !== 1) {
      errors.push(`${path}: NOT requires exactly one child`);
    } else {
      errors.push(...validateNode(node.children[0], `${path}.children[0]`));
    }
  }

  // Comparison operators require field + value
  if (['EQ', 'NEQ', 'IN', 'BETWEEN'].includes(node.op)) {
    if (typeof node.field !== 'string' || !node.field.trim()) {
      errors.push(`${path}.field: required for ${node.op}`);
    }

    if (node.value === undefined || node.value === null) {
      errors.push(`${path}.value: required for ${node.op}`);
    }

    if (node.op === 'IN' && !Array.isArray(node.value)) {
      errors.push(`${path}.value: IN requires an array value`);
    }

    if (node.op === 'BETWEEN') {
      if (!Array.isArray(node.value) || node.value.length !== 2) {
        errors.push(`${path}.value: BETWEEN requires a two-element array [min, max]`);
      }
    }
  }

  return errors;
}

/* ---------- Evaluation ---------- */

function evaluateNode(node: ASTNode, context: Record<string, any>): TraceNode {
  switch (node.op) {
    case 'AND': {
      const childTraces = (node.children ?? []).map(c => evaluateNode(c, context));
      const result = childTraces.length > 0 && childTraces.every(t => t.result);
      return { op: 'AND', result, children: childTraces };
    }

    case 'OR': {
      const childTraces = (node.children ?? []).map(c => evaluateNode(c, context));
      const result = childTraces.length > 0 && childTraces.some(t => t.result);
      return { op: 'OR', result, children: childTraces };
    }

    case 'NOT': {
      const childTrace = evaluateNode(node.children![0], context);
      return { op: 'NOT', result: !childTrace.result, children: [childTrace] };
    }

    case 'EQ': {
      const contextValue = context[node.field!];
      const result = contextValue === node.value;
      return { op: 'EQ', field: node.field, value: node.value, result };
    }

    case 'NEQ': {
      const contextValue = context[node.field!];
      const result = contextValue !== node.value;
      return { op: 'NEQ', field: node.field, value: node.value, result };
    }

    case 'IN': {
      const contextValue = context[node.field!];
      const result = Array.isArray(node.value) && node.value.includes(contextValue);
      return { op: 'IN', field: node.field, value: node.value, result };
    }

    case 'BETWEEN': {
      const contextValue = context[node.field!];
      const [min, max] = node.value as [number, number];
      const result = contextValue >= min && contextValue <= max;
      return { op: 'BETWEEN', field: node.field, value: node.value, result };
    }

    default:
      return { op: node.op, result: false };
  }
}

/* ---------- Exported Engine ---------- */

export const eligibilityEngine = {
  /**
   * Evaluate an AST expression against a context object.
   * Returns the boolean result and a full evaluation trace.
   */
  evaluate(expression: ASTNode, context: Record<string, any>): EvaluationResult {
    const trace = evaluateNode(expression, context);
    return { result: trace.result, trace: [trace] };
  },

  /**
   * Validate AST structure without evaluation.
   * Returns an array of error messages (empty = valid).
   */
  validate(expression: any): { valid: boolean; errors: string[] } {
    const errors = validateNode(expression, 'root');
    return { valid: errors.length === 0, errors };
  },
};
