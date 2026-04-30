import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const serviceSource = readFileSync(resolve(process.cwd(), 'server/services/opportunity-service.ts'), 'utf8');
const routeSource = readFileSync(resolve(process.cwd(), 'server/routes/back-office/opportunities.ts'), 'utf8');

describe('opportunity conversation history coverage', () => {
  it('records conversation history when opportunities are created', () => {
    const createBlock = serviceSource.slice(
      serviceSource.indexOf('async create(data:'),
      serviceSource.indexOf('async getById'),
    );

    expect(createBlock).toContain('schema.conversationHistory');
    expect(createBlock).toContain('reference_type:');
    expect(createBlock).toContain("'opportunity'");
    expect(createBlock).toContain('reference_id: opp.id');
    expect(createBlock).toContain('created');
  });

  it('passes the authenticated actor into opportunity creation for audit attribution', () => {
    const postBlock = routeSource.slice(
      routeSource.indexOf("router.post('/', requireCRMRole()"),
      routeSource.indexOf('// Update opportunity'),
    );

    expect(postBlock).toContain('actorId');
    expect(postBlock).toContain('created_by: actorId');
    expect(postBlock).toContain('user?.id');
    expect(postBlock).toContain('userId');
  });
});
