import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const schemaSource = readFileSync('packages/shared/src/schema.ts', 'utf8');
const serviceSource = readFileSync('server/services/meeting-service.ts', 'utf8');
const routesSource = readFileSync('server/routes.ts', 'utf8');

describe('Meeting no-show scheduler', () => {
  it('supports auditable MEETING_NO_SHOW conversation history entries', () => {
    expect(schemaSource).toContain("'NO_SHOW'");
    expect(schemaSource).toContain("'MEETING_NO_SHOW'");
  });

  it('marks stale scheduled meetings as NO_SHOW instead of scheduler-completing them', () => {
    expect(serviceSource).toContain('processNoShowMeetings');
    expect(serviceSource).toContain("meeting_status: 'NO_SHOW'");
    expect(serviceSource).toContain("call_report_status: 'NO_SHOW'");
    expect(serviceSource).toContain("interaction_type: 'MEETING_NO_SHOW'");
    expect(serviceSource).toContain('void this.processNoShowMeetings()');
  });

  it('wires the startup scheduler to the no-show service method', () => {
    expect(routesSource).toContain('runMeetingNoShowJob');
    expect(routesSource).toContain('meetingService.processNoShowMeetings()');
    expect(routesSource).not.toContain('[MeetingAutoComplete]');
  });
});
