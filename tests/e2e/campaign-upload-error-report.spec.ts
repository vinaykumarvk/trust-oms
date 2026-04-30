import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const serviceSource = readFileSync('server/services/campaign-service.ts', 'utf8');
const routeSource = readFileSync('server/routes/back-office/campaigns.ts', 'utf8');

describe('campaign lead upload validation reports', () => {
  it('parses persisted JSON-string validated_data for error downloads and confirmation', () => {
    expect(serviceSource).toContain('function parseLeadUploadValidatedData(raw: unknown)');
    expect(serviceSource).toContain("if (typeof raw === 'string')");
    expect(serviceSource).toContain('JSON.parse(raw) as LeadUploadValidatedData | unknown[]');
    expect(serviceSource.match(/parseLeadUploadValidatedData\(batch\.validated_data\)/g)).toHaveLength(2);
  });

  it('exposes a CSV error-report endpoint for upload batches', () => {
    expect(routeSource).toContain("router.get('/leads/upload/:batchId/errors.csv'");
    expect(routeSource).toContain('leadListService.getUploadBatchErrorsCsv');
    expect(routeSource).toContain("res.setHeader('Content-Type', 'text/csv')");
    expect(routeSource).toContain('Content-Disposition');
  });

  it('stores valid and error rows together when validating a lead upload', () => {
    expect(serviceSource).toContain('validated_data: JSON.stringify({ valid: validRows, errors: errorRows })');
    expect(serviceSource).toContain('Missing required fields: ${missing.join');
    expect(serviceSource).toContain("Duplicate: lead already exists (same name + contact)");
  });
});
