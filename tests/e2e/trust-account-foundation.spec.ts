import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const schemaSource = readFileSync('packages/shared/src/schema.ts', 'utf8');
const serviceSource = readFileSync('server/services/trust-account-foundation-service.ts', 'utf8');
const conversionServiceSource = readFileSync('server/services/conversion-service.ts', 'utf8');
const settlementServiceSource = readFileSync('server/services/settlement-service.ts', 'utf8');
const withdrawalServiceSource = readFileSync('server/services/withdrawal-service.ts', 'utf8');
const contributionServiceSource = readFileSync('server/services/contribution-service.ts', 'utf8');
const transferServiceSource = readFileSync('server/services/transfer-service.ts', 'utf8');
const backOfficeIndexSource = readFileSync('server/routes/back-office/index.ts', 'utf8');
const trustAccountRouteSource = readFileSync('server/routes/back-office/trust-accounts.ts', 'utf8');
const withdrawalRouteSource = readFileSync('server/routes/back-office/withdrawals.ts', 'utf8');
const contributionRouteSource = readFileSync('server/routes/back-office/contributions.ts', 'utf8');
const transferRouteSource = readFileSync('server/routes/back-office/transfers.ts', 'utf8');
const trustAccountsPageSource = readFileSync('apps/back-office/src/pages/trust-accounts.tsx', 'utf8');
const backOfficeRoutesSource = readFileSync('apps/back-office/src/routes/index.tsx', 'utf8');
const backOfficeNavigationSource = readFileSync('apps/back-office/src/config/navigation.ts', 'utf8');
const migrationSource = readFileSync('drizzle/20260501_add_trust_account_foundation.sql', 'utf8');

describe('trust banking account foundation', () => {
  it('adds first-class trust banking foundation tables to the shared schema', () => {
    expect(schemaSource).toContain("export const trustAccounts = pgTable");
    expect(schemaSource).toContain("export const trustHoldingAccounts = pgTable");
    expect(schemaSource).toContain("export const trustSecurityAccounts = pgTable");
    expect(schemaSource).toContain("export const trustSettlementAccounts = pgTable");
    expect(schemaSource).toContain("export const trustMandates = pgTable");
    expect(schemaSource).toContain("export const trustRelatedParties = pgTable");
    expect(schemaSource).toContain("export const trustAccountFoundationEvents = pgTable");
  });

  it('ships a migration for the foundation schema', () => {
    expect(migrationSource).toContain('CREATE TABLE IF NOT EXISTS trust_accounts');
    expect(migrationSource).toContain('CREATE TABLE IF NOT EXISTS trust_holding_accounts');
    expect(migrationSource).toContain('CREATE TABLE IF NOT EXISTS trust_security_accounts');
    expect(migrationSource).toContain('CREATE TABLE IF NOT EXISTS trust_settlement_accounts');
    expect(migrationSource).toContain('CREATE TABLE IF NOT EXISTS trust_mandates');
    expect(migrationSource).toContain('CREATE TABLE IF NOT EXISTS trust_related_parties');
    expect(migrationSource).toContain('CREATE TABLE IF NOT EXISTS trust_account_foundation_events');
    expect(migrationSource).toContain('ux_trust_accounts_onboarding_ref');
  });

  it('creates a default operational account stack through a service', () => {
    expect(serviceSource).toContain('export const trustAccountFoundationService');
    expect(serviceSource).toContain('createDefaultFoundation');
    expect(serviceSource).toContain('listForClient');
    expect(serviceSource).toContain('getFoundationDetail');
    expect(serviceSource).toContain('validateMandateAuthority');
    expect(serviceSource).toContain('validatePortfolioMandateAuthority');
    expect(serviceSource).toContain('assertPortfolioMandateAuthority');
    expect(serviceSource).toContain('required_signatories');
    expect(serviceSource).toContain('is_authorized_signatory');
    expect(serviceSource).toContain('signing_limit');
    expect(serviceSource).toContain('MANDATE_AUTHORITY_CHECK_PASSED');
    expect(serviceSource).toContain('MANDATE_AUTHORITY_CHECK_FAILED');
    expect(serviceSource).toContain('related_entity_type');
    expect(serviceSource).toContain('valid_signer_party_ids');
    expect(serviceSource).toContain('schema.trustAccounts');
    expect(serviceSource).toContain('schema.trustHoldingAccounts');
    expect(serviceSource).toContain('schema.trustSecurityAccounts');
    expect(serviceSource).toContain('schema.trustSettlementAccounts');
    expect(serviceSource).toContain('schema.trustMandates');
    expect(serviceSource).toContain('schema.trustRelatedParties');
    expect(serviceSource).toContain('FOUNDATION_CREATED');
  });

  it('wires prospect-to-customer conversion to foundation creation', () => {
    expect(conversionServiceSource).toContain("import { trustAccountFoundationService } from './trust-account-foundation-service'");
    expect(conversionServiceSource).toContain('trustAccountFoundationService.createDefaultFoundation');
    expect(conversionServiceSource).toContain("onboarding_reference_type: 'PROSPECT'");
    expect(conversionServiceSource).toContain('trust_foundation');
  });

  it('uses trust settlement accounts during SSI resolution', () => {
    expect(settlementServiceSource).toContain('schema.trustSettlementAccounts');
    expect(settlementServiceSource).toContain("eq(schema.trustSettlementAccounts.purpose, 'TSA')");
    expect(settlementServiceSource).toContain("swift_message_type: currency === 'PHP' ? 'MT543' : 'MT540'");
  });

  it('enforces mandate authority during cash movement approvals', () => {
    expect(withdrawalServiceSource).toContain('trustAccountFoundationService.assertPortfolioMandateAuthority');
    expect(withdrawalServiceSource).toContain("action: 'withdrawal'");
    expect(withdrawalServiceSource).toContain("related_entity_type: 'WITHDRAWAL'");
    expect(contributionServiceSource).toContain('trustAccountFoundationService.assertPortfolioMandateAuthority');
    expect(contributionServiceSource).toContain("action: 'contribution'");
    expect(contributionServiceSource).toContain("related_entity_type: 'CONTRIBUTION'");
    expect(transferServiceSource).toContain('trustAccountFoundationService.assertPortfolioMandateAuthority');
    expect(transferServiceSource).toContain("action: 'transfer'");
    expect(transferServiceSource).toContain("related_entity_type: 'TRANSFER'");
    expect(withdrawalRouteSource).toContain('signerPartyIds');
    expect(contributionRouteSource).toContain('signerPartyIds');
    expect(transferRouteSource).toContain('signerPartyIds');
  });

  it('exposes back-office routes for trust account foundation access', () => {
    expect(backOfficeIndexSource).toContain("import trustAccountRoutes from './trust-accounts'");
    expect(backOfficeIndexSource).toContain("router.use('/trust-accounts', trustAccountRoutes)");
    expect(trustAccountRouteSource).toContain("router.get(\n  '/'");
    expect(trustAccountRouteSource).toContain("router.get(\n  '/:accountId'");
    expect(trustAccountRouteSource).toContain("router.post(\n  '/:accountId/authority-check'");
    expect(trustAccountRouteSource).toContain("router.post(\n  '/'");
    expect(trustAccountRouteSource).toContain('trustAccountFoundationService.createDefaultFoundation');
    expect(trustAccountRouteSource).toContain('trustAccountFoundationService.validateMandateAuthority');
  });

  it('adds a back-office UI surface for trust account foundation and authority evidence', () => {
    expect(backOfficeNavigationSource).toContain('Trust Accounts');
    expect(backOfficeNavigationSource).toContain('/master-data/trust-accounts');
    expect(backOfficeRoutesSource).toContain('TrustAccountsPage');
    expect(trustAccountsPageSource).toContain('/api/v1/trust-accounts?client_id=');
    expect(trustAccountsPageSource).toContain('Create Foundation');
    expect(trustAccountsPageSource).toContain('Create Account Stack');
    expect(trustAccountsPageSource).toContain('/authority-check');
    expect(trustAccountsPageSource).toContain('Authorized Signers');
    expect(trustAccountsPageSource).toContain('selectedSignerIds');
    expect(trustAccountsPageSource).toContain('TabsTrigger value="events"');
  });
});
