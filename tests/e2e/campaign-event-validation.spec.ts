import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const routeSource = readFileSync('server/routes/back-office/index.ts', 'utf8');

describe('campaign event validation coverage', () => {
  it('requires all event fields for EVENT_INVITATION campaigns', () => {
    expect(routeSource).toContain('function assertEventCampaignFields');
    expect(routeSource).toContain("campaignType === 'EVENT_INVITATION'");
    expect(routeSource).toContain('event_name is required for EVENT_INVITATION campaigns');
    expect(routeSource).toContain('event_date is required for EVENT_INVITATION campaigns');
    expect(routeSource).toContain('event_venue is required for EVENT_INVITATION campaigns');
  });

  it('validates event fields on create and update with current campaign values merged in', () => {
    const campaignRouterBlock = routeSource.slice(
      routeSource.indexOf("router.use(\n  '/campaigns'"),
      routeSource.indexOf("router.use(\n  '/campaign-lists'"),
    );

    expect(campaignRouterBlock).toContain('assertEventCampaignFields(d)');
    expect(campaignRouterBlock).toContain('campaign_type: schema.campaigns.campaign_type');
    expect(campaignRouterBlock).toContain('event_name: schema.campaigns.event_name');
    expect(campaignRouterBlock).toContain('event_date: schema.campaigns.event_date');
    expect(campaignRouterBlock).toContain('event_venue: schema.campaigns.event_venue');
    expect(campaignRouterBlock).toContain('event_name: d.event_name ?? current?.event_name');
  });
});
