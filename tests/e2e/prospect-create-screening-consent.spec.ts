import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const prospectServiceSource = readFileSync('server/services/prospect-service.ts', 'utf8');
const leadServiceSource = readFileSync('server/services/lead-service.ts', 'utf8');

describe('lead/prospect create screening and consent coverage', () => {
  it('keeps prospect creation wired to negative-list screening and audit', () => {
    expect(prospectServiceSource).toContain('negativeListService.screenEntity');
    expect(prospectServiceSource).toContain('Prospect creation blocked: entity matched negative list');
    expect(prospectServiceSource).toContain('NEGATIVE_LIST_SCREEN');
    expect(prospectServiceSource).toContain("entity_id: 'PRE_CREATE'");
  });

  it('captures marketing consent at prospect creation', () => {
    expect(prospectServiceSource).toContain('marketing_consent: Boolean');
    expect(prospectServiceSource).toContain('marketing_consent_date: new Date()');
    expect(prospectServiceSource).toContain("action: 'CONSENT_CAPTURED'");
  });

  it('keeps lead creation covered by the same screening and consent controls', () => {
    expect(leadServiceSource).toContain('negativeListService.screenEntity');
    expect(leadServiceSource).toContain('Lead creation blocked: entity matched negative list');
    expect(leadServiceSource).toContain('marketing_consent_date: new Date()');
    expect(leadServiceSource).toContain("action: 'CONSENT_CAPTURED'");
  });
});
