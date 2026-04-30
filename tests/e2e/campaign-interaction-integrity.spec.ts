import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const serviceSource = readFileSync('server/services/campaign-service.ts', 'utf8');
const routeSource = readFileSync('server/routes/back-office/campaigns.ts', 'utf8');

describe('campaign interaction integrity controls', () => {
  it('requires campaign context before logging a campaign response', () => {
    expect(routeSource).toContain('if (!campaign_id)');
    expect(routeSource).toContain('campaign_id is required when logging a campaign response');
    expect(serviceSource).toContain("throw new Error('Campaign not found')");
  });

  it('keeps response creation behind campaign lifecycle and uniqueness checks', () => {
    const responseInsert = serviceSource.indexOf('campaign_id: data.campaign_id || 0');
    const campaignLookup = serviceSource.indexOf('from(schema.campaigns).where(eq(schema.campaigns.id, data.campaign_id))');
    const uniquenessCheck = serviceSource.indexOf('A response already exists for this lead in this campaign');

    expect(campaignLookup).toBeGreaterThanOrEqual(0);
    expect(uniquenessCheck).toBeGreaterThan(campaignLookup);
    expect(responseInsert).toBeGreaterThan(uniquenessCheck);
  });

  it('exposes interaction logging through the campaign route', () => {
    expect(routeSource).toContain("router.post('/interactions'");
    expect(routeSource).toContain('interactionService.logInteraction');
  });
});
