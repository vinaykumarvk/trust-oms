import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const serviceSource = readFileSync(resolve(root, 'server/services/opportunity-service.ts'), 'utf8');
const routesSource = readFileSync(resolve(root, 'server/routes.ts'), 'utf8');
const schemaSource = readFileSync(resolve(root, 'packages/shared/src/schema.ts'), 'utf8');

describe('opportunity expiry scheduler coverage', () => {
  it('supports EXPIRED as an opportunity stage', () => {
    expect(schemaSource).toContain("'EXPIRED'");
    expect(schemaSource).toContain("opportunityStageEnum");
  });

  it('expires stale active opportunities through the opportunity service', () => {
    expect(serviceSource).toContain('processExpiredOpportunities');
    expect(serviceSource).toContain("notInArray(schema.opportunities.stage, [...TERMINAL_STAGES])");
    expect(serviceSource).toContain("stage: 'EXPIRED'");
    expect(serviceSource).toContain("updated_by: 'SYSTEM_EXPIRY_JOB'");
  });

  it('records audit evidence for automatic opportunity expiry', () => {
    expect(serviceSource).toContain('schema.conversationHistory');
    expect(serviceSource).toContain('expired after expected close date');
    expect(serviceSource).toContain("created_by: 'SYSTEM_EXPIRY_JOB'");
  });

  it('wires the route scheduler to the service implementation', () => {
    const opportunitySchedulerBlock = routesSource.slice(
      routesSource.indexOf('const runOpportunityExpiryJob'),
      routesSource.indexOf('const scheduleOpportunityExpiryAtMidnight'),
    );
    expect(opportunitySchedulerBlock).toContain('runOpportunityExpiryJob');
    expect(opportunitySchedulerBlock).toContain('opportunityService.processExpiredOpportunities()');
    expect(opportunitySchedulerBlock).not.toContain("updated_by: 'system-expiry-job'");
  });
});
