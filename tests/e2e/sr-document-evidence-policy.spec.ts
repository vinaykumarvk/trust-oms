import { describe, expect, it } from 'vitest';
import {
  appendDocumentAccessHistory,
  buildDocumentAccessEntry,
  computeDocumentContentHash,
  retentionPolicyForClass,
} from '../../server/services/sr-document-evidence-policy';

describe('service request document evidence policy', () => {
  it('computes stable SHA-256 content hashes', () => {
    expect(computeDocumentContentHash(Buffer.from('trust evidence'))).toBe(
      computeDocumentContentHash(Buffer.from('trust evidence')),
    );
    expect(computeDocumentContentHash(Buffer.from('trust evidence'))).toHaveLength(64);
  });

  it('maps document classes to retention policies', () => {
    expect(retentionPolicyForClass('TRUST_ACCOUNT_OPENING')).toBe('TRUST_ACCOUNT_OPENING_10Y');
    expect(retentionPolicyForClass('KYC')).toBe('KYC_5Y');
    expect(retentionPolicyForClass('TRANSACTION')).toBe('TRANSACTION_7Y');
    expect(retentionPolicyForClass('OTHER')).toBe('STANDARD_7Y');
  });

  it('builds and appends bounded access history entries', () => {
    const entry = buildDocumentAccessEntry(
      'DOWNLOAD',
      'CLIENT',
      'portal-user-1',
      '127.0.0.1',
      new Date('2026-05-04T00:00:00.000Z'),
    );

    expect(entry).toEqual({
      action: 'DOWNLOAD',
      requester_type: 'CLIENT',
      requester_id: 'portal-user-1',
      accessed_at: '2026-05-04T00:00:00.000Z',
      ip_address: '127.0.0.1',
    });

    const longHistory = Array.from({ length: 50 }, (_, i) => buildDocumentAccessEntry('UPLOAD', 'SYSTEM', i));
    const next = appendDocumentAccessHistory(longHistory, entry);
    expect(next).toHaveLength(50);
    expect(next.at(-1)).toEqual(entry);
  });
});
