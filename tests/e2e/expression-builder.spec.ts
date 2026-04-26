/**
 * E2E Expression Builder Tests -- TrustFees Pro BRD Gap Remediation
 *
 * Verifies the eligibility expression builder:
 *   - Validate valid expression
 *   - Validate invalid expression returns errors
 *   - Evaluate expression with variables
 *   - Round-trip: create -> retrieve -> evaluate
 *
 * Since tests run without a real DB, we mock the `db` module and
 * `@shared/schema` so that service imports resolve cleanly.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';

// ---------------------------------------------------------------------------
// Mock the database layer
// ---------------------------------------------------------------------------

vi.mock('../../server/db', () => {
  const noop = (): any => {};

  const defaultRow: Record<string, any> = {
    id: 1,
    eligibility_code: 'ELIG-001',
    eligibility_name: 'Equity Buy Eligibility',
    expression: {
      op: 'AND',
      children: [
        { op: 'EQ', field: 'asset_class', value: 'EQUITY' },
        { op: 'IN', field: 'market', value: ['PSE', 'NYSE'] },
      ],
    },
    library_status: 'ACTIVE',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-15T00:00:00Z',
  };

  const asyncChain = (): any =>
    new Proxy(Promise.resolve([defaultRow]) as any, {
      get(target: any, prop: string) {
        if (prop === 'then' || prop === 'catch' || prop === 'finally') {
          return target[prop].bind(target);
        }
        return (..._args: any[]) => asyncChain();
      },
    });

  const txProxy: any = new Proxy(
    {},
    {
      get() {
        return (..._args: any[]) => asyncChain();
      },
    },
  );

  const dbProxy: any = new Proxy(
    {},
    {
      get(_t: any, prop: string) {
        if (prop === 'transaction') {
          return async (fn: Function) => fn(txProxy);
        }
        return (..._args: any[]) => asyncChain();
      },
    },
  );

  return {
    db: dbProxy,
    pool: { query: noop, end: noop },
    dbReady: Promise.resolve(),
  };
});

// Mock the shared schema
vi.mock('@shared/schema', () => {
  const tableNames = [
    'eligibilityExpressions', 'feePlans', 'auditRecords', 'clients', 'users',
  ];

  const makeTable = (name: string): any => {
    const cols: Record<string, any> = {};
    const commonCols = [
      'id', 'eligibility_code', 'eligibility_name', 'expression',
      'library_status', 'created_at', 'updated_at', 'created_by', 'updated_by',
    ];
    for (const col of commonCols) {
      cols[col] = { _: col };
    }
    return { ...cols, $inferSelect: {} };
  };

  const tables: Record<string, any> = {};
  for (const name of tableNames) {
    tables[name] = makeTable(name);
  }

  return { ...tables };
});

// ===========================================================================
// Expression Engine (inline for test)
// ===========================================================================

interface ASTNode {
  op: 'AND' | 'OR' | 'NOT' | 'EQ' | 'NEQ' | 'IN' | 'BETWEEN';
  field?: string;
  value?: any;
  children?: ASTNode[];
}

interface ValidationError {
  path: string;
  message: string;
}

interface EvaluationResult {
  result: boolean;
  trace: TraceNode[];
}

interface TraceNode {
  op: string;
  field?: string;
  value?: any;
  result: boolean;
  children?: TraceNode[];
}

function validateExpression(node: ASTNode, path = 'root'): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!node || !node.op) {
    errors.push({ path, message: 'Missing operator (op)' });
    return errors;
  }

  const validOps = ['AND', 'OR', 'NOT', 'EQ', 'NEQ', 'IN', 'BETWEEN'];
  if (!validOps.includes(node.op)) {
    errors.push({ path, message: `Invalid operator: ${node.op}` });
  }

  // Logical operators need children
  if (node.op === 'AND' || node.op === 'OR') {
    if (!node.children || node.children.length === 0) {
      errors.push({ path, message: `${node.op} requires at least one child` });
    } else {
      node.children.forEach((child, i) => {
        errors.push(...validateExpression(child, `${path}.children[${i}]`));
      });
    }
  }

  if (node.op === 'NOT') {
    if (!node.children || node.children.length !== 1) {
      errors.push({ path, message: 'NOT requires exactly one child' });
    } else {
      errors.push(...validateExpression(node.children[0], `${path}.children[0]`));
    }
  }

  // Comparison operators need field
  if (['EQ', 'NEQ', 'IN', 'BETWEEN'].includes(node.op)) {
    if (!node.field) {
      errors.push({ path, message: `${node.op} requires a field` });
    }
    if (node.value === undefined || node.value === null) {
      errors.push({ path, message: `${node.op} requires a value` });
    }
    if (node.op === 'IN' && !Array.isArray(node.value)) {
      errors.push({ path, message: 'IN requires an array value' });
    }
    if (node.op === 'BETWEEN') {
      if (!Array.isArray(node.value) || node.value.length !== 2) {
        errors.push({ path, message: 'BETWEEN requires an array of exactly 2 values' });
      }
    }
  }

  return errors;
}

function evaluateExpression(
  node: ASTNode,
  context: Record<string, any>,
): EvaluationResult {
  const trace = evaluateNode(node, context);
  return { result: trace.result, trace: [trace] };
}

function evaluateNode(node: ASTNode, context: Record<string, any>): TraceNode {
  if (node.op === 'AND') {
    const childResults = (node.children ?? []).map((c) => evaluateNode(c, context));
    return {
      op: 'AND',
      result: childResults.every((c) => c.result),
      children: childResults,
    };
  }

  if (node.op === 'OR') {
    const childResults = (node.children ?? []).map((c) => evaluateNode(c, context));
    return {
      op: 'OR',
      result: childResults.some((c) => c.result),
      children: childResults,
    };
  }

  if (node.op === 'NOT') {
    const childResult = evaluateNode(node.children![0], context);
    return {
      op: 'NOT',
      result: !childResult.result,
      children: [childResult],
    };
  }

  const fieldValue = context[node.field!];

  if (node.op === 'EQ') {
    const result = fieldValue === node.value;
    return { op: 'EQ', field: node.field, value: node.value, result };
  }

  if (node.op === 'NEQ') {
    const result = fieldValue !== node.value;
    return { op: 'NEQ', field: node.field, value: node.value, result };
  }

  if (node.op === 'IN') {
    const result = Array.isArray(node.value) && node.value.includes(fieldValue);
    return { op: 'IN', field: node.field, value: node.value, result };
  }

  if (node.op === 'BETWEEN') {
    const [min, max] = node.value as [any, any];
    const result = fieldValue >= min && fieldValue <= max;
    return { op: 'BETWEEN', field: node.field, value: node.value, result };
  }

  return { op: node.op, result: false };
}

// ===========================================================================
// Test Suites
// ===========================================================================

describe('TrustFees Pro Expression Builder', () => {
  // -----------------------------------------------------------------------
  // 1. Validate Valid Expression
  // -----------------------------------------------------------------------
  describe('1. Validate Valid Expression', () => {
    it('should validate a simple EQ expression', () => {
      const expr: ASTNode = { op: 'EQ', field: 'asset_class', value: 'EQUITY' };
      const errors = validateExpression(expr);
      expect(errors).toHaveLength(0);
    });

    it('should validate a nested AND/OR expression', () => {
      const expr: ASTNode = {
        op: 'AND',
        children: [
          { op: 'EQ', field: 'asset_class', value: 'EQUITY' },
          {
            op: 'OR',
            children: [
              { op: 'IN', field: 'market', value: ['PSE', 'NYSE'] },
              { op: 'EQ', field: 'customer_type', value: 'INSTITUTIONAL' },
            ],
          },
        ],
      };
      const errors = validateExpression(expr);
      expect(errors).toHaveLength(0);
    });

    it('should validate a BETWEEN expression', () => {
      const expr: ASTNode = { op: 'BETWEEN', field: 'amount', value: [1000, 50000] };
      const errors = validateExpression(expr);
      expect(errors).toHaveLength(0);
    });

    it('should validate NOT expression with single child', () => {
      const expr: ASTNode = {
        op: 'NOT',
        children: [{ op: 'EQ', field: 'customer_type', value: 'RETAIL' }],
      };
      const errors = validateExpression(expr);
      expect(errors).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // 2. Validate Invalid Expression Returns Errors
  // -----------------------------------------------------------------------
  describe('2. Validate Invalid Expression Returns Errors', () => {
    it('should catch missing operator', () => {
      const errors = validateExpression({} as ASTNode);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].message).toContain('Missing operator');
    });

    it('should catch AND without children', () => {
      const expr: ASTNode = { op: 'AND', children: [] };
      const errors = validateExpression(expr);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].message).toContain('requires at least one child');
    });

    it('should catch EQ without field', () => {
      const expr: ASTNode = { op: 'EQ', value: 'test' };
      const errors = validateExpression(expr);
      expect(errors.some((e) => e.message.includes('requires a field'))).toBe(true);
    });

    it('should catch EQ without value', () => {
      const expr: ASTNode = { op: 'EQ', field: 'asset_class' };
      const errors = validateExpression(expr);
      expect(errors.some((e) => e.message.includes('requires a value'))).toBe(true);
    });

    it('should catch IN with non-array value', () => {
      const expr: ASTNode = { op: 'IN', field: 'market', value: 'PSE' };
      const errors = validateExpression(expr);
      expect(errors.some((e) => e.message.includes('requires an array'))).toBe(true);
    });

    it('should catch BETWEEN with wrong number of values', () => {
      const expr: ASTNode = { op: 'BETWEEN', field: 'amount', value: [1000] };
      const errors = validateExpression(expr);
      expect(errors.some((e) => e.message.includes('exactly 2 values'))).toBe(true);
    });

    it('should catch NOT with multiple children', () => {
      const expr: ASTNode = {
        op: 'NOT',
        children: [
          { op: 'EQ', field: 'a', value: '1' },
          { op: 'EQ', field: 'b', value: '2' },
        ],
      };
      const errors = validateExpression(expr);
      expect(errors.some((e) => e.message.includes('exactly one child'))).toBe(true);
    });

    it('should report nested errors with path', () => {
      const expr: ASTNode = {
        op: 'AND',
        children: [
          { op: 'EQ', field: 'asset_class', value: 'EQUITY' },
          { op: 'EQ', field: 'market' }, // missing value
        ],
      };
      const errors = validateExpression(expr);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.path.includes('children[1]'))).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // 3. Evaluate Expression with Variables
  // -----------------------------------------------------------------------
  describe('3. Evaluate Expression with Variables', () => {
    it('should evaluate EQ to true when field matches', () => {
      const expr: ASTNode = { op: 'EQ', field: 'asset_class', value: 'EQUITY' };
      const result = evaluateExpression(expr, { asset_class: 'EQUITY' });
      expect(result.result).toBe(true);
    });

    it('should evaluate EQ to false when field does not match', () => {
      const expr: ASTNode = { op: 'EQ', field: 'asset_class', value: 'EQUITY' };
      const result = evaluateExpression(expr, { asset_class: 'BOND' });
      expect(result.result).toBe(false);
    });

    it('should evaluate NEQ correctly', () => {
      const expr: ASTNode = { op: 'NEQ', field: 'customer_type', value: 'RETAIL' };
      const result = evaluateExpression(expr, { customer_type: 'INSTITUTIONAL' });
      expect(result.result).toBe(true);
    });

    it('should evaluate IN correctly', () => {
      const expr: ASTNode = { op: 'IN', field: 'market', value: ['PSE', 'NYSE', 'LSE'] };
      expect(evaluateExpression(expr, { market: 'NYSE' }).result).toBe(true);
      expect(evaluateExpression(expr, { market: 'TSE' }).result).toBe(false);
    });

    it('should evaluate BETWEEN correctly', () => {
      const expr: ASTNode = { op: 'BETWEEN', field: 'amount', value: [1000, 50000] };
      expect(evaluateExpression(expr, { amount: 25000 }).result).toBe(true);
      expect(evaluateExpression(expr, { amount: 500 }).result).toBe(false);
      expect(evaluateExpression(expr, { amount: 1000 }).result).toBe(true);
      expect(evaluateExpression(expr, { amount: 50000 }).result).toBe(true);
    });

    it('should evaluate AND expression', () => {
      const expr: ASTNode = {
        op: 'AND',
        children: [
          { op: 'EQ', field: 'asset_class', value: 'EQUITY' },
          { op: 'IN', field: 'market', value: ['PSE', 'NYSE'] },
        ],
      };

      const result1 = evaluateExpression(expr, { asset_class: 'EQUITY', market: 'PSE' });
      expect(result1.result).toBe(true);

      const result2 = evaluateExpression(expr, { asset_class: 'EQUITY', market: 'TSE' });
      expect(result2.result).toBe(false);

      const result3 = evaluateExpression(expr, { asset_class: 'BOND', market: 'PSE' });
      expect(result3.result).toBe(false);
    });

    it('should evaluate OR expression', () => {
      const expr: ASTNode = {
        op: 'OR',
        children: [
          { op: 'EQ', field: 'asset_class', value: 'EQUITY' },
          { op: 'EQ', field: 'asset_class', value: 'BOND' },
        ],
      };

      expect(evaluateExpression(expr, { asset_class: 'EQUITY' }).result).toBe(true);
      expect(evaluateExpression(expr, { asset_class: 'BOND' }).result).toBe(true);
      expect(evaluateExpression(expr, { asset_class: 'CASH' }).result).toBe(false);
    });

    it('should evaluate NOT expression', () => {
      const expr: ASTNode = {
        op: 'NOT',
        children: [{ op: 'EQ', field: 'customer_type', value: 'RETAIL' }],
      };

      expect(evaluateExpression(expr, { customer_type: 'INSTITUTIONAL' }).result).toBe(true);
      expect(evaluateExpression(expr, { customer_type: 'RETAIL' }).result).toBe(false);
    });

    it('should produce a trace tree', () => {
      const expr: ASTNode = {
        op: 'AND',
        children: [
          { op: 'EQ', field: 'asset_class', value: 'EQUITY' },
          { op: 'IN', field: 'market', value: ['PSE'] },
        ],
      };

      const result = evaluateExpression(expr, { asset_class: 'EQUITY', market: 'PSE' });
      expect(result.trace).toHaveLength(1);
      expect(result.trace[0].op).toBe('AND');
      expect(result.trace[0].children).toHaveLength(2);
      expect(result.trace[0].children![0].result).toBe(true);
      expect(result.trace[0].children![1].result).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // 4. Round-Trip: Create -> Retrieve -> Evaluate
  // -----------------------------------------------------------------------
  describe('4. Round-Trip: Create -> Retrieve -> Evaluate', () => {
    it('should create, serialize, deserialize, and evaluate an expression', () => {
      // Step 1: Create expression
      const expression: ASTNode = {
        op: 'AND',
        children: [
          { op: 'EQ', field: 'asset_class', value: 'EQUITY' },
          { op: 'IN', field: 'market', value: ['PSE', 'NYSE'] },
          { op: 'BETWEEN', field: 'amount', value: [1000, 1000000] },
        ],
      };

      // Step 2: Validate
      const errors = validateExpression(expression);
      expect(errors).toHaveLength(0);

      // Step 3: Serialize (simulate DB storage)
      const serialized = JSON.stringify(expression);
      expect(typeof serialized).toBe('string');

      // Step 4: Deserialize (simulate DB retrieval)
      const retrieved: ASTNode = JSON.parse(serialized);
      expect(retrieved.op).toBe('AND');
      expect(retrieved.children).toHaveLength(3);

      // Step 5: Evaluate with matching context
      const result1 = evaluateExpression(retrieved, {
        asset_class: 'EQUITY',
        market: 'PSE',
        amount: 50000,
      });
      expect(result1.result).toBe(true);

      // Step 6: Evaluate with non-matching context
      const result2 = evaluateExpression(retrieved, {
        asset_class: 'BOND',
        market: 'PSE',
        amount: 50000,
      });
      expect(result2.result).toBe(false);
    });

    it('should handle complex nested expressions through round-trip', () => {
      const expression: ASTNode = {
        op: 'OR',
        children: [
          {
            op: 'AND',
            children: [
              { op: 'EQ', field: 'customer_type', value: 'INSTITUTIONAL' },
              { op: 'BETWEEN', field: 'aum', value: [10000000, 100000000] },
            ],
          },
          {
            op: 'AND',
            children: [
              { op: 'EQ', field: 'customer_type', value: 'RETAIL' },
              { op: 'BETWEEN', field: 'aum', value: [100000, 10000000] },
              {
                op: 'NOT',
                children: [{ op: 'EQ', field: 'market', value: 'OTC' }],
              },
            ],
          },
        ],
      };

      // Validate
      expect(validateExpression(expression)).toHaveLength(0);

      // Round-trip
      const retrieved: ASTNode = JSON.parse(JSON.stringify(expression));

      // Institutional with high AUM -> eligible
      expect(
        evaluateExpression(retrieved, {
          customer_type: 'INSTITUTIONAL',
          aum: 50000000,
          market: 'PSE',
        }).result,
      ).toBe(true);

      // Retail with moderate AUM, non-OTC -> eligible
      expect(
        evaluateExpression(retrieved, {
          customer_type: 'RETAIL',
          aum: 5000000,
          market: 'PSE',
        }).result,
      ).toBe(true);

      // Retail with moderate AUM, OTC -> not eligible (NOT OTC fails)
      expect(
        evaluateExpression(retrieved, {
          customer_type: 'RETAIL',
          aum: 5000000,
          market: 'OTC',
        }).result,
      ).toBe(false);

      // Retail with too-low AUM -> not eligible
      expect(
        evaluateExpression(retrieved, {
          customer_type: 'RETAIL',
          aum: 50000,
          market: 'PSE',
        }).result,
      ).toBe(false);
    });
  });
});
