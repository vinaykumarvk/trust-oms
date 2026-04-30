import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const routesSource = readFileSync('server/routes.ts', 'utf8');
const callReportSource = readFileSync('server/services/call-report-service.ts', 'utf8');

describe('Scheduler wiring', () => {
  it('does not use nonexistent default exports from @shared/schema in scheduler jobs', () => {
    expect(routesSource).not.toContain("default: schemaRef");
    expect(routesSource).not.toContain("await import('@shared/schema') as any");
  });

  it('uses the governed system-config late-filing threshold in overdue alert scheduler', () => {
    expect(callReportSource).toContain('export async function getLateFilingDays');
    expect(routesSource).toContain("const { getLateFilingDays } = await import('./services/call-report-service')");
    expect(routesSource).toContain('const thresholdDays = await getLateFilingDays()');
  });
});
