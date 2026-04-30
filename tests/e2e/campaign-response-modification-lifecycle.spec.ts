import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const serviceSource = readFileSync('server/services/campaign-service.ts', 'utf8');
const routeSource = readFileSync('server/routes/back-office/campaigns.ts', 'utf8');

describe('campaign response modification lifecycle controls', () => {
  it('validates campaign lifecycle before modifying a response', () => {
    expect(serviceSource).toContain('if (response.campaign_id)');
    expect(serviceSource).toContain('Campaign not found for response');
    expect(serviceSource).toContain("campaign.campaign_status === 'ARCHIVED'");
    expect(serviceSource).toContain('Cannot modify responses for ARCHIVED campaigns');
    expect(serviceSource).toContain("campaign.campaign_status === 'COMPLETED' && campaign.end_date");
    expect(serviceSource).toContain('Response modification window has closed (7-day grace period after campaign completion has passed)');
  });

  it('keeps the campaign lifecycle check in the shared response update validator', () => {
    const validatorStart = serviceSource.indexOf('export async function validateResponseModification');
    const archivedCheck = serviceSource.indexOf("campaign.campaign_status === 'ARCHIVED'", validatorStart);
    const fortyEightHourCheck = serviceSource.indexOf('RESPONSE_MODIFICATION_WINDOW_MS', validatorStart + 1);

    expect(validatorStart).toBeGreaterThanOrEqual(0);
    expect(archivedCheck).toBeGreaterThan(validatorStart);
    expect(fortyEightHourCheck).toBeGreaterThan(archivedCheck);
  });

  it('routes response updates through the shared validator', () => {
    expect(routeSource).toContain("router.patch('/campaign-responses/:id'");
    expect(routeSource).toContain('await validateResponseModification(responseId, userRole)');
  });
});
