export interface BulkHandoverUploadRow {
  entity_type: string;
  entity_id: string;
  entity_name: string;
  outgoing_rm_id: number;
  incoming_rm_id: number;
  reason?: string;
  aum?: number;
}

export interface BulkHandoverGroup {
  groupKey: string;
  rowNumbers: number[];
  rows: BulkHandoverUploadRow[];
}

export interface BulkHandoverGroupResult {
  group_key: string;
  row_numbers: number[];
  status: 'pending' | 'success' | 'failed';
  attempts: number;
  handover_id?: number;
  error?: string;
  updated_at: string;
}

export const BULK_HANDOVER_MAX_ROWS = 5_000;
export const BULK_HANDOVER_MAX_BYTES = 10 * 1024 * 1024;
export const BULK_HANDOVER_DEFAULT_MAX_RETRIES = 3;

export function estimateBulkHandoverPayloadBytes(rows: BulkHandoverUploadRow[]): number {
  return Buffer.byteLength(JSON.stringify(rows), 'utf8');
}

export function validateBulkHandoverUpload(
  rows: BulkHandoverUploadRow[],
  options: { payloadBytes?: number; maxRows?: number; maxBytes?: number } = {},
): { valid: boolean; errors: string[]; payloadBytes: number } {
  const maxRows = options.maxRows ?? BULK_HANDOVER_MAX_ROWS;
  const maxBytes = options.maxBytes ?? BULK_HANDOVER_MAX_BYTES;
  const payloadBytes = options.payloadBytes ?? estimateBulkHandoverPayloadBytes(rows);
  const errors: string[] = [];

  if (!Array.isArray(rows) || rows.length === 0) {
    errors.push('Bulk handover upload requires at least one row');
  }
  if (rows.length > maxRows) {
    errors.push(`Maximum ${maxRows.toLocaleString('en-US')} rows per upload. Received: ${rows.length}`);
  }
  if (payloadBytes > maxBytes) {
    errors.push(`Upload payload exceeds ${Math.round(maxBytes / 1024 / 1024)} MB limit`);
  }

  return { valid: errors.length === 0, errors, payloadBytes };
}

export function groupBulkHandoverRows(rows: BulkHandoverUploadRow[]): BulkHandoverGroup[] {
  const groups = new Map<string, BulkHandoverGroup>();
  rows.forEach((row, index) => {
    const groupKey = `${row.entity_type}-${row.outgoing_rm_id}-${row.incoming_rm_id}`;
    const group = groups.get(groupKey) ?? { groupKey, rowNumbers: [], rows: [] };
    group.rowNumbers.push(index + 1);
    group.rows.push(row);
    groups.set(groupKey, group);
  });
  return Array.from(groups.values());
}

export function makeInitialBulkHandoverResults(rows: BulkHandoverUploadRow[]): BulkHandoverGroupResult[] {
  const now = new Date().toISOString();
  return groupBulkHandoverRows(rows).map((group) => ({
    group_key: group.groupKey,
    row_numbers: group.rowNumbers,
    status: 'pending',
    attempts: 0,
    updated_at: now,
  }));
}

export function mergeBulkHandoverGroupResult(
  existing: BulkHandoverGroupResult[],
  result: BulkHandoverGroupResult,
): BulkHandoverGroupResult[] {
  const byKey = new Map(existing.map((item) => [item.group_key, item]));
  byKey.set(result.group_key, result);
  return Array.from(byKey.values());
}

export function computeBulkHandoverCounts(results: BulkHandoverGroupResult[]): { successCount: number; failureCount: number } {
  return results.reduce(
    (counts, result) => {
      if (result.status === 'success') counts.successCount += result.row_numbers.length;
      if (result.status === 'failed') counts.failureCount += result.row_numbers.length;
      return counts;
    },
    { successCount: 0, failureCount: 0 },
  );
}

export function shouldRetryBulkHandoverJob(retryCount: number, maxRetries: number, failureCount: number): boolean {
  return failureCount > 0 && retryCount < maxRetries;
}

export function computeBulkHandoverNextRetryAt(now: Date, retryCount: number): Date {
  const delayMinutes = Math.min(60, 5 * 2 ** Math.max(0, retryCount - 1));
  return new Date(now.getTime() + delayMinutes * 60 * 1000);
}
