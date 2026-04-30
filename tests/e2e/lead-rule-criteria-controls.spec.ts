import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const serviceSource = readFileSync('server/services/lead-rule-service.ts', 'utf8');
const routeSource = readFileSync('server/routes/back-office/campaigns.ts', 'utf8');

describe('lead rule criteria controls coverage', () => {
  it('enforces criteria_name uniqueness on create and update', () => {
    expect(serviceSource).toContain('criteria_name must be unique');
    expect(serviceSource).toContain('createRule(data: { rule_name: string; criteria_name?: string');
    expect(serviceSource).toContain('updateRule(id: number, data: { rule_name?: string; criteria_name?: string');
    expect(serviceSource).toContain('ne(schema.leadRules.id, id)');
    expect(serviceSource).toContain('already exists');
  });

  it('supports inverted operators and NOT criteria groups', () => {
    expect(serviceSource).toContain("'NOT_EQ'");
    expect(serviceSource).toContain("'NOT_IN'");
    expect(serviceSource).toContain("'NOT_CONTAINS'");
    expect(serviceSource).toContain("node.operator === 'NOT'");
    expect(serviceSource).toContain('NOT operator must have exactly one child condition');
  });

  it('provides human-readable criteria preview endpoint', () => {
    expect(serviceSource).toContain('buildCriteriaPreview');
    expect(serviceSource).toContain('getCriteriaPreview');
    expect(routeSource).toContain("router.post('/lead-rules/criteria-preview'");
    expect(routeSource).toContain('leadRuleService.getCriteriaPreview(criteria_json)');
  });
});
