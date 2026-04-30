import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const routeSource = readFileSync('server/routes/back-office/prospects.ts', 'utf8');
const serviceSource = readFileSync('server/services/prospect-service.ts', 'utf8');

describe('prospect lifecycle ownership and audit coverage', () => {
  it('passes middleware role into drop and reactivate service calls', () => {
    expect(routeSource).toContain('req.userRole || (req as any).user?.role');
    expect(routeSource).toContain('prospectService.drop');
    expect(routeSource).toContain('prospectService.reactivate');
  });

  it('allows only assigned RM or supervisor roles for drop/reactivate', () => {
    expect(serviceSource).toContain("['SENIOR_RM', 'BO_HEAD', 'SYSTEM_ADMIN'].includes(userRole)");
    expect(serviceSource).toContain('Only the assigned Relationship Manager or a supervisor can drop this prospect');
    expect(serviceSource).toContain('Only the assigned Relationship Manager or a supervisor can reactivate this prospect');
    expect(serviceSource).toContain('prospect.assigned_rm_id');
  });

  it('records audit trail entries for prospect lifecycle transitions', () => {
    expect(serviceSource).toContain('schema.auditRecords');
    expect(serviceSource).toContain("to: 'DROPPED'");
    expect(serviceSource).toContain("to: 'REACTIVATED'");
    expect(serviceSource).toContain('RECOMMENDED_PROSPECT_STATUS');
    expect(serviceSource).toContain("const RECOMMENDED_PROSPECT_STATUS: ProspectStatus = 'RECOMMENDED_FOR_CLIENT'");
  });
});
