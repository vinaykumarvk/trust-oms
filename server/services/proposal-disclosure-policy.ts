import { createHash } from 'crypto';

export interface SuitabilityDisclosureContent {
  title: string;
  sections: Array<{ heading: string; body: string }>;
  acknowledgementText: string;
}

export interface ProposalDisclosureSnapshotInput {
  proposal: {
    id: number;
    proposal_number: string;
    title: string;
    customer_id: string;
    risk_profile_id: number;
  };
  disclosureVersion: {
    id: number;
    disclosure_code: string;
    version_no: number;
    title: string;
    content: unknown;
    content_hash: string;
  };
  suitabilityDetails: unknown;
}

export function hashDisclosurePayload(payload: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(payload))
    .digest('hex');
}

export function defaultSuitabilityDisclosureContent(): SuitabilityDisclosureContent {
  return {
    title: 'Suitability Disclosure and Client Acknowledgement',
    sections: [
      {
        heading: 'Risk Profile Basis',
        body: 'The recommendation is based on the current client risk profile, investment objective, time horizon, and declared financial circumstances.',
      },
      {
        heading: 'Suitability Result',
        body: 'The suitability check compares proposed products, concentration, and acknowledged deviations against the approved client risk profile.',
      },
      {
        heading: 'Client Responsibility',
        body: 'The client must review the recommendation, product risks, fees, liquidity limits, and any deviations before accepting the proposal.',
      },
    ],
    acknowledgementText: 'I acknowledge that I reviewed the suitability disclosure and accept the proposal with the recorded suitability result.',
  };
}

export function buildProposalDisclosureSnapshot(input: ProposalDisclosureSnapshotInput): Record<string, unknown> {
  return {
    proposal_id: input.proposal.id,
    proposal_number: input.proposal.proposal_number,
    proposal_title: input.proposal.title,
    customer_id: input.proposal.customer_id,
    risk_profile_id: input.proposal.risk_profile_id,
    disclosure_version_id: input.disclosureVersion.id,
    disclosure_code: input.disclosureVersion.disclosure_code,
    disclosure_version_no: input.disclosureVersion.version_no,
    disclosure_title: input.disclosureVersion.title,
    disclosure_content_hash: input.disclosureVersion.content_hash,
    disclosure_content: input.disclosureVersion.content,
    suitability_details: input.suitabilityDetails,
    generated_at: new Date().toISOString(),
  };
}

export function buildClientAcceptanceEvidence(input: {
  evidenceId: number;
  acceptedBy: number;
  acceptedAt: Date;
  channel?: string | null;
  acceptanceMethod?: string | null;
  affirmationText?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  disclosureContentHash: string;
  disclosureVersionId: number;
}): Record<string, unknown> {
  return {
    evidence_id: input.evidenceId,
    accepted_by: input.acceptedBy,
    accepted_at: input.acceptedAt.toISOString(),
    channel: input.channel ?? 'BACK_OFFICE',
    acceptance_method: input.acceptanceMethod ?? 'CLICKWRAP',
    affirmation_text: input.affirmationText ?? null,
    ip_address: input.ipAddress ?? null,
    user_agent: input.userAgent ?? null,
    disclosure_content_hash: input.disclosureContentHash,
    disclosure_version_id: input.disclosureVersionId,
  };
}
