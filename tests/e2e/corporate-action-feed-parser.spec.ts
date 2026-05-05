import { describe, expect, it } from 'vitest';
import { parseCorporateActionFeed } from '../../server/services/corporate-action-feed-parser';

describe('Corporate action external feed parser boundary', () => {
  it('normalizes PSE EDGE JSON into the CA ingestion contract', () => {
    const result = parseCorporateActionFeed({
      sourceSystem: 'PSE_EDGE',
      format: 'PSE_EDGE_JSON',
      payload: {
        disclosure_id: 'PSE-2026-001',
        security_id: 12,
        stock_symbol: 'BDO',
        action_type: 'cash dividend',
        ex_date: '2026-05-15',
        record_date: '2026-05-16',
        payment_date: '2026-06-01',
        cash_amount: '2.50',
      },
    });

    expect(result.validationErrors).toEqual([]);
    expect(result.normalized.externalEventId).toBe('PSE-2026-001');
    expect(result.normalized.type).toBe('DIVIDEND_CASH');
    expect(result.normalized.securityId).toBe(12);
    expect(result.normalized.amountPerShare).toBe('2.50');
  });

  it('normalizes SWIFT MT564 key fields and validates required security mapping', () => {
    const result = parseCorporateActionFeed({
      sourceSystem: 'SWIFT',
      format: 'SWIFT_MT564',
      payload: [
        ':20C::CORP//EVT-564-001',
        ':22F::CAEV//DVCA',
        ':35B:ISINPHY123456789',
        ':98A::XDTE//20260515',
        ':98A::RDTE//20260516',
        ':98A::PAYD//20260601',
        ':92A::GRSS//PHP2,50',
        ':70E::ADTX//SECURITY_ID=99',
      ].join('\n'),
    });

    expect(result.validationErrors).toEqual([]);
    expect(result.normalized.externalEventId).toBe('EVT-564-001');
    expect(result.normalized.type).toBe('DIVIDEND_CASH');
    expect(result.normalized.exDate).toBe('2026-05-15');
    expect(result.normalized.securityId).toBe(99);
  });

  it('normalizes DTCC GCAV CSV rows', () => {
    const result = parseCorporateActionFeed({
      sourceSystem: 'DTCC_GCAV',
      format: 'DTCC_GCAV_CSV',
      payload: [
        'event_id,security_id,isin,caev,ex_date,record_date,payment_date,ratio',
        'GCAV-1,44,US1234567890,SPLF,20260515,20260516,20260601,2',
      ].join('\n'),
    });

    expect(result.validationErrors).toEqual([]);
    expect(result.normalized.externalEventId).toBe('GCAV-1');
    expect(result.normalized.type).toBe('SPLIT');
    expect(result.normalized.ratio).toBe('2');
  });

  it('returns validation errors instead of mutating state for incomplete messages', () => {
    const result = parseCorporateActionFeed({
      sourceSystem: 'ISO20022',
      format: 'NORMALIZED_JSON',
      payload: {
        externalEventId: 'BAD-1',
        type: 'DIVIDEND_CASH',
        exDate: '2026-05-15',
      },
    });

    expect(result.validationErrors).toContain('securityId is required or security mapping is unresolved');
    expect(result.validationErrors).toContain('recordDate is required');
  });
});
