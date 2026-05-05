import crypto from 'crypto';

export interface DocumentAccessEntry {
  action: 'UPLOAD' | 'DOWNLOAD';
  requester_type: string;
  requester_id: string;
  accessed_at: string;
  ip_address: string | null;
}

export function computeDocumentContentHash(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export function retentionPolicyForClass(documentClass: string | undefined): string {
  switch (documentClass) {
    case 'TRUST_ACCOUNT_OPENING':
      return 'TRUST_ACCOUNT_OPENING_10Y';
    case 'KYC':
      return 'KYC_5Y';
    case 'TRANSACTION':
      return 'TRANSACTION_7Y';
    default:
      return 'STANDARD_7Y';
  }
}

export function buildDocumentAccessEntry(
  action: 'UPLOAD' | 'DOWNLOAD',
  requesterType: string,
  requesterId: string | number,
  ipAddress?: string | null,
  at: Date = new Date(),
): DocumentAccessEntry {
  return {
    action,
    requester_type: requesterType,
    requester_id: String(requesterId),
    accessed_at: at.toISOString(),
    ip_address: ipAddress ?? null,
  };
}

export function appendDocumentAccessHistory(
  current: unknown,
  entry: DocumentAccessEntry,
): DocumentAccessEntry[] {
  const history = Array.isArray(current) ? current as DocumentAccessEntry[] : [];
  return [...history, entry].slice(-50);
}
