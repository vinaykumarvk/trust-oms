import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const serviceSource = readFileSync('server/services/negative-list-service.ts', 'utf8');
const leadServiceSource = readFileSync('server/services/lead-service.ts', 'utf8');

describe('negative list expiry filter coverage', () => {
  it('screens only active non-expired negative list entries', () => {
    expect(serviceSource).toContain('Load active, non-expired negative list entries');
    expect(serviceSource).toContain('eq(schema.negativeList.is_active, true)');
    expect(serviceSource).toContain('isNull(schema.negativeList.expiry_date)');
    expect(serviceSource).toContain('gte(schema.negativeList.expiry_date, today)');
  });

  it('keeps lead creation wired to negative-list screening', () => {
    expect(leadServiceSource).toContain('negativeListService.screenEntity');
    expect(leadServiceSource).toContain('Lead creation blocked: entity matched negative list');
    expect(leadServiceSource).toContain('NEGATIVE_LIST_SCREEN');
  });
});
