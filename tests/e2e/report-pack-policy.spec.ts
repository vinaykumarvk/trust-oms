import { describe, expect, it } from 'vitest';
import {
  buildReportOutputReference,
  buildReportPackRunId,
  calculateRetentionUntil,
  estimateReportRowCount,
  nextReportPackRetryAt,
  normalizeReportRecipients,
  normalizeStringArray,
  stableReportPayloadHash,
} from '../../server/services/report-pack-policy';

describe('report pack policy', () => {
  it('builds deterministic run and output identifiers', () => {
    const runId = buildReportPackRunId(7, new Date('2026-05-04T01:02:03.000Z'));
    expect(runId).toMatch(/^RPK-7-20260504010203-[A-F0-9]{6}$/);
    expect(buildReportOutputReference('RPK-7-ABC', 'BSP FRP Trust Schedules', 'JSON')).toBe(
      'report-packs/RPK-7-ABC/bsp-frp-trust-schedules.json',
    );
  });

  it('hashes payloads and estimates row counts', () => {
    const payload = { data: { rows: [{ id: 1 }, { id: 2 }] } };
    expect(stableReportPayloadHash(payload)).toHaveLength(64);
    expect(estimateReportRowCount(payload)).toBe(2);
  });

  it('normalizes delivery metadata and retry windows', () => {
    expect(normalizeStringArray(['email', ' in_app '], ['IN_APP'])).toEqual(['EMAIL', 'IN_APP']);
    expect(normalizeReportRecipients([{ type: 'CLIENT', id: 'C-001' }])).toEqual([
      { recipient_type: 'CLIENT', recipient_id: 'C-001' },
    ]);
    expect(calculateRetentionUntil(7, new Date('2026-05-04T00:00:00.000Z'))).toBe('2033-05-04');
    expect(nextReportPackRetryAt(1, 15, new Date('2026-05-04T00:00:00.000Z')).toISOString()).toBe('2026-05-04T00:30:00.000Z');
  });
});
