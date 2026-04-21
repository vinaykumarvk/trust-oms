/**
 * Back-Office CRUD Route Registration
 *
 * Registers all entity CRUD routes for the back-office API.
 * Each route uses createCrudRouter or createNestedCrudRouter
 * with entity-specific configuration.
 *
 * All routes are guarded by requireBackOfficeRole middleware.
 */

import { Router } from 'express';
import { createCrudRouter } from '../crud-factory';
import { createNestedCrudRouter } from '../nested-crud-factory';
import { requireBackOfficeRole } from '../../middleware/role-auth';
import { logDataAccess } from '../../middleware/role-auth';
import * as schema from '@shared/schema';

const router = Router();

// Apply back-office role guard to all routes
router.use(requireBackOfficeRole());

// ============================================================================
// Reference Data
// ============================================================================

router.use(
  '/countries',
  createCrudRouter(schema.countries, {
    searchableColumns: ['code', 'name'],
    defaultSort: 'name',
    entityKey: 'countries',
    makerChecker: 'countries',
  }),
);

router.use(
  '/currencies',
  createCrudRouter(schema.currencies, {
    searchableColumns: ['code', 'name'],
    defaultSort: 'code',
    entityKey: 'currencies',
    makerChecker: 'currencies',
  }),
);

router.use(
  '/asset-classes',
  createCrudRouter(schema.assetClasses, {
    searchableColumns: ['code', 'name'],
    defaultSort: 'name',
    entityKey: 'asset-classes',
    makerChecker: 'asset-classes',
  }),
);

router.use(
  '/branches',
  createCrudRouter(schema.branches, {
    searchableColumns: ['code', 'name', 'region'],
    defaultSort: 'name',
    entityKey: 'branches',
    makerChecker: 'branches',
  }),
);

router.use(
  '/exchanges',
  createCrudRouter(schema.exchanges, {
    searchableColumns: ['code', 'name'],
    defaultSort: 'code',
    entityKey: 'exchanges',
    makerChecker: 'exchanges',
  }),
);

router.use(
  '/trust-product-types',
  createCrudRouter(schema.trustProductTypes, {
    searchableColumns: ['code', 'name'],
    defaultSort: 'name',
    entityKey: 'trust-product-types',
    makerChecker: 'trust-product-types',
  }),
);

router.use(
  '/fee-types',
  createCrudRouter(schema.feeTypes, {
    searchableColumns: ['code', 'name'],
    defaultSort: 'code',
    entityKey: 'fee-types',
    makerChecker: 'fee-types',
  }),
);

router.use(
  '/tax-codes',
  createCrudRouter(schema.taxCodes, {
    searchableColumns: ['code', 'name', 'type'],
    defaultSort: 'code',
    entityKey: 'tax-codes',
    makerChecker: 'tax-codes',
  }),
);

router.use(
  '/market-calendar',
  createCrudRouter(schema.marketCalendar, {
    searchableColumns: ['calendar_key', 'holiday_name'],
    defaultSort: 'date',
    entityKey: 'market-calendar',
    makerChecker: 'market-calendar',
  }),
);

router.use(
  '/legal-entities',
  createCrudRouter(schema.legalEntities, {
    searchableColumns: ['entity_code', 'entity_name'],
    defaultSort: 'entity_code',
    entityKey: 'legal-entities',
    makerChecker: 'legal-entities',
  }),
);

router.use(
  '/feed-routing',
  createCrudRouter(schema.feedRouting, {
    searchableColumns: ['security_segment'],
    defaultSort: 'id',
    entityKey: 'feed-routing',
    makerChecker: 'feed-routing',
  }),
);

router.use(
  '/data-stewardship',
  createCrudRouter(schema.dataStewardship, {
    searchableColumns: ['dataset_key'],
    defaultSort: 'dataset_key',
    entityKey: 'data-stewardship',
    makerChecker: 'data-stewardship',
  }),
);

// ============================================================================
// Master Data
// ============================================================================

router.use(
  '/counterparties',
  createCrudRouter(schema.counterparties, {
    searchableColumns: ['name', 'lei', 'bic', 'type'],
    defaultSort: 'name',
    entityKey: 'counterparties',
    makerChecker: 'counterparties',
  }),
);

router.use(
  '/brokers',
  createCrudRouter(schema.brokers, {
    searchableColumns: [],
    defaultSort: 'id',
    entityKey: 'brokers',
    makerChecker: 'brokers',
  }),
);

router.use(
  '/securities',
  createCrudRouter(schema.securities, {
    searchableColumns: ['name', 'isin', 'cusip', 'sedol', 'bloomberg_ticker', 'local_code'],
    defaultSort: 'name',
    entityKey: 'securities',
    makerChecker: 'securities',
  }),
);

router.use(
  '/portfolios',
  createCrudRouter(schema.portfolios, {
    searchableColumns: ['portfolio_id', 'client_id'],
    defaultSort: 'portfolio_id',
    entityKey: 'portfolios',
    makerChecker: 'portfolios',
  }),
);

// Clients — PII logging enabled
router.use(
  '/clients',
  logDataAccess('clients'),
  createCrudRouter(schema.clients, {
    searchableColumns: ['client_id', 'legal_name', 'type'],
    defaultSort: 'legal_name',
    entityKey: 'clients',
    makerChecker: 'clients',
  }),
);

router.use(
  '/users',
  createCrudRouter(schema.users, {
    searchableColumns: ['username', 'full_name', 'email', 'role'],
    defaultSort: 'username',
    entityKey: 'users',
    makerChecker: 'users',
    omitFromInsert: ['password_hash', 'last_login'],
  }),
);

// ============================================================================
// Nested Routes (sub-resources scoped to parent)
// ============================================================================

// Client sub-entities
router.use(
  '/clients/:parentId/profiles',
  logDataAccess('client-profiles'),
  createNestedCrudRouter(schema.clientProfiles, {
    parentTable: schema.clients,
    parentFkColumn: 'client_id',
    searchableColumns: ['risk_tolerance', 'investment_horizon'],
    entityKey: 'client-profiles',
  }),
);

router.use(
  '/clients/:parentId/kyc-cases',
  logDataAccess('kyc-cases'),
  createNestedCrudRouter(schema.kycCases, {
    parentTable: schema.clients,
    parentFkColumn: 'client_id',
    searchableColumns: ['risk_rating', 'id_type'],
    entityKey: 'kyc-cases',
  }),
);

router.use(
  '/clients/:parentId/beneficial-owners',
  logDataAccess('beneficial-owners'),
  createNestedCrudRouter(schema.beneficialOwners, {
    parentTable: schema.clients,
    parentFkColumn: 'client_id',
    searchableColumns: ['ubo_name'],
    entityKey: 'beneficial-owners',
  }),
);

router.use(
  '/clients/:parentId/fatca-crs',
  logDataAccess('fatca-crs'),
  createNestedCrudRouter(schema.clientFatcaCrs, {
    parentTable: schema.clients,
    parentFkColumn: 'client_id',
    entityKey: 'fatca-crs',
  }),
);

// Portfolio sub-entities
router.use(
  '/portfolios/:parentId/mandates',
  createNestedCrudRouter(schema.mandates, {
    parentTable: schema.portfolios,
    parentFkColumn: 'portfolio_id',
    entityKey: 'mandates',
  }),
);

router.use(
  '/portfolios/:parentId/fee-schedules',
  createNestedCrudRouter(schema.feeSchedules, {
    parentTable: schema.portfolios,
    parentFkColumn: 'portfolio_id',
    searchableColumns: ['fee_type', 'calculation_method'],
    entityKey: 'fee-schedules',
  }),
);

router.use(
  '/portfolios/:parentId/positions',
  createNestedCrudRouter(schema.positions, {
    parentTable: schema.portfolios,
    parentFkColumn: 'portfolio_id',
    entityKey: 'positions',
  }),
);

// ============================================================================
// Workflow Definitions (approval workflows)
// ============================================================================

router.use(
  '/workflow-definitions',
  createCrudRouter(schema.approvalWorkflowDefinitions, {
    searchableColumns: ['entity_type', 'action'],
    defaultSort: 'entity_type',
    entityKey: 'workflow-definitions',
  }),
);

// ============================================================================
// BDO RFI Gap Entities
// ============================================================================

router.use(
  '/model-portfolios',
  createCrudRouter(schema.modelPortfolios, {
    searchableColumns: ['name'],
    defaultSort: 'name',
    entityKey: 'model-portfolios',
    makerChecker: 'model-portfolios',
  }),
);

router.use(
  '/compliance-limits',
  createCrudRouter(schema.complianceLimits, {
    searchableColumns: ['limit_type', 'dimension', 'dimension_id'],
    defaultSort: 'limit_type',
    entityKey: 'compliance-limits',
    makerChecker: 'compliance-limits',
  }),
);

router.use(
  '/scheduled-plans',
  createCrudRouter(schema.scheduledPlans, {
    searchableColumns: ['client_id', 'portfolio_id', 'plan_type'],
    defaultSort: 'id',
    entityKey: 'scheduled-plans',
    makerChecker: 'scheduled-plans',
  }),
);

router.use(
  '/pera-accounts',
  logDataAccess('pera-accounts'),
  createCrudRouter(schema.peraAccounts, {
    searchableColumns: ['contributor_id', 'administrator', 'bsp_pera_id'],
    defaultSort: 'id',
    entityKey: 'pera-accounts',
    makerChecker: 'pera-accounts',
  }),
);

router.use(
  '/held-away-assets',
  createCrudRouter(schema.heldAwayAssets, {
    searchableColumns: ['portfolio_id', 'asset_class', 'custodian'],
    defaultSort: 'portfolio_id',
    entityKey: 'held-away-assets',
    makerChecker: 'held-away-assets',
  }),
);

router.use(
  '/standing-instructions',
  createCrudRouter(schema.standingInstructions, {
    searchableColumns: ['account_id', 'portfolio_id', 'instruction_type'],
    defaultSort: 'id',
    entityKey: 'standing-instructions',
    makerChecker: 'standing-instructions',
  }),
);

// PERA sub-entities
router.use(
  '/pera-accounts/:parentId/transactions',
  logDataAccess('pera-transactions'),
  createNestedCrudRouter(schema.peraTransactions, {
    parentTable: schema.peraAccounts,
    parentFkColumn: 'pera_account_id',
    searchableColumns: ['type'],
    entityKey: 'pera-transactions',
  }),
);

export default router;
