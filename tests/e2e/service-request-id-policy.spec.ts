import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import {
  extractServiceRequestSequence,
  formatServiceRequestId,
} from '../../server/services/service-request-id-policy';

describe('service request id policy', () => {
  it('formats year-scoped service request identifiers', () => {
    expect(formatServiceRequestId(2026, 1)).toBe('SR-2026-000001');
    expect(formatServiceRequestId(2026, 42)).toBe('SR-2026-000042');
    expect(formatServiceRequestId(2026, 999999)).toBe('SR-2026-999999');
  });

  it('extracts sequence values from database counter rows', () => {
    expect(extractServiceRequestSequence({ last_sequence: 12 })).toBe(12);
    expect(extractServiceRequestSequence({ lastSequence: '13' })).toBe(13);
    expect(extractServiceRequestSequence({ seq: 14 })).toBe(14);
  });

  it('rejects invalid sequence inputs', () => {
    expect(() => formatServiceRequestId(2026, 0)).toThrow('Invalid service request sequence');
    expect(() => extractServiceRequestSequence({ last_sequence: 0 })).toThrow('valid sequence');
  });

  it('uses the atomic service_request_id_counters table instead of MAX-based generation', () => {
    const source = readFileSync('server/services/service-request-service.ts', 'utf8');
    expect(source).toContain('service_request_id_counters');
    expect(source).toContain('ON CONFLICT (counter_year)');
    expect(source).not.toContain('MAX(CAST(SUBSTRING');
  });
});
