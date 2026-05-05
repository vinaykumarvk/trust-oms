export function formatServiceRequestId(year: number, sequence: number): string {
  if (!Number.isInteger(year) || year < 2000 || year > 9999) {
    throw new Error('Invalid service request year');
  }
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error('Invalid service request sequence');
  }
  return `SR-${year}-${String(sequence).padStart(6, '0')}`;
}

export function extractServiceRequestSequence(row: unknown): number {
  const record = row as Record<string, unknown> | undefined;
  const raw = record?.last_sequence ?? record?.lastSequence ?? record?.seq ?? record?.sequence;
  const sequence = Number(raw);
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error('Service request counter did not return a valid sequence');
  }
  return sequence;
}
