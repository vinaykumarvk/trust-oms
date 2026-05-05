import { describe, expect, it } from 'vitest';

import {
  BULK_HANDOVER_MAX_BYTES,
  BULK_HANDOVER_MAX_ROWS,
  computeBulkHandoverCounts,
  computeBulkHandoverNextRetryAt,
  groupBulkHandoverRows,
  makeInitialBulkHandoverResults,
  mergeBulkHandoverGroupResult,
  shouldRetryBulkHandoverJob,
  validateBulkHandoverUpload,
  type BulkHandoverUploadRow,
} from '../../server/services/handover-bulk-upload-policy';

const rows: BulkHandoverUploadRow[] = [
  {
    entity_type: 'client',
    entity_id: 'C001',
    entity_name: 'Client One',
    outgoing_rm_id: 10,
    incoming_rm_id: 20,
  },
  {
    entity_type: 'client',
    entity_id: 'C002',
    entity_name: 'Client Two',
    outgoing_rm_id: 10,
    incoming_rm_id: 20,
  },
  {
    entity_type: 'prospect',
    entity_id: 'P001',
    entity_name: 'Prospect One',
    outgoing_rm_id: 11,
    incoming_rm_id: 21,
  },
];

describe('Handover bulk upload policy', () => {
  it('enforces durable upload row and payload limits', () => {
    expect(validateBulkHandoverUpload(rows).valid).toBe(true);

    const tooMany = Array.from({ length: BULK_HANDOVER_MAX_ROWS + 1 }, (_, index) => ({
      ...rows[0],
      entity_id: `C${index}`,
    }));
    const rowLimit = validateBulkHandoverUpload(tooMany);
    expect(rowLimit.valid).toBe(false);
    expect(rowLimit.errors[0]).toContain('Maximum 5,000 rows');

    const byteLimit = validateBulkHandoverUpload(rows, { payloadBytes: BULK_HANDOVER_MAX_BYTES + 1 });
    expect(byteLimit.valid).toBe(false);
    expect(byteLimit.errors[0]).toContain('10 MB');
  });

  it('groups rows by entity type and RM transfer pair for resumable processing', () => {
    const groups = groupBulkHandoverRows(rows);

    expect(groups).toHaveLength(2);
    expect(groups[0].groupKey).toBe('client-10-20');
    expect(groups[0].rowNumbers).toEqual([1, 2]);
    expect(groups[1].groupKey).toBe('prospect-11-21');
    expect(groups[1].rowNumbers).toEqual([3]);
  });

  it('tracks per-group status and counts rows from latest group results', () => {
    const initial = makeInitialBulkHandoverResults(rows);
    const afterSuccess = mergeBulkHandoverGroupResult(initial, {
      group_key: 'client-10-20',
      row_numbers: [1, 2],
      status: 'success',
      attempts: 1,
      handover_id: 123,
      updated_at: '2026-05-04T00:00:00.000Z',
    });
    const afterFailure = mergeBulkHandoverGroupResult(afterSuccess, {
      group_key: 'prospect-11-21',
      row_numbers: [3],
      status: 'failed',
      attempts: 1,
      error: 'Validation failed',
      updated_at: '2026-05-04T00:01:00.000Z',
    });

    expect(computeBulkHandoverCounts(afterFailure)).toEqual({ successCount: 2, failureCount: 1 });
  });

  it('schedules bounded retries with exponential backoff', () => {
    expect(shouldRetryBulkHandoverJob(1, 3, 2)).toBe(true);
    expect(shouldRetryBulkHandoverJob(3, 3, 2)).toBe(false);
    expect(shouldRetryBulkHandoverJob(1, 3, 0)).toBe(false);

    const next = computeBulkHandoverNextRetryAt(new Date('2026-05-04T00:00:00.000Z'), 2);
    expect(next.toISOString()).toBe('2026-05-04T00:10:00.000Z');
  });
});
