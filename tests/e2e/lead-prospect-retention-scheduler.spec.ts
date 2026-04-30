import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const routesSource = readFileSync('server/routes.ts', 'utf8');
const leadServiceSource = readFileSync('server/services/lead-service.ts', 'utf8');
const prospectServiceSource = readFileSync('server/services/prospect-service.ts', 'utf8');

describe('lead/prospect retention scheduler coverage', () => {
  it('wires a nightly retention scheduler for stale lead and prospect records', () => {
    expect(routesSource).toContain('runLeadProspectRetentionJob');
    expect(routesSource).toContain("await import('./services/lead-service')");
    expect(routesSource).toContain("await import('./services/prospect-service')");
    expect(routesSource).toContain('CRM_LEAD_PROSPECT_RETENTION_DAYS');
    expect(routesSource).toContain('leadService.processRetentionPurge(retentionDays)');
    expect(routesSource).toContain('prospectService.processRetentionPurge(retentionDays)');
    expect(routesSource).toContain('[LeadProspectRetention]');
  });

  it('soft-deletes stale dropped or not-interested leads using the retention cutoff', () => {
    expect(leadServiceSource).toContain('async processRetentionPurge(retentionDays = 365)');
    expect(leadServiceSource).toContain("updated_by: 'SYSTEM_RETENTION_JOB'");
    expect(leadServiceSource).toContain('deleted_at: new Date()');
    expect(leadServiceSource).toContain("inArray(schema.leads.lead_status, ['DROPPED', 'NOT_INTERESTED'])");
    expect(leadServiceSource).toContain('lte(schema.leads.updated_at, cutoff)');
  });

  it('soft-deletes stale dropped prospects using drop_date or updated_at', () => {
    expect(prospectServiceSource).toContain('async processRetentionPurge(retentionDays = 365)');
    expect(prospectServiceSource).toContain("eq(schema.prospects.prospect_status, 'DROPPED')");
    expect(prospectServiceSource).toContain('COALESCE(${schema.prospects.drop_date}, ${schema.prospects.updated_at}) <= ${cutoff}');
    expect(prospectServiceSource).toContain("updated_by: 'SYSTEM_RETENTION_JOB'");
  });
});
