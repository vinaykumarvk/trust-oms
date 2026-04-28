// ============================================================================
// TrustOMS Philippines - Complete Core Database Schema (Phase 0B)
// Drizzle ORM + PostgreSQL
// ============================================================================

import {
  pgTable,
  pgEnum,
  serial,
  text,
  integer,
  boolean,
  numeric,
  date,
  timestamp,
  jsonb,
  bigserial,
  index,
  uniqueIndex,
  primaryKey,
  uuid,
  unique,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

// ============================================================================
// PostgreSQL Enums
// ============================================================================

export const trustProductTypeEnum = pgEnum('trust_product_type', [
  'IMA_DIRECTED',
  'IMA_DISCRETIONARY',
  'PMT',
  'UITF',
  'PRE_NEED',
  'EMPLOYEE_BENEFIT',
  'ESCROW',
  'AGENCY',
  'SAFEKEEPING',
]);

export const orderStatusEnum = pgEnum('order_status', [
  'DRAFT',
  'PENDING_AUTH',
  'AUTHORIZED',
  'REJECTED',
  'AGGREGATED',
  'PLACED',
  'PARTIALLY_FILLED',
  'FILLED',
  'CONFIRMED',
  'SETTLED',
  'REVERSAL_PENDING',
  'REVERSED',
  'CANCELLED',
]);

export const orderSideEnum = pgEnum('order_side', ['BUY', 'SELL']);

export const orderTypeEnum = pgEnum('order_type', ['MARKET', 'LIMIT', 'STOP']);

export const piiClassificationEnum = pgEnum('pii_classification', [
  'NONE',
  'PII',
  'SENSITIVE_PII',
  'FINANCIAL_PII',
]);

export const dataResidencyEnum = pgEnum('data_residency', [
  'PH_ONLY',
  'ALLOWED_OFFSHORE',
]);

export const approvalStatusEnum = pgEnum('approval_status', [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
]);

export const auditActionEnum = pgEnum('audit_action', [
  'CREATE',
  'UPDATE',
  'DELETE',
  'LOGIN',
  'LOGOUT',
  'ACCESS',
  'EXPORT',
  'AUTHORIZE',
  'REJECT',
  'REVERSE',
]);

export const riskProfileEnum = pgEnum('risk_profile', [
  'CONSERVATIVE',
  'MODERATE',
  'BALANCED',
  'GROWTH',
  'AGGRESSIVE',
]);

export const kycStatusEnum = pgEnum('kyc_status', [
  'PENDING',
  'VERIFIED',
  'EXPIRED',
  'REJECTED',
]);

export const settlementStatusEnum = pgEnum('settlement_status', [
  'PENDING',
  'MATCHED',
  'FAILED',
  'SETTLED',
  'REVERSED',
]);

export const feeTypeEnum = pgEnum('fee_type_enum', [
  'TRUSTEE',
  'MANAGEMENT',
  'CUSTODY',
  'PERFORMANCE',
  'UITF_TER',
  'STAMP_DUTY',
  'TRANSFER_TAX',
  'REGISTRATION_FEE',
]);

export const taxTypeEnum = pgEnum('tax_type', [
  'WHT',
  'FATCA',
  'CRS',
]);

export const corporateActionTypeEnum = pgEnum('corporate_action_type', [
  'DIVIDEND_CASH', 'DIVIDEND_STOCK', 'BONUS_ISSUE', 'SPLIT', 'REVERSE_SPLIT', 'CONSOLIDATION',
  'COUPON', 'PARTIAL_REDEMPTION', 'FULL_REDEMPTION', 'MATURITY',
  'CAPITAL_DISTRIBUTION', 'CAPITAL_GAINS_DISTRIBUTION', 'RETURN_OF_CAPITAL',
  'NAME_CHANGE', 'ISIN_CHANGE', 'TICKER_CHANGE', 'PAR_VALUE_CHANGE', 'SECURITY_RECLASSIFICATION',
  'RIGHTS', 'TENDER', 'BUYBACK', 'DUTCH_AUCTION', 'EXCHANGE_OFFER', 'WARRANT_EXERCISE', 'CONVERSION',
  'MERGER', 'PROXY_VOTE', 'CLASS_ACTION',
  'DIVIDEND_WITH_OPTION', 'MERGER_WITH_ELECTION', 'SPINOFF_WITH_OPTION',
  'BONUS',
  'TENDER_OFFER',
]);

export const surveillancePatternEnum = pgEnum('surveillance_pattern', [
  'LAYERING',
  'SPOOFING',
  'WASH_TRADING',
  'FRONT_RUNNING',
]);

export const notificationChannelEnum = pgEnum('notification_channel', [
  'IN_APP',
  'EMAIL',
  'SMS',
  'PUSH',
  'PAGER_DUTY',
]);

export const makerCheckerTierEnum = pgEnum('maker_checker_tier', [
  'TWO_EYES',
  'FOUR_EYES',
  'SIX_EYES',
]);

export const timeInForceTypeEnum = pgEnum('time_in_force_type', ['DAY', 'GTC', 'IOC', 'FOK']);
export const paymentModeTypeEnum = pgEnum('payment_mode_type', ['DEBIT_CA_SA', 'CASH', 'CHEQUE', 'WIRE_TRANSFER']);
export const disposalMethodEnum = pgEnum('disposal_method', ['FIFO', 'LIFO', 'WEIGHTED_AVG', 'SPECIFIC_LOT', 'HIGHEST_COST']);
export const validationSeverityEnum = pgEnum('validation_severity', ['HARD', 'SOFT']);
export const scheduledPlanTypeEnum = pgEnum('scheduled_plan_type', ['EIP', 'ERP']);
export const scheduledPlanStatusEnum = pgEnum('scheduled_plan_status', ['ACTIVE', 'PAUSED', 'CANCELLED', 'COMPLETED']);
export const peraTransactionTypeEnum = pgEnum('pera_transaction_type', ['CONTRIBUTION', 'QUALIFIED_WITHDRAWAL', 'UNQUALIFIED_WITHDRAWAL', 'TRANSFER_PRODUCT', 'TRANSFER_ADMIN', 'TCC']);
export const standingInstructionTypeEnum = pgEnum('standing_instruction_type', ['AUTO_ROLL', 'AUTO_CREDIT', 'AUTO_WITHDRAWAL']);
export const rebalancingStatusEnum = pgEnum('rebalancing_status', ['DRAFT', 'APPROVED', 'EXECUTED', 'CANCELLED']);

// ============================================================================
// TRUST-CA 360 — Enums
// ============================================================================

export const corporateActionStatusEnum = pgEnum('corporate_action_status', [
  'ANNOUNCED', 'SCRUBBED', 'GOLDEN_COPY', 'ENTITLED', 'ELECTED', 'SETTLED', 'CANCELLED', 'REVERSED',
]);

export const ttraStatusEnum = pgEnum('ttra_status', [
  'APPLIED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'EXPIRED', 'RENEWAL_PENDING', 'EXPIRED_FALLBACK',
]);

export const claimStatusEnum = pgEnum('claim_status', [
  'DRAFT', 'INVESTIGATING', 'PENDING_APPROVAL', 'APPROVED', 'PAID', 'REJECTED', 'WITHDRAWN', 'DISCLOSED',
]);

export const claimOriginationEnum = pgEnum('claim_origination', [
  'CLIENT_RAISED', 'INTERNALLY_DETECTED', 'REGULATOR_RAISED',
]);

export const claimRootCauseEnum = pgEnum('claim_root_cause', [
  'DEADLINE_MISSED', 'TAX_ERROR', 'FEE_ERROR', 'WRONG_OPTION', 'SYSTEM_OUTAGE', 'DATA_QUALITY', 'VENDOR_FAILURE', 'OTHER',
]);

export const claimApprovalTierEnum = pgEnum('claim_approval_tier', [
  'AUTO', 'MANAGER', 'HEAD', 'EXEC_COMMITTEE',
]);

export const degradedModeComponentEnum = pgEnum('degraded_mode_component', [
  'BLOOMBERG', 'REUTERS', 'DTCC', 'PDTC', 'SWIFT', 'AI', 'DB',
]);

export const consentPurposeEnum = pgEnum('consent_purpose', [
  'OPERATIONAL', 'MARKETING', 'AUTOMATED_DECISION', 'RESEARCH_AGGREGATE',
]);

// ── Trust Banking Hardening Enums ──────────────────────────────────────────
export const documentClassEnum = pgEnum('document_class', [
  'TRUST_ACCOUNT_OPENING', 'KYC', 'TRANSACTION', 'OTHER',
]);

export const deliveryStatusEnum = pgEnum('delivery_status', [
  'PENDING', 'GENERATING', 'AVAILABLE', 'FAILED',
]);

export const scanStatusEnum = pgEnum('scan_status', [
  'PENDING', 'CLEAN', 'QUARANTINED', 'SKIPPED',
]);

export const messageSenderTypeEnum = pgEnum('message_sender_type', [
  'RM', 'CLIENT', 'SYSTEM',
]);

export const feedStatusEnum = pgEnum('feed_status', [
  'UP', 'DEGRADED', 'DOWN', 'OVERRIDE_UP', 'OVERRIDE_DOWN',
]);

export const consentLegalBasisEnum = pgEnum('consent_legal_basis', [
  'CONSENT', 'CONTRACT', 'LEGAL_OBLIGATION', 'LEGITIMATE_INTEREST',
]);

export const feedCostTierEnum = pgEnum('feed_cost_tier', [
  'BASELINE', 'PREMIUM',
]);

export const securitySegmentEnum = pgEnum('security_segment', [
  'PH_BLUE_CHIP', 'PH_MID_CAP', 'PH_SMALL_CAP', 'FOREIGN_G10', 'FOREIGN_EM', 'FIXED_INCOME',
]);

export const dataSegregationEnum = pgEnum('data_segregation_scope', [
  'HARD', 'SOFT',
]);

export const stewardshipApprovalEnum = pgEnum('stewardship_approval', [
  'SINGLE_APPROVER', 'DUAL_APPROVAL', 'COMMITTEE_APPROVAL',
]);

// ============================================================================
// TrustFees Pro — Enums
// ============================================================================

export const chargeBasisEnum = pgEnum('charge_basis', ['EVENT', 'PERIOD']);

export const pricingTypeEnum = pgEnum('pricing_type', [
  'FIXED_AMOUNT', 'FIXED_RATE',
  'SLAB_CUMULATIVE_AMOUNT', 'SLAB_CUMULATIVE_RATE',
  'SLAB_INCREMENTAL_AMOUNT', 'SLAB_INCREMENTAL_RATE',
  'STEP_FUNCTION',
]);

export const pricingBindingModeEnum = pgEnum('pricing_binding_mode', ['STRICT', 'LATEST_APPROVED']);

export const feePlanStatusEnum = pgEnum('fee_plan_status', [
  'DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'EXPIRED', 'SUSPENDED', 'SUPERSEDED',
]);

export const feePlanFeeTypeEnum = pgEnum('fee_plan_fee_type', [
  'CUSTODY', 'MANAGEMENT', 'PERFORMANCE', 'SUBSCRIPTION', 'REDEMPTION',
  'COMMISSION', 'TAX', 'TRUST', 'ESCROW', 'ADMIN', 'OTHER',
]);

export const sourcePartyEnum = pgEnum('source_party', ['INVESTOR', 'ISSUER']);
export const targetPartyEnum = pgEnum('target_party', ['BANK', 'BROKER', 'PORTFOLIO_MANAGER']);

export const comparisonBasisEnum = pgEnum('comparison_basis', [
  'PRICE', 'TXN_AMOUNT', 'NUM_TXNS', 'AUM', 'NOMINAL',
  'XIRR', 'YTM', 'COUPON_PCT', 'DIVIDEND_PCT',
]);

export const valueBasisEnum = pgEnum('value_basis', [
  'AUM', 'BUM', 'TXN_AMOUNT', 'NOTIONAL', 'AVG_INVESTMENT',
  'FACE_VALUE', 'PRINCIPAL', 'COST',
]);

export const rateTypeEnum = pgEnum('rate_type', ['FLAT', 'ANNUALIZED']);

export const accrualFrequencyEnum = pgEnum('accrual_frequency', [
  'DAILY', 'MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL',
]);

export const accrualMethodEnum = pgEnum('accrual_method', [
  'ABSOLUTE', 'AVERAGE', 'ABSOLUTE_INCR', 'AVERAGE_INCR',
]);

export const tfpAccrualStatusEnum = pgEnum('tfp_accrual_status', [
  'PENDING_AUTH', 'OPEN', 'ACCOUNTED', 'INVOICED', 'REVERSED', 'CANCELLED',
]);

export const tfpInvoiceStatusEnum = pgEnum('tfp_invoice_status', [
  'DRAFT', 'ISSUED', 'PAID', 'PARTIALLY_PAID', 'OVERDUE', 'DISPUTED', 'CANCELLED',
]);

export const paymentMethodEnum = pgEnum('payment_method', [
  'DEBIT_MEMO', 'CHECK', 'PESONET', 'INSTAPAY', 'SWIFT', 'INTERNAL_JV',
]);

export const paymentStatusEnum = pgEnum('payment_status', ['POSTED', 'REVERSED', 'FAILED']);

export const overrideStageEnum = pgEnum('override_stage', [
  'ORDER_CAPTURE', 'ACCRUAL', 'INVOICE', 'PAYMENT',
]);

export const overrideStatusEnum = pgEnum('override_status', [
  'PENDING', 'APPROVED', 'REJECTED', 'AUTO_APPROVED',
]);

export const exceptionTypeEnum = pgEnum('exception_type', [
  'MISSING_FX', 'ACCRUAL_MISMATCH', 'INVOICE_PDF_FAILURE',
  'PAYMENT_AMBIGUITY', 'DISPUTE_OPEN', 'REVERSAL_CANDIDATE', 'OTHER',
]);

export const exceptionSeverityEnum = pgEnum('exception_severity', ['P1', 'P2', 'P3']);

export const exceptionStatusEnum = pgEnum('exception_status', [
  'OPEN', 'IN_PROGRESS', 'RESOLVED', 'ESCALATED', 'WONT_FIX',
]);

export const contentPackCategoryEnum = pgEnum('content_pack_category', [
  'TAX_RULE_PACK', 'REPORT_PACK', 'TEMPLATE_PACK',
]);

export const contentPackStatusEnum = pgEnum('content_pack_status', [
  'STAGED', 'ACTIVE', 'ARCHIVED', 'ROLLED_BACK',
]);

export const dsarTypeEnum = pgEnum('dsar_type', [
  'ACCESS', 'ERASURE', 'RECTIFICATION', 'PORTABILITY', 'RESTRICTION',
]);

export const dsarStatusEnum = pgEnum('dsar_status', [
  'NEW', 'PROCESSING', 'AWAITING_DPO', 'APPROVED', 'REJECTED', 'COMPLETED',
]);

export const disputeStatusEnum = pgEnum('dispute_status', [
  'OPEN', 'INVESTIGATING', 'RESOLVED', 'REJECTED',
]);

export const creditNoteStatusEnum = pgEnum('credit_note_status', ['ISSUED', 'APPLIED', 'CANCELLED']);

export const tfpTaxTypeEnum = pgEnum('tfp_tax_type', ['VAT', 'WHT', 'DST', 'OTHER']);

export const tfpPiiClassEnum = pgEnum('tfp_pii_class', ['NON_PII', 'PII', 'SPI', 'FINANCIAL_PII']);

export const redactionRuleEnum = pgEnum('redaction_rule', [
  'NONE', 'MASK', 'HASH', 'TOKENIZE', 'EXCLUDE',
]);

export const templateCategoryEnum = pgEnum('template_category', [
  'TRUST_DISC', 'TRUST_DIR', 'RETIREMENT', 'ESCROW', 'TXN', 'ADHOC',
]);

export const libraryStatusEnum = pgEnum('library_status', [
  'DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'RETIRED',
]);

export const feeEventTypeEnum = pgEnum('fee_event_type', [
  'BUY', 'SELL', 'MATURITY', 'COUPON', 'DIVIDEND',
  'PRE_TERMINATION', 'REDEMPTION', 'CORPORATE_ACTION',
]);

// ============================================================================
// Helper: Audit fields added to every table
// ============================================================================

const auditFields = {
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  created_by: text('created_by'),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  updated_by: text('updated_by'),
  version: integer('version').default(1).notNull(),
  status: text('status').default('active').notNull(),
  is_deleted: boolean('is_deleted').default(false).notNull(),
  tenant_id: text('tenant_id').default('default').notNull(),
  correlation_id: text('correlation_id'),
  audit_hash: text('audit_hash'),
};

// ============================================================================
// 1. IAM (Identity & Access Management)
// ============================================================================

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  username: text('username').unique(),
  password_hash: text('password_hash'),
  full_name: text('full_name'),
  email: text('email').unique(),
  role: text('role'),
  department: text('department'),
  office: text('office'),
  branch_id: integer('branch_id'),
  client_id: text('client_id'),
  is_active: boolean('is_active').default(true),
  mfa_enabled: boolean('mfa_enabled').default(false),
  last_login: timestamp('last_login', { withTimezone: true }),
  ...auditFields,
});

export const roles = pgTable('roles', {
  id: serial('id').primaryKey(),
  name: text('name').unique(),
  office: text('office'),
  description: text('description'),
  azure_ad_group: text('azure_ad_group'),
  ...auditFields,
});

export const permissions = pgTable('permissions', {
  id: serial('id').primaryKey(),
  role_id: integer('role_id').references(() => roles.id),
  resource: text('resource'),
  action: text('action'),
  conditions: jsonb('conditions'),
  ...auditFields,
});

export const userRoles = pgTable(
  'user_roles',
  {
    user_id: integer('user_id')
      .notNull()
      .references(() => users.id),
    role_id: integer('role_id')
      .notNull()
      .references(() => roles.id),
    ...auditFields,
  },
  (table) => [
    primaryKey({ columns: [table.user_id, table.role_id] }),
  ],
);

export const sessions = pgTable('sessions', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id').notNull().references(() => users.id),
  refresh_token_hash: text('refresh_token_hash').notNull(),
  ip_address: text('ip_address'),
  user_agent: text('user_agent'),
  expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
  revoked_at: timestamp('revoked_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ============================================================================
// 2. Client & KYC
// ============================================================================

export const clients = pgTable('clients', {
  client_id: text('client_id').primaryKey(),
  legal_name: text('legal_name'),
  type: text('type'),
  tin: text('tin'),
  birth_date: date('birth_date'),
  address: jsonb('address'),
  contact: jsonb('contact'),
  risk_profile: riskProfileEnum('risk_profile'),
  client_status: text('client_status'),
  assigned_rm_id: integer('assigned_rm_id').references(() => users.id),
  dpa_erasure_requested_at: timestamp('dpa_erasure_requested_at', { withTimezone: true }),
  automated_decision_consent: boolean('automated_decision_consent').default(false),
  ...auditFields,
});

export const clientProfiles = pgTable('client_profiles', {
  id: serial('id').primaryKey(),
  client_id: text('client_id').references(() => clients.client_id),
  risk_tolerance: text('risk_tolerance'),
  investment_horizon: text('investment_horizon'),
  knowledge_level: text('knowledge_level'),
  source_of_wealth: text('source_of_wealth'),
  income: numeric('income'),
  net_worth: numeric('net_worth'),
  // FR-PTC-021: CSA waiver tracking
  csa_waiver_status: text('csa_waiver_status'), // NONE, ACTIVE, EXPIRED
  csa_waiver_expiry: date('csa_waiver_expiry'),
  csa_waiver_approved_by: integer('csa_waiver_approved_by').references(() => users.id),
  ...auditFields,
});

export const kycCases = pgTable('kyc_cases', {
  id: serial('id').primaryKey(),
  client_id: text('client_id').references(() => clients.client_id),
  risk_rating: text('risk_rating'),
  kyc_status: kycStatusEnum('kyc_status'),
  id_number: text('id_number'),
  id_type: text('id_type'),
  expiry_date: date('expiry_date'),
  refresh_cadence_years: integer('refresh_cadence_years'),
  next_review_date: date('next_review_date'),
  ...auditFields,
});

export const beneficialOwners = pgTable('beneficial_owners', {
  id: serial('id').primaryKey(),
  client_id: text('client_id').references(() => clients.client_id),
  ubo_name: text('ubo_name'),
  ubo_tin: text('ubo_tin'),
  ownership_pct: numeric('ownership_pct'),
  verified: boolean('verified'),
  ...auditFields,
});

export const clientFatcaCrs = pgTable('client_fatca_crs', {
  id: serial('id').primaryKey(),
  client_id: text('client_id').references(() => clients.client_id),
  us_person: boolean('us_person'),
  reporting_jurisdictions: jsonb('reporting_jurisdictions'),
  tin_foreign: text('tin_foreign'),
  ...auditFields,
});

// ============================================================================
// 3. Portfolio & Mandate
// ============================================================================

export const portfolios = pgTable('portfolios', {
  portfolio_id: text('portfolio_id').primaryKey(),
  client_id: text('client_id').references(() => clients.client_id),
  type: trustProductTypeEnum('type'),
  base_currency: text('base_currency'),
  aum: numeric('aum'),
  inception_date: date('inception_date'),
  portfolio_status: text('portfolio_status'),
  legal_entity_id: integer('legal_entity_id'),
  marketing_consent: boolean('marketing_consent').default(false),
  ttra_id: text('ttra_id'),
  source_campaign_id: integer('source_campaign_id'),
  ...auditFields,
});

export const mandates = pgTable('mandates', {
  id: serial('id').primaryKey(),
  portfolio_id: text('portfolio_id').references(() => portfolios.portfolio_id),
  min_allocation: jsonb('min_allocation'),
  max_allocation: jsonb('max_allocation'),
  restricted_securities: jsonb('restricted_securities'),
  benchmark_id: text('benchmark_id'),
  max_single_issuer_pct: numeric('max_single_issuer_pct'),
  max_sector_pct: numeric('max_sector_pct'),
  duration_band: text('duration_band'),
  credit_floor: text('credit_floor'),
  currency_constraints: jsonb('currency_constraints'),
  ...auditFields,
});

// ============================================================================
// 4. Securities & Counterparties
// ============================================================================

export const securities = pgTable('securities', {
  id: serial('id').primaryKey(),
  isin: text('isin'),
  cusip: text('cusip'),
  sedol: text('sedol'),
  bloomberg_ticker: text('bloomberg_ticker'),
  local_code: text('local_code'),
  name: text('name'),
  asset_class: text('asset_class'),
  sector: text('sector'),
  exchange: text('exchange'),
  currency: text('currency'),
  pricing_source_hierarchy: jsonb('pricing_source_hierarchy'),
  is_active: boolean('is_active').default(true),
  is_derivative: boolean('is_derivative').default(false),
  derivative_type: text('derivative_type'),
  underlying_security_id: integer('underlying_security_id'),
  embedded_derivative: boolean('embedded_derivative').default(false),
  // FR-PTC-021: Risk product category for suitability check
  risk_product_category: text('risk_product_category'), // CONSERVATIVE, MODERATE, BALANCED, GROWTH, AGGRESSIVE
  consent_fee_pct: numeric('consent_fee_pct'),
  coupon_rate: numeric('coupon_rate'),
  maturity_date: date('maturity_date'),
  yield_rate: numeric('yield_rate'),
  coupon_frequency: integer('coupon_frequency'),
  ...auditFields,
});

export const counterparties = pgTable('counterparties', {
  id: serial('id').primaryKey(),
  name: text('name'),
  lei: text('lei'),
  bic: text('bic'),
  settlement_instructions: jsonb('settlement_instructions'),
  type: text('type'),
  is_active: boolean('is_active').default(true),
  ...auditFields,
});

export const brokers = pgTable('brokers', {
  id: serial('id').primaryKey(),
  counterparty_id: integer('counterparty_id').references(() => counterparties.id),
  commission_schedule: jsonb('commission_schedule'),
  fix_session_config: jsonb('fix_session_config'),
  ...auditFields,
});

// ============================================================================
// 5. Order Lifecycle
// ============================================================================

export const orders = pgTable('orders', {
  order_id: text('order_id').primaryKey(),
  order_no: text('order_no').unique(),
  portfolio_id: text('portfolio_id').references(() => portfolios.portfolio_id),
  type: orderTypeEnum('type'),
  side: orderSideEnum('side'),
  security_id: integer('security_id').references(() => securities.id),
  quantity: numeric('quantity'),
  limit_price: numeric('limit_price'),
  stop_price: numeric('stop_price'),
  currency: text('currency'),
  value_date: date('value_date'),
  reason_code: text('reason_code'),
  client_reference: text('client_reference'),
  order_status: orderStatusEnum('order_status'),
  authorization_tier: makerCheckerTierEnum('authorization_tier'),
  suitability_check_result: jsonb('suitability_check_result'),
  created_by_role: text('created_by_role'),
  time_in_force: timeInForceTypeEnum('time_in_force').default('DAY'),
  payment_mode: paymentModeTypeEnum('payment_mode'),
  trader_id: integer('trader_id').references(() => users.id),
  future_trade_date: date('future_trade_date'),
  disposal_method: disposalMethodEnum('disposal_method'),
  parent_order_id: text('parent_order_id'),
  scheduled_plan_id: integer('scheduled_plan_id'),
  transaction_ref_no: text('transaction_ref_no').unique(),
  // FR-ORD-009: FX order fields
  fx_currency_pair: text('fx_currency_pair'),
  fx_rate: numeric('fx_rate', { precision: 18, scale: 8 }),
  fx_settlement_amount: numeric('fx_settlement_amount', { precision: 21, scale: 4 }),
  fx_value_date: date('fx_value_date'),
  // FR-ORD-012: Backdating fields
  backdated_at: timestamp('backdated_at', { withTimezone: true }),
  backdate_reason: text('backdate_reason'),
  backdate_approver: integer('backdate_approver'),
  // FR-ORD-013: GTD expiry
  gtd_expiry_date: date('gtd_expiry_date'),
  // FR-DER-002: Derivative tagging
  derivative_setup_id: integer('derivative_setup_id'),
  ...auditFields,
});

export const orderAuthorizations = pgTable('order_authorizations', {
  id: serial('id').primaryKey(),
  order_id: text('order_id').references(() => orders.order_id),
  tier: makerCheckerTierEnum('tier'),
  approver_id: integer('approver_id').references(() => users.id),
  approver_role: text('approver_role'),
  decision: text('decision'),
  comment: text('comment'),
  decided_at: timestamp('decided_at', { withTimezone: true }),
  ...auditFields,
});

// ============================================================================
// 6. Trade & Execution
// ============================================================================

export const blocks = pgTable('blocks', {
  block_id: text('block_id').primaryKey(),
  security_id: integer('security_id').references(() => securities.id),
  side: orderSideEnum('side'),
  total_qty: numeric('total_qty'),
  allocation_policy: text('allocation_policy'),
  block_status: text('block_status'),
  trader_id: integer('trader_id').references(() => users.id),
  ...auditFields,
});

export const trades = pgTable('trades', {
  trade_id: text('trade_id').primaryKey(),
  order_id: text('order_id').references(() => orders.order_id),
  block_id: text('block_id').references(() => blocks.block_id),
  broker_id: integer('broker_id').references(() => brokers.id),
  execution_price: numeric('execution_price'),
  execution_qty: numeric('execution_qty'),
  execution_time: timestamp('execution_time', { withTimezone: true }),
  slippage_bps: numeric('slippage_bps'),
  allocation_pct: numeric('allocation_pct'),
  fill_type: text('fill_type'),
  ...auditFields,
});

// ============================================================================
// 7. Confirmation & Settlement
// ============================================================================

export const confirmations = pgTable('confirmations', {
  id: serial('id').primaryKey(),
  trade_id: text('trade_id').references(() => trades.trade_id),
  match_method: text('match_method'),
  match_status: text('match_status'),
  counterparty_ref: text('counterparty_ref'),
  tolerance_check: jsonb('tolerance_check'),
  exception_reason: text('exception_reason'),
  confirmed_by: integer('confirmed_by').references(() => users.id),
  confirmed_at: timestamp('confirmed_at', { withTimezone: true }),
  ...auditFields,
});

export const settlementInstructions = pgTable('settlement_instructions', {
  id: serial('id').primaryKey(),
  trade_id: text('trade_id').references(() => trades.trade_id),
  ssi_id: text('ssi_id'),
  swift_message_type: text('swift_message_type'),
  routing_bic: text('routing_bic'),
  value_date: date('value_date'),
  settlement_status: settlementStatusEnum('settlement_status'),
  cash_amount: numeric('cash_amount'),
  currency: text('currency'),
  settled_at: timestamp('settled_at', { withTimezone: true }),
  finacle_gl_ref: text('finacle_gl_ref'),
  philpass_ref: text('philpass_ref'),
  is_book_only: boolean('is_book_only').default(false),
  official_receipt_no: text('official_receipt_no'),
  custodian_group: text('custodian_group'),
  settlement_account_level: text('settlement_account_level'),
  ...auditFields,
});

// ============================================================================
// 8. Position & Cash
// ============================================================================

export const positions = pgTable('positions', {
  id: serial('id').primaryKey(),
  portfolio_id: text('portfolio_id').references(() => portfolios.portfolio_id),
  security_id: integer('security_id').references(() => securities.id),
  quantity: numeric('quantity'),
  cost_basis: numeric('cost_basis'),
  market_value: numeric('market_value'),
  unrealized_pnl: numeric('unrealized_pnl'),
  as_of_date: date('as_of_date'),
  // FR-PTC-012: Trade-date holdings receivable tag
  is_receivable: boolean('is_receivable').default(false),
  settlement_date: date('settlement_date'),
  ...auditFields,
});

export const cashLedger = pgTable('cash_ledger', {
  id: serial('id').primaryKey(),
  portfolio_id: text('portfolio_id').references(() => portfolios.portfolio_id),
  account_type: text('account_type'),
  currency: text('currency'),
  balance: numeric('balance'),
  available_balance: numeric('available_balance'),
  as_of_date: date('as_of_date'),
  ...auditFields,
});

export const cashTransactions = pgTable('cash_transactions', {
  id: serial('id').primaryKey(),
  cash_ledger_id: integer('cash_ledger_id').references(() => cashLedger.id),
  type: text('type'),
  amount: numeric('amount'),
  currency: text('currency'),
  counterparty: text('counterparty'),
  reference: text('reference'),
  value_date: date('value_date'),
  ...auditFields,
});

// ============================================================================
// 9. Corporate Actions
// ============================================================================

export const corporateActions = pgTable('corporate_actions', {
  id: serial('id').primaryKey(),
  security_id: integer('security_id').references(() => securities.id),
  type: corporateActionTypeEnum('type'),
  ex_date: date('ex_date'),
  record_date: date('record_date'),
  payment_date: date('payment_date'),
  ratio: numeric('ratio'),
  amount_per_share: numeric('amount_per_share'),
  election_deadline: date('election_deadline'),
  source: text('source'),
  ca_status: text('ca_status'),
  legal_entity_id: integer('legal_entity_id'),
  calendar_key: text('calendar_key'),
  degraded_mode_flag: boolean('degraded_mode_flag').default(false),
  golden_copy_source: text('golden_copy_source'),
  scrub_status: text('scrub_status'),
  esg_flag: boolean('esg_flag').default(false),
  event_version: integer('event_version').default(1),
  amended_from_id: integer('amended_from_id'),
  cancellation_reason: text('cancellation_reason'),
  ...auditFields,
});

export const corporateActionEntitlements = pgTable('corporate_action_entitlements', {
  id: serial('id').primaryKey(),
  corporate_action_id: integer('corporate_action_id').references(() => corporateActions.id),
  portfolio_id: text('portfolio_id').references(() => portfolios.portfolio_id),
  entitled_qty: numeric('entitled_qty'),
  elected_option: text('elected_option'),
  tax_treatment: text('tax_treatment'),
  posted: boolean('posted'),
  ...auditFields,
});

// ============================================================================
// TRUST-CA 360 — Extended Entities
// ============================================================================

export const anomalyFlags = pgTable('anomaly_flags', {
  id: serial('id').primaryKey(),
  event_id: integer('event_id').references(() => corporateActions.id),
  rule_id: text('rule_id'),
  severity: text('severity'),
  explanation: text('explanation'),
  resolved_by: integer('resolved_by').references(() => users.id),
  resolved_at: timestamp('resolved_at', { withTimezone: true }),
  ...auditFields,
});

export const issuers = pgTable('issuers', {
  id: serial('id').primaryKey(),
  name: text('name'),
  lei: text('lei'),
  country: text('country'),
  sector: text('sector'),
  esg_flag: boolean('esg_flag').default(false),
  ...auditFields,
});

export const caOptions = pgTable('ca_options', {
  id: serial('id').primaryKey(),
  event_id: integer('event_id').references(() => corporateActions.id),
  option_type: text('option_type'),
  default_flag: boolean('default_flag').default(false),
  deadline: date('deadline'),
  ...auditFields,
});

export const clientElections = pgTable('client_elections', {
  id: serial('id').primaryKey(),
  account_id: text('account_id'),
  event_id: integer('event_id').references(() => corporateActions.id),
  option_id: integer('option_id').references(() => caOptions.id),
  quantity: numeric('quantity'),
  elected_at: timestamp('elected_at', { withTimezone: true }),
  election_status: text('election_status').default('PENDING'),
  ...auditFields,
});

export const breachNotificationStatusEnum = pgEnum('breach_notification_status', [
  'DETECTED', 'CONTAINED', 'NPC_NOTIFIED', 'RESOLVED', 'CLOSED',
]);

export const breachNotifications = pgTable('breach_notifications', {
  id: serial('id').primaryKey(),
  breach_id: text('breach_id').unique().notNull(),
  breach_type: text('breach_type').notNull(),
  detected_at: timestamp('detected_at', { withTimezone: true }).notNull(),
  npc_notified_at: timestamp('npc_notified_at', { withTimezone: true }),
  npc_deadline: timestamp('npc_deadline', { withTimezone: true }).notNull(),
  affected_count: integer('affected_count').notNull(),
  containment_log: text('containment_log'),
  remediation_plan: text('remediation_plan'),
  breach_status: breachNotificationStatusEnum('breach_status').notNull().default('DETECTED'),
  ...auditFields,
});

// ============================================================================
// 10. Fee & Billing
// ============================================================================

export const feeSchedules = pgTable('fee_schedules', {
  id: serial('id').primaryKey(),
  portfolio_id: text('portfolio_id').references(() => portfolios.portfolio_id),
  fee_type: feeTypeEnum('fee_type'),
  calculation_method: text('calculation_method'),
  rate_pct: numeric('rate_pct'),
  tiered_rates: jsonb('tiered_rates'),
  effective_from: date('effective_from'),
  effective_to: date('effective_to'),
  ...auditFields,
});

export const feeInvoices = pgTable('fee_invoices', {
  id: serial('id').primaryKey(),
  portfolio_id: text('portfolio_id').references(() => portfolios.portfolio_id),
  fee_schedule_id: integer('fee_schedule_id').references(() => feeSchedules.id),
  period_from: date('period_from'),
  period_to: date('period_to'),
  gross_amount: numeric('gross_amount'),
  tax_amount: numeric('tax_amount'),
  net_amount: numeric('net_amount'),
  invoice_status: text('invoice_status'),
  gl_ref: text('gl_ref'),
  ...auditFields,
});

export const feeAccruals = pgTable('fee_accruals', {
  id: serial('id').primaryKey(),
  fee_schedule_id: integer('fee_schedule_id').references(() => feeSchedules.id),
  accrual_date: date('accrual_date'),
  amount: numeric('amount'),
  ...auditFields,
});

// ============================================================================
// 10c. TrustFees Pro — Unified Fees & Charges Platform
// ============================================================================

export const jurisdictions = pgTable('jurisdictions', {
  id: serial('id').primaryKey(),
  code: text('code').unique().notNull(),
  name: text('name').notNull(),
  locale: text('locale').notNull(),
  tax_pack_id: integer('tax_pack_id'),
  report_pack_id: integer('report_pack_id'),
  residency_zone: text('residency_zone'),
  is_active: boolean('is_active').default(true).notNull(),
  ...auditFields,
});

export const pricingDefinitions = pgTable('pricing_definitions', {
  id: serial('id').primaryKey(),
  pricing_code: text('pricing_code').unique().notNull(),
  pricing_name: text('pricing_name').notNull(),
  pricing_type: pricingTypeEnum('pricing_type').notNull(),
  currency: text('currency').default('PHP').notNull(),
  pricing_tiers: jsonb('pricing_tiers').default([]).notNull(),
  step_windows: jsonb('step_windows'),
  pricing_version: integer('pricing_version').default(1).notNull(),
  library_status: libraryStatusEnum('library_status').default('DRAFT').notNull(),
  ...auditFields,
});

export const eligibilityExpressions = pgTable('eligibility_expressions', {
  id: serial('id').primaryKey(),
  eligibility_code: text('eligibility_code').unique().notNull(),
  eligibility_name: text('eligibility_name').notNull(),
  expression: jsonb('expression').notNull(),
  library_status: libraryStatusEnum('library_status').default('DRAFT').notNull(),
  ...auditFields,
});

export const accrualSchedules = pgTable('accrual_schedules', {
  id: serial('id').primaryKey(),
  schedule_code: text('schedule_code').unique().notNull(),
  schedule_name: text('schedule_name').notNull(),
  accrual_enabled: boolean('accrual_enabled').default(true).notNull(),
  accrual_frequency: accrualFrequencyEnum('accrual_frequency'),
  accrual_method: accrualMethodEnum('accrual_method').default('ABSOLUTE'),
  basis_frequency: accrualFrequencyEnum('basis_frequency'),
  accounting_enabled: boolean('accounting_enabled').default(false).notNull(),
  accounting_frequency: accrualFrequencyEnum('accounting_frequency'),
  invoice_frequency: accrualFrequencyEnum('invoice_frequency').default('MONTHLY'),
  due_date_offset_days: integer('due_date_offset_days').default(20).notNull(),
  reversal_enabled: boolean('reversal_enabled').default(false).notNull(),
  reversal_age_days: integer('reversal_age_days'),
  recovery_mode: text('recovery_mode').default('USER'),
  recovery_frequency: accrualFrequencyEnum('recovery_frequency'),
  upfront_amortization: boolean('upfront_amortization').default(false).notNull(),
  library_status: libraryStatusEnum('library_status').default('DRAFT').notNull(),
  ...auditFields,
});

export const feePlanTemplates = pgTable('fee_plan_templates', {
  id: serial('id').primaryKey(),
  template_code: text('template_code').unique().notNull(),
  template_name: text('template_name').notNull(),
  category: templateCategoryEnum('category').notNull(),
  default_payload: jsonb('default_payload').notNull(),
  jurisdiction_id: integer('jurisdiction_id').references(() => jurisdictions.id),
  is_active: boolean('is_active').default(true).notNull(),
  ...auditFields,
});

export const feePlans = pgTable('fee_plans', {
  id: serial('id').primaryKey(),
  fee_plan_code: text('fee_plan_code').unique().notNull(),
  fee_plan_name: text('fee_plan_name').notNull(),
  description: text('description'),
  charge_basis: chargeBasisEnum('charge_basis').notNull(),
  fee_type: feePlanFeeTypeEnum('fee_type').notNull(),
  pricing_definition_id: integer('pricing_definition_id').references(() => pricingDefinitions.id),
  pricing_binding_mode: pricingBindingModeEnum('pricing_binding_mode').default('STRICT').notNull(),
  pricing_binding_version: integer('pricing_binding_version'),
  eligibility_expression_id: integer('eligibility_expression_id').references(() => eligibilityExpressions.id),
  accrual_schedule_id: integer('accrual_schedule_id').references(() => accrualSchedules.id),
  jurisdiction_id: integer('jurisdiction_id').references(() => jurisdictions.id),
  source_party: sourcePartyEnum('source_party').notNull(),
  target_party: targetPartyEnum('target_party').notNull(),
  comparison_basis: comparisonBasisEnum('comparison_basis').notNull(),
  value_basis: valueBasisEnum('value_basis').notNull(),
  event_type: feeEventTypeEnum('event_type'),
  min_charge_amount: numeric('min_charge_amount', { precision: 21, scale: 4 }).default('0'),
  max_charge_amount: numeric('max_charge_amount', { precision: 21, scale: 4 }),
  lower_threshold_pct: numeric('lower_threshold_pct', { precision: 9, scale: 6 }).default('0.050000'),
  upper_threshold_pct: numeric('upper_threshold_pct', { precision: 9, scale: 6 }).default('0.400000'),
  rate_type: rateTypeEnum('rate_type').default('FLAT').notNull(),
  modification_allowed: boolean('modification_allowed').default(true).notNull(),
  aum_basis_include_uitf: boolean('aum_basis_include_uitf').default(false).notNull(),
  aum_basis_include_3p_funds: boolean('aum_basis_include_3p_funds').default(false).notNull(),
  market_value_includes_accruals_override: boolean('market_value_includes_accruals_override'),
  effective_date: date('effective_date').notNull(),
  expiry_date: date('expiry_date'),
  plan_status: feePlanStatusEnum('plan_status').default('DRAFT').notNull(),
  template_id: integer('template_id').references(() => feePlanTemplates.id),
  ...auditFields,
});

export const tfpAccruals = pgTable('tfp_accruals', {
  id: serial('id').primaryKey(),
  fee_plan_id: integer('fee_plan_id').references(() => feePlans.id).notNull(),
  customer_id: text('customer_id').notNull(),
  portfolio_id: text('portfolio_id'),
  security_id: text('security_id'),
  transaction_id: text('transaction_id'),
  base_amount: numeric('base_amount', { precision: 21, scale: 4 }).notNull(),
  computed_fee: numeric('computed_fee', { precision: 21, scale: 4 }).notNull(),
  applied_fee: numeric('applied_fee', { precision: 21, scale: 4 }).notNull(),
  currency: text('currency').default('PHP').notNull(),
  fx_rate_locked: numeric('fx_rate_locked', { precision: 18, scale: 8 }),
  accrual_date: date('accrual_date').notNull(),
  accrual_status: tfpAccrualStatusEnum('accrual_status').default('OPEN').notNull(),
  override_id: integer('override_id'),
  exception_id: integer('exception_id'),
  idempotency_key: text('idempotency_key').notNull(),
  ...auditFields,
});

export const tfpInvoices = pgTable('tfp_invoices', {
  id: serial('id').primaryKey(),
  invoice_number: text('invoice_number').unique().notNull(),
  customer_id: text('customer_id').notNull(),
  jurisdiction_id: integer('jurisdiction_id').references(() => jurisdictions.id),
  currency: text('currency').default('PHP').notNull(),
  fx_rate: numeric('fx_rate', { precision: 18, scale: 8 }),
  total_amount: numeric('total_amount', { precision: 21, scale: 4 }).notNull(),
  tax_amount: numeric('tax_amount', { precision: 21, scale: 4 }).default('0').notNull(),
  grand_total: numeric('grand_total', { precision: 21, scale: 4 }).notNull(),
  invoice_date: date('invoice_date').notNull(),
  due_date: date('due_date').notNull(),
  invoice_status: tfpInvoiceStatusEnum('invoice_status').default('DRAFT').notNull(),
  pdf_url: text('pdf_url'),
  tax_pack_version: text('tax_pack_version'),
  ...auditFields,
});

export const tfpInvoiceLines = pgTable('tfp_invoice_lines', {
  id: serial('id').primaryKey(),
  invoice_id: integer('invoice_id').references(() => tfpInvoices.id).notNull(),
  accrual_id: integer('accrual_id').references(() => tfpAccruals.id).notNull(),
  description: text('description').notNull(),
  quantity: numeric('quantity', { precision: 21, scale: 4 }).default('1').notNull(),
  unit_amount: numeric('unit_amount', { precision: 21, scale: 4 }).notNull(),
  line_amount: numeric('line_amount', { precision: 21, scale: 4 }).notNull(),
  tax_code: text('tax_code'),
  tax_amount: numeric('tax_amount', { precision: 21, scale: 4 }).default('0').notNull(),
  ...auditFields,
});

export const tfpPayments = pgTable('tfp_payments', {
  id: serial('id').primaryKey(),
  invoice_id: integer('invoice_id').references(() => tfpInvoices.id),
  amount: numeric('amount', { precision: 21, scale: 4 }).notNull(),
  currency: text('currency').default('PHP').notNull(),
  payment_date: date('payment_date').notNull(),
  method: paymentMethodEnum('method').notNull(),
  reference_no: text('reference_no').notNull(),
  payment_status: paymentStatusEnum('payment_status').default('POSTED').notNull(),
  ...auditFields,
});

export const feeOverrides = pgTable('fee_overrides', {
  id: serial('id').primaryKey(),
  stage: overrideStageEnum('stage').notNull(),
  accrual_id: integer('accrual_id').references(() => tfpAccruals.id),
  invoice_id: integer('invoice_id').references(() => tfpInvoices.id),
  original_amount: numeric('original_amount', { precision: 21, scale: 4 }).notNull(),
  overridden_amount: numeric('overridden_amount', { precision: 21, scale: 4 }).notNull(),
  delta_pct: numeric('delta_pct', { precision: 9, scale: 6 }).notNull(),
  reason_code: text('reason_code').notNull(),
  reason_notes: text('reason_notes').notNull(),
  requested_by: text('requested_by').notNull(),
  approved_by: text('approved_by'),
  override_status: overrideStatusEnum('override_status').default('PENDING').notNull(),
  ...auditFields,
});

export const exceptionItems = pgTable('exception_items', {
  id: serial('id').primaryKey(),
  exception_type: exceptionTypeEnum('exception_type').notNull(),
  severity: exceptionSeverityEnum('severity').default('P3').notNull(),
  customer_id: text('customer_id'),
  source_aggregate_type: text('source_aggregate_type').notNull(),
  source_aggregate_id: text('source_aggregate_id').notNull(),
  title: text('title').notNull(),
  details: jsonb('details').notNull(),
  assigned_to_team: text('assigned_to_team').notNull(),
  assigned_to_user: text('assigned_to_user'),
  exception_status: exceptionStatusEnum('exception_status').default('OPEN').notNull(),
  sla_due_at: timestamp('sla_due_at', { withTimezone: true }).notNull(),
  escalated_at: timestamp('escalated_at', { withTimezone: true }),
  resolution_notes: text('resolution_notes'),
  resolved_at: timestamp('resolved_at', { withTimezone: true }),
  ...auditFields,
});

export const contentPacks = pgTable('content_packs', {
  id: serial('id').primaryKey(),
  pack_name: text('pack_name').notNull(),
  jurisdiction_id: integer('jurisdiction_id').references(() => jurisdictions.id),
  category: text('category').notNull(),
  payload: jsonb('payload').notNull(),
  signature_hash: text('signature_hash'),
  pack_status: contentPackStatusEnum('pack_status').default('STAGED').notNull(),
  activated_at: timestamp('activated_at', { withTimezone: true }),
  activated_by: integer('activated_by').references(() => users.id),
  superseded_by: integer('superseded_by'),
  ...auditFields,
});

export const taxRules = pgTable('tax_rules', {
  id: serial('id').primaryKey(),
  tax_code: text('tax_code').notNull(),
  name: text('name').notNull(),
  tax_rule_type: tfpTaxTypeEnum('tax_rule_type').notNull(),
  rate: numeric('rate', { precision: 9, scale: 6 }).notNull(),
  jurisdiction_id: integer('jurisdiction_id').references(() => jurisdictions.id),
  applicable_fee_types: jsonb('applicable_fee_types').default([]).notNull(),
  effective_date: date('effective_date').notNull(),
  expiry_date: date('expiry_date'),
  source_pack_id: integer('source_pack_id').references(() => contentPacks.id),
  ...auditFields,
});

export const disputes = pgTable('disputes', {
  id: serial('id').primaryKey(),
  invoice_id: integer('invoice_id').references(() => tfpInvoices.id).notNull(),
  raised_by: text('raised_by').notNull(),
  reason: text('reason').notNull(),
  dispute_status: disputeStatusEnum('dispute_status').default('OPEN').notNull(),
  resolution_notes: text('resolution_notes'),
  resolved_at: timestamp('resolved_at', { withTimezone: true }),
  credit_note_id: integer('credit_note_id'),
  ...auditFields,
});

export const creditNotes = pgTable('credit_notes', {
  id: serial('id').primaryKey(),
  credit_note_number: text('credit_note_number').unique().notNull(),
  related_invoice_id: integer('related_invoice_id').references(() => tfpInvoices.id).notNull(),
  amount: numeric('amount', { precision: 21, scale: 4 }).notNull(),
  currency: text('currency').notNull(),
  reason_code: text('reason_code').notNull(),
  cn_status: creditNoteStatusEnum('cn_status').default('ISSUED').notNull(),
  issued_at: timestamp('issued_at', { withTimezone: true }).defaultNow().notNull(),
  ...auditFields,
});

export const dataSubjectRequests = pgTable('data_subject_requests', {
  id: serial('id').primaryKey(),
  subject_customer_id: text('subject_customer_id').notNull(),
  dsar_type: dsarTypeEnum('dsar_type').notNull(),
  submitted_via: text('submitted_via').notNull(),
  dsar_status: dsarStatusEnum('dsar_status').default('NEW').notNull(),
  response_deadline: date('response_deadline').notNull(),
  approver_id: text('approver_id'),
  artifact_bundle_url: text('artifact_bundle_url'),
  notes: text('notes'),
  ...auditFields,
});

export const piiClassifications = pgTable('pii_classifications', {
  id: serial('id').primaryKey(),
  aggregate_type: text('aggregate_type').notNull(),
  field_path: text('field_path').notNull(),
  classification: tfpPiiClassEnum('classification').notNull(),
  redaction_rule: redactionRuleEnum('redaction_rule').default('NONE').notNull(),
  ...auditFields,
});

export const auditEvents = pgTable('audit_events', {
  id: serial('id').primaryKey(),
  aggregate_type: text('aggregate_type').notNull(),
  aggregate_id: text('aggregate_id').notNull(),
  event_type: text('event_type').notNull(),
  payload: jsonb('payload'),
  actor_id: text('actor_id'),
  window_id: integer('window_id'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const auditWindowSignatures = pgTable('audit_window_signatures', {
  id: serial('id').primaryKey(),
  window_start: timestamp('window_start', { withTimezone: true }).notNull(),
  window_end: timestamp('window_end', { withTimezone: true }).notNull(),
  event_count: integer('event_count').notNull(),
  hash: text('hash').notNull(),
  previous_hash: text('previous_hash'),
  signature: text('signature').notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const customerReferences = pgTable('customer_references', {
  id: serial('id').primaryKey(),
  customer_id: text('customer_id').unique().notNull(),
  display_name: text('display_name').notNull(),
  customer_type: text('customer_type').notNull(),
  domicile: text('domicile').default('PH').notNull(),
  billing_currency: text('billing_currency').default('PHP').notNull(),
  tin: text('tin'),
  tax_exempt: boolean('tax_exempt').default(false).notNull(),
  jurisdiction_id: integer('jurisdiction_id').references(() => jurisdictions.id),
  ...auditFields,
});

// ============================================================================
// 10b. Pricing Records
// ============================================================================

export const pricingRecords = pgTable('pricing_records', {
  id: serial('id').primaryKey(),
  security_id: integer('security_id').references(() => securities.id),
  price_date: date('price_date'),
  close_price: numeric('close_price'),
  source: text('source'),
  ...auditFields,
});

// ============================================================================
// 11. NAV & Fund Accounting
// ============================================================================

export const navComputations = pgTable('nav_computations', {
  id: serial('id').primaryKey(),
  portfolio_id: text('portfolio_id').references(() => portfolios.portfolio_id),
  computation_date: date('computation_date'),
  nav_per_unit: numeric('nav_per_unit'),
  total_nav: numeric('total_nav'),
  units_outstanding: numeric('units_outstanding'),
  pricing_source: text('pricing_source'),
  fair_value_level: text('fair_value_level'),
  nav_status: text('nav_status'),
  published_at: timestamp('published_at', { withTimezone: true }),
  // FR-NAV-005: Dual-source deviation check
  secondary_pricing_source: text('secondary_pricing_source'),
  secondary_nav_per_unit: numeric('secondary_nav_per_unit'),
  deviation_pct: numeric('deviation_pct', { precision: 9, scale: 6 }),
  deviation_flagged: boolean('deviation_flagged').default(false),
  ...auditFields,
});

export const unitTransactions = pgTable('unit_transactions', {
  id: serial('id').primaryKey(),
  portfolio_id: text('portfolio_id').references(() => portfolios.portfolio_id),
  type: text('type'),
  units: numeric('units'),
  nav_per_unit: numeric('nav_per_unit'),
  amount: numeric('amount'),
  investor_id: text('investor_id'),
  transaction_date: date('transaction_date'),
  cut_off_applied: boolean('cut_off_applied'),
  ...auditFields,
});

// ============================================================================
// 12. Tax
// ============================================================================

export const taxEvents = pgTable('tax_events', {
  id: serial('id').primaryKey(),
  trade_id: text('trade_id').references(() => trades.trade_id),
  portfolio_id: text('portfolio_id').references(() => portfolios.portfolio_id),
  tax_type: taxTypeEnum('tax_type'),
  gross_amount: numeric('gross_amount'),
  tax_rate: numeric('tax_rate'),
  tax_amount: numeric('tax_amount'),
  certificate_ref: text('certificate_ref'),
  tin: text('tin'),
  bir_form_type: text('bir_form_type'),
  filing_status: text('filing_status'),
  ttra_id: text('ttra_id'),
  model_version: text('model_version'),
  entitlement_id: integer('entitlement_id'),
  corrected_event_id: integer('corrected_event_id'),
  source: text('source').default('TRADE'),
  ...auditFields,
});

// ============================================================================
// 13. Reversal & Upload
// ============================================================================

export const reversalCases = pgTable('reversal_cases', {
  id: serial('id').primaryKey(),
  original_transaction_id: text('original_transaction_id'),
  type: text('type'),
  reason: text('reason'),
  evidence_url: text('evidence_url'),
  requested_by: integer('requested_by').references(() => users.id),
  approved_by: integer('approved_by').references(() => users.id),
  reversal_status: text('reversal_status'),
  reversing_entries: jsonb('reversing_entries'),
  ...auditFields,
});

export const uploadBatches = pgTable('upload_batches', {
  id: serial('id').primaryKey(),
  filename: text('filename'),
  row_count: integer('row_count'),
  accepted_rows: integer('accepted_rows'),
  rejected_rows: integer('rejected_rows'),
  error_report_url: text('error_report_url'),
  upload_status: text('upload_status'),
  uploaded_by: integer('uploaded_by').references(() => users.id),
  authorized_by: integer('authorized_by').references(() => users.id),
  rollback_status: text('rollback_status'),
  ...auditFields,
});

// ============================================================================
// 14. Transfer / Contribution / Withdrawal
// ============================================================================

export const transfers = pgTable('transfers', {
  id: serial('id').primaryKey(),
  from_portfolio_id: text('from_portfolio_id').references(() => portfolios.portfolio_id),
  to_portfolio_id: text('to_portfolio_id').references(() => portfolios.portfolio_id),
  security_id: integer('security_id').references(() => securities.id),
  quantity: numeric('quantity'),
  type: text('type'),
  transfer_status: text('transfer_status'),
  ...auditFields,
});

export const contributions = pgTable('contributions', {
  id: serial('id').primaryKey(),
  portfolio_id: text('portfolio_id').references(() => portfolios.portfolio_id),
  amount: numeric('amount'),
  currency: text('currency'),
  source_account: text('source_account'),
  type: text('type'),
  contribution_status: text('contribution_status'),
  ...auditFields,
});

export const withdrawals = pgTable('withdrawals', {
  id: serial('id').primaryKey(),
  portfolio_id: text('portfolio_id').references(() => portfolios.portfolio_id),
  amount: numeric('amount'),
  currency: text('currency'),
  destination_account: text('destination_account'),
  type: text('type'),
  tax_withholding: numeric('tax_withholding'),
  withdrawal_status: text('withdrawal_status'),
  ...auditFields,
});

// ============================================================================
// 15. Compliance & Risk
// ============================================================================

export const complianceRules = pgTable('compliance_rules', {
  id: serial('id').primaryKey(),
  rule_type: text('rule_type'),
  entity_type: text('entity_type'),
  condition: jsonb('condition'),
  action: text('action'),
  severity: text('severity'),
  is_active: boolean('is_active').default(true),
  ...auditFields,
});

export const complianceBreaches = pgTable('compliance_breaches', {
  id: serial('id').primaryKey(),
  rule_id: integer('rule_id').references(() => complianceRules.id),
  portfolio_id: text('portfolio_id'),
  order_id: text('order_id'),
  breach_description: text('breach_description'),
  detected_at: timestamp('detected_at', { withTimezone: true }),
  resolved_at: timestamp('resolved_at', { withTimezone: true }),
  resolution: text('resolution'),
  ...auditFields,
});

export const tradeSurveillanceAlerts = pgTable('trade_surveillance_alerts', {
  id: serial('id').primaryKey(),
  pattern: surveillancePatternEnum('pattern'),
  score: numeric('score'),
  order_ids: jsonb('order_ids'),
  disposition: text('disposition'),
  analyst_id: integer('analyst_id').references(() => users.id),
  disposition_date: timestamp('disposition_date', { withTimezone: true }),
  ...auditFields,
});

export const oreEvents = pgTable('ore_events', {
  id: serial('id').primaryKey(),
  basel_category: text('basel_category'),
  description: text('description'),
  gross_loss: numeric('gross_loss'),
  net_loss: numeric('net_loss'),
  recovery: numeric('recovery'),
  root_cause: text('root_cause'),
  corrective_action: text('corrective_action'),
  reported_to_bsp: boolean('reported_to_bsp'),
  ...auditFields,
});

export const killSwitchEvents = pgTable('kill_switch_events', {
  id: serial('id').primaryKey(),
  scope: jsonb('scope'),
  reason: text('reason'),
  invoked_by: jsonb('invoked_by'),
  active_since: timestamp('active_since', { withTimezone: true }),
  resumed_at: timestamp('resumed_at', { withTimezone: true }),
  resume_approved_by: jsonb('resume_approved_by'),
  ...auditFields,
});

// ============================================================================
// 16. Whistleblower
// ============================================================================

export const whistleblowerCases = pgTable('whistleblower_cases', {
  id: serial('id').primaryKey(),
  intake_channel: text('intake_channel'),
  anonymous: boolean('anonymous'),
  description: text('description'),
  cco_reviewer_id: integer('cco_reviewer_id').references(() => users.id),
  dpo_notified: boolean('dpo_notified'),
  case_status: text('case_status'),
  resolution: text('resolution'),
  ...auditFields,
});

// ============================================================================
// 17. Notification & Consent
// ============================================================================

export const notificationLog = pgTable('notification_log', {
  id: serial('id').primaryKey(),
  event_type: text('event_type'),
  channel: notificationChannelEnum('channel'),
  recipient_id: text('recipient_id'),
  recipient_type: text('recipient_type'),
  content_hash: text('content_hash'),
  sent_at: timestamp('sent_at', { withTimezone: true }),
  delivered_at: timestamp('delivered_at', { withTimezone: true }),
  notification_status: text('notification_status'),
  ...auditFields,
});

export const consentLog = pgTable('consent_log', {
  id: serial('id').primaryKey(),
  client_id: text('client_id').references(() => clients.client_id),
  processing_activity: text('processing_activity'),
  lawful_basis: text('lawful_basis'),
  purpose: text('purpose'),
  retention_period: text('retention_period'),
  consented_at: timestamp('consented_at', { withTimezone: true }),
  withdrawn_at: timestamp('withdrawn_at', { withTimezone: true }),
  ...auditFields,
});

// ============================================================================
// 18. Audit (hash-chained)
// ============================================================================

export const auditRecords = pgTable(
  'audit_records',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    entity_type: text('entity_type'),
    entity_id: text('entity_id'),
    action: auditActionEnum('action'),
    actor_id: text('actor_id'),
    actor_role: text('actor_role'),
    changes: jsonb('changes'),
    previous_hash: text('previous_hash'),
    record_hash: text('record_hash'),
    metadata: jsonb('metadata'),
    ip_address: text('ip_address'),
    correlation_id: text('correlation_id'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_audit_entity').on(table.entity_type, table.entity_id),
    index('idx_audit_actor').on(table.actor_id),
    index('idx_audit_created_at').on(table.created_at),
  ],
);

// ============================================================================
// 19. EDEF (Entity Definition Framework)
// ============================================================================

export const entityRegistry = pgTable('entity_registry', {
  entity_key: text('entity_key').primaryKey(),
  display_name: text('display_name'),
  display_name_plural: text('display_name_plural'),
  schema_table_name: text('schema_table_name'),
  category: text('category'),
  searchable_columns: jsonb('searchable_columns'),
  default_sort_column: text('default_sort_column'),
  max_page_size: integer('max_page_size'),
  is_active: boolean('is_active').default(true),
  ...auditFields,
});

export const entityFieldConfig = pgTable('entity_field_config', {
  id: serial('id').primaryKey(),
  entity_key: text('entity_key').references(() => entityRegistry.entity_key),
  field_name: text('field_name'),
  label: text('label'),
  input_type: text('input_type'),
  group_name: text('group_name'),
  group_order: integer('group_order'),
  display_order: integer('display_order'),
  visible_in_table: boolean('visible_in_table'),
  visible_in_form: boolean('visible_in_form'),
  required: boolean('required'),
  editable: boolean('editable'),
  pii_sensitive: boolean('pii_sensitive'),
  validation_regex: text('validation_regex'),
  unique_check: boolean('unique_check'),
  select_options_source: text('select_options_source'),
  help_text: text('help_text'),
  ...auditFields,
});

export const entityCrossValidations = pgTable('entity_cross_validations', {
  id: serial('id').primaryKey(),
  entity_key: text('entity_key').references(() => entityRegistry.entity_key),
  rule_name: text('rule_name'),
  condition: jsonb('condition'),
  error_message: text('error_message'),
  is_active: boolean('is_active').default(true),
  ...auditFields,
});

export const approvalWorkflowDefinitions = pgTable('approval_workflow_definitions', {
  id: serial('id').primaryKey(),
  entity_type: text('entity_type'),
  action: text('action'),
  required_approvers: integer('required_approvers'),
  sla_hours: integer('sla_hours'),
  auto_approve_roles: jsonb('auto_approve_roles'),
  is_active: boolean('is_active').default(true),
  ...auditFields,
});

export const approvalRequests = pgTable('approval_requests', {
  id: serial('id').primaryKey(),
  entity_type: text('entity_type'),
  entity_id: text('entity_id'),
  action: text('action'),
  approval_status: approvalStatusEnum('approval_status'),
  payload: jsonb('payload'),
  previous_values: jsonb('previous_values'),
  submitted_by: integer('submitted_by').references(() => users.id),
  submitted_at: timestamp('submitted_at', { withTimezone: true }),
  reviewed_by: integer('reviewed_by').references(() => users.id),
  reviewed_at: timestamp('reviewed_at', { withTimezone: true }),
  review_comment: text('review_comment'),
  sla_deadline: timestamp('sla_deadline', { withTimezone: true }),
  is_sla_breached: boolean('is_sla_breached'),
  ...auditFields,
});

// ============================================================================
// 20. Reference Data
// ============================================================================

export const countries = pgTable('countries', {
  id: serial('id').primaryKey(),
  code: text('code').unique(),
  name: text('name'),
  iso_alpha3: text('iso_alpha3'),
  ...auditFields,
});

export const currencies = pgTable('currencies', {
  id: serial('id').primaryKey(),
  code: text('code').unique(),
  name: text('name'),
  symbol: text('symbol'),
  decimal_places: integer('decimal_places'),
  ...auditFields,
});

export const assetClasses = pgTable('asset_classes', {
  id: serial('id').primaryKey(),
  code: text('code').unique(),
  name: text('name'),
  description: text('description'),
  ...auditFields,
});

export const branches = pgTable('branches', {
  id: serial('id').primaryKey(),
  code: text('code').unique(),
  name: text('name'),
  address: text('address'),
  region: text('region'),
  ...auditFields,
});

export const exchanges = pgTable('exchanges', {
  id: serial('id').primaryKey(),
  code: text('code').unique(),
  name: text('name'),
  country_code: text('country_code'),
  timezone: text('timezone'),
  ...auditFields,
});

export const trustProductTypes = pgTable('trust_product_types', {
  id: serial('id').primaryKey(),
  code: text('code').unique(),
  name: text('name'),
  description: text('description'),
  ...auditFields,
});

export const feeTypes = pgTable('fee_types', {
  id: serial('id').primaryKey(),
  code: text('code').unique(),
  name: text('name'),
  description: text('description'),
  calculation_method: text('calculation_method'),
  ...auditFields,
});

export const taxCodes = pgTable('tax_codes', {
  id: serial('id').primaryKey(),
  code: text('code').unique(),
  name: text('name'),
  rate: numeric('rate'),
  type: text('type'),
  applicability: text('applicability'),
  ...auditFields,
});

// ============================================================================
// 18. Portfolio Modeling & Rebalancing (BDO RFI Gap #5)
// ============================================================================

export const modelPortfolios = pgTable('model_portfolios', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  allocations: jsonb('allocations'), // [{asset_class, target_pct, min_pct, max_pct}]
  benchmark_id: integer('benchmark_id'),
  is_active: boolean('is_active').default(true),
  ...auditFields,
});

export const rebalancingRuns = pgTable('rebalancing_runs', {
  id: serial('id').primaryKey(),
  portfolio_ids: jsonb('portfolio_ids'), // array of portfolio_id strings
  model_portfolio_id: integer('model_portfolio_id').references(() => modelPortfolios.id),
  run_type: text('run_type'), // SIMULATION, LIVE
  rebalancing_status: rebalancingStatusEnum('rebalancing_status').default('DRAFT'),
  input_params: jsonb('input_params'),
  generated_blotter: jsonb('generated_blotter'),
  executed_at: timestamp('executed_at', { withTimezone: true }),
  executed_by: integer('executed_by').references(() => users.id),
  ...auditFields,
});

// ============================================================================
// 19. Scheduled Plans — EIP / ERP (BDO RFI Gap #9)
// ============================================================================

export const scheduledPlans = pgTable('scheduled_plans', {
  id: serial('id').primaryKey(),
  client_id: text('client_id').references(() => clients.client_id),
  portfolio_id: text('portfolio_id').references(() => portfolios.portfolio_id),
  plan_type: scheduledPlanTypeEnum('plan_type').notNull(),
  product_id: integer('product_id'),
  amount: numeric('amount'),
  currency: text('currency').default('PHP'),
  frequency: text('frequency'), // DAILY, WEEKLY, BI_WEEKLY, MONTHLY, QUARTERLY
  ca_sa_account: text('ca_sa_account'),
  next_execution_date: date('next_execution_date'),
  scheduled_plan_status: scheduledPlanStatusEnum('scheduled_plan_status').default('ACTIVE'),
  ...auditFields,
});

// ============================================================================
// 20. PERA Accounts & Transactions (BDO RFI Gap #9 — BSP regulated)
// ============================================================================

export const peraAccounts = pgTable('pera_accounts', {
  id: serial('id').primaryKey(),
  contributor_id: text('contributor_id').references(() => clients.client_id),
  administrator: text('administrator'),
  product_id: integer('product_id'),
  balance: numeric('balance').default('0'),
  contribution_ytd: numeric('contribution_ytd').default('0'),
  max_contribution_annual: numeric('max_contribution_annual'),
  tin: text('tin'),
  bsp_pera_id: text('bsp_pera_id'),
  pera_status: text('pera_status').default('ACTIVE'),
  ...auditFields,
});

export const peraTransactions = pgTable('pera_transactions', {
  id: serial('id').primaryKey(),
  pera_account_id: integer('pera_account_id').references(() => peraAccounts.id),
  type: peraTransactionTypeEnum('type').notNull(),
  amount: numeric('amount'),
  penalty_amount: numeric('penalty_amount'),
  tcc_ref: text('tcc_ref'),
  target_product_id: integer('target_product_id'),
  target_admin: text('target_admin'),
  pera_txn_status: text('pera_txn_status').default('PENDING'),
  ...auditFields,
});

// ============================================================================
// 21. Compliance Limits (BDO RFI Gap #4 — Pre/Post-Trade)
// ============================================================================

export const complianceLimits = pgTable('compliance_limits', {
  id: serial('id').primaryKey(),
  limit_type: text('limit_type').notNull(), // trader, counterparty, broker, issuer, sector, sbl, group, outlet
  dimension: text('dimension').notNull(),
  dimension_id: text('dimension_id'),
  limit_amount: numeric('limit_amount'),
  current_exposure: numeric('current_exposure').default('0'),
  warning_threshold_pct: integer('warning_threshold_pct').default(80),
  is_active: boolean('is_active').default(true),
  effective_from: date('effective_from'),
  effective_to: date('effective_to'),
  ...auditFields,
});

// ============================================================================
// 22. Validation Overrides (BDO RFI Gap #4 — Hard/Soft)
// ============================================================================

export const validationOverrides = pgTable('validation_overrides', {
  id: serial('id').primaryKey(),
  order_id: text('order_id').references(() => orders.order_id),
  validation_rule: text('validation_rule').notNull(),
  severity: validationSeverityEnum('severity').notNull(),
  breach_description: text('breach_description'),
  override_justification: text('override_justification'),
  overridden_by: integer('overridden_by').references(() => users.id),
  approved_by: integer('approved_by').references(() => users.id),
  overridden_at: timestamp('overridden_at', { withTimezone: true }),
  ...auditFields,
});

// ============================================================================
// 23. Held-Away Assets (BDO RFI Gap #6)
// ============================================================================

export const heldAwayAssets = pgTable('held_away_assets', {
  id: serial('id').primaryKey(),
  portfolio_id: text('portfolio_id').references(() => portfolios.portfolio_id),
  asset_class: text('asset_class'),
  description: text('description'),
  custodian: text('custodian'),
  location: text('location'),
  market_value: numeric('market_value'),
  currency: text('currency').default('PHP'),
  as_of_date: date('as_of_date'),
  ...auditFields,
});

// ============================================================================
// 24. Standing Instructions (BDO RFI Gap #9 — IMA/TA)
// ============================================================================

export const standingInstructions = pgTable('standing_instructions', {
  id: serial('id').primaryKey(),
  account_id: text('account_id'),
  portfolio_id: text('portfolio_id').references(() => portfolios.portfolio_id),
  instruction_type: standingInstructionTypeEnum('instruction_type').notNull(),
  params: jsonb('params'), // { target_account, amount, frequency, etc. }
  is_active: boolean('is_active').default(true),
  next_execution_date: date('next_execution_date'),
  ...auditFields,
});

// ============================================================================
// 25. EOD Processing (Phase 3B)
// ============================================================================

export const eodJobStatusEnum = pgEnum('eod_job_status', [
  'PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED',
]);

export const eodRuns = pgTable('eod_runs', {
  id: serial('id').primaryKey(),
  run_date: date('run_date').notNull(),
  run_status: eodJobStatusEnum('run_status').default('PENDING'),
  started_at: timestamp('started_at', { withTimezone: true }),
  completed_at: timestamp('completed_at', { withTimezone: true }),
  total_jobs: integer('total_jobs').default(0),
  completed_jobs: integer('completed_jobs').default(0),
  failed_jobs: integer('failed_jobs').default(0),
  triggered_by: integer('triggered_by').references(() => users.id),
  rollback_status: text('rollback_status'),
  rolled_back_at: timestamp('rolled_back_at', { withTimezone: true }),
  rolled_back_by: integer('rolled_back_by').references(() => users.id),
  ...auditFields,
});

export const eodJobs = pgTable('eod_jobs', {
  id: serial('id').primaryKey(),
  run_id: integer('run_id').references(() => eodRuns.id),
  job_name: text('job_name').notNull(),
  display_name: text('display_name'),
  job_status: eodJobStatusEnum('job_status').default('PENDING'),
  depends_on: text('depends_on').array(),
  started_at: timestamp('started_at', { withTimezone: true }),
  completed_at: timestamp('completed_at', { withTimezone: true }),
  duration_ms: integer('duration_ms'),
  records_processed: integer('records_processed').default(0),
  error_message: text('error_message'),
  retry_count: integer('retry_count').default(0),
  max_retries: integer('max_retries').default(3),
  ...auditFields,
});

// ============================================================================
// 26. Reconciliation (Phase 3B)
// ============================================================================

export const reconRunStatusEnum = pgEnum('recon_run_status', [
  'RUNNING', 'COMPLETED', 'FAILED',
]);

export const reconBreakStatusEnum = pgEnum('recon_break_status', [
  'OPEN', 'INVESTIGATING', 'RESOLVED', 'ESCALATED',
]);

export const reconRuns = pgTable('recon_runs', {
  id: serial('id').primaryKey(),
  type: text('type').notNull(),
  run_date: date('run_date').notNull(),
  recon_status: reconRunStatusEnum('recon_status').default('RUNNING'),
  total_records: integer('total_records').default(0),
  matched_records: integer('matched_records').default(0),
  breaks_found: integer('breaks_found').default(0),
  started_at: timestamp('started_at', { withTimezone: true }),
  completed_at: timestamp('completed_at', { withTimezone: true }),
  triggered_by: integer('triggered_by').references(() => users.id),
  ...auditFields,
});

export const reconBreaks = pgTable('recon_breaks', {
  id: serial('id').primaryKey(),
  run_id: integer('run_id').references(() => reconRuns.id),
  type: text('type').notNull(),
  entity_id: text('entity_id'),
  break_type: text('break_type'),
  internal_value: text('internal_value'),
  external_value: text('external_value'),
  difference: numeric('difference'),
  break_status: reconBreakStatusEnum('break_status').default('OPEN'),
  resolved_by: integer('resolved_by').references(() => users.id),
  resolved_at: timestamp('resolved_at', { withTimezone: true }),
  resolution_notes: text('resolution_notes'),
  ...auditFields,
});

// ============================================================================
// 27. Notional Accounting Events (TrustFees Pro Gap A04/A05/A06)
// ============================================================================

export const notionalEvents = pgTable('notional_events', {
  id: serial('id').primaryKey(),
  event_type: text('event_type').notNull(),
  aggregate_type: text('aggregate_type').notNull(),
  aggregate_id: text('aggregate_id').notNull(),
  payload: jsonb('payload'),
  idempotency_key: text('idempotency_key').notNull().unique(),
  schema_version: integer('schema_version').default(1).notNull(),
  emitted_at: timestamp('emitted_at', { withTimezone: true }).defaultNow().notNull(),
  consumed_at: timestamp('consumed_at', { withTimezone: true }),
});

export const eventSchemas = pgTable('event_schemas', {
  id: serial('id').primaryKey(),
  event_type: text('event_type').notNull(),
  schema_version: integer('schema_version').notNull(),
  json_schema: jsonb('json_schema').notNull(),
  is_active: boolean('is_active').default(true).notNull(),
  ...auditFields,
});

// ============================================================================
// 28. Report Generation Log (TrustFees Pro Gap A11)
// ============================================================================

export const reportGenerationLog = pgTable('report_generation_log', {
  id: serial('id').primaryKey(),
  report_type: text('report_type').notNull(),
  generated_by: integer('generated_by').references(() => users.id),
  generated_at: timestamp('generated_at', { withTimezone: true }).defaultNow().notNull(),
  params: jsonb('params'),
  row_count: integer('row_count').default(0),
  retention_until: date('retention_until').notNull(),
});

// ============================================================================
// 29. Regulatory Change Calendar (TrustFees Pro Gap A18/A19)
// ============================================================================

export const regulatoryCalendar = pgTable('regulatory_calendar', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  regulatory_body: text('regulatory_body'),
  jurisdiction_id: integer('jurisdiction_id').references(() => jurisdictions.id),
  effective_date: date('effective_date').notNull(),
  category: text('category'),
  cal_status: text('cal_status').default('UPCOMING').notNull(),
  impact: jsonb('impact'),
  ...auditFields,
});

// ============================================================================
// 30. Report Pack Templates (TrustFees Pro Gap C14)
// ============================================================================

export const reportPackTemplates = pgTable('report_pack_templates', {
  id: serial('id').primaryKey(),
  pack_name: text('pack_name').notNull(),
  description: text('description'),
  report_types: jsonb('report_types').notNull(),
  schedule_cron: text('schedule_cron'),
  is_active: boolean('is_active').default(true).notNull(),
  ...auditFields,
});

// ============================================================================
// 32. DSAR Requests (TrustFees Pro Gap A15/B05/B06/B07)
// ============================================================================

export const dsarRequests = pgTable('dsar_requests', {
  id: serial('id').primaryKey(),
  request_type: text('request_type').notNull(),
  requestor_name: text('requestor_name').notNull(),
  requestor_email: text('requestor_email').notNull(),
  subject_client_id: text('subject_client_id').references(() => clients.client_id),
  description: text('description'),
  dsar_status: dsarStatusEnum('dsar_status').default('NEW').notNull(),
  submitted_at: timestamp('submitted_at', { withTimezone: true }).defaultNow().notNull(),
  response_deadline: date('response_deadline').notNull(),
  processed_at: timestamp('processed_at', { withTimezone: true }),
  processed_by: integer('processed_by').references(() => users.id),
  approved_at: timestamp('approved_at', { withTimezone: true }),
  approved_by: integer('approved_by').references(() => users.id),
  artifact_bundle_url: text('artifact_bundle_url'),
  pii_inventory: jsonb('pii_inventory'),
  ...auditFields,
});

// ============================================================================
// 33. Document Deficiencies (FR-PTC-015 — Outstanding Document Blocker)
// ============================================================================

export const docDeficiencyStatusEnum = pgEnum('doc_deficiency_status', [
  'OUTSTANDING', 'SUBMITTED', 'VERIFIED', 'WAIVED', 'EXPIRED',
]);

export const documentDeficiencies = pgTable('document_deficiencies', {
  id: serial('id').primaryKey(),
  client_id: text('client_id').references(() => clients.client_id).notNull(),
  doc_type: text('doc_type').notNull(), // VALID_ID, PROOF_OF_ADDRESS, UBO_DECLARATION, FATCA_SELF_CERT, etc.
  required: boolean('required').default(true).notNull(),
  submitted_at: timestamp('submitted_at', { withTimezone: true }),
  verified_at: timestamp('verified_at', { withTimezone: true }),
  verified_by: integer('verified_by').references(() => users.id),
  deadline: date('deadline').notNull(),
  deficiency_status: docDeficiencyStatusEnum('deficiency_status').default('OUTSTANDING').notNull(),
  rejection_reason: text('rejection_reason'),
  ...auditFields,
});

// ============================================================================
// 34. Compliance Breach Curing (FR-PTC-022 — Aging/Curing-Period Monitoring)
// ============================================================================

export const curingEscalationLevelEnum = pgEnum('curing_escalation_level', [
  'NONE', 'OFFICER', 'MANAGER', 'HEAD', 'COMMITTEE',
]);

export const complianceBreachCuring = pgTable('compliance_breach_curing', {
  id: serial('id').primaryKey(),
  breach_id: integer('breach_id').references(() => complianceBreaches.id).notNull(),
  portfolio_id: text('portfolio_id').references(() => portfolios.portfolio_id),
  rule_id: integer('rule_id').references(() => complianceRules.id),
  detected_at: timestamp('detected_at', { withTimezone: true }).defaultNow().notNull(),
  curing_deadline: timestamp('curing_deadline', { withTimezone: true }).notNull(),
  curing_period_days: integer('curing_period_days').notNull(),
  escalation_level: curingEscalationLevelEnum('escalation_level').default('NONE').notNull(),
  escalated_at: timestamp('escalated_at', { withTimezone: true }),
  cured_at: timestamp('cured_at', { withTimezone: true }),
  cured_by: integer('cured_by').references(() => users.id),
  cure_action: text('cure_action'),
  ...auditFields,
});

// ============================================================================
// 35. FX Hedge Linkages (FR-CSH-003 — Hedge-to-Settlement Exposure)
// ============================================================================

export const fxHedgeTypeEnum = pgEnum('fx_hedge_type', [
  'SPOT', 'FORWARD', 'NDF', 'SWAP',
]);

export const fxHedgeLinkages = pgTable('fx_hedge_linkages', {
  id: serial('id').primaryKey(),
  order_id: text('order_id').references(() => orders.order_id),
  settlement_id: integer('settlement_id').references(() => settlementInstructions.id),
  hedge_type: fxHedgeTypeEnum('hedge_type').notNull(),
  currency_pair: text('currency_pair').notNull(),
  notional_amount: numeric('notional_amount', { precision: 21, scale: 4 }).notNull(),
  forward_rate: numeric('forward_rate', { precision: 18, scale: 8 }),
  spot_rate: numeric('spot_rate', { precision: 18, scale: 8 }),
  maturity_date: date('maturity_date'),
  hedge_status: text('hedge_status').default('OPEN').notNull(),
  ...auditFields,
});

// ============================================================================
// 36. Block Waitlist (FR-AGG-009 — Time-Receipt Waitlist Auto-Allocation)
// ============================================================================

export const waitlistStatusEnum = pgEnum('waitlist_status', [
  'QUEUED', 'PARTIALLY_ALLOCATED', 'FULLY_ALLOCATED', 'CANCELLED',
]);

export const blockWaitlistEntries = pgTable('block_waitlist_entries', {
  id: serial('id').primaryKey(),
  block_id: text('block_id').references(() => blocks.block_id).notNull(),
  order_id: text('order_id').references(() => orders.order_id).notNull(),
  priority_rank: integer('priority_rank').notNull(), // by time-of-receipt
  requested_qty: numeric('requested_qty', { precision: 21, scale: 4 }).notNull(),
  allocated_qty: numeric('allocated_qty', { precision: 21, scale: 4 }).default('0').notNull(),
  waitlist_status: waitlistStatusEnum('waitlist_status').default('QUEUED').notNull(),
  queued_at: timestamp('queued_at', { withTimezone: true }).defaultNow().notNull(),
  ...auditFields,
});

// ============================================================================
// 37. Post-Trade Review Schedules (FR-PTC-005 — Scheduled Reviews)
// ============================================================================

export const reviewFrequencyEnum = pgEnum('review_frequency', [
  'DAILY', 'WEEKLY', 'MONTHLY',
]);

export const postTradeReviewSchedules = pgTable('post_trade_review_schedules', {
  id: serial('id').primaryKey(),
  portfolio_id: text('portfolio_id').references(() => portfolios.portfolio_id),
  frequency: reviewFrequencyEnum('frequency').default('DAILY').notNull(),
  last_run_at: timestamp('last_run_at', { withTimezone: true }),
  next_run_at: timestamp('next_run_at', { withTimezone: true }),
  is_active: boolean('is_active').default(true).notNull(),
  ...auditFields,
});

// ============================================================================
// Drizzle Relations
// ============================================================================

// --- IAM Relations ---

export const usersRelations = relations(users, ({ one, many }) => ({
  branch: one(branches, {
    fields: [users.branch_id],
    references: [branches.id],
  }),
  userRoles: many(userRoles),
  orderAuthorizations: many(orderAuthorizations),
  blocks: many(blocks),
  confirmations: many(confirmations),
  tradeSurveillanceAlerts: many(tradeSurveillanceAlerts),
  whistleblowerCases: many(whistleblowerCases),
  reversalCasesRequested: many(reversalCases, { relationName: 'reversalRequester' }),
  reversalCasesApproved: many(reversalCases, { relationName: 'reversalApprover' }),
  uploadBatchesUploaded: many(uploadBatches, { relationName: 'uploader' }),
  uploadBatchesAuthorized: many(uploadBatches, { relationName: 'uploadAuthorizer' }),
  approvalRequestsSubmitted: many(approvalRequests, { relationName: 'approvalSubmitter' }),
  approvalRequestsReviewed: many(approvalRequests, { relationName: 'approvalReviewer' }),
  rebalancingRuns: many(rebalancingRuns),
  validationOverridesOverridden: many(validationOverrides, { relationName: 'validationOverrider' }),
  validationOverridesApproved: many(validationOverrides, { relationName: 'validationApprover' }),
  eodRunsTriggered: many(eodRuns, { relationName: 'eodRunsTrigger' }),
  reconRunsTriggered: many(reconRuns, { relationName: 'reconRunsTrigger' }),
  reconBreaksResolved: many(reconBreaks, { relationName: 'reconBreakResolver' }),
}));

export const rolesRelations = relations(roles, ({ many }) => ({
  permissions: many(permissions),
  userRoles: many(userRoles),
}));

export const permissionsRelations = relations(permissions, ({ one }) => ({
  role: one(roles, {
    fields: [permissions.role_id],
    references: [roles.id],
  }),
}));

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, {
    fields: [userRoles.user_id],
    references: [users.id],
  }),
  role: one(roles, {
    fields: [userRoles.role_id],
    references: [roles.id],
  }),
}));

// --- Client & KYC Relations ---

export const clientsRelations = relations(clients, ({ many }) => ({
  profiles: many(clientProfiles),
  kycCases: many(kycCases),
  beneficialOwners: many(beneficialOwners),
  fatcaCrs: many(clientFatcaCrs),
  portfolios: many(portfolios),
  consentLogs: many(consentLog),
  scheduledPlans: many(scheduledPlans),
  peraAccounts: many(peraAccounts),
}));

export const clientProfilesRelations = relations(clientProfiles, ({ one }) => ({
  client: one(clients, {
    fields: [clientProfiles.client_id],
    references: [clients.client_id],
  }),
}));

export const kycCasesRelations = relations(kycCases, ({ one }) => ({
  client: one(clients, {
    fields: [kycCases.client_id],
    references: [clients.client_id],
  }),
}));

export const beneficialOwnersRelations = relations(beneficialOwners, ({ one }) => ({
  client: one(clients, {
    fields: [beneficialOwners.client_id],
    references: [clients.client_id],
  }),
}));

export const clientFatcaCrsRelations = relations(clientFatcaCrs, ({ one }) => ({
  client: one(clients, {
    fields: [clientFatcaCrs.client_id],
    references: [clients.client_id],
  }),
}));

// --- Portfolio & Mandate Relations ---

export const portfoliosRelations = relations(portfolios, ({ one, many }) => ({
  client: one(clients, {
    fields: [portfolios.client_id],
    references: [clients.client_id],
  }),
  mandates: many(mandates),
  orders: many(orders),
  positions: many(positions),
  cashLedgers: many(cashLedger),
  feeSchedules: many(feeSchedules),
  feeInvoices: many(feeInvoices),
  navComputations: many(navComputations),
  unitTransactions: many(unitTransactions),
  taxEvents: many(taxEvents),
  corporateActionEntitlements: many(corporateActionEntitlements),
  transfersFrom: many(transfers, { relationName: 'transferFrom' }),
  transfersTo: many(transfers, { relationName: 'transferTo' }),
  contributions: many(contributions),
  withdrawals: many(withdrawals),
  heldAwayAssets: many(heldAwayAssets),
  scheduledPlans: many(scheduledPlans),
  standingInstructions: many(standingInstructions),
}));

export const mandatesRelations = relations(mandates, ({ one }) => ({
  portfolio: one(portfolios, {
    fields: [mandates.portfolio_id],
    references: [portfolios.portfolio_id],
  }),
}));

// --- Securities & Counterparties Relations ---

export const securitiesRelations = relations(securities, ({ many }) => ({
  orders: many(orders),
  positions: many(positions),
  blocks: many(blocks),
  corporateActions: many(corporateActions),
  transfers: many(transfers),
  pricingRecords: many(pricingRecords),
}));

export const counterpartiesRelations = relations(counterparties, ({ many }) => ({
  brokers: many(brokers),
}));

export const brokersRelations = relations(brokers, ({ one, many }) => ({
  counterparty: one(counterparties, {
    fields: [brokers.counterparty_id],
    references: [counterparties.id],
  }),
  trades: many(trades),
}));

// --- Order Lifecycle Relations ---

export const ordersRelations = relations(orders, ({ one, many }) => ({
  portfolio: one(portfolios, {
    fields: [orders.portfolio_id],
    references: [portfolios.portfolio_id],
  }),
  security: one(securities, {
    fields: [orders.security_id],
    references: [securities.id],
  }),
  authorizations: many(orderAuthorizations),
  trades: many(trades),
  trader: one(users, {
    fields: [orders.trader_id],
    references: [users.id],
  }),
  parentOrder: one(orders, {
    fields: [orders.parent_order_id],
    references: [orders.order_id],
  }),
  validationOverrides: many(validationOverrides),
}));

export const orderAuthorizationsRelations = relations(orderAuthorizations, ({ one }) => ({
  order: one(orders, {
    fields: [orderAuthorizations.order_id],
    references: [orders.order_id],
  }),
  approver: one(users, {
    fields: [orderAuthorizations.approver_id],
    references: [users.id],
  }),
}));

// --- Trade & Execution Relations ---

export const blocksRelations = relations(blocks, ({ one, many }) => ({
  security: one(securities, {
    fields: [blocks.security_id],
    references: [securities.id],
  }),
  trader: one(users, {
    fields: [blocks.trader_id],
    references: [users.id],
  }),
  trades: many(trades),
}));

export const tradesRelations = relations(trades, ({ one, many }) => ({
  order: one(orders, {
    fields: [trades.order_id],
    references: [orders.order_id],
  }),
  block: one(blocks, {
    fields: [trades.block_id],
    references: [blocks.block_id],
  }),
  broker: one(brokers, {
    fields: [trades.broker_id],
    references: [brokers.id],
  }),
  confirmations: many(confirmations),
  settlementInstructions: many(settlementInstructions),
  taxEvents: many(taxEvents),
}));

// --- Confirmation & Settlement Relations ---

export const confirmationsRelations = relations(confirmations, ({ one }) => ({
  trade: one(trades, {
    fields: [confirmations.trade_id],
    references: [trades.trade_id],
  }),
  confirmedByUser: one(users, {
    fields: [confirmations.confirmed_by],
    references: [users.id],
  }),
}));

export const settlementInstructionsRelations = relations(settlementInstructions, ({ one }) => ({
  trade: one(trades, {
    fields: [settlementInstructions.trade_id],
    references: [trades.trade_id],
  }),
}));

// --- Position & Cash Relations ---

export const positionsRelations = relations(positions, ({ one }) => ({
  portfolio: one(portfolios, {
    fields: [positions.portfolio_id],
    references: [portfolios.portfolio_id],
  }),
  security: one(securities, {
    fields: [positions.security_id],
    references: [securities.id],
  }),
}));

export const cashLedgerRelations = relations(cashLedger, ({ one, many }) => ({
  portfolio: one(portfolios, {
    fields: [cashLedger.portfolio_id],
    references: [portfolios.portfolio_id],
  }),
  transactions: many(cashTransactions),
}));

export const cashTransactionsRelations = relations(cashTransactions, ({ one }) => ({
  ledger: one(cashLedger, {
    fields: [cashTransactions.cash_ledger_id],
    references: [cashLedger.id],
  }),
}));

// --- Corporate Actions Relations ---

export const corporateActionsRelations = relations(corporateActions, ({ one, many }) => ({
  security: one(securities, {
    fields: [corporateActions.security_id],
    references: [securities.id],
  }),
  entitlements: many(corporateActionEntitlements),
}));

export const corporateActionEntitlementsRelations = relations(corporateActionEntitlements, ({ one }) => ({
  corporateAction: one(corporateActions, {
    fields: [corporateActionEntitlements.corporate_action_id],
    references: [corporateActions.id],
  }),
  portfolio: one(portfolios, {
    fields: [corporateActionEntitlements.portfolio_id],
    references: [portfolios.portfolio_id],
  }),
}));

// --- Fee & Billing Relations ---

export const feeSchedulesRelations = relations(feeSchedules, ({ one, many }) => ({
  portfolio: one(portfolios, {
    fields: [feeSchedules.portfolio_id],
    references: [portfolios.portfolio_id],
  }),
  invoices: many(feeInvoices),
  accruals: many(feeAccruals),
}));

export const feeInvoicesRelations = relations(feeInvoices, ({ one }) => ({
  portfolio: one(portfolios, {
    fields: [feeInvoices.portfolio_id],
    references: [portfolios.portfolio_id],
  }),
  feeSchedule: one(feeSchedules, {
    fields: [feeInvoices.fee_schedule_id],
    references: [feeSchedules.id],
  }),
}));

export const feeAccrualsRelations = relations(feeAccruals, ({ one }) => ({
  feeSchedule: one(feeSchedules, {
    fields: [feeAccruals.fee_schedule_id],
    references: [feeSchedules.id],
  }),
}));

// --- NAV & Fund Accounting Relations ---

export const navComputationsRelations = relations(navComputations, ({ one }) => ({
  portfolio: one(portfolios, {
    fields: [navComputations.portfolio_id],
    references: [portfolios.portfolio_id],
  }),
}));

export const unitTransactionsRelations = relations(unitTransactions, ({ one }) => ({
  portfolio: one(portfolios, {
    fields: [unitTransactions.portfolio_id],
    references: [portfolios.portfolio_id],
  }),
}));

export const pricingRecordsRelations = relations(pricingRecords, ({ one }) => ({
  security: one(securities, {
    fields: [pricingRecords.security_id],
    references: [securities.id],
  }),
}));

// --- Tax Relations ---

export const taxEventsRelations = relations(taxEvents, ({ one }) => ({
  trade: one(trades, {
    fields: [taxEvents.trade_id],
    references: [trades.trade_id],
  }),
  portfolio: one(portfolios, {
    fields: [taxEvents.portfolio_id],
    references: [portfolios.portfolio_id],
  }),
}));

// --- Reversal & Upload Relations ---

export const reversalCasesRelations = relations(reversalCases, ({ one }) => ({
  requestedBy: one(users, {
    fields: [reversalCases.requested_by],
    references: [users.id],
    relationName: 'reversalRequester',
  }),
  approvedBy: one(users, {
    fields: [reversalCases.approved_by],
    references: [users.id],
    relationName: 'reversalApprover',
  }),
}));

export const uploadBatchesRelations = relations(uploadBatches, ({ one }) => ({
  uploadedBy: one(users, {
    fields: [uploadBatches.uploaded_by],
    references: [users.id],
    relationName: 'uploader',
  }),
  authorizedBy: one(users, {
    fields: [uploadBatches.authorized_by],
    references: [users.id],
    relationName: 'uploadAuthorizer',
  }),
}));

// --- Transfer / Contribution / Withdrawal Relations ---

export const transfersRelations = relations(transfers, ({ one }) => ({
  fromPortfolio: one(portfolios, {
    fields: [transfers.from_portfolio_id],
    references: [portfolios.portfolio_id],
    relationName: 'transferFrom',
  }),
  toPortfolio: one(portfolios, {
    fields: [transfers.to_portfolio_id],
    references: [portfolios.portfolio_id],
    relationName: 'transferTo',
  }),
  security: one(securities, {
    fields: [transfers.security_id],
    references: [securities.id],
  }),
}));

export const contributionsRelations = relations(contributions, ({ one }) => ({
  portfolio: one(portfolios, {
    fields: [contributions.portfolio_id],
    references: [portfolios.portfolio_id],
  }),
}));

export const withdrawalsRelations = relations(withdrawals, ({ one }) => ({
  portfolio: one(portfolios, {
    fields: [withdrawals.portfolio_id],
    references: [portfolios.portfolio_id],
  }),
}));

// --- Compliance & Risk Relations ---

export const complianceRulesRelations = relations(complianceRules, ({ many }) => ({
  breaches: many(complianceBreaches),
}));

export const complianceBreachesRelations = relations(complianceBreaches, ({ one }) => ({
  rule: one(complianceRules, {
    fields: [complianceBreaches.rule_id],
    references: [complianceRules.id],
  }),
}));

export const tradeSurveillanceAlertsRelations = relations(tradeSurveillanceAlerts, ({ one }) => ({
  analyst: one(users, {
    fields: [tradeSurveillanceAlerts.analyst_id],
    references: [users.id],
  }),
}));

// --- Whistleblower Relations ---

export const whistleblowerCasesRelations = relations(whistleblowerCases, ({ one }) => ({
  ccoReviewer: one(users, {
    fields: [whistleblowerCases.cco_reviewer_id],
    references: [users.id],
  }),
}));

// --- Consent Log Relations ---

export const consentLogRelations = relations(consentLog, ({ one }) => ({
  client: one(clients, {
    fields: [consentLog.client_id],
    references: [clients.client_id],
  }),
}));

// --- EDEF Relations ---

export const entityRegistryRelations = relations(entityRegistry, ({ many }) => ({
  fieldConfigs: many(entityFieldConfig),
  crossValidations: many(entityCrossValidations),
}));

export const entityFieldConfigRelations = relations(entityFieldConfig, ({ one }) => ({
  entity: one(entityRegistry, {
    fields: [entityFieldConfig.entity_key],
    references: [entityRegistry.entity_key],
  }),
}));

export const entityCrossValidationsRelations = relations(entityCrossValidations, ({ one }) => ({
  entity: one(entityRegistry, {
    fields: [entityCrossValidations.entity_key],
    references: [entityRegistry.entity_key],
  }),
}));

// --- Approval Requests Relations ---

export const approvalRequestsRelations = relations(approvalRequests, ({ one }) => ({
  submitter: one(users, {
    fields: [approvalRequests.submitted_by],
    references: [users.id],
    relationName: 'approvalSubmitter',
  }),
  reviewer: one(users, {
    fields: [approvalRequests.reviewed_by],
    references: [users.id],
    relationName: 'approvalReviewer',
  }),
}));

// --- Branches Relations ---

export const branchesRelations = relations(branches, ({ many }) => ({
  users: many(users),
}));

// --- Portfolio Modeling Relations ---

export const modelPortfoliosRelations = relations(modelPortfolios, ({ many }) => ({
  rebalancingRuns: many(rebalancingRuns),
}));

export const rebalancingRunsRelations = relations(rebalancingRuns, ({ one }) => ({
  modelPortfolio: one(modelPortfolios, {
    fields: [rebalancingRuns.model_portfolio_id],
    references: [modelPortfolios.id],
  }),
  executedByUser: one(users, {
    fields: [rebalancingRuns.executed_by],
    references: [users.id],
  }),
}));

// --- Scheduled Plans Relations ---

export const scheduledPlansRelations = relations(scheduledPlans, ({ one }) => ({
  client: one(clients, {
    fields: [scheduledPlans.client_id],
    references: [clients.client_id],
  }),
  portfolio: one(portfolios, {
    fields: [scheduledPlans.portfolio_id],
    references: [portfolios.portfolio_id],
  }),
}));

// --- PERA Relations ---

export const peraAccountsRelations = relations(peraAccounts, ({ one, many }) => ({
  contributor: one(clients, {
    fields: [peraAccounts.contributor_id],
    references: [clients.client_id],
  }),
  transactions: many(peraTransactions),
}));

export const peraTransactionsRelations = relations(peraTransactions, ({ one }) => ({
  peraAccount: one(peraAccounts, {
    fields: [peraTransactions.pera_account_id],
    references: [peraAccounts.id],
  }),
}));

// --- Compliance Limits Relations (standalone, no FK) ---

// --- Validation Overrides Relations ---

export const validationOverridesRelations = relations(validationOverrides, ({ one }) => ({
  order: one(orders, {
    fields: [validationOverrides.order_id],
    references: [orders.order_id],
  }),
  overriddenByUser: one(users, {
    fields: [validationOverrides.overridden_by],
    references: [users.id],
  }),
  approvedByUser: one(users, {
    fields: [validationOverrides.approved_by],
    references: [users.id],
  }),
}));

// --- Held-Away Assets Relations ---

export const heldAwayAssetsRelations = relations(heldAwayAssets, ({ one }) => ({
  portfolio: one(portfolios, {
    fields: [heldAwayAssets.portfolio_id],
    references: [portfolios.portfolio_id],
  }),
}));

// --- Standing Instructions Relations ---

export const standingInstructionsRelations = relations(standingInstructions, ({ one }) => ({
  portfolio: one(portfolios, {
    fields: [standingInstructions.portfolio_id],
    references: [portfolios.portfolio_id],
  }),
}));

// --- EOD Processing Relations ---

export const eodRunsRelations = relations(eodRuns, ({ one, many }) => ({
  triggeredBy: one(users, {
    fields: [eodRuns.triggered_by],
    references: [users.id],
    relationName: 'eodRunsTrigger',
  }),
  jobs: many(eodJobs),
}));

export const eodJobsRelations = relations(eodJobs, ({ one }) => ({
  run: one(eodRuns, {
    fields: [eodJobs.run_id],
    references: [eodRuns.id],
  }),
}));

// --- Reconciliation Relations ---

export const reconRunsRelations = relations(reconRuns, ({ one, many }) => ({
  triggeredBy: one(users, {
    fields: [reconRuns.triggered_by],
    references: [users.id],
    relationName: 'reconRunsTrigger',
  }),
  breaks: many(reconBreaks),
}));

export const reconBreaksRelations = relations(reconBreaks, ({ one }) => ({
  run: one(reconRuns, {
    fields: [reconBreaks.run_id],
    references: [reconRuns.id],
  }),
  resolvedByUser: one(users, {
    fields: [reconBreaks.resolved_by],
    references: [users.id],
    relationName: 'reconBreakResolver',
  }),
}));

// ============================================================================
// TrustFees Pro — Relations
// ============================================================================

export const feePlansRelations = relations(feePlans, ({ one, many }) => ({
  pricingDefinition: one(pricingDefinitions, {
    fields: [feePlans.pricing_definition_id],
    references: [pricingDefinitions.id],
  }),
  eligibilityExpression: one(eligibilityExpressions, {
    fields: [feePlans.eligibility_expression_id],
    references: [eligibilityExpressions.id],
  }),
  accrualSchedule: one(accrualSchedules, {
    fields: [feePlans.accrual_schedule_id],
    references: [accrualSchedules.id],
  }),
  jurisdiction: one(jurisdictions, {
    fields: [feePlans.jurisdiction_id],
    references: [jurisdictions.id],
  }),
  template: one(feePlanTemplates, {
    fields: [feePlans.template_id],
    references: [feePlanTemplates.id],
  }),
  accruals: many(tfpAccruals),
}));

export const tfpAccrualsRelations = relations(tfpAccruals, ({ one }) => ({
  feePlan: one(feePlans, {
    fields: [tfpAccruals.fee_plan_id],
    references: [feePlans.id],
  }),
}));

export const tfpInvoicesRelations = relations(tfpInvoices, ({ one, many }) => ({
  jurisdiction: one(jurisdictions, {
    fields: [tfpInvoices.jurisdiction_id],
    references: [jurisdictions.id],
  }),
  lines: many(tfpInvoiceLines),
  payments: many(tfpPayments),
  disputes: many(disputes),
}));

export const tfpInvoiceLinesRelations = relations(tfpInvoiceLines, ({ one }) => ({
  invoice: one(tfpInvoices, {
    fields: [tfpInvoiceLines.invoice_id],
    references: [tfpInvoices.id],
  }),
  accrual: one(tfpAccruals, {
    fields: [tfpInvoiceLines.accrual_id],
    references: [tfpAccruals.id],
  }),
}));

export const tfpPaymentsRelations = relations(tfpPayments, ({ one }) => ({
  invoice: one(tfpInvoices, {
    fields: [tfpPayments.invoice_id],
    references: [tfpInvoices.id],
  }),
}));

export const feeOverridesRelations = relations(feeOverrides, ({ one }) => ({
  accrual: one(tfpAccruals, {
    fields: [feeOverrides.accrual_id],
    references: [tfpAccruals.id],
  }),
  invoice: one(tfpInvoices, {
    fields: [feeOverrides.invoice_id],
    references: [tfpInvoices.id],
  }),
}));

export const disputesRelations = relations(disputes, ({ one }) => ({
  invoice: one(tfpInvoices, {
    fields: [disputes.invoice_id],
    references: [tfpInvoices.id],
  }),
}));

export const creditNotesRelations = relations(creditNotes, ({ one }) => ({
  invoice: one(tfpInvoices, {
    fields: [creditNotes.related_invoice_id],
    references: [tfpInvoices.id],
  }),
}));

export const taxRulesRelations = relations(taxRules, ({ one }) => ({
  jurisdiction: one(jurisdictions, {
    fields: [taxRules.jurisdiction_id],
    references: [jurisdictions.id],
  }),
  sourcePack: one(contentPacks, {
    fields: [taxRules.source_pack_id],
    references: [contentPacks.id],
  }),
}));

export const contentPacksRelations = relations(contentPacks, ({ one }) => ({
  jurisdiction: one(jurisdictions, {
    fields: [contentPacks.jurisdiction_id],
    references: [jurisdictions.id],
  }),
}));

export const feePlanTemplatesRelations = relations(feePlanTemplates, ({ one }) => ({
  jurisdiction: one(jurisdictions, {
    fields: [feePlanTemplates.jurisdiction_id],
    references: [jurisdictions.id],
  }),
}));

export const customerReferencesRelations = relations(customerReferences, ({ one }) => ({
  jurisdiction: one(jurisdictions, {
    fields: [customerReferences.jurisdiction_id],
    references: [jurisdictions.id],
  }),
}));

// ============================================================================
// TRUST-CA 360 — Corporate Actions Management Tables
// ============================================================================

export const legalEntities = pgTable('legal_entities', {
  id: serial('id').primaryKey(),
  entity_code: text('entity_code').unique().notNull(),
  entity_name: text('entity_name').notNull(),
  regulator: text('regulator').notNull(),
  license_ref: text('license_ref').notNull(),
  base_currency: text('base_currency').notNull().default('PHP'),
  data_segregation_scope: dataSegregationEnum('data_segregation_scope').notNull(),
  ...auditFields,
});

export const marketCalendar = pgTable('market_calendar', {
  id: serial('id').primaryKey(),
  calendar_key: text('calendar_key').notNull(),
  date: date('date').notNull(),
  is_business_day: boolean('is_business_day').notNull(),
  is_settlement_day: boolean('is_settlement_day').notNull(),
  holiday_name: text('holiday_name'),
  source: text('source').notNull(),
  ...auditFields,
}, (table) => [
  uniqueIndex('market_calendar_key_date_idx').on(table.calendar_key, table.date),
]);

export const ttraApplications = pgTable('ttra_applications', {
  id: serial('id').primaryKey(),
  ttra_id: text('ttra_id').unique().notNull(),
  client_id: text('client_id').references(() => clients.client_id),
  treaty_country: text('treaty_country').notNull(),
  cor_document_ref: text('cor_document_ref').notNull(),
  bir_ctrr_ruling_no: text('bir_ctrr_ruling_no'),
  ttra_status: ttraStatusEnum('ttra_status').notNull().default('APPLIED'),
  effective_from: date('effective_from').notNull(),
  effective_to: date('effective_to').notNull(),
  next_review_due: date('next_review_due').notNull(),
  ...auditFields,
});

export const claims = pgTable('claims', {
  id: serial('id').primaryKey(),
  claim_id: text('claim_id').unique().notNull(),
  claim_reference: text('claim_reference').unique().notNull(),
  event_id: integer('event_id').references(() => corporateActions.id),
  account_id: text('account_id'),
  origination: claimOriginationEnum('origination').notNull(),
  root_cause_code: claimRootCauseEnum('root_cause_code'),
  claim_amount: numeric('claim_amount').notNull(),
  currency: text('currency').notNull().default('PHP'),
  pnl_impact_account: text('pnl_impact_account'),
  approval_tier: claimApprovalTierEnum('approval_tier').notNull(),
  claim_status: claimStatusEnum('claim_status').notNull().default('DRAFT'),
  compensation_settlement_id: integer('compensation_settlement_id'),
  regulatory_disclosure_required: boolean('regulatory_disclosure_required').notNull().default(false),
  supporting_docs: jsonb('supporting_docs'),
  investigation_started_at: timestamp('investigation_started_at', { withTimezone: true }),
  investigation_sla_deadline: timestamp('investigation_sla_deadline', { withTimezone: true }),
  approved_by: integer('approved_by').references(() => users.id),
  approved_at: timestamp('approved_at', { withTimezone: true }),
  rejection_reason: text('rejection_reason'),
  ...auditFields,
});

export const dataStewardship = pgTable('data_stewardship', {
  id: serial('id').primaryKey(),
  dataset_key: text('dataset_key').unique().notNull(),
  steward_user_id: integer('steward_user_id').references(() => users.id),
  approval_policy: stewardshipApprovalEnum('approval_policy').notNull(),
  change_frequency_cap: text('change_frequency_cap'),
  last_reviewed_at: timestamp('last_reviewed_at', { withTimezone: true }).notNull(),
  ...auditFields,
});

export const consentRecords = pgTable('consent_records', {
  id: serial('id').primaryKey(),
  consent_id: text('consent_id').unique().notNull(),
  client_id: text('client_id').references(() => clients.client_id),
  purpose: consentPurposeEnum('purpose').notNull(),
  channel_scope: jsonb('channel_scope').notNull(),
  granted: boolean('granted').notNull(),
  granted_at: timestamp('granted_at', { withTimezone: true }).notNull(),
  withdrawn_at: timestamp('withdrawn_at', { withTimezone: true }),
  legal_basis: consentLegalBasisEnum('legal_basis').notNull(),
  dpa_ref: text('dpa_ref').notNull(),
  ...auditFields,
});

export const stewardSignoffStatusEnum = pgEnum('steward_signoff_status', [
  'PENDING', 'APPROVED', 'REJECTED',
]);

export const stewardSignoffs = pgTable('steward_signoffs', {
  id: serial('id').primaryKey(),
  dataset_id: text('dataset_id').notNull(),
  requested_at: timestamp('requested_at', { withTimezone: true }).notNull(),
  steward_id: text('steward_id'),
  signed_off_at: timestamp('signed_off_at', { withTimezone: true }),
  signoff_status: stewardSignoffStatusEnum('signoff_status').notNull().default('PENDING'),
  ...auditFields,
});

export const feedRouting = pgTable('feed_routing', {
  id: serial('id').primaryKey(),
  routing_id: text('routing_id').unique().notNull(),
  security_segment: securitySegmentEnum('security_segment').notNull(),
  primary_source: text('primary_source').notNull(),
  secondary_source: text('secondary_source').notNull(),
  cost_tier: feedCostTierEnum('cost_tier').notNull(),
  active_flag: boolean('active_flag').notNull().default(true),
  ...auditFields,
});

export const degradedModeLogs = pgTable('degraded_mode_logs', {
  id: serial('id').primaryKey(),
  incident_id: text('incident_id').unique().notNull(),
  started_at: timestamp('started_at', { withTimezone: true }).notNull(),
  ended_at: timestamp('ended_at', { withTimezone: true }),
  failed_component: degradedModeComponentEnum('failed_component').notNull(),
  fallback_path: text('fallback_path').notNull(),
  impacted_event_ids: jsonb('impacted_event_ids'),
  rca_completed: boolean('rca_completed').notNull().default(false),
  ...auditFields,
});

// --- TRUST-CA 360 Relations ---

export const legalEntitiesRelations = relations(legalEntities, ({ many }) => ({
  corporateActions: many(corporateActions),
  portfolios: many(portfolios),
}));

export const ttraApplicationsRelations = relations(ttraApplications, ({ one }) => ({
  client: one(clients, {
    fields: [ttraApplications.client_id],
    references: [clients.client_id],
  }),
}));

export const claimsRelations = relations(claims, ({ one }) => ({
  event: one(corporateActions, {
    fields: [claims.event_id],
    references: [corporateActions.id],
  }),
  approvedByUser: one(users, {
    fields: [claims.approved_by],
    references: [users.id],
  }),
}));

export const consentRecordsRelations = relations(consentRecords, ({ one }) => ({
  client: one(clients, {
    fields: [consentRecords.client_id],
    references: [clients.client_id],
  }),
}));

export const dataStewardshipRelations = relations(dataStewardship, ({ one }) => ({
  steward: one(users, {
    fields: [dataStewardship.steward_user_id],
    references: [users.id],
  }),
}));

// ============================================================================
// BRD Philippines — New Tables (Phase 1A)
// ============================================================================

export const backdatingReasonEnum = pgEnum('backdating_reason', [
  'CLIENT_INSTRUCTION_DELAY', 'SYSTEM_OUTAGE', 'OPERATIONAL_ERROR', 'REGULATORY_MANDATE', 'OTHER',
]);

export const sanctionsScreeningStatusEnum = pgEnum('sanctions_screening_status', [
  'PENDING', 'CLEAR', 'HIT', 'FALSE_POSITIVE', 'TRUE_MATCH', 'ESCALATED',
]);

export const fixMsgTypeEnum = pgEnum('fix_msg_type', [
  'NEW_ORDER_SINGLE', 'ORDER_CANCEL_REQUEST', 'ORDER_CANCEL_REPLACE', 'EXECUTION_REPORT',
]);

export const fixAckStatusEnum = pgEnum('fix_ack_status', [
  'PENDING', 'ACKNOWLEDGED', 'REJECTED', 'TIMED_OUT',
]);

export const switchReasonEnum = pgEnum('switch_reason', [
  'REBALANCING', 'CLIENT_REQUEST', 'RISK_MITIGATION', 'PRODUCT_MIGRATION', 'OTHER',
]);

export const scalingMethodEnum = pgEnum('scaling_method', ['PRO_RATA', 'LOTTERY', 'FIXED']);

export const brokerRateTypeEnum = pgEnum('broker_rate_type', ['FLAT', 'PERCENTAGE', 'TIERED']);

export const cashSweepFrequencyEnum = pgEnum('cash_sweep_frequency', [
  'DAILY', 'WEEKLY', 'MONTHLY',
]);

export const derivativeInstrumentTypeEnum = pgEnum('derivative_instrument_type', [
  'OPTION_CALL', 'OPTION_PUT', 'FUTURES', 'FORWARD', 'SWAP', 'WARRANT',
]);

export const uploadItemStatusEnum = pgEnum('upload_item_status', [
  'PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED',
]);

/** FR-SAN-001: Sanctions screening log */
export const sanctionsScreeningLog = pgTable('sanctions_screening_log', {
  id: serial('id').primaryKey(),
  entity_type: text('entity_type').notNull(),
  entity_id: text('entity_id').notNull(),
  provider: text('provider').default('INTERNAL'),
  screened_name: text('screened_name'),
  hit_count: integer('hit_count').default(0),
  match_details: jsonb('match_details'),
  screening_status: sanctionsScreeningStatusEnum('screening_status').default('PENDING'),
  resolved_by: integer('resolved_by').references(() => users.id),
  resolved_at: timestamp('resolved_at', { withTimezone: true }),
  resolution_notes: text('resolution_notes'),
  ...auditFields,
});

/** FR-TAX-003: BIR Form 1601-FQ quarterly filing */
export const form1601fq = pgTable('form1601fq', {
  id: serial('id').primaryKey(),
  quarter: integer('quarter').notNull(),
  year: integer('year').notNull(),
  filing_date: date('filing_date'),
  total_withheld: numeric('total_withheld', { precision: 21, scale: 4 }),
  xml_payload: text('xml_payload'),
  submission_ref: text('submission_ref'),
  filing_status: text('filing_status').default('DRAFT'),
  ...auditFields,
});

/** FR-EXE-003: FIX outbound messages */
export const fixOutboundMessages = pgTable('fix_outbound_messages', {
  id: serial('id').primaryKey(),
  order_id: text('order_id').references(() => orders.order_id),
  msg_type: fixMsgTypeEnum('msg_type').notNull(),
  fix_version: text('fix_version').default('FIX.4.4'),
  target_comp_id: text('target_comp_id'),
  sender_comp_id: text('sender_comp_id'),
  payload: jsonb('payload'),
  ack_status: fixAckStatusEnum('ack_status').default('PENDING'),
  sent_at: timestamp('sent_at', { withTimezone: true }),
  ack_at: timestamp('ack_at', { withTimezone: true }),
  ...auditFields,
});

/** FR-ORD-007: Switch orders */
export const switchOrders = pgTable('switch_orders', {
  id: serial('id').primaryKey(),
  parent_order_id: text('parent_order_id').references(() => orders.order_id),
  redeem_leg_order_id: text('redeem_leg_order_id').references(() => orders.order_id),
  subscribe_leg_order_id: text('subscribe_leg_order_id').references(() => orders.order_id),
  switch_reason: switchReasonEnum('switch_reason'),
  switch_status: text('switch_status').default('PENDING'),
  ...auditFields,
});

/** FR-ORD-008: Subsequent allocations */
export const subsequentAllocations = pgTable('subsequent_allocations', {
  id: serial('id').primaryKey(),
  order_id: text('order_id').references(() => orders.order_id),
  fund_id: text('fund_id'),
  percentage: numeric('percentage', { precision: 9, scale: 4 }),
  amount: numeric('amount', { precision: 21, scale: 4 }),
  ...auditFields,
});

/** FR-EXE-004: IPO allocations */
export const ipoAllocations = pgTable('ipo_allocations', {
  id: serial('id').primaryKey(),
  ipo_id: text('ipo_id'),
  order_id: text('order_id').references(() => orders.order_id),
  applied_units: numeric('applied_units', { precision: 21, scale: 4 }),
  allotted_units: numeric('allotted_units', { precision: 21, scale: 4 }),
  scaling_factor: numeric('scaling_factor', { precision: 9, scale: 6 }),
  scaling_method: scalingMethodEnum('scaling_method'),
  ...auditFields,
});

/** FR-EXE-005: Broker charge schedules */
export const brokerChargeSchedules = pgTable('broker_charge_schedules', {
  id: serial('id').primaryKey(),
  broker_id: integer('broker_id').references(() => brokers.id),
  asset_class: text('asset_class'),
  tier_min: numeric('tier_min', { precision: 21, scale: 4 }).default('0'),
  tier_max: numeric('tier_max', { precision: 21, scale: 4 }),
  rate_type: brokerRateTypeEnum('rate_type').default('PERCENTAGE'),
  rate: numeric('rate', { precision: 9, scale: 6 }),
  min_charge: numeric('min_charge', { precision: 21, scale: 4 }),
  ...auditFields,
});

/** FR-SET-004: Cash sweep rules */
export const cashSweepRules = pgTable('cash_sweep_rules', {
  id: serial('id').primaryKey(),
  account_id: text('account_id'),
  portfolio_id: text('portfolio_id').references(() => portfolios.portfolio_id),
  threshold_amount: numeric('threshold_amount', { precision: 21, scale: 4 }),
  target_fund_id: text('target_fund_id'),
  frequency: cashSweepFrequencyEnum('frequency').default('DAILY'),
  is_active: boolean('is_active').default(true),
  ...auditFields,
});

/** FR-SET-005: Settlement account configurations */
export const settlementAccountConfigs = pgTable('settlement_account_configs', {
  id: serial('id').primaryKey(),
  trust_account_id: text('trust_account_id'),
  custodian_id: integer('custodian_id').references(() => counterparties.id),
  ssi_id: text('ssi_id'),
  currency: text('currency').default('PHP'),
  routing_bic: text('routing_bic'),
  swift_message_type: text('swift_message_type'),
  is_default: boolean('is_default').default(false),
  ...auditFields,
});

/** FR-DER-001/002: Derivative instrument setups */
export const derivativeSetups = pgTable('derivative_setups', {
  id: serial('id').primaryKey(),
  instrument_type: derivativeInstrumentTypeEnum('instrument_type').notNull(),
  underlier: text('underlier'),
  underlier_security_id: integer('underlier_security_id').references(() => securities.id),
  notional: numeric('notional', { precision: 21, scale: 4 }),
  strike_price: numeric('strike_price', { precision: 21, scale: 4 }),
  expiry_date: date('expiry_date'),
  margin_req: numeric('margin_req', { precision: 21, scale: 4 }),
  max_notional_limit: numeric('max_notional_limit', { precision: 21, scale: 4 }),
  allowed_underliers: jsonb('allowed_underliers'),
  ...auditFields,
});

/** FR-RISK-003: Stress test results */
export const stressTestResults = pgTable('stress_test_results', {
  id: serial('id').primaryKey(),
  scenario_id: text('scenario_id'),
  scenario_name: text('scenario_name'),
  portfolio_id: text('portfolio_id').references(() => portfolios.portfolio_id),
  impact_pct: numeric('impact_pct', { precision: 9, scale: 4 }),
  impact_amount: numeric('impact_amount', { precision: 21, scale: 4 }),
  run_date: date('run_date'),
  parameters: jsonb('parameters'),
  ...auditFields,
});

/** FR-UPL-003: Upload batch items (fan-out tracking) */
export const uploadBatchItems = pgTable('upload_batch_items', {
  id: serial('id').primaryKey(),
  batch_id: integer('batch_id').references(() => uploadBatches.id),
  row_number: integer('row_number'),
  entity_type: text('entity_type'),
  entity_id: text('entity_id'),
  item_status: uploadItemStatusEnum('item_status').default('PENDING'),
  error_message: text('error_message'),
  processed_at: timestamp('processed_at', { withTimezone: true }),
  ...auditFields,
});

// ============================================================================
// Enterprise GL — Enums
// ============================================================================

export const glTypeEnum = pgEnum('gl_type', ['ASSET', 'LIABILITY', 'INCOME', 'EXPENDITURE', 'EQUITY']);

export const glAccountStatusEnum = pgEnum('gl_account_status', ['OPEN', 'CLOSED', 'SUSPENDED']);

export const postingModeEnum = pgEnum('posting_mode', [
  'ONLINE', 'BATCH', 'MANUAL', 'EOD', 'SOD', 'MOD', 'NAV_FINALIZATION', 'YEAR_END',
]);

export const journalBatchStatusEnum = pgEnum('journal_batch_status', [
  'DRAFT', 'PENDING_VALIDATION', 'VALIDATED', 'PENDING_AUTH', 'AUTHORIZED', 'POSTED', 'REJECTED', 'CANCELLED', 'REVERSED',
]);

export const drCrEnum = pgEnum('dr_cr', ['DR', 'CR']);

export const holdingClassificationEnum = pgEnum('holding_classification', [
  'HTM', 'AFS', 'HFT', 'FVPL', 'FVTPL', 'FVOCI', 'HTC',
]);

export const accountingStandardEnum = pgEnum('accounting_standard', ['PFRS', 'IFRS', 'LOCAL_GAAP']);

export const frptiContractualRelEnum = pgEnum('frpti_contractual_rel', [
  'TRUST', 'OTHER_FIDUCIARY', 'AGENCY', 'ADVISORY_CONSULTANCY', 'SPECIAL_PURPOSE_TRUST',
]);

export const frptiBookEnum = pgEnum('frpti_book', ['RBU', 'FCDU', 'EFCDU']);

export const navStatusEnum = pgEnum('nav_status', ['DRAFT', 'FINAL', 'REVERSED']);

export const fxRateTypeEnum = pgEnum('fx_rate_type', ['ACTUAL', 'NOTIONAL']);

export const fxRateFlagEnum = pgEnum('fx_rate_flag', ['DAILY', 'WEEKLY_AVG', 'QUARTERLY_AVG']);

export const glRevalDirectionEnum = pgEnum('gl_reval_direction', ['GAIN', 'LOSS']);

export const accountingRuleStatusEnum = pgEnum('accounting_rule_status', [
  'DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'RETIRED',
]);

export const postingExceptionCatEnum = pgEnum('posting_exception_cat', [
  'SCHEMA_ERROR', 'MASTER_DATA_ERROR', 'RULE_ERROR', 'VALIDATION_ERROR', 'AUTHORIZATION_ERROR', 'SYSTEM_ERROR',
]);

export const yearEndStatusEnum = pgEnum('year_end_status', ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'REVERSED']);

export const frptiResidentStatusEnum = pgEnum('frpti_resident_status', ['RESIDENT', 'NON_RESIDENT']);

// ============================================================================
// Enterprise GL — Master Tables
// ============================================================================

/** GL Category — classifies GL heads: asset, liability, income, expense, etc. */
export const glCategories = pgTable('gl_categories', {
  id: serial('id').primaryKey(),
  code: text('code').unique().notNull(),
  name: text('name').notNull(),
  concise_name: text('concise_name'),
  category_type: glTypeEnum('category_type').notNull(),
  is_bank_gl: boolean('is_bank_gl').default(false).notNull(),
  is_nostro: boolean('is_nostro').default(false).notNull(),
  is_vostro: boolean('is_vostro').default(false).notNull(),
  description: text('description'),
  ...auditFields,
});

/** GL Hierarchy — parent-child structure for financial statements */
export const glHierarchy = pgTable('gl_hierarchy', {
  id: serial('id').primaryKey(),
  code: text('code').unique().notNull(),
  name: text('name').notNull(),
  parent_hierarchy_id: integer('parent_hierarchy_id'),
  level: integer('level').notNull().default(0),
  sort_order: integer('sort_order').notNull().default(0),
  description: text('description'),
  ...auditFields,
});

/** GL Head — Chart of Accounts nodes used for posting and reporting */
export const glHeads = pgTable('gl_heads', {
  id: serial('id').primaryKey(),
  code: text('code').unique().notNull(),
  name: text('name').notNull(),
  gl_type: glTypeEnum('gl_type').notNull(),
  category_id: integer('category_id').references(() => glCategories.id).notNull(),
  hierarchy_id: integer('hierarchy_id').references(() => glHierarchy.id),
  parent_gl_id: integer('parent_gl_id'),
  contra_gl_id: integer('contra_gl_id'),
  book_code: text('book_code'),
  account_status: glAccountStatusEnum('account_status').notNull().default('OPEN'),
  currency_restriction: text('currency_restriction'),
  opening_date: date('opening_date').notNull(),
  closing_date: date('closing_date'),
  is_manual_posting_allowed: boolean('is_manual_posting_allowed').default(true).notNull(),
  manual_restriction_effective_from: date('manual_restriction_effective_from'),
  is_revaluation_enabled: boolean('is_revaluation_enabled').default(false).notNull(),
  is_customer_account_enabled: boolean('is_customer_account_enabled').default(false).notNull(),
  is_nominal: boolean('is_nominal').default(false).notNull(),
  is_interunit: boolean('is_interunit').default(false).notNull(),
  nav_inclusion: boolean('nav_inclusion').default(true).notNull(),
  frpti_report_line: text('frpti_report_line'),
  frpti_schedule: text('frpti_schedule'),
  fs_mapping_code: text('fs_mapping_code'),
  description: text('description'),
  ...auditFields,
});

/** GL Access Code — operational posting access codes */
export const glAccessCodes = pgTable('gl_access_codes', {
  id: serial('id').primaryKey(),
  code: text('code').unique().notNull(),
  name: text('name').notNull(),
  gl_head_id: integer('gl_head_id').references(() => glHeads.id).notNull(),
  accounting_unit_id: integer('accounting_unit_id'),
  is_active: boolean('is_active').default(true).notNull(),
  description: text('description'),
  ...auditFields,
});

/** Accounting Unit — replaces/extends branch for portfolio-level accounting */
export const accountingUnits = pgTable('accounting_units', {
  id: serial('id').primaryKey(),
  code: text('code').unique().notNull(),
  name: text('name').notNull(),
  branch_id: integer('branch_id').references(() => branches.id),
  legal_entity_id: integer('legal_entity_id').references(() => legalEntities.id),
  base_currency: text('base_currency').notNull().default('PHP'),
  is_active: boolean('is_active').default(true).notNull(),
  description: text('description'),
  ...auditFields,
});

/** Fund Master — UITF/fund parameters for NAV, fees, valuation */
export const fundMaster = pgTable('fund_master', {
  id: serial('id').primaryKey(),
  fund_code: text('fund_code').unique().notNull(),
  fund_name: text('fund_name').notNull(),
  fund_structure: text('fund_structure').notNull(), // open-ended, close-ended, interval
  fund_type: text('fund_type').notNull(),
  fund_currency: text('fund_currency').notNull().default('PHP'),
  nav_frequency: text('nav_frequency').notNull().default('DAILY'), // DAILY, ALL_DAYS, WEEKLY, MONTHLY
  first_nav_date: date('first_nav_date'),
  first_eoy_date: date('first_eoy_date'),
  last_eoy_date: date('last_eoy_date'),
  unit_precision: integer('unit_precision').notNull().default(4),
  nav_decimals: integer('nav_decimals').notNull().default(4),
  nav_rounding_method: text('nav_rounding_method').notNull().default('ROUND_OFF'), // ROUND_OFF, ROUND_UP, NO_ROUND
  tax_on_interest: boolean('tax_on_interest').default(false).notNull(),
  default_operative_account: text('default_operative_account'),
  valuation_basis: text('valuation_basis'),
  accounting_unit_id: integer('accounting_unit_id').references(() => accountingUnits.id),
  is_active: boolean('is_active').default(true).notNull(),
  description: text('description'),
  ...auditFields,
});

/** Portfolio Master (GL-specific extension) — accounting container under fund/customer/trust */
export const glPortfolioMaster = pgTable('gl_portfolio_master', {
  id: serial('id').primaryKey(),
  portfolio_code: text('portfolio_code').unique().notNull(),
  portfolio_name: text('portfolio_name').notNull(),
  fund_id: integer('fund_id').references(() => fundMaster.id),
  portfolio_id: text('portfolio_id').references(() => portfolios.portfolio_id),
  accounting_unit_id: integer('accounting_unit_id').references(() => accountingUnits.id),
  product_class: text('product_class'), // IMA, PRE_NEED, UITF, etc.
  contractual_relationship: frptiContractualRelEnum('contractual_relationship'),
  discretionary_flag: boolean('discretionary_flag').default(false).notNull(),
  tax_exempt: boolean('tax_exempt').default(false).notNull(),
  is_government_entity: boolean('is_government_entity').default(false).notNull(),
  is_specialized_institutional: boolean('is_specialized_institutional').default(false).notNull(),
  base_currency: text('base_currency').notNull().default('PHP'),
  is_active: boolean('is_active').default(true).notNull(),
  ...auditFields,
});

/** Counterparty Master (GL extension) — issuer/counterparty with FRPTI classification */
export const glCounterpartyMaster = pgTable('gl_counterparty_master', {
  id: serial('id').primaryKey(),
  counterparty_code: text('counterparty_code').unique().notNull(),
  counterparty_name: text('counterparty_name').notNull(),
  counterparty_id: integer('counterparty_id').references(() => counterparties.id),
  frpti_sector: text('frpti_sector'),
  frpti_sub_sector: text('frpti_sub_sector'),
  resident_status: frptiResidentStatusEnum('resident_status'),
  is_government: boolean('is_government').default(false).notNull(),
  country_code: text('country_code'),
  is_active: boolean('is_active').default(true).notNull(),
  ...auditFields,
});

/** FRPTI Mapping — GL-to-FRPTI report line/schedule mapping */
export const frptiMappings = pgTable('frpti_mappings', {
  id: serial('id').primaryKey(),
  gl_head_id: integer('gl_head_id').references(() => glHeads.id).notNull(),
  frpti_report_line: text('frpti_report_line').notNull(),
  frpti_schedule: text('frpti_schedule').notNull(),
  frpti_book: frptiBookEnum('frpti_book').notNull().default('RBU'),
  effective_from: date('effective_from').notNull(),
  effective_to: date('effective_to'),
  mapping_version: integer('mapping_version').notNull().default(1),
  description: text('description'),
  ...auditFields,
});

/** Financial Statement Mapping — GL-to-BS/IS/TB mapping */
export const fsMapping = pgTable('fs_mapping', {
  id: serial('id').primaryKey(),
  gl_head_id: integer('gl_head_id').references(() => glHeads.id).notNull(),
  report_type: text('report_type').notNull(), // BALANCE_SHEET, INCOME_STATEMENT, TRIAL_BALANCE
  report_section: text('report_section').notNull(),
  report_line: text('report_line').notNull(),
  sort_order: integer('sort_order').notNull().default(0),
  effective_from: date('effective_from').notNull(),
  effective_to: date('effective_to'),
  mapping_version: integer('mapping_version').notNull().default(1),
  ...auditFields,
});

/** FX Rate — exchange rates by currency pair and date */
export const fxRates = pgTable('fx_rates', {
  id: serial('id').primaryKey(),
  rate_type_code: text('rate_type_code').notNull(),
  rate_type: fxRateTypeEnum('rate_type').notNull().default('ACTUAL'),
  rate_flag: fxRateFlagEnum('rate_flag').notNull().default('DAILY'),
  currency_from: text('currency_from').notNull(),
  currency_to: text('currency_to').notNull(),
  business_date: date('business_date').notNull(),
  date_serial: integer('date_serial').notNull().default(1),
  purchase_rate: numeric('purchase_rate'),
  selling_rate: numeric('selling_rate'),
  mid_rate: numeric('mid_rate'),
  source: text('source'), // MANUAL, BLOOMBERG, REUTERS
  ...auditFields,
}, (table) => [
  uniqueIndex('fx_rate_unique_idx').on(table.currency_from, table.currency_to, table.business_date, table.rate_type_code, table.date_serial),
]);

/** Revaluation Parameter — FCY GL revaluation setup */
export const revalParameters = pgTable('reval_parameters', {
  id: serial('id').primaryKey(),
  gl_head_id: integer('gl_head_id').references(() => glHeads.id).notNull(),
  gain_gl_id: integer('gain_gl_id').references(() => glHeads.id).notNull(),
  loss_gl_id: integer('loss_gl_id').references(() => glHeads.id).notNull(),
  effective_from: date('effective_from').notNull(),
  effective_to: date('effective_to'),
  revaluation_frequency: text('revaluation_frequency').notNull().default('DAILY'),
  is_active: boolean('is_active').default(true).notNull(),
  ...auditFields,
});

// ============================================================================
// Enterprise GL — Event & Accounting Rule Tables
// ============================================================================

/** Event Definition — registry of business events that generate accounting */
export const glEventDefinitions = pgTable('gl_event_definitions', {
  id: serial('id').primaryKey(),
  product: text('product').notNull(),
  event_code: text('event_code').unique().notNull(),
  event_name: text('event_name').notNull(),
  payload_schema: jsonb('payload_schema'),
  posting_mode: postingModeEnum('posting_mode').notNull(),
  authorization_policy: text('authorization_policy').notNull().default('AUTO'),
  reversal_policy: text('reversal_policy'),
  is_active: boolean('is_active').default(true).notNull(),
  description: text('description'),
  ...auditFields,
});

/** Criteria Definition — header for selecting applicable rule set */
export const glCriteriaDefinitions = pgTable('gl_criteria_definitions', {
  id: serial('id').primaryKey(),
  event_id: integer('event_id').references(() => glEventDefinitions.id).notNull(),
  criteria_name: text('criteria_name').notNull(),
  priority: integer('priority').notNull().default(100),
  effective_from: date('effective_from').notNull(),
  effective_to: date('effective_to'),
  is_default: boolean('is_default').default(false).notNull(),
  is_active: boolean('is_active').default(true).notNull(),
  description: text('description'),
  ...auditFields,
});

/** Criteria Condition — field/relation/value for criteria matching */
export const glCriteriaConditions = pgTable('gl_criteria_conditions', {
  id: serial('id').primaryKey(),
  criteria_id: integer('criteria_id').references(() => glCriteriaDefinitions.id).notNull(),
  field_name: text('field_name').notNull(),
  relation: text('relation').notNull(), // =, !=, in, not in, >, <
  field_value: text('field_value').notNull(),
  ...auditFields,
});

/** Accounting Rule Set — versioned rule header */
export const glAccountingRuleSets = pgTable('gl_accounting_rule_sets', {
  id: serial('id').primaryKey(),
  criteria_id: integer('criteria_id').references(() => glCriteriaDefinitions.id).notNull(),
  rule_code: text('rule_code').notNull(),
  rule_name: text('rule_name').notNull(),
  rule_version: integer('rule_version').notNull().default(1),
  rule_status: accountingRuleStatusEnum('rule_status').notNull().default('DRAFT'),
  effective_from: date('effective_from').notNull(),
  effective_to: date('effective_to'),
  approved_by: integer('approved_by').references(() => users.id),
  approved_at: timestamp('approved_at', { withTimezone: true }),
  description: text('description'),
  ...auditFields,
}, (table) => [
  uniqueIndex('gl_rule_set_version_idx').on(table.rule_code, table.rule_version),
]);

/** Accounting Entry Definition — journal line generation logic */
export const glAccountingEntryDefinitions = pgTable('gl_accounting_entry_definitions', {
  id: serial('id').primaryKey(),
  rule_set_id: integer('rule_set_id').references(() => glAccountingRuleSets.id).notNull(),
  line_order: integer('line_order').notNull(),
  dr_cr: drCrEnum('dr_cr').notNull(),
  gl_selector: text('gl_selector').notNull(), // Static GL code, field reference, or expression
  gl_selector_type: text('gl_selector_type').notNull().default('STATIC'), // STATIC, FIELD, EXPRESSION
  amount_type: text('amount_type').notNull().default('FIELD'), // FIELD, EXPRESSION
  amount_field: text('amount_field'),
  amount_expression: text('amount_expression'),
  currency_expression: text('currency_expression').notNull().default('event.currency'),
  narration_template: text('narration_template'),
  posting_trigger: text('posting_trigger'),
  accounting_standard: accountingStandardEnum('accounting_standard'),
  dimension_mapping: jsonb('dimension_mapping'),
  description: text('description'),
  ...auditFields,
});

/** Rule Test Case — expected input/output for golden accounting tests */
export const glRuleTestCases = pgTable('gl_rule_test_cases', {
  id: serial('id').primaryKey(),
  rule_set_id: integer('rule_set_id').references(() => glAccountingRuleSets.id).notNull(),
  test_name: text('test_name').notNull(),
  sample_event_payload: jsonb('sample_event_payload').notNull(),
  expected_journal_lines: jsonb('expected_journal_lines').notNull(),
  is_rejection_case: boolean('is_rejection_case').default(false).notNull(),
  expected_error: text('expected_error'),
  ...auditFields,
});

// ============================================================================
// Enterprise GL — Ledger Core Tables
// ============================================================================

/** Business Event — raw event from source systems */
export const glBusinessEvents = pgTable('gl_business_events', {
  id: serial('id').primaryKey(),
  source_system: text('source_system').notNull(),
  source_reference: text('source_reference').notNull(),
  idempotency_key: text('idempotency_key').unique().notNull(),
  event_code: text('event_code').notNull(),
  event_payload: jsonb('event_payload').notNull(),
  event_hash: text('event_hash').notNull(),
  business_date: date('business_date').notNull(),
  event_time: timestamp('event_time', { withTimezone: true }).defaultNow().notNull(),
  processed: boolean('processed').default(false).notNull(),
  ...auditFields,
});

/** Accounting Intent — event matched to rule/criteria */
export const glAccountingIntents = pgTable('gl_accounting_intents', {
  id: serial('id').primaryKey(),
  event_id: integer('event_id').references(() => glBusinessEvents.id).notNull(),
  event_code: text('event_code').notNull(),
  criteria_id: integer('criteria_id').references(() => glCriteriaDefinitions.id),
  rule_set_id: integer('rule_set_id').references(() => glAccountingRuleSets.id),
  rule_version: integer('rule_version'),
  intent_status: text('intent_status').notNull().default('PENDING'), // PENDING, RESOLVED, POSTED, FAILED
  error_message: text('error_message'),
  ...auditFields,
});

/** Journal Batch — batch header for posted entries */
export const glJournalBatches = pgTable('gl_journal_batches', {
  id: serial('id').primaryKey(),
  batch_ref: text('batch_ref').unique().notNull(),
  source_system: text('source_system').notNull(),
  source_event_id: integer('source_event_id').references(() => glBusinessEvents.id),
  event_code: text('event_code'),
  rule_version: text('rule_version'),
  posting_mode: postingModeEnum('posting_mode').notNull(),
  accounting_unit_id: integer('accounting_unit_id').references(() => accountingUnits.id).notNull(),
  transaction_date: date('transaction_date').notNull(),
  value_date: date('value_date').notNull(),
  posting_date: timestamp('posting_date', { withTimezone: true }),
  batch_status: journalBatchStatusEnum('batch_status').notNull().default('DRAFT'),
  total_debit: numeric('total_debit').notNull().default('0'),
  total_credit: numeric('total_credit').notNull().default('0'),
  line_count: integer('line_count').notNull().default(0),
  narration: text('narration'),
  fund_id: integer('fund_id').references(() => fundMaster.id),
  financial_year: text('financial_year'),
  financial_period: text('financial_period'),
  maker_id: integer('maker_id').references(() => users.id),
  checker_id: integer('checker_id').references(() => users.id),
  authorized_at: timestamp('authorized_at', { withTimezone: true }),
  rejection_reason: text('rejection_reason'),
  ...auditFields,
});

/** Journal Line — individual debit/credit entry */
export const glJournalLines = pgTable('gl_journal_lines', {
  id: serial('id').primaryKey(),
  batch_id: integer('batch_id').references(() => glJournalBatches.id).notNull(),
  line_no: integer('line_no').notNull(),
  dr_cr: drCrEnum('dr_cr').notNull(),
  gl_head_id: integer('gl_head_id').references(() => glHeads.id).notNull(),
  gl_access_code: text('gl_access_code'),
  amount: numeric('amount').notNull(),
  currency: text('currency').notNull().default('PHP'),
  conversion_rate: numeric('conversion_rate'),
  base_currency: text('base_currency').notNull().default('PHP'),
  base_amount: numeric('base_amount').notNull(),
  fund_id: integer('fund_id').references(() => fundMaster.id),
  portfolio_id: integer('portfolio_id').references(() => glPortfolioMaster.id),
  account_number: text('account_number'),
  contract_number: text('contract_number'),
  security_id: integer('security_id').references(() => securities.id),
  counterparty_id: integer('counterparty_id').references(() => glCounterpartyMaster.id),
  holding_classification: holdingClassificationEnum('holding_classification'),
  product_class: text('product_class'),
  frpti_code: text('frpti_code'),
  frpti_contractual_rel: frptiContractualRelEnum('frpti_contractual_rel'),
  frpti_book: frptiBookEnum('frpti_book'),
  accounting_standard: accountingStandardEnum('accounting_standard'),
  narration: text('narration'),
  transaction_code: text('transaction_code'),
  ...auditFields,
});

/** Authorization Task — maker/checker workflow for GL operations */
export const glAuthorizationTasks = pgTable('gl_authorization_tasks', {
  id: serial('id').primaryKey(),
  object_type: text('object_type').notNull(), // JOURNAL_BATCH, GL_HEAD, RULE_SET, REVERSAL, etc.
  object_id: integer('object_id').notNull(),
  action: text('action').notNull(), // CREATE, MODIFY, CANCEL, REVERSE, YEAR_END
  maker_id: integer('maker_id').references(() => users.id).notNull(),
  checker_id: integer('checker_id').references(() => users.id),
  auth_status: text('auth_status').notNull().default('PENDING'), // PENDING, APPROVED, REJECTED
  reason: text('reason'),
  maker_timestamp: timestamp('maker_timestamp', { withTimezone: true }).defaultNow().notNull(),
  checker_timestamp: timestamp('checker_timestamp', { withTimezone: true }),
  ...auditFields,
});

/** Authorization Matrix — configurable approval levels by entity/action/amount */
export const glAuthorizationMatrix = pgTable('gl_authorization_matrix', {
  id: serial('id').primaryKey(),
  entity_type: text('entity_type').notNull(), // JOURNAL_BATCH, GL_HEAD, RULE_SET, REVERSAL, YEAR_END
  action: text('action').notNull(), // CREATE, MODIFY, CANCEL, REVERSE, CLOSE
  amount_from: numeric('amount_from').default('0'),
  amount_to: numeric('amount_to'),
  required_approvers: integer('required_approvers').notNull().default(1),
  approval_level: text('approval_level').notNull().default('STANDARD'), // STANDARD, SENIOR, EXECUTIVE
  role_required: text('role_required'), // e.g. 'GL_SUPERVISOR', 'GL_MANAGER'
  is_active: boolean('is_active').notNull().default(true),
  ...auditFields,
});

/** Authorization Audit Log — immutable log of all authorization decisions */
export const glAuthorizationAuditLog = pgTable('gl_authorization_audit_log', {
  id: serial('id').primaryKey(),
  auth_task_id: integer('auth_task_id').references(() => glAuthorizationTasks.id),
  object_type: text('object_type').notNull(),
  object_id: integer('object_id').notNull(),
  action: text('action').notNull(),
  actor_id: integer('actor_id').references(() => users.id).notNull(),
  decision: text('decision').notNull(), // SUBMITTED, APPROVED, REJECTED, DELEGATED
  reason: text('reason'),
  amount: numeric('amount'),
  approval_level: text('approval_level'),
  timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
  ...auditFields,
});

/** Interest Accrual Schedules — defines how interest is accrued for securities */
export const glInterestAccrualSchedules = pgTable('gl_interest_accrual_schedules', {
  id: serial('id').primaryKey(),
  portfolio_id: integer('portfolio_id').references(() => glPortfolioMaster.id),
  security_id: integer('security_id').references(() => securities.id),
  fund_id: integer('fund_id').references(() => fundMaster.id),
  accrual_type: text('accrual_type').notNull().default('COUPON'), // COUPON, DISCOUNT, PREMIUM
  day_count_convention: text('day_count_convention').notNull().default('ACT/360'), // ACT/360, ACT/365, 30/360
  coupon_rate: numeric('coupon_rate').notNull(),
  face_value: numeric('face_value').notNull(),
  accrual_frequency: text('accrual_frequency').notNull().default('DAILY'), // DAILY, MONTHLY
  accrual_gl_dr: integer('accrual_gl_dr').references(() => glHeads.id).notNull(),
  accrual_gl_cr: integer('accrual_gl_cr').references(() => glHeads.id).notNull(),
  income_gl: integer('income_gl').references(() => glHeads.id),
  effective_from: date('effective_from').notNull(),
  effective_to: date('effective_to'),
  auto_reverse: boolean('auto_reverse').notNull().default(false),
  is_active: boolean('is_active').notNull().default(true),
  ...auditFields,
});

/** Amortization Schedules — premium/discount amortization for securities */
export const glAmortizationSchedules = pgTable('gl_amortization_schedules', {
  id: serial('id').primaryKey(),
  portfolio_id: integer('portfolio_id').references(() => glPortfolioMaster.id),
  security_id: integer('security_id').references(() => securities.id),
  fund_id: integer('fund_id').references(() => fundMaster.id),
  amortization_method: text('amortization_method').notNull().default('STRAIGHT_LINE'), // STRAIGHT_LINE, EFFECTIVE_INTEREST
  purchase_price: numeric('purchase_price').notNull(),
  par_value: numeric('par_value').notNull(),
  premium_discount: numeric('premium_discount').notNull(),
  total_periods: integer('total_periods').notNull(),
  periods_elapsed: integer('periods_elapsed').notNull().default(0),
  amortized_amount: numeric('amortized_amount').notNull().default('0'),
  remaining_amount: numeric('remaining_amount').notNull(),
  amortization_gl_dr: integer('amortization_gl_dr').references(() => glHeads.id).notNull(),
  amortization_gl_cr: integer('amortization_gl_cr').references(() => glHeads.id).notNull(),
  maturity_date: date('maturity_date').notNull(),
  is_active: boolean('is_active').notNull().default(true),
  ...auditFields,
});

/** Report Definitions — user-configurable report templates */
export const glReportDefinitions = pgTable('gl_report_definitions', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  columns: jsonb('columns').notNull(), // [{field, header, width}]
  filters: jsonb('filters'), // [{field, operator, value}]
  group_by: jsonb('group_by'), // [field1, field2]
  sort_order: jsonb('sort_order'), // [{field, direction}]
  owner_user_id: integer('owner_user_id').references(() => users.id),
  ...auditFields,
});

/** Report Schedules — automated report execution */
export const glReportSchedules = pgTable('gl_report_schedules', {
  id: serial('id').primaryKey(),
  report_definition_id: integer('report_definition_id').references(() => glReportDefinitions.id).notNull(),
  schedule_name: text('schedule_name').notNull(),
  frequency: text('frequency').notNull().default('DAILY'), // DAILY, WEEKLY, MONTHLY, QUARTERLY
  next_run_date: date('next_run_date'),
  last_run_date: date('last_run_date'),
  last_run_status: text('last_run_status'),
  output_format: text('output_format').notNull().default('JSON'), // JSON, CSV, PDF
  recipients: jsonb('recipients'), // [{email, name}]
  is_active: boolean('is_active').notNull().default(true),
  owner_user_id: integer('owner_user_id').references(() => users.id),
  ...auditFields,
});

/** Reversal Link — tracks original-to-reversal/cancellation relationships */
export const glReversalLinks = pgTable('gl_reversal_links', {
  id: serial('id').primaryKey(),
  original_batch_id: integer('original_batch_id').references(() => glJournalBatches.id).notNull(),
  reversal_batch_id: integer('reversal_batch_id').references(() => glJournalBatches.id).notNull(),
  reversal_type: text('reversal_type').notNull(), // CANCELLATION, REVERSAL, ADJUSTMENT
  reversal_reason: text('reversal_reason').notNull(),
  approved_by: integer('approved_by').references(() => users.id),
  approved_at: timestamp('approved_at', { withTimezone: true }),
  ...auditFields,
});

/** Ledger Balance — current balance by dimension set */
export const glLedgerBalances = pgTable('gl_ledger_balances', {
  id: serial('id').primaryKey(),
  gl_head_id: integer('gl_head_id').references(() => glHeads.id).notNull(),
  gl_access_code: text('gl_access_code'),
  accounting_unit_id: integer('accounting_unit_id').references(() => accountingUnits.id).notNull(),
  fund_id: integer('fund_id').references(() => fundMaster.id),
  portfolio_id: integer('portfolio_id').references(() => glPortfolioMaster.id),
  account_number: text('account_number'),
  contract_number: text('contract_number'),
  security_id: integer('security_id'),
  counterparty_id: integer('counterparty_id'),
  currency: text('currency').notNull().default('PHP'),
  accounting_standard: accountingStandardEnum('accounting_standard'),
  balance_date: date('balance_date').notNull(),
  opening_balance: numeric('opening_balance').notNull().default('0'),
  debit_turnover: numeric('debit_turnover').notNull().default('0'),
  credit_turnover: numeric('credit_turnover').notNull().default('0'),
  closing_balance: numeric('closing_balance').notNull().default('0'),
  fcy_balance: numeric('fcy_balance'),
  base_amount: numeric('base_amount'),
  revaluation_amount: numeric('revaluation_amount'),
  last_posting_ref: text('last_posting_ref'),
  ...auditFields,
});

/** Balance Snapshot — daily/period snapshots for reporting */
export const glBalanceSnapshots = pgTable('gl_balance_snapshots', {
  id: serial('id').primaryKey(),
  snapshot_date: date('snapshot_date').notNull(),
  snapshot_type: text('snapshot_type').notNull().default('DAILY'), // DAILY, MONTH_END, QUARTER_END, YEAR_END
  gl_head_id: integer('gl_head_id').references(() => glHeads.id).notNull(),
  gl_access_code: text('gl_access_code'),
  accounting_unit_id: integer('accounting_unit_id').references(() => accountingUnits.id).notNull(),
  fund_id: integer('fund_id').references(() => fundMaster.id),
  portfolio_id: integer('portfolio_id').references(() => glPortfolioMaster.id),
  currency: text('currency').notNull().default('PHP'),
  opening_balance: numeric('opening_balance').notNull().default('0'),
  debit_turnover: numeric('debit_turnover').notNull().default('0'),
  credit_turnover: numeric('credit_turnover').notNull().default('0'),
  closing_balance: numeric('closing_balance').notNull().default('0'),
  fcy_balance: numeric('fcy_balance'),
  base_amount: numeric('base_amount'),
  ...auditFields,
});

/** Posting Exception — error and exception queue */
export const glPostingExceptions = pgTable('gl_posting_exceptions', {
  id: serial('id').primaryKey(),
  event_id: integer('event_id').references(() => glBusinessEvents.id),
  batch_id: integer('batch_id').references(() => glJournalBatches.id),
  source_system: text('source_system'),
  exception_category: postingExceptionCatEnum('exception_category').notNull(),
  error_message: text('error_message').notNull(),
  business_date: date('business_date'),
  assigned_to: integer('assigned_to').references(() => users.id),
  retry_eligible: boolean('retry_eligible').default(true).notNull(),
  resolved: boolean('resolved').default(false).notNull(),
  resolved_at: timestamp('resolved_at', { withTimezone: true }),
  resolved_by: integer('resolved_by').references(() => users.id),
  related_object_type: text('related_object_type'),
  related_object_id: integer('related_object_id'),
  ...auditFields,
});

/** GL Audit Log — immutable audit events for GL operations */
export const glAuditLog = pgTable('gl_audit_log', {
  id: serial('id').primaryKey(),
  action: text('action').notNull(),
  object_type: text('object_type').notNull(),
  object_id: integer('object_id').notNull(),
  user_id: integer('user_id').references(() => users.id),
  timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
  old_values: jsonb('old_values'),
  new_values: jsonb('new_values'),
  source_payload_hash: text('source_payload_hash'),
  rule_version: text('rule_version'),
  ip_address: text('ip_address'),
  ...auditFields,
});

// ============================================================================
// Enterprise GL — NAV Processing Tables
// ============================================================================

/** NAV Computation — tracks draft and final NAV calculations */
export const glNavComputations = pgTable('gl_nav_computations', {
  id: serial('id').primaryKey(),
  fund_id: integer('fund_id').references(() => fundMaster.id).notNull(),
  nav_date: date('nav_date').notNull(),
  nav_status: navStatusEnum('nav_status').notNull().default('DRAFT'),
  previous_nav_date: date('previous_nav_date'),
  next_nav_date: date('next_nav_date'),
  outstanding_units: numeric('outstanding_units'),
  total_assets: numeric('total_assets'),
  total_liabilities: numeric('total_liabilities'),
  gross_nav: numeric('gross_nav'),
  total_fees: numeric('total_fees'),
  total_taxes: numeric('total_taxes'),
  net_nav: numeric('net_nav'),
  navpu: numeric('navpu'),
  accrued_income: numeric('accrued_income'),
  accrued_expenses: numeric('accrued_expenses'),
  market_value: numeric('market_value'),
  book_value: numeric('book_value'),
  unrealized_gain_loss: numeric('unrealized_gain_loss'),
  journal_batch_id: integer('journal_batch_id').references(() => glJournalBatches.id),
  finalized_by: integer('finalized_by').references(() => users.id),
  finalized_at: timestamp('finalized_at', { withTimezone: true }),
  reversal_of_id: integer('reversal_of_id'),
  ...auditFields,
});

/** Portfolio Classification — security classification within fund */
export const glPortfolioClassifications = pgTable('gl_portfolio_classifications', {
  id: serial('id').primaryKey(),
  fund_id: integer('fund_id').references(() => fundMaster.id).notNull(),
  security_id: integer('security_id').references(() => securities.id).notNull(),
  classification: holdingClassificationEnum('classification').notNull(),
  effective_from: date('effective_from').notNull(),
  effective_to: date('effective_to'),
  ...auditFields,
}, (table) => [
  uniqueIndex('portfolio_class_unique_idx').on(table.fund_id, table.security_id),
]);

// ============================================================================
// Enterprise GL — Year-End & Period Control Tables
// ============================================================================

/** Financial Year — defines financial year and period boundaries */
export const glFinancialYears = pgTable('gl_financial_years', {
  id: serial('id').primaryKey(),
  year_code: text('year_code').unique().notNull(),
  start_date: date('start_date').notNull(),
  end_date: date('end_date').notNull(),
  is_closed: boolean('is_closed').default(false).notNull(),
  closed_at: timestamp('closed_at', { withTimezone: true }),
  closed_by: integer('closed_by').references(() => users.id),
  year_end_status: yearEndStatusEnum('year_end_status'),
  year_end_batch_id: integer('year_end_batch_id').references(() => glJournalBatches.id),
  income_transfer_gl_id: integer('income_transfer_gl_id').references(() => glHeads.id),
  expense_transfer_gl_id: integer('expense_transfer_gl_id').references(() => glHeads.id),
  retained_earnings_gl_id: integer('retained_earnings_gl_id').references(() => glHeads.id),
  year_end_txn_code: text('year_end_txn_code'),
  ...auditFields,
});

/** Financial Period — month/quarter periods within a financial year */
export const glFinancialPeriods = pgTable('gl_financial_periods', {
  id: serial('id').primaryKey(),
  year_id: integer('year_id').references(() => glFinancialYears.id).notNull(),
  period_code: text('period_code').notNull(), // 2026-01, 2026-Q1, etc.
  period_type: text('period_type').notNull(), // MONTHLY, QUARTERLY
  start_date: date('start_date').notNull(),
  end_date: date('end_date').notNull(),
  is_closed: boolean('is_closed').default(false).notNull(),
  closed_at: timestamp('closed_at', { withTimezone: true }),
  closed_by: integer('closed_by').references(() => users.id),
  ...auditFields,
});

// ============================================================================
// Enterprise GL — FRPTI Data Mart Tables
// ============================================================================

/** FRPTI Extract — quarterly FRPTI reporting data */
export const glFrptiExtracts = pgTable('gl_frpti_extracts', {
  id: serial('id').primaryKey(),
  reporting_period: text('reporting_period').notNull(), // 2026-Q1
  reporting_date: date('reporting_date').notNull(),
  frpti_book: frptiBookEnum('frpti_book').notNull().default('RBU'),
  frpti_schedule: text('frpti_schedule').notNull(),
  frpti_report_line: text('frpti_report_line').notNull(),
  contractual_relationship: frptiContractualRelEnum('contractual_relationship'),
  resident_status: frptiResidentStatusEnum('resident_status'),
  sector: text('sector'),
  currency: text('currency').notNull().default('PHP'),
  amount: numeric('amount').notNull().default('0'),
  count: integer('count'),
  functional_currency: text('functional_currency'),
  presentation_currency: text('presentation_currency').default('PHP'),
  is_validated: boolean('is_validated').default(false).notNull(),
  validation_errors: jsonb('validation_errors'),
  ...auditFields,
});

/** FX Revaluation Run — tracks daily revaluation processing */
export const glFxRevaluationRuns = pgTable('gl_fx_revaluation_runs', {
  id: serial('id').primaryKey(),
  business_date: date('business_date').notNull(),
  run_status: text('run_status').notNull().default('PENDING'), // PENDING, IN_PROGRESS, COMPLETED, FAILED
  total_gls_processed: integer('total_gls_processed').default(0),
  total_gain: numeric('total_gain').default('0'),
  total_loss: numeric('total_loss').default('0'),
  journal_batch_id: integer('journal_batch_id').references(() => glJournalBatches.id),
  started_at: timestamp('started_at', { withTimezone: true }),
  completed_at: timestamp('completed_at', { withTimezone: true }),
  run_by: integer('run_by').references(() => users.id),
  ...auditFields,
});

/** FX Revaluation Detail — per-GL revaluation results */
export const glFxRevaluationDetails = pgTable('gl_fx_revaluation_details', {
  id: serial('id').primaryKey(),
  run_id: integer('run_id').references(() => glFxRevaluationRuns.id).notNull(),
  gl_head_id: integer('gl_head_id').references(() => glHeads.id).notNull(),
  currency: text('currency').notNull(),
  fcy_balance: numeric('fcy_balance').notNull(),
  old_base_equivalent: numeric('old_base_equivalent').notNull(),
  closing_mid_rate: numeric('closing_mid_rate').notNull(),
  new_base_equivalent: numeric('new_base_equivalent').notNull(),
  revaluation_amount: numeric('revaluation_amount').notNull(),
  direction: glRevalDirectionEnum('direction').notNull(),
  posted_to_gl: text('posted_to_gl'),
  ...auditFields,
});

// ============================================================================
// Enterprise GL — Relations
// ============================================================================

export const glHeadsRelations = relations(glHeads, ({ one, many }) => ({
  category: one(glCategories, {
    fields: [glHeads.category_id],
    references: [glCategories.id],
  }),
  hierarchy: one(glHierarchy, {
    fields: [glHeads.hierarchy_id],
    references: [glHierarchy.id],
  }),
  accessCodes: many(glAccessCodes),
  journalLines: many(glJournalLines),
  balances: many(glLedgerBalances),
}));

export const glAccessCodesRelations = relations(glAccessCodes, ({ one }) => ({
  glHead: one(glHeads, {
    fields: [glAccessCodes.gl_head_id],
    references: [glHeads.id],
  }),
}));

export const glJournalBatchesRelations = relations(glJournalBatches, ({ one, many }) => ({
  accountingUnit: one(accountingUnits, {
    fields: [glJournalBatches.accounting_unit_id],
    references: [accountingUnits.id],
  }),
  fund: one(fundMaster, {
    fields: [glJournalBatches.fund_id],
    references: [fundMaster.id],
  }),
  sourceEvent: one(glBusinessEvents, {
    fields: [glJournalBatches.source_event_id],
    references: [glBusinessEvents.id],
  }),
  maker: one(users, {
    fields: [glJournalBatches.maker_id],
    references: [users.id],
    relationName: 'batchMaker',
  }),
  checker: one(users, {
    fields: [glJournalBatches.checker_id],
    references: [users.id],
    relationName: 'batchChecker',
  }),
  lines: many(glJournalLines),
}));

export const glJournalLinesRelations = relations(glJournalLines, ({ one }) => ({
  batch: one(glJournalBatches, {
    fields: [glJournalLines.batch_id],
    references: [glJournalBatches.id],
  }),
  glHead: one(glHeads, {
    fields: [glJournalLines.gl_head_id],
    references: [glHeads.id],
  }),
  fund: one(fundMaster, {
    fields: [glJournalLines.fund_id],
    references: [fundMaster.id],
  }),
  portfolio: one(glPortfolioMaster, {
    fields: [glJournalLines.portfolio_id],
    references: [glPortfolioMaster.id],
  }),
  security: one(securities, {
    fields: [glJournalLines.security_id],
    references: [securities.id],
  }),
  counterparty: one(glCounterpartyMaster, {
    fields: [glJournalLines.counterparty_id],
    references: [glCounterpartyMaster.id],
  }),
}));

export const glCriteriaRelations = relations(glCriteriaDefinitions, ({ one, many }) => ({
  event: one(glEventDefinitions, {
    fields: [glCriteriaDefinitions.event_id],
    references: [glEventDefinitions.id],
  }),
  conditions: many(glCriteriaConditions),
  ruleSets: many(glAccountingRuleSets),
}));

export const glAccountingRuleSetsRelations = relations(glAccountingRuleSets, ({ one, many }) => ({
  criteria: one(glCriteriaDefinitions, {
    fields: [glAccountingRuleSets.criteria_id],
    references: [glCriteriaDefinitions.id],
  }),
  entryDefinitions: many(glAccountingEntryDefinitions),
  testCases: many(glRuleTestCases),
}));

export const fundMasterRelations = relations(fundMaster, ({ one, many }) => ({
  accountingUnit: one(accountingUnits, {
    fields: [fundMaster.accounting_unit_id],
    references: [accountingUnits.id],
  }),
  navComputations: many(glNavComputations),
  portfolioClassifications: many(glPortfolioClassifications),
}));

export const glNavComputationsRelations = relations(glNavComputations, ({ one }) => ({
  fund: one(fundMaster, {
    fields: [glNavComputations.fund_id],
    references: [fundMaster.id],
  }),
  journalBatch: one(glJournalBatches, {
    fields: [glNavComputations.journal_batch_id],
    references: [glJournalBatches.id],
  }),
}));

// ============================================================================
// CRM Campaign Management Module — Enums
// ============================================================================

export const campaignTypeEnum = pgEnum('campaign_type', [
  'PRODUCT_LAUNCH', 'EVENT_INVITATION', 'EDUCATIONAL', 'REFERRAL',
  'CROSS_SELL', 'UP_SELL', 'RETENTION', 'RE_ENGAGEMENT', 'SEASONAL',
]);

export const campaignStatusEnum = pgEnum('campaign_status', [
  'DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'ACTIVE', 'COMPLETED', 'CLOSED', 'REJECTED', 'ARCHIVED',
]);

export const leadStatusEnum = pgEnum('lead_status', [
  'NEW', 'CONTACTED', 'QUALIFIED', 'CLIENT_ACCEPTED', 'CONVERTED',
  'NOT_INTERESTED', 'DO_NOT_CONTACT', 'DROPPED',
]);

export const leadSourceEnum = pgEnum('lead_source', [
  'CAMPAIGN', 'MANUAL', 'UPLOAD', 'REFERRAL', 'WALK_IN', 'WEBSITE',
]);

export const entityTypeEnum = pgEnum('crm_entity_type', ['INDIVIDUAL', 'NON_INDIVIDUAL']);

export const listSourceEnum = pgEnum('list_source', ['RULE_BASED', 'UPLOADED', 'MANUAL', 'MERGE']);

export const responseTypeEnum = pgEnum('response_type', [
  'INTERESTED', 'NOT_INTERESTED', 'NEED_MORE_INFO', 'CONVERTED', 'OTHER',
  'MAYBE', 'NO_RESPONSE', 'CALLBACK_REQUESTED',
]);

export const commChannelEnum = pgEnum('comm_channel', ['EMAIL', 'SMS', 'PUSH_NOTIFICATION']);

export const dispatchStatusEnum = pgEnum('dispatch_status', [
  'PENDING', 'QUEUED', 'DISPATCHING', 'COMPLETED', 'FAILED',
]);

export const prospectStatusEnum = pgEnum('prospect_status', [
  'ACTIVE', 'DROPPED', 'REACTIVATED', 'RECOMMENDED', 'CONVERTED',
]);

export const meetingModeEnum = pgEnum('meeting_mode', [
  'IN_PERSON', 'PHONE', 'VIDEO', 'BRANCH_VISIT',
  // BRD-required modes
  'FACE_TO_FACE', 'IN_PERSON_OFFSHORE', 'TELEPHONE', 'TELEPHONE_OFFSHORE',
  'VIDEO_CONFERENCE', 'VIDEO_CONFERENCE_OFFSHORE', 'OTHERS',
]);

export const meetingTypeEnum = pgEnum('meeting_type', [
  'CAMPAIGN_FOLLOW_UP', 'PRODUCT_PRESENTATION', 'SERVICE_REVIEW',
  'RELATIONSHIP_BUILDING', 'GENERAL',
  // BRD-required types (CIM)
  'CIF', 'LEAD', 'PROSPECT', 'OTHERS',
]);

export const meetingPurposeEnum = pgEnum('meeting_purpose', [
  'CAMPAIGN_FOLLOW_UP', 'SERVICE_REQUEST', 'GENERAL', 'REVIEW',
  'INITIAL_MEETING', 'PORTFOLIO_REVIEW', 'PRODUCT_PRESENTATION',
  'RELATIONSHIP_CHECK_IN', 'COMPLAINT_RESOLUTION', 'ONBOARDING', 'OTHER',
]);

export const meetingStatusEnum = pgEnum('meeting_status', [
  'SCHEDULED', 'COMPLETED', 'CANCELLED', 'RESCHEDULED', 'NO_SHOW',
]);

export const rsvpStatusEnum = pgEnum('rsvp_status', [
  'PENDING', 'ACCEPTED', 'DECLINED', 'TENTATIVE',
]);

export const callReportStatusEnum = pgEnum('call_report_status', [
  'DRAFT', 'SUBMITTED', 'APPROVED', 'RETURNED', 'PENDING_APPROVAL',
  // BRD-required statuses
  'UNDER_REVIEW', 'REJECTED', 'LATE_FILED', 'CANCELLED',
]);

export const callReportTypeEnum = pgEnum('call_report_type', ['SCHEDULED', 'STANDALONE']);

export const actionItemStatusEnum = pgEnum('action_item_status', [
  'OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED',
]);

export const meetingReasonEnum = pgEnum('meeting_reason', [
  'INITIAL_MEETING', 'PORTFOLIO_REVIEW', 'PRODUCT_PRESENTATION',
  'RELATIONSHIP_CHECK_IN', 'COMPLAINT_RESOLUTION', 'ONBOARDING',
  'REGULATORY', 'OTHER',
  // BRD-required reasons (CIM)
  'CLIENT_CALL_NEW', 'CLIENT_CALL_EXISTING', 'BRANCH_VISIT',
  'SERVICE_REQUEST', 'CAMPAIGN_DETAILS', 'OTHERS',
]);

export const crApprovalActionEnum = pgEnum('cr_approval_action', [
  'PENDING', 'CLAIMED', 'APPROVED', 'REJECTED',
]);

export const conversationTypeEnum = pgEnum('conversation_type', [
  'MEETING_SCHEDULED', 'MEETING_COMPLETED', 'MEETING_CANCELLED',
  'MEETING_RESCHEDULED', 'CALL_REPORT_FILED', 'CALL_REPORT_APPROVED',
  'CALL_REPORT_REJECTED', 'ACTION_ITEM_COMPLETED', 'FEEDBACK_ADDED',
]);

export const handoverTypeEnum = pgEnum('handover_type', ['PERMANENT', 'TEMPORARY']);

export const consentTypeEnum = pgEnum('campaign_consent_type', [
  'MARKETING_EMAIL', 'MARKETING_SMS', 'EVENT_INVITATION', 'PUSH_NOTIFICATION',
]);

export const consentStatusEnum = pgEnum('consent_status_type', [
  'OPTED_IN', 'OPTED_OUT', 'NOT_REQUESTED',
]);

export const consentSourceEnum = pgEnum('consent_source', [
  'PORTAL_SELF_SERVICE', 'RM_ON_BEHALF', 'SYSTEM_DEFAULT', 'UNSUBSCRIBE_LINK', 'ONBOARDING',
]);

export const listGenJobStatusEnum = pgEnum('list_gen_job_status', [
  'PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'TIMEOUT',
]);

export const campaignChannelEnum = pgEnum('campaign_channel', ['EMAIL', 'SMS', 'MIXED']);

export const dedupeStopTypeEnum = pgEnum('dedupe_stop_type', ['SOFT_STOP', 'HARD_STOP']);

export const negativeListTypeEnum = pgEnum('negative_list_type', ['NEGATIVE', 'BLACKLIST', 'SANCTIONS', 'PEP']);

export const rmChangeTypeEnum = pgEnum('rm_change_type', [
  'INITIAL_ASSIGNMENT', 'HANDOVER', 'DELEGATION', 'DELEGATION_RETURN',
]);

export const uploadTypeEnum = pgEnum('upload_type', ['LEAD_LIST', 'PROSPECT', 'NEGATIVE_LIST']);

export const opportunityStageEnum = pgEnum('opportunity_stage', [
  'IDENTIFIED', 'QUALIFYING', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST', 'EXPIRED',
]);

export const taskStatusEnum = pgEnum('crm_task_status', [
  'PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED',
]);

export const taskPriorityEnum = pgEnum('crm_task_priority', [
  'LOW', 'MEDIUM', 'HIGH', 'CRITICAL',
]);

export const notificationTypeEnum = pgEnum('crm_notification_type', [
  'MEETING_REMINDER', 'TASK_DUE', 'TASK_ASSIGNED', 'CALL_REPORT_RETURNED',
  'HANDOVER_PENDING', 'SLA_BREACH', 'CAMPAIGN_APPROVED', 'LEAD_ASSIGNED',
]);

// ============================================================================
// CRM Campaign Management Module — Tables
// ============================================================================

// 1. campaigns
export const campaigns = pgTable('campaigns', {
  id: serial('id').primaryKey(),
  campaign_code: text('campaign_code').unique().notNull(),
  name: text('name').notNull(),
  description: text('description'),
  campaign_type: campaignTypeEnum('campaign_type').notNull().default('PRODUCT_LAUNCH'),
  campaign_status: campaignStatusEnum('campaign_status').notNull().default('DRAFT'),
  target_product_id: integer('target_product_id'),
  event_name: text('event_name'),
  event_date: timestamp('event_date', { withTimezone: true }),
  event_venue: text('event_venue'),
  budget_amount: numeric('budget_amount').default('0'),
  budget_currency: text('budget_currency').default('PHP'),
  actual_spend: numeric('actual_spend').default('0'),
  start_date: date('start_date').notNull(),
  end_date: date('end_date').notNull(),
  brochure_url: text('brochure_url'),
  channel: campaignChannelEnum('channel'),
  campaign_manager_id: integer('campaign_manager_id').references(() => users.id),
  advertisement_cost: numeric('advertisement_cost').default('0'),
  campaign_cost: numeric('campaign_cost').default('0'),
  email_subject: text('email_subject'),
  email_body: text('email_body'),
  email_signature: text('email_signature'),
  sms_content: text('sms_content'),
  brochure_paths: jsonb('brochure_paths').default('[]'),
  owner_user_id: integer('owner_user_id').references(() => users.id),
  approved_by: integer('approved_by').references(() => users.id),
  approved_at: timestamp('approved_at', { withTimezone: true }),
  rejection_reason: text('rejection_reason'),
  deleted_at: timestamp('deleted_at', { withTimezone: true }),
  ...auditFields,
});

// 2. lead_lists
export const leadLists = pgTable('lead_lists', {
  id: serial('id').primaryKey(),
  list_code: text('list_code').unique().notNull(),
  name: text('name').notNull(),
  description: text('description'),
  source_type: listSourceEnum('source_type').notNull(),
  source_rule_id: integer('source_rule_id'),
  rule_definition: jsonb('rule_definition'),
  total_count: integer('total_count').default(0).notNull(),
  is_active: boolean('is_active').default(true).notNull(),
  ...auditFields,
});

// 3. leads
export const leads = pgTable('leads', {
  id: serial('id').primaryKey(),
  lead_code: text('lead_code').unique().notNull(),
  entity_type: entityTypeEnum('entity_type').notNull().default('INDIVIDUAL'),
  salutation: text('salutation'),
  first_name: text('first_name').notNull(),
  middle_name: text('middle_name'),
  last_name: text('last_name').notNull(),
  short_name: text('short_name'),
  entity_name: text('entity_name'),
  company_name: text('company_name'),
  date_of_birth: date('date_of_birth'),
  gender: text('gender'),
  nationality: text('nationality'),
  country_of_residence: text('country_of_residence'),
  marital_status: text('marital_status'),
  occupation: text('occupation'),
  industry: text('industry'),
  email: text('email'),
  mobile_phone: text('mobile_phone'),
  country_code: text('country_code'),
  primary_contact_no: text('primary_contact_no'),
  fixed_line_no: text('fixed_line_no'),
  source: leadSourceEnum('source').notNull(),
  source_campaign_id: integer('source_campaign_id').references(() => campaigns.id),
  lead_status: leadStatusEnum('lead_status').notNull().default('NEW'),
  assigned_rm_id: integer('assigned_rm_id').references(() => users.id),
  client_category: text('client_category'),
  total_aum: numeric('total_aum'),
  gross_monthly_income: numeric('gross_monthly_income'),
  estimated_aum: numeric('estimated_aum'),
  aum_currency: text('aum_currency').default('PHP'),
  trv: numeric('trv'),
  trv_currency: text('trv_currency').default('PHP'),
  risk_profile: riskProfileEnum('risk_profile'),
  risk_appetite: text('risk_appetite'),
  classification: text('classification'),
  politically_exposed: boolean('politically_exposed').default(false),
  product_interest: jsonb('product_interest').default('[]'),
  notes: text('notes'),
  dedup_hash: text('dedup_hash'),
  // G-033: Business Registration Number for Non-Individual entity types
  business_registration_number: text('business_registration_number'),
  referral_type: text('referral_type'),
  referral_id: text('referral_id'),
  branch_id: integer('branch_id'),
  existing_client_id: text('existing_client_id').references(() => clients.client_id),
  converted_prospect_id: integer('converted_prospect_id'),
  conversion_date: timestamp('conversion_date', { withTimezone: true }),
  drop_reason: text('drop_reason'),
  // G-028: PDPA/marketing consent captured at creation
  marketing_consent: boolean('marketing_consent').default(false).notNull(),
  marketing_consent_date: timestamp('marketing_consent_date', { withTimezone: true }),
  // HAM-GAP-008: Preferred language for communication (quick-filter support)
  preferred_language: text('preferred_language'),
  deleted_at: timestamp('deleted_at', { withTimezone: true }),
  ...auditFields,
});

// 4. lead_list_members (junction)
export const leadListMembers = pgTable('lead_list_members', {
  id: serial('id').primaryKey(),
  lead_list_id: integer('lead_list_id').references(() => leadLists.id).notNull(),
  lead_id: integer('lead_id').references(() => leads.id),
  external_name: text('external_name'),
  external_email: text('external_email'),
  external_phone: text('external_phone'),
  external_data: jsonb('external_data'),
  is_removed: boolean('is_removed').default(false).notNull(),
  added_at: timestamp('added_at', { withTimezone: true }).defaultNow().notNull(),
  added_by: text('added_by'),
});

// 5. campaign_lists (junction)
export const campaignLists = pgTable('campaign_lists', {
  id: serial('id').primaryKey(),
  campaign_id: integer('campaign_id').references(() => campaigns.id).notNull(),
  lead_list_id: integer('lead_list_id').references(() => leadLists.id).notNull(),
  assigned_at: timestamp('assigned_at', { withTimezone: true }).defaultNow().notNull(),
  assigned_by: text('assigned_by'),
});

// 6. campaign_responses
export const campaignResponses = pgTable('campaign_responses', {
  id: serial('id').primaryKey(),
  campaign_id: integer('campaign_id').references(() => campaigns.id).notNull(),
  lead_id: integer('lead_id').references(() => leads.id).notNull(),
  response_type: responseTypeEnum('response_type').notNull(),
  response_notes: text('response_notes'),
  response_date: timestamp('response_date', { withTimezone: true }).defaultNow().notNull(),
  response_channel: text('response_channel'),
  assigned_rm_id: integer('assigned_rm_id').references(() => users.id),
  follow_up_required: boolean('follow_up_required').default(false).notNull(),
  follow_up_date: date('follow_up_date'),
  follow_up_completed: boolean('follow_up_completed').default(false).notNull(),
  converted_prospect_id: integer('converted_prospect_id'),
  list_member_id: integer('list_member_id').references(() => leadListMembers.id),
  follow_up_action: text('follow_up_action'),
  ...auditFields,
}, (t) => ({
  // G-024: one active response per lead per campaign; soft-deleted rows are excluded so
  // a re-opened campaign or re-targeting doesn't violate the constraint.
  campaignLeadResponseUnique: uniqueIndex('campaign_lead_response_unique')
    .on(t.campaign_id, t.lead_id)
    .where(sql`is_deleted = false`),
}));

// 7. campaign_communications
export const campaignCommunications = pgTable('campaign_communications', {
  id: serial('id').primaryKey(),
  campaign_id: integer('campaign_id').references(() => campaigns.id).notNull(),
  channel: commChannelEnum('channel').notNull(),
  template_id: integer('template_id'),
  subject: text('subject'),
  body: text('body').notNull(),
  recipient_list_id: integer('recipient_list_id').references(() => leadLists.id),
  scheduled_at: timestamp('scheduled_at', { withTimezone: true }),
  dispatched_at: timestamp('dispatched_at', { withTimezone: true }),
  dispatch_status: dispatchStatusEnum('dispatch_status').notNull().default('PENDING'),
  total_recipients: integer('total_recipients').default(0).notNull(),
  delivered_count: integer('delivered_count').default(0).notNull(),
  bounced_count: integer('bounced_count').default(0).notNull(),
  attachment_urls: jsonb('attachment_urls').default('[]'),
  // G-018: Retry tracking for dispatch failures
  retry_count: integer('retry_count').default(0).notNull(),
  max_retries: integer('max_retries').default(3).notNull(),
  last_failure_reason: text('last_failure_reason'),
  ...auditFields,
});

// 8. prospects
export const prospects = pgTable('prospects', {
  id: serial('id').primaryKey(),
  prospect_code: text('prospect_code').unique().notNull(),
  lead_id: integer('lead_id').references(() => leads.id),
  entity_type: entityTypeEnum('entity_type').notNull().default('INDIVIDUAL'),
  salutation: text('salutation'),
  first_name: text('first_name').notNull(),
  middle_name: text('middle_name'),
  last_name: text('last_name').notNull(),
  date_of_birth: date('date_of_birth'),
  gender: text('gender'),
  nationality: text('nationality'),
  tax_id: text('tax_id'),
  email: text('email'),
  mobile_phone: text('mobile_phone'),
  office_phone: text('office_phone'),
  residential_address: jsonb('residential_address'),
  correspondence_address: jsonb('correspondence_address'),
  company_name: text('company_name'),
  designation: text('designation'),
  employer: text('employer'),
  annual_income: numeric('annual_income'),
  net_worth: numeric('net_worth'),
  total_aum: numeric('total_aum'),
  risk_profile: riskProfileEnum('risk_profile'),
  investment_horizon: text('investment_horizon'),
  product_interests: jsonb('product_interests').default('[]'),
  client_category: text('client_category'),
  family_members: jsonb('family_members'),
  lifestyle_interests: jsonb('lifestyle_interests').default('[]'),
  country_of_residence: text('country_of_residence'),
  marital_status: text('marital_status'),
  country_code: text('country_code'),
  primary_contact_no: text('primary_contact_no'),
  fixed_line_no: text('fixed_line_no'),
  gross_monthly_income: numeric('gross_monthly_income'),
  aum_currency: text('aum_currency').default('PHP'),
  trv: numeric('trv'),
  trv_currency: text('trv_currency').default('PHP'),
  risk_profile_comments: text('risk_profile_comments'),
  prospect_status: prospectStatusEnum('prospect_status').notNull().default('ACTIVE'),
  drop_reason: text('drop_reason'),
  drop_date: timestamp('drop_date', { withTimezone: true }),
  reactivation_date: timestamp('reactivation_date', { withTimezone: true }),
  ageing_days: integer('ageing_days').default(0),
  assigned_rm_id: integer('assigned_rm_id').references(() => users.id),
  negative_list_cleared: boolean('negative_list_cleared').default(false).notNull(),
  negative_list_checked_at: timestamp('negative_list_checked_at', { withTimezone: true }),
  source_campaign_id: integer('source_campaign_id').references(() => campaigns.id),
  source_lead_id: integer('source_lead_id').references(() => leads.id),
  days_since_creation: integer('days_since_creation').default(0),
  referral_type: text('referral_type'),
  referral_id: text('referral_id'),
  branch_id: integer('branch_id'),
  cif_number: text('cif_number'),
  converted_client_id: text('converted_client_id').references(() => clients.client_id),
  // G-028: PDPA/marketing consent captured at creation
  marketing_consent: boolean('marketing_consent').default(false).notNull(),
  marketing_consent_date: timestamp('marketing_consent_date', { withTimezone: true }),
  // HAM-GAP-008: Preferred language for communication (quick-filter support)
  preferred_language: text('preferred_language'),
  deleted_at: timestamp('deleted_at', { withTimezone: true }),
  ...auditFields,
});

// 9. meetings
export const meetings = pgTable('meetings', {
  id: serial('id').primaryKey(),
  meeting_code: text('meeting_code').unique().notNull(),
  title: text('title').notNull(),
  meeting_type: meetingTypeEnum('meeting_type').notNull(),
  mode: meetingModeEnum('mode'),
  purpose: meetingPurposeEnum('purpose'),
  campaign_id: integer('campaign_id').references(() => campaigns.id),
  lead_id: integer('lead_id').references(() => leads.id),
  prospect_id: integer('prospect_id').references(() => prospects.id),
  client_id: text('client_id').references(() => clients.client_id),
  related_entity_type: text('related_entity_type'),
  related_entity_id: integer('related_entity_id'),
  organizer_user_id: integer('organizer_user_id').references(() => users.id).notNull(),
  start_time: timestamp('start_time', { withTimezone: true }).notNull(),
  end_time: timestamp('end_time', { withTimezone: true }).notNull(),
  location: text('location'),
  meeting_status: meetingStatusEnum('meeting_status').notNull().default('SCHEDULED'),
  meeting_reason: meetingReasonEnum('meeting_reason'),
  meeting_reason_other: text('meeting_reason_other'),
  is_all_day: boolean('is_all_day').default(false).notNull(),
  relationship_name: text('relationship_name'),
  contact_phone: text('contact_phone'),
  contact_email: text('contact_email'),
  call_report_status: text('call_report_status'),
  branch_id: integer('branch_id'),
  completed_at: timestamp('completed_at', { withTimezone: true }),
  completed_by: integer('completed_by').references(() => users.id),
  reminder_minutes: integer('reminder_minutes').default(30),
  reminder_sent: boolean('reminder_sent').default(false).notNull(),
  // GAP-037: dual reminders — 24h before and 1h before (BRD AC-012-2)
  reminder_24h_sent: boolean('reminder_24h_sent').default(false).notNull(),
  reminder_1h_sent: boolean('reminder_1h_sent').default(false).notNull(),
  notes: text('notes'),
  cancel_reason: text('cancel_reason'),
  // AC-029: Reschedule creates a new meeting; old meeting is marked RESCHEDULED
  parent_meeting_id: integer('parent_meeting_id'),  // ID of the original meeting this was rescheduled from
  rescheduled_to_id: integer('rescheduled_to_id'),  // ID of the new meeting this was rescheduled into
  ...auditFields,
});

// 10. meeting_invitees
export const meetingInvitees = pgTable('meeting_invitees', {
  id: serial('id').primaryKey(),
  meeting_id: integer('meeting_id').references(() => meetings.id).notNull(),
  user_id: integer('user_id').references(() => users.id),
  lead_id: integer('lead_id').references(() => leads.id),
  prospect_id: integer('prospect_id').references(() => prospects.id),
  client_id: text('client_id').references(() => clients.client_id),
  rsvp_status: rsvpStatusEnum('rsvp_status').notNull().default('PENDING'),
  is_required: boolean('is_required').default(true).notNull(),
  attended: boolean('attended').default(false).notNull(),
  ...auditFields,
});

// 11. call_reports
export const callReports = pgTable('call_reports', {
  id: serial('id').primaryKey(),
  report_code: text('report_code').unique().notNull(),
  report_number: text('report_number'),
  report_type: callReportTypeEnum('report_type').default('STANDALONE'),
  meeting_id: integer('meeting_id').references(() => meetings.id),
  campaign_id: integer('campaign_id').references(() => campaigns.id),
  lead_id: integer('lead_id').references(() => leads.id),
  prospect_id: integer('prospect_id').references(() => prospects.id),
  client_id: text('client_id').references(() => clients.client_id),
  related_entity_type: text('related_entity_type'),
  related_entity_id: integer('related_entity_id'),
  filed_by: integer('filed_by').references(() => users.id).notNull(),
  meeting_date: date('meeting_date').notNull(),
  meeting_type: meetingTypeEnum('call_report_meeting_type').notNull(),
  subject: text('subject').notNull(),
  summary: text('summary').notNull(),
  discussion_summary: text('discussion_summary'),
  topics_discussed: jsonb('topics_discussed').default('[]'),
  products_discussed: jsonb('products_discussed').default('[]'),
  outcome: text('outcome'),
  follow_up_required: boolean('follow_up_required').default(false).notNull(),
  follow_up_date: date('follow_up_date'),
  follow_up_report_id: integer('follow_up_report_id'),
  parent_report_id: integer('parent_report_id'),
  linked_call_report_id: integer('linked_call_report_id'),  // AC-058: link to a related call report for cross-reference (self-ref; no FK to avoid circular type)
  attachment_urls: jsonb('attachment_urls').default('[]'),
  report_status: callReportStatusEnum('report_status').notNull().default('DRAFT'),
  requires_supervisor_approval: boolean('requires_supervisor_approval').default(false).notNull(),
  meeting_reason: meetingReasonEnum('call_report_meeting_reason'),
  person_met: text('person_met'),
  client_status: text('client_status'),
  state_of_mind: text('state_of_mind'),
  next_meeting_start: timestamp('next_meeting_start', { withTimezone: true }),
  next_meeting_end: timestamp('next_meeting_end', { withTimezone: true }),
  filed_date: timestamp('filed_date', { withTimezone: true }),
  days_since_meeting: integer('days_since_meeting'),
  branch_id: integer('branch_id'),
  approval_submitted_at: timestamp('approval_submitted_at', { withTimezone: true }),
  approved_by: integer('approved_by').references(() => users.id),
  approved_at: timestamp('approved_at', { withTimezone: true }),
  return_reason: text('return_reason'),
  rejection_reason: text('rejection_reason'),
  quality_score: integer('quality_score'),  // 1-5 supervisor quality rating (P0-04)
  // GAP-007: Conveyance expense tracking
  transport_mode: text('transport_mode'),         // Car, Train, Taxi, Grab, etc.
  transport_cost: numeric('transport_cost'),      // amount in PHP
  from_location: text('from_location'),
  to_location: text('to_location'),
  expense_notes: text('expense_notes'),
  // AI auto-tagging — populated asynchronously after report submission
  // via the Platform Intelligence Service (platform-intelligence-client.ts)
  ai_tags: jsonb('ai_tags'),  // { topics: string[], sentiment: string, action_items: string[], keywords: string[] }
  ...auditFields,
},
(table) => [
  // C-006: One active call report per meeting — partial unique index excludes DRAFT/CANCELLED
  uniqueIndex('call_reports_meeting_unique_idx')
    .on(table.meeting_id)
    .where(sql`meeting_id IS NOT NULL AND report_status NOT IN ('DRAFT', 'CANCELLED')`),
]);

// 11a. call_report_feedback (P0-02: FR-011 — supervisor coaching comments)
// GAP-020: sentiment field for call report feedback
export const feedbackSentimentEnum = pgEnum('feedback_sentiment', ['POSITIVE', 'NEUTRAL', 'NEGATIVE']);

export const callReportFeedback = pgTable('call_report_feedback', {
  id: serial('id').primaryKey(),
  call_report_id: integer('call_report_id').references(() => callReports.id).notNull(),
  feedback_by: integer('feedback_by').references(() => users.id).notNull(),
  feedback_type: text('feedback_type').notNull().default('GENERAL'),
  // Enum values: GENERAL | COACHING | COMPLIANCE_FLAG | QUALITY_ISSUE
  comment: text('comment').notNull(),
  sentiment: feedbackSentimentEnum('sentiment').default('NEUTRAL'),
  is_private: boolean('is_private').notNull().default(false),
  // GAP-017: Source of feedback (where it was submitted from)
  source: text('source').default('CALENDAR'), // CALENDAR | CUSTOMER_DASHBOARD
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  tenant_id: text('tenant_id').default('default').notNull(),
});

// 12. action_items
export const actionItems = pgTable('action_items', {
  id: serial('id').primaryKey(),
  call_report_id: integer('call_report_id').references(() => callReports.id),
  campaign_response_id: integer('campaign_response_id').references(() => campaignResponses.id),
  title: text('title'),
  description: text('description').notNull(),
  assigned_to: integer('assigned_to').references(() => users.id).notNull(),
  created_by_user_id: integer('created_by_user_id').references(() => users.id),
  due_date: date('due_date').notNull(),
  priority: text('priority').notNull().default('MEDIUM'),
  action_status: actionItemStatusEnum('action_status').notNull().default('OPEN'),
  completion_notes: text('completion_notes'),
  completed_at: timestamp('completed_at', { withTimezone: true }),
  ...auditFields,
});

// 12a. call_report_approvals
export const callReportApprovals = pgTable('call_report_approvals', {
  id: serial('id').primaryKey(),
  call_report_id: integer('call_report_id').references(() => callReports.id).notNull(),
  supervisor_id: integer('supervisor_id').references(() => users.id).notNull(),
  action: crApprovalActionEnum('action').notNull().default('PENDING'),
  claimed_at: timestamp('claimed_at', { withTimezone: true }),
  decided_at: timestamp('decided_at', { withTimezone: true }),
  reviewer_comments: text('reviewer_comments'),
  ...auditFields,
});

// 12b. conversation_history (INSERT-ONLY audit trail)
export const conversationHistory = pgTable('conversation_history', {
  id: serial('id').primaryKey(),
  lead_id: integer('lead_id').references(() => leads.id),
  prospect_id: integer('prospect_id').references(() => prospects.id),
  client_id: text('client_id').references(() => clients.client_id),
  interaction_type: conversationTypeEnum('interaction_type').notNull(),
  interaction_date: timestamp('interaction_date', { withTimezone: true }).defaultNow().notNull(),
  summary: text('summary').notNull(),
  reference_type: text('reference_type'),
  reference_id: integer('reference_id'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  created_by: text('created_by'),
  tenant_id: text('tenant_id').default('default').notNull(),
});

// 12c. system_config (key-value store for thresholds)
export const systemConfig = pgTable('system_config', {
  id: serial('id').primaryKey(),
  config_key: text('config_key').unique().notNull(),
  config_value: text('config_value').notNull(),
  description: text('description'),
  value_type: text('value_type').notNull().default('STRING'), // INTEGER | DECIMAL | BOOLEAN | STRING | JSON
  min_value: text('min_value'),
  max_value: text('max_value'),
  requires_approval: boolean('requires_approval').notNull().default(false),
  is_sensitive: boolean('is_sensitive').notNull().default(false),
  // version is provided by ...auditFields (integer, default 1)
  approved_by: integer('approved_by').references(() => users.id),
  ...auditFields,
});

// 12d. crm_expenses (P0-01: FR-020 — client meeting expense tracking)
export const crmExpenses = pgTable('crm_expenses', {
  id: serial('id').primaryKey(),
  expense_ref: text('expense_ref').unique().notNull(),
  call_report_id: integer('call_report_id').references(() => callReports.id),
  meeting_id: integer('meeting_id').references(() => meetings.id),
  expense_type: text('expense_type').notNull(),
  // Enum: TRAVEL | MEALS | ENTERTAINMENT | ACCOMMODATION | TRANSPORTATION | COMMUNICATION | GIFTS | OTHER
  amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
  currency: text('currency').notNull().default('PHP'),
  expense_date: date('expense_date').notNull(),
  description: text('description').notNull(),
  receipt_url: text('receipt_url'),
  expense_status: text('expense_status').notNull().default('DRAFT'),
  // Enum: DRAFT | SUBMITTED | APPROVED | REJECTED
  approved_by: integer('approved_by').references(() => users.id),
  approved_at: timestamp('approved_at', { withTimezone: true }),
  rejection_reason: text('rejection_reason'),
  submitted_by: integer('submitted_by').references(() => users.id).notNull(),
  branch_id: integer('branch_id'),
  ...auditFields,
});

// 13. rm_handovers — @deprecated Use handovers table from HAM module
export const rmHandovers = pgTable('rm_handovers', {
  id: serial('id').primaryKey(),
  handover_type: handoverTypeEnum('handover_type').notNull(),
  entity_type: text('entity_type').notNull(),
  entity_id: integer('entity_id').notNull(),
  from_rm_id: integer('from_rm_id').references(() => users.id).notNull(),
  to_rm_id: integer('to_rm_id').references(() => users.id).notNull(),
  reason: text('reason').notNull(),
  effective_date: date('effective_date').notNull(),
  end_date: date('end_date'),
  handover_status: approvalStatusEnum('handover_status').notNull().default('PENDING'),
  approved_by: integer('approved_by').references(() => users.id),
  approved_at: timestamp('approved_at', { withTimezone: true }),
  notes: text('notes'),
  ...auditFields,
});

// 14. notification_templates
export const notificationTemplates = pgTable('notification_templates', {
  id: serial('id').primaryKey(),
  template_code: text('template_code').notNull(),
  name: text('name').notNull(),
  channel: commChannelEnum('channel').notNull(),
  locale: text('locale').notNull().default('en'),
  subject_template: text('subject_template'),
  body_template: text('body_template').notNull(),
  available_tokens: jsonb('available_tokens').default('[]'),
  ...auditFields,
});

// 15. lead_upload_batches
export const leadUploadBatches = pgTable('lead_upload_batches', {
  id: serial('id').primaryKey(),
  batch_code: text('batch_code').unique().notNull(),
  file_name: text('file_name').notNull(),
  file_url: text('file_url').notNull(),
  target_list_id: integer('target_list_id').references(() => leadLists.id).notNull(),
  total_rows: integer('total_rows').default(0).notNull(),
  valid_rows: integer('valid_rows').default(0).notNull(),
  error_rows: integer('error_rows').default(0).notNull(),
  duplicate_rows: integer('duplicate_rows').default(0).notNull(),
  upload_status: text('upload_status').notNull().default('PENDING'),
  validated_data: jsonb('validated_data').default('[]'),
  error_report_url: text('error_report_url'),
  ...auditFields,
});

// 16. campaign_consent_log
export const campaignConsentLog = pgTable('campaign_consent_log', {
  id: serial('id').primaryKey(),
  client_id: text('client_id').references(() => clients.client_id),
  lead_id: integer('lead_id').references(() => leads.id),
  prospect_id: integer('prospect_id').references(() => prospects.id),
  consent_type: consentTypeEnum('consent_type').notNull(),
  consent_status: consentStatusEnum('consent_status').notNull(),
  consent_source: consentSourceEnum('consent_source').notNull(),
  consent_text: text('consent_text'),
  effective_date: date('effective_date').defaultNow().notNull(),
  expiry_date: date('expiry_date'),
  revoked_at: timestamp('revoked_at', { withTimezone: true }),
  revocation_reason: text('revocation_reason'),
  ip_address: text('ip_address'),
  ...auditFields,
});

// 17. campaign_translations
export const campaignTranslations = pgTable('campaign_translations', {
  id: serial('id').primaryKey(),
  campaign_id: integer('campaign_id').references(() => campaigns.id).notNull(),
  locale: text('locale').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  event_name: text('event_name'),
  ...auditFields,
}, (table) => ({
  uniqueCampaignLocale: unique().on(table.campaign_id, table.locale),
}));

// 18. lead_list_generation_jobs
export const leadListGenerationJobs = pgTable('lead_list_generation_jobs', {
  id: serial('id').primaryKey(),
  lead_list_id: integer('lead_list_id').references(() => leadLists.id).notNull(),
  job_status: listGenJobStatusEnum('job_status').notNull().default('PENDING'),
  started_at: timestamp('started_at', { withTimezone: true }),
  completed_at: timestamp('completed_at', { withTimezone: true }),
  matched_count: integer('matched_count').default(0),
  execution_time_ms: integer('execution_time_ms'),
  error_message: text('error_message'),
  ...auditFields,
});

// ============================================================================
// CRM Lead & Prospect Sub-Entity Tables
// ============================================================================

// Lead family members
export const leadFamilyMembers = pgTable('lead_family_members', {
  id: serial('id').primaryKey(),
  lead_id: integer('lead_id').references(() => leads.id).notNull(),
  relationship: text('relationship').notNull(),
  first_name: text('first_name').notNull(),
  last_name: text('last_name').notNull(),
  date_of_birth: date('date_of_birth'),
  occupation: text('occupation'),
  contact_number: text('contact_number'),
  ...auditFields,
});

// Lead addresses
export const leadAddresses = pgTable('lead_addresses', {
  id: serial('id').primaryKey(),
  lead_id: integer('lead_id').references(() => leads.id).notNull(),
  address_type: text('address_type').notNull(),
  address_line_1: text('address_line_1').notNull(),
  address_line_2: text('address_line_2'),
  city: text('city').notNull(),
  state_province: text('state_province'),
  postal_code: text('postal_code'),
  country: text('country').notNull(),
  is_primary: boolean('is_primary').default(false).notNull(),
  ...auditFields,
});

// Lead identifications
export const leadIdentifications = pgTable('lead_identifications', {
  id: serial('id').primaryKey(),
  lead_id: integer('lead_id').references(() => leads.id).notNull(),
  id_type: text('id_type').notNull(),
  id_number: text('id_number').notNull(),
  issue_date: date('issue_date'),
  expiry_date: date('expiry_date'),
  issuing_authority: text('issuing_authority'),
  issuing_country: text('issuing_country'),
  ...auditFields,
});

// Lead lifestyle
export const leadLifestyle = pgTable('lead_lifestyle', {
  id: serial('id').primaryKey(),
  lead_id: integer('lead_id').references(() => leads.id).notNull(),
  hobbies: jsonb('hobbies').default('[]'),
  cuisine_preferences: jsonb('cuisine_preferences').default('[]'),
  sports: jsonb('sports').default('[]'),
  clubs_memberships: jsonb('clubs_memberships').default('[]'),
  special_dates: jsonb('special_dates').default('[]'),
  communication_preference: text('communication_preference'),
  ...auditFields,
});

// Lead documents
export const leadDocuments = pgTable('lead_documents', {
  id: serial('id').primaryKey(),
  lead_id: integer('lead_id').references(() => leads.id).notNull(),
  document_type: text('document_type').notNull(),
  file_name: text('file_name').notNull(),
  file_url: text('file_url').notNull(),
  file_size: integer('file_size'),
  mime_type: text('mime_type'),
  ...auditFields,
});

// Prospect family members
export const prospectFamilyMembers = pgTable('prospect_family_members', {
  id: serial('id').primaryKey(),
  prospect_id: integer('prospect_id').references(() => prospects.id).notNull(),
  relationship: text('relationship').notNull(),
  first_name: text('first_name').notNull(),
  last_name: text('last_name').notNull(),
  date_of_birth: date('date_of_birth'),
  occupation: text('occupation'),
  contact_number: text('contact_number'),
  ...auditFields,
});

// Prospect addresses
export const prospectAddresses = pgTable('prospect_addresses', {
  id: serial('id').primaryKey(),
  prospect_id: integer('prospect_id').references(() => prospects.id).notNull(),
  address_type: text('address_type').notNull(),
  address_line_1: text('address_line_1').notNull(),
  address_line_2: text('address_line_2'),
  city: text('city').notNull(),
  state_province: text('state_province'),
  postal_code: text('postal_code'),
  country: text('country').notNull(),
  is_primary: boolean('is_primary').default(false).notNull(),
  ...auditFields,
});

// Prospect identifications
export const prospectIdentifications = pgTable('prospect_identifications', {
  id: serial('id').primaryKey(),
  prospect_id: integer('prospect_id').references(() => prospects.id).notNull(),
  id_type: text('id_type').notNull(),
  id_number: text('id_number').notNull(),
  issue_date: date('issue_date'),
  expiry_date: date('expiry_date'),
  issuing_authority: text('issuing_authority'),
  issuing_country: text('issuing_country'),
  ...auditFields,
});

// Prospect lifestyle
export const prospectLifestyle = pgTable('prospect_lifestyle', {
  id: serial('id').primaryKey(),
  prospect_id: integer('prospect_id').references(() => prospects.id).notNull(),
  hobbies: jsonb('hobbies').default('[]'),
  cuisine_preferences: jsonb('cuisine_preferences').default('[]'),
  sports: jsonb('sports').default('[]'),
  clubs_memberships: jsonb('clubs_memberships').default('[]'),
  special_dates: jsonb('special_dates').default('[]'),
  communication_preference: text('communication_preference'),
  ...auditFields,
});

// Prospect documents
export const prospectDocuments = pgTable('prospect_documents', {
  id: serial('id').primaryKey(),
  prospect_id: integer('prospect_id').references(() => prospects.id).notNull(),
  document_type: text('document_type').notNull(),
  file_name: text('file_name').notNull(),
  file_url: text('file_url').notNull(),
  file_size: integer('file_size'),
  mime_type: text('mime_type'),
  ...auditFields,
});

// ============================================================================
// CRM Supporting Tables
// ============================================================================

// Dedupe rules
export const dedupeRules = pgTable('dedupe_rules', {
  id: serial('id').primaryKey(),
  entity_type: entityTypeEnum('entity_type').notNull(),
  person_type: text('person_type').notNull(),
  field_combination: jsonb('field_combination').notNull(),
  stop_type: dedupeStopTypeEnum('stop_type').notNull(),
  priority: integer('priority').notNull().default(1),
  is_active: boolean('is_active').default(true).notNull(),
  ...auditFields,
});

// Negative list
export const negativeList = pgTable('negative_list', {
  id: serial('id').primaryKey(),
  list_type: negativeListTypeEnum('list_type').notNull(),
  first_name: text('first_name'),
  last_name: text('last_name'),
  entity_name: text('entity_name'),
  email: text('email'),
  phone: text('phone'),
  id_type: text('id_type'),
  id_number: text('id_number'),
  nationality: text('nationality'),
  date_of_birth: date('date_of_birth'),
  reason: text('reason'),
  source: text('source'),
  effective_date: date('effective_date'),
  expiry_date: date('expiry_date'),
  is_active: boolean('is_active').default(true).notNull(),
  ...auditFields,
});

// Dedupe overrides
export const dedupeOverrides = pgTable('dedupe_overrides', {
  id: serial('id').primaryKey(),
  entity_type: text('entity_type').notNull(),
  entity_id: integer('entity_id').notNull(),
  matched_entity_type: text('matched_entity_type').notNull(),
  matched_entity_id: integer('matched_entity_id').notNull(),
  rule_id: integer('rule_id').references(() => dedupeRules.id),
  override_reason: text('override_reason').notNull(),
  override_user_id: integer('override_user_id').references(() => users.id).notNull(),
  ...auditFields,
});

// Conversion history
export const conversionHistory = pgTable('conversion_history', {
  id: serial('id').primaryKey(),
  source_entity_type: text('source_entity_type').notNull(),
  source_entity_id: integer('source_entity_id').notNull(),
  target_entity_type: text('target_entity_type').notNull(),
  target_entity_id: integer('target_entity_id'),
  target_client_id: text('target_client_id'),
  campaign_id: integer('campaign_id').references(() => campaigns.id),
  converted_by: integer('converted_by').references(() => users.id).notNull(),
  conversion_notes: text('conversion_notes'),
  ...auditFields,
});

// Upload logs
export const uploadLogs = pgTable('upload_logs', {
  id: serial('id').primaryKey(),
  upload_type: uploadTypeEnum('upload_type').notNull(),
  file_name: text('file_name').notNull(),
  file_url: text('file_url'),
  total_rows: integer('total_rows').default(0),
  success_rows: integer('success_rows').default(0),
  error_rows: integer('error_rows').default(0),
  error_details: jsonb('error_details'),
  upload_status: text('upload_status').notNull().default('PENDING'),
  started_at: timestamp('started_at', { withTimezone: true }),
  completed_at: timestamp('completed_at', { withTimezone: true }),
  uploaded_by: integer('uploaded_by').references(() => users.id),
  ...auditFields,
});

// RM history
export const rmHistory = pgTable('rm_history', {
  id: serial('id').primaryKey(),
  entity_type: text('entity_type').notNull(),
  entity_id: integer('entity_id').notNull(),
  previous_rm_id: integer('previous_rm_id').references(() => users.id),
  new_rm_id: integer('new_rm_id').references(() => users.id).notNull(),
  change_type: rmChangeTypeEnum('change_type').notNull(),
  handover_id: integer('handover_id'),
  effective_date: date('effective_date').notNull(),
  notes: text('notes'),
  ...auditFields,
});

// Lead rules
export const leadRules = pgTable('lead_rules', {
  id: serial('id').primaryKey(),
  rule_name: text('rule_name').notNull(),
  criteria_name: text('criteria_name'),
  criteria_json: jsonb('criteria_json').notNull(),
  is_active: boolean('is_active').default(true).notNull(),
  last_generated_at: timestamp('last_generated_at', { withTimezone: true }),
  last_generated_count: integer('last_generated_count'),
  ...auditFields,
});

// Opportunities
export const opportunities = pgTable('opportunities', {
  id: serial('id').primaryKey(),
  opportunity_code: text('opportunity_code').unique().notNull(),
  name: text('name').notNull(),
  lead_id: integer('lead_id').references(() => leads.id),
  prospect_id: integer('prospect_id').references(() => prospects.id),
  client_id: text('client_id').references(() => clients.client_id),
  campaign_id: integer('campaign_id').references(() => campaigns.id),
  call_report_id: integer('call_report_id').references(() => callReports.id),
  product_type: text('product_type'),
  pipeline_value: numeric('pipeline_value'),
  pipeline_currency: text('pipeline_currency').default('PHP'),
  probability: integer('probability'),
  stage: opportunityStageEnum('stage').notNull().default('IDENTIFIED'),
  expected_close_date: date('expected_close_date'),
  loss_reason: text('loss_reason'),
  won_date: timestamp('won_date', { withTimezone: true }),
  ...auditFields,
});

// CRM Tasks
export const crmTasks = pgTable('crm_tasks', {
  id: serial('id').primaryKey(),
  task_code: text('task_code').unique().notNull(),
  title: text('title').notNull(),
  description: text('description'),
  task_type: text('task_type'),
  priority: taskPriorityEnum('priority').notNull().default('MEDIUM'),
  due_date: date('due_date'),
  reminder_date: date('reminder_date'),
  assigned_to: integer('assigned_to').references(() => users.id),
  assigned_by: integer('assigned_by').references(() => users.id),
  related_entity_type: text('related_entity_type'),
  related_entity_id: integer('related_entity_id'),
  task_status: taskStatusEnum('task_status').notNull().default('PENDING'),
  completed_at: timestamp('completed_at', { withTimezone: true }),
  completion_notes: text('completion_notes'),
  ...auditFields,
});

// CRM Notifications
export const crmNotifications = pgTable('crm_notifications', {
  id: serial('id').primaryKey(),
  recipient_user_id: integer('recipient_user_id').references(() => users.id).notNull(),
  type: notificationTypeEnum('type').notNull(),
  title: text('title').notNull(),
  message: text('message'),
  channel: notificationChannelEnum('channel').default('IN_APP').notNull(),
  related_entity_type: text('related_entity_type'),
  related_entity_id: integer('related_entity_id'),
  is_read: boolean('is_read').default(false).notNull(),
  read_at: timestamp('read_at', { withTimezone: true }),
  ...auditFields,
});

// ============================================================================
// CRM Campaign Management Module — Relations
// ============================================================================

export const campaignsRelations = relations(campaigns, ({ one, many }) => ({
  owner: one(users, { fields: [campaigns.owner_user_id], references: [users.id], relationName: 'campaignOwner' }),
  approver: one(users, { fields: [campaigns.approved_by], references: [users.id], relationName: 'campaignApprover' }),
  campaignLists: many(campaignLists),
  responses: many(campaignResponses),
  communications: many(campaignCommunications),
  meetings: many(meetings),
  callReports: many(callReports),
  translations: many(campaignTranslations),
}));

export const leadListsRelations = relations(leadLists, ({ many }) => ({
  members: many(leadListMembers),
  campaignLists: many(campaignLists),
  generationJobs: many(leadListGenerationJobs),
}));

export const leadsRelations = relations(leads, ({ one, many }) => ({
  sourceCampaign: one(campaigns, { fields: [leads.source_campaign_id], references: [campaigns.id] }),
  assignedRm: one(users, { fields: [leads.assigned_rm_id], references: [users.id] }),
  existingClient: one(clients, { fields: [leads.existing_client_id], references: [clients.client_id] }),
  listMemberships: many(leadListMembers),
  responses: many(campaignResponses),
  familyMembers: many(leadFamilyMembers),
  addresses: many(leadAddresses),
  identifications: many(leadIdentifications),
  lifestyle: many(leadLifestyle),
  documents: many(leadDocuments),
}));

export const campaignResponsesRelations = relations(campaignResponses, ({ one, many }) => ({
  campaign: one(campaigns, { fields: [campaignResponses.campaign_id], references: [campaigns.id] }),
  lead: one(leads, { fields: [campaignResponses.lead_id], references: [leads.id] }),
  assignedRm: one(users, { fields: [campaignResponses.assigned_rm_id], references: [users.id] }),
  actionItems: many(actionItems),
}));

export const prospectsRelations = relations(prospects, ({ one, many }) => ({
  lead: one(leads, { fields: [prospects.lead_id], references: [leads.id] }),
  sourceLead: one(leads, { fields: [prospects.source_lead_id], references: [leads.id], relationName: 'sourceLeadProspect' }),
  assignedRm: one(users, { fields: [prospects.assigned_rm_id], references: [users.id] }),
  sourceCampaign: one(campaigns, { fields: [prospects.source_campaign_id], references: [campaigns.id] }),
  convertedClient: one(clients, { fields: [prospects.converted_client_id], references: [clients.client_id] }),
  familyMembers: many(prospectFamilyMembers),
  addresses: many(prospectAddresses),
  identifications: many(prospectIdentifications),
  lifestyle: many(prospectLifestyle),
  documents: many(prospectDocuments),
}));

export const meetingsRelations = relations(meetings, ({ one, many }) => ({
  campaign: one(campaigns, { fields: [meetings.campaign_id], references: [campaigns.id] }),
  organizer: one(users, { fields: [meetings.organizer_user_id], references: [users.id] }),
  completedByUser: one(users, { fields: [meetings.completed_by], references: [users.id], relationName: 'meetingCompletedBy' }),
  lead: one(leads, { fields: [meetings.lead_id], references: [leads.id] }),
  prospect: one(prospects, { fields: [meetings.prospect_id], references: [prospects.id] }),
  client: one(clients, { fields: [meetings.client_id], references: [clients.client_id] }),
  invitees: many(meetingInvitees),
  callReports: many(callReports),
}));

export const meetingInviteesRelations = relations(meetingInvitees, ({ one }) => ({
  meeting: one(meetings, { fields: [meetingInvitees.meeting_id], references: [meetings.id] }),
  user: one(users, { fields: [meetingInvitees.user_id], references: [users.id] }),
}));

export const callReportsRelations = relations(callReports, ({ one, many }) => ({
  meeting: one(meetings, { fields: [callReports.meeting_id], references: [meetings.id] }),
  campaign: one(campaigns, { fields: [callReports.campaign_id], references: [campaigns.id] }),
  filer: one(users, { fields: [callReports.filed_by], references: [users.id] }),
  approver: one(users, { fields: [callReports.approved_by], references: [users.id], relationName: 'callReportApprover' }),
  lead: one(leads, { fields: [callReports.lead_id], references: [leads.id] }),
  prospect: one(prospects, { fields: [callReports.prospect_id], references: [prospects.id] }),
  client: one(clients, { fields: [callReports.client_id], references: [clients.client_id] }),
  actionItems: many(actionItems),
  approvals: many(callReportApprovals),
  feedback: many(callReportFeedback),
}));

export const callReportFeedbackRelations = relations(callReportFeedback, ({ one }) => ({
  callReport: one(callReports, { fields: [callReportFeedback.call_report_id], references: [callReports.id] }),
  author: one(users, { fields: [callReportFeedback.feedback_by], references: [users.id] }),
}));

export const crmExpensesRelations = relations(crmExpenses, ({ one }) => ({
  callReport: one(callReports, { fields: [crmExpenses.call_report_id], references: [callReports.id] }),
  meeting: one(meetings, { fields: [crmExpenses.meeting_id], references: [meetings.id] }),
  submitter: one(users, { fields: [crmExpenses.submitted_by], references: [users.id] }),
  approver: one(users, { fields: [crmExpenses.approved_by], references: [users.id], relationName: 'expenseApprover' }),
}));

export const actionItemsRelations = relations(actionItems, ({ one }) => ({
  callReport: one(callReports, { fields: [actionItems.call_report_id], references: [callReports.id] }),
  campaignResponse: one(campaignResponses, { fields: [actionItems.campaign_response_id], references: [campaignResponses.id] }),
  assignee: one(users, { fields: [actionItems.assigned_to], references: [users.id] }),
  creator: one(users, { fields: [actionItems.created_by_user_id], references: [users.id], relationName: 'actionItemCreator' }),
}));

export const callReportApprovalsRelations = relations(callReportApprovals, ({ one }) => ({
  callReport: one(callReports, { fields: [callReportApprovals.call_report_id], references: [callReports.id] }),
  supervisor: one(users, { fields: [callReportApprovals.supervisor_id], references: [users.id] }),
}));

export const conversationHistoryRelations = relations(conversationHistory, ({ one }) => ({
  lead: one(leads, { fields: [conversationHistory.lead_id], references: [leads.id] }),
  prospect: one(prospects, { fields: [conversationHistory.prospect_id], references: [prospects.id] }),
  client: one(clients, { fields: [conversationHistory.client_id], references: [clients.client_id] }),
}));

export const leadFamilyMembersRelations = relations(leadFamilyMembers, ({ one }) => ({
  lead: one(leads, { fields: [leadFamilyMembers.lead_id], references: [leads.id] }),
}));

export const leadAddressesRelations = relations(leadAddresses, ({ one }) => ({
  lead: one(leads, { fields: [leadAddresses.lead_id], references: [leads.id] }),
}));

export const leadIdentificationsRelations = relations(leadIdentifications, ({ one }) => ({
  lead: one(leads, { fields: [leadIdentifications.lead_id], references: [leads.id] }),
}));

export const leadLifestyleRelations = relations(leadLifestyle, ({ one }) => ({
  lead: one(leads, { fields: [leadLifestyle.lead_id], references: [leads.id] }),
}));

export const leadDocumentsRelations = relations(leadDocuments, ({ one }) => ({
  lead: one(leads, { fields: [leadDocuments.lead_id], references: [leads.id] }),
}));

export const prospectFamilyMembersRelations = relations(prospectFamilyMembers, ({ one }) => ({
  prospect: one(prospects, { fields: [prospectFamilyMembers.prospect_id], references: [prospects.id] }),
}));

export const prospectAddressesRelations = relations(prospectAddresses, ({ one }) => ({
  prospect: one(prospects, { fields: [prospectAddresses.prospect_id], references: [prospects.id] }),
}));

export const prospectIdentificationsRelations = relations(prospectIdentifications, ({ one }) => ({
  prospect: one(prospects, { fields: [prospectIdentifications.prospect_id], references: [prospects.id] }),
}));

export const prospectLifestyleRelations = relations(prospectLifestyle, ({ one }) => ({
  prospect: one(prospects, { fields: [prospectLifestyle.prospect_id], references: [prospects.id] }),
}));

export const prospectDocumentsRelations = relations(prospectDocuments, ({ one }) => ({
  prospect: one(prospects, { fields: [prospectDocuments.prospect_id], references: [prospects.id] }),
}));

export const dedupeOverridesRelations = relations(dedupeOverrides, ({ one }) => ({
  rule: one(dedupeRules, { fields: [dedupeOverrides.rule_id], references: [dedupeRules.id] }),
  overrideUser: one(users, { fields: [dedupeOverrides.override_user_id], references: [users.id] }),
}));

export const conversionHistoryRelations = relations(conversionHistory, ({ one }) => ({
  campaign: one(campaigns, { fields: [conversionHistory.campaign_id], references: [campaigns.id] }),
  convertedBy: one(users, { fields: [conversionHistory.converted_by], references: [users.id] }),
}));

export const rmHistoryRelations = relations(rmHistory, ({ one }) => ({
  previousRm: one(users, { fields: [rmHistory.previous_rm_id], references: [users.id], relationName: 'previousRm' }),
  newRm: one(users, { fields: [rmHistory.new_rm_id], references: [users.id], relationName: 'newRm' }),
}));

export const opportunitiesRelations = relations(opportunities, ({ one }) => ({
  lead: one(leads, { fields: [opportunities.lead_id], references: [leads.id] }),
  prospect: one(prospects, { fields: [opportunities.prospect_id], references: [prospects.id] }),
  campaign: one(campaigns, { fields: [opportunities.campaign_id], references: [campaigns.id] }),
  callReport: one(callReports, { fields: [opportunities.call_report_id], references: [callReports.id] }),
}));

export const crmTasksRelations = relations(crmTasks, ({ one }) => ({
  assignee: one(users, { fields: [crmTasks.assigned_to], references: [users.id], relationName: 'taskAssignee' }),
  assigner: one(users, { fields: [crmTasks.assigned_by], references: [users.id], relationName: 'taskAssigner' }),
}));

export const crmNotificationsRelations = relations(crmNotifications, ({ one }) => ({
  recipient: one(users, { fields: [crmNotifications.recipient_user_id], references: [users.id] }),
}));

// ============================================================================
// Risk Profiling & Proposal Generation Management
// ============================================================================

// --- Enums ---

export const questionnaireTypeEnum = pgEnum('questionnaire_type', [
  'FINANCIAL_PROFILING',
  'INVESTMENT_KNOWLEDGE',
  'SAF',
  'SURVEY',
  'FATCA',
  'PAMM_PRE_INVESTMENT',
]);

export const questionnaireStatusEnum = pgEnum('questionnaire_status', [
  'UNAUTHORIZED',
  'MODIFIED',
  'AUTHORIZED',
  'REJECTED',
]);

export const customerCategoryEnum = pgEnum('customer_category', [
  'INDIVIDUAL',
  'NON_INDIVIDUAL',
  'BOTH',
]);

export const scoringTypeEnum = pgEnum('scoring_type', [
  'NONE',
  'RANGE',
]);

export const computationTypeEnum = pgEnum('computation_type', [
  'SUM',
  'NONE',
]);

export const proposalStatusEnum = pgEnum('proposal_status', [
  'DRAFT',
  'SUBMITTED',
  'L1_APPROVED',
  'L1_REJECTED',
  'COMPLIANCE_APPROVED',
  'COMPLIANCE_REJECTED',
  'SENT_TO_CLIENT',
  'CLIENT_ACCEPTED',
  'CLIENT_REJECTED',
  'EXPIRED',
]);

export const investmentObjectiveEnum = pgEnum('investment_objective', [
  'GROWTH',
  'INCOME',
  'BALANCED',
  'CAPITAL_PRESERVATION',
  'AGGRESSIVE_GROWTH',
]);

export const approvalLevelEnum = pgEnum('rp_approval_level', [
  'L1_SUPERVISOR',
  'COMPLIANCE',
  'CLIENT',
]);

export const approvalActionEnum = pgEnum('rp_approval_action', [
  'APPROVED',
  'REJECTED',
  'RETURNED_FOR_REVISION',
]);

export const rebalanceFrequencyEnum = pgEnum('rebalance_frequency', [
  'MONTHLY',
  'QUARTERLY',
  'SEMI_ANNUAL',
  'ANNUAL',
]);

export const deviationContextEnum = pgEnum('deviation_context', [
  'RM_OFFICE',
  'CLIENT_PORTAL',
]);

export const escalationTypeEnum = pgEnum('escalation_type', [
  'REPEAT_DEVIATION',
  'MANUAL',
]);

export const escalationStatusEnum = pgEnum('escalation_status', [
  'OPEN',
  'ACKNOWLEDGED',
  'RESOLVED',
]);

export const resolutionActionEnum = pgEnum('resolution_action', [
  'NOTED',
  'FLAGGED_FOR_REVIEW',
  'CLIENT_RESTRICTED',
]);

export const auditOutcomeEnum = pgEnum('audit_outcome', [
  'COMPLETED',
  'ABANDONED',
  'ERROR',
]);

// --- Tables ---

// 4.1 Questionnaire
export const questionnaires = pgTable('questionnaires', {
  id: serial('id').primaryKey(),
  questionnaire_name: text('questionnaire_name').notNull(),
  customer_category: customerCategoryEnum('customer_category').notNull(),
  questionnaire_type: questionnaireTypeEnum('questionnaire_type').notNull(),
  effective_start_date: date('effective_start_date').notNull(),
  effective_end_date: date('effective_end_date').notNull(),
  valid_period_years: integer('valid_period_years').default(2).notNull(),
  is_score: boolean('is_score').default(false).notNull(),
  warning_text: text('warning_text'),
  acknowledgement_text: text('acknowledgement_text'),
  disclaimer_text: text('disclaimer_text'),
  authorization_status: questionnaireStatusEnum('authorization_status').default('UNAUTHORIZED').notNull(),
  maker_id: integer('maker_id').references(() => users.id),
  checker_id: integer('checker_id').references(() => users.id),
  authorized_at: timestamp('authorized_at', { withTimezone: true }),
  entity_id: text('entity_id').default('default').notNull(),
  ...auditFields,
});

// 4.2 Question
export const questions = pgTable('questions', {
  id: serial('id').primaryKey(),
  questionnaire_id: integer('questionnaire_id').references(() => questionnaires.id).notNull(),
  question_number: integer('question_number').notNull(),
  question_description: text('question_description').notNull(),
  is_mandatory: boolean('is_mandatory').default(true).notNull(),
  is_multi_select: boolean('is_multi_select').default(false).notNull(),
  scoring_type: scoringTypeEnum('scoring_type').default('NONE').notNull(),
  computation_type: computationTypeEnum('computation_type').default('NONE').notNull(),
  ...auditFields,
});

// 4.3 Answer Option
export const answerOptions = pgTable('answer_options', {
  id: serial('id').primaryKey(),
  question_id: integer('question_id').references(() => questions.id).notNull(),
  option_number: integer('option_number').notNull(),
  answer_description: text('answer_description').notNull(),
  weightage: numeric('weightage').default('0').notNull(),
  ...auditFields,
});

// 4.4 Score Normalization Range
export const scoreNormalizationRanges = pgTable('score_normalization_ranges', {
  id: serial('id').primaryKey(),
  question_id: integer('question_id').references(() => questions.id).notNull(),
  range_from: numeric('range_from').notNull(),
  range_to: numeric('range_to').notNull(),
  normalized_score: numeric('normalized_score').notNull(),
  ...auditFields,
});

// 4.5 Risk Appetite Mapping
export const riskAppetiteMappings = pgTable('risk_appetite_mappings', {
  id: serial('id').primaryKey(),
  mapping_name: text('mapping_name').notNull(),
  entity_id: text('entity_id').default('default').notNull(),
  effective_start_date: date('effective_start_date').notNull(),
  effective_end_date: date('effective_end_date').notNull(),
  authorization_status: questionnaireStatusEnum('ram_authorization_status').default('UNAUTHORIZED').notNull(),
  maker_id: integer('maker_id').references(() => users.id),
  checker_id: integer('checker_id').references(() => users.id),
  authorized_at: timestamp('authorized_at', { withTimezone: true }),
  ...auditFields,
});

// 4.6 Risk Appetite Band
export const riskAppetiteBands = pgTable('risk_appetite_bands', {
  id: serial('id').primaryKey(),
  mapping_id: integer('mapping_id').references(() => riskAppetiteMappings.id).notNull(),
  score_from: numeric('score_from').notNull(),
  score_to: numeric('score_to').notNull(),
  risk_category: text('risk_category').notNull(),
  risk_code: integer('risk_code').notNull(),
  description: text('description'),
  ...auditFields,
});

// 4.7 Asset Allocation Config
export const assetAllocationConfigs = pgTable('asset_allocation_configs', {
  id: serial('id').primaryKey(),
  config_name: text('config_name').notNull(),
  entity_id: text('entity_id').default('default').notNull(),
  effective_start_date: date('effective_start_date').notNull(),
  effective_end_date: date('effective_end_date').notNull(),
  authorization_status: questionnaireStatusEnum('aac_authorization_status').default('UNAUTHORIZED').notNull(),
  maker_id: integer('maker_id').references(() => users.id),
  checker_id: integer('checker_id').references(() => users.id),
  authorized_at: timestamp('authorized_at', { withTimezone: true }),
  ...auditFields,
});

// 4.8 Asset Allocation Line
export const assetAllocationLines = pgTable('asset_allocation_lines', {
  id: serial('id').primaryKey(),
  config_id: integer('config_id').references(() => assetAllocationConfigs.id).notNull(),
  risk_category: text('risk_category').notNull(),
  asset_class: text('asset_class').notNull(),
  allocation_percentage: numeric('allocation_percentage').notNull(),
  expected_return_pct: numeric('expected_return_pct'),
  standard_deviation_pct: numeric('standard_deviation_pct'),
  ...auditFields,
});

// 4.9 Customer Risk Profile
export const customerRiskProfiles = pgTable('customer_risk_profiles', {
  id: serial('id').primaryKey(),
  customer_id: text('customer_id').references(() => clients.client_id).notNull(),
  questionnaire_id: integer('questionnaire_id').references(() => questionnaires.id).notNull(),
  assessment_date: date('assessment_date').notNull(),
  expiry_date: date('expiry_date').notNull(),
  total_raw_score: numeric('total_raw_score'),
  computed_risk_category: text('computed_risk_category').notNull(),
  computed_risk_code: integer('computed_risk_code').notNull(),
  is_deviated: boolean('is_deviated').default(false).notNull(),
  deviated_risk_category: text('deviated_risk_category'),
  deviated_risk_code: integer('deviated_risk_code'),
  deviation_reason: text('deviation_reason'),
  effective_risk_category: text('effective_risk_category').notNull(),
  effective_risk_code: integer('effective_risk_code').notNull(),
  supervisor_approved: boolean('supervisor_approved'),
  supervisor_id: integer('supervisor_id').references(() => users.id),
  supervisor_approved_at: timestamp('supervisor_approved_at', { withTimezone: true }),
  acknowledgement_accepted: boolean('acknowledgement_accepted'),
  disclaimer_accepted: boolean('disclaimer_accepted'),
  is_active: boolean('is_active').default(true).notNull(),
  assessed_by: integer('assessed_by').references(() => users.id).notNull(),
  ...auditFields,
});

// 4.10 Customer Risk Response
export const customerRiskResponses = pgTable('customer_risk_responses', {
  id: serial('id').primaryKey(),
  risk_profile_id: integer('risk_profile_id').references(() => customerRiskProfiles.id).notNull(),
  question_id: integer('question_id').references(() => questions.id).notNull(),
  answer_option_id: integer('answer_option_id').references(() => answerOptions.id).notNull(),
  raw_score: numeric('raw_score'),
  normalized_score: numeric('normalized_score'),
  ...auditFields,
});

// 4.11 Investment Proposal
export const investmentProposals = pgTable('investment_proposals', {
  id: serial('id').primaryKey(),
  proposal_number: text('proposal_number').notNull(),
  customer_id: text('customer_id').references(() => clients.client_id).notNull(),
  risk_profile_id: integer('risk_profile_id').references(() => customerRiskProfiles.id).notNull(),
  title: text('title').notNull(),
  investment_objective: investmentObjectiveEnum('investment_objective').notNull(),
  time_horizon_years: integer('time_horizon_years').notNull(),
  proposed_amount: numeric('proposed_amount').notNull(),
  currency: text('currency').default('INR').notNull(),
  proposal_status: proposalStatusEnum('proposal_status').default('DRAFT').notNull(),
  suitability_check_passed: boolean('suitability_check_passed'),
  suitability_check_details: jsonb('suitability_check_details'),
  expected_return_pct: numeric('expected_return_pct'),
  expected_std_dev_pct: numeric('expected_std_dev_pct'),
  sharpe_ratio: numeric('sharpe_ratio'),
  max_drawdown_pct: numeric('max_drawdown_pct'),
  proposal_pdf_url: text('proposal_pdf_url'),
  client_accepted_at: timestamp('client_accepted_at', { withTimezone: true }),
  client_rejected_at: timestamp('client_rejected_at', { withTimezone: true }),
  client_rejection_reason: text('client_rejection_reason'),
  expires_at: timestamp('expires_at', { withTimezone: true }),
  rm_id: integer('rm_id').references(() => users.id).notNull(),
  entity_id: text('entity_id').default('default').notNull(),
  ...auditFields,
});

// 4.12 Proposal Line Item
export const proposalLineItems = pgTable('proposal_line_items', {
  id: serial('id').primaryKey(),
  proposal_id: integer('proposal_id').references(() => investmentProposals.id).notNull(),
  asset_class: text('asset_class').notNull(),
  product_id: text('product_id'),
  product_name: text('product_name'),
  product_risk_code: integer('product_risk_code'),
  allocation_percentage: numeric('allocation_percentage').notNull(),
  allocation_amount: numeric('allocation_amount').notNull(),
  expected_return_pct: numeric('expected_return_pct'),
  risk_deviation_flagged: boolean('risk_deviation_flagged').default(false),
  deviation_acknowledged: boolean('deviation_acknowledged').default(false),
  ...auditFields,
});

// 4.13 Proposal Approval
export const proposalApprovals = pgTable('proposal_approvals', {
  id: serial('id').primaryKey(),
  proposal_id: integer('proposal_id').references(() => investmentProposals.id).notNull(),
  approval_level: approvalLevelEnum('approval_level').notNull(),
  action: approvalActionEnum('action').notNull(),
  acted_by: integer('acted_by').references(() => users.id).notNull(),
  comments: text('comments'),
  acted_at: timestamp('acted_at', { withTimezone: true }).defaultNow().notNull(),
  ...auditFields,
});

// 4.14 Risk Profiling Model Portfolio
export const rpModelPortfolios = pgTable('rp_model_portfolios', {
  id: serial('id').primaryKey(),
  portfolio_name: text('portfolio_name').notNull(),
  risk_category: text('risk_category').notNull(),
  entity_id: text('entity_id').default('default').notNull(),
  benchmark_index: text('benchmark_index'),
  rebalance_frequency: rebalanceFrequencyEnum('rebalance_frequency').default('QUARTERLY').notNull(),
  drift_threshold_pct: numeric('drift_threshold_pct').default('5.00').notNull(),
  is_active: boolean('is_active').default(true).notNull(),
  authorization_status: questionnaireStatusEnum('rpm_authorization_status').default('UNAUTHORIZED').notNull(),
  ...auditFields,
});

// 4.15 Product Risk Deviation
export const productRiskDeviations = pgTable('product_risk_deviations', {
  id: serial('id').primaryKey(),
  customer_id: text('customer_id').references(() => clients.client_id).notNull(),
  risk_profile_id: integer('risk_profile_id').references(() => customerRiskProfiles.id).notNull(),
  product_id: text('product_id').notNull(),
  customer_risk_code: integer('customer_risk_code').notNull(),
  product_risk_code: integer('product_risk_code').notNull(),
  deviation_acknowledged: boolean('deviation_acknowledged').default(false).notNull(),
  acknowledged_at: timestamp('acknowledged_at', { withTimezone: true }),
  context: deviationContextEnum('context').notNull(),
  order_id: text('order_id'),
  ...auditFields,
});

// 4.17 Compliance Escalation
export const complianceEscalations = pgTable('compliance_escalations', {
  id: serial('id').primaryKey(),
  customer_id: text('customer_id').references(() => clients.client_id).notNull(),
  escalation_type: escalationTypeEnum('escalation_type').default('REPEAT_DEVIATION').notNull(),
  deviation_count: integer('deviation_count').notNull(),
  window_start_date: date('window_start_date').notNull(),
  window_end_date: date('window_end_date').notNull(),
  deviation_ids: jsonb('deviation_ids').notNull(),
  escalation_status: escalationStatusEnum('escalation_status').default('OPEN').notNull(),
  assigned_to: integer('assigned_to').references(() => users.id),
  resolution_action: resolutionActionEnum('resolution_action'),
  resolution_notes: text('resolution_notes'),
  resolved_at: timestamp('resolved_at', { withTimezone: true }),
  ...auditFields,
});

// 4.18 Risk Profiling Audit Log
export const riskProfilingAuditLogs = pgTable('risk_profiling_audit_logs', {
  id: serial('id').primaryKey(),
  session_id: text('session_id').notNull(),
  customer_id: text('customer_id').references(() => clients.client_id).notNull(),
  initiated_by: integer('initiated_by').references(() => users.id).notNull(),
  initiated_at: timestamp('initiated_at', { withTimezone: true }).defaultNow().notNull(),
  completed_at: timestamp('completed_at', { withTimezone: true }),
  duration_seconds: integer('duration_seconds'),
  outcome: auditOutcomeEnum('outcome'),
  risk_profile_id: integer('risk_profile_id').references(() => customerRiskProfiles.id),
  device_type: text('device_type'),
  user_agent: text('user_agent'),
  ip_address: text('ip_address'),
  entity_id: text('entity_id').default('default').notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// --- Risk Profiling Relations ---

export const questionnairesRelations = relations(questionnaires, ({ one, many }) => ({
  maker: one(users, { fields: [questionnaires.maker_id], references: [users.id], relationName: 'questionnaireMaker' }),
  checker: one(users, { fields: [questionnaires.checker_id], references: [users.id], relationName: 'questionnaireChecker' }),
  questions: many(questions),
  customerRiskProfiles: many(customerRiskProfiles),
}));

export const questionsRelations = relations(questions, ({ one, many }) => ({
  questionnaire: one(questionnaires, { fields: [questions.questionnaire_id], references: [questionnaires.id] }),
  answerOptions: many(answerOptions),
  scoreNormalizationRanges: many(scoreNormalizationRanges),
  customerRiskResponses: many(customerRiskResponses),
}));

export const answerOptionsRelations = relations(answerOptions, ({ one }) => ({
  question: one(questions, { fields: [answerOptions.question_id], references: [questions.id] }),
}));

export const scoreNormalizationRangesRelations = relations(scoreNormalizationRanges, ({ one }) => ({
  question: one(questions, { fields: [scoreNormalizationRanges.question_id], references: [questions.id] }),
}));

export const riskAppetiteMappingsRelations = relations(riskAppetiteMappings, ({ many }) => ({
  bands: many(riskAppetiteBands),
}));

export const riskAppetiteBandsRelations = relations(riskAppetiteBands, ({ one }) => ({
  mapping: one(riskAppetiteMappings, { fields: [riskAppetiteBands.mapping_id], references: [riskAppetiteMappings.id] }),
}));

export const assetAllocationConfigsRelations = relations(assetAllocationConfigs, ({ many }) => ({
  lines: many(assetAllocationLines),
}));

export const assetAllocationLinesRelations = relations(assetAllocationLines, ({ one }) => ({
  config: one(assetAllocationConfigs, { fields: [assetAllocationLines.config_id], references: [assetAllocationConfigs.id] }),
}));

export const customerRiskProfilesRelations = relations(customerRiskProfiles, ({ one, many }) => ({
  customer: one(clients, { fields: [customerRiskProfiles.customer_id], references: [clients.client_id] }),
  questionnaire: one(questionnaires, { fields: [customerRiskProfiles.questionnaire_id], references: [questionnaires.id] }),
  assessedByUser: one(users, { fields: [customerRiskProfiles.assessed_by], references: [users.id], relationName: 'riskProfileAssessor' }),
  supervisor: one(users, { fields: [customerRiskProfiles.supervisor_id], references: [users.id], relationName: 'riskProfileSupervisor' }),
  responses: many(customerRiskResponses),
  proposals: many(investmentProposals),
  deviations: many(productRiskDeviations),
  auditLogs: many(riskProfilingAuditLogs),
}));

export const customerRiskResponsesRelations = relations(customerRiskResponses, ({ one }) => ({
  riskProfile: one(customerRiskProfiles, { fields: [customerRiskResponses.risk_profile_id], references: [customerRiskProfiles.id] }),
  question: one(questions, { fields: [customerRiskResponses.question_id], references: [questions.id] }),
  answerOption: one(answerOptions, { fields: [customerRiskResponses.answer_option_id], references: [answerOptions.id] }),
}));

export const investmentProposalsRelations = relations(investmentProposals, ({ one, many }) => ({
  customer: one(clients, { fields: [investmentProposals.customer_id], references: [clients.client_id] }),
  riskProfile: one(customerRiskProfiles, { fields: [investmentProposals.risk_profile_id], references: [customerRiskProfiles.id] }),
  rm: one(users, { fields: [investmentProposals.rm_id], references: [users.id] }),
  lineItems: many(proposalLineItems),
  approvals: many(proposalApprovals),
}));

export const proposalLineItemsRelations = relations(proposalLineItems, ({ one }) => ({
  proposal: one(investmentProposals, { fields: [proposalLineItems.proposal_id], references: [investmentProposals.id] }),
}));

export const proposalApprovalsRelations = relations(proposalApprovals, ({ one }) => ({
  proposal: one(investmentProposals, { fields: [proposalApprovals.proposal_id], references: [investmentProposals.id] }),
  actor: one(users, { fields: [proposalApprovals.acted_by], references: [users.id] }),
}));

export const productRiskDeviationsRelations = relations(productRiskDeviations, ({ one }) => ({
  customer: one(clients, { fields: [productRiskDeviations.customer_id], references: [clients.client_id] }),
  riskProfile: one(customerRiskProfiles, { fields: [productRiskDeviations.risk_profile_id], references: [customerRiskProfiles.id] }),
}));

export const complianceEscalationsRelations = relations(complianceEscalations, ({ one }) => ({
  customer: one(clients, { fields: [complianceEscalations.customer_id], references: [clients.client_id] }),
  assignedUser: one(users, { fields: [complianceEscalations.assigned_to], references: [users.id] }),
}));

export const riskProfilingAuditLogsRelations = relations(riskProfilingAuditLogs, ({ one }) => ({
  customer: one(clients, { fields: [riskProfilingAuditLogs.customer_id], references: [clients.client_id] }),
  initiator: one(users, { fields: [riskProfilingAuditLogs.initiated_by], references: [users.id] }),
  riskProfile: one(customerRiskProfiles, { fields: [riskProfilingAuditLogs.risk_profile_id], references: [customerRiskProfiles.id] }),
}));

// ============================================================================
// Handover & Assignment Management (HAM)
// ============================================================================

// --- HAM Enums ---

export const handoverStatusEnum = pgEnum('handover_status', [
  'draft',
  'pending_auth',
  'authorized',
  'rejected',
  'cancelled',
  'bulk_pending_review',
  'reversed',
  'pending_reversal',
]);

export const handoverEntityTypeEnum = pgEnum('handover_entity_type', [
  'lead',
  'prospect',
  'client',
]);

export const scrutinyItemStatusEnum = pgEnum('scrutiny_item_status', [
  'pending',
  'completed',
  'not_applicable',
  'work_in_progress',
]);

export const complianceGateTypeEnum = pgEnum('compliance_gate_type', [
  'kyc_pending',
  'sanctions_alert',
  'open_complaint',
  'conflict_of_interest',
  'pending_settlement',
]);

export const complianceGateResultEnum = pgEnum('compliance_gate_result', [
  'passed',
  'blocked',
  'warning',
]);

export const handoverAuditEventTypeEnum = pgEnum('handover_audit_event_type', [
  'handover_created',
  'handover_submitted',
  'handover_authorized',
  'handover_rejected',
  'handover_cancelled',
  'handover_reversed',
  'handover_amended',
  'reversal_approved',
  'compliance_check',
  'compliance_override',
  'scrutiny_updated',
  'client_notified',
  'bulk_upload',
  'bulk_upload_preview',
  'bulk_reviewed',
  'batch_authorize',
  'batch_reject',
  'delegation_created',
  'delegation_cancelled',
  'delegation_expired',
  'delegation_early_terminated',
  'delegation_extension_requested',
  'delegation_extended',
]);

export const handoverAuditRefTypeEnum = pgEnum('handover_audit_ref_type', [
  'handover',
  'delegation',
  'bulk_upload',
]);

export const scrutinyAppliesToEnum = pgEnum('scrutiny_applies_to', [
  'handover_only',
  'delegation_only',
  'both',
]);

export const delegationStatusEnum = pgEnum('delegation_status', [
  'active',
  'expired',
  'cancelled',
  'early_terminated',
]);

export const bulkUploadStatusEnum = pgEnum('bulk_upload_status', [
  'processing',
  'completed',
  'failed',
]);

export const handoverNotificationTypeEnum = pgEnum('handover_notification_type', [
  'handover_initiated',
  'handover_authorized',
  'handover_rejected',
  'delegation_started',
  'delegation_expiring',
  'delegation_expired',
  'delegation_early_terminated',
  'delegation_extension_requested',
  'delegation_extension_approved',
  'bulk_upload_supervisor_alert',
  'bulk_upload_completed',
  'batch_auth_complete',
]);

// --- HAM Tables ---

export const handovers = pgTable('handovers', {
  id: serial('id').primaryKey(),
  handover_number: text('handover_number').notNull(),
  entity_type: handoverEntityTypeEnum('entity_type').notNull(),
  outgoing_rm_id: integer('outgoing_rm_id').notNull().references(() => users.id),
  incoming_rm_id: integer('incoming_rm_id').notNull().references(() => users.id),
  incoming_srm_id: integer('incoming_srm_id').references(() => users.id),
  incoming_referring_rm_id: integer('incoming_referring_rm_id').references(() => users.id),
  incoming_branch_rm_id: integer('incoming_branch_rm_id').references(() => users.id),
  reason: text('reason').notNull(),
  branch_code: text('branch_code'),
  outgoing_rm_name: text('outgoing_rm_name'),
  incoming_rm_name: text('incoming_rm_name'),
  incoming_srm_name: text('incoming_srm_name'),
  ...auditFields,
  status: handoverStatusEnum('status').notNull().default('draft'),
  rejection_reason: text('rejection_reason'),
  sla_deadline: timestamp('sla_deadline', { withTimezone: true }),
  authorized_at: timestamp('authorized_at', { withTimezone: true }),
  authorized_by: integer('authorized_by').references(() => users.id),
  is_bulk_upload: boolean('is_bulk_upload').default(false),
  requires_client_consent: boolean('requires_client_consent').default(false),
  client_notified_at: timestamp('client_notified_at', { withTimezone: true }),
  reversed_at: timestamp('reversed_at', { withTimezone: true }),
  reversed_by: integer('reversed_by').references(() => users.id),
  reversal_reason: text('reversal_reason'),
  reversal_approved_by: integer('reversal_approved_by').references(() => users.id),
  is_deleted: boolean('is_deleted').default(false),
});

export const handoverItems = pgTable(
  'handover_items',
  {
    id: serial('id').primaryKey(),
    handover_id: integer('handover_id').notNull().references(() => handovers.id),
    entity_id: text('entity_id').notNull(),
    entity_name_en: text('entity_name_en').notNull(),
    entity_name_local: text('entity_name_local'),
    previous_rm_id: integer('previous_rm_id').notNull().references(() => users.id),
    aum_at_handover: numeric('aum_at_handover'),
    product_count: integer('product_count'),
    open_orders_count: integer('open_orders_count'),
    pending_settlements_count: integer('pending_settlements_count'),
    last_interaction_date: date('last_interaction_date'),
    tenure_years: numeric('tenure_years'),
    ...auditFields,
    status: text('status').notNull().default('included'),
    failure_reason: text('failure_reason'),
    has_trades_post_handover: boolean('has_trades_post_handover').default(false),
  },
  (table) => [
    index('idx_handover_items_handover_id').on(table.handover_id),
    uniqueIndex('idx_handover_items_entity_active')
      .on(table.entity_id)
      .where(sql`status IN ('included', 'transferred')`),
  ],
);

export const scrutinyTemplates = pgTable('scrutiny_templates', {
  id: serial('id').primaryKey(),
  label: text('label').notNull().unique(),
  description: text('description'),
  category: text('category'),
  sort_order: integer('sort_order').notNull().default(0),
  is_mandatory: boolean('is_mandatory').notNull().default(true),
  applies_to: scrutinyAppliesToEnum('applies_to').notNull().default('handover_only'),
  is_active: boolean('is_active').notNull().default(true),
  ...auditFields,
});

export const scrutinyChecklistItems = pgTable('scrutiny_checklist_items', {
  id: serial('id').primaryKey(),
  handover_id: integer('handover_id').notNull().references(() => handovers.id),
  template_item_id: integer('template_item_id').notNull().references(() => scrutinyTemplates.id),
  validation_label: text('validation_label').notNull(),
  remarks: text('remarks'),
  completed_by: integer('completed_by').references(() => users.id),
  completed_at: timestamp('completed_at', { withTimezone: true }),
  ...auditFields,
  status: scrutinyItemStatusEnum('status').notNull().default('pending'),
});

export const complianceGates = pgTable('compliance_gates', {
  id: serial('id').primaryKey(),
  handover_id: integer('handover_id').notNull().references(() => handovers.id),
  handover_item_id: integer('handover_item_id').notNull().references(() => handoverItems.id),
  gate_type: complianceGateTypeEnum('gate_type').notNull(),
  result: complianceGateResultEnum('result').notNull(),
  details: text('details'),
  override_by: integer('override_by').references(() => users.id),
  override_reason: text('override_reason'),
  checked_at: timestamp('checked_at', { withTimezone: true }).defaultNow().notNull(),
  ...auditFields,
});

export const handoverAuditLog = pgTable(
  'handover_audit_log',
  {
    id: serial('id').primaryKey(),
    event_type: handoverAuditEventTypeEnum('event_type').notNull(),
    reference_type: handoverAuditRefTypeEnum('reference_type').notNull(),
    reference_id: integer('reference_id').notNull(),
    actor_id: integer('actor_id').notNull().references(() => users.id),
    actor_role: text('actor_role').notNull(),
    details: jsonb('details'),
    ip_address: text('ip_address'),
    user_agent: text('user_agent'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_handover_audit_reference_id').on(table.reference_id),
    index('idx_handover_audit_event_type').on(table.event_type),
    index('idx_handover_audit_created_at').on(table.created_at),
  ],
);

export const slaConfigurations = pgTable('sla_configurations', {
  id: serial('id').primaryKey(),
  entity_type: handoverEntityTypeEnum('entity_type').notNull().unique(),
  warning_hours: integer('warning_hours').notNull().default(24),
  deadline_hours: integer('deadline_hours').notNull().default(48),
  escalation_hours: integer('escalation_hours').notNull().default(72),
  is_active: boolean('is_active').notNull().default(true),
  ...auditFields,
});

// --- HAM Relations ---

export const handoversRelations = relations(handovers, ({ one, many }) => ({
  outgoingRm: one(users, { fields: [handovers.outgoing_rm_id], references: [users.id], relationName: 'handover_outgoing_rm' }),
  incomingRm: one(users, { fields: [handovers.incoming_rm_id], references: [users.id], relationName: 'handover_incoming_rm' }),
  incomingSrm: one(users, { fields: [handovers.incoming_srm_id], references: [users.id], relationName: 'handover_incoming_srm' }),
  incomingReferringRm: one(users, { fields: [handovers.incoming_referring_rm_id], references: [users.id], relationName: 'handover_incoming_referring_rm' }),
  incomingBranchRm: one(users, { fields: [handovers.incoming_branch_rm_id], references: [users.id], relationName: 'handover_incoming_branch_rm' }),
  authorizedByUser: one(users, { fields: [handovers.authorized_by], references: [users.id], relationName: 'handover_authorized_by' }),
  reversedByUser: one(users, { fields: [handovers.reversed_by], references: [users.id], relationName: 'handover_reversed_by' }),
  reversalApprovedByUser: one(users, { fields: [handovers.reversal_approved_by], references: [users.id], relationName: 'handover_reversal_approved_by' }),
  items: many(handoverItems),
  scrutinyChecklistItems: many(scrutinyChecklistItems),
  complianceGates: many(complianceGates),
}));

export const handoverItemsRelations = relations(handoverItems, ({ one, many }) => ({
  handover: one(handovers, { fields: [handoverItems.handover_id], references: [handovers.id] }),
  previousRm: one(users, { fields: [handoverItems.previous_rm_id], references: [users.id], relationName: 'handover_item_previous_rm' }),
  complianceGates: many(complianceGates),
}));

export const scrutinyTemplatesRelations = relations(scrutinyTemplates, ({ many }) => ({
  checklistItems: many(scrutinyChecklistItems),
}));

export const scrutinyChecklistItemsRelations = relations(scrutinyChecklistItems, ({ one }) => ({
  handover: one(handovers, { fields: [scrutinyChecklistItems.handover_id], references: [handovers.id] }),
  templateItem: one(scrutinyTemplates, { fields: [scrutinyChecklistItems.template_item_id], references: [scrutinyTemplates.id] }),
  completedByUser: one(users, { fields: [scrutinyChecklistItems.completed_by], references: [users.id] }),
}));

export const complianceGatesRelations = relations(complianceGates, ({ one }) => ({
  handover: one(handovers, { fields: [complianceGates.handover_id], references: [handovers.id] }),
  handoverItem: one(handoverItems, { fields: [complianceGates.handover_item_id], references: [handoverItems.id] }),
  overrideByUser: one(users, { fields: [complianceGates.override_by], references: [users.id] }),
}));

export const handoverAuditLogRelations = relations(handoverAuditLog, ({ one }) => ({
  actor: one(users, { fields: [handoverAuditLog.actor_id], references: [users.id] }),
}));

export const slaConfigurationsRelations = relations(slaConfigurations, ({ }) => ({
  // entity_type is an enum value, not a FK — no direct relation needed
}));

// --- HAM: Delegation Tables ---

export const delegationRequests = pgTable('delegation_requests', {
  id: serial('id').primaryKey(),
  outgoing_rm_id: integer('outgoing_rm_id').notNull().references(() => users.id),
  outgoing_rm_name: text('outgoing_rm_name'),
  delegate_rm_id: integer('delegate_rm_id').notNull().references(() => users.id),
  delegate_rm_name: text('delegate_rm_name'),
  delegate_srm_id: integer('delegate_srm_id').references(() => users.id),
  branch_code: text('branch_code'),
  delegation_reason: text('delegation_reason').notNull(),
  start_date: date('start_date').notNull(),
  end_date: date('end_date').notNull(),
  auto_revert_completed: boolean('auto_revert_completed').notNull().default(false),
  extended_from_id: integer('extended_from_id'),
  extension_count: integer('extension_count').notNull().default(0),
  early_termination_reason: text('early_termination_reason'),
  ...auditFields,
  delegation_type: handoverEntityTypeEnum('delegation_type').notNull(),
  status: delegationStatusEnum('status').notNull().default('active'),
}, (table) => [
  index('idx_delegation_requests_status').on(table.status),
  index('idx_delegation_requests_outgoing_rm').on(table.outgoing_rm_id),
  index('idx_delegation_requests_end_date').on(table.end_date),
]);

export const delegationItems = pgTable('delegation_items', {
  id: serial('id').primaryKey(),
  delegation_request_id: integer('delegation_request_id').notNull().references(() => delegationRequests.id),
  entity_type: handoverEntityTypeEnum('entity_type').notNull(),
  entity_id: text('entity_id').notNull(),
  entity_name: text('entity_name').notNull(),
  branch_code: text('branch_code'),
  original_rm_id: integer('original_rm_id').notNull().references(() => users.id),
  ...auditFields,
}, (table) => [
  index('idx_delegation_items_request_id').on(table.delegation_request_id),
]);

export const bulkUploadLogs = pgTable('bulk_upload_logs', {
  id: serial('id').primaryKey(),
  upload_type: text('upload_type').notNull().default('client_handover'),
  file_name: text('file_name').notNull(),
  file_size_bytes: integer('file_size_bytes').notNull(),
  total_rows: integer('total_rows').notNull(),
  success_count: integer('success_count').notNull().default(0),
  error_count: integer('error_count').notNull().default(0),
  error_details: jsonb('error_details'),
  uploaded_by: integer('uploaded_by').notNull().references(() => users.id),
  completed_at: timestamp('completed_at', { withTimezone: true }),
  ...auditFields,
  status: bulkUploadStatusEnum('status').notNull().default('processing'),
});

export const handoverNotifications = pgTable('handover_notifications', {
  id: serial('id').primaryKey(),
  notification_type: handoverNotificationTypeEnum('notification_type').notNull(),
  channel: text('channel').notNull().default('both'),
  recipient_user_id: integer('recipient_user_id').notNull().references(() => users.id),
  recipient_email: text('recipient_email'),
  subject: text('subject').notNull(),
  body: text('body').notNull(),
  reference_type: handoverAuditRefTypeEnum('reference_type').notNull(),
  reference_id: integer('reference_id').notNull(),
  is_read: boolean('is_read').notNull().default(false),
  sent_at: timestamp('sent_at', { withTimezone: true }),
  retry_count: integer('retry_count').notNull().default(0),
  ...auditFields,
}, (table) => [
  index('idx_handover_notifications_recipient').on(table.recipient_user_id),
  index('idx_handover_notifications_reference').on(table.reference_id),
]);

// --- HAM: Delegation Relations ---

export const delegationRequestsRelations = relations(delegationRequests, ({ one, many }) => ({
  outgoingRm: one(users, { fields: [delegationRequests.outgoing_rm_id], references: [users.id], relationName: 'delegation_outgoing_rm' }),
  delegateRm: one(users, { fields: [delegationRequests.delegate_rm_id], references: [users.id], relationName: 'delegation_delegate_rm' }),
  delegateSrm: one(users, { fields: [delegationRequests.delegate_srm_id], references: [users.id], relationName: 'delegation_delegate_srm' }),
  extendedFrom: one(delegationRequests, { fields: [delegationRequests.extended_from_id], references: [delegationRequests.id], relationName: 'delegation_extension' }),
  items: many(delegationItems),
}));

export const delegationItemsRelations = relations(delegationItems, ({ one }) => ({
  delegationRequest: one(delegationRequests, { fields: [delegationItems.delegation_request_id], references: [delegationRequests.id] }),
  originalRm: one(users, { fields: [delegationItems.original_rm_id], references: [users.id], relationName: 'delegation_item_original_rm' }),
}));

export const handoverNotificationsRelations = relations(handoverNotifications, ({ one }) => ({
  recipient: one(users, { fields: [handoverNotifications.recipient_user_id], references: [users.id], relationName: 'handover_notification_recipient' }),
}));

// ============================================================================
// Service Request / Task Management
// ============================================================================

export const srStatusEnum = pgEnum('sr_status', [
  'NEW',
  'APPROVED',
  'READY_FOR_TELLER',
  'COMPLETED',
  'INCOMPLETE',
  'REJECTED',
  'CLOSED',
]);

export const srPriorityEnum = pgEnum('sr_priority', [
  'LOW',
  'MEDIUM',
  'HIGH',
]);

export const srTypeEnum = pgEnum('sr_type', [
  'REVIEW_PORTFOLIO',
  'MULTIPLE_MANDATE_REGISTRATION',
  'NOMINEE_UPDATION',
  'ACCOUNT_CLOSURE',
  'STATEMENT_REQUEST',
  'ADDRESS_CHANGE',
  'BENEFICIARY_UPDATE',
  'GENERAL_INQUIRY',
]);

export const srHistoryActionEnum = pgEnum('sr_history_action', [
  'CREATED',
  'STATUS_CHANGE',
  'UPDATED',
  'REASSIGNED',
  'CLOSED',
]);

export const serviceRequests = pgTable('service_requests', {
  id: serial('id').primaryKey(),
  request_id: text('request_id').notNull().unique(),
  client_id: text('client_id').notNull(),
  sr_type: srTypeEnum('sr_type').notNull(),
  sr_details: text('sr_details'),
  priority: srPriorityEnum('priority').notNull().default('MEDIUM'),
  sr_status: srStatusEnum('sr_status').notNull().default('NEW'),
  request_date: timestamp('request_date').defaultNow().notNull(),
  closure_date: timestamp('closure_date'),
  actual_closure_date: timestamp('actual_closure_date'),
  appointed_start_date: timestamp('appointed_start_date'),
  appointed_end_date: timestamp('appointed_end_date'),
  remarks: text('remarks'),
  closure_reason: text('closure_reason'),
  documents: jsonb('documents').$type<string[]>().default([]),
  assigned_rm_id: integer('assigned_rm_id').references(() => users.id),
  service_branch: text('service_branch'),
  resolution_unit: text('resolution_unit'),
  sales_date: timestamp('sales_date'),
  teller_id: integer('teller_id').references(() => users.id),
  verification_notes: text('verification_notes'),
  rejection_reason: text('rejection_reason'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
  created_by: text('created_by'),
  updated_by: text('updated_by'),
  is_deleted: boolean('is_deleted').default(false).notNull(),
}, (table) => ({
  requestIdIdx: uniqueIndex('service_requests_request_id_idx').on(table.request_id),
  clientIdIdx: index('service_requests_client_id_idx').on(table.client_id),
  statusIdx: index('service_requests_status_idx').on(table.sr_status),
}));

export const srStatusHistory = pgTable('sr_status_history', {
  id: serial('id').primaryKey(),
  sr_id: integer('sr_id').references(() => serviceRequests.id).notNull(),
  from_status: srStatusEnum('from_status'),
  to_status: srStatusEnum('to_status').notNull(),
  action: srHistoryActionEnum('action').notNull(),
  changed_by: text('changed_by').notNull(),
  changed_at: timestamp('changed_at').defaultNow().notNull(),
  notes: text('notes'),
}, (table) => ({
  srIdIdx: index('sr_status_history_sr_id_idx').on(table.sr_id),
}));

export const serviceRequestsRelations = relations(serviceRequests, ({ one, many }) => ({
  assignedRm: one(users, { fields: [serviceRequests.assigned_rm_id], references: [users.id], relationName: 'sr_assigned_rm' }),
  teller: one(users, { fields: [serviceRequests.teller_id], references: [users.id], relationName: 'sr_teller' }),
  history: many(srStatusHistory),
}));

export const srStatusHistoryRelations = relations(srStatusHistory, ({ one }) => ({
  serviceRequest: one(serviceRequests, { fields: [srStatusHistory.sr_id], references: [serviceRequests.id] }),
}));

// ============================================================================
// Trust Banking Hardening Tables (Phase 1 — 2026-04-26)
// ============================================================================

// ── client_messages ─────────────────────────────────────────────────────────
export const clientMessages = pgTable('client_messages', {
  id: serial('id').primaryKey(),
  thread_id: text('thread_id'),
  sender_id: integer('sender_id').notNull(),
  sender_type: messageSenderTypeEnum('sender_type').notNull(),
  recipient_client_id: text('recipient_client_id').references(() => clients.client_id).notNull(),
  subject: text('subject'),
  body: text('body').notNull(),
  is_read: boolean('is_read').notNull().default(false),
  is_private: boolean('is_private').notNull().default(false),
  parent_message_id: integer('parent_message_id'),
  related_sr_id: integer('related_sr_id').references(() => serviceRequests.id),
  read_at: timestamp('read_at', { withTimezone: true }),
  sent_at: timestamp('sent_at', { withTimezone: true }).defaultNow().notNull(),
  is_deleted: boolean('is_deleted').notNull().default(false),
  deleted_at: timestamp('deleted_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  created_by: text('created_by'),
  updated_by: text('updated_by'),
}, (table) => [
  // Full inbox query index (all messages for a recipient, any read state)
  index('client_messages_recipient_idx').on(table.recipient_client_id),
  // Partial index for fast unread count queries per client
  index('client_messages_unread_idx').on(table.recipient_client_id).where(sql`is_read = false AND is_deleted = false`),
  index('client_messages_thread_idx').on(table.thread_id),
]);

// ── service_request_documents ────────────────────────────────────────────────
export const serviceRequestDocuments = pgTable('service_request_documents', {
  id: serial('id').primaryKey(),
  sr_id: integer('sr_id').references(() => serviceRequests.id).notNull(),
  document_name: text('document_name').notNull(),
  storage_reference: text('storage_reference'),
  file_size_bytes: integer('file_size_bytes'),
  mime_type: text('mime_type'),
  document_class: documentClassEnum('document_class').notNull().default('OTHER'),
  uploaded_by_type: messageSenderTypeEnum('uploaded_by_type').notNull(),
  uploaded_by_id: integer('uploaded_by_id').notNull(),
  uploaded_at: timestamp('uploaded_at', { withTimezone: true }).defaultNow().notNull(),
  scan_status: scanStatusEnum('scan_status').notNull().default('PENDING'),
  scan_completed_at: timestamp('scan_completed_at', { withTimezone: true }),
  scan_error: text('scan_error'),
  retention_days: integer('retention_days').notNull().default(2555),
  expires_at: timestamp('expires_at', { withTimezone: true }),
  is_deleted: boolean('is_deleted').notNull().default(false),
  deleted_at: timestamp('deleted_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  created_by: text('created_by'),
  updated_by: text('updated_by'),
}, (table) => [
  index('sr_documents_sr_id_idx').on(table.sr_id),
  index('sr_documents_scan_status_idx').on(table.scan_status),
]);

// ── feed_health_snapshots ────────────────────────────────────────────────────
export const feedHealthSnapshots = pgTable('feed_health_snapshots', {
  id: serial('id').primaryKey(),
  feed_name: text('feed_name').notNull(),
  health_score: integer('health_score').notNull().default(100),
  status: feedStatusEnum('status').notNull().default('UP'),
  failure_count: integer('failure_count').notNull().default(0),
  last_error: text('last_error'),
  override_by: integer('override_by').references(() => users.id),
  override_reason: text('override_reason'),
  override_expires_at: timestamp('override_expires_at', { withTimezone: true }),
  last_updated: timestamp('last_updated', { withTimezone: true }).defaultNow().notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  created_by: text('created_by'),
  updated_by: text('updated_by'),
}, (table) => [
  index('feed_health_snapshots_feed_name_idx').on(table.feed_name),
  index('feed_health_snapshots_created_at_idx').on(table.created_at),
]);

// ── client_statements ────────────────────────────────────────────────────────
// Replaces the in-memory generated mock in client-portal-service.getStatements()
export const clientStatements = pgTable('client_statements', {
  id: serial('id').primaryKey(),
  client_id: text('client_id').references(() => clients.client_id).notNull(),
  portfolio_id: text('portfolio_id'),
  period: text('period').notNull(), // YYYY-MM format
  statement_type: text('statement_type').notNull().default('MONTHLY'), // MONTHLY | QUARTERLY | ANNUAL | TAX_CERTIFICATE
  file_reference: text('file_reference'),
  file_size_bytes: integer('file_size_bytes'),
  delivery_status: deliveryStatusEnum('delivery_status').notNull().default('PENDING'),
  delivery_error: text('delivery_error'),
  download_count: integer('download_count').notNull().default(0),
  last_downloaded_at: timestamp('last_downloaded_at', { withTimezone: true }),
  generated_at: timestamp('generated_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('client_statements_client_id_idx').on(table.client_id),
  index('client_statements_period_idx').on(table.period),
]);
