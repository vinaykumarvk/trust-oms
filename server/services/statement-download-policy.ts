import crypto from 'crypto';

export interface StatementAccessEntry {
  action: 'DOWNLOAD';
  requester_type: string;
  requester_id: string;
  accessed_at: string;
  ip_address: string | null;
  content_hash: string;
}

export function computeStatementContentHash(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export function retentionPolicyForStatement(statementType: string | null | undefined): string {
  switch (statementType) {
    case 'TAX_CERTIFICATE':
      return 'TAX_CERTIFICATE_7Y';
    case 'ANNUAL':
      return 'ANNUAL_STATEMENT_7Y';
    case 'QUARTERLY':
      return 'QUARTERLY_STATEMENT_7Y';
    default:
      return 'CLIENT_STATEMENT_7Y';
  }
}

export function statementRetentionUntil(baseDate: Date = new Date()): string {
  const retention = new Date(baseDate);
  retention.setFullYear(retention.getFullYear() + 7);
  return retention.toISOString().slice(0, 10);
}

export function buildStatementAccessEntry(input: {
  requesterType: string;
  requesterId: string | number;
  ipAddress?: string | null;
  contentHash: string;
  at?: Date;
}): StatementAccessEntry {
  return {
    action: 'DOWNLOAD',
    requester_type: input.requesterType,
    requester_id: String(input.requesterId),
    accessed_at: (input.at ?? new Date()).toISOString(),
    ip_address: input.ipAddress ?? null,
    content_hash: input.contentHash,
  };
}

export function appendStatementAccessHistory(
  current: unknown,
  entry: StatementAccessEntry,
): StatementAccessEntry[] {
  const history = Array.isArray(current) ? current as StatementAccessEntry[] : [];
  return [...history, entry].slice(-50);
}
