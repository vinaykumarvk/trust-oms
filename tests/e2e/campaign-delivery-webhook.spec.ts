import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const routeSource = readFileSync('server/routes/back-office/campaigns.ts', 'utf8');
const serviceSource = readFileSync('server/services/campaign-service.ts', 'utf8');

describe('campaign delivery webhook coverage', () => {
  it('exposes provider delivery webhook before CRM auth middleware', () => {
    const webhookIndex = routeSource.indexOf("router.post('/communications/webhook'");
    const authIndex = routeSource.indexOf('router.use(requireCRMRole())');
    expect(webhookIndex).toBeGreaterThan(-1);
    expect(authIndex).toBeGreaterThan(-1);
    expect(webhookIndex).toBeLessThan(authIndex);
  });

  it('updates aggregate communication delivery status through the dispatch service', () => {
    expect(serviceSource).toContain('recordDeliveryWebhook');
    expect(serviceSource).toContain('schema.campaignCommunications');
    expect(serviceSource).toContain('delivered_count: deliveredCount');
    expect(serviceSource).toContain('bounced_count: bouncedCount');
    expect(serviceSource).toContain('last_failure_reason');
    expect(serviceSource).toContain("updated_by: `${data.provider || 'gateway'}-webhook`");
  });

  it('maps provider failures to FAILED/DISPATCHING/COMPLETED dispatch states', () => {
    expect(serviceSource).toContain("normalizedStatus === 'BOUNCED'");
    expect(serviceSource).toContain("normalizedStatus === 'FAILED'");
    expect(serviceSource).toContain("'FAILED'");
    expect(serviceSource).toContain("'DISPATCHING'");
    expect(serviceSource).toContain("'COMPLETED'");
  });

  it('accepts communication_id or dispatch_id callback payloads', () => {
    expect(routeSource).toContain('communication_id');
    expect(routeSource).toContain('dispatch_id');
    expect(routeSource).toContain('campaignDispatchService.recordDeliveryWebhook');
  });
});
