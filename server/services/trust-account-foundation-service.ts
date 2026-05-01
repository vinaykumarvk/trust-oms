import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import * as schema from '@shared/schema';

type DbLike = typeof db;

export interface TrustRelatedPartyInput {
  party_type: 'SETTLOR' | 'BENEFICIARY' | 'TRUSTEE' | 'CO_TRUSTEE' | 'AUTHORIZED_SIGNATORY' | 'UBO' | 'GUARDIAN' | 'PROTECTOR' | 'RELATED_ENTITY' | 'OTHER';
  legal_name: string;
  client_id?: string | null;
  ownership_pct?: string | null;
  authority_scope?: Record<string, unknown> | null;
  signing_limit?: string | null;
  is_ubo?: boolean;
  is_authorized_signatory?: boolean;
}

export interface CreateTrustFoundationInput {
  client_id: string;
  portfolio_id?: string;
  product_type?: typeof schema.trustProductTypeEnum.enumValues[number];
  account_name?: string;
  base_currency?: string;
  branch_id?: number | null;
  assigned_rm_id?: number | null;
  onboarding_reference_type?: string | null;
  onboarding_reference_id?: string | null;
  risk_profile_snapshot?: Record<string, unknown> | null;
  related_party_policy?: Record<string, unknown> | null;
  mandate?: {
    mandate_type?: typeof schema.trustMandateTypeEnum.enumValues[number];
    investment_authority?: string | null;
    signing_rule?: Record<string, unknown> | null;
    risk_limits?: Record<string, unknown> | null;
    document_reference?: string | null;
  };
  related_parties?: TrustRelatedPartyInput[];
}

export interface TrustFoundationResult {
  trust_account_id: string;
  portfolio_id: string;
  holding_account_ids: string[];
  security_account_ids: string[];
  settlement_account_ids: string[];
  mandate_ids: number[];
  related_party_ids: number[];
}

export interface MandateAuthorityCheckInput {
  action: string;
  amount?: string | number | null;
  signer_party_ids?: number[];
  actor_id?: string | number | null;
  related_entity_type?: string | null;
  related_entity_id?: string | number | null;
  record_evidence?: boolean;
}

export interface MandateAuthorityCheckResult {
  passed: boolean;
  trust_account_id: string;
  mandate_id: number | null;
  required_signatories: number;
  provided_signatories: number;
  valid_signatories: number;
  failures: string[];
}

export type PortfolioMandateAuthorityResult = MandateAuthorityCheckResult | null;

function compactActorId(actorId: string): number | null {
  const parsed = Number.parseInt(actorId, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function makeId(prefix: string, seed: string): string {
  const normalized = seed
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
  return `${prefix}-${normalized || Date.now()}`;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function defaultRelatedParty(input: CreateTrustFoundationInput, clientLegalName: string | null): TrustRelatedPartyInput {
  return {
    party_type: 'SETTLOR',
    legal_name: clientLegalName || input.account_name || input.client_id,
    client_id: input.client_id,
    authority_scope: { account_opening: true, instructions: true },
    is_authorized_signatory: true,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function actorText(actorId: string | number | null | undefined): string | null {
  if (actorId === null || actorId === undefined || actorId === '') return null;
  return String(actorId);
}

export const trustAccountFoundationService = {
  async createDefaultFoundation(
    input: CreateTrustFoundationInput,
    actorId: string,
    tx: DbLike = db,
  ): Promise<TrustFoundationResult> {
    if (!input.client_id) throw new Error('client_id is required');

    if (input.onboarding_reference_type && input.onboarding_reference_id) {
      const [existing] = await tx
        .select()
        .from(schema.trustAccounts)
        .where(and(
          eq(schema.trustAccounts.onboarding_reference_type, input.onboarding_reference_type),
          eq(schema.trustAccounts.onboarding_reference_id, input.onboarding_reference_id),
          eq(schema.trustAccounts.is_deleted, false),
        ));

      if (existing) {
        return this.getFoundationSummary(existing.account_id, tx);
      }
    }

    const [client] = await tx
      .select()
      .from(schema.clients)
      .where(eq(schema.clients.client_id, input.client_id));
    if (!client) throw new Error(`Client not found: ${input.client_id}`);

    const baseCurrency = input.base_currency || 'PHP';
    const productType = input.product_type || 'IMA_DISCRETIONARY';
    const portfolioId = input.portfolio_id || makeId('PORT', input.client_id);
    const trustAccountId = makeId('TA', `${input.client_id}-${portfolioId}`);
    const actorNumericId = compactActorId(actorId);

    const [existingPortfolio] = await tx
      .select()
      .from(schema.portfolios)
      .where(eq(schema.portfolios.portfolio_id, portfolioId));

    if (!existingPortfolio) {
      await tx.insert(schema.portfolios).values({
        portfolio_id: portfolioId,
        client_id: input.client_id,
        type: productType,
        base_currency: baseCurrency,
        aum: '0',
        inception_date: today(),
        portfolio_status: 'ACTIVE',
        marketing_consent: false,
        created_by: actorId,
        updated_by: actorId,
      } as any);
    }

    const [trustAccount] = await tx.insert(schema.trustAccounts).values({
      account_id: trustAccountId,
      client_id: input.client_id,
      primary_portfolio_id: portfolioId,
      product_type: productType,
      account_name: input.account_name || `${client.legal_name || input.client_id} Trust Account`,
      base_currency: baseCurrency,
      account_status: 'ACTIVE',
      branch_id: input.branch_id ?? null,
      assigned_rm_id: input.assigned_rm_id ?? client.assigned_rm_id ?? null,
      onboarding_reference_type: input.onboarding_reference_type ?? null,
      onboarding_reference_id: input.onboarding_reference_id ?? null,
      opened_at: new Date(),
      risk_profile_snapshot: input.risk_profile_snapshot ?? { client_risk_profile: client.risk_profile },
      related_party_policy: input.related_party_policy ?? { minimum_authorized_signatories: 1 },
      created_by: actorId,
      updated_by: actorId,
    } as any).returning();

    const holdingRows = await tx.insert(schema.trustHoldingAccounts).values([
      {
        account_id: `${trustAccountId}-CASH-${baseCurrency}`,
        trust_account_id: trustAccount.account_id,
        portfolio_id: portfolioId,
        account_no: `${trustAccount.account_id}-HA-CASH-${baseCurrency}`,
        account_type: 'CASH',
        currency: baseCurrency,
        account_status: 'ACTIVE',
        opened_at: new Date(),
        created_by: actorId,
        updated_by: actorId,
      },
      {
        account_id: `${trustAccountId}-SEC-HOLD`,
        trust_account_id: trustAccount.account_id,
        portfolio_id: portfolioId,
        account_no: `${trustAccount.account_id}-HA-SEC`,
        account_type: 'SECURITIES',
        currency: baseCurrency,
        account_status: 'ACTIVE',
        opened_at: new Date(),
        created_by: actorId,
        updated_by: actorId,
      },
    ] as any).returning();

    const securityRows = await tx.insert(schema.trustSecurityAccounts).values({
      account_id: `${trustAccountId}-SA`,
      trust_account_id: trustAccount.account_id,
      portfolio_id: portfolioId,
      account_no: `${trustAccount.account_id}-SA-001`,
      currency: baseCurrency,
      account_status: 'ACTIVE',
      opened_at: new Date(),
      created_by: actorId,
      updated_by: actorId,
    } as any).returning();

    const settlementRows = await tx.insert(schema.trustSettlementAccounts).values([
      {
        account_id: `${trustAccountId}-TSA-${baseCurrency}`,
        trust_account_id: trustAccount.account_id,
        portfolio_id: portfolioId,
        purpose: 'TSA',
        account_level: 'PORTFOLIO',
        account_no: `${trustAccount.account_id}-TSA-${baseCurrency}`,
        account_name: `${trustAccount.account_name} Trust Settlement Account`,
        currency: baseCurrency,
        is_default: true,
        account_status: 'ACTIVE',
        opened_at: new Date(),
        created_by: actorId,
        updated_by: actorId,
      },
      {
        account_id: `${trustAccountId}-CSA-${baseCurrency}`,
        trust_account_id: trustAccount.account_id,
        portfolio_id: portfolioId,
        purpose: 'CSA',
        account_level: 'CLIENT',
        account_no: `${trustAccount.account_id}-CSA-${baseCurrency}`,
        account_name: `${trustAccount.account_name} Client Settlement Account`,
        currency: baseCurrency,
        is_default: false,
        account_status: 'ACTIVE',
        opened_at: new Date(),
        created_by: actorId,
        updated_by: actorId,
      },
    ] as any).returning();

    const mandateRows = await tx.insert(schema.trustMandates).values({
      trust_account_id: trustAccount.account_id,
      portfolio_id: portfolioId,
      mandate_type: input.mandate?.mandate_type || (productType === 'IMA_DIRECTED' ? 'DIRECTED' : 'DISCRETIONARY'),
      effective_from: today(),
      investment_authority: input.mandate?.investment_authority ?? null,
      signing_rule: input.mandate?.signing_rule ?? { required_signatories: 1 },
      risk_limits: input.mandate?.risk_limits ?? {},
      document_reference: input.mandate?.document_reference ?? null,
      mandate_status: 'ACTIVE',
      created_by: actorId,
      updated_by: actorId,
    } as any).returning();

    const parties = input.related_parties?.length
      ? input.related_parties
      : [defaultRelatedParty(input, client.legal_name)];

    const relatedPartyRows = await tx.insert(schema.trustRelatedParties).values(
      parties.map((party) => ({
        trust_account_id: trustAccount.account_id,
        client_id: party.client_id ?? null,
        party_type: party.party_type,
        legal_name: party.legal_name,
        ownership_pct: party.ownership_pct ?? null,
        authority_scope: party.authority_scope ?? null,
        signing_limit: party.signing_limit ?? null,
        is_ubo: party.is_ubo ?? party.party_type === 'UBO',
        is_authorized_signatory: party.is_authorized_signatory ?? party.party_type === 'AUTHORIZED_SIGNATORY',
        effective_from: today(),
        created_by: actorId,
        updated_by: actorId,
      })),
    ).returning();

    await tx.insert(schema.trustAccountFoundationEvents).values({
      trust_account_id: trustAccount.account_id,
      event_type: 'FOUNDATION_CREATED',
      actor_id: actorNumericId,
      payload: {
        client_id: input.client_id,
        portfolio_id: portfolioId,
        holding_accounts: holdingRows.length,
        security_accounts: securityRows.length,
        settlement_accounts: settlementRows.length,
        related_parties: relatedPartyRows.length,
      },
      created_by: actorId,
      updated_by: actorId,
    } as any);

    return {
      trust_account_id: trustAccount.account_id,
      portfolio_id: portfolioId,
      holding_account_ids: holdingRows.map((row: any) => row.account_id),
      security_account_ids: securityRows.map((row: any) => row.account_id),
      settlement_account_ids: settlementRows.map((row: any) => row.account_id),
      mandate_ids: mandateRows.map((row: any) => row.id),
      related_party_ids: relatedPartyRows.map((row: any) => row.id),
    };
  },

  async getFoundationSummary(trustAccountId: string, tx: DbLike = db): Promise<TrustFoundationResult> {
    const [trustAccount] = await tx
      .select()
      .from(schema.trustAccounts)
      .where(eq(schema.trustAccounts.account_id, trustAccountId));
    if (!trustAccount) throw new Error(`Trust account not found: ${trustAccountId}`);

    const [holdingRows, securityRows, settlementRows, mandateRows, relatedPartyRows] = await Promise.all([
      tx.select().from(schema.trustHoldingAccounts).where(eq(schema.trustHoldingAccounts.trust_account_id, trustAccountId)),
      tx.select().from(schema.trustSecurityAccounts).where(eq(schema.trustSecurityAccounts.trust_account_id, trustAccountId)),
      tx.select().from(schema.trustSettlementAccounts).where(eq(schema.trustSettlementAccounts.trust_account_id, trustAccountId)),
      tx.select().from(schema.trustMandates).where(eq(schema.trustMandates.trust_account_id, trustAccountId)),
      tx.select().from(schema.trustRelatedParties).where(eq(schema.trustRelatedParties.trust_account_id, trustAccountId)),
    ]);

    return {
      trust_account_id: trustAccount.account_id,
      portfolio_id: trustAccount.primary_portfolio_id || '',
      holding_account_ids: holdingRows.map((row: any) => row.account_id),
      security_account_ids: securityRows.map((row: any) => row.account_id),
      settlement_account_ids: settlementRows.map((row: any) => row.account_id),
      mandate_ids: mandateRows.map((row: any) => row.id),
      related_party_ids: relatedPartyRows.map((row: any) => row.id),
    };
  },

  async listForClient(clientId: string, tx: DbLike = db) {
    if (!clientId) throw new Error('client_id is required');

    return tx
      .select()
      .from(schema.trustAccounts)
      .where(and(
        eq(schema.trustAccounts.client_id, clientId),
        eq(schema.trustAccounts.is_deleted, false),
      ));
  },

  async getFoundationDetail(trustAccountId: string, tx: DbLike = db) {
    const [trustAccount] = await tx
      .select()
      .from(schema.trustAccounts)
      .where(and(
        eq(schema.trustAccounts.account_id, trustAccountId),
        eq(schema.trustAccounts.is_deleted, false),
      ));
    if (!trustAccount) throw new Error(`Trust account not found: ${trustAccountId}`);

    const [holdingAccounts, securityAccounts, settlementAccounts, mandates, relatedParties, events] = await Promise.all([
      tx.select().from(schema.trustHoldingAccounts).where(eq(schema.trustHoldingAccounts.trust_account_id, trustAccountId)),
      tx.select().from(schema.trustSecurityAccounts).where(eq(schema.trustSecurityAccounts.trust_account_id, trustAccountId)),
      tx.select().from(schema.trustSettlementAccounts).where(eq(schema.trustSettlementAccounts.trust_account_id, trustAccountId)),
      tx.select().from(schema.trustMandates).where(eq(schema.trustMandates.trust_account_id, trustAccountId)),
      tx.select().from(schema.trustRelatedParties).where(eq(schema.trustRelatedParties.trust_account_id, trustAccountId)),
      tx.select().from(schema.trustAccountFoundationEvents).where(eq(schema.trustAccountFoundationEvents.trust_account_id, trustAccountId)),
    ]);

    return {
      trust_account: trustAccount,
      holding_accounts: holdingAccounts,
      security_accounts: securityAccounts,
      settlement_accounts: settlementAccounts,
      mandates,
      related_parties: relatedParties,
      events,
    };
  },

  async validateMandateAuthority(
    trustAccountId: string,
    input: MandateAuthorityCheckInput,
    tx: DbLike = db,
  ): Promise<MandateAuthorityCheckResult> {
    if (!trustAccountId) throw new Error('trust_account_id is required');
    if (!input.action) throw new Error('action is required');

    const [trustAccount] = await tx
      .select()
      .from(schema.trustAccounts)
      .where(and(
        eq(schema.trustAccounts.account_id, trustAccountId),
        eq(schema.trustAccounts.is_deleted, false),
      ));
    if (!trustAccount) throw new Error(`Trust account not found: ${trustAccountId}`);

    const [mandate] = await tx
      .select()
      .from(schema.trustMandates)
      .where(and(
        eq(schema.trustMandates.trust_account_id, trustAccountId),
        eq(schema.trustMandates.mandate_status, 'ACTIVE'),
        eq(schema.trustMandates.is_deleted, false),
      ));

    const relatedParties = await tx
      .select()
      .from(schema.trustRelatedParties)
      .where(and(
        eq(schema.trustRelatedParties.trust_account_id, trustAccountId),
        eq(schema.trustRelatedParties.is_deleted, false),
      ));

    const signingRule = asRecord(mandate?.signing_rule);
    const policy = asRecord(trustAccount.related_party_policy);
    const requiredSignatories = Math.max(
      1,
      Number(signingRule.required_signatories ?? policy.minimum_authorized_signatories ?? 1),
    );
    const requestedAmount = asNumber(input.amount);
    const signerIds = new Set(input.signer_party_ids ?? []);
    const failures: string[] = [];

    if (!mandate) {
      failures.push('No active trust mandate found');
    }

    const selectedSigners = relatedParties.filter((party: any) => signerIds.has(party.id));
    const unknownSignerCount = signerIds.size - selectedSigners.length;
    if (unknownSignerCount > 0) {
      failures.push(`${unknownSignerCount} provided signer(s) are not related parties on this trust account`);
    }

    const validSigners = selectedSigners.filter((party: any) => {
      const scope = asRecord(party.authority_scope);
      const hasActionScope = scope[input.action] === true || scope.instructions === true || scope.all === true;
      const signingLimit = asNumber(party.signing_limit);

      if (!party.is_authorized_signatory) {
        failures.push(`${party.legal_name} is not an authorized signatory`);
        return false;
      }
      if (!hasActionScope) {
        failures.push(`${party.legal_name} is not authorized for ${input.action}`);
        return false;
      }
      if (requestedAmount !== null && signingLimit !== null && requestedAmount > signingLimit) {
        failures.push(`${party.legal_name} signing limit ${signingLimit} is below requested amount ${requestedAmount}`);
        return false;
      }
      return true;
    });

    if (validSigners.length < requiredSignatories) {
      failures.push(`Requires ${requiredSignatories} valid authorized signatory/signatories; received ${validSigners.length}`);
    }

    const result = {
      passed: failures.length === 0,
      trust_account_id: trustAccountId,
      mandate_id: mandate?.id ?? null,
      required_signatories: requiredSignatories,
      provided_signatories: signerIds.size,
      valid_signatories: validSigners.length,
      failures,
    };

    if (input.record_evidence !== false) {
      const actor = actorText(input.actor_id);
      await tx.insert(schema.trustAccountFoundationEvents).values({
        trust_account_id: trustAccountId,
        event_type: result.passed ? 'MANDATE_AUTHORITY_CHECK_PASSED' : 'MANDATE_AUTHORITY_CHECK_FAILED',
        actor_id: actor ? compactActorId(actor) : null,
        payload: {
          action: input.action,
          amount: input.amount ?? null,
          signer_party_ids: input.signer_party_ids ?? [],
          valid_signer_party_ids: validSigners.map((party: any) => party.id),
          related_entity_type: input.related_entity_type ?? null,
          related_entity_id: input.related_entity_id ? String(input.related_entity_id) : null,
          mandate_id: result.mandate_id,
          required_signatories: result.required_signatories,
          provided_signatories: result.provided_signatories,
          valid_signatories: result.valid_signatories,
          failures: result.failures,
        },
        created_by: actor,
        updated_by: actor,
      } as any);
    }

    return result;
  },

  async validatePortfolioMandateAuthority(
    portfolioId: string,
    input: MandateAuthorityCheckInput,
    tx: DbLike = db,
  ): Promise<PortfolioMandateAuthorityResult> {
    if (!portfolioId) throw new Error('portfolio_id is required');

    const [trustAccount] = await tx
      .select()
      .from(schema.trustAccounts)
      .where(and(
        eq(schema.trustAccounts.primary_portfolio_id, portfolioId),
        eq(schema.trustAccounts.is_deleted, false),
      ));

    if (!trustAccount) return null;

    return this.validateMandateAuthority(trustAccount.account_id, input, tx);
  },

  async assertPortfolioMandateAuthority(
    portfolioId: string,
    input: MandateAuthorityCheckInput,
    tx: DbLike = db,
  ): Promise<PortfolioMandateAuthorityResult> {
    const result = await this.validatePortfolioMandateAuthority(portfolioId, input, tx);
    if (result && !result.passed) {
      throw new Error(`Mandate authority check failed: ${result.failures.join('; ')}`);
    }
    return result;
  },
};
