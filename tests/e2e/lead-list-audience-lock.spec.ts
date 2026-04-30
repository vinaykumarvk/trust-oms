import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const serviceSource = readFileSync('server/services/campaign-service.ts', 'utf8');
const genericRoutesSource = readFileSync('server/routes/back-office/index.ts', 'utf8');

describe('lead list audience lock coverage', () => {
  it('uses the same locked campaign statuses as the delete guard', () => {
    expect(serviceSource).toContain("LOCKED_CAMPAIGN_LIST_STATUSES = ['ACTIVE', 'APPROVED', 'PENDING_APPROVAL']");
    expect(genericRoutesSource).toContain("inArray(schema.campaigns.campaign_status, ['ACTIVE', 'APPROVED', 'PENDING_APPROVAL'])");
  });

  it('blocks audience-changing operations for lists assigned to locked campaigns', () => {
    expect(serviceSource).toContain('assertLeadListAudienceEditable(listId)');
    expect(serviceSource).toContain('assertLeadListAudienceEditable(targetListId)');
    expect(serviceSource).toContain('assertLeadListAudienceEditable(batch.target_list_id)');
    expect(serviceSource).toContain('Cannot modify a lead list assigned to a');
  });

  it('protects rule refresh, manual member edits, and upload confirmation paths', () => {
    expect(serviceSource).toContain('async executeRule(listId: number)');
    expect(serviceSource).toContain('async addMembers(listId: number');
    expect(serviceSource).toContain('async removeMember(listId: number');
    expect(serviceSource).toContain('async uploadLeads(');
    expect(serviceSource).toContain('async confirmUploadBatch(batchId: number');
  });
});
