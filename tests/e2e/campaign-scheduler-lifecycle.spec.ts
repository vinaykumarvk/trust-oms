import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const routesSource = readFileSync('server/routes.ts', 'utf8');
const serviceSource = readFileSync('server/services/campaign-service.ts', 'utf8');

describe('campaign scheduler lifecycle coverage', () => {
  it('schedules both activation/completion and EOD archival lifecycle processing', () => {
    const schedulerBlockStart = routesSource.indexOf('Campaign activation/completion scheduler');
    expect(schedulerBlockStart).toBeGreaterThanOrEqual(0);

    const schedulerBlock = routesSource.slice(schedulerBlockStart, routesSource.indexOf('GAP-011: Approval auto-unclaim scheduler'));
    expect(schedulerBlock).toContain("await import('./services/campaign-activation-job')");
    expect(schedulerBlock).toContain("await import('./services/campaign-service')");
    expect(schedulerBlock).toContain('await runActivationJob()');
    expect(schedulerBlock).toContain('await campaignEodBatch()');
  });

  it('keeps archival and expired handover cleanup in the campaign EOD service path', () => {
    expect(serviceSource).toContain('export async function campaignEodBatch()');
    expect(serviceSource).toContain("campaign_status: 'ARCHIVED'");
    expect(serviceSource).toContain("handover_status: 'CANCELLED'");
    expect(serviceSource).toContain('handoversCancelledCount');
  });
});
