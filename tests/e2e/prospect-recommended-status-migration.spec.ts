import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const schemaSource = readFileSync('packages/shared/src/schema.ts', 'utf8');
const prospectServiceSource = readFileSync('server/services/prospect-service.ts', 'utf8');
const conversionServiceSource = readFileSync('server/services/conversion-service.ts', 'utf8');
const migrationSource = readFileSync('drizzle/20260430_add_recommended_for_client_prospect_status.sql', 'utf8');

describe('prospect RECOMMENDED_FOR_CLIENT status migration', () => {
  it('adds the BRD status to schema and migration artifacts', () => {
    expect(schemaSource).toContain("'RECOMMENDED_FOR_CLIENT'");
    expect(migrationSource).toContain("ALTER TYPE prospect_status ADD VALUE IF NOT EXISTS 'RECOMMENDED_FOR_CLIENT'");
  });

  it('uses RECOMMENDED_FOR_CLIENT as the canonical recommendation status', () => {
    expect(prospectServiceSource).toContain("const RECOMMENDED_PROSPECT_STATUS: ProspectStatus = 'RECOMMENDED_FOR_CLIENT'");
    expect(prospectServiceSource).toContain('prospect_status: RECOMMENDED_PROSPECT_STATUS');
    expect(prospectServiceSource).toContain('to: RECOMMENDED_PROSPECT_STATUS');
  });

  it('keeps conversion and reporting compatible with legacy RECOMMENDED rows', () => {
    expect(conversionServiceSource).toContain("prospect.prospect_status !== 'RECOMMENDED_FOR_CLIENT' && prospect.prospect_status !== 'RECOMMENDED'");
    expect(conversionServiceSource).toContain("(prospectMap['RECOMMENDED_FOR_CLIENT'] || 0) + (prospectMap['RECOMMENDED'] || 0)");
    expect(prospectServiceSource).toContain("(statusMap['RECOMMENDED_FOR_CLIENT'] || 0) + (statusMap['RECOMMENDED'] || 0)");
  });
});
