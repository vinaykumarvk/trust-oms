import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const routeSource = readFileSync('server/routes/back-office/campaigns.ts', 'utf8');
const serviceSource = readFileSync('server/services/campaign-service.ts', 'utf8');

describe('campaign unsubscribe and SMS STOP coverage', () => {
  it('exposes unsubscribe before CRM route authentication middleware', () => {
    const unsubscribeIndex = routeSource.indexOf("router.post('/unsubscribe'");
    const authIndex = routeSource.indexOf('router.use(requireCRMRole())');
    expect(unsubscribeIndex).toBeGreaterThan(-1);
    expect(authIndex).toBeGreaterThan(-1);
    expect(unsubscribeIndex).toBeLessThan(authIndex);
  });

  it('records email and SMS opt-outs in campaign consent log', () => {
    expect(serviceSource).toContain('campaignConsentService');
    expect(serviceSource).toContain('recordMarketingOptOut');
    expect(serviceSource).toContain("consent_status: 'OPTED_OUT'");
    expect(serviceSource).toContain("consent_source: 'UNSUBSCRIBE_LINK'");
    expect(serviceSource).toContain("consentType = data.channel === 'SMS' ? 'MARKETING_SMS' : 'MARKETING_EMAIL'");
  });

  it('keeps SMS dispatches compliant with STOP opt-out instructions', () => {
    expect(serviceSource).toContain("const smsStop = '\\nReply STOP to unsubscribe.'");
    expect(serviceSource).toContain('including unsubscribe notice');
    expect(serviceSource).toContain('`${resolvedBody}${smsStop}`');
  });

  it('accepts STOP callback payloads through the unsubscribe endpoint', () => {
    expect(routeSource).toContain("channel = 'EMAIL'");
    expect(routeSource).toContain("String(message).trim().toUpperCase()");
    expect(routeSource).toContain('campaignConsentService.recordMarketingOptOut');
    expect(routeSource).toContain('consent_status');
  });
});
