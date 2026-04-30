import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const serviceSource = readFileSync('server/services/campaign-service.ts', 'utf8');
const routeSource = readFileSync('server/routes/back-office/campaigns.ts', 'utf8');

describe('Campaign lead upload BRD validations', () => {
  it('keeps the BRD upload limit at 10,000 rows', () => {
    expect(routeSource).toContain('rows.length > 10000');
    expect(routeSource).toContain('Maximum 10,000 rows per upload');
  });

  it('accepts only CSV/XLSX files up to 10MB for bulk lead upload', () => {
    expect(routeSource).toContain("ALLOWED_LEAD_UPLOAD_EXTENSIONS = ['.csv', '.xlsx']");
    expect(routeSource).toContain('MAX_LEAD_UPLOAD_BYTES = 10 * 1024 * 1024');
    expect(routeSource).toContain('validateLeadUploadFile(file_name, file_size_bytes)');
    expect(routeSource).toContain('Lead upload file must be a .csv or .xlsx file');
    expect(routeSource).toContain('Lead upload file must not exceed 10MB');
  });

  it('requires entity_type and at least one contact method per uploaded lead row', () => {
    expect(serviceSource).toContain('row.first_name && row.last_name && row.entity_type');
    expect(serviceSource).toContain('row.email || row.mobile_phone');
    expect(serviceSource).toContain("missing.push('entity_type')");
    expect(serviceSource).toContain("missing.push('email_or_mobile_phone')");
  });
});
